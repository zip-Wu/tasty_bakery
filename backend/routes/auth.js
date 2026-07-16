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

// ========== 顺序编号昵称生成（大力馒头宝001 ~ 大力馒头宝999） ==========
// 新用户按注册顺序分配编号，超过 999 回绕到 001
// nick_number 列有 UNIQUE 约束，并发注册冲突时捕获错误并重试
async function createUserWithNickNumber(conn, user) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const [rows] = await conn.execute('SELECT MAX(nick_number) AS max_num FROM users');
    const current = rows[0].max_num;
    let next;
    if (current === null) {
      next = 1;
    } else if (current >= 999) {
      next = 1;
    } else {
      next = current + 1;
    }
    const padded = String(next).padStart(3, '0');
    const nickname = '大力馒头宝' + padded;

    try {
      await conn.execute(
        `INSERT INTO users (id, openid, nickname, avatar, points, nick_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, user.openid, nickname, user.avatar, user.points, next]
      );
      return { ...user, nickname };
    } catch (err) {
      // ER_DUP_ENTRY: 并发注册拿到了相同编号，重试
      if (err.code === 'ER_DUP_ENTRY') {
        console.warn('[auth] 昵称编号冲突，重试 (attempt ' + (attempt + 1) + ')');
        continue;
      }
      throw err;
    }
  }
  throw new Error('昵称编号分配失败（并发冲突过多）');
}

// 返回给顾客端的用户信息（不暴露 openid）
function customerResponse(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    points: user.points,
  };
}

// ========== 微信登录（code 换取 openid） ==========
router.post('/login', async (req, res) => {
  const { avatar, code } = req.body;

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
    'SELECT id, openid, nickname, avatar, points FROM users WHERE openid = ?',
    [openId]
  );
  let user = rows[0];

  if (!user) {
    // 新用户：分配顺序编号昵称（大力馒头宝001 ~ 999），处理并发冲突
    const conn = await pool.getConnection();
    try {
      user = {
        id: generateId(),
        openid: openId,
        avatar: avatar || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(openId.slice(0,10))}`,
        points: 0,
      };
      user = await createUserWithNickNumber(conn, user);
    } finally {
      conn.release();
    }
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

  const allowedFields = ['nickname', 'avatar'];
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
    'SELECT id, openid, nickname, avatar, points FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({ success: true, data: customerResponse(updated[0]) });
});

module.exports = router;
