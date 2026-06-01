/**
 * 管理员登录路由
 * POST /api/admin/login — 密码验证，返回 JWT token
 */
const express = require('express');
const { signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.json({ success: false, message: '请输入密码' });
  }

  const token = signToken(password);

  if (!token) {
    return res.json({ success: false, message: '密码错误' });
  }

  res.json({ success: true, data: { token } });
});

module.exports = router;
