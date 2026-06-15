/**
 * 用户路由 — 登录、获取/更新用户信息
 */
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../database');

const router = express.Router();

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ===== 微信登录（模拟） =====
router.post('/login', async (req, res) => {
  const { nickname, avatar } = req.body;
  const mockOpenId = 'wx_' + (nickname || 'user');

  const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ?', [mockOpenId]);
  let user = rows[0];

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

    await pool.execute(
      `INSERT INTO users (id, openid, nickname, avatar, phone, points, balance, member_level, is_member)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.openid, user.nickname, user.avatar, user.phone, user.points, user.balance, user.member_level, user.is_member]
    );
  }

  res.json({ success: true, data: user });
});

// ===== 获取用户信息 =====
router.get('/user/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '用户不存在' });
  }

  res.json({ success: true, data: rows[0] });
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
  res.json({ success: true, data: updated[0] });
});

module.exports = router;
