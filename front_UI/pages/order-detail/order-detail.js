Page({
  data: {
    orderId: '',
    order: {},
    statusIcon: '/images/svg/order-pending.svg',
    showRefundModal: false,     // 退款理由弹窗（completed 状态）
    refundReason: '',           // 退款理由
    isSubmittingRefund: false,  // 退款申请提交中
    showCallModal: false,       // 联系门店弹窗
    phoneInput: '',             // 手机号输入
    phone: '',                  // 已保存的手机号
    notifyAuthorized: false,    // 是否已授权微信订阅通知
    statusMap: {
      pending:        { icon: '/images/svg/order-pending.svg',   text: '待支付' },
      preparing:      { icon: '/images/svg/order-preparing.svg', text: '制作中' },
      ready:          { icon: '/images/svg/order-ready.svg',     text: '待取餐' },
      completed:      { icon: '/images/svg/order-completed.svg', text: '已完成' },
      refunded:       { icon: '/images/svg/order-completed.svg', text: '已退款' },
      refund_pending: { icon: '/images/svg/order-completed.svg', text: '退款审核中' }
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ orderId: options.id });
      this.loadOrder(options.id);
    }
    // 读取已保存的手机号和授权状态（持久化，防止离开页面丢失）
    const app = getApp();
    const userPhone = (app.globalData.userInfo && app.globalData.userInfo.phone) || '';
    if (userPhone) this.setData({ phone: userPhone });
    if (wx.getStorageSync('notify_authorized')) {
      this.setData({ notifyAuthorized: true });
    }
  },

  onShow() {
    if (this.data.orderId) {
      this.loadOrder(this.data.orderId);
      this._startPolling();
    }
  },

  onHide() {
    this._stopPolling();
  },

  onUnload() {
    this._stopPolling();
  },

  // 加载订单
  loadOrder(orderId) {
    const app = getApp();
    app.request({ url: '/api/orders/' + orderId }).then(data => {
      this.processOrder(data);
      // 终态停止轮询（refund_pending 不是终态，继续轮询等待商家审核结果）
      if (data.status === 'completed' || data.status === 'refunded') {
        this._stopPolling();
      }
      // 自动静默订阅：一次性订阅每单都需要新额度，制作中/待取餐时进页静默订一次。
      // 老顾客勾过「总是保持以上选择」时微信直接返回 accept、无弹窗；新客只弹一次原生弹窗。
      // 本页生命周期只做一次（_notifySubscribed），且只在 loadOrder 回调里调，避免 5 秒轮询反复触发。
      if (!this._notifySubscribed && (data.status === 'preparing' || data.status === 'ready')) {
        this._notifySubscribed = true;
        this.requestNotify(true);
      }
    }).catch(() => {
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  // 轮询（每 5 秒）
  _startPolling() {
    this._stopPolling();
    if (!this.data.orderId) return;
    this._pollTimer = setTimeout(() => {
      this.loadOrder(this.data.orderId);
      const st = this.data.order.status;
      if (st !== 'completed' && st !== 'refunded') {
        this._startPolling();
      }
    }, 5000);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // 处理订单数据
  processOrder(order) {
    const statusInfo = this.data.statusMap[order.status] || { icon: '/images/svg/clipboard.svg', text: order.status };

    order.createdAtDisplay = this.formatTime(order.createdAt);
    order.paidAtDisplay = order.paidAt ? this.formatTime(order.paidAt) : '';
    order.readyAtDisplay = order.readyAt ? this.formatTime(order.readyAt) : '';
    order.completedAtDisplay = order.completedAt ? this.formatTime(order.completedAt) : '';
    order.totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    order.address = order.address || '珠海市高新区唐家湾镇香山路88号2栋1层101-10室';
    order.statusText = statusInfo.text;
    order.items.forEach((item, idx) => {
      item.itemKey = `${item.id}_${idx}`;
    });

    this.setData({
      order: order,
      statusIcon: statusInfo.icon
    });
  },

  // 申请退款（preparing / completed → 进入退款审核）
  requestRefundReview() {
    this.setData({ showRefundModal: true, refundReason: '' });
  },

  // 关闭退款理由弹窗
  hideRefundReasonModal(e) {
    // e.target === e.currentTarget → 只响应蒙版自身的点击，忽略内部元素穿透
    if (e.target === e.currentTarget) {
      this.setData({ showRefundModal: false, refundReason: '' });
    }
  },

  // 退款理由输入
  onRefundReasonInput(e) {
    this.setData({ refundReason: e.detail.value });
  },

  // 提交退款申请
  submitRefundRequest() {
    const reason = this.data.refundReason.trim();
    if (!reason) {
      wx.showToast({ title: '请填写退款理由', icon: 'none' });
      return;
    }

    this.setData({ isSubmittingRefund: true });
    const app = getApp();
    app.request({
      url: '/api/orders/' + this.data.orderId + '/refund-request',
      method: 'POST',
      data: { reason }
    }).then(data => {
      if (data && data.success) {
        this.setData({ showRefundModal: false, refundReason: '', isSubmittingRefund: false });
        wx.showToast({ title: '退款申请已提交', icon: 'success' });
        this.loadOrder(this.data.orderId);
      } else {
        this.setData({ isSubmittingRefund: false });
        wx.showToast({ title: data?.message || '提交失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('[refund-request] 请求失败:', err);
      this.setData({ isSubmittingRefund: false });
      wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
    });
  },

  // 格式化时间
  formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  // 立即支付
  goPay() {
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm?orderId=' + this.data.orderId });
  },

  // 联系门店
  callStore() {
    this.setData({ showCallModal: true });
  },

  // 关闭联系门店弹窗
  closeCallModal(e) {
    if (e.target === e.currentTarget) {
      this.setData({ showCallModal: false });
    }
  },

  // 拨打电话
  doCallPhone() {
    this.setData({ showCallModal: false });
    wx.makePhoneCall({
      phoneNumber: '18924273942'
    });
  },

  // ========== 通知订阅 / 手机号 ==========

  /**
   * 微信订阅消息授权
   * @param {boolean} silent 静默模式：进页自动订阅时传 true，
   *                         拒绝/失败/取消不再弹 modal 或 toast，不打断顾客看订单
   */
  requestNotify(silent) {
    wx.requestSubscribeMessage({
      tmplIds: ['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'],
      success: (res) => {
        if (res['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'] === 'accept') {
          wx.setStorageSync('notify_authorized', true);
          this.setData({ notifyAuthorized: true });
          if (!silent) wx.showToast({ title: '已授权取餐通知' });
        } else if (res['Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4'] === 'reject') {
          // 用户点了拒绝（可能勾选了"总是拒绝"→ 以后不会再弹窗）
          if (silent) return;
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
          if (silent) return;
          wx.showToast({ title: '已取消授权', icon: 'none' });
        }
      },
      fail: (err) => {
        console.warn('[requestNotify] 授权失败:', err);
        if (silent) return;
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

  // 编辑手机号（从已显示切换为输入态）
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
