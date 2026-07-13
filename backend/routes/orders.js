/**
 * 订单路由 — 创建、查询、支付、状态流转
 */
const express = require('express');
const crypto = require('crypto');
const { pool, mysqlNow } = require('../database');

const router = express.Router();

// 订单 ID 使用时间戳+随机字符串（VARCHAR），而非 INT AUTO_INCREMENT
// 原因：小程序端创建订单时需要立即拿到 ID 拼接确认页 URL，INT 自增 ID 只有 INSERT 后才返回
// 好处：前端无需等后端回传 ID 即可跳转，减少用户等待感知
// 代价：比 INT 占更多存储空间，但订单量（千级）下可忽略
function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ========== 创建订单 ==========
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
      pickupTime: pickupTime || null,
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

// ========== 用户订单列表 ==========
router.get('/orders/user/:userId', async (req, res) => {
  const [orders] = await pool.execute(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.params.userId]
  );

  const result = orders.map(formatOrder);
  res.json({ success: true, data: result });
});

// ========== 订单详情 ==========
router.get('/orders/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  res.json({ success: true, data: formatOrder(rows[0]) });
});

// ========== 更新订单状态（通用） ==========
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

// ========== 微信支付 - 发起支付（智能降级：有凭证真支付，无凭证模拟） ==========
const { createJsapiOrder, generatePrepaySign, decryptNotifyResource, config: payConfig } = require('../services/wechat-pay');

const isRealPay = !!payConfig.mchid;

// 启动时明确告知支付模式（方便排查）
if (isRealPay) {
  console.log('[pay] ✅ 真实支付模式 — 商户号 ' + payConfig.mchid);
} else {
  console.log('[pay] ⚠️  模拟支付模式 — 未配置微信支付商户号，所有支付将直接完成不扣款');
  console.log('[pay]    开通商户号后，添加 WX_PAY_MCHID 等 6 个环境变量并重新部署即可启用真支付');
}

router.post('/pay/:orderId', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);

    if (!rows[0]) {
      return res.json({ success: false, message: '订单不存在' });
    }

    const order = rows[0];
    if (order.status !== 'pending') {
      return res.json({ success: false, message: '订单状态不允许支付' });
    }

    // ========== 模拟支付模式（商户号未开通） ==========
    if (!isRealPay) {
      await processMockPayment(order, res);
      return;
    }

    // ========== 真实微信支付 ==========
    const [users] = await pool.execute('SELECT openid FROM users WHERE id = ?', [order.user_id]);
    if (!users[0] || !users[0].openid) {
      return res.json({ success: false, message: '用户未登录，请重新打开小程序' });
    }

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const description = items.map(i => i.name).join('、').substring(0, 60);
    const total = Math.round(order.total_price * 100);

    const { prepay_id } = await createJsapiOrder({
      outTradeNo: order.order_no,
      total,
      description,
      openid: users[0].openid,
    });

    const payParams = generatePrepaySign(prepay_id);

    res.json({
      success: true,
      data: { payParams, order: formatOrder(order) },
    });
  } catch (err) {
    console.error('[pay] 微信支付下单失败:', err.message, err.status);
    res.json({
      success: false,
      message: err.message || '支付发起失败，请稍后重试',
    });
  }
});

// 模拟支付：直接完成付款（商户号就绪后自动失效）
async function processMockPayment(order, res) {
  const now = mysqlNow();

  await pool.execute(
    'UPDATE orders SET status = ?, paid_at = ? WHERE id = ?',
    ['preparing', now, order.id]
  );

  // 扣减库存：逐条 UPDATE，未使用事务包裹
  //
  // 设计决策：本项目日订单量 < 100，并发冲突概率极低，逐条更新已满足需求
  // GREATEST(stock - ?, 0) 确保库存不会扣成负数（兜底保护）
  // CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END → 库存归零时自动下架
  //
  // 已知局限：高并发场景下（如秒杀）两条订单可能同时读到 stock=1 并各自扣减，
  // 最终 stock 变为负数（GREATEST 兜底为 0，但超卖已发生）
  // 生产级解决方案：SELECT ... FOR UPDATE 行锁 + 事务，或 Redis 原子扣减
  const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  for (const item of items) {
    await pool.execute(
      'UPDATE products SET stock = GREATEST(stock - ?, 0), is_available = CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END WHERE id = ?',
      [item.quantity, item.quantity, item.id]
    );
  }

  // 返回时标记 mock，前端无需调 wx.requestPayment
  res.json({
    success: true,
    data: {
      mock: true,
      mockResult: { success: true, tradeNo: 'MOCK' + Date.now(), timeEnd: now },
      order: formatOrder({ ...order, status: 'preparing', paid_at: now }),
    },
  });
}

// ========== 微信支付回调通知 ==========
router.post('/pay/notify', async (req, res) => {
  const rawBody = req.rawBody; // 由 app.js 中的 express.raw 提供
  let notifyData;

  try {
    const bodyJson = JSON.parse(rawBody);

    // 解密回调中的加密资源
    if (bodyJson.resource) {
      notifyData = decryptNotifyResource(bodyJson.resource);
    } else {
      notifyData = bodyJson;
    }
  } catch (err) {
    console.error('[pay-notify] 解密回调失败:', err.message);
    return res.status(200).json({ code: 'FAIL', message: 'decrypt failed' });
  }

  const { out_trade_no, transaction_id, trade_state } = notifyData;

  console.log(`[pay-notify] 收到回调: order_no=${out_trade_no} trade_state=${trade_state}`);

  if (trade_state !== 'SUCCESS') {
    return res.status(200).json({ code: 'SUCCESS' }); // 非成功状态无需处理
  }

  try {
    // 查询订单
    const [orders] = await pool.execute('SELECT * FROM orders WHERE order_no = ?', [out_trade_no]);
    if (!orders[0]) {
      console.warn(`[pay-notify] 订单不存在: ${out_trade_no}`);
      return res.status(200).json({ code: 'SUCCESS' });
    }

    const order = orders[0];
    if (order.status !== 'pending') {
      console.log(`[pay-notify] 订单 ${out_trade_no} 已处理 (状态: ${order.status})，跳过`);
      return res.status(200).json({ code: 'SUCCESS' });
    }

    const now = mysqlNow();

    // 更新订单状态
    await pool.execute(
      'UPDATE orders SET status = ?, paid_at = ? WHERE id = ?',
      ['preparing', now, order.id]
    );

    // 扣减库存
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    for (const item of items) {
      await pool.execute(
        'UPDATE products SET stock = GREATEST(stock - ?, 0), is_available = CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END WHERE id = ?',
        [item.quantity, item.quantity, item.id]
      );
    }

    console.log(`[pay-notify] ✅ 订单 ${out_trade_no} 已更新为 preparing`);
    res.status(200).json({ code: 'SUCCESS' });
  } catch (err) {
    console.error(`[pay-notify] 处理订单失败:`, err.message);
    res.status(200).json({ code: 'FAIL', message: err.message });
  }
});

// ========== 商家接单 ==========
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

// ========== 完成订单（用户确认取餐） ==========
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

  // 订单完成时累加销量
  const items = typeof rows[0].items === 'string' ? JSON.parse(rows[0].items) : rows[0].items;
  for (const item of items) {
    await pool.execute(
      'UPDATE products SET sales = sales + ? WHERE id = ?',
      [item.quantity, item.id]
    );
  }

  res.json({ success: true, data: formatOrder({ ...rows[0], status: 'completed', completed_at: now }) });
});

// ========== 工具函数 ==========
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
