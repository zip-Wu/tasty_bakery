Page({
  data: {
    orderId: '',
    order: {},
    statusIcon: '/images/svg/order-pending.svg',
    readyCountdown: '',        // ready 状态 24h 倒计时
    isRefunding: false,        // 退款中
    showCallModal: false,      // 联系门店弹窗
    statusMap: {
      pending:   { icon: '/images/svg/order-pending.svg',   text: '待支付' },
      preparing: { icon: '/images/svg/order-preparing.svg', text: '制作中' },
      ready:     { icon: '/images/svg/order-ready.svg',     text: '待取餐' },
      completed: { icon: '/images/svg/order-completed.svg', text: '已完成' },
      refunded:  { icon: '/images/svg/order-completed.svg', text: '已退款' }
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ orderId: options.id });
      this.loadOrder(options.id);
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
    this._stopCountdown();
  },

  // 加载订单
  loadOrder(orderId) {
    const app = getApp();
    app.request({ url: '/api/orders/' + orderId }).then(data => {
      this.processOrder(data);
      // 终态停止轮询
      if (data.status === 'completed' || data.status === 'refunded') {
        this._stopPolling();
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

  // ready 状态 1h 倒计时（退款窗口 + 自动确认）
  _startCountdown(readyAt) {
    this._stopCountdown();
    const that = this;
    const tick = () => {
      const now = Date.now();
      const deadline = new Date(readyAt).getTime() + 60 * 60 * 1000;
      const left = deadline - now;
      if (left <= 0) {
        that.setData({ readyCountdown: '订单即将自动确认完成' });
        return;
      }
      const m = Math.floor(left / 60000);
      that.setData({ readyCountdown: `请在 ${m} 分钟内取餐，超时将自动确认完成` });
    };
    tick();
    this._countdownTimer = setInterval(tick, 30000);
  },

  _stopCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
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
    // 为每个 item 注入唯一 key（同商品不同温度 id 相同，wx:key="id" 会报重复）
    order.items.forEach((item, idx) => {
      item.itemKey = `${item.id}_${item.temperature || 'x'}_${idx}`;
    });

    this.setData({
      order: order,
      statusIcon: statusInfo.icon
    });

    // ready 状态启动倒计时
    if (order.status === 'ready' && order.readyAt) {
      this._startCountdown(order.readyAt);
    } else {
      this._stopCountdown();
    }
  },

  // 申请退款
  requestRefund() {
    const that = this;
    wx.showModal({
      title: '确认退款',
      content: '退款金额将以原支付方式退回，确认后不可撤销',
      confirmText: '确认退款',
      confirmColor: '#e74c3c',
      success(res) {
        if (res.confirm) {
          that.setData({ isRefunding: true });
          const app = getApp();
          app.request({
            url: '/api/orders/' + that.data.orderId + '/refund',
            method: 'POST'
          }).then(data => {
            if (data.success) {
              wx.showToast({ title: '退款申请已提交', icon: 'success' });
              // 2 秒后拉最新状态，确认退款已生效
              setTimeout(() => {
                app.request({ url: '/api/orders/' + that.data.orderId }).then(orderData => {
                  that.processOrder(orderData);
                  that.setData({ isRefunding: false });
                  if (orderData.status === 'refunded') {
                    wx.showToast({ title: '退款成功', icon: 'success' });
                  }
                  if (orderData.status === 'completed' || orderData.status === 'refunded') {
                    that._stopPolling();
                  }
                }).catch(() => {
                  that.setData({ isRefunding: false });
                });
              }, 2000);
            } else {
              that.setData({ isRefunding: false });
              wx.showToast({ title: data.message || '退款失败', icon: 'none' });
            }
          }).catch(() => {
            that.setData({ isRefunding: false });
            wx.showToast({ title: '退款失败', icon: 'none' });
          });
        }
      }
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
  closeCallModal() {
    this.setData({ showCallModal: false });
  },

  // 拨打电话
  doCallPhone() {
    this.setData({ showCallModal: false });
    wx.makePhoneCall({
      phoneNumber: '18924273942'
    });
  }
});
