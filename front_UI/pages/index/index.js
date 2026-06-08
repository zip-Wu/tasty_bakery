// pages/index/index.js

// ============================================================
// 离线模拟开关：设为 true 时，后端连不上就用本地数据渲染
// ★★★ 上线前必须改成 false，并把本文件里 useMockData() 删掉 ★★★
// ============================================================
const USE_MOCK  = true   // ← 上线前改成 false
const ALLOW_MOCK = USE_MOCK

const { mockProducts, mockCategories } = require('../../utils/mock');

Page({
  data: {
    // 分类数据
    categories: ['全部', '吐司', '可颂', '欧包', '贝果', '丹麦', '蛋糕'],
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
    apiBase: ''
  },

  onLoad() {
    const app = getApp();

    // 如果没有选过门店，自动跳转门店选择页（tabBar 点单按钮直连场景）
    if (!app.globalData.selectedStore) {
      wx.redirectTo({ url: '/pages/store-select/store-select' });
      return;
    }

    // 设置API地址（调试用）
    this.setData({ apiBase: app.globalData.apiBase });

    // 从全局获取选中的门店信息
    const store = app.globalData.selectedStore || this.data.store;
    this.setData({ store });

    // 加载商品列表
    this.loadProducts();
  },

  // 加载商品列表
  loadProducts() {
    const app = getApp();
    console.log('加载商品，API地址:', app.globalData.apiBase);
    
    wx.request({
      url: app.globalData.apiBase + '/api/products',
      method: 'GET',
      success: (res) => {
        console.log('商品接口返回:', res.data);
        
        if (res.data && res.data.success) {
          this.setData({
            breadList: res.data.data,
            filteredBreadList: res.data.data
          });
          console.log('商品加载成功，数量:', res.data.data.length);
        } else {
          console.error('接口返回异常:', res.data);
          if (ALLOW_MOCK) {
            this.useMockData();
          } else {
            wx.showToast({ title: '加载商品失败', icon: 'none' });
          }
        }
      },
      fail: (err) => {
        if (ALLOW_MOCK) {
          console.log('后端未连接，使用离线模拟数据');
          this.useMockData();
        } else {
          console.error('请求失败:', err);
          wx.showToast({ title: '网络请求失败', icon: 'none' });
        }
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

  // 筛选面包列表
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

    wx.request({
      url: app.globalData.apiBase + '/api/orders',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: requestData,
      success: (res) => {
        console.log('创建订单返回:', res.data);
        wx.hideLoading();
        if (res.data && res.data.success) {
          wx.navigateTo({
            url: '/pages/order-confirm/order-confirm?orderId=' + res.data.data.id
          });
        } else {
          wx.showToast({ title: res.data?.message || '创建订单失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('创建订单失败:', err);
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});