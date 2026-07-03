# 🍞 大力馒头 — 面包店扫码点单小程序

> 为「大力馒头·信息港店」开发的完整线上线下融合点单系统。顾客扫码下单，商家实时接单。已在实际门店中稳定运行。

[![Tech Stack](https://img.shields.io/badge/前端-微信小程序原生-green)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Backend](https://img.shields.io/badge/后端-Node.js%20%2B%20Express-blue)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/数据库-MySQL-orange)](https://www.mysql.com/)
[![Deploy](https://img.shields.io/badge/部署-微信云托管-07c160)](https://cloud.weixin.qq.com/)

---

## 📸 项目预览

| 顾客端 | 商家端 |
|:---:|:---:|
| 门店选择 → 商品浏览 → 购物车 → 下单支付 → 订单跟踪 | 订单管理 → 商品管理 → 快速录单 → 营收看板 |

---

## 🏗 技术架构

```
顾客端（微信小程序）          商家管理端（小程序内嵌）
   WXML / WXSS / JS               WXML / WXSS / JS
         │                               │
         └─────── callContainer ──────────┘
                      │
              微信云托管（Node.js + Express）
                      │
                  MySQL 数据库
```

## 🛠 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | 微信小程序原生 | WXML 模板 + WXSS 样式 + JS 逻辑层 |
| 状态管理 | `getApp().globalData` | 轻量全局状态，无需额外依赖 |
| 网络通信 | `wx.cloud.callContainer` | 云托管私有协议，免域名备案 |
| 图片存储 | 微信云存储 (`wx.cloud.uploadFile`) | 商品图片上传，免 OSS |
| 后端框架 | Express.js | RESTful API 设计 |
| 数据库 | MySQL (mysql2) | 连接池 + 自动建表 + 列迁移 |
| 用户认证 | JWT | HS256，12 小时有效期 |
| 支付 | 微信支付 API v3 | RSA-SHA256 签名，模拟降级兼容 |
| 部署 | 微信云托管 | Docker 容器化，自动扩缩容 |

## ✨ 核心功能

### 顾客端
- **门店地图** — 腾讯地图展示门店位置，自动计算距离
- **商品浏览** — 7 类分类筛选，按分类/全部切换
- **购物车** — 悬停胶囊式设计，加减数量，实时计算总价
- **订单支付** — 微信支付 API v3 对接（商户号未开通时自动降级为模拟支付）
- **订单跟踪** — 5 节点时间线：创建 → 支付 → 接单 → 制作完成 → 取餐
- **用户体系** — 微信静默登录，DiceBear 卡通头像，馒头主题随机昵称

### 商家端（小程序内嵌管理后台）
- **订单管理** — 全部/待支付/制作中/待取餐/已完成筛选，一键标记状态
- **实时轮询** — 递归 setTimeout 机制，新订单自动刷新 + 手机震动提醒
- **商品管理** — 新增/编辑/上下架/删除，支持拍照上传商品图
- **快速录单** — 线下收款的销售直接录入系统，自动计入营收统计
- **营收看板** — 今日营收、订单数、状态分布一目了然

### 安全设计
- 所有商家 API 受 JWT 认证中间件保护
- 密码、密钥、数据库凭据全部通过环境变量注入（`.env` 已 gitignore）
- 401 自动清除本地 token 并跳转登录

## 🚀 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/zip-Wu/tasty_bakery.git
cd tasty_bakery

# 2. 后端 — 安装依赖
cd backend
npm install

# 3. 配置环境变量（复制 .env.example 为 .env 后填入真实值）
cp .env.example .env

# 4. 初始化数据库（首次运行）
node seed.js

# 5. 启动后端服务
node app.js
# → http://localhost:80

# 6. 前端 — 用微信开发者工具打开 front_UI/ 目录
# 在 project.config.json 中修改 appid 为你的小程序 AppID
```

## 📁 项目结构

```
tasty_bakery/
├── front_UI/                   # 微信小程序前端
│   ├── app.js                  # 应用入口 + 云托管通信
│   ├── app.json                # 全局配置（页面路由、TabBar）
│   ├── config.js               # 云托管环境配置
│   ├── pages/
│   │   ├── home/               # 首页（Banner、入口、活动）
│   │   ├── store-select/       # 门店选择（地图 + 列表）
│   │   ├── index/              # 点单页（分类/商品/购物车）
│   │   ├── order-confirm/      # 订单确认 + 支付
│   │   ├── order-detail/       # 订单详情 + 时间线
│   │   ├── order-list/         # 订单列表
│   │   ├── logs/               # 个人中心
│   │   ├── admin/              # 商家管理（5 次点击首页 Banner 进入）
│   │   └── auth/               # 登录授权
│   ├── custom-tab-bar/         # 自定义悬浮 TabBar 组件
│   └── images/                 # 静态图片资源
│
├── backend/                    # Node.js 后端服务
│   ├── app.js                  # 服务入口 + 路由挂载
│   ├── database.js             # MySQL 连接池 + 表结构初始化
│   ├── seed.js                 # 种子数据（商品、门店）
│   ├── .env.example            # 环境变量模板（不含真实值）
│   ├── middleware/
│   │   └── auth.js             # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js             # 用户登录/信息 (openid)
│   │   ├── menu.js             # 商品/分类
│   │   ├── orders.js           # 订单/支付
│   │   ├── store.js            # 门店（Haversine 距离计算）
│   │   ├── admin.js            # 商家管理 API
│   │   └── admin-auth.js       # 管理员登录
│   └── services/
│       └── wechat-pay.js       # 微信支付 API v3 封装
│
└── README.md
```

## 🔐 安全说明

本仓库**不包含**任何真实密码、密钥或数据库凭证。所有敏感信息通过环境变量注入：

| 变量 | 用途 | 存储位置 |
|------|------|---------|
| `ADMIN_PASSWORD` | 商家管理后台密码 | `.env`（已 gitignore） |
| `JWT_SECRET` | JWT 签名密钥 | `.env`（已 gitignore） |
| `DB_PASS` | MySQL 连接密码 | `.env`（已 gitignore） |
| `WX_PAY_*` | 微信支付商户凭证 | `.env`（已 gitignore） |

详见 `backend/.env.example` — 列出了所有需要配置的环境变量模板。

## 📄 License

MIT

---

*最后更新：2026-07*
