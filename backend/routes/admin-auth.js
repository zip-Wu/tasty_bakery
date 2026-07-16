/**
 * 管理员登录路由
 * POST /api/admin/login — 密码验证，返回 JWT token
 */
const express = require('express');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// 简易内存限流：同一 IP 每分钟最多 5 次登录尝试
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

router.post('/admin/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  // 清理过期记录
  const record = loginAttempts.get(ip);
  if (record && now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(ip);
  }

  // 检查限流
  const current = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  if (current.count >= MAX_ATTEMPTS) {
    const waitSec = Math.ceil((WINDOW_MS - (now - current.firstAttempt)) / 1000);
    return res.status(429).json({ success: false, message: `登录尝试过于频繁，请 ${waitSec} 秒后重试` });
  }

  const { password } = req.body;

  if (!password) {
    return res.json({ success: false, message: '请输入密码' });
  }

  const token = signToken(password);

  if (!token) {
    // 登录失败：递增计数
    loginAttempts.set(ip, { count: current.count + 1, firstAttempt: current.firstAttempt });
    return res.json({ success: false, message: '密码错误' });
  }

  // 登录成功：清除计数
  loginAttempts.delete(ip);
  res.json({ success: true, data: { token } });
});

module.exports = router;
