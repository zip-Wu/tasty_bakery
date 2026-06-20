const app = getApp();
const CLOUD_ENV = 'dali-bakery-api-d9frevvce1335562';
const SERVICE_NAME = 'dali-bakery-api';

Page({
  data: {
    // 登录状态
    loggedIn: false,
    password: '',
    loginError: '',

    // 当前标签页
    currentTab: 'orders',   // orders | products | dashboard

    // 订单
    orderFilter: 'all',
    orderFilters: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待支付' },
      { key: 'preparing', label: '制作中' },
      { key: 'ready', label: '待取餐' },
      { key: 'completed', label: '已完成' }
    ],
    orders: [],
    statusMap: {
      pending: '待支付', preparing: '制作中', ready: '待取餐', completed: '已完成', refund: '退款'
    },

    // 商品
    products: [],
    editingId: null,
    editName: '',
    editPrice: '',
    editCategory: '',
    editStock: '',
    editImage: '', // 新上传的 cloud fileID
    showAddForm: false,
    newProduct: { name: '', price: '', category: '', image: '', stock: '' },
    // 分类无需硬编码，管理页手动输入，顾客页自动提取

    // 营收
    dashboard: null
  },

  onLoad() {
    // 检查是否已保存 token
    const token = wx.getStorageSync('admin_token');
    if (token) {
      this.verifyToken(token);
    }
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
      url: '/api/admin/orders?status=all',
      method: 'GET',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ loggedIn: true });
        this.orders = res.data;
        this.renderOrders();
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
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    if (tab === 'orders') this.loadOrders();
    else if (tab === 'products') this.loadProducts();
    else if (tab === 'dashboard') this.loadDashboard();
  },

  // ========== 订单管理 ==========
  filterOrders(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ orderFilter: filter });
    this.loadOrders();
  },

  loadOrders() {
    const { orderFilter } = this.data;
    const token = wx.getStorageSync('admin_token');

    this._request({
      url: '/api/admin/orders?status=' + orderFilter,
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.ordersRaw = res.data;
        this.renderOrders();
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  renderOrders() {
    const orders = (this.ordersRaw || []).map(order => {
      order.statusText = this.data.statusMap[order.status] || order.status;
      order.totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
      order.itemNames = (order.items || []).map(i => i.name + ' x' + i.quantity).join(', ');
      if (order.createdAt) {
        const d = new Date(order.createdAt);
        order.timeDisplay = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
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

  startEdit(e) {
    const { id, name, price, category, stock } = e.currentTarget.dataset;
    this.setData({
      editingId: id,
      editName: name || '',
      editPrice: String(price || ''),
      editCategory: category || '',
      editStock: String(stock || 0),
      editImage: ''
    });
  },

  onEditName(e) { this.setData({ editName: e.detail.value }); },
  onEditPrice(e) { this.setData({ editPrice: e.detail.value }); },
  onEditCategory(e) { this.setData({ editCategory: e.detail.value }); },
  onEditStock(e) { this.setData({ editStock: e.detail.value }); },

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

  saveEdit() {
    const { editingId, editName, editPrice, editCategory, editStock, editImage } = this.data;
    if (!editingId) return;
    const token = wx.getStorageSync('admin_token');

    const data = {
      name: editName,
      price: parseFloat(editPrice),
      category: editCategory,
      stock: parseInt(editStock) || 0
    };
    if (editImage) data.image = editImage;

    this._request({
      url: '/api/admin/products/' + editingId,
      method: 'PUT',
      data: data,
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ editingId: null, editName: '', editPrice: '', editCategory: '', editStock: '', editImage: '' });
        this.loadProducts();
        wx.showToast({ title: '已更新', icon: 'success' });
      } else {
        wx.showToast({ title: '修改失败', icon: 'none' });
      }
    });
  },

  cancelEdit() {
    this.setData({ editingId: null, editName: '', editPrice: '', editCategory: '', editStock: '', editImage: '' });
  },

  toggleAddForm() {
    this.setData({ showAddForm: !this.data.showAddForm });
  },

  onNewName(e) { this.setData({ 'newProduct.name': e.detail.value }); },
  onNewPrice(e) { this.setData({ 'newProduct.price': e.detail.value }); },
  onNewCategory(e) { this.setData({ 'newProduct.category': e.detail.value }); },
  onNewStock(e) { this.setData({ 'newProduct.stock': e.detail.value }); },

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
          newProduct: { name: '', price: '', category: '', image: '', stock: '' }
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
          header: { Authorization: 'Bearer ' + token }
        }).then(res => {
          if (res.success) {
            wx.showToast({ title: res.message, icon: 'success' });
            this.loadProducts();
          }
        });
      }
    });
  },

  // ========== 营收看板 ==========
  loadDashboard() {
    const token = wx.getStorageSync('admin_token');

    this._request({
      url: '/api/admin/dashboard',
      header: { Authorization: 'Bearer ' + token }
    }).then(res => {
      if (res.success) {
        this.setData({ dashboard: res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
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
  }
});
