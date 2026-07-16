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

  onLoad() {
    // 精确计算两个 spacer 高度，让 service-row↔activity↔tab 视觉等距
    // 100vh 的 rpx 值因手机而异，必须用 JS 算
    try {
      const sys = wx.getSystemInfoSync();
      const winH = sys.windowHeight;     // 屏高 px
      const winW = sys.windowWidth;       // 屏宽 px
      // 固定元素 rpx 高度（与 wxss 中元素实际高度一致）
      const fixedRpx = 560 + 80 + 200 + 240;  // banner + margin + card-height + activity
      // 100vh 转 rpx
      const screenHrpx = winH * 750 / winW;
      // 剩余空间 = 屏高 - 固定元素 - tab 安全区(158rpx)
      const remaining = screenHrpx - fixedRpx - 158;
      // 两个 spacer 等分剩余，最小 0
      const gapRpx = Math.max(0, Math.floor(remaining / 2));
      this.setData({ spacerHeight: gapRpx });
    } catch (e) {
      this.setData({ spacerHeight: 100 });  // 兜底
    }
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
    wx.switchTab({ url: '/pages/index/index' });
  },

  goToAddress() {
    wx.navigateTo({ url: '/pages/store-select/store-select' });
  }
});
