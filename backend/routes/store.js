/**
 * 门店路由 — 获取门店列表（支持真实距离计算）
 * GET /api/stores?lat=22.3667&lng=113.5545
 */
// 对数据库原始数据追加距离计算和营业状态标记后返回

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
    // 不再过滤 is_open：顾客端停接单后也要展示门店信息（地址/电话/营业时间），由前端根据 open 字段提示当前无法预定
    'SELECT id, name, address, phone, hours, latitude, longitude, is_open as open FROM stores'
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

// 门店开关状态（公开，供顾客端和首页查询）
router.get('/store/status', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT name, hours, is_open FROM stores LIMIT 1'
  );
  if (!rows[0]) {
    return res.json({ success: true, data: { open: false, name: '', hours: '', notice: '门店未配置' } });
  }
  const s = rows[0];

  // 关店说明与恢复时间由商家在后台关店时填写，存 settings 键值表。
  // 只有两个短字符串，不值得单开一张表，复用 settings 即可。
  const [cfgRows] = await pool.execute(
    "SELECT kkey, value FROM settings WHERE kkey IN ('close_reason', 'resume_at')"
  );
  const cfg = {};
  cfgRows.forEach(r => { cfg[r.kkey] = (r.value || '').trim(); });

  // 关店只影响是否接受新预定；营业时间照常展示（本店为预定制，非营业时间同样接受预定）
  // notice 是关店提示的补充说明，前端拿它当副标题：商家填了就用商家的，没填则退回营业时间。
  // 这里不重复"预定已结束"之类的状态词——状态由前端标题统一表达。
  let notice = '';
  if (!s.is_open) {
    if (cfg.close_reason) {
      notice = cfg.resume_at ? `${cfg.close_reason}，${cfg.resume_at}开始接单` : cfg.close_reason;
    } else {
      notice = `营业时间 ${s.hours || '请咨询门店'}`;
    }
  }

  res.json({
    success: true,
    data: {
      open: !!s.is_open,
      name: s.name,
      hours: s.hours,
      notice,
      closeReason: cfg.close_reason || '',
      resumeAt: cfg.resume_at || '',
    }
  });
});

module.exports = router;
