/**
 * 微信云托管支付服务模块
 *
 * 使用微信云托管封装的微信支付接口（V2 风格），云托管作为服务商，商户作为子商户接入。
 * 与标准微信支付 V3 的关键区别：
 *   - 免证书管理、免 RSA 签名、免公网回调地址
 *   - 下单接口返回的 payment 对象可直接传给小程序端 wx.requestPayment
 *   - 回调由云托管内部路由，无需验证签名和解密
 *
 * 前置条件（在微信云托管控制台操作）：
 *   1. 设置 → 其他设置 ��� 微信支付配置 → 绑定商户号
 *   2. 开启「开放接口服务」
 *
 * 环境变量（全部必填）：
 *   WX_PAY_SUB_MCHID  — 微信支付子商户号（即你的商户号）
 *   CLOUD_ENV_ID      — 云托管环境 ID
 *   CLOUD_SERVICE_NAME — 云托管服务名（用于接收支付回调）
 *
 * 官方文档：
 *   统一下单：https://developers.weixin.qq.com/minigame/dev/wxcloudrun/src/development/pay/order/unified
 *   查询订单：https://developers.weixin.qq.com/minigame/dev/wxcloudrun/src/development/pay/order/query
 *   结果回调：https://developers.weixin.qq.com/minigame/dev/wxcloudrun/src/development/pay/callback/index
 */

const http = require('http');

// ========== 配置 ==========

// 云托管环境和容器名——固定值，来自 front_UI/config.js，非环境变量
const CLOUD_ENV_ID = 'dali-backern-api-d0es660181ffbe4';
const CLOUD_SERVICE_NAME = 'dali-bakery-api';

const config = {
  sub_mch_id: process.env.WX_PAY_SUB_MCHID,
  env_id: CLOUD_ENV_ID,
  service_name: CLOUD_SERVICE_NAME,
};

const isConfigured = !!config.sub_mch_id;

// ========== 启动检查 ==========

if (!isConfigured) {
  console.warn('[微信支付] ⚠ 缺少 WX_PAY_SUB_MCHID，支付功能不可用');
  console.warn('[微信支付]   请在云托管控制台绑定商户号后，添加 WX_PAY_SUB_MCHID=1115646657 环境变量');
} else {
  console.log(`[微信支付] ✅ 子商户号 ${config.sub_mch_id}，使用云托管封装的微信支付接口`);
}

// 云托管内部 API 地址（HTTP，非公网）
const PAY_API_HOST = 'api.weixin.qq.com';

// ========== 工具函数 ==========

/**
 * 调用云托管微信支付开放接口
 * 请求走微信内部网络，无需额外鉴权（云托管运行环境自动处理）
 */
function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);

    const options = {
      hostname: PAY_API_HOST,
      port: 80,
      path: `/_/pay${apiPath}`,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'User-Agent': 'DaliMantou-CloudBase/1.0',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject({ message: `解析微信支付响应失败: ${data.substring(0, 200)}` });
        }
      });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject({ message: '微信支付 API 请求超时' });
    });

    req.on('error', (e) => reject({ message: '微信支付请求失败: ' + e.message }));
    req.write(bodyStr);
    req.end();
  });
}

// ========== 对外 API ==========

/**
 * JSAPI 统一下单 — 生成预支付交易单
 *
 * @param {Object} params
 * @param {string} params.outTradeNo 商户订单号（6-32 字符，字母数字 + _-）
 * @param {number} params.total      金额（分）
 * @param {string} params.description 商品描述（≤127 字节）
 * @param {string} params.openid     用户 openid
 * @returns {Object} respdata，含 .payment 字段直接给 wx.requestPayment 使用
 */
