// app.js
// ===== 微信云托管配置 =====
// 部署方式：微信云托管 callContainer 私有协议，无需域名备案
const CLOUD_ENV = 'dali-bakery-api-d9frevvce1335562';
const SERVICE_NAME = 'dali-bakery-api';

App({
  onLaunch() {
    // 初始化云环境（callContainer 依赖此调用）
    wx.cloud.init({ env: CLOUD_ENV });

    // 检查登录状态
    const userId = wx.getStorageSync('userId');
    if (userId) {
      this.autoLogin(userId);
    }
  },

  globalData: {
    userId: null,
    userInfo: null,
    selectedStore: null,
  },

  // 自动登录（从本地存储恢复）
  autoLogin(userId) {
    this.request({
      url: '/api/user/' + userId,
    }).then(data => {
      this.globalData.userId = userId;
      this.globalData.userInfo = data;
    }).catch(() => {});
  },

  // 微信登录
  login(callback) {
    wx.login({
      success: (res) => {
        this.request({
          url: '/api/login',
          method: 'POST',
          data: {
            code: res.code,
            nickname: '面包爱好者',
            avatar: 'https://picsum.photos/200/200?random=' + Date.now()
          },
        }).then(data => {
          this.globalData.userId = data.id;
          this.globalData.userInfo = data;
          wx.setStorageSync('userId', data.id);
          if (callback) callback(data);
        }).catch(() => {});
      }
    });
  },

  // 统一请求方法 — 通过微信云托管 callContainer 私有协议
  // options: { url, method?, data?, header? }
  // 返回 Promise，resolve 的是 res.data.data（即 {success:true, data:...} 中的 data 部分）
  request(options) {
    return new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV },
        path: options.url,
        header: {
          'X-WX-SERVICE': SERVICE_NAME,
          'Content-Type': 'application/json',
          ...(options.header || {})
        },
        method: options.method || 'GET',
        data: options.data,
        success: (res) => {
          if (res.data && res.data.success) {
            resolve(res.data.data);
          } else {
            wx.showToast({
              title: (res.data && res.data.message) || '请求失败',
              icon: 'none'
            });
            reject(res.data);
          }
        },
        fail: (err) => {
          console.error('callContainer failed:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
          reject(err);
        }
      });
    });
  }
});
