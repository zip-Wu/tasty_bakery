/**
 * 管理员认证中间件
 * 保护所有 /api/admin/* 接口，需要合法的 JWT token
 *
 * 用法：
 *   const { requireAdmin } = require('../middleware/auth');
 *   router.use('/admin', requireAdmin);
 */
const jwt = require('jsonwebtoken');

// 管理员密码的哈希 → 部署时通过环境变量 ADMIN_PASSWORD 设置
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

// JWT 密钥 → 通过环境变量 JWT_SECRET 设置，避免重启后失效
const JWT_SECRET = process.env.JWT_SECRET || 'dali-mantou-2024-secret-key';

// Token 有效期：8 小时
const TOKEN_EXPIRES = '8h';

/**
 * 验证密码并签发 token
 */
function signToken(password) {
  if (password !== ADMIN_PASSWORD) {
    return null;
  }
  return jwt.sign({ role: 'admin', iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES,
  });
}

/**
 * Express 中间件：验证管理员 token
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

module.exports = { signToken, requireAdmin };
