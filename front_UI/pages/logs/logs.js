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
    cacheSize: '0KB',
    userId: null
  },

  onLoad() {
    this.calcCacheSize();
    this.initUser();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 3) tabBar.setData({ selected: 3 });
    }
    this.calcCacheSize();

    const app = getApp();
    if (app.globalData.userId) {
      this.loadUserInfo();
      this.loadOrderCount();
    }
  },

  initUser() {
    const app = getApp();
    if (!app.globalData.userId) {
      app.login(() => {
        this.loadUserInfo();
        this.loadOrderCount();
      });
    } else {
      this.loadUserInfo();
      this.loadOrderCount();
    }
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

  calcCacheSize() {
    try {
      const res = wx.getStorageInfoSync();
      const size = res.currentSize;
      let display = '0KB';
      if (size < 1024) display = size + 'KB';
      else display = (size / 1024).toFixed(1) + 'MB';
      this.setData({ cacheSize: display });
    } catch (e) {}
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

  // TODO: 以下功能待后续版本实现
  goFavorites() { wx.showToast({ title: '收藏功能开发中', icon: 'none' }); },
  goAddress() { wx.showToast({ title: '地址管理开发中', icon: 'none' }); },
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
      content: '大力馒头·信息港店\n\n用心烘焙每一份美味\n\n版本：v1.0.0',
      showCancel: false, confirmText: '知道了'
    });
  },

  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除本地缓存吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            this.calcCacheSize();
            wx.showToast({ title: '缓存已清除', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
