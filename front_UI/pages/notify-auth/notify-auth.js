Page({
  data: {
    orderId: '',
    phone: '',
    phoneInput: '',
    notifyAuthorized: false,
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
    }
    const app = getApp();
    const userPhone = (app.globalData.userInfo && app.globalData.userInfo.phone) || '';
    if (userPhone) this.setData({ phone: userPhone });
    // 从本地存储恢复授权状态（防止离开页面后丢失）
    if (wx.getStorageSync('notify_authorized')) {
      this.setData({ notifyAuthorized: true });
    }
  },

  // 微信订阅消息授权
  requestNotify() {
    wx.requestSubscribeMessage({
      tmplIds: ['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'],
      success: (res) => {
        if (res['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'] === 'accept') {
          wx.setStorageSync('notify_authorized', true);
          this.setData({ notifyAuthorized: true });
          wx.showToast({ title: '已授权取餐通知', icon: 'success' });
          setTimeout(() => this.goToOrderDetail(), 600);
        } else if (res['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'] === 'reject') {
          wx.showModal({
            title: '无法发送通知',
            content: '您可能勾选了"总是拒绝"，通知权限已被系统关闭。可前往小程序设置重新开启。',
            confirmText: '去设置',
            cancelText: '知道了',
            success: (modalRes) => {
              if (modalRes.confirm) { wx.openSetting(); }
            }
          });
        } else {
          wx.showToast({ title: '已取消授权', icon: 'none' });
        }
      },
      fail: (err) => {
        console.warn('[notify-auth] 授权失败:', err);
        wx.showModal({
          title: '无法发送通知',
          content: '通知权限已被系统关闭。可前往小程序设置重新开启。',
          confirmText: '去设置',
          cancelText: '知道了',
          success: (modalRes) => {
            if (modalRes.confirm) { wx.openSetting(); }
          }
        });
      }
    });
  },

  // 跳过授权 → 进订单详情
  skipAuth() {
    this.goToOrderDetail();
  },

  goToOrderDetail() {
    if (this.data.orderId) {
      wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + this.data.orderId });
    } else {
      wx.switchTab({ url: '/pages/order-list/order-list' });
    }
  },

  // 手机号输入
  onPhoneInput(e) {
    this.setData({ phoneInput: e.detail.value });
  },

  // 保存手机号
  savePhone() {
    const phone = this.data.phoneInput.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的 11 位手机号', icon: 'none' });
      return;
    }
    const app = getApp();
    app.request({
      url: '/api/user/' + app.globalData.userId + '/phone',
      method: 'PUT',
      data: { phone }
    }).then(() => {
      this.setData({ phone, phoneInput: '' });
      if (app.globalData.userInfo) app.globalData.userInfo.phone = phone;
      wx.showToast({ title: '已保存' });
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  // 开始编辑手机号（从已有手机号切换为输入态）
  startEditPhone() {
    this.setData({ phone: '', phoneInput: this.data.phone });
  },

  // 清除手机号
  clearPhone() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除已保存的手机号吗？',
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        app.request({
          url: '/api/user/' + app.globalData.userId + '/phone',
          method: 'PUT',
          data: { phone: '' }
        }).then(() => {
          this.setData({ phone: '', phoneInput: '' });
          if (app.globalData.userInfo) app.globalData.userInfo.phone = '';
          wx.showToast({ title: '已清除' });
        }).catch(err => {
          wx.showToast({ title: (err && err.message) || '清除失败', icon: 'none' });
        });
      }
    });
  }
});
