Page({
  data: {
    currentTab: 'all',
    tabIndex: 0,
    refreshing: false,
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
    if (app.globalData.orderTab) {
      this.setData({ currentTab: app.globalData.orderTab });
      app.globalData.orderTab = null;
    }
    // 同步 swiper 位置
    const tabIndex = this.data.tabs.findIndex(t => t.key === this.data.currentTab);
    this.setData({ tabIndex });
    this.loadOrders();
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const tabIndex = this.data.tabs.findIndex(t => t.key === tab);
    this.setData({ currentTab: tab, tabIndex }, () => {
      this.loadOrders();
    });
  },

  // 滑动切换
  onSwiperChange(e) {
    const tabIndex = e.detail.current;
    const tab = this.data.tabs[tabIndex];
    if (tab && tab.key !== this.data.currentTab) {
      this.setData({ currentTab: tab.key, tabIndex });
      this.loadOrders();
    }
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
        // 待支付倒计时
        if (order.status === 'pending') {
          const elapsed = Math.floor((Date.now() - d.getTime()) / 60000);
          const remain = Math.max(0, 30 - elapsed);
          order.deadline = remain > 0 ? `剩余 ${remain} 分钟` : '即将过期';
        } else {
          order.deadline = '';
        }
        return order;
      });

      this.setData({ orders });

      // 更新标签数量
      this.updateTabCounts(allOrders);
    }).catch(err => { console.error('[order-list] 加载订单失败:', err); });
  },

  // 更新标签角标
  updateTabCounts(allOrders) {
    const counts = { all: allOrders.length, pending: 0, preparing: 0, ready: 0, completed: 0 };
    allOrders.forEach(o => {
      if (counts[o.status] !== undefined) counts[o.status]++;
    });

    const tabs = this.data.tabs.map(t => ({
      ...t,
      count: (t.key === 'completed' || t.key === 'all') ? 0 : (counts[t.key] || 0)
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

  // 再来一单：跳转回点单页（当前版本不自动还原购物车，仅导航）
  reorder(e) {
    const id = e.currentTarget.dataset.id;
    const app = getApp();
    const order = this.data.orders.find(o => o.id === id);
    if (order) {
      wx.showToast({ title: '正在跳转点单页...', icon: 'none' });
      // 延迟 1 秒跳转：留给 toast 足够的展示时间，避免 switchTab 立即打断
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1000);
    }
  },

  // 阻止冒泡
  stopBubble() {},

  // 下拉刷新
  refreshOrders() {
    this.setData({ refreshing: true });
    this.loadOrders();
    // 订单加载完成后关闭刷新动画
    setTimeout(() => {
      this.setData({ refreshing: false });
    }, 800);
  }
});