// pages/index/index.js

Page({
  data: {
    // 分类数据（从后端动态加载，初始仅「全部」）
    categories: ['全部'],
    currentCategory: '全部',

    // 商品数据
    breadList: [],
    filteredBreadList: [],

    // 购物车状态：页面级 data，而非全局 app.globalData
    // 原因：购物车只对点单页有意义，结算完成后自动清空（通过 clearCartOnReturn 标记）
    // 如果用全局状态，需在多个页面生命周期中手动同步清空时机，更容易遗漏
    // 代价：返回点单页时购物车已清空（对用户来说是预期行为——已下单的商品不应还在车里）
    cart: {},
    cartCount: 0,
    cartTotal: 0,

    // 门店信息（初始值作降级，onLoad/onShow 中会被 API 数据覆盖）
    store: {
      name: '大力馒头·信息港店',
      address: '珠海市高新区唐家湾镇香山路88号2栋1层101-10室',
      distance: ''
    },
  },

  onLoad() {
    const app = getApp();

    // 自动加载门店（不再跳转 store-select）
    if (!app.globalData.selectedStore) {
      this.loadDefaultStore();
    } else {
      this.setData({ store: app.globalData.selectedStore });
    }

    this.loadProducts();
    this.loadCategories();
  },

  // 无门店时自动加载第一个门店，并尝试获取位置计算距离
  loadDefaultStore() {
    const app = getApp();
    app.request({ url: '/api/stores' }).then(stores => {
      if (stores.length > 0) {
        const store = stores[0];
        app.globalData.selectedStore = store;
        this.setData({ store });
        this.tryCalcDistance();
      }
    }).catch(() => {
      // 保持默认 store 兜底
    });
  },

  // 尝试获取位置计算门店距离（用户未授权时显示"未知距离" + 获取按钮）
  tryCalcDistance() {
    wx.getLocation({
      type: 'gcj02',
      success: (loc) => {
        const app = getApp();
        app.request({
          url: `/api/stores?lat=${loc.latitude}&lng=${loc.longitude}`
        }).then(stores => {
          if (stores.length > 0) {
            const store = stores[0];
            app.globalData.selectedStore = store;
            this.setData({ store });
          }
        });
      }
    });
  },

  // 点击门店名称 → 跳转门店地址页
  navigateToStore() {
    wx.navigateTo({ url: '/pages/store-select/store-select' });
  },

  // 加载分类（从后端拉取，非硬编码）
  loadCategories() {
    const app = getApp();
    app.request({
      url: '/api/categories',
      method: 'GET',
    }).then(data => {
      this.setData({ categories: data });
    }).catch(err => {
      console.error('[loadCategories] 分类加载失败:', err);
      // 保留默认分类作为降级
    });
  },

  // 加载商品列表
  loadProducts() {
    const app = getApp();
    
    app.request({
      url: '/api/products',
      method: 'GET',
    }).then(data => {
      this.setData({ breadList: data }, () => {
        this.filterBreadList();
      });
    }).catch((err) => {
      console.error('[loadProducts] 商品加载失败:', err);
      wx.showToast({ title: '加载商品失败，请检查网络', icon: 'none' });
    });
  },

  onShow() {
    const app = getApp();

    // 下单成功后清空购物车
    if (app.globalData.clearCartOnReturn) {
      app.globalData.clearCartOnReturn = false;
      this.setData({ cart: {}, cartCount: 0, cartTotal: 0 });
    }

    // 更新TabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      if (tabBar.data.selected !== 1) tabBar.setData({ selected: 1 });
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
    this.setData({ currentCategory: category }, () => {
      this.filterBreadList();
    });
  },

  // 前端分类筛选：商品总量 < 100，全量加载到前端后本地筛选
  // 原因：避免了每次切换分类都请求后端（减少网络延迟，用户体验更流畅）
  // 代价：商品量增大到数千时需改为后端筛选 + 分页
  // 降级：如果 loadProducts 失败，用户看到空列表而非卡在加载中
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
    const cart = { ...this.data.cart };
    cart[id] = (cart[id] || 0) + 1;
    this.updateCart(cart);
  },

  // 减少购物车数量
  minusFromCart(e) {
    const id = e.currentTarget.dataset.id;
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
    this.setData({ cart, cartCount: count, cartTotal: parseFloat(total.toFixed(2)) });
  },

  // 供商品详情页调用的批量加购（跨页面共享购物车）
  addProductToCart(productId, quantity) {
    const cart = { ...this.data.cart };
    cart[productId] = (cart[productId] || 0) + quantity;
    this.updateCart(cart);
  },

  // 跳转商品详情页
  navigateToProductDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/product-detail/product-detail?id=' + id });
  },

  // 去结算（缓存购物车数据，确认支付时才创建订单）
  goToCheckout() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '请先选择商品', icon: 'none' });
      return;
    }

    const app = getApp();
    const { cart, cartTotal, store } = this.data;

    const items = [];
    for (const id in cart) {
      const bread = this.data.breadList.find(item => item.id == id);
      if (bread) {
        items.push({
          id: bread.id, name: bread.name, price: bread.price,
          quantity: cart[id], image: bread.image,
        });
      }
    }

    if (items.length === 0) {
      wx.showToast({ title: '商品数据异常', icon: 'none' });
      return;
    }

    // 缓存到全局，确认支付时才真正创建订单
    app.globalData.tempOrder = {
      items, totalPrice: cartTotal,
      storeId: store.id || 1, storeName: store.name,
      address: store.address || '珠海市高新区唐家湾镇香山路88号2栋1层101-10室',
    };
    // 注意：不在这里设 clearCartOnReturn，等支付成功后再清空

    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' });
  },
});