# 大力馒头小程序 — 代码审查报告

> 审查日期：2025-06-26  
> 审查范围：`front_UI/`（前端） + `backend/`（后端），共约 30 个核心文件  
> 总体评价：**架构清晰、代码规范，已具备完整业务流程。存在 3 个严重 Bug、5 个中等问题，建议修复后再上线。**

---

## 🔴 严重 Bug（必须修复）

### Bug 1：后端返回 snake_case 字段，前端期望 camelCase →「我的」页面会员信息无法显示

**位置**：  
- 后端 `routes/auth.js` — `customerResponse()` 函数  
- 前端 `pages/logs/logs.wxml` — 模板绑定  

**问题描述**：  
后端从 MySQL 读取用户数据后，通过 `customerResponse(user)` 直接 `...user` 展开返回。MySQL 列名是 snake_case（`is_member`、`member_level`、`coupon_count`），但前端 WXML 模板绑定的是 camelCase：

```wxml
<!-- logs.wxml -->
<text>{{userInfo.isMember ? '...' : '未开通会员'}}</text>
<text>{{userInfo.memberLevel}}会员</text>
<text>{{userInfo.couponCount}}</text>
```

后端返回的实际字段是 `is_member`、`member_level`、`coupon_count`，前端读不到值。

**修复建议**：在 `customerResponse()` 中做字段映射：

```javascript
// routes/auth.js — customerResponse 修改
function customerResponse(user) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: customerDisplayName(user.nickname),
    avatar: user.avatar,
    phone: user.phone,
    points: user.points,
    balance: user.balance,
    couponCount: user.coupon_count,
    memberLevel: user.member_level,
    isMember: !!user.is_member,
  };
}
```

### Bug 2：seed.js 引用了不存在的 `categories` 表 → 初始化脚本崩溃

**位置**：`backend/seed.js` 第 22-26 行  

**问题描述**：  
`seed.js` 尝试向 `categories` 表插入数据：

```javascript
await pool.execute(
  'INSERT IGNORE INTO categories (name, sort_order) VALUES (?, ?)',
  [name, sort_order]
);
```

但 `database.js` **从未创建** `categories` 表！运行 `node seed.js` 会直接报错。

而且整个项目并不使用 `categories` 表 — 分类是从 `products.category` 字段动态提取的（见 `routes/menu.js` 第 28-34 行）。

**修复建议**：删除 `seed.js` 中的 categories 插入代码（第 10-27 行），或改为可选执行（try-catch 包裹）。

### Bug 3：`/images/mock/bread1.png` 文件不存在 → 默认头像加载失败

**位置**：`front_UI/pages/logs/logs.js` 第 4 行  

```javascript
userInfo: {
  avatar: '/images/mock/bread1.png',  // ← 文件不存在！
```

mock 目录下只有 `placeholder.png`，没有 `bread1.png`。

**修复建议**：改为 `'/images/mock/placeholder.png'` 或直接使用一个网络占位图。

---

## 🟡 中等问题（建议修复）

### 问题 4：双层 Toast — 请求失败时显示两条错误提示

**位置**：多处，典型如 `pages/index/index.js` 第 273-277 行  

`app.request()` 方法内部已经调用了 `wx.showToast()`（见 `app.js` 第 78 行），但各页面 `.catch()` 中又调了一次 `wx.showToast`，导致用户看到两次错误提示。

**修复建议**：  
- 方案 A：`app.request()` 去掉通用的 toast，由各页面自行决定是否提示  
- 方案 B：各页面 `.catch()` 去掉 toast，只做 console.error 日志

### 问题 5：「再来一单」功能名不副实 — 显示"已加入购物车"但什么都没加

**位置**：`front_UI/pages/order-list/order-list.js` 第 117-128 行  

```javascript
reorder(e) {
  const id = e.currentTarget.dataset.id;
  const order = this.data.orders.find(o => o.id === id);
  if (order) {
    wx.showToast({ title: '商品已加入购物车', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1000);
  }
}
```

Toast 说"已加入购物车"，但实际没有向购物车写入任何数据，只是跳转到了点单页。

**修复建议**：要么实现真正的加购逻辑，要么改为"重新点单"之类更准确的文案。

### 问题 6：潜在的 `Cannot read property 'indexOf' of undefined` 崩溃

**位置**：`front_UI/pages/order-confirm/order-confirm.js` 第 94 行  

```javascript
if (err.errMsg.indexOf('cancel') !== -1) {
```

`wx.requestPayment` 的 fail 回调中，`err.errMsg` 在某些异常情况下可能为 `undefined`，直接调用 `.indexOf()` 会抛出 TypeError。

**修复建议**：

```javascript
if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
// 或
if (err.errMsg?.includes('cancel')) {
```

### 问题 7：app.js 注释说 SQLite，实际用 MySQL → 误导性文档

**位置**：`backend/app.js` 第 4 行注释  

```
 * 技术栈：Express + SQLite (better-sqlite3)
```

实际 `database.js` 使用的是 `mysql2/promise`，`package.json` 依赖也是 `mysql2`。注释与代码不一致。

### 问题 8：重复 CSS 定义

**位置**：`front_UI/pages/index/index.wxss` 第 110-125 行  

`.category-title` 样式被完整定义了两次，内容完全相同。

**修复建议**：删除重复的那一组（第 119-125 行）。

---

## 🟢 小建议（锦上添花）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 9 | `app.js:39,56` | `.catch(() => {})` 静默吞错 | 至少加 `console.error` 方便排查 |
| 10 | `app.json:47` | `"style": "v2"` 已过时 | 可改为 `"componentFramework": "glass-easel"` 或直接移除（v2 已是默认） |
| 11 | `middleware/auth.js:12,15` | 默认密码/密钥硬编码 | 生产环境务必通过环境变量覆盖 |
| 12 | `pages/order-list/order-list.js:81` | `.catch(() => {})` 静默吞错 | 同上 |
| 13 | `pages/index/index.wxml:14` | `scroll-y="{{true}}"` 可简化 | 直接写 `scroll-y` 即可 |
| 14 | `README.md:42` | 技术栈写 SQLite | 应改为 MySQL |

---

## ✅ 做得好的地方

1. **微信云托管 callContainer 私有协议** — 前端通过 `wx.cloud.callContainer` 调用后端，无需域名备案，架构选型合理
2. **模拟支付降级设计** — 商户号未开通时自动走模拟支付，且不调 `wx.requestPayment`，不会触发真实扣款
3. **管理后台新订单轮询 + 震动提醒** — 每 10 秒轮询，检测新订单自动刷新，`wx.vibrateLong()` 物理提醒商家
4. **JWT 认证中间件** — 管理者 API 统一鉴权，401 时前端自动清除 token + 跳转登录
5. **数据库迁移兼容** — `database.js` 自动检测并补全 `stock` 列，兼容旧表结构
6. **Haversine 距离计算** — 门店 API 支持传入用户坐标，后端计算真实距离
7. **微信支付 v3 API** — 签名算法、AES-GCM 解密回调数据，代码结构清晰
8. **自定义悬浮 TabBar** — 胶囊式设计，统一页面体验，且点单页有门店检测（未选门店自动引导）

---

## 📊 审查统计

| 类别 | 数量 |
|------|------|
| 🔴 严重 Bug | 3 |
| 🟡 中等问题 | 5 |
| 🟢 小建议 | 6 |
| ✅ 亮点 | 8 |
| 审查文件数 | 30+ |

---

*审查完成。建议优先修复 3 个严重 Bug，其他问题可以逐步迭代。*
