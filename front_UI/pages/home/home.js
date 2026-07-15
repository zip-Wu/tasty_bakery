Page({
  data: {
    // 活动横幅数据 — 更换图片：把新图片放到 /images/png/ 目录下，改下面的文件名即可
    // 数量可任意增减（建议 6~10 张，过多会影响滚动性能）
    activities: [
      { id: 1, image: '/images/png/products.png' },
      { id: 2, image: '/images/png/products.png' },
      { id: 3, image: '/images/png/products.png' },
      { id: 4, image: '/images/png/products.png' },
      { id: 5, image: '/images/png/products.png' },
      { id: 6, image: '/images/png/products.png' }
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

  // TODO: 以下功能待后续版本实现
  goMember() {
    wx.showToast({ title: '会员功能开发中', icon: 'none' });
  },

  goDelivery() {
    wx.showToast({ title: '邮寄功能开发中', icon: 'none' });
  }
});
