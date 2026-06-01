Page({
  data: {
    // 活动横幅数据
    activities: [
      { id: 1, image: 'https://picsum.photos/320/200?random=201' },
      { id: 2, image: 'https://picsum.photos/320/200?random=202' },
      { id: 3, image: 'https://picsum.photos/320/200?random=203' },
      { id: 4, image: 'https://picsum.photos/320/200?random=204' }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  goToOrder() {
    wx.navigateTo({ url: '/pages/store-select/store-select' });
  },

  goMember() {
    wx.showToast({ title: '会员功能开发中', icon: 'none' });
  },

  goToPointMall() {
    wx.showToast({ title: '积分商城开发中', icon: 'none' });
  },

  goRecharge() {
    wx.showToast({ title: '充值功能开发中', icon: 'none' });
  },

  goDelivery() {
    wx.showToast({ title: '邮寄功能开发中', icon: 'none' });
  }
});
