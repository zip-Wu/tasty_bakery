/**
 * 菜单路由 — 商品浏览、分类查询
 */
const express = require('express');
const { pool } = require('../database');

const router = express.Router();

// ========== 获取商品列表 ==========
router.get('/products', async (req, res) => {
  const { category } = req.query;

  let sql = 'SELECT id, name, price, image, category, sales, stock FROM products WHERE is_available = 1 AND stock > 0';
  const params = [];

  if (category && category !== '全部') {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY sort_order ASC, id ASC';

  const [products] = await pool.execute(sql, params);
  res.json({ success: true, data: products });
});

// ========== 获取分类（按 settings 中配置的顺序） ==========
router.get('/categories', async (req, res) => {
  // 读取标签排序配置
  const [cfgRows] = await pool.execute("SELECT value FROM settings WHERE kkey = 'category_order'");
  let ordered = [];
  if (cfgRows.length > 0 && cfgRows[0].value) {
    try { ordered = JSON.parse(cfgRows[0].value); } catch (_) {}
  }

  // 从商品中提取实际存在的标签
  const [rows] = await pool.execute(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' AND is_available = 1 AND stock > 0"
  );
  const existing = new Set(rows.map(r => r.category));

  // 按配置顺序排列，未配置的排末尾（字母序）
  const sorted = ordered.filter(c => existing.has(c));
  const remaining = [...existing].filter(c => !sorted.includes(c)).sort();
  const names = ['全部', ...sorted, ...remaining];

  res.json({ success: true, data: names });
});

module.exports = router;
