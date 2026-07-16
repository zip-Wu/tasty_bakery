/**
 * 数据库模块 — MySQL 连接池 + 自动建表
 *
 * 设计决策：不使用 ORM（如 Sequelize），直接写 SQL
 * - 原因 1：本项目仅 4 张表、27 个 API，ORM 引入的抽象和学习成本大于收益
 * - 原因 2：mysql2/promise 的参数化查询已足够防注入，ORM 的主要安全优势在此规模下不显著
 * - 原因 3：自动建表 + 列迁移（ALTER TABLE）比 ORM 的 sync 更可控，不会意外删列
 * - 代价：SQL 与 JS 对象需手动映射（formatOrder 等函数），表增多时维护成本上升
 */
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'bakery';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

// ========== 连接池（时区设为 UTC+8 北京时间，避免云托管服务器 UTC 时区导致时间偏移） ==========
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  timezone: '+08:00',
});

// ========== 数据库连接重试（MySQL 启动慢于 Node 容器时自动等待） ==========
async function connectWithRetry(config, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await mysql.createConnection(config);
      await conn.end();
      if (i > 0) console.log('[db] MySQL 连接成功 (第' + (i + 1) + '次尝试)');
      return;
    } catch (err) {
      if (i < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        console.warn('[db] 连接失败 (' + (i + 1) + '/' + maxRetries + '): ' + err.message + ' — ' + (delay / 1000) + '秒后重试');
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ========== 连接池异常监听 ==========
pool.on('error', (err) => {
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('[db] 数据库连接丢失，可能 MySQL 服务器已重启');
  } else {
    console.error('[db] 连接池异常:', err.message);
  }
});

// ========== 初始化（创建库 → 建表 → 列迁移 → 种子数据） ==========
const ready = (async () => {
  // 1. 创建数据库（带重试：MySQL 容器可能尚未就绪）
  await connectWithRetry({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS });
  const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS });
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`[db] 数据库 '${DB_NAME}' 就绪`);

  // 2. 建表
  const c = await pool.getConnection();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           VARCHAR(64) PRIMARY KEY,
        openid       VARCHAR(128) UNIQUE,
        nickname     VARCHAR(64) DEFAULT '面包爱好者',
        avatar       TEXT,
        phone        VARCHAR(20) DEFAULT '',
        points       INT DEFAULT 0,
        balance      DECIMAL(10,2) DEFAULT 0,
        coupon_count INT DEFAULT 0,
        member_level VARCHAR(32) DEFAULT '',
        is_member    TINYINT DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS products (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(128) NOT NULL,
        price        DECIMAL(10,2) NOT NULL,
        image        TEXT,
        category     VARCHAR(64) DEFAULT '',
        sales        INT DEFAULT 0,
        stock        INT DEFAULT 0,
        is_available TINYINT DEFAULT 1,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // 兼容旧表：如果缺 stock 列则补齐（新增库存管理功能后，已有部署的数据库缺少此列）
    // 设计意图：避免全量删表重建，保留历史订单数据
    const [stockCols] = await c.query(`SHOW COLUMNS FROM products LIKE 'stock'`);
    if (stockCols.length === 0) {
      await c.query(`ALTER TABLE products ADD COLUMN stock INT DEFAULT 0`);
      console.log('[db] 已补全 products.stock 列');
    }
    // 兼容旧表：如果缺 source 列则补齐（区分顾客下单 / 商家录单）
    const [sourceCols] = await c.query(`SHOW COLUMNS FROM orders LIKE 'source'`);
    if (sourceCols.length === 0) {
      await c.query(`ALTER TABLE orders ADD COLUMN source VARCHAR(16) DEFAULT 'customer'`);
      console.log('[db] 已补全 orders.source 列');
    }

    await c.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(128) NOT NULL UNIQUE,
        address   VARCHAR(256) DEFAULT '',
        phone     VARCHAR(20) DEFAULT '',
        hours     VARCHAR(32) DEFAULT '08:00-21:00',
        latitude  DOUBLE DEFAULT 0,
        longitude DOUBLE DEFAULT 0,
        is_open   TINYINT DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id           VARCHAR(64) PRIMARY KEY,
        order_no     VARCHAR(64) UNIQUE NOT NULL,
        user_id      VARCHAR(64) NOT NULL,
        store_id     INT,
        store_name   VARCHAR(128) DEFAULT '',
        items        TEXT NOT NULL,
        total_price  DECIMAL(10,2) NOT NULL,
        status       VARCHAR(16) DEFAULT 'pending',
        pickup_time  DATETIME,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at      DATETIME,
        accepted_at  DATETIME,
        completed_at DATETIME
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 3. 初始化门店
    await c.query(`
      INSERT IGNORE INTO stores (name, address, phone, hours, latitude, longitude, is_open) VALUES
      ('大力馒头·信息港店', '珠海市高新区唐家湾镇香山路88号2栋1层101-10室（信息港711便利店后面）', '0756-1234567', '08:00-21:00', 22.366749, 113.554455, 1)
    `);

    console.log('[db] 初始化完成');
  } finally {
    c.release();
  }
})();

module.exports = { pool, ready, mysqlNow };

/**
 * 北京时间格式化的当前时间字符串（YYYY-MM-DD HH:MM:SS）
 * 云托管服务器默认为 UTC，必须显式指定 Asia/Shanghai
 */
function mysqlNow() {
  const now = new Date();
  const bj = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return bj.getFullYear() + '-' +
    String(bj.getMonth() + 1).padStart(2, '0') + '-' +
    String(bj.getDate()).padStart(2, '0') + ' ' +
    String(bj.getHours()).padStart(2, '0') + ':' +
    String(bj.getMinutes()).padStart(2, '0') + ':' +
    String(bj.getSeconds()).padStart(2, '0');
}
