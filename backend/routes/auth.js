/**
 * 用户路由 — 登录、获取/更新用户信息
 */
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const { pool } = require('../database');

const router = express.Router();

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

// ===== 调用微信 code2Session 换取真实 openid =====
function getOpenId(code) {
  return new Promise((resolve, reject) => {
    if (!WX_APP_SECRET) {
      reject(new Error('WX_APP_SECRET not configured'));
      return;
    }
    const url = 'https://api.weixin.qq.com/sns/jscode2session' +
      '?appid=' + WX_APP_ID +
      '&secret=' + WX_APP_SECRET +
      '&js_code=' + code +
      '&grant_type=authorization_code';

    https.get(url, getHttpsOptions(), (wxRes) => {
      var data = '';
      wxRes.on('data', function(chunk) { data += chunk; });
      wxRes.on('end', function() {
        try {
          var result = JSON.parse(data);
          if (result.openid) {
            resolve(result.openid);
          } else {
            reject(new Error(result.errmsg || 'code2Session failed'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
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

// 返回给顾客端时统一截掉后缀
function customerResponse(user) {
  return {
    id: user.id,
    openid: user.openid,
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

// ===== 微信登录（code 换取 openid） =====
router.post('/login', async (req, res) => {
  const { nickname, avatar, code } = req.body;

  let openId;
  try {
    openId = await getOpenId(code);
    console.log('[auth] openid:', openId.slice(0, 8) + '...');
  } catch (e) {
    console.error('[auth] code2Session 失败:', e.message);
    return res.json({ success: false, message: '微信登录失败，请重试' });
  }

  const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ?', [openId]);
  let user = rows[0];

  if (!user) {
    user = {
      id: generateId(),
      openid: openId,
      // 生成唯一可辨识的顾客名，商家在管理后台能区分不同顾客
      nickname: nickname || randomNick(),
      avatar: avatar || 'https://picsum.photos/200/200?random=100',
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

// ===== 获取用户信息 =====
router.get('/user/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '用户不存在' });
  }

  res.json({ success: true, data: customerResponse(rows[0]) });
});

// ===== 更新用户信息 =====
router.post('/user/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '用户不存在' });
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
    values.push(req.params.id);
    await pool.execute(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
  }

  const [updated] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: customerResponse(updated[0]) });
});

module.exports = router;
