Component({
  data: {
    selected: 0
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = data.index;
      const path = data.path;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});