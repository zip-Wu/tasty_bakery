Page({
  data: {
    currentTab: 'all',
    tabs: [
      { key: 'all', name: '全部', count: 0 },
      { key: 'pending', name: '待支付', count: 0 },
      { key: 'preparing', name: '制作中', count: 0 },
      { key: 'ready', name: '待取餐', count: 0 },
      { key: 'completed', name: '已完成', count: 0 }
    ],
    orders: [],
    statusMap: {
      pending: '待支付',
      preparing: '制作中',
      ready: '待取餐',
      completed: '已完成',
      refund: '退款'
    }
  },

  onLoad(options) {
    // 如果有传入tab参数
    if (options.tab) {
      this.setData({ currentTab: options.tab });
    }
  },

  onShow() {
    const app = getApp();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 读取从"我的"页面传入的 tab 筛选参数
    if (app.globalData.orderTab) {
      this.setData({ currentTab: app.globalData.orderTab });
      app.globalData.orderTab = null; // 用完即清
    }
    this.loadOrders();
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab }, () => {
      this.loadOrders();
    });
  },

  // 加载订单列表
  loadOrders() {
    const app = getApp();
    if (!app.globalData.userId) return;

    app.request({
      url: '/api/orders/user/' + app.globalData.userId,
    }).then(allOrders => {
      let orders = allOrders;

      // 过滤
      if (this.data.currentTab !== 'all') {
        orders = orders.filter(o => o.status === this.data.currentTab);
      }

      // 格式化数据
      orders = orders.map(order => {
        // 状态文字
        order.statusText = this.data.statusMap[order.status] || order.status;
        // 商品总数
        order.totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
        // 时间显示
        const d = new Date(order.createdAt);
        order.timeDisplay = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        return order;
      });

      this.setData({ orders });

      // 更新标签数量
      this.updateTabCounts(allOrders);
    }).catch(() => {});
  },

  // 更新标签角标
  updateTabCounts(allOrders) {
    const counts = { all: allOrders.length, pending: 0, preparing: 0, ready: 0, completed: 0 };
    allOrders.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
    });

    const tabs = this.data.tabs.map(t => ({
      ...t,
      count: counts[t.key] || 0
    }));
    this.setData({ tabs });
  },

  // 查看订单详情
  goOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + id });
  },

  // 立即支付
  goPay(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm?orderId=' + id });
  },

  // 查看进度
  showProgress(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + id });
  },

  // 再来一单
  reorder(e) {
    const id = e.currentTarget.dataset.id;
    // 模拟把商品加入购物车
    const app = getApp();
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      wx.showToast({ title: '商品已加入购物车', icon: 'success' });
      // 跳转到点单页
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1000);
    }
  },

  // 阻止冒泡
  stopBubble() {},

  // 下拉刷新
  refreshOrders() {
    this.loadOrders();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 500);
  }
});