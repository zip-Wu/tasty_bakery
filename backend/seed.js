/**
 * 种子数据 — 首次运行时插入商品和门店（仅云端执行）
 * 用法：node seed.js
 */
const { pool } = require('./database');

(async () => {
  console.log('正在初始化数据...');

  // ----- 商品（仅一个测试样本） -----
  const products = [
    ['原味馒头', 8, '', '', 0],
  ];

  for (const [name, price, image, category, sales] of products) {
    await pool.execute(
      'INSERT IGNORE INTO products (name, price, image, category, sales) VALUES (?, ?, ?, ?, ?)',
      [name, price, image, category, sales]
    );
  }
  console.log(`  ✓ 商品: ${products.length} 个测试样本`);

  // ----- 门店 -----
  const stores = [
    ['大力馒头·格创壹号店', '广东省珠海市香洲区唐家湾镇香山路639号', '0756-1234567', '08:00-21:00', 22.3568, 113.5542, 1],
  ];

  for (const [name, address, phone, hours, lat, lng, is_open] of stores) {
    await pool.execute(
      'INSERT IGNORE INTO stores (name, address, phone, hours, latitude, longitude, is_open) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, address, phone, hours, lat, lng, is_open]
    );
  }
  console.log(`  ✓ 门店: ${stores.length} 个`);

  console.log('\n数据初始化完成。');
  process.exit(0);
})();
