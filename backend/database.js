/**
 * 数据库模块 — SQLite 初始化 + 表结构
 * 使用 better-sqlite3（同步 API，简单可靠，适合单机部署）
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'bakery.db');
const db = new Database(DB_PATH);

// 开启 WAL 模式，提升并发读写性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== 建表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    openid      TEXT UNIQUE,
    nickname    TEXT DEFAULT '面包爱好者',
    avatar      TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    points      INTEGER DEFAULT 0,
    balance     REAL DEFAULT 0,
    member_level TEXT DEFAULT '',
    is_member   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    price       REAL NOT NULL,
    image       TEXT DEFAULT '',
    category    TEXT NOT NULL,
    sales       INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS stores (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    address   TEXT DEFAULT '',
    phone     TEXT DEFAULT '',
    hours     TEXT DEFAULT '08:00-21:00',
    latitude  REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    is_open   INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           TEXT PRIMARY KEY,
    order_no     TEXT UNIQUE NOT NULL,
    user_id      TEXT NOT NULL,
    store_id     INTEGER,
    store_name   TEXT DEFAULT '',
    items        TEXT NOT NULL,
    total_price  REAL NOT NULL,
    status       TEXT DEFAULT 'pending',
    pickup_time  TEXT,
    created_at   TEXT DEFAULT (datetime('now','localtime')),
    paid_at      TEXT,
    accepted_at  TEXT,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
