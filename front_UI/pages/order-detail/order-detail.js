Page({
  data: {
    orderId: '',
    order: {},
    statusIcon: '⏳',
    statusMap: {
      pending: { icon: '💰', text: '待支付' },
      preparing: { icon: '👨‍🍳', text: '制作中' },
      ready: { icon: '📦', text: '待取餐' },
      completed: { icon: '✅', text: '已完成' }
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
    }
  },

  // 加载订单
  loadOrder(orderId) {
    const app = getApp();
    wx.request({
      url: app.globalData.apiBase + '/api/orders/' + orderId,
      success: (res) => {
        if (res.data.success) {
          const order = res.data.data;
          this.processOrder(order);
        }
      }
    });
  },

  // 处理订单数据
  processOrder(order) {
    // 状态图标和文字
    const statusInfo = this.data.statusMap[order.status] || { icon: '📋', text: order.status };
    
    // 时间格式化
    order.createdAtDisplay = this.formatTime(order.createdAt);
    order.paidAtDisplay = order.paidAt ? this.formatTime(order.paidAt) : '';
    order.acceptedAtDisplay = order.acceptedAt ? this.formatTime(order.acceptedAt) : '';
    order.completedAtDisplay = order.completedAt ? this.formatTime(order.completedAt) : '';
    
    // 取餐时间显示
    const pickupTime = new Date(order.pickupTime);
    const hours = pickupTime.getHours().toString().padStart(2, '0');
    const minutes = pickupTime.getMinutes().toString().padStart(2, '0');
    order.pickupTimeDisplay = `预计 ${hours}:${minutes} 可取`;
    
    // 商品总数
    order.totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    
    // 门店地址
    order.address = order.address || '广东省珠海市香洲区唐家湾镇香山路639号';
    
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
          wx.request({
            url: app.globalData.apiBase + '/api/orders/' + this.data.orderId + '/complete',
            method: 'POST',
            success: (r) => {
              if (r.data.success) {
                wx.showToast({ title: '取餐确认成功', icon: 'success' });
                this.loadOrder(this.data.orderId);
              }
            }
          });
        }
      }
    });
  },

  // 联系门店
  callStore() {
    wx.showModal({
      title: '联系门店',
      content: '格创·壹号店\n📞 0756-1234567\n\n营业时间：08:00 - 21:00',
      showCancel: false,
      confirmText: '拨打'
    });
  }
});