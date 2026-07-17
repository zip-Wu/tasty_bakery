Page({
  data: {
    selectedStoreId: null,
    stores: [],
    markers: [],
    loading: true,
    navLoading: false
  },

  onLoad() {
    this.loadStores();
  },

  onShow() {
    this.setData({ navLoading: false });
  },

  // 获取用户位置 → 请求门店列表（含真实距离）
  // 流程：1) 尝试获取定位 → 2) 带坐标请求后端（计算距离）→ 3) 渲染列表和地图标记
  //       定位失败 → 不带坐标请求（跳过距离计算）→ 仍渲染标记点
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
  },

  // 跳转第三方地图导航
  openNavigation(e) {
    const id = e.currentTarget.dataset.id;
    const store = this.data.stores.find(s => s.id === id);
    if (!store) return;
    this.setData({ navLoading: true });
    setTimeout(() => {
      wx.openLocation({
        latitude: store.latitude,
        longitude: store.longitude,
        name: store.name,
        address: store.address,
        scale: 18
      });
    }, 200);
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
