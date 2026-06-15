// pages/index/index.js

// ============================================================
// 离线模拟开关：设为 true 时，后端连不上就用本地数据渲染
// ★★★ 上线前必须改成 false，并把本文件里 useMockData() 删掉 ★★★
// ============================================================
const USE_MOCK  = false  // ← 上线前改成 false
const ALLOW_MOCK = USE_MOCK

const { mockProducts, mockCategories } = require('../../utils/mock');

Page({
  data: {
    // 分类数据（从后端动态加载，初始仅「全部」）
    categories: ['全部'],
    currentCategory: '全部',

    // 商品数据
    breadList: [],
    filteredBreadList: [],

    // 购物车
    cart: {},
    cartCount: 0,
    cartTotal: 0,

    // 门店信息
    store: {
      name: '格创·壹号店',
      address: '广东省珠海市香洲区唐家湾镇香山路639号',
      distance: '约 0.1km'
    },

    // 调试信息
    apiBase: '云托管'
  },

  onLoad() {
    const app = getApp();

    // 如果没有选过门店，自动跳转门店选择页（tabBar 点单按钮直连场景）
    if (!app.globalData.selectedStore) {
      wx.redirectTo({ url: '/pages/store-select/store-select' });
      return;
    }

    // 设置API地址（调试用）
    this.setData({ apiBase: '云托管' });

    // 从全局获取选中的门店信息
    const store = app.globalData.selectedStore || this.data.store;
    this.setData({ store });

    // 加载商品 + 分类
    this.loadProducts();
    this.loadCategories();
  },

  // 加载分类（从后端拉取，非硬编码）
  loadCategories() {
    const app = getApp();
    app.request({
      url: '/api/categories',
      method: 'GET',
    }).then(data => {
      this.setData({ categories: data });
    }).catch(() => {
      // 保留默认分类作为降级
      console.log('分类加载失败，使用默认值');
    });
  },

  // 加载商品列表
  loadProducts() {
    const app = getApp();
    console.log('加载商品，API地址: 云托管');
    
    app.request({
      url: '/api/products',
      method: 'GET',
    }).then(data => {
      console.log('商品接口返回:', data);
      this.setData({
        breadList: data,
        filteredBreadList: data
      });
      console.log('商品加载成功，数量:', data.length);
    }).catch((err) => {
      if (ALLOW_MOCK) {
        console.log('后端未连接，使用离线模拟数据');
        this.useMockData();
      } else {
        console.error('请求失败:', err);
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      }
    });
  },

  // 离线模式：用本地模拟数据渲染界面
  useMockData() {
    this.setData({
      breadList: mockProducts,
      filteredBreadList: mockProducts,
      categories: mockCategories
    });
  },

  onShow() {
    const app = getApp();
    this.setData({ userId: app.globalData.userId });

    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }

    // 更新门店信息（从 store-select 选完后会切到 index，此时 onLoad 不触发，需在 onShow 更新）
    if (app.globalData.selectedStore) {
      this.setData({ store: app.globalData.selectedStore });
    }

    // 每次显示页面时刷新商品（管理后台可能改了价格/上下架）
    if (app.globalData.selectedStore) {
      this.loadProducts();
      this.loadCategories();
    }
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    console.log('切换分类:', category);
    this.setData({ currentCategory: category }, () => {
      this.filterBreadList();
    });
  },

  // 筛选面包列表（空分类/无分类 商品只出现在"全部"中）
  filterBreadList() {
    const { breadList, currentCategory } = this.data;
    console.log('筛选，原始数据:', breadList.length, '分类:', currentCategory);
    
    let filtered = breadList;
    if (currentCategory !== '全部') {
      filtered = breadList.filter(item => item.category === currentCategory);
    }
    
    console.log('筛选后数量:', filtered.length);
    this.setData({ filteredBreadList: filtered });
  },

  // 加入购物车
  addToCart(e) {
    const id = e.currentTarget.dataset.id;
    console.log('加入购物车:', id);
    
    const cart = { ...this.data.cart };
    if (cart[id]) {
      cart[id]++;
    } else {
      cart[id] = 1;
    }
    this.updateCart(cart);
  },

  // 减少购物车
  minusFromCart(e) {
    const id = e.currentTarget.dataset.id;
    console.log('减少购物车:', id);
    
    const cart = { ...this.data.cart };
    if (cart[id] > 1) {
      cart[id]--;
    } else {
      delete cart[id];
    }
    this.updateCart(cart);
  },

  // 更新购物车
  updateCart(cart) {
    let count = 0;
    let total = 0;

    for (const id in cart) {
      const bread = this.data.breadList.find(item => item.id == id);
      if (bread) {
        count += cart[id];
        total += bread.price * cart[id];
      }
    }

    this.setData({ cart, cartCount: count, cartTotal: total });
  },

  // 去结算
  goToCheckout() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '请先选择商品', icon: 'none' });
      return;
    }

    const app = getApp();
    if (!app.globalData.userId) {
      app.login(() => {
        this.createOrder();
      });
    } else {
      this.createOrder();
    }
  },

  // 创建订单
  createOrder() {
    const app = getApp();
    const { cart, cartTotal, store } = this.data;
    const userId = app.globalData.userId;

    // 检查用户ID
    if (!userId) {
      wx.showToast({ title: '用户未登录', icon: 'none' });
      return;
    }

    // 检查购物车
    if (Object.keys(cart).length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' });
      return;
    }

    const items = [];
    for (const id in cart) {
      const bread = this.data.breadList.find(item => item.id == id);
      if (bread) {
        items.push({
          id: bread.id,
          name: bread.name,
          price: bread.price,
          quantity: cart[id],
          image: bread.image
        });
      }
    }

    if (items.length === 0) {
      wx.showToast({ title: '商品数据异常', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '创建订单...' });

    const requestData = {
      userId: userId,
      items: items,
      totalPrice: cartTotal,
      storeId: store.id || 1,
      storeName: store.name,
      address: store.address || '广东省珠海市香洲区唐家湾镇香山路639号'
    };

    console.log('创建订单，发送数据:', requestData);

    app.request({
      url: '/api/orders',
      method: 'POST',
      data: requestData,
    }).then(data => {
      console.log('创建订单返回:', data);
      wx.hideLoading();
      wx.navigateTo({
        url: '/pages/order-confirm/order-confirm?orderId=' + data.id
      });
    }).catch((err) => {
      console.error('创建订单失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  }
});