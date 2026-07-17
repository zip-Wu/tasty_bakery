Component({
  data: {
    selected: -1
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = data.index;
      const path = data.path;
      // 通过当前页面路由判断是否已在目标页（比 this.data.selected 更可靠）
      const pages = getCurrentPages();
      const cur = pages.length > 0 ? '/' + pages[pages.length - 1].route : '';
      if (cur === path) return;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});