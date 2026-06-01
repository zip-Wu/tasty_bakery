Page({
  data: {
    // 用户信息
    userInfo: {
      avatar: 'https://picsum.photos/200/200?random=100',
      nickname: '面包爱好者',
      isMember: false,
      memberLevel: '',
      points: 0,
      couponCount: 0,
      balance: '0.00'
    },

    // 订单数量角标
    orderCount: {
      pending: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      refund: 0
    },

    // 缓存大小
    cacheSize: '0KB',

    // 用户ID
    userId: null
  },

  onLoad() {
    this.calcCacheSize();
    this.initUser();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.calcCacheSize();
    this.loadUserInfo();
    this.loadOrderCount();
  },

  // 初始化用户
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

  // 从后端加载用户信息
  loadUserInfo() {
    const app = getApp();
    if (!app.globalData.userId) return;

    this.setData({ userId: app.globalData.userId });

    wx.request({
      url: app.globalData.apiBase + '/api/user/' + app.globalData.userId,
      success: (res) => {
        if (res.data.success) {
          this.setData({ userInfo: res.data.data });
        }
      }
    });
  },

  // 加载订单数量
  loadOrderCount() {
    const app = getApp();
    if (!app.globalData.userId) return;

    wx.request({
      url: app.globalData.apiBase + '/api/orders/user/' + app.globalData.userId,
      success: (res) => {
        if (res.data.success) {
          const orders = res.data.data;
          const count = {
            pending: 0,
            preparing: 0,
            ready: 0,
            completed: 0,
            refund: 0
          };
          orders.forEach(order => {
            if (count[order.status] !== undefined) {
              count[order.status]++;
            }
          });
          this.setData({ orderCount: count });
        }
      }
    });
  },

  // 计算缓存大小
  calcCacheSize() {
    try {
      const res = wx.getStorageInfoSync();
      const size = res.currentSize;
      let display = '0KB';
      if (size < 1024) {
        display = size + 'KB';
      } else {
        display = (size / 1024).toFixed(1) + 'MB';
      }
      this.setData({ cacheSize: display });
    } catch (e) {
      console.log('获取缓存信息失败', e);
    }
  },

  // ===== 订单相关 =====

  goAllOrders() {
    wx.navigateTo({ url: '/pages/order-list/order-list' });
  },

  goOrders(e) {
    const status = e.currentTarget.dataset.status;
    wx.navigateTo({ url: '/pages/order-list/order-list?tab=' + status });
  },

  // ===== 资产相关 =====

  goMemberCenter() {
    wx.showToast({ title: '会员中心开发中', icon: 'none' });
  },

  goCoupons() {
    wx.showToast({ title: '优惠券功能开发中', icon: 'none' });
  },

  goBalance() {
    wx.showToast({ title: '余额功能开发中', icon: 'none' });
  },

  // ===== 工具相关 =====

  goFavorites() {
    wx.showToast({ title: '收藏功能开发中', icon: 'none' });
  },

  goAddress() {
    wx.showToast({ title: '地址管理开发中', icon: 'none' });
  },

  goContact() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-123-4567\n工作时间：09:00 - 21:00',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  goAbout() {
    wx.showModal({
      title: '关于我们',
      content: '格创·壹号店\n\n用心烘焙每一份美味\n\n版本：v1.0.0',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // ===== 设置相关 =====

  goSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' });
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