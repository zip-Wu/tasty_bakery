/**
 * 管理员认证中间件
 * 保护所有 /api/admin/* 接口，需要合法的 JWT token
 *
 * 用法：
 *   const { requireAdmin } = require('../middleware/auth');
 *   router.use('/admin', requireAdmin);
 */
const jwt = require('jsonwebtoken');
const { pool } = require('../database');

// 管理员密码 — 通过环境变量 ADMIN_PASSWORD 设置（无默认值，强制配置）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// JWT 密钥 — 通过环境变量 JWT_SECRET 设置（无默认值，强制配置）
const JWT_SECRET = process.env.JWT_SECRET || '';

// Token 有效期：12 小时（一个班次）
const TOKEN_EXPIRES = '12h';

// 启动时校验
if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('[auth] 致命错误: ADMIN_PASSWORD 或 JWT_SECRET 未设置');
  console.error('[auth] 请在云托管环境变量中配置后重新部署');
  process.exit(1);
}

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

// ===================== 顾客端认证中间件 =====================

/**
 * 顾客端鉴权中间件
 *
 * 微信云托管 callContainer 在网关层验证请求签名后，把 openid 注入 X-WX-OPENID 头。
 * 后端直接读这个头查 DB，网关已验过签，不需要自己再做签名校验。
 */
async function requireUser(req, res, next) {
  const openid = req.headers['x-wx-openid'];

  if (!openid) {
    return res.status(401).json({ success: false, message: '未获取到用户身份，请从微信客户端打开小程序' });
  }

  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ?', [openid]);

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: '用户不存在，请重新打开小程序登录' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('[auth] requireUser 数据库查询失败:', err.message);
    return res.status(500).json({ success: false, message: '服务异常，请稍后重试' });
  }
}

module.exports = { signToken, requireAdmin, requireUser };
