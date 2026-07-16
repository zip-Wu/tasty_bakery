/**
 * 用户路由 — 登录、获取/更新用户信息
 */
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const { pool } = require('../database');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

// WHY 安全：/login 是用户登录入口，尚未获取用户身份，不需要 requireUser
// /user/:id 等数据操作需要在路由内验证归属
router.use((req, res, next) => {
  if (req.path === '/login') return next();
  requireUser(req, res, next);
});

// 微信小程序 AppID（通过环境变量注入）
const WX_APP_ID = process.env.WX_APP_ID;
const WX_APP_SECRET = process.env.WX_APP_SECRET;

// 构造 HTTPS 请求选项：优先系统 CA → Node.js 内置 CA → 默认（依赖环境变量）
function getHttpsOptions() {
  // 1) 系统 CA 证书文件（ca-certificates 包安装后）
  const systemPaths = ['/etc/ssl/certs/ca-certificates.crt', '/etc/ssl/certs/ca-bundle.crt'];
  for (const p of systemPaths) {
    try {
      const ca = fs.readFileSync(p);
      if (ca && ca.length > 0) return { ca };
    } catch (_) {}
  }
  // 2) Node.js 内置 CA 列表
  if (tls.rootCertificates && tls.rootCertificates.length > 0) {
    return { ca: tls.rootCertificates };
  }
  // 3) 完全依赖 NODE_OPTIONS=--use-openssl-ca 环境变量
  return {};
}

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ========== 调用微信 code2Session 换取真实 openid ==========
function getOpenId(code) {
  return new Promise((resolve, reject) => {
    if (!WX_APP_SECRET) {
      reject(new Error('WX_APP_SECRET not configured'));
      return;
    }
    const url = 'https://api.weixin.qq.com/sns/jscode2session' +
      '?appid=' + encodeURIComponent(WX_APP_ID) +
      '&secret=' + encodeURIComponent(WX_APP_SECRET) +
      '&js_code=' + encodeURIComponent(code) +
      '&grant_type=authorization_code';

    const req = https.get(url, getHttpsOptions(), (wxRes) => {
      let data = '';
      wxRes.on('data', (chunk) => { data += chunk; });
      wxRes.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.openid) {
            resolve(result.openid);
          } else {
            reject(new Error(result.errmsg || 'code2Session failed'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求微信服务器超时'));
    });
  });
}

// 大力馒头主题随机昵称生成（商家端可区分，顾客端不重样）
const NICK_PREFIX = [
  '馒头侠', '蒸笼客', '碳水控', '揉面师',
  '发酵粉', '面团迷', '笼屉君', '发面手',
  '热气腾', '麦香客', '蒸功夫', '面团仔',
  '膨松粉', '蒸汽侠', '面点控', '白胖墩',
  '竹笼客', '发酵君', '热乎团', '碳水侠'
];

function randomNick() {
  const prefix = NICK_PREFIX[Math.floor(Math.random() * NICK_PREFIX.length)];
  const suffix = generateId().slice(-3).toUpperCase();
  return prefix + suffix;
}

// 顾客端显示用：截掉身份标识后缀（如 "馒头侠A3F" → "馒头侠"）
function customerDisplayName(nickname) {
  if (nickname && /[A-Z0-9]{3}$/.test(nickname)) {
    return nickname.slice(0, -3);
  }
  return nickname;
}

// 返回给顾客端时统一截掉后缀（不暴露 openid，后端通过 X-WX-OPENID 头识别用户）
function customerResponse(user) {
  return {
    id: user.id,
    nickname: customerDisplayName(user.nickname),
    avatar: user.avatar,
    phone: user.phone,
    points: user.points,
    balance: user.balance,
    couponCount: user.coupon_count,
    memberLevel: user.member_level,
    isMember: !!user.is_member,
  };
}

// ========== 微信登录（code 换取 openid） ==========
router.post('/login', async (req, res) => {
  const { nickname, avatar, code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.json({ success: false, message: '缺少登录凭证，请重新打开小程序' });
  }

  let openId;
  try {
    openId = await getOpenId(code);
    console.log('[auth] 用户登录成功 (openid hash:', require('crypto').createHash('sha256').update(openId).digest('hex').slice(0, 8) + ')');
  } catch (e) {
    console.error('[auth] code2Session 失败:', e.message);
    return res.json({ success: false, message: '微信登录失败，请重试' });
  }

  const [rows] = await pool.execute(
    'SELECT id, openid, nickname, avatar, phone, points, balance, coupon_count, member_level, is_member FROM users WHERE openid = ?',
    [openId]
  );
  let user = rows[0];

  if (!user) {
    user = {
      id: generateId(),
      openid: openId,
      // 生成唯一可辨识的顾客名，商家在管理后台能区分不同顾客
      nickname: nickname || randomNick(),
      avatar: avatar || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(openId.slice(0,10))}`,
      phone: '',
      points: 0,
      balance: 0.00,
      member_level: '',
      is_member: 0,
    };

    await pool.execute(
      `INSERT INTO users (id, openid, nickname, avatar, phone, points, balance, member_level, is_member)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.openid, user.nickname, user.avatar, user.phone, user.points, user.balance, user.member_level, user.is_member]
    );
  }

  res.json({ success: true, data: customerResponse(user) });
});

// ========== 获取用户信息 ==========
router.get('/user/:id', async (req, res) => {
  // WHY 安全：验证只能读取自己的用户信息，消除 IDOR（此前任何人均可通过 URL 中的 id 读取任意用户数据）
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权查看他人信息' });
  }

  res.json({ success: true, data: customerResponse(req.user) });
});

// ========== 更新用户信息 ==========
router.post('/user/:id', async (req, res) => {
  // WHY 安全：验证只能更新自己的用户信息，消除 IDOR
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权修改他人信息' });
  }

  const updates = req.body;
  const fields = [];
  const values = [];

  const allowedFields = ['nickname', 'avatar', 'phone'];
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (fields.length > 0) {
    values.push(req.user.id);
    await pool.execute(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
  }

  const [updated] = await pool.execute(
    'SELECT id, openid, nickname, avatar, phone, points, balance, coupon_count, member_level, is_member FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({ success: true, data: customerResponse(updated[0]) });
});

module.exports = router;
