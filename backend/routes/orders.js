/**
 * 订单路由 — 创建、查询、支付、状态流转
 */
const express = require('express');
const crypto = require('crypto');
const { pool, mysqlNow } = require('../database');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

// WHY 安全：路由级 requireUser 中间件，确保所有订单操作都绑定到真实用户身份
// /pay/notify 是微信服务器回调，不适用用户认证，故跳过
router.use((req, res, next) => {
  if (req.path === '/pay/notify') return next();
  requireUser(req, res, next);
});

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
    const userId = req.user.id;
    const { items, totalPrice, storeId, storeName, pickupTime } = req.body;

    // 验证 items 结构
    if (!items || !Array.isArray(items) || !items.length) {
      return res.json({ success: false, message: '缺少商品信息' });
    }
    if (!items.every(i => i.id && i.quantity > 0)) {
      return res.json({ success: false, message: '商品数据格式错误' });
    }

    // WHY 安全：服务端根据数据库真实价格重算总额，不信任客户端传入的 totalPrice
    const ids = items.map(i => i.id);
    const placeholders = ids.map(() => '?').join(',');
    const [dbProducts] = await pool.execute(
      `SELECT id, price FROM products WHERE id IN (${placeholders})`,
      ids
    );
    const priceMap = {};
    dbProducts.forEach(p => { priceMap[p.id] = p.price; });

    let serverTotal = 0;
    for (const item of items) {
      const dbPrice = priceMap[item.id];
      if (!dbPrice) {
        return res.json({ success: false, message: `商品已下架，请刷新页面` });
      }
      serverTotal += dbPrice * item.quantity;
    }

    if (Math.abs(serverTotal - totalPrice) > 0.01) {
      return res.json({ success: false, message: '价格异常，请刷新后重试' });
    }

    const order = {
      id: generateId(),
      orderNo: 'ORD' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex').toUpperCase(),
      userId,
      storeId: storeId || null,
      storeName: storeName || '',
      items: JSON.stringify(items),
      totalPrice: serverTotal,
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
    res.status(500).json({ success: false, message: '创建订单失败，请稍后重试' });
  }
});

// ========== 用户订单列表 ==========
router.get('/orders/user/:userId', async (req, res) => {
  // WHY 安全：验证 URL 中的 userId 与当前登录用户一致，禁止查看他人订单
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权查看他人订单' });
  }

  const [orders] = await pool.execute(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
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

  // WHY 安全：验证订单归属，禁止查看他人订单详情
  if (rows[0].user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权查看他人订单' });
  }

  res.json({ success: true, data: formatOrder(rows[0]) });
});

// ========== 更新订单状态（通用） ==========
// WHY 安全：状态必须属于 ALLOWED_STATUSES 白名单，且不能在任意状态间跳转
const ALLOWED_STATUSES = ['pending', 'preparing', 'ready', 'completed'];
const TRANSITIONS = {
  pending:   ['preparing'],
  preparing: ['ready'],
  ready:     ['completed'],
  completed: [],
};

router.post('/orders/:id/status', async (req, res) => {
  const { status } = req.body;

  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `无效状态: ${status}` });
  }

  // 禁止手动设置 paid（需走支付流程）和 completed（需走取餐确认流程）
  if (status === 'completed') {
    return res.status(403).json({ success: false, message: '请通过取餐确认流程完成订单' });
  }

  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  if (rows[0].user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权修改他人订单' });
  }

  if (!TRANSITIONS[rows[0].status]?.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `不允许从 "${rows[0].status}" 直接变为 "${status}"`,
    });
  }

  await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

  const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: formatOrder(updated[0]) });
});

// ========== 微信支付 - 发起支付（智能降级：有凭证真支付，无凭证模拟） ==========
const { createJsapiOrder, generatePrepaySign, decryptNotifyResource, verifyNotifySign, config: payConfig } = require('../services/wechat-pay');

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

    // WHY 安全：验证订单归属，禁止支付他人订单
    if (rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权支付他人订单' });
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
    const openid = req.user.openid;
    if (!openid) {
      return res.json({ success: false, message: '用户未登录，请重新打开小程序' });
    }

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const description = items.map(i => i.name).join('、').substring(0, 60);
    const total = Math.round(order.total_price * 100);

    const { prepay_id } = await createJsapiOrder({
      outTradeNo: order.order_no,
      total,
      description,
      openid: openid,
    });

    const payParams = generatePrepaySign(prepay_id);

    res.json({
      success: true,
      data: { payParams, order: formatOrder(order) },
    });
  } catch (err) {
    console.error('[pay] 微信支付下单失败:', err);
    res.json({
      success: false,
      message: '支付发起失败，请稍后重试',
    });
  }
});

