Page({
  data: {
    orderId: '',
    order: {
      storeName: '',
      address: '',
      items: [],
      totalPrice: 0,
      pickupTimeDisplay: ''
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
        order.address = '广东省珠海市香洲区唐家湾镇香山路639号';
      }
      // 格式化取餐时间
      const pickupTime = new Date(order.pickupTime);
      const hours = pickupTime.getHours().toString().padStart(2, '0');
      const minutes = pickupTime.getMinutes().toString().padStart(2, '0');
      order.pickupTimeDisplay = `预计 ${hours}:${minutes} 可取`;

      console.log('设置订单数据:', order);
      this.setData({ order });
    }).catch((err) => {
      console.error('loadOrder请求失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 执行支付
  doPay() {
    if (this.data.isPaying) return;

    this.setData({ isPaying: true });

    const app = getApp();
    app.request({
      url: '/api/pay/' + this.data.orderId,
      method: 'POST',
    }).then(data => {
      wx.showModal({
        title: '支付成功',
        content: '订单已创建，商家正在准备中',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/logs/logs' });
        }
      });
    }).catch(() => {
      this.setData({ isPaying: false });
      wx.showToast({ title: '支付失败', icon: 'none' });
    });
  }
});