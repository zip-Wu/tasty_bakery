// pages/index/index.js

// 虚拟分类「近期新品」：与后端分类并列展示（排在「暂无库存」上面），
// is_new 窗口内出现、过期自动消失，逻辑见 filterBreadList
const NEW_CATEGORY = '🆕 近期新品';

Page({
  data: {
    // 分类数据（从后端动态加载，初始仅「全部」；「暂无库存」由 filterBreadList 动态追加）
    categories: [],
    baseCategories: [],
    currentCategory: null,

    // 商品列表滚动位置（切分类时重置为 0）
    scrollTop: 0,

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
      name: '大力馒头铺·信息港店',
      address: '珠海市高新区唐家湾镇香山路88号2栋1层101-10室',
      distance: ''
    },

    // 门店开关状态
    storeClosed: false,
    storeNotice: '',
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
    this.checkStoreStatus();
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
        }).catch(() => {
          // 请求后端失败（网络/服务端错误）
          wx.showToast({ title: '距离计算失败，请稍后重试', icon: 'none' });
        });
      },
      fail: () => {
        // 用户拒绝授权 或 系统定位服务关闭 → 弹 Modal 引导去设置
        wx.showModal({
          title: '无法获取位置',
          content: '需要位置权限来计算门店距离，请去「设置」中开启定位权限',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.openSetting();
            }
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
      // 仅更新 baseCategories；categories（含「暂无库存」）由 filterBreadList 统一管理
      this.setData({ baseCategories: data }, () => {
        this.filterBreadList();
      });
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
      // 预初始化 _show + 按库存排序：有库存在前、无库存在后（sort 稳定，组内原序不变）
      data.forEach(item => { item._show = true; });
      data.sort((a, b) => {
        const aOut = a.stock <= 0 ? 1 : 0;
        const bOut = b.stock <= 0 ? 1 : 0;
        return aOut - bOut;
      });
      // 同时设 breadList 和 filteredBreadList，避免异步回调延迟导致首帧空白
      this.setData({ breadList: data, filteredBreadList: data }, () => {
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

    // 售罄/库存不足返回：精确移除购物车里那件商品（其余保留，顾客可重新加购）
    if (app.globalData.removeCartItemId) {
      const rid = app.globalData.removeCartItemId;
      app.globalData.removeCartItemId = null;
      const cart = { ...this.data.cart };
      if (cart[rid]) {
        delete cart[rid];
        this.updateCart(cart);
        wx.showToast({ title: '已移除售罄商品，请重新选择', icon: 'none' });
      }
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
    this.checkStoreStatus();
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    // scrollTop 在 0 和 0.1 之间 toggle：保证每次值不同，微信才会触发滚动；
    // 0.1rpx 偏差肉眼不可见，配合 scroll-with-animation 平滑过渡
    this.setData({ currentCategory: category, scrollTop: this.data.scrollTop === 0 ? 0.1 : 0 });
    this.filterBreadList();
  },

  // 前端分类筛选：不再创建新数组替换 filteredBreadList，改为给每个 item 打 _show 标记
  // 然后用 CSS display:none 显隐，DOM 节点始终不销毁 → 图片不重载
  // 「暂无库存」为虚拟分类：库存 ≤ 0 的商品从原分类中移出，统一归入此分类
  filterBreadList() {
    const { breadList, baseCategories, currentCategory } = this.data;

    // 虚拟分类的成员判定：新品 = is_new（后端按 created_at 窗口计算）；暂无库存 = stock <= 0
    const hasNew = breadList.some(item => item.is_new);
    const hasOutOfStock = breadList.some(item => item.stock <= 0);
    // 第一分类行为等同"全部"：默认选中、显示所有商品
    const showAllCategory = baseCategories.length > 0 ? baseCategories[0] : null;

    // 边界：用户正停在「暂无库存」/「近期新品」，但该分类已无成员 → 自动切回第一分类
    let effectiveCategory = currentCategory;
    if ((currentCategory === '暂无库存' && !hasOutOfStock) ||
        (currentCategory === NEW_CATEGORY && !hasNew)) {
      effectiveCategory = showAllCategory;
    }
    // 首次加载：当前无分类时默认选中第一分类（等同显示全部）
    if (effectiveCategory === null) {
      effectiveCategory = showAllCategory;
    }

    // 打 _show 标记（排序已在 loadProducts 完成，这里仅控制显隐）
    breadList.forEach(item => {
      if (effectiveCategory === NEW_CATEGORY) {
        item._show = !!item.is_new;
      } else if (effectiveCategory === '暂无库存') {
        item._show = item.stock <= 0;
      } else if (effectiveCategory === null || effectiveCategory === showAllCategory) {
        item._show = true;  // 未选分类 / 第一分类：显示全部
      } else {
        item._show = item.stock > 0 && item.category === effectiveCategory;
      }
    });

    // 动态追加虚拟分类：新品在前、暂无库存在后（真实分类都排在它们前面）
    const virtualCategories = [];
    if (hasNew) virtualCategories.push(NEW_CATEGORY);
    if (hasOutOfStock) virtualCategories.push('暂无库存');
    const rawCategories = [...baseCategories, ...virtualCategories];

    // 按 | 拆分，供侧栏多行显示
    const categoryLines = rawCategories.map(c => c.split('|'));

    this.setData({
      filteredBreadList: [...breadList],
      categories: rawCategories,
      categoryLines,
      currentCategory: effectiveCategory
    });
  },

  // 加入购物车（上限 = 当前库存，防止单用户超买）
  addToCart(e) {
    const id = e.currentTarget.dataset.id;
    const bread = this.data.breadList.find(item => item.id == id);
    if (bread && bread.stock <= 0) {
      wx.showToast({ title: '该商品已售罄', icon: 'none' });
      return;
    }
    const cart = { ...this.data.cart };
    const next = (cart[id] || 0) + 1;
    if (bread && next > bread.stock) {
      wx.showToast({ title: '已达库存上限', icon: 'none' });
      return;
    }
    cart[id] = next;
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

  // 供商品详情页调用的批量加购（跨页面共享购物车，同样受库存上限约束）
  addProductToCart(productId, quantity) {
    const bread = this.data.breadList.find(item => item.id == productId);
    if (bread && bread.stock <= 0) {
      wx.showToast({ title: '该商品已售罄', icon: 'none' });
      return;
    }
    const cart = { ...this.data.cart };
    const next = (cart[productId] || 0) + quantity;
    if (bread && next > bread.stock) {
      wx.showToast({ title: '已达库存上限', icon: 'none' });
      return;
    }
    cart[productId] = next;
    this.updateCart(cart);
  },

  // 跳转商品详情页
  navigateToProductDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/product-detail/product-detail?id=' + id });
  },

  // 去结算（缓存购物车数据，确认支付时才创建订单）
  goToCheckout() {
    if (this.data.storeClosed) {
      wx.showToast({ title: '店家暂未开放预定，请稍后再来', icon: 'none' });
      return;
    }
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

  // ========== 门店开关状态检查 ==========
  checkStoreStatus() {
    const app = getApp();
    console.log('[index] 查询门店状态...');
    app.request({
      url: '/api/store/status',
    }).then(data => {
      console.log('[index] 门店状态:', data);
      this.setData({
        storeClosed: !data.open,
        storeNotice: data.notice || '',
        storeHours: data.hours || ''
      });
    }).catch(err => {
      console.error('[index] 查询门店状态失败:', err);
    });
  },
});