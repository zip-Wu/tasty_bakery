/**
 * 种子数据 — 首次运行时插入初始商品、分类、门店
 * 用法：node seed.js
 */
const db = require('./database');

console.log('正在初始化数据...');

// ----- 分类 -----
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES (?, ?, ?)');
const categories = [
  [1, '吐司', 1],
  [2, '可颂', 2],
  [3, '欧包', 3],
  [4, '贝果', 4],
  [5, '丹麦', 5],
  [6, '蛋糕', 6],
  [7, '咖啡', 7],
];

db.transaction(() => {
  for (const c of categories) {
    insertCategory.run(...c);
  }
})();
console.log(`  ✓ 分类: ${categories.length} 个`);

// ----- 商品 -----
const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (id, name, price, image, category, sales)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const products = [
  [1, '北海道吐司',   28, 'https://picsum.photos/240/200?random=1',  '吐司', 156],
  [2, '法式可颂',     15, 'https://picsum.photos/240/200?random=2',  '可颂', 203],
  [3, '全麦核桃包',   22, 'https://picsum.photos/240/200?random=3',  '欧包', 89],
  [4, '芝士软欧',     18, 'https://picsum.photos/240/200?random=4',  '欧包', 134],
  [5, '原味贝果',     12, 'https://picsum.photos/240/200?random=5',  '贝果', 78],
  [6, '巧克力丹麦',   20, 'https://picsum.photos/240/200?random=6',  '丹麦', 112],
  [7, '日式盐可颂',   16, 'https://picsum.photos/240/200?random=7',  '可颂', 156],
  [8, '提拉米苏',     32, 'https://picsum.photos/240/200?random=8',  '蛋糕', 67],
  [9, '蒜香法棍',     14, 'https://picsum.photos/240/200?random=9',  '欧包', 95],
  [10, '肉桂卷',      18, 'https://picsum.photos/240/200?random=10', '丹麦', 143],
  [11, '抹茶红豆吐司', 26, 'https://picsum.photos/240/200?random=11', '吐司', 121],
  [12, '美式咖啡',    20, 'https://picsum.photos/240/200?random=12', '咖啡', 210],
];

db.transaction(() => {
  for (const p of products) {
    insertProduct.run(...p);
  }
})();
console.log(`  ✓ 商品: ${products.length} 个`);

// ----- 门店 -----
const insertStore = db.prepare(`
  INSERT OR IGNORE INTO stores (id, name, address, phone, hours, latitude, longitude, is_open)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stores = [
  [1, '囤囤馒头·格创壹号店', '广东省珠海市香洲区唐家湾镇香山路639号', '0756-1234567', '08:00-21:00', 22.3568, 113.5542, 1],
];

db.transaction(() => {
  for (const s of stores) {
    insertStore.run(...s);
  }
})();
console.log(`  ✓ 门店: ${stores.length} 个`);

console.log('\n数据初始化完成。现在可以启动后端：node app.js');
