Page({
  data: {
    userInfo: {
      avatar: '/images/default-avatar.png',
      nickname: '加载中...',
      points: 0
    },
    orderCount: {
      pending: 0, preparing: 0, ready: 0, completed: 0, refund: 0
    },
    userId: null,
    showCallModal: false,
    showAboutModal: false,
    showNicknameModal: false,
    nicknameInput: '',
    tempAvatarPath: ''
  },

  onLoad() {
    this.initUser();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 3) tabBar.setData({ selected: 3 });
    }

    const app = getApp();
    if (app.globalData.userId) {
      this.loadUserInfo();
      this.loadOrderCount();
    }
  },

  initUser() {
    this.loadUserInfo();
    this.loadOrderCount();
  },

  loadUserInfo() {
    const app = getApp();
    if (!app.globalData.userId) return;
    this.setData({ userId: app.globalData.userId });
    app.request({
      url: '/api/user/' + app.globalData.userId,
    }).then(data => {
      this.setData({ userInfo: data });
    }).catch(err => { console.error('[logs] 加载用户信息失败:', err); });
  },

  loadOrderCount() {
    const app = getApp();
    if (!app.globalData.userId) return;
    app.request({
      url: '/api/orders/user/' + app.globalData.userId,
    }).then(orders => {
      const count = { pending: 0, preparing: 0, ready: 0, completed: 0, refund: 0 };
      orders.forEach(order => {
        if (count[order.status] !== undefined) count[order.status]++;
      });
      this.setData({ orderCount: count });
    }).catch(err => { console.error('[logs] 加载订单数失败:', err); });
  },

  goAllOrders() {
    wx.switchTab({ url: '/pages/order-list/order-list' });
  },

  goOrders(e) {
    const status = e.currentTarget.dataset.status;
    const app = getApp();
    app.globalData.orderTab = status;
    wx.switchTab({ url: '/pages/order-list/order-list' });
  },

  // ========== 修改头像 ==========

  changeAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...' });

        const cloudPath = 'avatars/' + this.data.userId + '_' + Date.now() + '.png';
        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
          success: (uploadRes) => {
            this.updateProfile({ avatar: uploadRes.fileID });
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('[logs] 头像上传失败:', err);
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          }
        });
      }
    });
  },

  // ========== 修改昵称 ==========

  changeNickname() {
    this.setData({
      showNicknameModal: true,
      nicknameInput: this.data.userInfo.nickname,
      tempAvatarPath: ''
    });
  },

  changeAvatarInModal() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({ tempAvatarPath: res.tempFilePaths[0] });
      }
    });
  },

  closeNicknameModal() {
    this.setData({ showNicknameModal: false });
  },

  onNicknameInput(e) {
    this.setData({ nicknameInput: e.detail.value });
  },

  saveNickname() {
    const nickname = (this.data.nicknameInput || '').trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    const tempPath = this.data.tempAvatarPath;
    if (tempPath) {
      wx.showLoading({ title: '上传头像...' });
      const cloudPath = 'avatars/' + this.data.userId + '_' + Date.now() + '.png';
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: (uploadRes) => {
          wx.hideLoading();
          this.updateProfile({ nickname, avatar: uploadRes.fileID });
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('[logs] 头像上传失败:', err);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      });
    } else {
      this.updateProfile({ nickname });
    }
  },

  // ========== 统一保存 ==========

  updateProfile(data) {
    const app = getApp();
    wx.showLoading({ title: '保存中...' });
    app.request({
      url: '/api/user/' + this.data.userId,
      method: 'POST',
      data,
    }).then(result => {
      wx.hideLoading();
      this.setData({
        userInfo: result,
        showNicknameModal: false
      });
      app.globalData.userInfo = result;
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      console.error('[logs] 保存失败:', err);
      wx.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' });
    });
  },

  // ========== 原功能 ==========

  goContact() {
    this.setData({ showCallModal: true });
  },

  closeCallModal() {
    this.setData({ showCallModal: false });
  },

  doCallPhone() {
    this.setData({ showCallModal: false });
    wx.makePhoneCall({
      phoneNumber: '18924273942'
    });
  },

  goAbout() {
    this.setData({ showAboutModal: true });
  },

  closeAboutModal() {
    this.setData({ showAboutModal: false });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  }
});
