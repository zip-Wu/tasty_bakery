Page({
  data: {
    userInfo: {
      avatar: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=default',
      nickname: '加载中...',
      points: 0
    },
    orderCount: {
      pending: 0, preparing: 0, ready: 0, completed: 0, refund: 0
    },
    userId: null
  },

  onLoad() {
    this.initUser();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 3) tabBar.setData({ selected: 3 });
    }

    const app = getApp();
    if (app.globalData.userId) {
      this.loadUserInfo();
      this.loadOrderCount();
    }
  },

  initUser() {
    this.loadUserInfo();
    this.loadOrderCount();
  },

  loadUserInfo() {
    const app = getApp();
    if (!app.globalData.userId) return;
    this.setData({ userId: app.globalData.userId });
    app.request({
      url: '/api/user/' + app.globalData.userId,
    }).then(data => {
      this.setData({ userInfo: data });
    }).catch(err => { console.error('[logs] 加载用户信息失败:', err); });
  },

  loadOrderCount() {
    const app = getApp();
    if (!app.globalData.userId) return;
    app.request({
      url: '/api/orders/user/' + app.globalData.userId,
    }).then(orders => {
      const count = { pending: 0, preparing: 0, ready: 0, completed: 0, refund: 0 };
      orders.forEach(order => {
        // 只统计已知状态（未知状态忽略，避免污染计数对象）
        if (count[order.status] !== undefined) count[order.status]++;
      });
      this.setData({ orderCount: count });
    }).catch(err => { console.error('[logs] 加载订单数失败:', err); });
  },

  goAllOrders() {
    wx.switchTab({ url: '/pages/order-list/order-list' });
  },

  goOrders(e) {
    const status = e.currentTarget.dataset.status;
    const app = getApp();
    app.globalData.orderTab = status;
    wx.switchTab({ url: '/pages/order-list/order-list' });
  },

  goSettings() { wx.showToast({ title: '设置功能开发中', icon: 'none' }); },

  goContact() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-123-4567\n工作时间：09:00 - 21:00',
      showCancel: false, confirmText: '知道了'
    });
  },

  goAbout() {
    wx.showModal({
      title: '关于我们',
      content: '大力馒头铺·信息港店\n\n用心烘焙每一份美味\n\n版本：v1.0.0',
      showCancel: false, confirmText: '知道了'
    });
  }
});
