/**
 * 商家管理路由 — 后台 API
 *
 * GET  /api/admin/orders           — 全部订单（支持 ?status=pending 过滤）
 * POST /api/admin/orders/:id/ready — 标记制作完成（preparing → ready）
 * GET  /api/admin/products         — 全部商品（含已下架）
 * PUT  /api/admin/products/:id     — 更新商品（上下架/改价）
 * GET  /api/admin/dashboard        — 今日营收看板
 */
const express = require('express');
const db = require('../database');

const router = express.Router();

// ===== 获取全部订单 =====
router.get('/admin/orders', (req, res) => {
  const { status } = req.query;

  let sql = `
    SELECT o.*, u.nickname as user_nickname
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
  `;
  const params = [];

  if (status && status !== 'all') {
    sql += ' WHERE o.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY o.created_at DESC LIMIT 100';

  const orders = db.prepare(sql).all(...params);

  const result = orders.map(row => ({
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    userNickname: row.user_nickname || '未知用户',
    storeName: row.store_name,
    items: JSON.parse(row.items),
    totalPrice: row.total_price,
    status: row.status,
    pickupTime: row.pickup_time,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
  }));

  res.json({ success: true, data: result });
});

// ===== 标记制作完成 =====
router.post('/admin/orders/:id/ready', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) {
    return res.json({ success: false, message: '订单不存在' });
  }

  db.prepare("UPDATE orders SET status = 'ready' WHERE id = ?").run(req.params.id);

  res.json({ success: true, message: '已标记为待取餐' });
});

// ===== 获取全部商品 =====
router.get('/admin/products', (req, res) => {
  const products = db.prepare(
    'SELECT id, name, price, image, category, sales, is_available FROM products ORDER BY id'
  ).all();

  res.json({ success: true, data: products });
});

// ===== 新增商品 =====
router.post('/admin/products', (req, res) => {
  const { name, price, category, image } = req.body;

  if (!name || !price) {
    return res.json({ success: false, message: '商品名称和价格不能为空' });
  }

  const info = db.prepare(`
    INSERT INTO products (name, price, image, category)
    VALUES (@name, @price, @image, @category)
  `).run({
    name,
    price: parseFloat(price),
    image: image || '',
    category: category || '其他',
  });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success: true, data: product });
});

// ===== 更新商品 =====
router.put('/admin/products/:id', (req, res) => {
  const { is_available, price, name, category, image } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

  if (!product) {
    return res.json({ success: false, message: '商品不存在' });
  }

  const updates = [];
  const params = {};

  if (is_available !== undefined) {
    updates.push('is_available = @is_available');
    params.is_available = is_available ? 1 : 0;
  }
  if (price !== undefined) {
    updates.push('price = @price');
    params.price = price;
  }
  if (name !== undefined) {
    updates.push('name = @name');
    params.name = name;
  }
  if (category !== undefined) {
    updates.push('category = @category');
    params.category = category;
  }
  if (image !== undefined) {
    updates.push('image = @image');
    params.image = image;
  }

  if (updates.length > 0) {
    params.id = req.params.id;
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = @id`).run(params);
  }

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

// ===== 今日营收看板 =====
router.get('/admin/dashboard', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status != 'pending' THEN total_price ELSE 0 END) as revenue
    FROM orders
    WHERE date(created_at) = ?
  `).get(today);

  res.json({
    success: true,
    data: {
      today,
      totalOrders: stats.total_orders || 0,
      pending: stats.pending || 0,
      preparing: stats.preparing || 0,
      ready: stats.ready || 0,
      completed: stats.completed || 0,
      revenue: stats.revenue || 0,
    },
  });
});

module.exports = router;
