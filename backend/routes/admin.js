/**
 * 商家管理路由 — 后台 API
 */
const express = require('express');
const crypto = require('crypto');
const { pool, mysqlNow } = require('../database');

const router = express.Router();

// ========== 获取全部订单（支持分页） ==========
router.get('/admin/orders', async (req, res) => {
  const { status, page = '1', pageSize = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize) || 50));
  const offset = (pageNum - 1) * size;

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

  // 先查总数
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) as total FROM orders o` + (status && status !== 'all' ? ' WHERE o.status = ?' : ''),
    status && status !== 'all' ? [status] : []
  );

  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(size, offset);

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
    source: row.source || 'customer',
    pickupCode: row.pickup_code != null ? String(row.pickup_code).padStart(3, '0') : '',
    pickupTime: row.pickup_time,
    remark: row.remark || '',
    createdAt: row.created_at,
    paidAt: row.paid_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
  }));

  res.json({
    success: true,
    data: {
      list: result,
      total,
      page: pageNum,
      pageSize: size,
      hasMore: offset + size < total,
    }
  });
});

// ========== 标记制作完成 ==========
router.post('/admin/orders/:id/ready', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  // 仅允许 preparing 状态的订单标记为待取餐
  if (rows[0].status !== 'preparing') {
    return res.json({ success: false, message: `当前状态"${rows[0].status}"不支持标记为待取餐` });
  }

  await pool.execute("UPDATE orders SET status = 'ready', ready_at = ? WHERE id = ?", [mysqlNow(), req.params.id]);
  res.json({ success: true, message: '已标记为待取餐' });
});

// ========== 商家标记已完成 ==========
router.post('/admin/orders/:id/complete', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  // 仅允许 ready 状态的订单完成
  if (rows[0].status === 'completed') {
    return res.json({ success: false, message: '订单已完成，无需重复操作' });
  }
  if (rows[0].status !== 'ready') {
    return res.json({ success: false, message: `当前状态"${rows[0].status}"不支持标记为已完成` });
  }

  await pool.execute(
    "UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?",
    [mysqlNow(), req.params.id]
  );

  // 累加销量（此端点的 complete 仅由商家操作，与 orders.js 的 /complete 互斥，不会重复累计）
  const items = typeof rows[0].items === 'string' ? JSON.parse(rows[0].items) : rows[0].items;
  for (const item of items) {
    await pool.execute(
      'UPDATE products SET sales = sales + ? WHERE id = ?',
      [item.quantity, item.id]
    );
  }

  res.json({ success: true, message: '已标记为已完成' });
});

// ========== 获取全部商品 ==========
router.get('/admin/products', async (req, res) => {
  const [products] = await pool.execute(
    'SELECT id, name, price, image, category, description, gallery, sales, stock, is_available, sort_order FROM products ORDER BY sort_order ASC, id ASC'
  );
  res.json({ success: true, data: products });
});

// ========== 交换两个商品的排序位置 ==========
router.put('/admin/products/:id/swap', async (req, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.json({ success: false, message: '缺少目标商品ID' });

  const [rows] = await pool.execute('SELECT id, sort_order FROM products WHERE id IN (?, ?)', [req.params.id, targetId]);
  if (rows.length !== 2) return res.json({ success: false, message: '商品不存在' });

  const a = rows.find(r => r.id == req.params.id);
  const b = rows.find(r => r.id == targetId);
  const sa = a.sort_order || 0;
  const sb = b.sort_order || 0;

  if (sa === sb) {
    // 值相同无法区分：一次性给所有商品按当前顺序重新编号
    const [all] = await pool.execute('SELECT id FROM products ORDER BY sort_order ASC, id ASC');
    for (let i = 0; i < all.length; i++) {
      await pool.execute('UPDATE products SET sort_order = ? WHERE id = ?', [i + 1, all[i].id]);
    }
  } else {
    // 三步交换
    const [max] = await pool.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 AS tmp FROM products');
    const tmp = max[0].tmp;
    await pool.execute('UPDATE products SET sort_order = ? WHERE id = ?', [tmp, b.id]);
    await pool.execute('UPDATE products SET sort_order = ? WHERE id = ?', [sb, a.id]);
    await pool.execute('UPDATE products SET sort_order = ? WHERE id = ?', [sa, b.id]);
  }

  res.json({ success: true });
});

// ========== 获取/更新标签排序 ==========
router.get('/admin/category-order', async (req, res) => {
  const [rows] = await pool.execute("SELECT value FROM settings WHERE kkey = 'category_order'");
  let order = [];
  if (rows.length > 0 && rows[0].value) {
    try { order = JSON.parse(rows[0].value); } catch (_) {}
  }
  // 补全：从 products 提取所有存在的标签
  const [cats] = await pool.execute("SELECT DISTINCT category FROM products WHERE category != ''");
  const existing = cats.map(r => r.category);
  // 未配置的追加到末尾
  const result = [...order.filter(c => existing.includes(c)), ...existing.filter(c => !order.includes(c))];
  res.json({ success: true, data: result });
});

router.put('/admin/category-order', async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.json({ success: false, message: '数据格式错误' });
  await pool.execute("INSERT INTO settings (kkey, value) VALUES ('category_order', ?) ON DUPLICATE KEY UPDATE value = ?",
    [JSON.stringify(categories), JSON.stringify(categories)]);
  res.json({ success: true });
});

// ========== 新增商品 ==========
router.post('/admin/products', async (req, res) => {
  const { name, price, category, image, stock, description, gallery } = req.body;

  if (!name || price === undefined) {
    return res.json({ success: false, message: '商品名称和价格不能为空' });
  }

  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    return res.json({ success: false, message: '价格必须为正数' });
  }
  if (name.length > 128) {
    return res.json({ success: false, message: '商品名称不能超过128个字符' });
  }

  const parsedStock = parseInt(stock) || 50;  // 未填默认 50，避免 0 库存导致无法下单
  if (parsedStock < 0) {
    return res.json({ success: false, message: '库存不能为负数' });
  }

  // gallery 前端传来是数组，入库转为 JSON 字符串；已存为 JSON string 时也兼容
  const galleryStr = Array.isArray(gallery) ? JSON.stringify(gallery) : (gallery || '');

  const [result] = await pool.execute(
    'INSERT INTO products (name, price, image, category, description, gallery, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, parsedPrice, image || '', category || '', description || '', galleryStr, parsedStock]
  );

  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [result.insertId]);
  res.json({ success: true, data: rows[0] });
});

// ========== 更新商品 ==========
// 仅更新传入的字段（动态拼接 UPDATE），未传入的字段保持原值不变
// is_available 字段在前端是 boolean，存储时转为 0/1
router.put('/admin/products/:id', async (req, res) => {
  const { is_available, price, name, category, image, stock, description, gallery } = req.body;
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '商品不存在' });
  }

  const updates = [];
  const params = [];

  if (is_available !== undefined) {
    updates.push('is_available = ?');
    params.push(is_available === true || is_available === 1 ? 1 : 0);
  }
  if (price !== undefined) {
    updates.push('price = ?');
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) {
      return res.json({ success: false, message: '价格必须为正数' });
    }
    params.push(p);
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
    const s = parseInt(stock);
    if (isNaN(s) || s < 0) {
      return res.json({ success: false, message: '库存不能为负数' });
    }
    params.push(s);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }
  if (gallery !== undefined) {
    updates.push('gallery = ?');
    // 前端传来数组转为 JSON 字符串；已是 string 时直接存
    params.push(Array.isArray(gallery) ? JSON.stringify(gallery) : gallery);
  }

  if (updates.length > 0) {
    params.push(req.params.id);
    await pool.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [updated] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updated[0] });
});

// ========== 删除单个商品 ==========
router.delete('/admin/products/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '商品不存在' });
  }

  await pool.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '商品已删除' });
});

// ========== 一键清空所有商品 ==========
router.post('/admin/products/reset', async (req, res) => {
  if (req.body.confirm !== 'DELETE_ALL_PRODUCTS') {
    return res.status(400).json({ success: false, message: '请在管理端输入确认码后再执行清空操作' });
  }
  const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) as cnt FROM products');
  await pool.execute('DELETE FROM products');
  res.json({ success: true, message: `已清空 ${cnt} 个商品` });
});

// ========== 商家快速录单（离线销售记录） ==========
router.post('/admin/quick-sale', async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ success: false, message: '请选择至少一个商品' });
  }

  // 1. 查询商品信息
  const productIds = items.map(i => i.id);
  const placeholders = productIds.map(() => '?').join(',');
  const [products] = await pool.execute(
    `SELECT id, name, price FROM products WHERE id IN (${placeholders})`,
    productIds
  );

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  // 2. 组装订单明细
  const orderItems = [];
  let totalPrice = 0;
  for (const item of items) {
    const product = productMap[item.id];
    if (!product) {
      return res.json({ success: false, message: `商品 ID=${item.id} 不存在，请刷新页面` });
    }
    if (!item.quantity || item.quantity < 1) continue;
    orderItems.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
    });
    totalPrice += product.price * item.quantity;
  }

  if (orderItems.length === 0) {
    return res.json({ success: false, message: '商品数量必须大于 0' });
  }

  // 3. 生成订单号（OFF 前缀 = 线下录单）
  const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const today = bjNow.getFullYear().toString().slice(2) +
    String(bjNow.getMonth() + 1).padStart(2, '0') +
    String(bjNow.getDate()).padStart(2, '0');
  const orderNo = 'OFF' + today + '-' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);

  // 4. 插入订单（直接 completed，跳过支付流程）
  const now = mysqlNow();
  await pool.execute(
    `INSERT INTO orders (id, order_no, user_id, items, total_price, status,
     paid_at, completed_at, source) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, 'offline')`,
    [id, orderNo, 'merchant', JSON.stringify(orderItems), totalPrice, now, now]
  );

  // 5. 扣库存 + 累加销量
  for (const item of items) {
    if (!item.quantity || item.quantity < 1) continue;
    await pool.execute(
      `UPDATE products
       SET sales = sales + ?,
           stock = GREATEST(stock - ?, 0),
           is_available = CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END
       WHERE id = ?`,
      [item.quantity, item.quantity, item.quantity, item.id]
    );
  }

  res.json({
    success: true,
    message: `已录入 ${orderItems.length} 款商品，合计 ¥${totalPrice.toFixed(2)}`,
    data: { id, orderNo, totalPrice, items: orderItems, createdAt: now },
  });
});

// ========== 今日营收看板 ==========
router.get('/admin/dashboard', async (req, res) => {
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const today = bjNow.getFullYear() + '-' +
    String(bjNow.getMonth() + 1).padStart(2, '0') + '-' +
    String(bjNow.getDate()).padStart(2, '0');

  const [[stats]] = await pool.execute(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
      SUM(CASE WHEN status IN ('preparing', 'ready', 'completed') THEN total_price ELSE 0 END) as revenue
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
      refunded: stats.refunded || 0,
      revenue: stats.revenue || 0,
    },
  });
});

module.exports = router;
