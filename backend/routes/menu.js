/**
 * 菜单路由 — 商品浏览、分类查询
 */
const express = require('express');
const { pool } = require('../database');

const router = express.Router();

// ===== 获取商品列表 =====
router.get('/products', async (req, res) => {
  const { category } = req.query;

  let sql = 'SELECT id, name, price, image, category, sales FROM products WHERE is_available = 1';
  const params = [];

  if (category && category !== '全部') {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY id';

  const [products] = await pool.execute(sql, params);
  res.json({ success: true, data: products });
});

// ===== 获取分类（从商品数据自动提取） =====
router.get('/categories', async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' AND is_available = 1 ORDER BY category"
  );
  const names = ['全部', ...rows.map(r => r.category)];
  res.json({ success: true, data: names });
});

module.exports = router;
