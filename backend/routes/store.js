/**
 * 门店路由
 * GET /api/stores — 获取所有门店
 */
const express = require('express');
const { pool } = require('../database');

const router = express.Router();

router.get('/stores', async (req, res) => {
  const [stores] = await pool.execute(
    'SELECT id, name, address, phone, hours, latitude, longitude, is_open as open FROM stores WHERE is_open = 1'
  );

  const result = stores.map((s, i) => ({
    ...s,
    distance: i === 0 ? '约 0.1km' : `约 ${(i + 1) * 0.5}km`,
    open: !!s.open,
  }));

  res.json({ success: true, data: result });
});

module.exports = router;
