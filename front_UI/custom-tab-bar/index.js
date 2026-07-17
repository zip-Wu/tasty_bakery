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
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = data.index;
      const path = data.path;

      // 先更新选中态，再切换页面，避免视觉延迟
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});