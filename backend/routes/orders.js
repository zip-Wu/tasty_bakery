/**
 * 订单路由 — 创建订单、查询、支付、状态流转
 *
 * 订单状态流转：pending → preparing → ready → completed
 *   pending   — 待支付（刚创建）
 *   preparing — 制作中（支付成功后）
 *   ready     — 待取餐（商家标记制作完成）
 *   completed — 已完成（用户确认取餐）
 *
 * POST /api/orders              — 创建订单
 * GET  /api/orders/user/:userId — 用户订单列表
 * GET  /api/orders/:id          — 订单详情
 * POST /api/orders/:id/status   — 更新订单状态
 * POST /api/pay/:orderId        — 模拟支付
 * POST /api/orders/:id/accept   — 商家接单
 * POST /api/orders/:id/complete — 完成订单
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../database');

const router = express.Router();

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ===== 创建订单 =====
router.post('/orders', (req, res) => {
  const { userId, items, totalPrice, storeId, storeName, pickupTime } = req.body;

  if (!userId || !items || !items.length) {
    return res.json({ success: false, message: '缺少必要参数' });
  }

  const order = {
    id: generateId(),
    orderNo: 'ORD' + Date.now(),
    userId,
    storeId: storeId || null,
    storeName: storeName || '',
    items: JSON.stringify(items),
    totalPrice,
    status: 'pending',
    pickupTime: pickupTime || new Date(Date.now() + 30 * 60000).toISOString(),
  };

  db.prepare(`
    INSERT INTO orders (id, order_no, user_id, store_id, store_name, items, total_price, status, pickup_time)
    VALUES (@id, @orderNo, @userId, @storeId, @storeName, @items, @totalPrice, @status, @pickupTime)
  `).run(order);

  // 返回给前端时 items 要解析回数组
  order.items = items;
  order.createdAt = new Date().toISOString();
  order.paidAt = null;
  order.completedAt = null;

  res.json({ success: true, data: order });
});

// ===== 用户订单列表 =====
router.get('/orders/user/:userId', (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.params.userId);

  const result = orders.map(formatOrder);
  res.json({ success: true, data: result });
});

// ===== 订单详情 =====
router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  res.json({ success: true, data: formatOrder(order) });
});

// ===== 更新订单状态（通用） =====
router.post('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const updates = { status };
  if (status === 'paid') updates.paidAt = new Date().toISOString();
  if (status === 'completed') updates.completedAt = new Date().toISOString();

  const setClauses = ['status = @status'];
  const params = { id: req.params.id, status };

  if (updates.paidAt) {
    setClauses.push("paid_at = @paidAt");
    params.paidAt = updates.paidAt;
  }
  if (updates.completedAt) {
    setClauses.push("completed_at = @completedAt");
    params.completedAt = updates.completedAt;
  }

  db.prepare(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: formatOrder(updated) });
});

// ===== 模拟支付 =====
// TODO: 后续替换为真实微信支付
// 1. 后端调用微信统一下单 API，获取 prepay_id
// 2. 签名后返回 { timeStamp, nonceStr, package, paySign } 给前端
// 3. 前端调用 wx.requestPayment() 唤起支付
// 4. 微信异步通知后端（payNotify 回调）
router.post('/pay/:orderId', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const payResult = {
    success: true,
    tradeNo: 'MOCK' + Date.now(),
    timeEnd: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE orders SET status = 'preparing', paid_at = @paidAt WHERE id = @id
  `).run({ id: req.params.orderId, paidAt: payResult.timeEnd });

  res.json({
    success: true,
    data: { payResult, order: formatOrder({
      ...order,
      status: 'preparing',
      paid_at: payResult.timeEnd,
    }) },
  });
});

// ===== 商家接单 =====
router.post('/orders/:id/accept', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, accepted_at = ? WHERE id = ?')
    .run('preparing', now, req.params.id);

  res.json({ success: true, data: formatOrder({ ...order, status: 'preparing', accepted_at: now }) });
});

// ===== 完成订单（用户确认取餐） =====
router.post('/orders/:id/complete', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, completed_at = ? WHERE id = ?')
    .run('completed', now, req.params.id);

  res.json({ success: true, data: formatOrder({ ...order, status: 'completed', completed_at: now }) });
});

// ===== 工具函数：格式化订单输出 =====
function formatOrder(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    storeId: row.store_id,
    storeName: row.store_name,
    items: JSON.parse(row.items),
    totalPrice: row.total_price,
    status: row.status,
    pickupTime: row.pickup_time,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
  };
}

module.exports = router;
