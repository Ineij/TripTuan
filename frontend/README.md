# 小团 / 小go · 前端

Vite + React + TypeScript 前端。`HashRouter` 下 21 条路由（13 个页面组件 + 别名 + 兜底），
覆盖「问小团 → 身份 → 勾选 → 重排 → 预览 → 下单 → 看板 → 地图」完整演示主线。

> **所有数据都来自后端**。`src/api/*` 是唯一的请求层，全部命中 `VITE_API_BASE` 指向的
> FastAPI 服务（默认 `http://127.0.0.1:8000`）。代码里**没有 mock 兜底**。

---

## 启动

```bash
npm install
npm run dev       # http://127.0.0.1:5173/
npm run build     # 产出到 dist/（可由后端直接托管）
```

环境变量：复制 `.env.example` 到 `.env.local`，按需填 `VITE_API_BASE`。

- 用仓库根目录的 `python3 start.py` 一键起服务时，`VITE_API_BASE` 会被自动注入指向 `127.0.0.1:8000`，无需手动配置。
- 单独跑前端时，把 `VITE_API_BASE` 指到后端地址即可。
- 留空表示同源请求（适用于「后端托管 dist」或配了 dev 代理的场景）。

---

## 目录结构

```
src/
├── main.tsx              入口
├── App.tsx               HashRouter + 路由表
├── store.tsx             全局 state（scene / identity / 选中项 / paid / weather / orderId）
├── types.ts              领域类型（POI / Identity / Scene / ItineraryStep）
│
├── api/                  **后端契约层 —— 所有网络请求都走这里**
│   ├── index.ts          API barrel + Api 契约（contract）对象
│   ├── types.ts          跨文件 API 类型（ChatChunk / RerankResult / OrderDraft ...）
│   ├── http.ts           fetch 封装（读取 VITE_API_BASE，无 mock 开关）
│   ├── agent.ts          流式聊天 AsyncGenerator（streamChat / sendMessage）
│   ├── content.ts        P1 静态内容：酒店 / 小贴士 / 必玩景点 / 景点详情 / 聊天脚本
│   ├── pois.ts           P3 勾选项（交通班次 + 景点 + 美食 + 酒店，含 Qwen 配图 imageUrl）
│   ├── itinerary.ts      P4 重排 / P5 预览
│   ├── order.ts          P6 订单 / 支付
│   └── board.ts          P7 动态看板 / P8 地图 / 天气 / 附近推荐 / 微推荐 / 海报 / 打车
│
├── components/           复用组件
│   ├── MobileFrame.tsx   iPhone 边框 + 页面切换动画
│   ├── DemoOverlay.tsx   右下角演示控件（10 步播放 + 天气切换）
│   ├── StatusBar.tsx     状态栏
│   ├── NavBar.tsx        顶部导航
│   ├── StepShell.tsx     标准页面壳（状态栏 + 导航 + 滚动区 + CTA）
│   ├── Photo.tsx         loremflickr 真实照片包装
│   ├── Atoms.tsx         小元件（GoMark / Stat / StepNum ...）
│   └── SceneSwitcher.tsx 场景切换
│
├── pages/                13 个页面组件
│   ├── Overview.tsx       /                总览
│   ├── P1_AskXiaotuan.tsx /p1              问小团（流式聊天）
│   ├── Step2_Identity.tsx /p2 /identity    身份信息
│   ├── Step3_Picker.tsx   /p3 /picker      勾选
│   ├── Step4_Rerank.tsx   /p4 /rerank      精细化重排（含等待页）
│   ├── Step5_Preview.tsx  /p5 /preview     行程预览
│   ├── Step6_Order.tsx    /p6 /order       下单 + 支付成功
│   ├── Step7_Board.tsx    /p7 /board       动态看板
│   ├── Step8_BoardMap.tsx /p8 /board-map   地图路线
│   ├── Summary.tsx        /summary         总结
│   ├── Kevin.tsx          /kevin           用户画像
│   ├── Flow.tsx           /flow            流程图
│   └── Review.tsx         /review          评审工具
│
└── styles/
    ├── tokens.css        设计令牌（颜色、阴影、字号）
    ├── components.css    通用组件样式
    └── app.css           动画 keyframes
```

