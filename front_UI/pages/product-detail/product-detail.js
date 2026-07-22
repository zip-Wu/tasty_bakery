// pages/product-detail/product-detail.js
const app = getApp();

Page({
  data: {
    product: {
      id: 0, name: '', price: 0, image: '', category: '',
      description: '', monthlySales: 0
    },
    gallery: [],  // 轮播图数组
    qty: 0,
    subtotal: '0.00',  // 预计算 qty * price，WXML 不支持 .toFixed()
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '商品ID缺失', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.loadProduct(options.id);
  },

  // 重新计算小计（WXML 不能调 .toFixed，必须在 JS 层算好）
  _calcSubtotal() {
    const { qty, product } = this.data;
    this.setData({ subtotal: (qty * product.price).toFixed(2) });
  },

  loadProduct(id) {
    wx.showLoading({ title: '加载中...' });
    const that = this;

    app.request({
      url: '/api/products/' + id,
      method: 'GET',
    }).then(data => {
      wx.hideLoading();
      if (!data || !data.id) {
        wx.showToast({ title: '商品不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }

      // gallery 可能是 JSON 字符串或已解析的数组
      let gallery = [];
      if (data.gallery) {
        if (Array.isArray(data.gallery)) {
          gallery = data.gallery;
        } else if (typeof data.gallery === 'string' && data.gallery.startsWith('[')) {
          try { gallery = JSON.parse(data.gallery); } catch (_) {}
        }
      }
      // 如果图库为空，用主图 fallback
      if (gallery.length === 0 && data.image) {
        gallery = [data.image];
      }

      that.setData({
        product: data,
        gallery,
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('[product-detail] 加载失败:', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    });
  },

  // 数量加减
  addQty() {
    this.setData({ qty: this.data.qty + 1 });
    this._calcSubtotal();
  },
  minusQty() {
    if (this.data.qty > 0) {
      this.setData({ qty: this.data.qty - 1 });
      this._calcSubtotal();
    }
  },

  // 加入购物车
  addToCart() {
    const { qty, product } = this.data;
    if (qty <= 0) return;

    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && typeof prevPage.addProductToCart === 'function') {
      prevPage.addProductToCart(product.id, qty);
    } else {
      wx.setStorageSync('pendingCartAdd', { id: product.id, quantity: qty });
    }

    wx.showToast({ title: '已加入购物车', icon: 'success', duration: 1000 });
    setTimeout(() => wx.navigateBack(), 1000);
  },
});
