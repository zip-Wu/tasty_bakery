/**
 * 大力馒头 — 后端服务入口
 *
 * 技术栈：Express + MySQL (mysql2)
 *
 * 启动方式：
 *   1. npm install          — 安装依赖
 *   2. node seed.js         — 初始化数据（仅首次需要）
 *   3. node app.js          — 启动服务
 *
 * 项目结构：
 *   app.js          — 入口（本文件）
 *   database.js     — MySQL 连接池 + 表结构
 *   seed.js         — 种子数据
 *   routes/auth.js  — 用户登录/信息
 *   routes/menu.js  — 商品/分类
 *   routes/orders.js — 订单/支付
 *   routes/store.js  — 门店
 *   routes/admin.js  — 商家管理
 */
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { requireAdmin } = require('./middleware/auth');

// 全局异常捕获 → 防止未处理的 promise rejection 导致进程崩溃
process.on('unhandledRejection', (reason) => {
  console.error('[致命] 未捕获的异步异常:', reason);
});

const app = express();
const PORT = process.env.PORT || 80;
const { pool, ready } = require('./database');

// ========== 中间件 ==========
app.use(cors({
  origin: 'https://servicewechat.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// 微信支付回调需要原始请求体（必须在 express.json 之前）
// express.raw 设置 req._body=true，后续 express.json 会自动跳过
app.use('/api/pay/notify', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body.toString('utf8');
  next();
});

app.use(express.json());

// ========== 静态文件 + 管理页面 ==========
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 健康检查（云托管负载均衡用）
app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.status(200).send('ok');
  } catch {
    res.status(503).send('db unavailable');
  }
});
app.get('/', (req, res) => res.redirect('/admin'));

// ========== 路由挂载 ==========
// 顾客端只读 API（无需用户身份）— 商品浏览、门店查询
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/store'));

// 顾客端身份相关 — login 路由无需用户身份，user/:id 路由内部已加 requireUser 保护
app.use('/api', require('./routes/auth'));

// 顾客端订单 — requireUser 中间件通过 X-WX-OPENID 注入 req.user，所有端点用 req.user.id 替代客户端传入的 userId，防 IDOR 越权
app.use('/api', require('./routes/orders'));

// 管理员登录（无需管理员认证）— 登录本身就是获取 JWT 的过程
app.use('/api', require('./routes/admin-auth'));

// 管理员 API（需要 JWT 认证）— requireAdmin 验证 Bearer token
app.use('/api', requireAdmin, require('./routes/admin'));

// ========== 404 ==========
app.use((req, res) => {
  res.status(404).json({ success: false, message: `接口不存在: ${req.method} ${req.path}` });
});

// ========== 全局错误处理 ==========
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// ========== 启动 ==========
ready.then(() => {
  const server = app.listen(PORT, () => {
    console.log('');
    console.log('  大力馒头 后端服务已启动');
    console.log(`  小程序 API: http://localhost:${PORT}`);
    console.log(`  商家管理: http://localhost:${PORT}/admin`);
    console.log('  管理密码: (通过环境变量 ADMIN_PASSWORD 设置)');
    console.log('');
    console.log('  可用接口:');
    console.log('    POST /api/login              — 用户登录');
    console.log('    GET  /api/user/:id           — 用户信息');
    console.log('    POST /api/user/:id           — 更新用户信息');
    console.log('    GET  /api/products           — 商品列表');
    console.log('    GET  /api/categories         — 商品分类');
    console.log('    GET  /api/stores             — 门店列表');
    console.log('    POST /api/orders             — 创建订单');
    console.log('    GET  /api/orders/user/:id    — 用户订单');
    console.log('    GET  /api/orders/:id         — 订单详情');
    console.log('    POST /api/orders/:id/status  — 更新状态');
    console.log('    POST /api/pay/:orderId       — 微信支付下单');
    console.log('    POST /api/pay/notify         — 微信支付回调');
    console.log('    POST /api/orders/:id/complete — 完成订单');
    console.log('    POST /api/admin/quick-sale   — 商家快速录单');
    console.log('');
  });

  // 优雅关闭 — 云托管缩容或重新部署时会发送 SIGTERM
  process.on('SIGTERM', () => {
    console.log('[shutdown] 收到停止信号，开始优雅关闭...');
    server.close(async () => {
      console.log('[shutdown] HTTP 已停止接收新连接');
      try {
        await pool.end();
        console.log('[shutdown] 数据库连接池已释放');
      } catch (e) {
        console.error('[shutdown] 关闭连接池失败:', e.message);
      }
      process.exit(0);
    });
    // 25 秒超时兜底 — 防止连接池关闭卡住
    setTimeout(() => {
      console.error('[shutdown] 超时未完成，强制退出');
      process.exit(1);
    }, 25000).unref();
  });
}).catch(err => {
  console.error('[启动失败] 数据库初始化错误:', err.message);
  process.exit(1);
});
