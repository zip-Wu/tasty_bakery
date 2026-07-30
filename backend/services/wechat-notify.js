/**
 * 微信订阅消息推送服务
 *
 * 用于商家标记"待取餐"后向顾客发送取餐提醒。
 *
 * 模板 ID: Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4
 * 模板字段: date3(点餐时间) / thing6(商品名) / thing7(温馨提醒) /
 *           phone_number32(联系电话) / character_string12(取餐编号)
 *
 * 前置条件:
 *   1. 小程序后台已选用该订阅消息模板
 *   2. 顾客在前端已调用 wx.requestSubscribeMessage 授权一次性订阅
 *   3. 环境变量 WX_APPID / WX_APPSECRET 已配置
 *
 * 注意: 顾客未授权时微信会返回 errcode=43101，sendSubscribeMessage
 * 会返回 {success:false,reason:'not_authorized'} 而非抛异常。
 */

const https = require('https');

const APP_ID = process.env.WX_APP_ID;
const APP_SECRET = process.env.WX_APP_SECRET;
const TEMPLATE_ID = 'Haa7KsPUk2pnHUS3akqjZ5J8TQgKxoHu5Yq088bdRE4';

// ========== access_token 内存缓存 ==========

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 300_000) {
    return cachedToken;
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`;
  const data = await httpsGet(url);
  const result = JSON.parse(data);
  if (!result.access_token) {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(result));
  }
  cachedToken = result.access_token;
  cachedTokenExpiresAt = Date.now() + result.expires_in * 1000;
  console.log(`[wechat-notify] access_token 已刷新, ${result.expires_in}s 后过期`);
  return cachedToken;
}

// ========== 发送订阅消息 ==========

/**
 * 发送一次性订阅消息
 * @param {string} openid 接收者 openid
 * @param {object} data 模板字段 (date3/thing6/thing7/phone_number32/character_string12)
 * @param {string} page 点击通知后跳转的小程序页面路径
 * @returns {Promise<{success:boolean, reason?:string, errmsg?:string}>}
 */
async function sendSubscribeMessage(openid, data, page) {
  try {
    const token = await getAccessToken();
    const body = JSON.stringify({
      touser: openid,
      template_id: TEMPLATE_ID,
      page: page || '',
      data,
    });

    const url = `/cgi-bin/message/subscribe/send?access_token=${token}`;
    const resp = await httpsPost('api.weixin.qq.com', url, body);
    const result = JSON.parse(resp);

    if (result.errcode === 0) {
      console.log(`[wechat-notify] 发送成功 to=${openid.slice(0, 8)}...`);
      return { success: true };
    }

    // 43101: 用户拒绝订阅 / 一次性订阅配额已用完 / 从未授权
    if (result.errcode === 43101) {
      console.warn(`[wechat-notify] 用户未授权: ${result.errmsg}`);
      return { success: false, reason: 'not_authorized', errmsg: result.errmsg };
    }

    console.error(`[wechat-notify] API 错误: ${result.errcode} ${result.errmsg}`);
    return { success: false, reason: 'api_error', errmsg: result.errmsg };
  } catch (err) {
    console.error('[wechat-notify] 异常:', err.message);
    return { success: false, reason: 'network_error', errmsg: err.message };
  }
}

// ========== HTTPS 小工具 ==========

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { getAccessToken, sendSubscribeMessage };
