/**
 * 微信支付 API v3 服务模块
 *
 * 需要配置的环境变量（全部必填）：
 *   WX_APPID 或 WX_APP_ID — 小程序 AppID（两者皆可，后者与 auth.js 保持一致）
 *   WX_PAY_MCHID     — 微信支付商户号
 *   WX_PAY_SERIAL_NO — 商户 API 证书序列号
 *   WX_PAY_PRIVATE_KEY — 商户 API 私钥（PEM 格式，\n 表示换行）
 *   WX_PAY_API_V3_KEY  — API v3 密钥（32 位，用于回调验签和 AES 解密）
 *   WX_PAY_NOTIFY_URL  — 支付结果回调地址，例如 https://your-domain.com/api/pay/notify
 *
 * 使用方式：
 *   const { createJsapiOrder, onPaymentNotify } = require('../services/wechat-pay');
 */
const crypto = require('crypto');
const https = require('https');

// ----- 配置 -----
const WXPAY_HOST = 'api.mch.weixin.qq.com';

const config = {
  // 兼容 auth.js 的 WX_APP_ID 命名，优先读 WX_APPID，没有则回退
  appid:         process.env.WX_APPID || process.env.WX_APP_ID,
  mchid:         process.env.WX_PAY_MCHID,
  serial_no:     process.env.WX_PAY_SERIAL_NO,
  private_key:   (process.env.WX_PAY_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  api_v3_key:    process.env.WX_PAY_API_V3_KEY,
  notify_url:    process.env.WX_PAY_NOTIFY_URL,
};

// 启动时校验
if (!config.appid || !config.mchid || !config.serial_no || !config.private_key || !config.api_v3_key || !config.notify_url) {
  console.warn('[微信支付] ⚠ 缺少必要环境变量，支付功能不可用。需要设置: WX_APPID(或 WX_APP_ID), WX_PAY_MCHID, WX_PAY_SERIAL_NO, WX_PAY_PRIVATE_KEY, WX_PAY_API_V3_KEY, WX_PAY_NOTIFY_URL');
} else {
  console.log(`[微信支付] 已配置商户号 ${config.mchid}`);
}

// ----- 工具函数 -----

function generateNonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

function generateTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * API v3 签名：base64(RSA-SHA256(method\nurl\ntimestamp\nnonce_str\nbody\n))
 */
function sign(method, url, timestamp, nonceStr, body) {
  const signStr = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr);
  signer.end();
  return signer.sign(config.private_key, 'base64');
}

/**
 * 生成请求头 Authorization Token
 */
function authorization(method, url, body) {
  const nonceStr = generateNonceStr();
  const timestamp = generateTimestamp();
  const signature = sign(method, url, timestamp, nonceStr, body);
  return {
    nonceStr,
    timestamp,
    Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${config.serial_no}",signature="${signature}"`,
  };
}

/**
 * 发起 WeChat Pay API v3 请求
 */
function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const auth = authorization(method, path, bodyStr);

    const options = {
      hostname: WXPAY_HOST,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'Authorization': auth.Authorization,
        'User-Agent': 'DaliMantou/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject({ status: res.statusCode, ...json });
          }
        } catch (e) {
          reject({ status: res.statusCode, message: data.substring(0, 500) });
        }
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject({ message: '微信支付 API 请求超时' });
    });

    req.on('error', (e) => reject({ message: '微信支付请求失败: ' + e.message }));
    req.write(bodyStr);
    req.end();
  });
}

// ----- 对外 API -----

/**
 * JSAPI 下单 — 微信内小程序支付
 *
 * @param {Object} params
 * @param {string} params.outTradeNo 商户订单号
 * @param {number} params.total       金额（分）
 * @param {string} params.description 商品描述
 * @param {string} params.openid      用户 openid
 * @returns {Object} { prepay_id, ... }
 */
async function createJsapiOrder({ outTradeNo, total, description, openid }) {
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error('支付金额无效');
  }
  if (!outTradeNo || !/^[a-zA-Z0-9_-]{6,64}$/.test(outTradeNo)) {
    throw new Error('订单号格式无效');
  }

  const body = {
    appid: config.appid,
    mchid: config.mchid,
    description: description.substring(0, 127),
    out_trade_no: outTradeNo,
    notify_url: config.notify_url,
    amount: { total, currency: 'CNY' },
    payer: { openid },
  };

  const result = await apiRequest('POST', '/v3/pay/transactions/jsapi', body);
  return result; // 包含 prepay_id
}

/**
 * 生成前端 wx.requestPayment 需要的签名
 *
 * @param {string} prepayId 预支付交易会话标识
 * @returns {{ timeStamp, nonceStr, package, signType, paySign }}
 */
function generatePrepaySign(prepayId) {
  const appId = config.appid;
  const timeStamp = String(generateTimestamp());
  const nonceStr = generateNonceStr();
  const pkg = `prepay_id=${prepayId}`;

  const signStr = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr);
  signer.end();
  const paySign = signer.sign(config.private_key, 'base64');

  return {
    timeStamp,
    nonceStr,
    package: pkg,
    signType: 'RSA',
    paySign,
  };
}

/**
 * 验证支付回调签名（微信支付 API v3）
 *
 * 用平台证书公钥对 wechatpay-signature 做 RSA-SHA256 验签。
 * 签名串：timestamp + "\n" + nonce + "\n" + rawBody + "\n"
 *
 * WX_PAY_PLATFORM_CERT — 平台证书 PEM，可从商户平台下载或通过 /v3/certificates 获取。
 *   不配时仅检查字段存在（开发/测试），生产环境必须配。
 */
function verifyNotifySign(headers, rawBody) {
  const {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-signature': signature,
  } = headers;

  if (!timestamp || !nonce || !signature) {
    console.error('[pay-notify] 验签失败：缺少必要的 wechatpay-* 头部字段');
    return false;
  }

  // 支付未启用（isRealPay=false）时不会收到真实回调，仅检查字段存在即可
  const platformCert = (process.env.WX_PAY_PLATFORM_CERT || '').replace(/\\n/g, '\n');
  if (!platformCert) {
    // 真实支付模式下缺少平台证书 = 致命错误，拒绝回调
    if (config.mchid) {
      console.error('[pay-notify] 致命错误：真实支付模式下 WX_PAY_PLATFORM_CERT 未配置，拒绝回调');
      return false;
    }
    // 模拟支付模式：微信不会真回调，静默拒绝
    return false;
  }

  const signStr = `${timestamp}\n${nonce}\n${rawBody}\n`;

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signStr, 'utf8');
    verifier.end();
    return verifier.verify(platformCert, signature, 'base64');
  } catch (err) {
    console.error('[pay-notify] RSA 验签异常:', err.message);
    return false;
  }
}

/**
 * 解密回调中的加密数据
 * @param {Object} resource 回调中的 resource 字段
 * @returns {Object} 解密后的 JSON
 */
function decryptNotifyResource(resource) {
  const { nonce, ciphertext, associated_data } = resource;
  const key = Buffer.from(config.api_v3_key, 'utf8');
  const authTag = Buffer.from(ciphertext, 'base64').slice(-16);
  const data = Buffer.from(ciphertext, 'base64').slice(0, -16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associated_data || '', 'utf8'));

  let decrypted = decipher.update(data, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

module.exports = {
  createJsapiOrder,
  generatePrepaySign,
  verifyNotifySign,
  decryptNotifyResource,
  config, // 暴露给调用方检查
};
