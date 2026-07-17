Component({
  data: {
    selected: 0
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = data.index;
      const path = data.path;
      // 已在当前 tab，不做任何操作（避免 wx.switchTab 触发组件重建导致 selected 错乱）
      if (this.data.selected === index) return;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});