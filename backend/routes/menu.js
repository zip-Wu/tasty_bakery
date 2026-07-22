/**
 * 菜单路由 — 商品浏览、分类查询
 */
const express = require('express');
const { pool } = require('../database');

const router = express.Router();

// ========== 获取商品列表 ==========
router.get('/products', async (req, res) => {
  const { category } = req.query;

  // 去掉 `AND stock > 0` 过滤：让所有上架商品都显示（包括 0 库存 / 售罄），
  // 否则商家在管理端新加未填库存的商品会看不见。
  let sql = 'SELECT id, name, price, image, category, description, gallery, sales, stock FROM products WHERE is_available = 1';
  const params = [];

  if (category && category !== '全部') {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY sort_order ASC, id ASC';

  const [products] = await pool.execute(sql, params);

  // 一次性拉近 30 天已完成订单，JS 侧按 productId 累计月销
  const [orders] = await pool.execute(
    "SELECT items FROM orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
  );
  const monthlyMap = {};
  for (const order of orders) {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    for (const item of items) {
      monthlyMap[item.id] = (monthlyMap[item.id] || 0) + item.quantity;
    }
  }
  for (const p of products) {
    p.monthlySales = monthlyMap[p.id] || 0;
  }

  res.json({ success: true, data: products });
});

// ========== 获取单商品详情（用于详情页：含完整描述 + 图库 + 月销） ==========
router.get('/products/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.json({ success: false, message: '无效的商品ID' });

  const [rows] = await pool.execute(
    'SELECT id, name, price, image, category, description, gallery, sales, stock, is_available FROM products WHERE id = ?',
    [id]
  );

  if (!rows[0]) return res.json({ success: false, message: '商品不存在' });

  const product = rows[0];

  // 月销：拉近 30 天已完成订单，JS 侧解析 items JSON 统计该商品出现次数
  const [orders] = await pool.execute(
    "SELECT items FROM orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
  );
  let monthlySales = 0;
  for (const order of orders) {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    for (const item of items) {
      if (item.id === id) monthlySales += item.quantity;
    }
  }

  res.json({
    success: true,
    data: {
      ...product,
      monthlySales: monthlySales || 0,
    }
  });
});

// ========== 获取分类（按 settings 中配置的顺序） ==========
router.get('/categories', async (req, res) => {
  // 读取管理员设定的分类排序（JSON 数组，如 ["面包","蛋糕","饮品"]）
  const [cfgRows] = await pool.execute(
    "SELECT value FROM settings WHERE kkey = 'category_order'"
  );
  const categoryOrder = JSON.parse(cfgRows?.[0]?.value || '[]');

  // 读取在售商品的实际分类（不再过滤 stock，让无库存的也出现在分类里）
  const [rows] = await pool.execute(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' AND is_available = 1"
  );
  const realCategories = rows.map(r => r.category);

  // 排序：管理员配过的排前面，未配置的按字母序排后面；"全部"永远第一位
  const configured = categoryOrder.filter(c => realCategories.includes(c));
  const unconfigured = realCategories.filter(c => !categoryOrder.includes(c)).sort();

  res.json({ success: true, data: ['全部', ...configured, ...unconfigured] });
});

module.exports = router;
