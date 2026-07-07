# 大力馒头 — 面包店扫码点单小程序

为珠海「大力馒头·信息港店」开发的全栈点单系统。顾客扫码下单，商家手机端实时接单，已在门店实际使用。

[![MiniProgram](https://img.shields.io/badge/前端-微信小程序原生-07c160)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Backend](https://img.shields.io/badge/后端-Node.js_%2B_Express-339933)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/数据库-MySQL-4479A1)](https://www.mysql.com/)
[![Auth](https://img.shields.io/badge/认证-JWT-000000)](https://jwt.io/)
[![Payment](https://img.shields.io/badge/支付-微信支付V3-09BB07)](https://pay.weixin.qq.com/)
[![Deploy](https://img.shields.io/badge/部署-微信云托管_Docker-07c160)](https://cloud.weixin.qq.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## 功能预览

### 顾客端

| 首页 | 门店选择（腾讯地图 + 距离计算） |
|:---:|:---:|
| ![首页](./screenshots/01-home.png) | ![门店选择](./screenshots/02-store-select.png) |

| 点单（分类 + 购物车） | 订单确认 + 支付 |
|:---:|:---:|
| ![点单页](./screenshots/03-order.png) | ![订单确认](./screenshots/04-order-confirm.png) |

| 订单状态时间线 — 制作中 → 待取餐 |
|:---:|
| <table><tr><td width="50%"><img src="./screenshots/05-order-detail-wait.png" alt="制作中"/></td><td width="50%"><img src="./screenshots/05-order-detail-ready.png" alt="待取餐"/></td></tr></table> |

| 订单列表（按状态筛选） | 个人中心 |
|:---:|:---:|
| ![订单列表](./screenshots/06-order-list.png) | ![个人中心](./screenshots/07-profile.png) |

### 商家管理端

| 订单管理（状态筛选 + 实时轮询） | 商品管理（增删改 + 上下架） |
|:---:|:---:|
| ![订单管理](./screenshots/08-admin-orders.png) | ![商品管理](./screenshots/09-admin-products.png) |

| 快速录单（线下收款记录） | 营收看板 |
|:---:|:---:|
| ![快速录单](./screenshots/10-admin-quick-sale.png) | ![营收看板](./screenshots/11-admin-dashboard.png) |

### 完整流程演示

| 顾客下单全流程 | 商家接单处理 |
|:---:|:---:|
| ![顾客下单](./screenshots/12-order-flow.gif) | ![商家接单](./screenshots/13-admin-flow.gif) |

---

## 技术架构

```mermaid
graph TB
    subgraph 前端
        A[顾客端小程序<br/>WXML / WXSS / JS]
        B[商家管理端<br/>内嵌后台]
    end

    subgraph 通信层
        C[wx.cloud.callContainer<br/>云托管私有协议]
    end

    subgraph 服务端
        D[Express.js 路由层]
        E[JWT 认证中间件]
        F[微信支付 API v3<br/>RSA-SHA256]
    end

    subgraph 数据层
        G[(MySQL<br/>连接池)]
        H[微信云存储<br/>商品图片]
    end

    A --> C
    B --> C
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
```

---

## 数据库设计

```mermaid
erDiagram
    users {
        VARCHAR id PK "微信用户ID"
        VARCHAR openid UK "微信OpenID"
        VARCHAR nickname "随机馒头昵称"
        TEXT avatar "DiceBear头像URL"
        VARCHAR phone "手机号"
        INT points "积分"
        DECIMAL balance "余额"
        INT coupon_count "优惠券数量"
        VARCHAR member_level "会员等级"
        TINYINT is_member "是否会员"
        DATETIME created_at
        DATETIME updated_at
    }

    products {
        INT id PK "自增"
        VARCHAR name "商品名"
        DECIMAL price "单价"
        TEXT image "图片URL"
        VARCHAR category "分类"
        INT sales "销量"
        INT stock "库存"
        TINYINT is_available "是否上架"
        DATETIME created_at
    }

    stores {
        INT id PK "自增"
        VARCHAR name UK "门店名"
        VARCHAR address "地址"
        VARCHAR phone "电话"
        VARCHAR hours "营业时间"
        DOUBLE latitude "纬度"
        DOUBLE longitude "经度"
        TINYINT is_open "是否营业"
    }

    orders {
        VARCHAR id PK "订单ID"
        VARCHAR order_no UK "订单号"
        VARCHAR user_id FK "用户ID"
        INT store_id FK "门店ID"
        VARCHAR store_name "门店名"
        TEXT items "订单商品JSON"
        DECIMAL total_price "总金额"
        VARCHAR status "pending/paid/preparing/ready/completed"
        DATETIME created_at
        DATETIME paid_at
        DATETIME accepted_at
        DATETIME completed_at
    }

    users ||--o{ orders : "下单"
    stores ||--o{ orders : "所属"
```

---

## 业务流程

<table>
<tr>
<td width="50%" align="center"><b>顾客端</b></td>
<td width="50%" align="center"><b>商家端</b></td>
</tr>
<tr>
<td>门店选择 → 浏览商品 → 购物车 → 下单支付 → 订单跟踪</td>
<td>扫码/隐藏入口登录 → 订单管理 → 商品管理 → 快速录单 → 营收看板</td>
</tr>
</table>

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | 微信小程序原生 | WXML 模板 + WXSS 样式 + JS 逻辑层 |
| 状态管理 | `getApp().globalData` | 轻量全局状态 |
| 网络通信 | `wx.cloud.callContainer` | 云托管私有协议，免域名备案 |
| 图片存储 | 微信云存储 | `wx.cloud.uploadFile` 直接上传 |
| 后端框架 | Express.js | RESTful API，6 个路由模块 |
| 数据库 | MySQL (mysql2) | 连接池 + 自动建表 + 兼容性列迁移 |
| 用户认证 | JWT | HS256，12 小时有效期 |
| 支付 | 微信支付 API v3 | RSA-SHA256 签名；商户号未开通时自动降级模拟支付 |
| 部署 | 微信云托管 | Docker 容器化 |

---

## 功能详情

### 顾客端（4 个 Tab）

- **首页** — Banner + 门店自提/邮寄服务入口 + 活动滚动区；连续点击 Banner 5 次进入商家后台
- **门店选择** — 腾讯地图标记门店位置，Haversine 公式实时计算距离，显示营业状态
- **点单页** — 左分类右商品经典布局，7 个分类筛选；底部悬浮购物车栏，加减数量、实时总价
- **订单确认** — 商品清单 + 金额汇总 + 微信支付（模拟降级模式）
- **订单详情** — 5 状态时间线：创建 → 支付 → 接单 → 制作完成 → 取餐，每步带时间戳
- **订单列表** — 状态 Tab 筛选，下拉刷新，支持再来一单
- **个人中心** — DiceBear 卡通头像 + 馒头主题昵称 + 积分/优惠券/余额资产卡片

### 商家端（小程序内嵌管理后台）

- **订单管理** — 按状态筛选全部订单，一键标记「可取餐」/「已完成」
- **实时轮询** — 递归 `setTimeout`，新订单自动刷新 + 手机震动提醒
- **商品管理** — 新增/编辑/上下架/删除商品，支持拍照上传图片
- **快速录单** — 线下收款直接录入系统，自动扣减库存、计入营收
- **营收看板** — 今日营收、订单总数、各状态分布一览

### 安全措施

- 商家 API 全部经由 JWT 中间件鉴权
- 密码、密钥、数据库凭据通过环境变量注入（`.env` 已 `.gitignore`）
- 登录过期自动清除 token 并跳转登录页

---

## 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/zip-Wu/tasty_bakery.git
cd tasty_bakery

# 2. 启动后端
cd backend
npm install
cp .env.example .env
# 编辑 .env，填入 ADMIN_PASSWORD、JWT_SECRET、DB_PASS 等
node seed.js    # 初始化数据库 + 种子数据
node app.js     # 启动 Express 服务

# 3. 启动前端
# 微信开发者工具 → 导入项目 → 选择 front_UI/ 目录
# project.config.json 中修改 appid 为你的小程序 AppID
```

---

## 项目结构

```
tasty_bakery/
├── front_UI/                   # 小程序前端（9 页面 + 1 组件）
│   ├── app.js                  # 应用入口 + 云托管 callContainer 封装
│   ├── app.json                # 页面路由 + 自定义 TabBar 配置
│   ├── config.js               # 云环境 ID 与服务名
│   ├── pages/
│   │   ├── home/               # 首页（Banner + 功能入口 + 活动区）
│   │   ├── store-select/       # 门店选择（腾讯地图 + Haversine 距离）
│   │   ├── index/              # 点单（分类筛选 + 购物车）
│   │   ├── order-confirm/      # 订单确认 + 支付
│   │   ├── order-detail/       # 5 状态时间线
│   │   ├── order-list/         # 订单列表（状态 Tab + 下拉刷新）
│   │   ├── logs/               # 个人中心
│   │   ├── admin/              # 商家管理（订单/商品/录单/营收）
│   │   └── auth/               # 商家登录
│   ├── custom-tab-bar/         # 自定义悬浮 TabBar 组件
│   └── images/                 # 静态图片资源
│
├── backend/                    # Node.js 后端
│   ├── app.js                  # Express 入口 + 路由挂载
│   ├── database.js             # MySQL 连接池 + 自动建表 + 列迁移
│   ├── seed.js                 # 种子数据（商品、门店）
│   ├── Dockerfile              # 云托管容器镜像
│   ├── .env.example            # 环境变量模板
│   ├── middleware/
│   │   └── auth.js             # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js             # 用户登录 / 个人信息
│   │   ├── menu.js             # 商品列表 / 分类
│   │   ├── orders.js           # 订单 CRUD / 支付
│   │   ├── store.js            # 门店列表（含距离计算）
│   │   ├── admin.js            # 商家管理 API
│   │   └── admin-auth.js       # 管理员登录
│   └── services/
│       └── wechat-pay.js       # 微信支付 API v3 封装
│
├── screenshots/                # 功能截图与演示 GIF
└── README.md
```

---

## 环境变量

仓库内不含任何真实密码或密钥，所有敏感信息通过 `.env` 注入（已 `.gitignore`）：

| 变量 | 用途 |
|------|------|
| `ADMIN_PASSWORD` | 商家管理后台密码 |
| `JWT_SECRET` | JWT 签名密钥 |
| `DB_PASS` | MySQL 密码 |
| `WX_PAY_*` | 微信支付商户凭证（商户号、私钥等） |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | 数据库连接参数 |

模板文件：`backend/.env.example`

---

## License

MIT
