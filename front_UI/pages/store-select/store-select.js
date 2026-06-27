Page({
  data: {
    selectedStoreId: null,
    stores: [],
    markers: [],
    loading: true
  },

  onLoad() {
    this.loadStores();
  },

  // 获取用户位置 → 请求门店列表（含真实距离）
  loadStores() {
    const app = getApp();
    const that = this;

    wx.getLocation({
      type: 'gcj02',
      success(loc) {
        app.request({
          url: `/api/stores?lat=${loc.latitude}&lng=${loc.longitude}`,
        }).then(stores => {
          that.setData({
            stores,
            markers: buildMarkers(stores),
            loading: false,
            selectedStoreId: stores.length > 0 ? stores[0].id : null
          });
        }).catch(() => {
          that.setData({ loading: false });
          wx.showToast({ title: '加载门店失败', icon: 'none' });
        });
      },
      fail() {
        // 用户拒绝定位 → 用降级数据（不传坐标），但地图标记点仍要显示
        app.request({ url: '/api/stores' }).then(stores => {
          that.setData({
            stores,
            markers: buildMarkers(stores),
            loading: false,
            selectedStoreId: stores.length > 0 ? stores[0].id : null
          });
        }).catch(() => {
          that.setData({ loading: false });
        });
      }
    });
  },

  selectStore(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedStoreId: id });
  },

  confirmStore() {
    const store = this.data.stores.find(s => s.id === this.data.selectedStoreId);
    if (!store) {
      wx.showToast({ title: '请选择门店', icon: 'none' });
      return;
    }
    const app = getApp();
    app.globalData.selectedStore = store;
    wx.switchTab({ url: '/pages/index/index' });
  }
});

// 根据门店数据生成地图标记点（无论用户是否授权定位都要显示）
function buildMarkers(stores) {
  return stores.map(s => ({
    id: s.id,
    latitude: s.latitude,
    longitude: s.longitude,
    title: s.name,
    iconPath: '',
    width: 30,
    height: 30,
    callout: {
      content: s.name,
      color: '#333',
      fontSize: 13,
      borderRadius: 8,
      bgColor: '#fff',
      padding: 8,
      display: 'ALWAYS'
    }
  }));
}
