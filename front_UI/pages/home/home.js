Page({
  data: {
    // 活动横幅数据
    activities: [
      { id: 1, image: 'https://picsum.photos/320/200?random=201' },
      { id: 2, image: 'https://picsum.photos/320/200?random=202' },
      { id: 3, image: 'https://picsum.photos/320/200?random=203' },
      { id: 4, image: 'https://picsum.photos/320/200?random=204' }
    ],
    _adminTapCount: 0,
    _adminTapTimer: null
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 重置管理入口计数器
    this._tapCount = 0;
  },

  // 隐藏管理入口：连续点击 Banner 5 次唤醒
  onBannerTap() {
    this._tapCount = (this._tapCount || 0) + 1;
    if (this._tapTimer) clearTimeout(this._tapTimer);
    if (this._tapCount >= 5) {
      this._tapCount = 0;
      wx.navigateTo({ url: '/pages/admin/admin' });
    } else {
      this._tapTimer = setTimeout(() => { this._tapCount = 0; }, 2000);
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
