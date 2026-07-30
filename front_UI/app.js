// app.js
// ===== 微信云托管配置 =====
// 部署方式：微信云托管 callContainer 私有协议，无需域名备案
// 云环境 ID 非机密信息（小程序编译后包含在代码包中）
const { CLOUD_ENV, SERVICE_NAME } = require('./config');

// ===== 全局分享注入 =====
// 拦截 Page() 构造函数，自动为所有页面注入转发 + 朋友圈分享能力
// 页面已自定义 onShareAppMessage / onShareTimeline 的不覆盖
const _Page = Page;
Page = function (options) {
  if (!options.onShareAppMessage) {
    options.onShareAppMessage = function () {
      const app = getApp();
      return {
        title: '大力馒头（纯手工馒头·健康无添加·每日现做现蒸）',
        path: '/pages/home/home',
        imageUrl: app._shareImageUrl || ''
      };
    };
  }
  if (!options.onShareTimeline) {
    options.onShareTimeline = function () {
      return { title: '大力馒头（纯手工馒头·健康无添加·每日现做现蒸）' };
    };
  }
  // 每个页面显示时都激活转发 + 朋友圈按钮
  const _onShow = options.onShow;
  options.onShow = function () {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    if (_onShow) _onShow.call(this);
  };
  return _Page(options);
};

App({
  onLaunch() {
    wx.cloud.init({ env: CLOUD_ENV });

    // 预加载分享配图（首次上传到云存储，后续走缓存）
    this.initShareImage();

    // 确保每位访客都有身份（转化率 / 访客统计需要完整分母）
    const userId = wx.getStorageSync('userId');
    if (userId) {
      this.autoLogin(userId);
    } else {
      this.login();
    }
  },

  // 首次启动时把 banner.png 上传到云存储，后续分享用 HTTPS URL 做预览图
  initShareImage() {
    const that = this;
    const cachedUrl = wx.getStorageSync('share_banner_tempurl');
    if (cachedUrl) { that._shareImageUrl = cachedUrl; }
    const fileId = wx.getStorageSync('share_banner_fileid');
    if (fileId) {
      wx.cloud.getTempFileURL({ fileList: [fileId] }).then(res => {
        if (res.fileList[0] && res.fileList[0].tempFileURL) {
          that._shareImageUrl = res.fileList[0].tempFileURL;
          wx.setStorageSync('share_banner_tempurl', that._shareImageUrl);
        }
      }).catch(() => {});
      return;
    }
    // 首次：从代码包复制 banner.png → 上传云存储
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: '/images/png/banner.png',
      success(readRes) {
        const p = wx.env.USER_DATA_PATH + '/banner_share.png';
        fs.writeFile({ filePath: p, data: readRes.data, success() {
          wx.cloud.uploadFile({ cloudPath: 'share/banner.png', filePath: p })
            .then(r => { wx.setStorageSync('share_banner_fileid', r.fileID); return r.fileID; })
            .then(fid => wx.cloud.getTempFileURL({ fileList: [fid] }))
            .then(t => {
              if (t.fileList[0] && t.fileList[0].tempFileURL) {
                that._shareImageUrl = t.fileList[0].tempFileURL;
                wx.setStorageSync('share_banner_tempurl', that._shareImageUrl);
              }
            }).catch(() => {});
        }});
      }
    });
  },

  globalData: {
    userId: null,
    userInfo: null,
    selectedStore: null,
    clearCartOnReturn: false,
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
