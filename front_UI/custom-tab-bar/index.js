Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/home", text: "首页", iconText: "🏠" },
      { pagePath: "/pages/index/index", text: "点单", iconText: "📋" },
      { pagePath: "/pages/order-list/order-list", text: "订单", iconText: "📦" },
      { pagePath: "/pages/logs/logs", text: "我的", iconText: "👤" }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = data.index;
      const path = data.path;

      // 点单页需要检测门店
      if (path === '/pages/index/index') {
        const app = getApp();
        if (!app.globalData.selectedStore) {
          wx.navigateTo({ url: '/pages/store-select/store-select' });
          return;
        }
      }

      wx.switchTab({
        url: path
      });

      this.setData({ selected: index });
    }
  }
});
