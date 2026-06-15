/**
 * 订单路由 — 创建、查询、支付、状态流转
 */
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../database');

const router = express.Router();

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// MySQL 接受的日期格式：YYYY-MM-DD HH:MM:SS
function mysqlNow() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

// ===== 创建订单 =====
router.post('/orders', async (req, res) => {
  try {
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
      pickupTime: pickupTime || (() => {
        const d = new Date(Date.now() + 30 * 60000);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' +
          String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') +
          ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
      })(),
    };

    await pool.execute(
      `INSERT INTO orders (id, order_no, user_id, store_id, store_name, items, total_price, status, pickup_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.orderNo, order.userId, order.storeId, order.storeName, order.items, order.totalPrice, order.status, order.pickupTime]
    );

    order.items = items;
    order.createdAt = mysqlNow();
    order.paidAt = null;
    order.completedAt = null;

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('[orders] 创建订单异常:', err.message, err.stack);
    res.status(500).json({ success: false, message: '创建订单失败: ' + err.message });
  }
});

// ===== 用户订单列表 =====
router.get('/orders/user/:userId', async (req, res) => {
  const [orders] = await pool.execute(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.params.userId]
  );

  const result = orders.map(formatOrder);
  res.json({ success: true, data: result });
});

// ===== 订单详情 =====
router.get('/orders/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  res.json({ success: true, data: formatOrder(rows[0]) });
});

// ===== 更新订单状态（通用） =====
router.post('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = mysqlNow();
  const setClauses = ['status = ?'];
  const params = [status];

  if (status === 'paid') {
    setClauses.push('paid_at = ?');
    params.push(now);
  }
  if (status === 'completed') {
    setClauses.push('completed_at = ?');
    params.push(now);
  }

  params.push(req.params.id);
  await pool.execute(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`, params);

  const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: formatOrder(updated[0]) });
});

// ===== 模拟支付 =====
router.post('/pay/:orderId', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const payResult = {
    success: true,
    tradeNo: 'MOCK' + Date.now(),
    timeEnd: mysqlNow(),
  };

  await pool.execute(
    'UPDATE orders SET status = ?, paid_at = ? WHERE id = ?',
    ['preparing', payResult.timeEnd, req.params.orderId]
  );

  res.json({
    success: true,
    data: {
      payResult,
      order: formatOrder({ ...rows[0], status: 'preparing', paid_at: payResult.timeEnd }),
    },
  });
});

// ===== 商家接单 =====
router.post('/orders/:id/accept', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = mysqlNow();
  await pool.execute(
    'UPDATE orders SET status = ?, accepted_at = ? WHERE id = ?',
    ['preparing', now, req.params.id]
  );

  res.json({ success: true, data: formatOrder({ ...rows[0], status: 'preparing', accepted_at: now }) });
});

// ===== 完成订单（用户确认取餐） =====
router.post('/orders/:id/complete', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  const now = mysqlNow();
  await pool.execute(
    'UPDATE orders SET status = ?, completed_at = ? WHERE id = ?',
    ['completed', now, req.params.id]
  );

  res.json({ success: true, data: formatOrder({ ...rows[0], status: 'completed', completed_at: now }) });
});

// ===== 工具函数 =====
function formatOrder(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    storeId: row.store_id,
    storeName: row.store_name,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
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
