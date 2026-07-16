Page({
  data: {
    orderId: '',
    order: {},
    statusIcon: '/images/svg/order-pending.svg',
    statusMap: {
      pending: { icon: '/images/svg/order-pending.svg', text: '待支付' },
      preparing: { icon: '/images/svg/order-preparing.svg', text: '制作中' },
      ready: { icon: '/images/svg/order-ready.svg', text: '待取餐' },
      completed: { icon: '/images/svg/order-completed.svg', text: '已完成' }
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
      this._startPolling();  // 回到前台时恢复轮询
    }
  },

  onHide() {
    this._stopPolling();  // 切到后台时停止轮询，省电
  },

  onUnload() {
    this._stopPolling();
  },

  // 加载订单（含错误提示，不再静默吞错）
  loadOrder(orderId) {
    const app = getApp();
    app.request({
      url: '/api/orders/' + orderId,
    }).then(data => {
      this.processOrder(data);
      // 订单已终态时停止轮询
      if (data.status === 'completed') {
        this._stopPolling();
      }
    }).catch(() => {
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  // 轮询订单状态（每 5 秒，订单进行中）
  _startPolling() {
    this._stopPolling();
    if (!this.data.orderId) return;
    this._pollTimer = setTimeout(() => {
      this.loadOrder(this.data.orderId);
      // 非终态继续轮询
      if (this.data.order.status !== 'completed') {
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
    // 状态图标和文字
    const statusInfo = this.data.statusMap[order.status] || { icon: '/images/svg/clipboard.svg', text: order.status };
    
    // 时间格式化
    order.createdAtDisplay = this.formatTime(order.createdAt);
    order.paidAtDisplay = order.paidAt ? this.formatTime(order.paidAt) : '';
    order.acceptedAtDisplay = order.acceptedAt ? this.formatTime(order.acceptedAt) : '';
    order.completedAtDisplay = order.completedAt ? this.formatTime(order.completedAt) : '';
    
    // 商品总数
    order.totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    
    // 门店地址
    order.address = order.address || '珠海市高新区唐家湾镇香山路88号2栋1层101-10室';
    
    // 状态文字
    order.statusText = statusInfo.text;

    this.setData({ 
      order: order,
      statusIcon: statusInfo.icon
    });
  },

  // 格式化时间
  formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  },

  // 立即支付
  goPay() {
    wx.navigateTo({
      url: '/pages/order-confirm/order-confirm?orderId=' + this.data.orderId
    });
  },

  // 确认取餐
  confirmPickup() {
    const app = getApp();
    wx.showModal({
      title: '确认取餐',
      content: '请确认您已取到餐品',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: '/api/orders/' + this.data.orderId + '/complete',
            method: 'POST',
          }).then(() => {
            wx.showToast({ title: '取餐确认成功', icon: 'success' });
            this.loadOrder(this.data.orderId);
          }).catch(() => {
            wx.showToast({ title: '操作失败，请重试', icon: 'none' });
          });
        }
      }
    });
  },

  // 联系门店
  callStore() {
    wx.showModal({
      title: '联系门店',
      content: '大力馒头·信息港店\n电话：0756-1234567\n\n营业时间：08:00 - 21:00',
      showCancel: false,
      confirmText: '拨打'
    });
  }
});