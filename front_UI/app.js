// app.js
// ===== 微信云托管配置 =====
// 部署方式：微信云托管 callContainer 私有协议，无需域名备案
const CLOUD_ENV = 'dali-bakery-api-d9frevvce1335562';
const SERVICE_NAME = 'dali-bakery-api';

App({
  onLaunch() {
    wx.cloud.init({ env: CLOUD_ENV });

    // 生成/读取设备唯一标识，区分不同用户
    // 生产环境：后端用 wx.login 的 code 换 openid 替代 deviceId
    var deviceId = wx.getStorageSync('deviceId');
    if (!deviceId) {
      deviceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      wx.setStorageSync('deviceId', deviceId);
    }

    // 恢复登录状态
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

  // 恢复登录（从本地缓存）
  autoLogin(userId) {
    this.request({
      url: '/api/user/' + userId,
    }).then(data => {
      this.globalData.userId = userId;
      this.globalData.userInfo = data;
    }).catch(() => {});
  },

  // 静默登录（首次或缓存被清后触发，无需用户任何操作）
  login(callback) {
    var deviceId = wx.getStorageSync('deviceId');
    wx.login({
      success: (res) => {
        this.request({
          url: '/api/login',
          method: 'POST',
          data: { code: res.code, deviceId: deviceId },
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
            wx.showToast({ title: (res.data && res.data.message) || '请求失败', icon: 'none' });
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
