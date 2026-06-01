Page({
  data: {
    selectedStoreId: 1,
    stores: [
      {
        id: 1,
        name: '格创·壹号店',
        address: '广东省珠海市香洲区唐家湾镇香山路639号',
        hours: '08:00 - 21:00',
        latitude: 22.3568,
        longitude: 113.5542,
        distance: '约 0.1km',
        open: true
      }
    ],
    markers: [
      {
        id: 1,
        latitude: 22.3568,
        longitude: 113.5542,
        title: '格创·壹号店',
        iconPath: '',
        width: 30,
        height: 30
      }
    ]
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
    // 把选中的门店存到全局，跳转到点单页
    const app = getApp();
    app.globalData.selectedStore = store;

    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
