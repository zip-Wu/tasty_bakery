/**
 * 菜单路由 — 商品浏览、分类查询
 * GET /api/products   — 获取商品列表（支持 ?category=吐司 过滤）
 * GET /api/categories — 获取全部分类
 */
const express = require('express');
const db = require('../database');

const router = express.Router();

// ===== 获取商品列表 =====
// 可选查询参数：category（分类筛选）
router.get('/products', (req, res) => {
  const { category } = req.query;

  let products;
  if (category && category !== '全部') {
    products = db.prepare(
      'SELECT id, name, price, image, category, sales FROM products WHERE is_available = 1 AND category = ? ORDER BY id'
    ).all(category);
  } else {
    products = db.prepare(
      'SELECT id, name, price, image, category, sales FROM products WHERE is_available = 1 ORDER BY id'
    ).all();
  }

  res.json({ success: true, data: products });
});

// ===== 获取商品分类 =====
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT name FROM categories ORDER BY sort_order').all();
  const names = ['全部', ...rows.map(r => r.name)];

  res.json({ success: true, data: names });
});

module.exports = router;
