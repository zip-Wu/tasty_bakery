/**
 * 数据库模块 — MySQL 连接池
 * 自动创建数据库、表、种子数据
 */
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'bakery';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

// ========== 连接池 ==========
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
});

// ========== 初始化（创建库 → 建表 → 种子） ==========
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
        id          VARCHAR(64) PRIMARY KEY,
        openid      VARCHAR(128) UNIQUE,
        nickname    VARCHAR(64) DEFAULT '面包爱好者',
        avatar      TEXT,
        phone       VARCHAR(20) DEFAULT '',
        points      INT DEFAULT 0,
        balance     DECIMAL(10,2) DEFAULT 0,
        member_level VARCHAR(32) DEFAULT '',
        is_member   TINYINT DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(64) NOT NULL,
        sort_order INT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(128) NOT NULL,
        price       DECIMAL(10,2) NOT NULL,
        image       TEXT,
        category    VARCHAR(64) DEFAULT '',
        sales       INT DEFAULT 0,
        is_available TINYINT DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(128) NOT NULL,
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

    // 3. 种子数据
    // 分类
    const [[{ cnt: catCnt }]] = await c.query('SELECT COUNT(*) as cnt FROM categories');
    if (catCnt === 0) {
      await c.query(`INSERT INTO categories (name, sort_order) VALUES
        ('吐司',1),('可颂',2),('欧包',3),('贝果',4),('丹麦',5),('蛋糕',6),('咖啡',7)
      `);
    }

    // 商品 — 自动清理历史重复测试数据
    const [[{ cnt: realCnt }]] = await c.query(
      "SELECT COUNT(*) as cnt FROM products WHERE name != '原味馒头' OR price != 8"
    );
    if (realCnt === 0) {
      // 数据库里只有测试数据 — 先清空再插入一条干净的
      await c.query('DELETE FROM products');
      await c.query(`INSERT INTO products (name, price, image, category, sales) VALUES
        ('原味馒头', 8, '', '', 0)
      `);
      console.log('[db] 商品表已重置为默认状态');
    } else if (realCnt > 0) {
      // 用户已经添加了真实商品 — 什么都不做
      console.log('[db] 检测到真实商品数据，跳过种子');
    }

    const [[{ cnt: storeCnt }]] = await c.query('SELECT COUNT(*) as cnt FROM stores');
    if (storeCnt === 0) {
      await c.query(`INSERT INTO stores (name, address, phone, hours, latitude, longitude, is_open) VALUES
        ('大力馒头·格创壹号店', '广东省珠海市香洲区唐家湾镇香山路639号', '0756-1234567', '08:00-21:00', 22.3568, 113.5542, 1)
      `);
    }

    console.log('[db] 初始化完成');
  } finally {
    c.release();
  }
})();

module.exports = { pool, ready };
