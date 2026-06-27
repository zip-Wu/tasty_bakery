Page({
  data: {
    orderId: '',
    order: {
      storeName: '',
      address: '',
      items: [],
      totalPrice: 0
    },
    isPaying: false,
    // 用于下单时的临时数据
    tempOrderData: null
  },

  onLoad(options) {
    console.log('order-confirm onLoad, options:', options);
    
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
      console.log('开始加载订单:', options.orderId);
      this.loadOrder(options.orderId);
    } else {
      console.error('没有orderId参数');
    }
  },

  // 加载订单详情
  loadOrder(orderId) {
    const app = getApp();
    console.log('loadOrder, url:', '/api/orders/' + orderId);
    
    app.request({
      url: '/api/orders/' + orderId,
    }).then(data => {
      console.log('loadOrder返回:', data);
      
      const order = data;
      // 确保地址有值
      if (!order.address) {
        order.address = '珠海市高新区唐家湾镇香山路88号2栋1层101-10室';
      }
      console.log('设置订单数据:', order);
      this.setData({ order });
    }).catch((err) => {
      console.error('loadOrder请求失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 执行支付 — 智能降级：真支付或模拟
  doPay() {
    if (this.data.isPaying) return;

    this.setData({ isPaying: true });
    const app = getApp();
    const that = this;

    app.request({
      url: '/api/pay/' + this.data.orderId,
      method: 'POST',
    }).then(data => {
      // 模拟支付：后端已直接完成，无需调 wx.requestPayment
      if (data.mock) {
        wx.showModal({
          title: '支付成功（测试）',
          content: '商户号未开通，当前为模拟支付。正式开业后将自动切换为真实支付。',
          showCancel: false,
          success() {
            wx.switchTab({ url: '/pages/logs/logs' });
          }
        });
        return;
      }

      // 真实支付：调起微信支付
      const { payParams } = data;
      wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign,
        success() {
          wx.showModal({
            title: '支付成功',
            content: '订单已创建，商家正在准备中',
            showCancel: false,
            success() {
              wx.switchTab({ url: '/pages/logs/logs' });
            }
          });
        },
        fail(err) {
          if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
            that.setData({ isPaying: false });
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            that.setData({ isPaying: false });
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
        }
      });
    }).catch(err => {
      that.setData({ isPaying: false });
      console.error('支付失败:', err);
      wx.showToast({ title: (err && err.message) || '发起支付失败', icon: 'none' });
    });
  }
});