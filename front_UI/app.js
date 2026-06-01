// app.js
// ===== 上线时只需要改这一个地址 =====
// 本地调试用 localhost，上线时改成服务器地址（如 https://api.duntunmantou.com）
// 微信开发者工具 → 详情 → 不校验合法域名（勾选），即可在开发者工具中访问 localhost
const API_BASE = 'http://localhost:3000';

App({
  onLaunch() {
    // 检查登录状态
    const userId = wx.getStorageSync('userId');
    if (userId) {
      // 自动登录
      this.autoLogin(userId);
    }
  },

  globalData: {
    userId: null,
    userInfo: null,
    selectedStore: null,
    apiBase: API_BASE  // 供其他页面调用
  },

  // 自动登录（从本地存储恢复）
  autoLogin(userId) {
    wx.request({
      url: API_BASE + '/api/user/' + userId,
      success: (res) => {
        if (res.data.success) {
          this.globalData.userId = userId;
          this.globalData.userInfo = res.data.data;
        }
      }
    });
  },

  // 微信登录
  login(callback) {
    wx.login({
      success: (res) => {
        // 模拟登录（实际需要把 code 发到后端换 openId）
        wx.request({
          url: API_BASE + '/api/login',
          method: 'POST',
          data: {
            code: res.code,
            nickname: '面包爱好者',
            avatar: 'https://picsum.photos/200/200?random=' + Date.now()
          },
          success: (loginRes) => {
            if (loginRes.data.success) {
              this.globalData.userId = loginRes.data.data.id;
              this.globalData.userInfo = loginRes.data.data;
              wx.setStorageSync('userId', loginRes.data.data.id);
              if (callback) callback(loginRes.data.data);
            }
          }
        });
      }
    });
  },

  // 封装的请求方法
  request(options) {
    return new Promise((resolve, reject) => {
      const app = getApp();
      wx.request({
        url: app.globalData.apiBase + options.url,
        method: options.method || 'GET',
        data: options.data,
        success: (res) => {
          if (res.data.success) {
            resolve(res.data.data);
          } else {
            wx.showToast({ title: res.data.message || '请求失败', icon: 'none' });
            reject(res.data);
          }
        },
        fail: (err) => {
          wx.showToast({ title: '网络错误', icon: 'none' });
          reject(err);
        }
      });
    });
  }
});