> 兜底路由 `*` 渲染 `Overview`。每个数字步骤都额外配了一个语义化别名（`/p3` ≙ `/picker`）。

---

## 全局状态（src/store.tsx）

| key | 类型 | 控制哪些页面 |
|---|---|---|
| `scene` | `'sz' \| 'bj'` | 所有页面的场景分支（深圳 / 北京），默认 `'sz'` |
| `identity` | `Identity` | P2 → P3 → 后续 |
| `selectedPOIs` | `Set<string>` | P3 勾选 → P4 重排 → P6 下单 |
| `poiPackages` | `Record<string, string \| null>` | P3 套餐选择（`null` = 只去店不团券）→ P6 价格 |
| `paid` | `boolean` | P6 → P7 解锁 |
| `weather` | `'sunny' \| 'rainy' \| 'snowy'` | P7 看板视觉 + DemoOverlay，默认 `'snowy'` |
| `orderId` | `string \| null` | P6 创建草稿后写入，持久化到 `localStorage`，P7/P8 读取看板 |

---

## API 层怎么用

### 1. 统一从 `../api` 导入

页面只 import `../api`（barrel）。每个域文件头部都写了对应的后端 endpoint 契约与 payload 形状。
`http.ts` 的 `request()` 把路径拼到 `VITE_API_BASE` 之后发起 `fetch`，非 2xx 抛带 `status` 的错误。

### 2. P1 流式聊天 — `src/api/agent.ts`

页面用 `for await (const chunk of streamChat(scene, query))` 消费。`ChatChunk`（见 `api/types.ts`）的
`kind` 取值：`thinking` / `text` / `section` / `spot` / `tip` / `hotel` / `done`。

### 3. POI 配图

后端跑过 POI 配图批量生成后，`pois.ts` 返回的 `POIItem.imageUrl` 会带上 Qwen 生成的城市插画 URL
（`/static/generated/pois/poi_*.png`）；没有时页面回退到 `Photo.tsx` 的 loremflickr 占位图。

### 4. 错误 + loading 态

`request()` 在非 2xx 时抛错。建议在调用 api 的页面用 `try / catch` 兜住，loading 期间用现有的
`shimmer` 占位类（`styles/components.css`）。

---

## Api 契约速查

```ts
import { Api } from './api';

// 聊天
for await (const c of Api.chat.stream(scene, query)) { ... }
await Api.chat.send(scene, text);

// 静态内容（P1）
await Api.content.hotels(scene);
await Api.content.tips(scene);
await Api.content.spots(scene);
await Api.content.sightDetail(scene, name);
await Api.content.userQuery(scene);

// P3 勾选项
await Api.pois.list(scene);

// P4 / P5
await Api.itinerary.rerank(scene, identity, picks, prevVariantId);
await Api.itinerary.preview(scene);

// P6 订单
await Api.order.draft({ scene, picks, travelers });
await Api.order.patch(orderId, patch);
await Api.order.pay(orderId, 'wechat');

// P7 看板
await Api.board.state(orderId);
await Api.board.checkIn(orderId, stationId);
await Api.board.ride(orderId, from, to);
await Api.board.weather(scene);
await Api.board.nearby(lat, lng, type);
```

> `index.ts` 还单独 export 了未挂在 `Api` 对象上的函数：`getOrder`、`generatePoster`、`getMicroRecs`、`getChatScript`。

---

## 已知技术债 / 后续 TODO

- 没有单元测试 / e2e。
- 没有错误边界 / 全局 toast，错误处理目前由各页面自行 `try / catch`。
- `http.ts` 暂无 auth header 注入；需要鉴权时在 `request()` 里加 token 拦截。
- 真实图片走 loremflickr CDN（`src/components/Photo.tsx`）—— 部署后建议换自家 CDN。
- 演示用的 `DemoOverlay` 在真实 app 里应该移除（条件渲染或单独环境）。
