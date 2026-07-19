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
  // 读取管理员设定的分类排序（JSON 数组，如 ["面包","蛋糕","饮品"]）
  const [cfgRows] = await pool.execute(
    "SELECT value FROM settings WHERE kkey = 'category_order'"
  );
  const categoryOrder = JSON.parse(cfgRows?.[0]?.value || '[]');

  // 读取在售商品的实际分类
  const [rows] = await pool.execute(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' AND is_available = 1 AND stock > 0"
  );
  const realCategories = rows.map(r => r.category);

  // 排序：管理员配过的排前面，未配置的按字母序排后面；"全部"永远第一位
  const configured = categoryOrder.filter(c => realCategories.includes(c));
  const unconfigured = realCategories.filter(c => !categoryOrder.includes(c)).sort();

  res.json({ success: true, data: ['全部', ...configured, ...unconfigured] });
});

module.exports = router;
