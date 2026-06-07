# 小团出行 · TripTuan — AI 行程规划全栈 Demo

> 一个把一次完整旅行从「一句话需求」跑到「纪念海报」的全栈 **AI 出行规划** 系统：用户用自然语言 / 结构化表单
> 说出需求，系统通过多个 AI Agent 完成「**选点 → 排程 → 下单 → 出发 → 核销 → 实时监控 → 生成海报**」的完整旅程闭环。
>
> - **后端**：FastAPI + LangGraph 多 Agent 编排，LongCat LLM 做语义决策，高德 AMap 提供真实天气/路线，Qwen 生成图片。
> - **前端**：React + Vite + TypeScript 移动端高保真原型，一条 8 步演示主线。
> - **城市**：内置两个完整场景 —— `sz`（深圳）与 `bj`（北京）。

---

## 目录

1. [快速开始](#快速开始)
2. [仓库结构](#仓库结构)
3. [整体架构一览](#整体架构一览)
4. [设计原则：AI 做什么、不做什么](#设计原则ai-做什么不做什么)
5. [行程生命周期（核心流程）](#行程生命周期核心流程)
6. [API 速查](#api-速查)
7. [POI 数据库（DianpingDB）](#poi-数据库dianpingdb)
8. [AI 与外部服务](#ai-与外部服务)
9. [POI 配图批量生成](#poi-配图批量生成)
10. [数据持久化](#数据持久化)
11. [环境变量](#环境变量)
12. [测试](#测试)
13. [真实 vs Mock 说明](#真实-vs-mock-说明)
14. [更多文档](#更多文档)

---

## 快速开始

### 0. 前置依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | 3.12+（开发机用 3.14） | 后端运行时 |
| Node.js | 18+ | 前端构建 |
| API Key | 见 [环境变量](#环境变量) | LLM / 图片 / AMap，**缺失时各模块都有兜底逻辑，系统仍可完整跑通** |

### 1. 配置密钥

```bash
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY / POSTER_IMAGE_API_KEY / AMAP_API_KEY
```

> ⚠️ **安全**：`.env` 已被 `.gitignore` 忽略。**不要把真实 key 写进代码或提交到仓库。**

### 2. 安装依赖

```bash
# 后端（建议用虚拟环境）
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 前端
cd frontend && npm install && cd ..
```

### 3. 启动

**方式 A —— 一键启动（开发，推荐）**

```bash
python start.py
```

`start.py` 会：先杀掉占用 `8000`/`5173` 的进程 → 启动后端 `uvicorn backend.main:app` → 启动前端 `vite dev`，
并自动给前端注入 `VITE_API_BASE=http://127.0.0.1:8000`。

| 服务 | 地址 |
|------|------|
| 后端 API | http://127.0.0.1:8000 |
| 接口文档（Swagger） | http://127.0.0.1:8000/docs |
| 前端（开发） | http://127.0.0.1:5173 |

**方式 B —— 后端直接托管前端（类生产）**

```bash
cd frontend && npm run build && cd ..        # 产出到 frontend/dist
.venv/bin/uvicorn backend.main:app --port 8000
# 访问 http://127.0.0.1:8000/ ，由后端 serve React 构建产物
```

> 后端根路由 `GET /` 返回 `frontend/dist/index.html`；若尚未 `npm run build`，会返回 503 并提示先构建。

---

## 仓库结构

```
hackathon/
├── start.py                       # 一键启动后端 + 前端（开发）
├── requirements.txt               # Python 依赖
├── .env / .env.example            # 环境变量（.env 不入库）
├── README.md                      # 本文件 —— 项目总览
├── ARCHITECTURE.md                # 架构详解（深入实现）
│
├── backend/                       # ── Python / FastAPI 后端 ──
│   ├── main.py                    # FastAPI 入口：原生 /trip·/order·/debug 端点 + 挂载 /api 适配层
│   ├── orchestrator.py            # TravelOrchestrator —— 顶层协调器（持有 store / agents / tools / graphs）
│   ├── agents.py                  # 5 个 AI Agent（选点 / 排程 / 监控 / 微推荐 / 海报）
│   │
│   ├── api/
│   │   ├── schemas.py             # Pydantic 请求体
│   │   ├── frontend_routes.py     # 前端适配层：所有 /api/* 路由（前端 React 调用）
│   │   └── preset.py              # 确定性场景预设（剧本，默认偏好时不跑 LLM）
│   │
│   ├── graphs/                    # LangGraph 编排
│   │   ├── travel_graph.py        # 11 个线性 StateGraph（每个对应一个后端操作）
│   │   ├── smart_planner.py       # 真实 LLM Supervisor 驱动的规划（/trip/smart-plan）
│   │   └── official_supervisor.py # 官方 langgraph-supervisor 接线（FakeModel，仅产出 trace）
│   │
│   ├── tools/                     # Agent / Graph 可调用的工具
│   │   ├── amap.py                # AMap：天气 / 地理编码 / 路线 / 行政区 / 轨迹纠偏 / 打卡判定 / 打车估价
│   │   ├── runtime_context.py     # RuntimeContextTool：聚合定位/打卡/订单/路况为运行时上下文
│   │   ├── orders.py              # OrderStatusTool + VerificationTool（基于 SQLite 的下单/支付/核销）
│   │   └── dianping.py            # （可选）DianpingDB 的 LangChain Tool 封装；当前 Agent 直接调 DB，未启用
│   │
│   ├── clients/                   # 外部 API 客户端
│   │   ├── llm.py                 # LongCat LLM（OpenAI 兼容）chat_json / chat_text
│   │   └── poster_image.py        # Qwen 图片生成：行程海报 + POI 城市插画 + 交通插画
│   │
│   ├── core/                      # 模型 / 状态 / 配置
│   │   ├── models.py              # TripState dataclass（贯穿全流程的统一状态）
│   │   ├── state_store.py         # TripStateStore —— 原生 SQLite 持久化（6 表）
│   │   ├── frontend_store.py      # FrontendAdapterStore —— /api 适配层持久化（4 表）
│   │   └── env.py                 # 读取 .env / 环境变量
│   │
│   ├── data/                      # POI 数据 + 预设 + SQLite 库
│   │   ├── dianping_db.py         # DianpingDB —— 本地 POI 库（选点 / 附近推荐的唯一数据源）
│   │   ├── bj_poi_dzdp.json       # 北京 POI（110 条）
│   │   ├── sz_poi_dzdp.json       # 深圳 POI（110 条）
│   │   ├── bj_preset.json         # 北京预设剧本（3 个两天一晚变体）
│   │   ├── sz_preset.json         # 深圳预设剧本（3 个两天一晚变体）
│   │   └── travel_state.sqlite    # 运行时状态库（运行时生成，不入库）
│   │
│   ├── scripts/
│   │   └── generate_all_poi_images.py  # 批量生成 POI 配图（限流 + 断点续跑 + 熔断）
│   │
│   └── static/generated/          # 运行时生成的图片（海报 / POI / 交通插画）
│
├── frontend/                      # ── React + Vite + TS 前端 ──
│   ├── package.json · vite.config.ts · tsconfig.json · index.html
│   └── src/
│       ├── main.tsx · App.tsx · store.tsx · types.ts
│       ├── api/                   # 后端契约层（页面只从这里发请求）
│       ├── components/            # MobileFrame / DemoOverlay / StreamingStatus / Photo / mapProjection ...
│       ├── pages/                 # Overview + P1~P8 + Summary / Kevin / Flow / Review
│       └── styles/                # tokens.css / components.css / app.css
│
├── docs/                          # 设计文档
│   ├── ARCHITECTURE 与 README 的补充设计稿
│   └── TripTuan-完整技术拆解.docx  # 全量技术拆解（Word）
│
└── tests/                         # pytest
    ├── test_orchestrator.py
    └── test_frontend_routes.py
```

---

## 整体架构一览

```
浏览器 (React @ Vite)
   │  fetch → VITE_API_BASE
   ▼
┌──────────────────────────────────────────────────────────────┐
│ FastAPI (backend/main.py)                                      │
│   • 原生生命周期端点：/trip/*  /order/*  /debug/*               │
│   • 前端适配层：/api/*（backend/api/frontend_routes.py）        │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
              TravelOrchestrator (backend/orchestrator.py)
                            │  统一维护 TripState
        ┌───────────────────┼────────────────────────┐
        ▼                   ▼                         ▼
 TravelGraphRunner    SmartPlannerGraph        5 个 Agent (agents.py)
 (11 个线性图)        (真实 LLM Supervisor)     POISelection / Itinerary
 每步: supervisor →   LLM 决定调用顺序           Planner / RuntimeMonitor
 agent → tool →      （无 key 时退化为顺序执行）  / MicroRecommend / Poster
 persist_state
        │                   │                         │
        └───────────────────┴────────────┬────────────┘
                                         ▼
              ┌──────────────────────────────────────────┐
              │ 工具 / 客户端 / 数据                        │
              │  tools/  amap · runtime_context · orders   │
              │  clients/  llm(LongCat) · poster_image(Qwen)│
              │  data/  DianpingDB(220 POI)                 │
              │  core/  state_store · frontend_store (SQLite)│
              └──────────────────────────────────────────┘
                                         │
                          外部服务：LongCat · Qwen Image · AMap
```

> 架构、各 Agent 的算法细节、工具实现、状态模型，详见 **[ARCHITECTURE.md](./ARCHITECTURE.md)**，
> 或全量 Word 版 **[docs/TripTuan-完整技术拆解.docx](./docs/TripTuan-完整技术拆解.docx)**。

---

## 设计原则：AI 做什么、不做什么

这不是「问一句、大模型生成一段攻略」的聊天机器人，而是**以真实出行状态推进的流程系统**。
关键设计：**让 AI 只做适合 AI 的事，事实判断交给工具和数据。**

**AI（LongCat / Qwen）负责：**

- 理解用户偏好的语义标签，从候选池里挑选/排序 POI。
- 解释「为什么这样排」，把确定性事实改写成自然友好的提醒话术。
- 生成具有传播性的海报文案，以及城市插画/海报的生图。

**AI 不负责猜事实（由 Tool / 数据库 / 外部 API 判定）：**

- 天气 → AMap 天气接口（失败时返回占位，绝不编造温度）。
- 路线距离 → AMap 路线接口，失败时用 haversine 估算。
- 订单/核销 → SQLite 订单表 + `VerificationTool`。
- 打卡 → 定位半径 + 停留时间规则。
- 打车价格 → 本地估价公式（`18 + 6 × km`）。

每个 Agent 都遵循**「确定性结果 + LLM 增强 + 失败兜底」**：先用规则/算法产出结果，再调 LLM 润色；
LLM 不可用或返回非法 JSON 时保留确定性结果。所有 LLM 调用写入 `TripState.ai_trace` 便于审计。

---

## 行程生命周期（核心流程）

后端「原生 API」按以下顺序串起一次完整行程（用户已确认的语义）：

> **规划 → 支付 → 出发 → 核销 → 监控 → 海报**

| # | 端点 | 负责模块 | 作用 | 写入 TripState |
|---|------|----------|------|----------------|
| 1 | `POST /trip/candidates` | POISelectionAgent | 从 DianpingDB 生成候选卡片（+ AMap 天气） | `candidate_cards`, `weather` |
| 2 | `POST /trip/select` | user_selection_node | 用户勾选要去的卡片 | `selected_cards` |
| 3 | `POST /trip/plan` | ItineraryPlannerAgent | 生成静态行程时间轴（分天/动线/餐点编排） | `static_board` |
| 4 | `POST /order/create-demo` | OrderStatusTool | 为选中卡片创建 demo 订单 | `order_status` |
| 5 | `POST /order/pay` | VerificationTool | 支付订单 | `order_status` |
| 6 | `POST /trip/route` | amap.get_route_between | 规划站点间路线，生成动态看板 | `route_plan`, `dynamic_board` |
| 7 | `POST /order/verify` | VerificationTool | 到点核销 | `order_status` |
| 8 | `POST /trip/update` | RuntimeContextTool + RuntimeMonitorAgent | 上报定位/停留，生成运行时事件 | `runtime_context`, `runtime_events` |
| 9 | `POST /trip/recommend` | MicroRecommendAgent | 基于附近 POI 的轻量推荐 | `recommendations` |
| 10 | `POST /trip/poster` | PosterAgent | 生成旅行总结海报（文案 + Qwen 配图） | `poster` |

> 另有 `POST /trip/smart-plan`：用真实 LLM Supervisor 一步完成「选点 + 排程」（见 ARCHITECTURE）。
>
> 前端 React 主线（P1~P8）走 `/api/*` 适配层，内部最终调用同一套 Orchestrator/Agent，只是把请求/响应整理成前端更易用的形状。

`stage` 随流程推进：`planning → selection → confirmed → executing → completed`。

---

## API 速查

后端同时暴露两套接口，都由同一个 `TravelOrchestrator` 支撑：

### A. 原生生命周期 API（无前缀，`backend/main.py`）

```
GET  /                       托管前端 dist（未构建时 503）
GET  /health                 健康检查
GET  /debug/config           当前配置 / key 是否就绪
GET  /debug/state-store      SQLite 各表行数统计
GET  /debug/langgraph        LangGraph 图结构 / supervisor 描述
POST /trip/smart-plan        真实 LLM Supervisor 规划（一步出候选 + 行程）
POST /trip/candidates        生成候选卡片
POST /trip/select            选择卡片
POST /trip/plan              生成行程
POST /trip/route             规划路线 + 动态看板
POST /order/create-demo      创建 demo 订单
POST /order/pay              支付
POST /order/verify           核销
GET  /order/status/{trip_id} 查询订单状态
POST /trip/update            运行时上下文 + 监控事件
POST /trip/recommend         微推荐
POST /trip/poster            生成海报
```

### B. 前端适配层 API（前缀 `/api`，`backend/api/frontend_routes.py`）

| 前端页面 | 前端 api 模块 | 主要端点 |
|----------|---------------|----------|
| P1 问小团 | `agent.ts` | `POST /api/chat/stream`（流式）、`POST /api/chat` |
| P1 内容 | `content.ts` | `GET /api/hotels`、`/tips`、`/spots`、`/sight-detail` |
| P3 勾选 | `pois.ts` | `GET /api/pois?scene=`、`GET /api/pois/{id}`、`POST /api/pois/transport/lookup` |
| P4/P5 行程 | `itinerary.ts` | `POST /api/itinerary/rerank`、`/regenerate`、`GET /api/itinerary/preview` |
| P6 下单 | `order.ts` | `POST /api/orders/draft`、`GET /api/orders/{id}`、`PATCH /api/orders/{id}`、`POST /api/orders/{id}/pay` |
| P7/P8 看板 | `board.ts` | `GET /api/board/{id}`、`POST /api/board/{id}/checkin`、`/ride`、`GET /api/weather`、`/recommend/nearby`、`/recommend/micro`、`POST /api/poster` |
| 配图预生成 | — | `POST /api/pois/pregenerate`（兼容端点；全量出图请用批量脚本） |

> 完整请求/响应字段见 `backend/api/frontend_routes.py` 与 `frontend/src/api/*.ts` 的文件头注释。

---

## POI 数据库（DianpingDB）

所有候选卡片与「附近推荐」的 POI 都来自本地大众点评导出的 JSON（**不是** AMap 检索）。

- **文件**：`backend/data/bj_poi_dzdp.json`（110）、`sz_poi_dzdp.json`（110），共 **220** 条。
- **加载**：`backend/data/dianping_db.py` 的 `get_db()` 单例，启动时归一化字段。
- **类型**：`景点` / `美食` / `酒店`（由原始「一类」映射而来）。
- **稳定 ID**：`card_id = "dzdp_" + md5("{scene}:{name}")[:10]`，同名 POI 在不同城市互不冲突，配图文件名也据此命名。

| scene | 城市 | 总数 | 景点 | 美食 | 酒店 |
|-------|------|------|------|------|------|
| `bj` | 北京 | 110 | 30 | 50 | 30 |
| `sz` | 深圳 | 110 | 30 | 50 | 30 |
| 合计 | — | **220** | 60 | 100 | 60 |

DianpingDB 主要方法：`all` / `get_by_id` / `stats` / `search` / `nearby`（按距离）/ `select_for_trip`（按偏好/预算/强度/特殊人群产出均衡候选）/ `get_micro_food`（饮品小吃轮播，支撑「换一批」）。

---

## AI 与外部服务

| 能力 | 提供方 | 模型 / 接口 | 入口 | 无 key 时 |
|------|--------|-------------|------|-----------|
| 语义决策（选点、排程、文案润色） | **LongCat**（OpenAI 兼容） | `LongCat-2.0-Preview` | `backend/clients/llm.py` | Agent 走启发式兜底 |
| 图片生成（海报 + POI/交通插画） | **Qwen / DashScope** | `qwen-image-2.0-pro` | `backend/clients/poster_image.py` | 跳过出图，仅返回文案 |
| 天气 / 地理编码 / 路线 / 轨迹纠偏 | **高德 AMap** Web Service | v3/v4 REST | `backend/tools/amap.py` | 天气返回占位，路线用 haversine 估算 |

---

## POI 配图批量生成

为整个 POI 库预生成「平面编辑风城市插画」。前端 `/api/pois` 会自动把生成好的图片 URL 注入卡片。

```bash
python3 backend/scripts/generate_all_poi_images.py --dry-run   # 只看计划，不调用 API
python3 backend/scripts/generate_all_poi_images.py             # 实跑
```

特性：

- **范围**：两个场景的全部「景点 / 拍照点 / 休息点」类 POI；同类交通共用一张图（`poi_transport_<mode>.png`）。
- **限流自适应**：串行调用 + 成功间基础延迟（6s 起）+ 429/超时指数退避（20s→180s）。
- **断点续跑（幂等）**：已存在 `poi_<card_id>.png` 的 POI 直接跳过；被限流中断后重跑会自动补齐剩余。
- **熔断**：连续 12 次失败干净退出（`RATE_LIMIT_WALL`），等下次续跑。

> 批量出图会同时写 `static/generated/pois/` 与 `travel_state.sqlite`，请勿与其它会改动这两处的任务并行。

---

## 数据持久化

单一 SQLite 文件：`backend/data/travel_state.sqlite`（路径可由 `TRIP_STATE_DB_PATH` 覆盖）。

| 来源 | 表 | 内容 |
|------|----|------|
| `TripStateStore`（原生） | `trips` | 每个 trip 的完整 TripState JSON |
| | `orders` | demo 订单（pending/paid/verified/cancelled） |
| | `checkins` | 打卡记录（镜像表） |
| | `runtime_events` | 运行时监控事件（镜像表） |
| | `recommendation_logs` | 微推荐日志（镜像表） |
| | `poster_records` | 海报记录（镜像表） |
| `FrontendAdapterStore`（/api 适配层） | `frontend_sessions` | 前端会话（scene → trip_id） |
| | `frontend_board_states` | 看板状态 |
| | `frontend_orders` | 前端订单 |
| | `poi_images` | POI 配图 URL（`poi_id` → `image_url`） |

> 「镜像表」= 每次 `save_state` 按 `trip_id` 先删后插，保证表内容与内存态一致；`trips`/`orders` 例外（upsert / 增量）。

---

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写。关键项：

| 变量 | 用途 | 默认 / 示例 |
|------|------|-------------|
| `LLM_API_KEY` | LongCat LLM 密钥 | 必填才有真实 LLM |
| `LLM_BASE_URL` / `LLM_MODEL` | LLM 接入点 / 模型 | `https://api.longcat.chat/openai` · `LongCat-2.0-Preview` |
| `POSTER_IMAGE_API_KEY` | Qwen/DashScope 密钥 | 必填才能出图 |
| `POSTER_IMAGE_MODEL` / `POSTER_IMAGE_SIZE` | 图片模型 / 海报尺寸 | `qwen-image-2.0-pro` · `928*1664` |
| `AMAP_API_KEY` / `AMAP_MAP_API_KEY` / `AMAP_WEATHER_API_KEY` | 高德 Web Service 密钥 | 必填才有真实天气/路线 |
| `AMAP_MAPMATCH_ENABLED` | 是否启用轨迹纠偏 | `false` |
| `CHECKIN_RADIUS_METERS` / `CHECKIN_MIN_STAY_SECONDS` | 打卡判定半径 / 最短停留 | `80` · `10` |
| `TRIP_STATE_DB_PATH` | SQLite 路径 | `backend/data/travel_state.sqlite` |

前端（仅 `VITE_` 前缀会被暴露）：`VITE_API_BASE`（后端地址）。`start.py` 会自动注入；手动 `npm run dev` 时可在 `frontend/.env.local` 设置。

---

## 测试

```bash
.venv/bin/python -m pytest -q                       # 全部
.venv/bin/python -m pytest tests/test_orchestrator.py
.venv/bin/python -m pytest tests/test_frontend_routes.py
```

- `test_orchestrator.py`：跑完整 10 步生命周期，断言每步的 stage / 轨迹 / 订单计数 / 海报模型，并验证 TripState 能从 SQLite 完整恢复。
- `test_frontend_routes.py`：用 FastAPI TestClient 验证 `/api/*` 契约，并验证「相同 picks 复用缓存行程、不重复 replan」。

---

## 真实 vs Mock 说明

为避免误解，明确标注（详见 [ARCHITECTURE.md](./ARCHITECTURE.md) 的对照表）：

- ✅ **真实**：AMap 天气/地理/路线；LongCat LLM 的所有语义决策与润色；Qwen 图片生成；`/trip/smart-plan` 的真实 Supervisor 路由。
- 🔶 **本地确定性**：DianpingDB 的 220 个真实 POI；打卡判定（半径 + 停留规则）。
- ❌ **Demo / 占位**：订单与支付（纯 SQLite，无真实支付）；打车估价（固定公式 `18 + 6 × km`）；`/api/pois/transport/lookup` 等交通班次（硬编码）；`/api/chat/stream` 的「思考」步骤（脚本化按字流式回放）；`official_supervisor`（FakeModel，仅产出 trace，不做真实路由）。

> 一句话总结：**事实（天气/路线/打卡/订单/POI）尽量真实或确定性；语义（选点/排序/话术/文案/配图）交给 AI；演示型内容（聊天脚本、交通班次）才是硬编码。**

---

## 更多文档

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** —— 架构详解（分层、Graph、Agent 算法、状态模型、持久化）。
- **[docs/TripTuan-完整技术拆解.docx](./docs/TripTuan-完整技术拆解.docx)** —— 全量技术拆解 Word 文档（含完整 API 清单与文件索引）。
- `docs/amap_maps_integration.md` · `docs/amap_weather_integration.md` · `docs/runtime_tools_design.md` —— 子系统设计稿。
