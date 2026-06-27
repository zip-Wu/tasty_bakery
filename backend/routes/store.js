/**
 * 门店路由 — 获取门店列表（支持真实距离计算）
 * GET /api/stores?lat=22.3667&lng=113.5545
 */
// 从数据库拿"原装"数据 → 在每一条后面贴上新标签（距离、营业状态）→ 返回给前端。原数据没变，只是在每一份后面加了新内容。

const express = require('express');
const { pool } = require('../database');

const router = express.Router();

// Haversine 公式 — 计算两点间的球面距离（单位：km）
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // 地球半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 距离格式化
function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `约 ${km.toFixed(1)}km`;
}

router.get('/stores', async (req, res) => {
  const userLat = parseFloat(req.query.lat);
  const userLng = parseFloat(req.query.lng);

  const [stores] = await pool.execute(
    'SELECT id, name, address, phone, hours, latitude, longitude, is_open as open FROM stores WHERE is_open = 1'
  );

  const result = stores.map(s => {
    const storeLat = parseFloat(s.latitude);
    const storeLng = parseFloat(s.longitude);

    let distance = null;
    if (!isNaN(userLat) && !isNaN(userLng) && !isNaN(storeLat) && !isNaN(storeLng)) {
      const km = haversine(userLat, userLng, storeLat, storeLng);
      distance = formatDistance(km);
    }

    return {
      ...s,
      distance: distance || '未知距离',
      open: !!s.open,
    };
  });

  res.json({ success: true, data: result });
});

module.exports = router;
