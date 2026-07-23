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
    // 为每个 tab 维护独立数据源，避免 swiper 滑动时共享数据重渲染导致闪屏
    ordersAll: [],
    ordersPending: [],
    ordersPreparing: [],
    ordersReady: [],
    ordersCompleted: [],
    statusMap: {
      pending: '待支付',
      preparing: '制作中',
      ready: '待取餐',
      completed: '已完成',
      refunded: '已退款'
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
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 2) tabBar.setData({ selected: 2 });
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

  // 切换标签（数据已在 onShow 中预加载到各 tab 独立数组，切换不触发请求）
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const tabIndex = this.data.tabs.findIndex(t => t.key === tab);
    this.setData({ currentTab: tab, tabIndex });
  },

  // 滑动切换（同上，仅更新选中态，不请求）
  onSwiperChange(e) {
    const tabIndex = e.detail.current;
    const tab = this.data.tabs[tabIndex];
    if (tab && tab.key !== this.data.currentTab) {
      this.setData({ currentTab: tab.key, tabIndex });
    }
  },

  // 加载订单列表（一次性拉取全部，分发到各 tab 独立数组）
  loadOrders() {
    const app = getApp();
    if (!app.globalData.userId) return;

    app.request({
      url: '/api/orders/user/' + app.globalData.userId,
    }).then(allOrders => {
      // 格式化全部订单
      const formatted = allOrders.map(order => {
        order.statusText = this.data.statusMap[order.status] || order.status;
        order.totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
        // 为每个 item 注入唯一 key（同商品不同温度 id 相同）
        (order.items || []).forEach((item, idx) => {
          item.itemKey = `${item.id}_${item.temperature || 'x'}_${idx}`;
        });
        const d = new Date(order.createdAt);
        order.timeDisplay = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        if (order.status === 'pending') {
          const elapsed = Math.floor((Date.now() - d.getTime()) / 60000);
          const remain = Math.max(0, 30 - elapsed);
          order.deadline = remain > 0 ? `剩余 ${remain} 分钟` : '即将过期';
        } else {
          order.deadline = '';
        }
        return order;
      });

      // 按状态拆分到独立数组，每个 swiper-item 绑定各自的数组，避免共享数据重渲染闪屏
      this.setData({
        ordersAll: formatted,
        ordersPending: formatted.filter(o => o.status === 'pending'),
        ordersPreparing: formatted.filter(o => o.status === 'preparing'),
        ordersReady: formatted.filter(o => o.status === 'ready'),
        ordersCompleted: formatted.filter(o => o.status === 'completed' || o.status === 'refunded'),
      });

      this.updateTabCounts(allOrders);
    }).catch(err => { console.error('[order-list] 加载订单失败:', err); });
  },

  // 更新标签角标
  updateTabCounts(allOrders) {
    const counts = { all: allOrders.length, pending: 0, preparing: 0, ready: 0, completed: 0 };
    allOrders.forEach(o => {
      if (o.status === 'refunded') counts.completed++;
      else if (counts[o.status] !== undefined) counts[o.status]++;
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

  // 再来一单：跳转回点单页
  reorder(e) {
    const id = e.currentTarget.dataset.id;
    // 从所有 tab 数据中查找订单
    const allOrders = [
      ...this.data.ordersAll,
      ...this.data.ordersPending,
      ...this.data.ordersPreparing,
      ...this.data.ordersReady,
      ...this.data.ordersCompleted
    ];
    const order = allOrders.find(o => o.id === id);
    if (order) {
      wx.showToast({ title: '正在跳转点单页...', icon: 'none' });
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