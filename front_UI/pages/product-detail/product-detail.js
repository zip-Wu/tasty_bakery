// pages/product-detail/product-detail.js
const app = getApp();

// 关店文案：原因 + 恢复时间先拼成一句，两种容器都基于它
function buildClosedHead(data) {
  const reason = data.closeReason || '';
  const resume = data.resumeAt || '';
  if (reason && resume) return `${reason}，${resume}开始接单`;
  if (reason) return reason;
  if (resume) return `${resume}开始接单`;
  return '';
}

// 顶部副标题：商家没填说明时退回营业时间，至少让顾客知道门店营业时段
function buildClosedSubText(data) {
  if (data.open) return '';
  return buildClosedHead(data) || `营业时间 ${data.hours || '请咨询门店'}`;
}

// 说明弹窗正文：showModal 的 content 不解析 \n，只能拼成一句带标点的话
function buildClosedDetailText(data) {
  const head = buildClosedHead(data);
  const hours = data.hours || '请咨询门店';
  return head ? `${head}。营业时间：${hours}` : `营业时间：${hours}`;
}

Page({
  data: {
    product: {
      id: 0, name: '', price: 0, image: '', category: '',
      description: '', monthlySales: 0
    },
    gallery: [],  // 轮播图数组
    qty: 0,
    subtotal: '0.00',  // 预计算 qty * price，WXML 不支持 .toFixed()
    storeClosed: false,
    storeHours: '',
    storeSubText: '',
    storeDetailText: '',
    storeResumeAt: '',
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '商品ID缺失', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.loadProduct(options.id);
    this.checkStoreStatus();
  },

  checkStoreStatus() {
    app.request({
      url: '/api/store/status',
    }).then(data => {
      this.setData({
        storeClosed: !data.open,
        storeHours: data.hours || '',
        storeSubText: buildClosedSubText(data),
        storeDetailText: buildClosedDetailText(data),
        storeResumeAt: data.resumeAt || '',
      });
    }).catch(err => {
      console.error('[product-detail] 查询门店状态失败:', err);
    });
  },

  // 关店态底部「查看说明」：把原因、恢复时间、营业时间一次说完，比一闪而过的 toast 清楚
  showClosedDetail() {
    wx.showModal({
      title: '本周预定已结束',
      content: this.data.storeDetailText || '店家暂停接单中',
      showCancel: false,
      confirmText: '知道了',
    });
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
    if (this.data.storeClosed) {
      wx.showToast({ title: '本周预定已结束', icon: 'none' });
      return;
    }
    this.setData({ qty: this.data.qty + 1 });
    this._calcSubtotal();
  },
  minusQty() {
    if (this.data.storeClosed) {
      wx.showToast({ title: '本周预定已结束', icon: 'none' });
      return;
    }
    if (this.data.qty > 0) {
      this.setData({ qty: this.data.qty - 1 });
      this._calcSubtotal();
    }
  },

  // 加入购物车
  addToCart() {
    if (this.data.storeClosed) {
      wx.showToast({ title: '本周预定已结束，请稍后再来', icon: 'none' });
      return;
    }
    if (this.data.product.stock <= 0) {
      wx.showToast({ title: '该商品已售罄', icon: 'none' });
      return;
    }
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