// 模拟支付：直接完成付款（商户号就绪后自动失效）
// WHY 安全：使用事务 + 行锁（FOR UPDATE）防止库存超卖
async function processMockPayment(order, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 更新订单状态
    const now = mysqlNow();
    await conn.execute(
      'UPDATE orders SET status = ?, paid_at = ? WHERE id = ?',
      ['preparing', now, order.id]
    );

    // 扣减库存（逐条获取行锁，防止并发超卖）
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    for (const item of items) {
      const [[row]] = await conn.execute(
        'SELECT stock FROM products WHERE id = ? FOR UPDATE',
        [item.id]
      );
      if (!row || row.stock < item.quantity) {
        throw new Error(`商品库存不足 (id=${item.id}, 库存=${row ? row.stock : 0}, 需要=${item.quantity})`);
      }
      await conn.execute(
        'UPDATE products SET stock = stock - ?, is_available = CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END WHERE id = ?',
        [item.quantity, item.quantity, item.id]
      );
    }

    await conn.commit();

    // 积分：每支付 1 元累加 1 积分（向下取整），仅提供情绪价值
    const earnedPoints = Math.floor(parseFloat(order.total_price));
    if (earnedPoints > 0) {
      await pool.execute('UPDATE users SET points = points + ? WHERE id = ?', [earnedPoints, order.user_id]);
      console.log(`[pay-mock] 用户 ${order.user_id} 积分 +${earnedPoints}`);
    }

    res.json({
      success: true,
      data: {
        mock: true,
        mockResult: { success: true, tradeNo: 'MOCK' + Date.now(), timeEnd: now },
        order: formatOrder({ ...order, status: 'preparing', paid_at: now }),
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error('[pay] 模拟支付失败:', err.message);
    res.status(500).json({ success: false, message: '支付处理失败，请稍后重试' });
  } finally {
    conn.release();
  }
}

// ========== 微信支付回调通知 ==========
router.post('/pay/notify', async (req, res) => {
  const rawBody = req.rawBody; // 由 app.js 中的 express.raw 提供
  let notifyData;

  // WHY 安全：验证微信支付回调签名，确保回调确实来自微信支付服务器（非伪造）
  // 此前 verifyNotifySign 从未被任何路由调用——回调实际是零验签状态
  if (!verifyNotifySign(req.headers, rawBody)) {
    console.error('[pay-notify] 签名验证失败，拒绝回调');
    return res.status(401).json({ code: 'FAIL', message: 'signature verification failed' });
  }

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

    // WHY 安全：使用事务保证订单更新与库存扣减的原子性
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const now = mysqlNow();
      await conn.execute(
        'UPDATE orders SET status = ?, paid_at = ? WHERE id = ?',
        ['preparing', now, order.id]
      );

      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      for (const item of items) {
        const [[row]] = await conn.execute(
          'SELECT stock FROM products WHERE id = ? FOR UPDATE',
          [item.id]
        );
        if (!row || row.stock < item.quantity) {
          throw new Error(`库存不足: id=${item.id}`);
        }
        await conn.execute(
          'UPDATE products SET stock = stock - ?, is_available = CASE WHEN stock - ? <= 0 THEN 0 ELSE is_available END WHERE id = ?',
          [item.quantity, item.quantity, item.id]
        );
      }

      await conn.commit();
      console.log(`[pay-notify] 订单 ${out_trade_no} 已更新为 preparing`);

      // 积分：每支付 1 元累加 1 积分（向下取整），仅提供情绪价值
      const earnedPoints = Math.floor(parseFloat(order.total_price));
      if (earnedPoints > 0) {
        await pool.execute('UPDATE users SET points = points + ? WHERE id = ?', [earnedPoints, order.user_id]);
        console.log(`[pay-notify] 用户 ${order.user_id} 积分 +${earnedPoints}`);
      }
    } catch (innerErr) {
      await conn.rollback();
      throw innerErr;
    } finally {
      conn.release();
    }

    res.status(200).json({ code: 'SUCCESS' });
  } catch (err) {
    console.error(`[pay-notify] 处理订单失败:`, err.message);
    res.status(200).json({ code: 'FAIL', message: err.message });
  }
});

// ========== 完成订单（用户确认取餐） ==========
// WHY 安全：仅允许 ready 状态的订单完成，防止跳过支付和制作流程
router.post('/orders/:id/complete', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);

  if (!rows[0]) {
    return res.json({ success: false, message: '订单不存在' });
  }

  if (rows[0].user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权操作他人订单' });
  }

  if (rows[0].status !== 'ready') {
    return res.json({ success: false, message: '订单尚未制作完成，无法取餐' });
  }

  const now = mysqlNow();
  await pool.execute(
    'UPDATE orders SET status = ?, completed_at = ? WHERE id = ?',
    ['completed', now, req.params.id]
  );

  // 订单完成时累加销量（仅首次 complete 累加，防重复操作）
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
    readyAt: row.ready_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
  };
}

module.exports = router;

// ========== 自动完成定时器：ready 超过 1 小时的订单自动标记 completed ==========
setInterval(async () => {
  try {
    const [result] = await pool.execute(
      `UPDATE orders SET status = 'completed', completed_at = NOW()
       WHERE status = 'ready' AND ready_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)`
    );
    if (result.affectedRows > 0) {
      console.log(`[auto-complete] ${result.affectedRows} 笔订单自动完成`);
    }
  } catch (err) {
    console.error('[auto-complete] 定时器异常:', err.message);
  }
}, 60000);
