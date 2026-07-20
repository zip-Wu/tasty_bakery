// app.js
// ===== 微信云托管配置 =====
// 部署方式：微信云托管 callContainer 私有协议，无需域名备案
// 云环境 ID 非机密信息（小程序编译后包含在代码包中）
const { CLOUD_ENV, SERVICE_NAME } = require('./config');

App({
  onLaunch() {
    wx.cloud.init({ env: CLOUD_ENV });

    // 确保每位访客都有身份（转化率 / 访客统计需要完整分母）
    const userId = wx.getStorageSync('userId');
    if (userId) {
      this.autoLogin(userId);
    } else {
      this.login();
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
    }).catch(err => {
      console.error('[autoLogin] 恢复登录失败:', err);
      // 缓存失效，重新静默登录
      wx.removeStorageSync('userId');
      this.globalData.userId = null;
      this.login();
    });
  },

  // 静默登录（首次或缓存被清后触发，无需用户任何操作）
  login(callback) {
    wx.login({
      success: (res) => {
        this.request({
          url: '/api/login',
          method: 'POST',
          data: { code: res.code },
        }).then(data => {
          this.globalData.userId = data.id;
          this.globalData.userInfo = data;
          wx.setStorageSync('userId', data.id);
          if (callback) callback(data);
        }).catch(err => { console.error('[login] 登录失败:', err); });
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
            console.error('[request] 业务错误:', options.url, res.data && res.data.message);
            reject(res.data);
          }
        },
        fail: (err) => {
          console.error('[request] 网络错误:', options.url, err);
          reject(err);
        }
      });
    });
  }
});
