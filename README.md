# 小团 / 小go · 前端原型

Vite + React + TypeScript 前端原型，包含 20 条路由和完整的 demo 主线。

---

## 启动

```bash
npm install
npm run dev       # http://127.0.0.1:5173/
npm run build     # 产出到 dist/
```

环境变量：复制 `.env.example` 到 `.env.local`，填入 `VITE_API_BASE` 和 `VITE_USE_MOCK`。

---

## 目录结构

```
src/
├── main.tsx              入口
├── App.tsx               HashRouter + 路由表
├── store.tsx             全局 state（scene / identity / 选中项 / paid / weather）
├── types.ts              领域类型（POI / Identity / Scene / ItineraryStep）
│
├── api/                  **同学接后端只动这里**
│   ├── index.ts          API barrel + Api 契约（contract）
│   ├── types.ts          API 请求/响应类型
│   ├── http.ts           fetch 封装 + USE_MOCK 开关
│   ├── agent.ts          流式聊天 AsyncGenerator（streamChat）
│   ├── content.ts        P1 静态内容：酒店 / 小贴士 / 必玩景点 / 景点详情
│   ├── pois.ts           P3 勾选项（交通班次 + 景点 + 美食 + 酒店）
│   ├── itinerary.ts      P4 重排 / P5 预览
│   ├── order.ts          P6 订单 / 支付
│   └── board.ts          P7 动态看板 / P8 地图 / 天气 / 附近推荐 / 打车
│
├── components/           复用组件
│   ├── MobileFrame.tsx   iPhone 边框 + 页面切换动画
│   ├── DemoOverlay.tsx   右下角演示控件（10 步播放 + 天气）
│   ├── StatusBar.tsx     状态栏
│   ├── NavBar.tsx        顶部导航
│   ├── StepShell.tsx     标准页面壳（状态栏 + 导航 + 滚动区 + CTA）
│   ├── Photo.tsx         loremflickr 真实照片包装
│   ├── Atoms.tsx         小元件（GoMark / Stat / StepNum ...）
│   └── SceneSwitcher.tsx 场景切换
│
├── pages/                20 条路由
│   ├── Overview.tsx      /          总览
│   ├── P1_AskXiaotuan.tsx /p1       问小团（流式聊天）
│   ├── Step2_Identity.tsx /p2 /identity   身份信息
│   ├── Step3_Picker.tsx   /p3 /picker     勾选
│   ├── Step4_Rerank.tsx   /p4 /rerank     精细化重排（含等待页）
│   ├── Step5_Preview.tsx  /p5 /preview    行程预览
│   ├── Step6_Order.tsx    /p6 /order      下单 + 支付成功
│   ├── Step7_Board.tsx    /p7 /board      动态看板
│   ├── Step8_BoardMap.tsx /p8 /board-map  地图路线
│   ├── Summary.tsx        /summary        总结
│   ├── Kevin.tsx          /kevin          用户画像
│   ├── Flow.tsx           /flow           流程图
│   └── Review.tsx         /review         评审工具
│
└── styles/
    ├── tokens.css        设计令牌（颜色、阴影、字号）
    ├── components.css    通用组件样式
    └── app.css           动画 keyframes
```

---

## 全局状态（src/store.tsx）

| key | 类型 | 控制哪些页面 |
|---|---|---|
| `scene` | `'hk' \| 'bj'` | 所有页面的场景分支 |
| `identity` | `Identity` | P2 → P3 → 后续 |
| `selectedPOIs` | `Set<string>` | P3 勾选 → P4 重排 → P6 下单 |
| `poiPackages` | `Record<string, string \| null>` | P3 套餐选择 → P6 价格 |
| `paid` | `boolean` | P6 → P7 解锁 |
| `weather` | `'sunny' \| 'rainy' \| 'snowy'` | P7 看板视觉 + DemoOverlay |

---

## 同学要做的事（接 agent + 真实后端）

### 1. 翻 `src/api/*.ts`，把 mock 函数体换成真请求

每个文件头部都写好了对应的后端 endpoint 契约。`USE_MOCK=false` 时会走 `request()` 真实调用，URL 拼到 `VITE_API_BASE` 之后。

### 2. P1 流式聊天 — `src/api/agent.ts`

页面用 `for await (const chunk of streamChat(scene, query))` 消费。把 `streamChat` 内部的 mock 脚本换成真的 SSE / fetch-stream reader：

```ts
// src/api/agent.ts 已经留好模板
const res = await fetch('/api/chat/stream', { method: 'POST', body: ... });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split('\n\n')) {
    if (line.startsWith('data:')) yield JSON.parse(line.slice(5));
  }
}
```

`ChatChunk` 类型在 `api/types.ts`：`thinking` / `text` / `section` / `spot` / `tip` / `hotel` / `done`。

### 3. 注入 auth header

`src/api/http.ts` 的 `request()` 函数里有 `TODO teammate: inject auth here` 注释，加 token 拦截器在那里就好。

### 4. 错误 + loading 态

目前 mock 实现没有错误处理。接真后端时建议在每个调用 api 的页面加 `try / catch`，loading 期间用现有的 `shimmer` 占位类（在 `styles/components.css`）。

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

---

## 已知技术债 / 后续 TODO

- 部分页面（Step3 / Step5 / Step6）目前还在文件内 inline 维护 mock 数组，待真接口上之后迁移到 `api/*.ts`
- 没有单元测试 / e2e
- 没有错误边界 / 全局 toast
- 真实图片走 loremflickr CDN（`src/components/Photo.tsx`）— 部署后建议换自家 CDN
- 演示用的 `DemoOverlay` 在真实 app 里应该移除（条件渲染或单独环境）
