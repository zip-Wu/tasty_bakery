Page({
  data: {
    orderId: '',
    isNewOrder: true,
    order: {
      storeName: '',
      address: '',
      items: [],
      totalPrice: 0
    },
    remark: '',
    isPaying: false
  },

  onLoad(options) {
    if (options.orderId) {
      // 已有订单（从订单详情页来重新支付）
      this.setData({ orderId: options.orderId, isNewOrder: false });
      this.loadOrder(options.orderId);
    } else {
      // 新订单（从点单页来）
      const app = getApp();
      const data = app.globalData.tempOrder;
      if (!data) { wx.navigateBack(); return; }
      this.setData({
        order: {
          storeName: data.storeName,
          address: data.address,
          items: (data.items || []).map(item => ({ ...item })),
          totalPrice: data.totalPrice
        }
      });
    }
  },

  onShow() {
    // 从其他页面回来时刷新已有订单
    if (this.data.orderId && !this.data.isNewOrder) {
      this.loadOrder(this.data.orderId);
    }
  },

  // 加载已有订单
  loadOrder(orderId) {
    const app = getApp();
    app.request({ url: '/api/orders/' + orderId }).then(data => {
      if (!data.address) data.address = '珠海市高新区唐家湾镇香山路88号2栋1层101-10室';
      this.setData({ order: data, remark: data.remark || '' });
    }).catch(() => { wx.showToast({ title: '加载失败', icon: 'none' }); });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  saveRemark() {
    if (!this.data.orderId) return;
    const app = getApp();
    app.request({
      url: '/api/orders/' + this.data.orderId + '/remark',
      method: 'PUT',
      data: { remark: this.data.remark }
    });
  },

  // 确认支付
  doPay() {
    if (this.data.isPaying) return;
    this.setData({ isPaying: true });

    const app = getApp();
    const that = this;

    if (this.data.isNewOrder) {
      // 创建订单
      const { order, remark } = this.data;
      order.items.forEach((item, idx) => { item.itemKey = `${item.id}_${idx}`; });
      const userId = app.globalData.userId;
      app.request({
        url: '/api/orders',
        method: 'POST',
        data: {
          userId, items: order.items, totalPrice: order.totalPrice,
          storeId: (app.globalData.tempOrder || {}).storeId || 1,
          storeName: order.storeName, address: order.address,
          remark
        },
      }).then(created => {
        that.setData({
          orderId: created.id,
          isNewOrder: false
        });
        that.doPayForOrder(created.id);
      }).catch(() => {
        that.setData({ isPaying: false });
        wx.showToast({ title: '创建订单失败', icon: 'none' });
      });
    } else {
      // 已有订单：直接支付
      this.doPayForOrder(this.data.orderId);
    }
  },

  doPayForOrder(orderId) {
    const app = getApp();
    const that = this;
    app.request({
      url: '/api/pay/' + orderId,
      method: 'POST',
    }).then(data => {
      const { payParams } = data;
      wx.requestPayment({
        timeStamp: payParams.timeStamp, nonceStr: payParams.nonceStr,
        package: payParams.package, signType: payParams.signType, paySign: payParams.paySign,
        success() {
          app.globalData.clearCartOnReturn = true;
          // 跳转通知授权页，引导用户授权取餐提醒后再进订单详情
          wx.redirectTo({ url: '/pages/notify-auth/notify-auth?orderId=' + orderId });
        },
        fail(err) {
          that.setData({ isPaying: false });
          app.globalData.clearCartOnReturn = true;
          if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
          // 取消/失败后回到订单列表，待支付订单从这里找
          setTimeout(() => { wx.switchTab({ url: '/pages/order-list/order-list' }); }, 1200);
        }
      });
    }).catch(err => {
      that.setData({ isPaying: false });
      app.globalData.clearCartOnReturn = true;
      wx.showToast({ title: (err && err.message) || '发起支付失败', icon: 'none' });
      setTimeout(() => { wx.switchTab({ url: '/pages/order-list/order-list' }); }, 1200);
    });
  }
});