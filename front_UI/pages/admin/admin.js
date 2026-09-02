const app = getApp();
const { CLOUD_ENV, SERVICE_NAME } = require('../../config');

Page({
  data: {
    // 登录状态
    loggedIn: false,
    password: '',
    loginError: '',

    // 门店开关状态
    storeOpen: true,

    // 当前标签页
    currentTab: 'orders',   // orders | quick-sale | products | dashboard
    tabIndex: 0,

    // 订单
    orderFilter: 'preparing',
    orderFilters: [
      { key: 'refund_pending', label: '退款审核' },
      { key: 'all', label: '全部' },
      { key: 'preparing', label: '制作中' },
      { key: 'ready', label: '待取餐' },
      { key: 'completed', label: '已完成' },
      { key: 'pending', label: '待支付' },
      { key: 'refunded', label: '已退款' }
    ],
    orders: [],
    statusMap: {
      pending: '待支付', preparing: '制作中', ready: '待取餐', completed: '已完成', refunded: '已退款', refund_pending: '退款审核中'
    },

    // 商品
    products: [],
    categoryOrder: [],
    editingId: null,
    editName: '',
    editPrice: '',
    editCategory: '',
    editStock: '',
    editDescription: '',
    editGallery: [],  // cloud fileID 数组
    editImage: '', // 新上传的 cloud fileID
    showAddForm: false,
    newProduct: { name: '', price: '', category: '', image: '', stock: '', description: '', gallery: [] },
    // 分类无需硬编码，管理页手动输入，顾客页自动提取

    // 快捷调库存 · 行内步进（方案A）
    editingStockId: null,   // 正在行内编辑库存的商品 id，null=无
    quickStockInput: '',    // 行内库存输入框的值
    quickStockSaving: {},   // { [商品id]: true } 保存中标记，用于禁用按钮防并发

    // 快捷调库存 · 批量面板（方案B）
    showStockPanel: false,  // 批量面板开关
    stockPanelRows: [],     // 面板行：{ id, name, stock(原库存), value(输入值), dirty(是否手动改过) }
    stockPanelSaving: false,// 批量保存中
    stockPresets: [5, 10, 20, 50],  // 常用库存值，一键填充未手动改过的行

    // 营收
    dashboard: null,
    dashType: 'day',     // day | month | year
    orderCounts: {},       // 各状态角标数字（preparing / refund_pending）

    // 快速录单
    qsProducts: [],
    qsCart: {},
    qsCount: 0,
    qsTotal: 0,
    qsSubmitting: false,

    // 制作清单
    productionList: { groups: [] },

    // 订单轮询提醒
    newOrderAlert: false,
    newOrderCount: 0,
    lastPollTime: '',
    isPolling: false,

    // 订单分页
    orderPage: 1,
    orderHasMore: false,
    orderLoadingMore: false,
  },

  onLoad() {
    const token = wx.getStorageSync('admin_token');
    if (token) {
      this.verifyToken(token);
    }
  },

  onShow() {
    // 回到页面时立即刷新 + 恢复轮询
    if (this.data.loggedIn && this.data.currentTab === 'orders') {
      this.loadOrders();
      this.loadDashboard();
      this._startPolling();
    }
  },

  onHide() {
    this._stopPolling();
  },

  onUnload() {
    this._stopPolling();
  },

  // ========== 登录 ==========
  onPasswordInput(e) {
    this.setData({ password: e.detail.value, loginError: '' });
  },

  doLogin() {
    const { password } = this.data;
    if (!password) {
      this.setData({ loginError: '请输入密码' });
      return;
    }

    wx.showLoading({ title: '验证中...' });

    this._request({
      url: '/api/admin/login',
      method: 'POST',
      data: { password }
    }).then(res => {
      wx.hideLoading();
      if (res.success) {
        wx.setStorageSync('admin_token', res.data.token);
        this.setData({ loggedIn: true, loginError: '' });
        this.loadOrders();
        this.loadDashboard();
        this.loadStoreStatus();
        this._startPolling();
      } else {
        this.setData({ loginError: res.message || '密码错误' });
      }
    }).catch(() => {
      wx.hideLoading();
      this.setData({ loginError: '网络错误' });
    });
  },

  verifyToken(token) {
    // JWT 简单验证：尝试请求订单来判断 token 是否有效
    this._request({
      url: '/api/admin/orders?status=all&pageSize=1',
      method: 'GET',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ loggedIn: true });
        this.loadOrders();
        this.loadDashboard();
        this.loadStoreStatus();
        this._startPolling();
      } else {
        wx.removeStorageSync('admin_token');
      }
    }).catch(() => {
      wx.removeStorageSync('admin_token');
    });
  },

  doLogout() {
    wx.removeStorageSync('admin_token');
    this.setData({
      loggedIn: false,
      password: '',
      loginError: '',
      orders: [],
      products: [],
      dashboard: null
    });
  },

  // ========== Tab 切换 ==========
  switchTab(e) {
    this._stopPolling();
    const tab = e.currentTarget.dataset.tab;
    const tabMap = { orders: 0, production: 1, products: 2, 'quick-sale': 3, dashboard: 4 };
    this.setData({ currentTab: tab, tabIndex: tabMap[tab] });
    if (tab === 'orders') {
      this.loadOrders();
      this._startPolling();
    } else if (tab === 'quick-sale') this.loadQuickSale();
    else if (tab === 'products') { this.loadProducts(); this.loadCategoryOrder(); }
    else if (tab === 'production') this.loadProductionList();
    else if (tab === 'dashboard') this.loadDashboard();
  },

  // 主 Tab 滑动切换
  onTabSwipe(e) {
    const idx = e.detail.current;
    const tabs = ['orders', 'production', 'products', 'quick-sale', 'dashboard'];
    const tab = tabs[idx];
    if (tab !== this.data.currentTab) {
      this._stopPolling();
      this.setData({ currentTab: tab, tabIndex: idx });
      if (tab === 'orders') { this.loadOrders(); this.loadDashboard(); this._startPolling(); }
      else if (tab === 'quick-sale') this.loadQuickSale();
      else if (tab === 'products') { this.loadProducts(); this.loadCategoryOrder(); }
      else if (tab === 'production') this.loadProductionList();
      else if (tab === 'dashboard') this.loadDashboard();
    }
  },

  // ========== 订单管理 ==========
  filterOrders(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ orderFilter: filter, orderPage: 1 });
    this.loadOrders();
    this.loadDashboard();
  },

  loadOrders() {
    const { orderFilter } = this.data;
    const token = wx.getStorageSync('admin_token');
    const page = this.data.orderPage || 1;

    // 加载更多时追加，首次加载时替换
    const isLoadMore = page > 1;

    this._request({
      url: '/api/admin/orders?status=' + orderFilter + '&page=' + page + '&pageSize=50',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        const { list, total, page: currentPage, hasMore } = res.data;
        const newOrders = list || [];

        if (isLoadMore) {
          // 追加模式：拼接已有订单
          const existingOrders = this.data.ordersRaw || [];
          this.ordersRaw = [...existingOrders, ...newOrders];
        } else {
          this.ordersRaw = newOrders;
          this._lastOrderIds = newOrders.map(o => o.id);
        }

        this.setData({
          orderPage: currentPage,
          orderHasMore: hasMore,
          orderLoadingMore: false,
        });

        this.renderOrders();
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      if (isLoadMore) {
        this.setData({ orderLoadingMore: false });
      }
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 加载更多订单（分页）
  loadMoreOrders() {
    if (this.data.orderLoadingMore || !this.data.orderHasMore) return;
    this.setData({ orderLoadingMore: true, orderPage: (this.data.orderPage || 1) + 1 });
    this.loadOrders();
  },

  renderOrders() {
    const today = new Date();
    const fmtDate = d => d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    const todayStr = fmtDate(today);
    const yestD = new Date(today); yestD.setDate(yestD.getDate() - 1);
    const yestStr = fmtDate(yestD);
    const dbD = new Date(today); dbD.setDate(dbD.getDate() - 2);
    const dbStr = fmtDate(dbD);

    function getDateLabel(dStr) {
      if (!dStr) return '';
      const day = (typeof dStr === 'string' ? dStr : '').slice(0, 10);
      if (day === todayStr) return '今日';
      if (day === yestStr) return '昨日';
      if (day === dbStr)  return '前天';
      return '更早';
    }

    const orders = (this.ordersRaw || []).map(order => {
      order.statusText = this.data.statusMap[order.status] || order.status;
      order.totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
      order.itemNames = (order.items || []).map(i => i.name + ' x' + i.quantity).join(', ');
      (order.items || []).forEach((item, idx) => {
        item.itemKey = `${item.id}_${idx}`;
      });
      if (order.createdAt) {
        order.dateLabel = getDateLabel(order.createdAt);
        const d = new Date(order.createdAt);
        order.timeDisplay = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      // 退款审核中：格式化申请时间
      if (order.status === 'refund_pending' && order.refundRequestedAt) {
        const d = new Date(order.refundRequestedAt);
        order.refundReqDisplay = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      return order;
    });
    this.setData({ orders });
  },

  markReady(e) {
    const id = e.currentTarget.dataset.id;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '确认',
      content: '标记此订单为"待取餐"？',
      success: (r) => {
        if (!r.confirm) return;
        this._request({
          url: '/api/admin/orders/' + id + '/ready',
          method: 'POST',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: '已标记', icon: 'success' });
            this.loadOrders();
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 标记已完成（商家代顾客完成取餐）
  markComplete(e) {
    const id = e.currentTarget.dataset.id;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '确认',
      content: '确认顾客已取餐，标记为"已完成"？',
      success: (r) => {
        if (!r.confirm) return;
        this._request({
          url: '/api/admin/orders/' + id + '/complete',
          method: 'POST',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: '已完成', icon: 'success' });
            this.loadOrders();
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        });
      }
    });
  },

  // ========== 退款审核 ==========
  approveRefund(e) {
    const id = e.currentTarget.dataset.id;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '确认退款',
      content: '批准后将通过微信支付原路退款，确认？',
      confirmText: '批准退款',
      confirmColor: '#e74c3c',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '退款中...' });
        this._request({
          url: '/api/admin/orders/' + id + '/refund-approve',
          method: 'POST',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          wx.hideLoading();
          if (res.success) {
            wx.showToast({ title: '退款已批准', icon: 'success' });
            this.loadOrders();
            this.loadDashboard();
          } else {
            wx.showToast({ title: res.message || '退款失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  },

  rejectRefund(e) {
    const id = e.currentTarget.dataset.id;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '拒绝退款',
      content: '拒绝后将恢复订单原状态，确认？',
      confirmText: '拒绝',
      confirmColor: '#999',
      success: (r) => {
        if (!r.confirm) return;
        this._request({
          url: '/api/admin/orders/' + id + '/refund-reject',
          method: 'POST',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: '已拒绝', icon: 'success' });
            this.loadOrders();
            this.loadDashboard();
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        }).catch(() => {
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  },

  // ========== 商家主动退款（无需顾客申请） ==========
  directRefund(e) {
    const id = e.currentTarget.dataset.id;
    const orderNo = e.currentTarget.dataset.orderno;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '确认退款',
      content: '将对订单 ' + orderNo + ' 发起原路退款，确认？',
      confirmText: '确认退款',
      confirmColor: '#e74c3c',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '退款中...' });
        this._request({
          url: '/api/admin/orders/' + id + '/direct-refund',
          method: 'POST',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          wx.hideLoading();
          if (res.success) {
            wx.showToast({ title: '退款已发起', icon: 'success' });
            this.loadOrders();
            this.loadDashboard();
          } else {
            wx.showToast({ title: res.message || '退款失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  },

  // ========== 商品管理 ==========
  loadProducts() {
    const token = wx.getStorageSync('admin_token');

    this._request({
      url: '/api/admin/products',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ products: res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 商品上移
  moveProductUp(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const idx = this.data.products.findIndex(p => p.id === id);
    if (idx <= 0) return;
    this._swapProducts(id, this.data.products[idx - 1].id);
  },

  // 商品下移
  moveProductDown(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const idx = this.data.products.findIndex(p => p.id === id);
    if (idx < 0 || idx >= this.data.products.length - 1) return;
    this._swapProducts(id, this.data.products[idx + 1].id);
  },

  _swapProducts(id1, id2) {
    const token = wx.getStorageSync('admin_token');
    this._request({
      url: '/api/admin/products/' + id1 + '/swap',
      method: 'PUT',
      data: { targetId: id2 },
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) this.loadProducts();
      else wx.showToast({ title: res.message || '排序失败', icon: 'none' });
    });
  },

  // 加载标签排序
  loadCategoryOrder() {
    const token = wx.getStorageSync('admin_token');
    this._request({
      url: '/api/admin/category-order',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) this.setData({ categoryOrder: res.data });
    });
  },

  // 标签上移
  moveCategoryUp(e) {
    const cat = e.currentTarget.dataset.cat;
    const idx = this.data.categoryOrder.indexOf(cat);
    if (idx <= 0) return;
    const arr = [...this.data.categoryOrder];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    this._saveCategoryOrder(arr);
  },

  // 标签下移
  moveCategoryDown(e) {
    const cat = e.currentTarget.dataset.cat;
    const idx = this.data.categoryOrder.indexOf(cat);
    if (idx < 0 || idx >= this.data.categoryOrder.length - 1) return;
    const arr = [...this.data.categoryOrder];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    this._saveCategoryOrder(arr);
  },

  _saveCategoryOrder(categories) {
    const token = wx.getStorageSync('admin_token');
    this._request({
      url: '/api/admin/category-order',
      method: 'PUT',
      data: { categories },
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ categoryOrder: categories });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  toggleProduct(e) {
    const { id, available } = e.currentTarget.dataset;
    const token = wx.getStorageSync('admin_token');

    this._request({
      url: '/api/admin/products/' + id,
      method: 'PUT',
      data: { is_available: available ? false : true },
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) this.loadProducts();
    });
  },

  // ========== 快捷调库存 · 行内步进（方案A） ==========
  // 复用现有 PUT /api/admin/products/:id 部分更新：只传 stock 不碰其他字段
  quickStockChange(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const delta = parseInt(e.currentTarget.dataset.delta) || 0;
    const product = this.data.products.find(p => p.id === id);
    if (!product || this.data.quickStockSaving[id]) return;
    const next = (product.stock || 0) + delta;
    if (next < 0) return; // 后端也校验非负，前端先拦住
    this._saveQuickStock(id, next);
  },

  // 点库存数字 → 原地变成输入框
  startQuickStockEdit(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const product = this.data.products.find(p => p.id === id);
    if (!product) return;
    // 重置上次可能的"取消"残留标志，避免误跳过本次失焦保存
    this._quickStockCancel = false;
    this.setData({ editingStockId: id, quickStockInput: String(product.stock || 0) });
  },

  onQuickStockInput(e) {
    this.setData({ quickStockInput: e.detail.value });
  },

  // 失焦 / 回车 保存行内库存
  saveQuickStock() {
    const id = this.data.editingStockId;
    if (id === null || id === undefined) return;
    const raw = String(this.data.quickStockInput || '').trim();
    if (raw === '') {
      wx.showToast({ title: '请输入库存', icon: 'none' });
      return;
    }
    const next = parseInt(raw);
    if (isNaN(next) || next < 0) {
      wx.showToast({ title: '库存不能为负数', icon: 'none' });
      return;
    }
    this.setData({ editingStockId: null, quickStockInput: '' });
    this._saveQuickStock(id, next);
  },

  // 失焦保存：blur 先于 tap 触发，延迟 100ms 等 ✕/✓ 的点击先落定，
  // 若点了 ✕（_quickStockCancel=true）则跳过保存，实现真正的"取消"
  onQuickStockBlur() {
    setTimeout(() => {
      if (this._quickStockCancel) {
        this._quickStockCancel = false;
        return;
      }
      this.saveQuickStock();
    }, 100);
  },

  cancelQuickStock() {
    this._quickStockCancel = true;
    this.setData({ editingStockId: null, quickStockInput: '' });
  },

  // 通用：保存单个商品库存（行内步进和批量面板共用）
  _saveQuickStock(id, stock) {
    const token = wx.getStorageSync('admin_token');
    this.setData({ ['quickStockSaving.' + id]: true });
    this._request({
      url: '/api/admin/products/' + id,
      method: 'PUT',
      data: { stock },
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      this.setData({ ['quickStockSaving.' + id]: false });
      if (res.success) {
        // 自愈：锁定商品被行内改成有库存，说明商家要卖了，解除锁定
        if (stock > 0) this._unlockStock(id);
        this.loadProducts();
      } else {
        wx.showToast({ title: res.message || '修改失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ ['quickStockSaving.' + id]: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 从锁定清单移除某商品（storage 同步）
  _unlockStock(id) {
    let ids = [];
    try { ids = wx.getStorageSync('admin_stock_locked') || []; } catch (_) {}
    if (!Array.isArray(ids)) ids = [];
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    ids.splice(idx, 1);
    try { wx.setStorageSync('admin_stock_locked', ids); } catch (_) {}
  },

  // ========== 快捷调库存 · 批量面板（方案B） ==========
  // 锁定机制：商家把"置0=展示但不卖"的商品锁定（storage 记忆），
  // 锁定行不参与常用值填充、不参与保存，避免批量操作误改它们
  openStockPanel() {
    let lockedIds = [];
    try {
      lockedIds = wx.getStorageSync('admin_stock_locked') || [];
    } catch (_) {}
    const lockedSet = {};
    (Array.isArray(lockedIds) ? lockedIds : []).forEach(id => { lockedSet[id] = true; });

    const rows = (this.data.products || []).map(p => ({
      id: p.id,
      name: p.name,
      stock: p.stock || 0,
      value: String(p.stock || 0),
      dirty: false,
      locked: !!lockedSet[p.id],
    }));
    // 售罄（0 库存）排最前，方便一眼看到要补货的
    rows.sort((a, b) => (a.stock === 0 ? 0 : 1) - (b.stock === 0 ? 0 : 1));
    this.setData({ showStockPanel: true, stockPanelRows: rows, stockPanelSaving: false });
  },

  closeStockPanel() {
    this.setData({ showStockPanel: false, stockPanelRows: [] });
  },

  // 空处理函数：用于 catchtap / catchtouchmove 阻止事件冒泡或滚动穿透
  noop() {},

  // 锁定/解锁单行，并同步到本地 storage（下次打开面板仍生效）
  toggleStockLock(e) {
    const idx = e.currentTarget.dataset.idx;
    const rows = this.data.stockPanelRows;
    const row = rows[idx];
    if (!row) return;
    rows[idx] = { ...row, locked: !row.locked };
    this.setData({ stockPanelRows: rows });

    const ids = rows.filter(r => r.locked).map(r => r.id);
    try {
      wx.setStorageSync('admin_stock_locked', ids);
    } catch (_) {}
  },

  onStockPanelInput(e) {
    const idx = e.currentTarget.dataset.idx;
    if (this.data.stockPanelRows[idx] && this.data.stockPanelRows[idx].locked) return;
    this.setData({
      ['stockPanelRows[' + idx + '].value']: e.detail.value,
      ['stockPanelRows[' + idx + '].dirty']: true
    });
  },

  // 常用值：只填充未手动改过（dirty=false）且未锁定（locked=false）的行
  fillStockValue(e) {
    const val = parseInt(e.currentTarget.dataset.value);
    if (isNaN(val) || val < 0) return;
    const rows = this.data.stockPanelRows.map(r =>
      (r.dirty || r.locked) ? r : { ...r, value: String(val) }
    );
    this.setData({ stockPanelRows: rows });
  },

  async saveStockPanel() {
    if (this.data.stockPanelSaving) return;

    const rows = this.data.stockPanelRows;
    const invalid = [];
    const changed = [];
    rows.forEach(r => {
      if (r.locked) return; // 锁定行不参与校验与提交
      const v = parseInt(r.value);
      if (isNaN(v) || v < 0) {
        invalid.push(r.name);
      } else if (v !== r.stock) {
        changed.push({ id: r.id, name: r.name, stock: v });
      }
    });

    if (invalid.length > 0) {
      wx.showToast({ title: '「' + invalid[0] + '」库存无效', icon: 'none' });
      return;
    }
    if (changed.length === 0) {
      wx.showToast({ title: '没有修改', icon: 'none' });
      return;
    }

    this.setData({ stockPanelSaving: true });
    const token = wx.getStorageSync('admin_token');
    const failed = [];

    // 串行提交：循环调现有单个更新接口，后端零改动
    for (const c of changed) {
      try {
        const res = await this._request({
          url: '/api/admin/products/' + c.id,
          method: 'PUT',
          data: { stock: c.stock },
          header: { Authorization: 'Bearer ' + token }
        });
        if (!res || !res.success) failed.push(c.name);
      } catch (e) {
        failed.push(c.name);
      }
    }

    this.setData({ stockPanelSaving: false });

    if (failed.length === 0) {
      wx.showToast({ title: '已保存 ' + changed.length + ' 项', icon: 'success' });
      this.closeStockPanel();
      this.loadProducts();
    } else {
      wx.showToast({ title: failed.length + ' 项保存失败', icon: 'none' });
    }
  },

  startEdit(e) {
    const { id } = e.currentTarget.dataset;
    const product = this.data.products.find(p => p.id === id);
    if (!product) return;

    // 解析 gallery：DB 回来是 JSON 字符串或已解析数组
    let gallery = [];
    if (product.gallery) {
      if (Array.isArray(product.gallery)) {
        gallery = product.gallery;
      } else if (typeof product.gallery === 'string' && product.gallery.startsWith('[')) {
        try { gallery = JSON.parse(product.gallery); } catch (_) {}
      }
    }

    this.setData({
      editingId: id,
      editName: product.name || '',
      editPrice: String(product.price || ''),
      editCategory: product.category || '',
      editStock: String(product.stock || 0),
      editDescription: product.description || '',
      editGallery: gallery,
      editImage: ''
    });
  },

  onEditName(e) { this.setData({ editName: e.detail.value }); },
  onEditPrice(e) { this.setData({ editPrice: e.detail.value }); },
  onEditCategory(e) { this.setData({ editCategory: e.detail.value }); },
  onEditStock(e) { this.setData({ editStock: e.detail.value }); },
  onEditDesc(e) { this.setData({ editDescription: e.detail.value }); },

  // 编辑模式下更换图片
  chooseEditImage() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success(compressRes) {
            that._cloudUploadForEdit(compressRes.tempFilePath);
          },
          fail() {
            that._cloudUploadForEdit(tempFilePath);
          }
        });
      }
    });
  },

  _cloudUploadForEdit(filePath) {
    const that = this;
    wx.showLoading({ title: '上传中...' });
    wx.cloud.uploadFile({
      cloudPath: 'products/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg',
      filePath: filePath,
      success(uploadRes) {
        wx.hideLoading();
        that.setData({ editImage: uploadRes.fileID });
        wx.showToast({ title: '上传成功', icon: 'success' });
      },
      fail(err) {
        wx.hideLoading();
        console.error('云存储上传失败:', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },
  // 编辑模式：多图上传（gallery）
  chooseGalleryForEdit() {
    const that = this;
    const current = this.data.editGallery || [];
    wx.chooseMedia({
      count: 9 - current.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        that._uploadGalleryBatch(res.tempFiles, 'edit');
      }
    });
  },
  // 编辑模式：删除 gallery 中某张
  deleteEditGalleryItem(e) {
    const idx = e.currentTarget.dataset.idx;
    const gallery = [...this.data.editGallery];
    gallery.splice(idx, 1);
    this.setData({ editGallery: gallery });
  },
  // 新增模式：多图上传
  chooseGalleryForNew() {
    const that = this;
    const current = this.data.newProduct.gallery || [];
    wx.chooseMedia({
      count: 9 - current.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        that._uploadGalleryBatch(res.tempFiles, 'new');
      }
    });
  },
  // 新增模式：删除 gallery 中某张
  deleteNewGalleryItem(e) {
    const idx = e.currentTarget.dataset.idx;
    const gallery = [...this.data.newProduct.gallery];
    gallery.splice(idx, 1);
    this.setData({ 'newProduct.gallery': gallery });
  },
  // 批量上传图片到云存储
  _uploadGalleryBatch(tempFiles, mode) {
    const that = this;
    wx.showLoading({ title: '上传中...' });
    const uploaded = [];
    function uploadNext(i) {
      if (i >= tempFiles.length) {
        wx.hideLoading();
        if (mode === 'edit') {
          const current = that.data.editGallery || [];
          that.setData({ editGallery: [...current, ...uploaded] });
        } else {
          const current = that.data.newProduct.gallery || [];
          that.setData({ 'newProduct.gallery': [...current, ...uploaded] });
        }
        wx.showToast({ title: '已上传 ' + uploaded.length + ' 张', icon: 'success' });
        return;
      }
      const file = tempFiles[i];
      wx.compressImage({
        src: file.tempFilePath, quality: 80,
        success(compressRes) {
          wx.cloud.uploadFile({
            cloudPath: 'products/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg',
            filePath: compressRes.tempFilePath,
            success(uploadRes) { uploaded.push(uploadRes.fileID); uploadNext(i + 1); },
            fail() { uploadNext(i + 1); }
          });
        },
        fail() {
          wx.cloud.uploadFile({
            cloudPath: 'products/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg',
            filePath: file.tempFilePath,
            success(uploadRes) { uploaded.push(uploadRes.fileID); uploadNext(i + 1); },
            fail() { uploadNext(i + 1); }
          });
        }
      });
    }
    uploadNext(0);
  },

  saveEdit() {
    const { editingId, editName, editPrice, editCategory, editStock, editImage, editDescription, editGallery } = this.data;
    if (!editingId) return;
    const token = wx.getStorageSync('admin_token');

    const data = {
      name: editName,
      price: parseFloat(editPrice),
      category: editCategory,
      stock: parseInt(editStock) || 0,
      description: editDescription,
      gallery: editGallery,
    };
    if (editImage) data.image = editImage;

    this._request({
      url: '/api/admin/products/' + editingId,
      method: 'PUT',
      data: data,
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({
          editingId: null, editName: '', editPrice: '', editCategory: '',
          editStock: '', editImage: '', editDescription: '', editGallery: []
        });
        this.loadProducts();
        wx.showToast({ title: '已更新', icon: 'success' });
      } else {
        wx.showToast({ title: '修改失败', icon: 'none' });
      }
    });
  },

  cancelEdit() {
    this.setData({
      editingId: null, editName: '', editPrice: '', editCategory: '',
      editStock: '', editImage: '', editDescription: '', editGallery: []
    });
  },

  toggleAddForm() {
    this.setData({ showAddForm: !this.data.showAddForm });
  },

  onNewName(e) { this.setData({ 'newProduct.name': e.detail.value }); },
  onNewPrice(e) { this.setData({ 'newProduct.price': e.detail.value }); },
  onNewCategory(e) { this.setData({ 'newProduct.category': e.detail.value }); },
  onNewStock(e) { this.setData({ 'newProduct.stock': e.detail.value }); },
  onNewDesc(e) { this.setData({ 'newProduct.description': e.detail.value }); },

  // 从手机相册/相机选择商品图片 → 直接上传云存储
  chooseImage() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        // 先压缩再上传
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success(compressRes) {
            that._cloudUpload(compressRes.tempFilePath);
          },
          fail() {
            that._cloudUpload(tempFilePath);
          }
        });
      }
    });
  },

  // 上传到微信云存储（无需域名、无需备案）
  _cloudUpload(filePath) {
    const that = this;
    wx.showLoading({ title: '上传中...' });

    wx.cloud.uploadFile({
      cloudPath: 'products/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg',
      filePath: filePath,
      success(uploadRes) {
        wx.hideLoading();
        // uploadRes.fileID 格式：cloud://env-id.xxx/products/xxx.jpg
        // 小程序 <image> 标签原生支持此格式
        that.setData({ 'newProduct.image': uploadRes.fileID });
        wx.showToast({ title: '上传成功', icon: 'success' });
      },
      fail(err) {
        wx.hideLoading();
        console.error('云存储上传失败:', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  addProduct() {
    const { newProduct } = this.data;
    if (!newProduct.name || !newProduct.price) {
      wx.showToast({ title: '名称和价格必填', icon: 'none' });
      return;
    }
    const token = wx.getStorageSync('admin_token');

    this._request({
      url: '/api/admin/products',
      method: 'POST',
      data: newProduct,
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        wx.showToast({ title: '新增成功', icon: 'success' });
        this.setData({
          showAddForm: false,
          newProduct: { name: '', price: '', category: '', image: '', stock: '', description: '', gallery: [] }
        });
        this.loadProducts();
      } else {
        wx.showToast({ title: res.message || '新增失败', icon: 'none' });
      }
    });
  },

  // 删除单个商品
  deleteProduct(e) {
    const { id, name } = e.currentTarget.dataset;
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${name}」吗？此操作不可恢复。`,
      success: (r) => {
        if (!r.confirm) return;
        this._request({
          url: '/api/admin/products/' + id,
          method: 'DELETE',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadProducts();
          }
        });
      }
    });
  },

  // 一键清空所有商品
  resetProducts() {
    const token = wx.getStorageSync('admin_token');

    wx.showModal({
      title: '⚠️ 清空全部商品',
      content: '将删除所有商品数据，不可恢复。确定继续？',
      success: (r) => {
        if (!r.confirm) return;
        this._request({
          url: '/api/admin/products/reset',
          method: 'POST',
          // 后端保护：必须传约定确认码才允许清空，防止误调用
          data: { confirm: 'DELETE_ALL_PRODUCTS' },
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: res.message, icon: 'success' });
            this.loadProducts();
          } else {
            wx.showToast({ title: res.message || '清空失败', icon: 'none' });
          }
        }).catch(err => {
          wx.showToast({ title: err?.data?.message || '网络错误', icon: 'none' });
        });
      }
    });
  },

  // ========== 制作清单 ==========
  loadProductionList() {
    const token = wx.getStorageSync('admin_token');
    this._request({
      url: '/api/admin/production-list',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ productionList: res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '加载制作清单失败', icon: 'none' });
    });
  },

  // ========== 营收看板 ==========
  loadDashboard() {
    const token = wx.getStorageSync('admin_token');
    const { dashType, dashboard } = this.data;
    const date = (dashboard && dashboard.date) || '';
    this._request({
      url: '/api/admin/dashboard?type=' + dashType + (date ? '&date=' + date : ''),
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        const d = res.data;
        // 为当日订单注入中文状态和商品摘要
        const statusMap = { pending: '待支付', preparing: '制作中', ready: '待取餐', completed: '已完成', refunded: '已退款', refund_pending: '退款审核中' };
        (d.todayOrders || []).forEach(order => {
          order._statusText = statusMap[order.status] || order.status;
          const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
          order._itemsSummary = items.map(i => i.name + 'x' + i.quantity).join(' · ');
        });
        this.setData({
          dashboard: d,
          orderCounts: {
            preparing: (d.badges && d.badges.preparing) || 0,
            ready: (d.badges && d.badges.ready) || 0,
            refund_pending: (d.badges && d.badges.refundPending) || 0,
          },
        });
      }
    }).catch(() => {});
  },

  setDashType(e) {
    const type = e.currentTarget.dataset.type;
    const bj = new Date();
    const today = bj.getFullYear() + '-' +
      String(bj.getMonth() + 1).padStart(2, '0') + '-' +
      String(bj.getDate()).padStart(2, '0');
    const cur = (this.data.dashboard && this.data.dashboard.date) || today;
    // 切换模式时归一化：年用 YYYY，月用 YYYY-MM，日用 YYYY-MM-DD
    // 如果当前日期长度不足以生成目标格式（如年"2026"转月），用今天补齐
    const normalized =
      type === 'year' ? cur.slice(0, 4) :
      type === 'month' ? (cur.length >= 7 ? cur.slice(0, 7) : today.slice(0, 7)) :
      today;
    const dash = this.data.dashboard || {};
    dash.date = normalized;
    // dateForPicker: 给 mode=date + fields=month/year 用的完整日期垫值
    if (type === 'year') {
      dash.dateForPicker = normalized + '-01-01';
    } else if (type === 'month') {
      dash.dateForPicker = normalized + '-01';
    } else {
      delete dash.dateForPicker;
    }
    this.setData({ dashType: type, dashboard: dash }, () => this.loadDashboard());
  },

  onDateChange(e) {
    const val = e.detail.value;  // 永远是 YYYY-MM-DD（因为用 mode=date）
    const dash = this.data.dashboard || {};
    // 按当前模式截取：年=前4位 / 月=前7位 / 日=全部
    if (this.data.dashType === 'year') {
      dash.date = val.slice(0, 4);
      dash.dateForPicker = val.slice(0, 4) + '-01-01';
    } else if (this.data.dashType === 'month') {
      dash.date = val.slice(0, 7);
      dash.dateForPicker = val.slice(0, 7) + '-01';
    } else {
      dash.date = val;
      delete dash.dateForPicker;
    }
    this.setData({ dashboard: dash }, () => this.loadDashboard());
  },

  goToday() {
    const bj = new Date();
    const today = bj.getFullYear() + '-' +
      String(bj.getMonth() + 1).padStart(2, '0') + '-' +
      String(bj.getDate()).padStart(2, '0');
    const dash = this.data.dashboard || {};
    dash.date = today;
    this.setData({ dashboard: dash }, () => this.loadDashboard());
  },

  // ========== 快速录单 ==========
  loadQuickSale() {
    const token = wx.getStorageSync('admin_token');
    wx.showLoading({ title: '加载商品...' });

    this._request({
      url: '/api/admin/products',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      wx.hideLoading();
      if (res.success) {
        const products = (res.data || [])
          .map(p => ({
            ...p,
            stock: p.stock || 0,
          }));
        this.setData({
          qsProducts: products,
          qsCart: {},
          qsCount: 0,
          qsTotal: 0,
        });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  qsChange(e) {
    const id = e.currentTarget.dataset.id;
    const delta = parseInt(e.currentTarget.dataset.delta) || 0;
    const cart = { ...this.data.qsCart };

    let qty = cart[id] || 0;
    qty += delta;
    if (qty < 0) qty = 0;

    if (qty > 0) {
      cart[id] = qty;
    } else {
      delete cart[id];
    }

    this.setData({ qsCart: cart });
    this.qsUpdateSummary();
  },

  qsInputQty(e) {
    const id = e.currentTarget.dataset.id;
    const qty = parseInt(e.detail.value) || 0;
    const cart = { ...this.data.qsCart };

    if (qty > 0) {
      cart[id] = qty;
    } else {
      delete cart[id];
    }

    this.setData({ qsCart: cart });
    this.qsUpdateSummary();
  },

  qsUpdateSummary() {
    const cart = this.data.qsCart;
    const products = this.data.qsProducts;
    let count = 0;
    let total = 0;

    for (const id in cart) {
      const qty = cart[id];
      const product = products.find(p => p.id == id);
      if (product && qty > 0) {
        count += qty;
        total += product.price * qty;
      }
    }

    this.setData({ qsCount: count, qsTotal: total.toFixed(2) });
  },

  qsSubmit() {
    const cart = this.data.qsCart;
    const items = Object.keys(cart).map(id => ({
      id: parseInt(id),
      quantity: cart[id],
    })).filter(item => item.quantity > 0);

    if (items.length === 0) {
      wx.showToast({ title: '请先选择商品', icon: 'none' });
      return;
    }

    this.setData({ qsSubmitting: true });

    const token = wx.getStorageSync('admin_token');
    this._request({
      url: '/api/admin/quick-sale',
      method: 'POST',
      data: { items },
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      this.setData({ qsSubmitting: false });
      if (res.success) {
        wx.showToast({ title: res.message || '录入成功', icon: 'success' });
        // 刷新面板（重置为 0）
        this.loadQuickSale();
      } else {
        wx.showToast({ title: res.message || '录入失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ qsSubmitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // ========== 订单实时轮询 ==========
  // 递归 setTimeout 代替 setInterval
  //
  // 原因 1：setInterval 在微信小程序环境中可能被后台节流/暂停
  // 原因 2：setInterval 不等上一次请求完成就触发下一次，可能导致请求堆积
  // 原因 3：递归 setTimeout 保证每次请求完成后才安排下一次，天然串行
  //
  // 已知局限：轮询有 10 秒延迟，高峰时段可能漏掉新订单
  // 升级路径：WebSocket / Server-Sent Events 实时推送 + 降级到轮询

  _startPolling() {
    this._stopPolling();
    this._lastOrderIds = (this.data.orders || []).map(o => o.id);
    this._polling = true;
    this.setData({ isPolling: true });
    this._scheduleNextPoll();
  },

  _scheduleNextPoll() {
    if (!this._polling) return;
    // 10 秒后执行一次检查
    this._pollTimer = setTimeout(() => {
      this._doPoll();
    }, 10000);
  },

  async _doPoll() {
    if (!this._polling || !this.data.loggedIn || this.data.currentTab !== 'orders') return;

    const token = wx.getStorageSync('admin_token');
    try {
      const res = await this._request({
        url: '/api/admin/orders?status=' + this.data.orderFilter + '&pageSize=50',
        header: { Authorization: 'Bearer ' + token }
      });

      if (!res || !res.success || !res.data) {
        this._updatePollTime();
        this._scheduleNextPoll();
        return;
      }

      const list = res.data.list || res.data;
      const orderIds = list.map(o => o.id);
      const newIds = orderIds.filter(id => !this._lastOrderIds.includes(id));

      // 始终更新订单数据（状态可能变化）
      this.ordersRaw = list;
      this.renderOrders();
      this._lastOrderIds = orderIds;

      if (newIds.length > 0) {
        wx.vibrateLong();
        // 播放新订单提示音
        this._playAlertSound();
        this.setData({ newOrderAlert: true, newOrderCount: newIds.length });
        setTimeout(() => {
          this.setData({ newOrderAlert: false, newOrderCount: 0 });
        }, 6000);
      }
    } catch (e) {
      // 网络波动静默跳过
    }

    // 更新角标数
    this.loadDashboard();

    this._updatePollTime();
    this._scheduleNextPoll();
  },

  _updatePollTime() {
    const now = new Date();
    this.setData({
      lastPollTime: String(now.getHours()).padStart(2, '0') + ':' +
                    String(now.getMinutes()).padStart(2, '0') + ':' +
                    String(now.getSeconds()).padStart(2, '0')
    });
  },

  // 手动刷新（供商家点击）
  manualRefresh() {
    wx.showToast({ title: '刷新中...', icon: 'loading', duration: 800 });
    // 强制立即拉取一次（不等定时器）
    this._lastOrderIds = (this.data.orders || []).map(o => o.id);
    this._doPoll();
  },

  _stopPolling() {
    this._polling = false;
    this.setData({ isPolling: false });
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    // 清理提示音播放器
    if (this._alertAudio) {
      this._alertAudio.destroy();
      this._alertAudio = null;
    }
  },

  // 播放新订单提示音
  _playAlertSound() {
    // 先销毁上一个实例避免重复播放堆积
    if (this._alertAudio) {
      this._alertAudio.destroy();
    }
    const audio = wx.createInnerAudioContext();
    audio.src = '/sounds/new-order.mp3';
    // obeyMuteSwitch: false 确保手机静音模式下商家也能听到
    audio.obeyMuteSwitch = false;
    audio.play();
    audio.onEnded(() => {
      audio.destroy();
      if (this._alertAudio === audio) this._alertAudio = null;
    });
    audio.onError(() => {
      audio.destroy();
      if (this._alertAudio === audio) this._alertAudio = null;
    });
    this._alertAudio = audio;
  },

  dismissNewAlert() {
    this.setData({ newOrderAlert: false, newOrderCount: 0 });
  },

  // ========== 统一请求封装 ==========
  _request(options) {
    const that = this;
    return new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV },
        path: options.url,
        header: {
          'X-WX-SERVICE': SERVICE_NAME,
          'Content-Type': 'application/json',
          ...options.header
        },
        method: options.method || 'GET',
        data: options.data,
        success: (res) => {
          if (res.statusCode === 401) {
            wx.removeStorageSync('admin_token');
            that.setData({ loggedIn: false, password: '', loginError: '登录已过期，请重新登录' });
            reject(res);
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(res);
          }
        },
        fail: (err) => reject(err)
      });
    });
  },

  // ========== 门店开关 ==========
  loadStoreStatus() {
    this._request({
      url: '/api/store/status',
      method: 'GET'
    }).then(res => {
      if (res.success) {
        this.setData({ storeOpen: res.data.open });
      }
    }).catch(() => {});
  },

  toggleStore() {
    const that = this;
    const next = !this.data.storeOpen;
    const token = wx.getStorageSync('admin_token');
    wx.showModal({
      title: next ? '确认开始接单' : '确认停止接单',
      content: next ? '开始接单后顾客可以正常预定' : '停止接单后顾客将无法预定',
      confirmText: next ? '开始接单' : '停止接单',
      confirmColor: next ? '#07c160' : '#e74c3c',
      success(res) {
        if (!res.confirm) return;
        that._request({
          url: '/api/admin/store/toggle',
          method: 'PUT',
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            that.setData({ storeOpen: res.data.open });
            wx.showToast({ title: res.data.open ? '已开始接单' : '已停止接单', icon: 'success' });
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        }).catch(() => {});
      }
    });
  }
});
