/**
 * 大力馒头 — 后端服务入口
 *
 * 技术栈：Express + SQLite (better-sqlite3)
 *
 * 启动方式：
 *   1. npm install          — 安装依赖
 *   2. node seed.js         — 初始化数据（仅首次需要）
 *   3. node app.js          — 启动服务
 *
 * 项目结构：
 *   app.js          — 入口（本文件）
 *   database.js     — SQLite 初始化 + 表结构
 *   seed.js         — 种子数据
 *   routes/auth.js  — 用户登录/信息
 *   routes/menu.js  — 商品/分类
 *   routes/orders.js — 订单/支付
 *   routes/store.js  — 门店
 *   routes/admin.js  — 商家管理
 */
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

// ----- 中间件 -----
app.use(cors());
app.use(express.json());

// ----- 静态文件 + 管理页面 -----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ----- 路由挂载 -----
// 顾客端 API（无需认证）
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/menu'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/store'));

// 管理员登录（无需认证）
app.use('/api', require('./routes/admin-auth'));

// 管理员 API（需要认证）
app.use('/api', requireAdmin, require('./routes/admin'));

// ----- 404 -----
app.use((req, res) => {
  res.status(404).json({ success: false, message: `接口不存在: ${req.method} ${req.path}` });
});

// ----- 全局错误处理 -----
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// ----- 启动 -----
const { ready } = require('./database');

ready.then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  🍞  大力馒头 后端服务已启动');
    console.log(`  📍  小程序 API: http://localhost:${PORT}`);
    console.log(`  🛠  商家管理:   http://localhost:${PORT}/admin`);
    console.log(`  🔐  管理密码:   admin123456`);
    console.log(`      部署后通过环境变量 ADMIN_PASSWORD 修改`);
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
    console.log('    POST /api/pay/:orderId       — 模拟支付');
    console.log('    POST /api/orders/:id/accept  — 商家接单');
    console.log('    POST /api/orders/:id/complete — 完成订单');
    console.log('');
  });
}).catch(err => {
  console.error('[启动失败] 数据库初始化错误:', err.message);
  process.exit(1);
});
