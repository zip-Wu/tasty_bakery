# 大力馒头 — 面包店扫码点单小程序

为珠海「大力馒头·信息港店」开发的点单系统。顾客扫码下单，商家在手机端实时接单，已在门店实际使用。

[![Tech Stack](https://img.shields.io/badge/前端-微信小程序原生-green)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Backend](https://img.shields.io/badge/后端-Node.js%20%2B%20Express-blue)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/数据库-MySQL-orange)](https://www.mysql.com/)
[![Deploy](https://img.shields.io/badge/部署-微信云托管-07c160)](https://cloud.weixin.qq.com/)

## 业务流程

| 顾客端 | 商家端 |
|:---:|:---:|
| 门店选择 → 浏览商品 → 购物车 → 下单支付 → 订单跟踪 | 订单管理 → 商品管理 → 快速录单 → 营收看板 |

## 技术架构

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

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | 微信小程序原生 | WXML 模板 + WXSS 样式 + JS 逻辑层 |
| 状态管理 | `getApp().globalData` | 轻量全局状态 |
| 网络通信 | `wx.cloud.callContainer` | 云托管私有协议，免域名备案 |
| 图片存储 | 微信云存储 | `wx.cloud.uploadFile` 直接上传 |
| 后端框架 | Express.js | RESTful API |
| 数据库 | MySQL (mysql2) | 连接池 + 自动建表 + 列迁移 |
| 用户认证 | JWT | HS256，12 小时有效期 |
| 支付 | 微信支付 API v3 | RSA-SHA256 签名，商户号未开通时自动降级模拟支付 |
| 部署 | 微信云托管 | Docker 容器化 |

## 功能列表

### 顾客端
- 门店地图 — 腾讯地图展示门店位置，自动计算距离
- 商品浏览 — 按 7 个分类筛选
- 购物车 — 悬停胶囊式设计，加减数量，实时算总价
- 订单支付 — 微信支付 API v3（未开通商户号时走模拟支付，不调 `wx.requestPayment`）
- 订单跟踪 — 5 状态时间线：创建 → 支付 → 接单 → 制作完成 → 取餐
- 用户体系 — 微信静默登录，DiceBear 生成卡通头像，馒头主题随机昵称

### 商家端（小程序内嵌后台，连续点击首页 Banner 5 次进入）
- 订单管理 — 按状态筛选，一键标记「可取餐」/「已完成」
- 实时轮询 — 递归 setTimeout，新订单自动刷新 + 手机震动
- 商品管理 — 新增、编辑、上下架、删除，支持拍照上传
- 快速录单 — 线下收款直接在系统里记录，自动计入营收和销量
- 营收看板 — 今日营收、订单数、状态分布

### 安全措施
- 商家 API 全部走 JWT 中间件鉴权
- 密码、密钥、数据库凭据通过环境变量注入（`.env` 已加入 `.gitignore`）
- 登录过期自动清除 token 并跳转登录页

## 本地开发

```bash
# 1. 克隆
git clone https://github.com/zip-Wu/tasty_bakery.git
cd tasty_bakery

# 2. 后端
cd backend
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ADMIN_PASSWORD、JWT_SECRET、DB_PASS 等

# 4. 初始化数据库
node seed.js

# 5. 启动
node app.js

# 6. 前端 — 微信开发者工具打开 front_UI/ 目录
#    修改 project.config.json 中的 appid 为你自己的小程序 AppID
```

## 项目结构

```
tasty_bakery/
├── front_UI/                   # 小程序前端
│   ├── app.js                  # 应用入口 + 云托管通信
│   ├── app.json                # 全局配置（页面路由、TabBar）
│   ├── config.js               # 云环境配置
│   ├── pages/
│   │   ├── home/               # 首页
│   │   ├── store-select/       # 门店选择（地图 + 列表）
│   │   ├── index/              # 点单页（分类/商品/购物车）
│   │   ├── order-confirm/      # 订单确认 + 支付
│   │   ├── order-detail/       # 订单详情 + 时间线
│   │   ├── order-list/         # 订单列表
│   │   ├── logs/               # 个人中心
│   │   ├── admin/              # 商家管理
│   │   └── auth/               # 授权登录
│   ├── custom-tab-bar/         # 自定义悬浮 TabBar 组件
│   └── images/                 # 静态图片
│
├── backend/                    # 后端服务
│   ├── app.js                  # 入口 + 路由挂载
│   ├── database.js             # MySQL 连接池 + 表结构初始化
│   ├── seed.js                 # 种子数据（商品、门店）
│   ├── .env.example            # 环境变量模板
│   ├── middleware/
│   │   └── auth.js             # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js             # 用户登录/信息
│   │   ├── menu.js             # 商品/分类
│   │   ├── orders.js           # 订单/支付
│   │   ├── store.js            # 门店（Haversine 距离计算）
│   │   ├── admin.js            # 商家管理 API
│   │   └── admin-auth.js       # 管理员登录
│   └── services/
│       └── wechat-pay.js       # 微信支付 API v3
│
└── README.md
```

## 安全说明

仓库内不含任何真实密码或密钥。以下敏感信息全部通过环境变量注入，`.env` 已加入 `.gitignore`：

| 变量 | 用途 |
|------|------|
| `ADMIN_PASSWORD` | 商家管理后台密码 |
| `JWT_SECRET` | JWT 签名密钥 |
| `DB_PASS` | MySQL 密码 |
| `WX_PAY_*` | 微信支付商户凭证 |

环境变量模板见 `backend/.env.example`。

## License

MIT
