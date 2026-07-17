Page({
  data: {
    latitude: 22.366749,
    longitude: 113.554455,
    name: '大力馒头',
    address: '',
    markers: []
  },

  onLoad(options) {
    const lat = parseFloat(options.lat);
    const lng = parseFloat(options.lng);
    const name = decodeURIComponent(options.name || '大力馒头');
    const address = decodeURIComponent(options.address || '');

    if (lat && lng) {
      this.setData({
        latitude: lat,
        longitude: lng,
        name: name,
        address: address,
        markers: [{
          id: 1,
          latitude: lat,
          longitude: lng,
          title: name,
          callout: { content: name + '\n' + address, padding: 10, borderRadius: 8, display: 'ALWAYS' },
          width: 32,
          height: 32
        }]
      });
    }
  },

  // 点击导航按钮 → 跳第三方地图
  goNavigate() {
    wx.openLocation({
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      name: this.data.name,
      address: this.data.address,
      scale: 18
    });
  }
});
