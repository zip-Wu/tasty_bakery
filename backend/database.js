/**
 * 数据库模块 — MySQL 连接池 + 首次建表
 *
 * 设计决策：不使用 ORM（如 Sequelize），直接写 SQL
 * - 原因 1：本项目仅 4 张表、27 个 API，ORM 引入的抽象和学习成本大于收益
 * - 原因 2：mysql2/promise 的参数化查询已足够防注入，ORM 的主要安全优势在此规模下不显著
 * - 代价：SQL 与 JS 对象需手动映射（formatOrder 等函数），表增多时维护成本上升
 *
 * 冷启动守护：ready 函数开头检查 orders 表是否已存在，已存在则直接跳过建表，
 * 避免云托管缩容到 0 后每次冷启动都跑 6+ 条冗余 SQL。
 * 全新部署时需先删库再启动，ready 会自动完成首次建表。
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

// ========== 初始化（创建库 → 建表 → 种子数据） ==========
const ready = (async () => {
  // 1. 创建数据库（带重试：MySQL 容器可能尚未就绪）
  await connectWithRetry({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS });
  const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS });
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`[db] 数据库 '${DB_NAME}' 就绪`);

  // 2. 冷启动守护：表已存在则跳过建表（云托管缩容到 0 后每次唤醒都走这条路）
  const c = await pool.getConnection();
  try {
    const [tables] = await c.query(`SHOW TABLES LIKE 'orders'`);
    if (tables.length > 0) {
      console.log('[db] 数据库已初始化，跳过建表');
      return;
    }

    // 3. 首次部署：建表
    await c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           VARCHAR(64) PRIMARY KEY,
        openid       VARCHAR(128) UNIQUE,
        nickname     VARCHAR(64) DEFAULT '大力馒头宝',
        avatar       TEXT,
        points       INT DEFAULT 0,
        nick_number  INT UNIQUE,
        phone        VARCHAR(16) DEFAULT NULL,
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
        description  TEXT,
        gallery      TEXT,
        sales        INT DEFAULT 0,
        stock        INT DEFAULT 0,
        sort_order   INT DEFAULT 0,
        is_available TINYINT DEFAULT 1,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(128) NOT NULL UNIQUE,
        address   VARCHAR(256) DEFAULT '',
        phone     VARCHAR(20) DEFAULT '',
        hours     VARCHAR(32) DEFAULT '周一至周五 11:00~18:30',
        latitude  DOUBLE DEFAULT 0,
        longitude DOUBLE DEFAULT 0,
        is_open   TINYINT DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS settings (
        kkey       VARCHAR(64) PRIMARY KEY,
        value      TEXT
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
        source       VARCHAR(16) DEFAULT 'customer',
        pickup_code  INT,
        remark       VARCHAR(256) DEFAULT '',
        pickup_time  DATETIME,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at      DATETIME,
        ready_at     DATETIME,
        accepted_at  DATETIME,
        completed_at DATETIME,
        refund_id           VARCHAR(64),
        refunded_at         DATETIME,
        refund_reason       VARCHAR(256) DEFAULT NULL,
        refund_requested_at DATETIME DEFAULT NULL,
        refund_reviewed_at       DATETIME DEFAULT NULL,
        refund_original_status  VARCHAR(16) DEFAULT NULL,
        pay_out_trade_no        VARCHAR(80)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 4. 初始化门店
    await c.query(`
      INSERT IGNORE INTO stores (name, address, phone, hours, latitude, longitude, is_open) VALUES
      ('大力馒头铺·信息港店', '珠海市高新区唐家湾镇香山路88号2栋1层101-10室（信息港711便利店后面）', '189-2427-3942', '周一至周五 11:00~18:30', 22.367042, 113.554996, 1)
    `);

    console.log('[db] 初始化完成（首次建表）');
  } finally {
    c.release();
  }
})();

module.exports = { pool, ready, mysqlNow, generateOrderNo };

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

/**
 * 生成可读订单号：前缀 + YYMMDD + 3位当天序号
 * 例 generateOrderNo('ORD') → 'ORD260725001'
 *
 * 序号用 settings 表原子递增（INSERT ... ON DUPLICATE KEY UPDATE），并发安全。
 * settings 是通用键值存储表（与 category_order 同款用法），非补丁代码。
 * 每天从 001 开始，数据库清空后自动归零。
 */
async function generateOrderNo(prefix) {
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const yymmdd = bjNow.getFullYear().toString().slice(2) +
    String(bjNow.getMonth() + 1).padStart(2, '0') +
    String(bjNow.getDate()).padStart(2, '0');

  const seqKey = 'order_seq_' + prefix + yymmdd;

  // 原子递增：键不存在则 INSERT seq=1，存在则 UPDATE seq+1
  await pool.execute(
    "INSERT INTO settings (kkey, value) VALUES (?, '1') ON DUPLICATE KEY UPDATE value = CAST(value AS UNSIGNED) + 1",
    [seqKey]
  );

  const [[{ value }]] = await pool.execute('SELECT value FROM settings WHERE kkey = ?', [seqKey]);
  const seq = parseInt(value);
  // 超过 999 回绕（面包店一天几乎不可能，纯防御）
  const displaySeq = seq > 999 ? ((seq - 1) % 999 + 1) : seq;

  return prefix + yymmdd + String(displaySeq).padStart(3, '0');
}