async function createJsapiOrder({ outTradeNo, total, description, openid }) {
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error('支付金额无效');
  }
  if (!outTradeNo || !/^[a-zA-Z0-9_\-]{6,32}$/.test(outTradeNo)) {
    throw new Error('订单号格式无效');
  }

  const body = {
    body: description.substring(0, 127),
    openid: openid,
    out_trade_no: outTradeNo,
    sub_mch_id: config.sub_mch_id,
    total_fee: total,
    env_id: config.env_id,
    callback_type: 2, // 云托管（非云函数）
    spbill_create_ip: '127.0.0.1',
    container: {
      service: config.service_name,
      path: '/api/pay/notify',
    },
  };

  const result = await apiRequest('POST', '/unifiedOrder', body);

  // 云托管封装层统一返回: { errcode: 0, errmsg: "ok", respdata: {...} }
  if (result.errcode !== 0) {
    throw new Error(`统一下单失败: ${result.errmsg || JSON.stringify(result)}`);
  }

  const respdata = result.respdata;
  if (!respdata) {
    throw new Error('统一下单失败: respdata 为空');
  }

  // 通信标识和业务标识分开检查（遵循微信支付 V2 约定）
  if (respdata.return_code !== 'SUCCESS') {
    throw new Error(`统一下单通信失败: ${respdata.return_msg || '未知'}`);
  }
  if (respdata.result_code !== 'SUCCESS') {
    throw new Error(`统一下单业务失败: ${respdata.err_code_des || respdata.err_code || '未知'}`);
  }

  console.log(`[支付] 统一下单成功: order_no=${outTradeNo} prepay_id=${respdata.prepay_id}`);
  return respdata;
}

/**
 * 查询订单状态
 *
 * @param {string} outTradeNo 商户订单号
 * @returns {Object} respdata，含 trade_state 字段
 */
async function queryOrder(outTradeNo) {
  const body = {
    out_trade_no: outTradeNo,
    sub_mch_id: config.sub_mch_id,
  };

  const result = await apiRequest('POST', '/queryorder', body);

  if (result.errcode !== 0) {
    throw new Error(`查询订单失败: ${result.errmsg || JSON.stringify(result)}`);
  }

  const respdata = result.respdata;
  if (!respdata) {
    throw new Error('查询订单失败: respdata 为空');
  }

  return respdata;
}

/**
 * 申请退款
 *
 * @param {Object} params
 * @param {string} params.outTradeNo   原支付商户订单号
 * @param {string} params.outRefundNo  商户退款单号（唯一，建议 R + 前缀）
 * @param {number} params.totalFee     原订单金额（分）
 * @param {number} params.refundFee    退款金额（分），当前只支持全额退款
 * @param {string} params.refundDesc   退款原因（≤80 字符）
 * @returns {Object} respdata，含 refund_id 微信退款单号
 */
async function refund({ outTradeNo, outRefundNo, totalFee, refundFee, refundDesc }) {
  if (!Number.isInteger(refundFee) || refundFee <= 0) {
    throw new Error('退款金额无效');
  }

  const body = {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    sub_mch_id: config.sub_mch_id,
    total_fee: totalFee,
    refund_fee: refundFee,
    refund_desc: (refundDesc || '用户申请退款').substring(0, 80),
    env_id: config.env_id,
    callback_type: 2,
    container: {
      service: config.service_name,
      path: '/api/orders/refund/notify',
    },
  };

  const result = await apiRequest('POST', '/refund', body);

  if (result.errcode !== 0) {
    throw new Error(`申请退款失败: ${result.errmsg || JSON.stringify(result)}`);
  }

  const respdata = result.respdata;
  if (!respdata) {
    throw new Error('申请退款失败: respdata 为空');
  }

  if (respdata.return_code !== 'SUCCESS') {
    throw new Error(`退款通信失败: ${respdata.return_msg || '未知'}`);
  }
  if (respdata.result_code !== 'SUCCESS') {
    throw new Error(`退款业务失败: ${respdata.err_code_des || respdata.err_code || '未知'}`);
  }

  console.log(`[退款] 申请成功: order_no=${outTradeNo} refund_id=${respdata.refund_id}`);
  return respdata;
}

module.exports = {
  createJsapiOrder,
  queryOrder,
  refund,
  config,
};
