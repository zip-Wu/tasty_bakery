/**
 * 用户路由 — 登录、获取/更新用户信息
 * POST /api/login       — 微信登录（当前为模拟，后续替换 wx.login）
 * GET  /api/user/:id    — 获取用户信息
 * POST /api/user/:id    — 更新用户信息
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../database');

const router = express.Router();

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ===== 微信登录（模拟） =====
// TODO: 后续替换为真实 wx.login → code2session 流程
// 1. 小程序调用 wx.login() 拿到 code
// 2. 把 code 发到这个接口
// 3. 后端用 AppID + AppSecret + code 请求微信 code2session
// 4. 拿到 openid 和 session_key
router.post('/login', (req, res) => {
  const { nickname, avatar } = req.body;
  const mockOpenId = 'wx_' + (nickname || 'user');

  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(mockOpenId);

  if (!user) {
    user = {
      id: generateId(),
      openid: mockOpenId,
      nickname: nickname || '面包爱好者',
      avatar: avatar || 'https://picsum.photos/200/200?random=100',
      phone: '',
      points: 1280,
      balance: 58.00,
      member_level: '',
      is_member: 0,
    };

    db.prepare(`
      INSERT INTO users (id, openid, nickname, avatar, phone, points, balance, member_level, is_member)
      VALUES (@id, @openid, @nickname, @avatar, @phone, @points, @balance, @member_level, @is_member)
    `).run(user);
  }

  res.json({ success: true, data: user });
});

// ===== 获取用户信息 =====
router.get('/user/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }

  res.json({ success: true, data: user });
});

// ===== 更新用户信息 =====
router.post('/user/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }

  const updates = req.body;
  const fields = [];
  const values = {};

  // 只允许更新白名单字段
  const allowedFields = ['nickname', 'avatar', 'phone'];
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = updates[key];
    }
  }

  if (fields.length > 0) {
    values.id = req.params.id;
    db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now','localtime') WHERE id = @id`).run(values);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

module.exports = router;
