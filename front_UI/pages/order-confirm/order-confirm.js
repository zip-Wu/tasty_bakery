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
      // 新订单（从点单页来）：默认全部常温
      const app = getApp();
      const data = app.globalData.tempOrder;
      if (!data) { wx.navigateBack(); return; }
      this.setData({
        order: {
          storeName: data.storeName,
          address: data.address,
          items: (data.items || []).map(item => ({
            ...item,
            coldQty: item.quantity,  // 默认全常温
            hotQty: 0,
          })),
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

  // 温度分派：只开放加热的 +/-，常温自动 = total - hot
  changeTemp(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const delta = parseInt(e.currentTarget.dataset.delta);
    const items = [...this.data.order.items];
    const item = items[idx];
    if (!item) return;

    const hot = item.hotQty || 0;
    const total = item.quantity;
    const newHot = hot + delta;

    if (newHot < 0 || newHot > total) return;
    item.hotQty = newHot;
    item.coldQty = total - newHot;

    this.setData({ 'order.items': items });
  },

  onHotQtyInput(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    let val = parseInt(e.detail.value);
    if (isNaN(val) || val < 0) val = 0;
    const items = [...this.data.order.items];
    const item = items[idx];
    if (!item) return;
    if (val > item.quantity) val = item.quantity;
    item.hotQty = val;
    item.coldQty = item.quantity - val;
    this.setData({ 'order.items': items });
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
      // 新订单：先按温度拆分 items，再创建订单
      const { order, remark } = this.data;
      const splitItems = [];
      for (const item of order.items) {
        const cold = item.coldQty || 0;
        const hot = item.hotQty || 0;
        if (cold > 0) splitItems.push({ ...item, quantity: cold, temperature: '常温' });
        if (hot > 0) splitItems.push({ ...item, quantity: hot, temperature: '加热' });
      }
      // 为拆分后的每个 item 注入唯一 key（同商品不同温度 id 相同）
      splitItems.forEach((item, idx) => {
        item.itemKey = `${item.id}_${item.temperature || 'x'}_${idx}`;
      });
      const userId = app.globalData.userId;
      app.request({
        url: '/api/orders',
        method: 'POST',
        data: {
          userId, items: splitItems, totalPrice: order.totalPrice,
          storeId: (app.globalData.tempOrder || {}).storeId || 1,
          storeName: order.storeName, address: order.address,
          remark
        },
      }).then(created => {
        that.setData({ orderId: created.id, isNewOrder: false });
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
          // 替换当前页，不回退到确认订单页
          wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + orderId });
        },
        fail(err) {
          that.setData({ isPaying: false });
          if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
        }
      });
    }).catch(err => {
      that.setData({ isPaying: false });
      wx.showToast({ title: (err && err.message) || '发起支付失败', icon: 'none' });
    });
  }
});