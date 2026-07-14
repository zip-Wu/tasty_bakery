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
  console.warn('[auth] ⚠  ADMIN_PASSWORD 或 JWT_SECRET 未设置，认证功能不可用。');
  console.warn('[auth]    请在云托管环境变量中配置后重新部署。');
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
 * Express 中间件：从微信网关注入的 X-WX-OPENID 解析当前用户
 *
 * WHY 安全：此前顾客端 API 信任客户端传入的 userId，攻击者可冒用任意用户身份下单/查数据（IDOR）。
 *          微信云托管的 callContainer 通道会在网关层做设备级 HMAC 签名验证，
 *          验证通过后才会注入 X-WX-OPENID 头并转发到容器。
 *          攻击者公网直连容器时无法伪造此头（密钥在微信客户端本地），会被直接拒绝。
 *          因此该头由微信网关保证可信，后端仅做解析即可。
 *
 * 依赖：前端使用 wx.cloud.callContainer() 调用后端（app.js 已确认）。
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
