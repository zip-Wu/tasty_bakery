Page({
  data: {
    // 首页 2x2 卡片直接用静态图片，不走数据驱动
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 0) tabBar.setData({ selected: 0 });
    }
    // 重置管理入口计数器
    this._tapCount = 0;
  },

  // 隐藏管理入口：连续点击"储存方法"卡片 7 次唤醒
  onStorageTap() {
    this._tapCount = (this._tapCount || 0) + 1;
    if (this._tapTimer) clearTimeout(this._tapTimer);
    if (this._tapCount >= 7) {
      this._tapCount = 0;
      wx.navigateTo({ url: '/pages/admin/admin' });
    } else {
      this._tapTimer = setTimeout(() => { this._tapCount = 0; }, 2000);
    }
  },

  // 自提下单 → 跳到"点单"tab
  goToOrder() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 门店导航 → 跳到门店选择页
  goToAddress() {
    wx.navigateTo({ url: '/pages/store-select/store-select' });
  }
});
