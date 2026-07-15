Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/home/home",
        icon: "/images/png/Tab_01_unselected 4.png",
        selectedIcon: "/images/png/Tab_01_selected.png"
      },
      {
        pagePath: "/pages/index/index",
        icon: "/images/png/Tab_01_unselected 3.png",
        selectedIcon: "/images/png/Tab_02_selected.png"
      },
      {
        pagePath: "/pages/order-list/order-list",
        icon: "/images/png/Tab_01_unselected 2.png",
        selectedIcon: "/images/png/Tab_03_selected.png"
      },
      {
        pagePath: "/pages/logs/logs",
        icon: "/images/png/Tab_01_unselected.png",
        selectedIcon: "/images/png/Tab_04_selected.png"
      }
    ]
  },
  lifetimes: {
    attached() {
      // 根据当前页面路径匹配 selected，避免 mount 时闪到首页
      const pages = getCurrentPages();
      if (pages.length > 0) {
        const cur = '/' + pages[pages.length - 1].route;
        const idx = this.data.list.findIndex(item => item.pagePath === cur);
        if (idx >= 0) {
          this.setData({ selected: idx });
        }
      }
    }
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