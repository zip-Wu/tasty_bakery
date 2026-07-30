# 大力馒头铺 — 预定取餐小程序

> 覆盖完整的预定-支付-通知-取餐全链路，为珠海「大力馒头铺·信息港店」开发，已在门店实际使用。
> 顾客下单支付后授权微信订阅通知或预留手机号，商家制作完成时自动推送取餐提醒——顾客无需盯着进度，等通知到店即可。

[![MiniProgram](https://img.shields.io/badge/前端-微信小程序原生-07c160)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Backend](https://img.shields.io/badge/后端-Node.js_Express-339933)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/数据库-MySQL_8.0-4479A1)](https://www.mysql.com/)
[![Auth](https://img.shields.io/badge/认证-JWT_HS256-000000)](https://jwt.io/)
[![Payment](https://img.shields.io/badge/支付-微信支付_V2-09BB07)](https://pay.weixin.qq.com/)
[![Deploy](https://img.shields.io/badge/部署-微信云托管_Docker-07c160)](https://cloud.weixin.qq.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## 扫码体验

<p align="center">
  <img src="./screenshots/小程序码.jpg" width="220" alt="大力馒头铺小程序码">
  <br/>
  <sub>微信扫一扫，即刻体验</sub>
</p>

---

## 快速了解

顾客扫码进入小程序、选商品加购后，进入订单确认页（可填写备注），微信支付下单。支付成功后跳转到通知授权页，引导顾客授权微信订阅消息或预留手机号——之后即可在订单详情页追踪制作进度。

同一时间，商家端 10 秒轮询检测新订单，手机震动 + 播放提示音（静音模式下也会响），顶部弹出「N 笔新订单」横幅。商家在制作清单中按商品聚合查看所有待制作订单，制作完成后标记「可取餐」，系统**异步推送微信服务通知**给顾客（含取餐码、商品名、门店电话）。顾客凭取餐码到店取餐，订单完成。

```mermaid
flowchart LR
    A[顾客扫码] -->|选商品加购| B[下单支付]
    B -->|wx.requestPayment| C[支付成功]
    C -->|跳转授权页| D[授权微信通知<br/>或预留手机号]
    D -->|进入订单详情| E[5 秒轮询追踪进度]

    B -.->|10 秒轮询检测| F[商家震动+提示音]
    F -->|制作清单聚合| G[按商品批量制作]
    G -->|标记可取餐| H[异步推送微信通知<br/>取餐码 + 门店电话]
    H -->|顾客收到通知| I[到店取餐完成]
```

### 项目规模

| 指标 | 数值 |
|------|------|
| 前端页面 | 11 个 |
| 后端路由模块 | 6 个 |
| 后端服务模块 | 2 个（支付 + 订阅通知） |
| 数据库表 | 5 张 |
| 商家端功能 Tab | 5 个 |
| 订单状态筛选 | 7 种 |

---

## 功能一览

### 顾客端

| 功能 | 说明 |
|------|------|
| **门店选择** | 腾讯地图定位 + Haversine 公式计算球面距离，小于 1km 显示米、大于 1km 显示公里 |
| **商品浏览** | 左侧分类筛选（后端动态提取，非硬编码）、右侧商品列表，售罄商品灰显 |
| **购物车** | 页面级状态管理，切分类不丢数据，结算后自动清空 |
| **商品详情** | 轮播图 + 完整描述 + 月销量，支持从详情页直接加购 |
| **下单支付** | 订单确认后服务端按数据库真实价格重算总额，杜绝前端篡改；通过微信支付完成付款 |
| **订单追踪** | 4 步时间线（创建 → 制作 → 可取餐 → 完成），页面每 5 秒自动刷新状态，完成/退款后停止轮询 |
| **取餐通知** | 支付成功后跳转授权页，引导顾客授权微信订阅消息；订单详情页持续提醒授权。商家标记可取餐时自动推送通知（含取餐码） |
| **手机号收集** | 授权页及订单详情页均可输入/修改/清除手机号，后端 `^1[3-9]\d{9}$` 正则校验，商家端可见 |
| **退款申请** | 已支付订单（preparing / ready / completed）支持提交退款申请，商家审核批准后原路退回 |
| **个人中心** | DiceBear 自动头像 + "大力馒头宝001~999"顺序编号昵称 + 积分 |

### 商家端

| 功能 | 说明 |
|------|------|
| **实时订单提醒** | 每 10 秒轮询检测新订单，新订单到达时手机震动 + 提示音（`obeyMuteSwitch: false` 静音模式下也会响），顶部弹出「N 笔新订单」横幅 |
| **订单管理** | 7 种状态筛选（全部/退款审核/制作中/待取餐/已完成/待支付/已退款），支持分页加载，显示顾客昵称、手机号、备注 |
| **制作清单** | 待制作订单按**商品聚合**，按今日/昨日/前天/更早分组，显示每款商品需做份数及涉及顾客数——后厨直接照单制作 |
| **退款审核** | 查看退款理由 + 来源状态（制作中→红色标签，已完成→灰色标签），批准→微信原路退款+回库存+退积分，拒绝→恢复原状态 |
| **商品管理** | 新增/编辑/上下架/删除，支持封面图及多图轮播上传至微信云存储，可调整排序 |
| **快速录单** | 线下现金收款专用，选好商品确认后自动生成 OFF 前缀订单号，直接完成并扣库存 |
| **营收看板** | 支持日/月/年三种维度切换、日期选择器回溯历史数据；今日营收、当月汇总、当年汇总、商品销量排行、订单明细；角标跨天常亮 |
| **门店开关** | 一键打烊，顾客端立刻显示"已打烊"提示并拦住新下单 |

### 鉴权机制

顾客端和商家端采用两套独立的鉴权方案：

- **顾客端**：微信云托管网关在每次 API 请求中自动注入 `X-WX-OPENID` 头部，后端 `requireUser` 中间件根据 openid 查出该用户并挂载到 `req.user`。所有涉及用户数据的接口强制使用 `req.user.id` 而非客户端传入的 userId，防止横向越权（IDOR）。

- **商家端**：管理员密码登录后，后端签发 JWT（HS256 签名，12 小时有效）。之后每次 admin API 请求在 `Authorization` 头中携带 `Bearer <token>`，`requireAdmin` 中间件验证签名。同一 IP 每分钟最多 5 次登录尝试。

---

## 取餐通知系统

商家标记「可取餐」时，后端异步调用微信订阅消息 API，向顾客推送一条服务通知。通知内容包含取餐码、商品名、下单时间、门店电话——顾客凭通知即可到店取餐，无需一直盯着订单详情页刷新。

```
商家标记 ready → admin.js POST /ready
  ├─ 更新订单状态 + ready_at（同步，核心操作）
  └─ sendSubscribeMessage()（异步，失败不影响 ready）
       ├─ getAccessToken() → 内存缓存，提前 5 分钟自动刷新
       ├─ POST /cgi-bin/message/subscribe/send
       │   模板字段：date3(点餐时间) / thing6(商品名) / thing7(温馨提醒)
       │             phone_number32(联系电话) / character_string12(取餐编号)
       └─ 43101（用户未授权/配额用完）→ 返回 {success:false} 不抛异常
```

**关键设计决策：**

- **两处授权入口**：支付成功后跳转 `notify-auth` 页做**首次强引导**（顾客刚付完钱、注意力还在小程序里）；订单详情页中持续展示授权按钮作为**兜底**（万一首次跳过，后面还能再授权）
- **手机号兜底**：顾客未授权微信通知时，可预留手机号让商家电话联系——授权页和订单详情页均可管理
- **异步非阻塞**：通知发送失败（网络波动、用户未授权、access_token 过期）不阻塞订单状态更新，用 `.catch()` 静默吞错

---

## 界面预览

### 顾客端 — 浏览与点单

| 首页 | 点单 | 门店选择 | 商品详情 | 个人中心 |
|:---:|:---:|:---:|:---:|:---:|
| <a href="./screenshots/01-首页.png" target="_blank"><img src="./screenshots/01-首页.png" width="130"></a> | <a href="./screenshots/02-点单页-全部.png" target="_blank"><img src="./screenshots/02-点单页-全部.png" width="130"></a> | <a href="./screenshots/05-门店列表页.jpg" target="_blank"><img src="./screenshots/05-门店列表页.jpg" width="130"></a> | <a href="./screenshots/06-商品详情页.png" target="_blank"><img src="./screenshots/06-商品详情页.png" width="130"></a> | <a href="./screenshots/04-我的.png" target="_blank"><img src="./screenshots/04-我的.png" width="130"></a> |

*首页展示门店入口和活动区，点单页按分类筛选商品并加入购物车。点击小图可查看原始截图。*

### 顾客端 — 下单与取餐

| 确认支付 | 通知授权 | 制作中 | 待取餐 | 已完成 |
|:---:|:---:|:---:|:---:|:---:|
| <a href="./screenshots/07-支付页.png" target="_blank"><img src="./screenshots/07-支付页.png" width="100"></a> | <a href="./screenshots/14-通知授权页.png" target="_blank"><img src="./screenshots/14-通知授权页.png" width="100"></a> | <a href="./screenshots/08-订单详情-制作中.png" target="_blank"><img src="./screenshots/08-订单详情-制作中.png" width="100"></a> | <a href="./screenshots/08-订单详情-待取餐.png" target="_blank"><img src="./screenshots/08-订单详情-待取餐.png" width="100"></a> | <a href="./screenshots/08-订单详情-已完成.png" target="_blank"><img src="./screenshots/08-订单详情-已完成.png" width="100"></a> |

*完整取餐流程：确认订单 → 微信支付 → 跳转通知授权页引导顾客授权订阅消息/留手机号 → 进入订单详情页追踪进度。制作中/待取餐页面展示取餐码和通知授权入口，商家标记可取餐后推送微信通知，取餐完成时间线全亮。*

### 顾客端 — 更多视图

| 售罄分类 | 订单列表-全部 | 订单列表-制作中 | 订单列表-待取餐 | 订单列表-待支付 | 订单列表-已完成 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| <a href="./screenshots/02-点单页-无库存.png" target="_blank"><img src="./screenshots/02-点单页-无库存.png" width="115"></a> | <a href="./screenshots/03-订单页-全部.png" target="_blank"><img src="./screenshots/03-订单页-全部.png" width="115"></a> | <a href="./screenshots/03-订单页-制作中.png" target="_blank"><img src="./screenshots/03-订单页-制作中.png" width="115"></a> | <a href="./screenshots/03-订单页-待取餐.png" target="_blank"><img src="./screenshots/03-订单页-待取餐.png" width="115"></a> | <a href="./screenshots/03-订单页-待支付.png" target="_blank"><img src="./screenshots/03-订单页-待支付.png" width="115"></a> | <a href="./screenshots/03-订单页-已完成.png" target="_blank"><img src="./screenshots/03-订单页-已完成.png" width="115"></a> |

*售罄分类自动聚合、订单列表多状态 Tab 切换（制作中/待取餐/待支付/已完成）。*

### 商家端 — 运营管理

| 登录 | 订单管理 | 制作清单 | 退款审核 | 商品管理 | 快速录单 | 营收(日) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| <a href="./screenshots/09-商家登录页.png" target="_blank"><img src="./screenshots/09-商家登录页.png" width="110"></a> | <a href="./screenshots/10-订单管理.png" target="_blank"><img src="./screenshots/10-订单管理.png" width="110"></a> | <a href="./screenshots/15-制作清单.png" target="_blank"><img src="./screenshots/15-制作清单.png" width="110"></a> | <a href="./screenshots/10-订单管理-退款审核.png" target="_blank"><img src="./screenshots/10-订单管理-退款审核.png" width="110"></a> | <a href="./screenshots/11-商品管理.png" target="_blank"><img src="./screenshots/11-商品管理.png" width="110"></a> | <a href="./screenshots/12-快速录单.png" target="_blank"><img src="./screenshots/12-快速录单.png" width="110"></a> | <a href="./screenshots/13-营收看板-日视图.png" target="_blank"><img src="./screenshots/13-营收看板-日视图.png" width="110"></a> |

*管理后台通过首页"加热方法"卡片连续点击 7 次进入，5 个 Tab（订单管理 / 制作清单 / 商品管理 / 快速录单 / 营收看板）。点击小图可查看原始截图。*

### 商家端 — 更多视图

| 订单管理-制作中 | 营收看板-月视图 | 商品编辑 |
|:---:|:---:|:---:|
| <a href="./screenshots/10-订单管理-制作中.png" target="_blank"><img src="./screenshots/10-订单管理-制作中.png" width="150"></a> | <a href="./screenshots/13-营收看板-月视图.png" target="_blank"><img src="./screenshots/13-营收看板-月视图.png" width="150"></a> | <a href="./screenshots/11-商品管理-编辑.png" target="_blank"><img src="./screenshots/11-商品管理-编辑.png" width="150"></a> |

*订单管理支持 7 种状态筛选（制作中/待取餐/已完成/待支付/已退款/退款审核）。营收看板支持日/月/年三维切换，月视图展示月度汇总+每日营业额+商品销量排行。*

---

## 技术架构

```mermaid
flowchart TB
    subgraph 小程序端["微信小程序 · 原生框架"]
        direction LR
        CUST["顾客端<br/>4 Tab + 11 页面"] ~~~ ADM["商家端<br/>内嵌管理后台"]
    end

    subgraph 通信层["微信云托管私有信道"]
        CC["wx.cloud.callContainer<br/>免域名备案 / 免 HTTPS 证书"]
    end

    subgraph 服务端["Node.js Express"]
        direction LR
        RT["6 路由模块<br/>auth / menu / orders<br/>store / admin / admin-auth"]
        MW["认证中间件<br/>JWT HS256 · 12h<br/>requireUser 身份守卫"]
        PAY["支付服务<br/>云托管封装微信支付 V2<br/>下单 / 查询 / 退款"]
        NOTIFY["通知服务<br/>微信订阅消息<br/>access_token 缓存"]
    end

    subgraph 数据层["数据存储"]
        direction LR
        DB[("MySQL 8.0<br/>utf8mb4 · 连接池")] ~~~ COS["微信云存储<br/>商品图片"]
    end

    小程序端 --> CC --> 服务端
    服务端 --> 数据层
```

**支付**：采用微信云托管封装的微信支付接口（V2 风格），免证书管理、免 RSA 签名、无需配置公网回调地址。商户号通过环境变量 `WX_PAY_SUB_MCHID` 注入，未配置时支付功能不可用。

---

## 订单状态机

```mermaid
sequenceDiagram
    actor 顾客
    participant 前端
    participant 后端
    participant 微信支付
    actor 商家

    顾客->>前端: 提交订单
    前端->>后端: POST /api/orders
    后端-->>前端: 订单创建 (pending)

    顾客->>前端: 确认支付
    前端->>后端: POST /api/pay/:orderId
    后端->>微信支付: 统一下单
    微信支付-->>后端: prepay_id
    后端-->>前端: 支付参数
    前端->>微信支付: wx.requestPayment
    微信支付-->>后端: 回调通知
    后端->>后端: 库存扣减 + 积分累加
    后端-->>前端: status → preparing

    Note over 商家: 商家端每 10 秒轮询检测新订单（震动+提示音+横幅）

    商家->>后端: 标记可取餐
    后端-->>前端: status → ready

    Note over 前端,后端: 商家标记可取餐后异步推送微信订阅通知给顾客

    商家->>后端: 标记已取餐
    后端->>后端: 累加商品销量
    后端-->>前端: status → completed

    Note over 顾客,商家: 退款旁路：preparing/ready/completed → refund_pending → 商家审核 → refunded
    Note over 顾客,商家: 退款通知回调：微信异步通知 → 恢复库存 + 退积分
```

**约束规则**：

- 价格校验：服务端按数据库真实价格重算总额，与客户端传入值偏差超过 0.01 元则拒绝
- 库存保护：`BEGIN TRANSACTION` + `SELECT ... FOR UPDATE` 行锁，库存不足回滚整个事务
- 回调幂等：支付回调中用 `FOR UPDATE` 二次确认订单状态，并发回调只有一个能通过
- 超时清理：pending 超过 30 分钟自动删除

---

## 数据库设计

共 5 张表。不使用 ORM——4 张业务表的规模下直接写 SQL 比引入 Sequelize 更清晰可控。

```mermaid
erDiagram
    users {
        VARCHAR id PK "用户ID"
        VARCHAR openid UK "微信OpenID"
        VARCHAR nickname "大力馒头宝001~999"
        TEXT avatar "DiceBear头像URL"
        INT points "积分"
        INT nick_number UK "顺序编号(001~999)"
        VARCHAR phone "手机号"
        DATETIME created_at "注册时间"
        DATETIME updated_at "更新时间"
    }

    products {
        INT id PK "自增"
        VARCHAR name "商品名"
        DECIMAL price "单价"
        TEXT image "封面图cloud://URL"
        VARCHAR category "动态分类"
        TEXT description "商品描述"
        TEXT gallery "多图轮播(JSON数组)"
        INT sales "累计销量"
        INT stock "库存"
        INT sort_order "排序权重"
        TINYINT is_available "上下架"
        DATETIME created_at "创建时间"
    }

    stores {
        INT id PK "自增"
        VARCHAR name UK "门店名"
        VARCHAR address "地址"
        VARCHAR phone "电话"
        VARCHAR hours "营业时间"
        DOUBLE latitude "纬度"
        DOUBLE longitude "经度"
        TINYINT is_open "营业中"
    }

    orders {
        VARCHAR id PK "订单ID"
        VARCHAR order_no UK "ORD/前缀+日期+序号"
        VARCHAR user_id FK "所属用户"
        INT store_id FK "所属门店"
        VARCHAR store_name "门店名(冗余)"
        TEXT items "商品JSON"
        DECIMAL total_price "总金额"
        VARCHAR status "状态机"
        VARCHAR source "来源(customer/offline)"
        INT pickup_code "取餐码"
        VARCHAR remark "顾客备注"
        DATETIME pickup_time "预约取餐时间"
        DATETIME created_at "创建时间"
        DATETIME paid_at "支付时间"
        DATETIME ready_at "可取餐时间"
        DATETIME accepted_at "接单时间"
        DATETIME completed_at "完成时间"
        VARCHAR refund_id "微信退款单号"
        DATETIME refunded_at "退款时间"
        VARCHAR refund_reason "退款理由"
        DATETIME refund_requested_at "申请退款时间"
        DATETIME refund_reviewed_at "审核时间"
        VARCHAR refund_original_status "退款前状态"
        VARCHAR pay_out_trade_no "微信商户订单号"
    }

    users ||--o{ orders : "一个用户可下多笔订单"
    stores ||--o{ orders : "一笔订单属于一个门店"

    settings {
        VARCHAR kkey PK "键名"
        TEXT value "值"
    }
```

`database.js` 实现了自动建表 + 冷启动守护：先检查 orders 表是否存在，已存在则跳过建表，避免云托管缩容到 0 后每次冷启动都执行一遍建表 SQL。`seed.js` 提供初始种子数据（1 个门店 + 1 个测试商品）。

---

## 技术实现细节

### settings 通用键值表

`settings` 表采用 `(kkey, value)` 键值结构，同一张表承载了三个独立功能——无需为每种配置单独建表：

```
settings 表用途：
  ├─ order_seq_ORD{YYMMDD}    → 线上订单日序号（原子递增 → 订单号 ORD260730001）
  ├─ order_seq_OFF{YYMMDD}    → 线下录单日序号（原子递增 → 订单号 OFF260730001）
  └─ category_order           → 分类显示顺序（JSON 数组 → ["面包","蛋糕","饮品"]）
```

序号生成的原子性通过 MySQL 的 `INSERT ... ON DUPLICATE KEY UPDATE` 保证——一条 SQL 完成"键不存在则插入 seq=1，存在则 seq+1"，无竞态条件。

### 分类动态排序

商品分类不硬编码。商家在管理端通过上移/下移按钮调整分类顺序 → 后端将 JSON 数组写入 `settings.category_order` → 顾客端 `/api/categories` 读取该配置，按配置顺序排列，未配置的分类自动追加到末尾。新增商品只需填写新分类名，无需改代码。

### 前端 `_show` 标记防图片闪烁

点单页切换分类时，不做"按分类重建数组"（会导致 item 的 DOM 节点销毁重建、`<image>` 重新加载、出现短暂白屏闪烁）。改为：所有商品在 `onLoad` 时一次性加载完毕，每个 item 挂一个 `_show` 布尔标记，切换分类时只翻转标记值，用 CSS `display:none` 控制显隐。DOM 节点始终不销毁 → 图片不重载 → 切换零闪烁。

---

## 项目结构

```
tasty_bakery/
├── front_UI/                     # 微信小程序前端
│   ├── app.js                    # 入口 · callContainer 封装 · 全局分享注入
│   ├── app.json                  # 页面路由 · 自定义 TabBar
│   ├── config.js                 # 云环境 ID
│   ├── pages/
│   │   ├── home/                 # 首页（Banner + 功能入口 + 隐藏管理后台）
│   │   ├── store-select/         # 门店选择（腾讯地图 + Haversine 距离）
│   │   ├── index/                # 点单（分类筛选 + 购物车）
│   │   ├── product-detail/       # 商品详情（轮播图 + 加购）
│   │   ├── order-confirm/        # 订单确认 + 微信支付
│   │   ├── order-detail/         # 订单追踪（4 步时间线 + 通知授权 + 退款）
│   │   ├── order-list/           # 订单列表（状态 Tab + 下拉刷新）
│   │   ├── notify-auth/          # 通知授权页（支付成功后强引导授权+留手机号）
│   │   ├── logs/                 # 个人中心
│   │   ├── admin/                # 商家后台（订单/制作清单/商品/录单/营收 5 个 Tab）
│   │   └── privacy/              # 隐私政策
│   └── custom-tab-bar/           # 自定义悬浮 TabBar 组件
│
├── backend/                      # Node.js 后端
│   ├── app.js                    # Express 入口 · 路由挂载 · 优雅关闭
│   ├── database.js               # MySQL 连接池 · 自动建表 · 冷启动守护
│   ├── seed.js                   # 种子数据
│   ├── Dockerfile                # 云托管容器镜像
│   ├── middleware/
│   │   └── auth.js               # JWT 签发/验证 · requireUser 身份守卫
│   ├── routes/
│   │   ├── auth.js               # 微信 code2session · 用户 CRUD
│   │   ├── menu.js               # 商品列表 · 分类提取 · 月销统计
│   │   ├── orders.js             # 订单创建 · 微信支付 · 状态流转 · 退款 · 退款回调
│   │   ├── store.js              # 门店列表 · Haversine 距离
│   │   ├── admin.js              # 管理 API（订单/商品/录单/营收/制作清单/门店开关）
│   │   └── admin-auth.js         # 管理员登录 · 频率限制
│   └── services/
│       ├── wechat-pay.js         # 云托管微信支付封装（下单/查询/退款）
│       └── wechat-notify.js      # 微信订阅消息推送（access_token 缓存 + 发送）
│
└── README.md
```

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/zip-Wu/tasty_bakery.git
cd tasty_bakery

# 2. 启动后端
cd backend
npm install
cp .env.example .env   # 编辑填入 ADMIN_PASSWORD / JWT_SECRET / DB_PASS
node seed.js            # 初始化数据库 + 种子数据
node app.js             # 启动 Express（默认 80 端口）

# 3. 启动前端
# 微信开发者工具 → 导入项目 → 选择 front_UI/ 目录
# 修改 project.config.json 中的 appid
```

**环境变量**（通过 `.env` 注入，仓库不含任何明文凭据）：

| 变量 | 用途 | 必需 |
|------|------|:---:|
| `ADMIN_PASSWORD` | 商家后台登录密码 | 是 |
| `JWT_SECRET` | JWT 签名密钥 | 是 |
| `DB_PASS` | MySQL 密码 | 是 |
| `WX_APP_ID` / `WX_APP_SECRET` | 微信 code2session | 是 |
| `WX_PAY_SUB_MCHID` | 微信支付子商户号 | 支付需要 |

---

## 生产部署

系统运行在微信云托管上。以下是在生产环境中验证过的关键决策：

**冷启动** — 云托管长时间无流量会将实例缩容到 0，下次请求需要重新拉镜像、启动容器、初始化数据库，耗时 10-30 秒。前端 `callContainer` 默认超时无法覆盖这个时长。解决方式：在云托管控制台将最小实例数设为 1（月费约二三十元）。

**优雅关闭** — 缩容或重新部署时云托管发送 `SIGTERM` 信号。app.js 中注册了该信号：先调用 `server.close()` 停止接收新请求，等待当前请求处理完毕，再执行 `pool.end()` 释放数据库连接池。防止支付回调在写入数据库中途被强杀。

**健康检查** — `/health` 端点并非简单返回 200，而是实际执行 `SELECT 1` 探测 MySQL。如果数据库挂了但 Node 进程仍存活，负载均衡能检测到并将流量切走。

**异步异常兜底** — Express 4 不会自动捕获 async 路由中抛出的异常。引入 `express-async-errors` 将所有未捕获的异步异常转发到全局错误处理，避免请求挂起无响应。

**CORS** — 仅允许 `https://servicewechat.com` 跨域访问。

**密钥启动校验** — `ADMIN_PASSWORD` 和 `JWT_SECRET` 未配置时直接 `process.exit(1)` 拒绝启动，不会带着空密码跑起来。

---

## 安全加固

- 价格服务端重算：不信任客户端传入的 `totalPrice`，后端根据商品 ID 查数据库真实价格重新计算并对比
- 库存事务保护：`BEGIN TRANSACTION` + `SELECT ... FOR UPDATE` 行锁，库存不足自动回滚
- 支付回调幂等：回调处理器内用 `FOR UPDATE` 二次确认状态，同一笔订单的并发回调只有一个能生效
- IDOR 防护：`requireUser` 中间件通过 `X-WX-OPENID` 注入 `req.user`，所有涉及用户 ID 的接口强制校验归属
- JWT 认证：HS256 签名、12 小时过期、密钥通过环境变量注入，启动时校验必填
- 登录频率限制：管理员登录同一 IP 每分钟最多 5 次
- 状态机白名单：仅允许 `pending → preparing → ready → completed`，禁止跳过或回退
- 用户隐私：`customerResponse()` 返回的字段不含 openid，日志中 openid 使用 SHA256 截断
- 退款审核：用户提交申请 → 商家审核 → 批准才执行原路退款，拒绝则恢复订单原状态
- 退款回调幂等：微信退款结果通知独立端点处理，已退款订单跳过，事务内恢复库存 + 退积分

---

## License

MIT
