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
    // 下单时的临时数据（预留扩展位）
    tempOrderData: null
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
      this.loadOrder(options.orderId);
    }
  },

  // 加载订单详情
  loadOrder(orderId) {
    const app = getApp();
    
    app.request({
      url: '/api/orders/' + orderId,
    }).then(data => {
      const order = data;
      // 确保地址有值（兜底默认门店地址）
      if (!order.address) {
        order.address = '珠海市高新区唐家湾镇香山路88号2栋1层101-10室';
      }
      this.setData({ order });
    }).catch((err) => {
      console.error('[loadOrder] 请求失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 支付流程：智能降级设计
  //
  // 检测后端返回的 mock 标记：
  // - mock=true → 商户号未开通，后端已直接完成订单（模拟支付）
  //   前端跳过 wx.requestPayment，直接提示成功
  // - mock=false → 商户号已开通，后端返回 prepay_id + 签名参数
  //   前端调用 wx.requestPayment 调起微信支付界面
  //
  // 设计意图：一套代码同时支持开发测试和正式上线，无需切换分支或改配置
  // 商户资质就绪后只需添加 6 个环境变量，自动切换为真支付
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