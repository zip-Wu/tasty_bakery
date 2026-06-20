/**
 * 商家管理路由 — 后台 API
 */
const express = require('express');
const { pool } = require('../database');

const router = express.Router();

// ===== 获取全部订单 =====
router.get('/admin/orders', async (req, res) => {
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

  const [orders] = await pool.execute(sql, params);

  const result = orders.map(row => ({
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    userNickname: row.user_nickname || '未知用户',
    storeName: row.store_name,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
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
router.post('/admin/orders/:id/ready', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  await pool.execute("UPDATE orders SET status = 'ready' WHERE id = ?", [req.params.id]);
  res.json({ success: true, message: '已标记为待取餐' });
});

// ===== 商家标记已完成 =====
router.post('/admin/orders/:id/complete', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = new Date();
  const mysqlNow = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') +
    ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');

  await pool.execute(
    "UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?",
    [mysqlNow, req.params.id]
  );

  // 订单完成时累加销量
  const items = typeof rows[0].items === 'string' ? JSON.parse(rows[0].items) : rows[0].items;
  for (const item of items) {
    await pool.execute(
      'UPDATE products SET sales = sales + ? WHERE id = ?',
      [item.quantity, item.id]
    );
  }

  res.json({ success: true, message: '已标记为已完成' });
});

// ===== 获取全部商品 =====
router.get('/admin/products', async (req, res) => {
  const [products] = await pool.execute(
    'SELECT id, name, price, image, category, sales, stock, is_available FROM products ORDER BY id'
  );
  res.json({ success: true, data: products });
});

// ===== 新增商品 =====
router.post('/admin/products', async (req, res) => {
  const { name, price, category, image, stock } = req.body;

  if (!name || !price) {
    return res.json({ success: false, message: '商品名称和价格不能为空' });
  }

  const [result] = await pool.execute(
    'INSERT INTO products (name, price, image, category, stock) VALUES (?, ?, ?, ?, ?)',
    [name, parseFloat(price), image || '', category || '', parseInt(stock) || 0]
  );

  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [result.insertId]);
  res.json({ success: true, data: rows[0] });
});

// ===== 更新商品 =====
router.put('/admin/products/:id', async (req, res) => {
  const { is_available, price, name, category, image, stock } = req.body;
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '商品不存在' });
  }

  const updates = [];
  const params = [];

  if (is_available !== undefined) {
    updates.push('is_available = ?');
    params.push(is_available ? 1 : 0);
  }
  if (price !== undefined) {
    updates.push('price = ?');
    params.push(price);
  }
  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (category !== undefined) {
    updates.push('category = ?');
    params.push(category);
  }
  if (image !== undefined) {
    updates.push('image = ?');
    params.push(image);
  }
  if (stock !== undefined) {
    updates.push('stock = ?');
    params.push(parseInt(stock) || 0);
  }

  if (updates.length > 0) {
    params.push(req.params.id);
    await pool.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [updated] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated[0] });
});

// ===== 删除单个商品 =====
router.delete('/admin/products/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '商品不存在' });
  }

  await pool.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '商品已删除' });
});

// ===== 一键清空所有商品 =====
router.post('/admin/products/reset', async (req, res) => {
  const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) as cnt FROM products');
  await pool.execute('DELETE FROM products');
  res.json({ success: true, message: `已清空 ${cnt} 个商品` });
});

// ===== 今日营收看板 =====
router.get('/admin/dashboard', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const [[stats]] = await pool.execute(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status != 'pending' THEN total_price ELSE 0 END) as revenue
    FROM orders
    WHERE DATE(created_at) = ?
  `, [today]);

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
