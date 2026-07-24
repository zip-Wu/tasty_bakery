/**
 * 订单路由 — 创建、查询、支付、状态流转
 */
const express = require('express');
const crypto = require('crypto');
const { pool, mysqlNow, generateOrderNo } = require('../database');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

// 路由级 requireUser，/pay/notify 和 /orders/refund/notify 是微信服务端回调，跳过用户认证
router.use((req, res, next) => {
  if (req.path === '/pay/notify' || req.path === '/orders/refund/notify') return next();
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
    const { items, totalPrice, storeId, storeName, pickupTime, remark } = req.body;

    // 关店检查
    const [storeRows] = await pool.execute('SELECT is_open FROM stores LIMIT 1');
    if (storeRows[0] && !storeRows[0].is_open) {
      return res.json({ success: false, message: '门店已打烊，暂无法下单' });
    }

    // 验证 items 结构
    if (!items || !Array.isArray(items) || !items.length) {
      return res.json({ success: false, message: '缺少商品信息' });
    }
    if (!items.every(i => i.id && i.quantity > 0)) {
      return res.json({ success: false, message: '商品数据格式错误' });
    }

    // 服务端按 DB 价格重算总额，不信任客户端传的 totalPrice
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

    // 生成取餐码（顺序编号 001~999，回绕）
    const [seq] = await pool.execute('SELECT COALESCE(MAX(pickup_code), 0) AS last_code FROM orders');
    let nextCode = seq[0].last_code + 1;
    if (nextCode > 999) nextCode = 1;
    const pickupCode = nextCode;

    const order = {
      id: generateId(),
      orderNo: await generateOrderNo('ORD'),
      userId,
      storeId: storeId || null,
      storeName: storeName || '',
      items: JSON.stringify(items),
      totalPrice: serverTotal,
      status: 'pending',
      pickupCode,
      remark: (remark || '').slice(0, 256),
      pickupTime: pickupTime || null,
    };

    await pool.execute(
      `INSERT INTO orders (id, order_no, user_id, store_id, store_name, items, total_price, status, pickup_code, remark, pickup_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.orderNo, order.userId, order.storeId, order.storeName, order.items, order.totalPrice, order.status, order.pickupCode, order.remark, order.pickupTime]
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
  // 验证 URL 中的 userId 与当前登录用户一致
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

  // 验证订单归属
  if (rows[0].user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: '无权查看他人订单' });
  }

  res.json({ success: true, data: formatOrder(rows[0]) });
});

// ========== 退款回调通知（云托管封装方案） ==========
// ⚠️ 必须在所有 /orders/:id/* 路由之前注册，防止 :id 通配符误匹配

router.post('/orders/refund/notify', async (req, res) => {
  const notifyBody = req.body;
  if (!notifyBody) {
    console.error('[refund-notify] req.body 为空');
    return res.json({ errcode: -1, errmsg: 'empty_body' });
  }

  const { returnCode, outTradeNo, refundId, refundStatus } = notifyBody;

  console.log(`[refund-notify] 收到退款回调: order_no=${outTradeNo} refund_id=${refundId} status=${refundStatus}`);

  if (returnCode !== 'SUCCESS') {
    return res.json({ errcode: 0, errmsg: 'ok' });
  }
  if (refundStatus !== 'SUCCESS') {
    console.log(`[refund-notify] 退款非成功 (${refundStatus})，跳过`);
    return res.json({ errcode: 0, errmsg: 'ok' });
  }

  try {
    const [orders] = await pool.execute('SELECT * FROM orders WHERE order_no = ?', [outTradeNo]);
    if (!orders[0]) {
      console.warn(`[refund-notify] 订单不存在: ${outTradeNo}`);
      return res.json({ errcode: 0, errmsg: 'ok' });
    }
    const order = orders[0];

    if (order.status === 'refunded') {
      console.log(`[refund-notify] 订单 ${outTradeNo} 已退款，跳过`);
      return res.json({ errcode: 0, errmsg: 'ok' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        'UPDATE orders SET status = ?, refund_id = ?, refunded_at = NOW() WHERE id = ?',
        ['refunded', refundId, order.id]
      );

      // 恢复库存
      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      for (const item of items) {
        await conn.execute(
          'UPDATE products SET stock = stock + ?, is_available = 1 WHERE id = ?',
          [item.quantity, item.id]
        );
      }

      await conn.commit();
      console.log(`[refund-notify] 订单 ${outTradeNo} 已退款, 库存已恢复`);

      // 退回积分
      const pts = Math.floor(parseFloat(order.total_price));
      if (pts > 0) {
        await pool.execute('UPDATE users SET points = GREATEST(points - ?, 0) WHERE id = ?', [pts, order.user_id]);
        console.log(`[refund-notify] 用户 ${order.user_id} 积分 -${pts}`);
      }
    } catch (innerErr) {
      await conn.rollback();
      throw innerErr;
    } finally {
      conn.release();
    }

    res.json({ errcode: 0, errmsg: 'ok' });
  } catch (err) {
    console.error(`[refund-notify] 处理退款��调失败:`, err.message);
    res.json({ errcode: -1, errmsg: 'process_error' });
  }
});

// ========== 申请退款审核（preparing / completed → 商家审核） ==========
// 统一退款流程：用户申请 → 商家审核 → 批准则微信退款 / 拒绝则恢复原状态
router.post('/orders/:id/refund-request', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.json({ success: false, message: '请填写退款理由' });
    }
    if (reason.length > 256) {
      return res.json({ success: false, message: '退款理由不能超过256个字符' });
    }

    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.json({ success: false, message: '订单不存在' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, message: '无权操作他人订单' });

    const order = rows[0];

    if (order.status !== 'preparing' && order.status !== 'completed') {
      return res.json({ success: false, message: '当前状态不支持申请退款' });
    }

    await pool.execute(
      `UPDATE orders SET status = 'refund_pending', refund_reason = ?, refund_requested_at = NOW(), refund_original_status = ?
       WHERE id = ?`,
      [reason.trim(), order.status, order.id]
    );

    console.log(`[refund-request] 订单 ${order.order_no} 已提交退款申请，理由: ${reason.trim().slice(0, 30)}...`);
    res.json({ success: true, data: { success: true, message: '退款申请已提交，等待商家审核' } });
  } catch (err) {
    console.error('[refund-request] 提交失败:', err.message);
    res.status(500).json({ success: false, message: '提交失败，请稍后重试' });
  }
});

// ========== 更新订单状态（通用） ==========
// 状态机白名单：只能按 pending→preparing→ready→completed 单向前进
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

// ========== 微信支付 — 云托管封装方案（免证书、免签名、免公网回调） ==========
const { createJsapiOrder, config: payConfig } = require('../services/wechat-pay');

const isRealPay = !!payConfig.sub_mch_id;

// ========== 微信支付回调通知（云托管封装方案） ==========
//
// ⚠️ 必须在 /pay/:orderId 之前注册，否则 /pay/:orderId 会贪婪匹配把 notify 当成 orderId
//
// 云托管封装方案的回调特点：
//   1. POST Body 为明文 JSON，无需验签、无需解密（走微信内部私有信道）
//   2. 字段使用小驼峰命名（如 outTradeNo, transactionId, totalFee），与 V2 API 不同
//   3. 仅支付成功时会收到回调，未支付/支付失败需主动调用 queryOrder 查询
//   4. 必须返回 { errcode: 0, errmsg: "ok" }，否则云托管会持续重试最多两天
//   5. 回调可能重复发送，需保证幂等

router.post('/pay/notify', async (req, res) => {
  const notifyBody = req.body;
  if (!notifyBody) {
    console.error('[pay-notify] req.body 为空');
    return res.json({ errcode: -1, errmsg: 'empty_body' });
  }

  // 官方回调字段（小驼峰）
  const { returnCode, resultCode, outTradeNo, transactionId } = notifyBody;

  console.log(`[pay-notify] 收到回调: order_no=${outTradeNo} trade_id=${transactionId}`);

  // 通信标识或业务标识非成功 → 无需处理业务
  if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
    return res.json({ errcode: 0, errmsg: 'ok' });
  }

  try {
    // outTradeNo 可能带 -timestamp 后缀（重试去重用），剥离后查原始 order_no
    const baseOrderNo = outTradeNo.includes('-') ? outTradeNo.substring(0, outTradeNo.lastIndexOf('-')) : outTradeNo;
    const [orders] = await pool.execute('SELECT * FROM orders WHERE order_no = ?', [baseOrderNo]);
    if (!orders[0]) {
      console.warn(`[pay-notify] 订单不存在: ${outTradeNo}`);
      return res.json({ errcode: 0, errmsg: 'ok' });
    }

    const order = orders[0];

    // 事务：订单状态更新 + 库存扣减
    // 事务内用 SELECT...FOR UPDATE 二次确认状态，并发回调只有一个能拿到 pending 行锁
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[current]] = await conn.execute('SELECT status FROM orders WHERE id = ? FOR UPDATE', [order.id]);
      if (current.status !== 'pending') {
        await conn.rollback();
        console.log(`[pay-notify] 订单 ${outTradeNo} 已处理 (状态: ${current.status})，跳过`);
        return res.json({ errcode: 0, errmsg: 'ok' });
      }

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
      console.log(`[pay-notify] 订单 ${outTradeNo} 已更新为 preparing, 支付流水: ${transactionId}`);

      // 积分：每支付 1 元累加 1 积分（向下取整）
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

    // ✅ 必须返回此格式，否则云托管会重复推送
    res.json({ errcode: 0, errmsg: 'ok' });
  } catch (err) {
    console.error(`[pay-notify] 处理回调失败:`, err.message);
    // ⚠️ 返回 errcode != 0 会触发云托管重试（最多两天），用于 DB 故障等临时性问题
    res.json({ errcode: -1, errmsg: 'process_error' });
  }
});

// ========== 微信支付 - 发起支付 ==========
// 必须在 /pay/notify 之后注册（路由匹配按声明顺序）
router.post('/pay/:orderId', async (req, res) => {
  try {
    // 检查支付是否已配置
    if (!isRealPay) {
      return res.json({
        success: false,
        message: '支付服务未配置（缺少 WX_PAY_SUB_MCHID），请先在云托管控制台绑定商户号',
      });
    }

    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);

    if (!rows[0]) {
      return res.json({ success: false, message: '订单不存在' });
    }

    // 验证订单归属
    if (rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权支付他人订单' });
    }

    const order = rows[0];
    if (order.status !== 'pending') {
      return res.json({ success: false, message: '订单状态不允许支付' });
    }

    const openid = req.user.openid;
    if (!openid) {
      return res.json({ success: false, message: '用户未登录，请重新打开小程序' });
    }

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    // 微信 body 限制 127 字节（非字符），中文每字 3 字节，必须按字节截断
    let description = items.map(i => i.name).join('、');
    const MAX_BYTES = 127;
    if (Buffer.byteLength(description, 'utf8') > MAX_BYTES) {
      const suffix = '…';
      const maxContent = MAX_BYTES - Buffer.byteLength(suffix, 'utf8');
      let truncated = '';
      for (const ch of description) {
        const next = truncated + ch;
        if (Buffer.byteLength(next, 'utf8') > maxContent) break;
        truncated = next;
      }
      description = truncated + suffix;
    }
    const total = Math.round(order.total_price * 100); // 元 → 分

    // 统一下单 — out_trade_no 加时间戳后缀，避免取消后重试时商户订单号重复
    const outTradeNo = order.order_no + '-' + Date.now();
    const respdata = await createJsapiOrder({
      outTradeNo,
      total,
      description,
      openid: openid,
    });

    // 记录本次支付使用的 out_trade_no（带后缀），退款时需要它来匹配微信支付订单
    await pool.execute('UPDATE orders SET pay_out_trade_no = ? WHERE id = ?', [outTradeNo, order.id]);

    res.json({
      success: true,
      data: {
        payParams: respdata.payment,
        order: formatOrder(order),
      },
    });
  } catch (err) {
    console.error('[pay] 微信支付下单失败:', err.message);
    res.json({
      success: false,
      message: err.message || '支付发起失败，请稍后重试',
    });
  }
});

// ========== 更新订单备注 ==========
router.put('/orders/:id/remark', async (req, res) => {
  const { remark } = req.body;
  if (typeof remark !== 'string') return res.json({ success: false, message: '备注格式错误' });
  if (remark.length > 256) return res.json({ success: false, message: '备注不能超过256个字符' });

  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.json({ success: false, message: '订单不存在' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, message: '无权操作他人订单' });

  await pool.execute('UPDATE orders SET remark = ? WHERE id = ?', [remark, req.params.id]);
  res.json({ success: true });
});

// ========== 完成订单（用户确认取餐） ==========
// 仅允许 ready 状态完成，防止跳过支付和制作
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
    pickupCode: row.pickup_code != null ? String(row.pickup_code).padStart(3, '0') : '',
    remark: row.remark || '',
    pickupTime: row.pickup_time,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    readyAt: row.ready_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    refundedAt: row.refunded_at,
    refundReason: row.refund_reason || '',
    refundRequestedAt: row.refund_requested_at || null,
    refundReviewedAt: row.refund_reviewed_at || null,
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

// ========== 自动清理定时器：待支付超过 30 分钟的订单自动删除 ==========
setInterval(async () => {
  try {
    const [result] = await pool.execute(
      `DELETE FROM orders WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
    );
    if (result.affectedRows > 0) {
      console.log(`[auto-delete] ${result.affectedRows} 笔过期订单已清理`);
    }
  } catch (err) {
    console.error('[auto-delete] 定时器异常:', err.message);
  }
}, 60000);
