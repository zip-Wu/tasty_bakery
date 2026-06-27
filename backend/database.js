/**
 * 数据库模块 — MySQL 连接池
 * 自动创建数据库和表结构，并初始化门店
 */
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'bakery';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

// ========== 连接池（设置时区为北京时间 UTC+8） ==========
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

// ========== 初始化（创建库 → 建表） ==========
const ready = (async () => {
  // 1. 创建数据库
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
    // 兼容旧表：如果缺 stock 列则补齐
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
