# 架构详解 · ARCHITECTURE

> 本文是 [README.md](./README.md) 的**深入实现**版：README 讲「是什么、怎么跑」，本文讲「内部怎么搭、每层做什么、关键算法长什么样」。
>
> 阅读顺序建议：先看 [1. 分层总览](#1-分层总览) 建立全局心智模型，再按需深入各层。
> 需要可打印 / 可分享的全量版本，见 [docs/TripTuan-完整技术拆解.docx](./docs/TripTuan-完整技术拆解.docx)。

---

## 目录

1. [分层总览](#1-分层总览)
2. [一次请求的完整路径](#2-一次请求的完整路径)
3. [核心状态模型：TripState](#3-核心状态模型tripstate)
4. [顶层协调器：TravelOrchestrator](#4-顶层协调器travelorchestrator)
5. [编排层：三种 Graph / Supervisor](#5-编排层三种-graph--supervisor)
6. [AI Agent 层（5 个）](#6-ai-agent-层5-个)
7. [工具层 tools/](#7-工具层-tools)
8. [外部客户端 clients/](#8-外部客户端-clients)
9. [数据层：DianpingDB](#9-数据层dianpingdb)
10. [确定性预设：preset.py](#10-确定性预设presetpy)
11. [持久化层：SQLite（10 张表）](#11-持久化层sqlite10-张表)
12. [两套 API 面](#12-两套-api-面)
13. [前端架构](#13-前端架构)
14. [启动与托管](#14-启动与托管)
15. [真实 vs Mock（权威对照表）](#15-真实-vs-mock权威对照表)

---

## 1. 分层总览

系统是一个**自上而下、职责单一**的分层结构。上层只依赖下一层的抽象，事实判断越往下越「硬」（规则 / 数据库 / 外部 API），语义润色越往上越「软」（LLM）。

```
┌─────────────────────────────────────────────────────────────────────┐
│ 前端  frontend/ (React + Vite + TS)                                   │
│   pages（P1~P8）→ api/*.ts 契约层 → fetch(VITE_API_BASE)              │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  HTTP
┌───────────────────────────────▼───────────────────────────────────────┐
│ HTTP 层  backend/main.py + backend/api/frontend_routes.py             │
│   • 原生生命周期 API：/trip/* /order/* /debug/*（无前缀）             │
│   • 前端适配层 API：/api/*（把请求/响应整形成前端易用形状）          │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  Python 调用
┌───────────────────────────────▼───────────────────────────────────────┐
│ 协调层  backend/orchestrator.py                                       │
│   TravelOrchestrator —— 持有所有 store/agents/tools/graphs，          │
│   维护内存态 TripState 缓存，是所有业务方法的唯一入口                  │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
┌───────────────────────────────▼───────────────────────────────────────┐
│ 编排层  backend/graphs/                                               │
│   travel_graph.py     11 个线性 StateGraph（每个端点 = 一张图）       │
│   smart_planner.py    真实 LLM Supervisor（langgraph-supervisor）     │
│   official_supervisor 官方 supervisor 接线（FakeModel，仅产 trace）   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
┌───────────────────────────────▼───────────────────────────────────────┐
│ Agent 层  backend/agents.py（5 个）                                   │
│   POISelection · ItineraryPlanner · RuntimeMonitor ·                  │
│   MicroRecommend · Poster   —— 「确定性结果 + LLM 增强 + 兜底」       │
└───────┬───────────────────────────────────────────────┬───────────────┘
        │                                                 │
┌───────▼──────────────────────┐         ┌───────────────▼───────────────┐
│ 工具层  backend/tools/        │         │ 客户端  backend/clients/       │
│  amap.py（天气/路线/打卡…）   │         │  llm.py        LongCat LLM     │
│  runtime_context.py          │         │  poster_image.py  Qwen 图片    │
│  orders.py（下单/支付/核销）  │         └───────────────┬───────────────┘
│  dianping.py（LangChain 封装，│                         │
│             当前未启用）      │                         │
└───────┬──────────────────────┘                         │
        │                                                 │
┌───────▼──────────────────────┐                         │
│ 数据层  backend/data/         │                         │
│  dianping_db.py  220 个 POI   │                         │
└───────┬──────────────────────┘                         │
        │                                                 │
┌───────▼─────────────────────────────────────────┐      │
│ 持久化层  backend/core/                           │      │
│  state_store.py   TripStateStore（6 张原生表）    │      │
│  frontend_store.py FrontendAdapterStore（4 张表） │      │
│  → 单一文件 backend/data/travel_state.sqlite      │      │
└──────────────────────────────────────────────────┘      ▼
                                       外部 API：LongCat · Qwen · AMap
```

**层与目录对照：**

| 层 | 目录 / 文件 | 职责 |
|----|------------|------|
| HTTP | `main.py` · `api/frontend_routes.py` · `api/schemas.py` | 路由、参数校验、序列化；不含业务逻辑 |
| 协调 | `orchestrator.py` | 串起 store / agents / tools / graphs；唯一对外业务入口 |
| 编排 | `graphs/travel_graph.py` · `smart_planner.py` · `official_supervisor.py` | 用 LangGraph 把「节点」串成可观测的执行链 |
| Agent | `agents.py` | AI 语义任务：选点、排程、监控话术、推荐、海报文案 |
| 工具 | `tools/amap.py` · `runtime_context.py` · `orders.py` · `dianping.py` | 确定性事实：天气、路线、打卡、订单、运行时上下文 |
| 客户端 | `clients/llm.py` · `poster_image.py` | 封装外部模型 API（LongCat / Qwen），统一返回结构 + 兜底 |
| 数据 | `data/dianping_db.py` + `*_poi_dzdp.json` | 本地 POI 库，候选卡片与附近推荐的唯一来源 |
| 预设 | `api/preset.py` + `*_preset.json` | 默认偏好时不跑 LLM 的确定性剧本 |
| 持久化 | `core/state_store.py` · `frontend_store.py` | SQLite 读写，TripState ↔ 行 |
| 模型/配置 | `core/models.py` · `core/env.py` | TripState dataclass、环境变量读取 |

---

## 2. 一次请求的完整路径

以「生成候选卡片」为例（`POST /trip/candidates`），看一个请求如何穿过所有层：

```
1. HTTP        main.py: generate_candidates(request: TripCandidatesRequest)
                 → orchestrator.generate_candidates(request.model_dump())
2. 协调        orchestrator.py: graph_runner.run("generate_candidates", {...})
3. 编排        travel_graph.py: 线性图 generate_candidates 依次执行节点：
                 structured_requirement_node   # 新建 TripState(stage="planning")
                 official_supervisor           # 写一条 supervisor_trace（FakeModel）
                 poi_selection_agent           # ← 真正干活
                 order_status_tool             # 读订单状态
                 checkin_status_tool           # 读打卡状态
                 persist_state                 # 落库
4. Agent       agents.py POISelectionAgent.run(state):
                 a. tools.get_weather(...)        # 工具层 → AMap
                 b. get_db().select_for_trip(...) # 数据层 → DianpingDB
                 c. self._llm_select(...)         # 客户端 → LongCat（失败则启发式兜底）
5. 持久化      state_store.py: save_state(state)  # 写 trips + 镜像表
6. 返回        每层把 trip_state.to_dict() 逐级上抛 → JSON 响应
```

**关键不变量：** 每个图最后一个节点恒为 `persist_state`，保证任何一步业务推进都会落库；每个节点执行后由 `_wrap_node` 追加一条 `langgraph_trace`（`{graph, node, at, stage}`），整条执行链可在响应里回放。

---

## 3. 核心状态模型：TripState

`backend/core/models.py` —— 一个 `@dataclass(slots=True)`，贯穿全流程的**唯一真相**。所有 Agent / 工具读它、改它；持久化层把它整体存成 JSON，同时把其中的列表镜像到独立表里方便查询。

| 字段 | 类型 | 含义 | 主要写入者 |
|------|------|------|-----------|
| `trip_id` | str | 行程唯一 ID（`trip_<hex8>`） | structured_requirement_node |
| `user_id` | str | 用户 ID（demo 默认 `demo_user`） | 同上 |
| `stage` | str | 生命周期阶段（见下） | 各 Agent |
| `structured_request` | dict | 结构化出行需求（目的地/日期/偏好/强度/预算/人群…） | 入参 |
| `candidate_cards` | list | 候选 POI 卡片 | POISelectionAgent |
| `selected_cards` | list | 用户选中 + 排序后的卡片（带 `_day`） | user_selection / ItineraryPlanner |
| `static_board` | list | 静态行程时间轴（分天、含 reason） | ItineraryPlannerAgent |
| `route_plan` | dict | 站点间路线段 + 总距离/时长 | map_route_tool |
| `dynamic_board` | list | 静态看板 + 路线 + 可打卡标记 | dynamic_board_node |
| `current_location` | dict | 当前定位 + 逆地理编码 | RuntimeContextTool |
| `weather` | dict | AMap 天气快照 | POISelectionAgent |
| `order_status` | dict | 订单聚合（counts/orders/paid…） | OrderStatusTool / VerificationTool |
| `checkin_status` | dict | 打卡状态（已打卡 id / nearest…） | amap.evaluate_checkin |
| `runtime_context` | dict | 运行时上下文（含 `trigger_flags`） | RuntimeContextTool |
| `runtime_events` | list | 运行时监控事件 | RuntimeMonitorAgent |
| `recommendations` | list | 微推荐弹窗 | MicroRecommendAgent |
| `poster` | dict | 海报文案 + 生图结果 | PosterAgent |
| `ai_trace` | list | 每次 LLM 调用的审计（provider/model/used/error） | `_trace_ai` |
| `langgraph_trace` | list | 图节点执行轨迹 | `_wrap_node` |
| `supervisor_trace` | list | 官方 supervisor 交接轨迹 | official_supervisor_node |

**stage 生命周期：**

```
planning ──→ selection ──→ confirmed ──→ executing ──→ completed
  候选        用户勾选       行程已排      出发/核销/监控    海报已生成
```

> `to_dict()` = `dataclasses.asdict(self)`，即响应体里能看到上面**全部**字段，前端/调试可据此回放完整状态。

---

## 4. 顶层协调器：TravelOrchestrator

`backend/orchestrator.py` —— 在 `main.py` 里被实例化为单例 `orchestrator`。它**不写业务逻辑**，只做三件事：

1. **持有依赖**：构造时实例化 `TripStateStore`、5 个 Agent、3 个工具、`TravelGraphRunner`、`SmartPlannerGraph`。
2. **维护状态缓存**：`self._states: dict[trip_id, TripState]`，`_get_state` 先查内存再查库（库里没有则 `KeyError` → HTTP 404）。
3. **暴露业务方法**：每个方法 = 「取状态 → 跑对应的图 → 返回 `to_dict()`」。

| Orchestrator 方法 | 跑的图 / 工具 | 对应端点 |
|-------------------|--------------|----------|
| `generate_candidates` | graph `generate_candidates` | `POST /trip/candidates` |
| `select_cards` | graph `select_cards` | `POST /trip/select` |
| `plan_trip` | graph `plan_trip` | `POST /trip/plan` |
| `rerank_trip` | graph `rerank_trip` | （`/api/itinerary/rerank` 内部用） |
| `build_route` | graph `build_route` | `POST /trip/route` |
| `create_demo_orders` | graph `create_demo_orders` | `POST /order/create-demo` |
| `pay_order` | graph `pay_order` | `POST /order/pay` |
| `verify_order` | graph `verify_order` | `POST /order/verify` |
| `get_order_status` | `OrderStatusTool`（直接） | `GET /order/status/{trip_id}` |
| `update_runtime` | graph `update_runtime` | `POST /trip/update` |
| `recommend` | graph `recommend` | `POST /trip/recommend` |
| `create_poster` | graph `create_poster` | `POST /trip/poster` |
| `smart_plan` | `SmartPlannerGraph` | `POST /trip/smart-plan` |

辅助方法 `_build_dynamic_board(state)`：把 `static_board` 与 `route_plan.segments` 按目的地连接，给每个节点补上 `status`/`route`/`can_checkin`，产出 `dynamic_board`。

---

## 5. 编排层：三种 Graph / Supervisor

这是最容易被误解的一层，所以**先讲清楚三者的本质区别**：

| | TravelGraphRunner | SmartPlannerGraph | OfficialSupervisorLayer |
|---|---|---|---|
| 文件 | `graphs/travel_graph.py` | `graphs/smart_planner.py` | `graphs/official_supervisor.py` |
| 引擎 | LangGraph `StateGraph` | `langgraph-supervisor` | `langgraph-supervisor` |
| 路由方式 | **线性**（边写死） | **真实 LLM 决策**（tool call） | **脚本化 FakeModel** |
| 是否真用 LLM 选路 | 否 | ✅ 是（有 key 时） | ❌ 否（仅产 trace） |
| 用途 | 生产主流程（11 个端点） | `/trip/smart-plan` 一步规划 | 在线性图里插入「官方交接」轨迹，证明接线正确 |

### 5.1 TravelGraphRunner（11 个线性图）

每个后端操作编译成一张 `StateGraph`，节点用 `_compile_linear` 串成 `START → n1 → n2 → … → END` 的直线。共享状态是 `TravelGraphState`（TypedDict）。

**11 张图与节点链：**

| 图 | 节点链（→ 表示边） |
|----|-------------------|
| `generate_candidates` | structured_requirement → official_supervisor(poi) → **poi_selection_agent** → order_status_tool → checkin_status_tool → persist_state |
| `select_cards` | **user_selection_node** → persist_state |
| `plan_trip` | official_supervisor(planner) → **itinerary_planner_agent** → persist_state |
| `rerank_trip` | official_supervisor(planner) → **itinerary_planner_agent_rerank** → persist_state |
| `build_route` | **map_route_tool** → dynamic_board_node → persist_state |
| `create_demo_orders` | **order_status_tool(create)** → persist_state |
| `pay_order` | **verification_tool(pay)** → persist_state |
| `verify_order` | **verification_tool(verify)** → persist_state |
| `update_runtime` | **runtime_context_tool** → official_supervisor(monitor) → **runtime_monitor_agent** → persist_state |
| `recommend` | official_supervisor(micro) → **micro_recommend_agent** → persist_state |
| `create_poster` | official_supervisor(poster) → **poster_agent** → persist_state |

**节点包装 `_wrap_node`**：每个节点执行后，把 `{graph, node, at, stage}` 追加进 `langgraph_trace`，并写回 `trip_state.langgraph_trace`。这让整条链可观测、可回放。

> `describe()` 会返回每张图的节点名列表，暴露在 `GET /debug/langgraph`。

### 5.2 SmartPlannerGraph（真实 LLM Supervisor）

用 `langgraph_supervisor.create_supervisor` 把两个子 Agent（`poi_selection_agent` + `itinerary_planner_agent`）交给一个 **`ChatOpenAI`（指向 LongCat，temperature=0.3）** 的 Supervisor。Supervisor 读 `_SUPERVISOR_PROMPT`（中文，明确「先选点拿天气、再排程、最后汇报」），**由 LLM 自行决定调用顺序**（通过 `transfer_to_*` handoff tool）。

- 子 Agent 节点：读/写 `TripStateStore`（以消息里的 `trip_id` 为键），返回 JSON 摘要消息供 Supervisor 决策。
- **兜底**：`enabled` 取决于 `load_settings().enabled`（是否有 LLM key）。无 key → `_run_sequential`：直接顺序跑 `poi_agent.run → itinerary_agent.run`，不经过 LLM 路由。
- 入口：`POST /trip/smart-plan`，一步返回候选 + 行程（区别于 `/trip/candidates → /trip/plan` 的多步流程）。

### 5.3 OfficialSupervisorLayer（FakeModel，仅 trace）

这一层**刻意诚实**：它用 `langgraph-supervisor` 的官方 `create_supervisor` 正确接线，但喂的是 `BindableSupervisorModel`（继承 `FakeMessagesListChatModel`）——一个**返回脚本化消息的假模型**，不做任何真实推理。

- `route(graph_name, target_agent)`：构造一段「Supervisor 发起 `transfer_to_<agent>` → Agent 接收」的脚本化消息流并 invoke，返回一条交接记录（写入 `supervisor_trace`）。
- `describe()` 里 `routing_mode` 明确写着：`"scripted_fake_model_in_linear_graph — no real routing decisions. Use /trip/smart-plan for real LLM-driven supervisor routing."`
- **存在意义**：演示「官方 supervisor 包已正确集成、handoff 工具命名规范」，并在每张线性图里留下「官方交接」的可视化轨迹。真实路由请看 5.2。

---

## 6. AI Agent 层（5 个）

`backend/agents.py`。**所有 Agent 共享同一范式：**

> **确定性结果（规则/算法）→ LLM 增强（润色/挑选/排序）→ 失败兜底（LLM 不可用或返回非法 JSON 时保留确定性结果）。**
> 每次 LLM 调用都经 `_trace_ai(state, agent, result)` 写入 `ai_trace`，记录 provider/model/used/error。

### 6.1 POISelectionAgent

`run(state)`：
1. **天气**：`tools.get_weather(destination, date)` → `state.weather`（AMap，失败给占位）。
2. **候选池**：`get_db().select_for_trip(scene, preferences, budget, intensity, has_elder, has_kid)` → `{"景点":[…], "美食":[…], "酒店":[…]}`（来自 DianpingDB，不是 AMap）。
3. **LLM 挑选**：`_llm_select` 把候选池压缩成精简结构，喂给 LongCat，要求按偏好/强度/预算/人群产出 `{"selected":[card_id…]}`；选不足 3 个则视为失败。
4. **兜底**：`_heuristic_select` 按强度取各类 top-N（low `(3,4,2)` / medium `(7,5,2)` / high `(8,6,3)`）。
5. `_db_to_card` 把 DB 记录映射成卡片（注意 `lon`→`lng`），写 `candidate_cards`，`stage="selection"`。

### 6.2 ItineraryPlannerAgent（核心算法最复杂）

**`run(state)`**：`_order_cards` 排序 → `_build_board` 生成时间轴 → `stage="confirmed"`。

**`_order_cards` 三层智能排序：**

```
Layer 1  地理 K-means 聚类分天
  · 非酒店 POI ≥ 4 → 切成 Day1 / Day2；否则全放 Day1
  · 初始质心 = 距离最远的两个点；迭代 3 轮重新分配 + 更新质心
  · 无坐标的点按奇偶平均摊到两天
  · 再平衡：Day2 至少留 2 个非酒店点

Layer 2  每天内部地理路由（_route_day）
  · 景点：最近邻（_nearest_neighbor，从最高评分点出发贪心）
  · ≥3 个景点再做 2-opt 局部优化（_two_opt，反转能缩短总路程的子段，阈值 10m）

Layer 3  疲劳均衡 + 餐点插入
  · _balance_fatigue：用 _FATIGUE 分值（自然景观/主题乐园=3…博物馆=1，餐饮/酒店=0）
    确保不出现两个连续高疲劳（≥3）景点
  · _insert_meals：把美食按「最小绕路」插入
      detour(i)=dist(i-1→food)+dist(food→i)-dist(i-1→i)
    午餐限制在路线前 55%，晚餐限制在后 55%；
    咖啡/饮品/快餐偏午、火锅/烤肉/自助偏晚（_LUNCH_CATS / _DINNER_CATS）
  · 酒店恒置于当天末尾
每张卡片打上 _day=1 / _day=2 标签供 _build_board 使用
```

**`_build_board`**：把排好的卡片渲染成「出发 → 早餐 → 上午景点 → 午餐 → 下午景点 → 晚餐 → 晚间 → 酒店」的时间轴（午 12:30→中午、晚 18:30→晚餐 等锚点时间）；进入 Day2 插入「第二天 · 继续出发」分隔；最后 `_enhance_board_with_ai` 仅润色每个节点的 `reason`（不改 card_id / 时间 / 数量）。

**`rerank(state, prev_variant_id)`**：与 `run` 不同，它让 LLM 产出真实排序决策（`_llm_rerank`，要求与上一方案至少 2 处不同；带 `prev_variant_id` 时 temperature 升到 0.9）；LLM 不可用或「换汤不换药」时退回 `_heuristic_rerank`（按 `prev_variant_id` 的 hash 做确定性轮转）。

### 6.3 RuntimeMonitorAgent

`run(state, runtime_payload)`：读 `runtime_context["trigger_flags"]`（由 RuntimeContextTool 算好），把布尔标志翻译成结构化事件：

| flag | event_type | level |
|------|-----------|-------|
| `page_stay_over_10s` | map_stay | info |
| `weather_risk` | weather_risk | warning |
| `checked_in_now` | checkin_success | success |
| `taxi_recommended` | taxi_suggestion | info |
| `has_trace_points` | mapmatch_status | info |
| `route_deviation` | route_deviation | warning |

`_enhance_events_with_ai` 仅润色 `message`（不改 `event_type`/`level`/`taxi_quote`），追加进 `runtime_events`，`stage="executing"`。

### 6.4 MicroRecommendAgent

`run(state, trigger)`：地图页轻量弹窗推荐。
- 有定位 → `get_db().nearby(lat, lng, scene, radius_km=2.0, categories=["美食","景点"])` 取真实附近 POI。
- 停留 ≥10s → 附近休息点；到饭点（`is_meal_time`）→ 附近美食（带距离标签）；降雨概率 ≥50% → 天气提醒；无触发 → 返回附近 POI 或「路线正常」。
- `_enhance_recommendations_with_ai` 仅润色 `title`/`message`（不编造候选外商户，不改 `popup_type`/`action`/`card_id`）。

### 6.5 PosterAgent

`run(state)`：
1. 先准备**确定性兜底文案** `fallback_poster`（标题/副标题/分享语/风格/版式）。
2. `_create_poster_with_ai`：让 LongCat 产出「哲学散文力度、原创、不点名作家」的中文海报文案（title/subtitle/share_text）。
3. `generate_trip_poster_png(state, poster)`：调 Qwen 出一张 **3:4 竖版** PNG（prompt 注入真实行程节点 / 天气 / 距离 / 打卡数），写到 `static/generated/poster_<trip_id>.png`。
4. 合并文案 + 生图结果 → `state.poster`，`stage="completed"`。

---

## 7. 工具层 tools/

确定性事实的家。Agent 负责「说得好听」，工具负责「说得对」。

### `amap.py` —— 高德 Web Service 封装（真实 + 兜底）

| 函数 | 作用 | 真实 / 兜底 |
|------|------|------------|
| `get_weather(dest, date)` | 实时天气 | ✅ AMap `weatherInfo`（用 `AMAP_CITY_CODES` 解析城市码，北京 110000 / 深圳 440300）；失败返回**占位**（condition/temp=None + `fallback_reason`），绝不编造 |
| `geocode_address` / `reverse_geocode` | 正/逆地理编码 | ✅ AMap geo/regeo |
| `get_division` | 行政区查询 | ✅ AMap config/district |
| `get_route_between(o, d)` | 站点间路线 | ✅ AMap walking(≤3km)/driving；失败用 **haversine 分级估算**（步行/步行或打车/打车） |
| `evaluate_checkin(...)` | 打卡判定 | 🔶 本地**规则**：最近卡片距离 ≤ `CHECKIN_RADIUS_METERS`(80) 且停留 ≥ `CHECKIN_MIN_STAY_SECONDS`(10) |
| `match_trace(points)` | 轨迹纠偏 | ✅ AMap grasproad/driving，但**受 `AMAP_MAPMATCH_ENABLED` 开关控制**（默认 false → 直接返回未匹配占位） |
| `get_taxi_quote(route)` | 打车估价 | ❌ **固定公式** `18 + 6 × km`，`external_api=False` |
| `search_pois(...)` | AMap POI 检索 | ✅ 真实，但**当前 Agent 不用它**——POI 一律走 DianpingDB（保留作未来扩展路径） |

> 所有 AMap 调用统一经 `_amap_get`：无 key 立即返回错误；HTTP/解析异常被捕获并以 `fallback_reason` 形式回传，不抛栈。

### `runtime_context.py` —— RuntimeContextTool

`run(state, payload, store)`：把零散的运行时信号**聚合成一个确定性上下文**。它会：逆地理编码当前定位、跑打卡判定、读订单状态、跑轨迹纠偏、推断「下一段路线」`_infer_next_route`、算 `_route_progress`（到下一点距离 / `near_next_poi`）、按需取打车估价，最后产出 `trigger_flags`（供 RuntimeMonitorAgent 翻译）。结果写入 `state.runtime_context`。

### `orders.py` —— OrderStatusTool + VerificationTool

薄封装，全部委托给 `TripStateStore`：
- `OrderStatusTool`：`create_demo_orders` / `get_status`。
- `VerificationTool`：`pay`（pending→paid）/ `verify`（paid→verified）。
- 全部 `external_api=False`，纯本地 SQLite，无真实支付。

### `dianping.py` —— DianpingDB 的 LangChain Tool 封装（当前未启用）

把 DianpingDB 暴露成 LangChain `Tool` 的封装。**当前 Agent 直接 `get_db()` 调库**，没走这层；保留以备未来用 LangChain agent executor。文档化为「未启用」。

---

## 8. 外部客户端 clients/

### `llm.py` —— LongCat（OpenAI 兼容）

- `load_settings()`：从环境变量 + `.env` 读 key/base_url/model/provider（兼容 `LLM_*` / `LONGCAT_*` / `OPENAI_*` 前缀）。`_normalize_openai_base_url` 会把 `…/openai` 自动补成 `…/openai/v1`。
- `chat_text(system, user, response_format?, temperature?)`：POST `/chat/completions`，默认 temperature 0.35。**JSON 模式失败自愈**：若带 `response_format` 收到 HTTPError，会自动去掉 `response_format` 重试一次。
- `chat_json(system, payload, temperature?)`：包一层 JSON 解析；模型返回非严格 JSON 时用正则 `_extract_json_object` 抠出 `{...}`。
- 统一返回 `LLMResult(used, model, provider, content, error)`——`used=False` 即代表「应走兜底」。

### `poster_image.py` —— Qwen / DashScope 图片生成

一个文件，三种产物，共用 `_render_png` + `_extract_png_bytes`（递归遍历响应找 data-URL / base64 / 图片 URL，校验 PNG magic number）：

| 函数 | 产物 | 尺寸 | prompt 模板 |
|------|------|------|------------|
| `generate_trip_poster_png` | 行程总结海报 `poster_<trip_id>.png` | `928*1664`(3:4) | `build_poster_prompt`（注入行程/天气/距离/打卡，水彩手账风） |
| `generate_poi_image` | 单个 POI 城市插画 `poi_<card_id>.png` | `1024*1024`(1:1) | `_CITY_ILLUSTRATION_TEMPLATE`（平面编辑风，强调「就是这个 POI、不要变成通用天际线」） |
| `generate_transport_image` | 交通工具插画 `poi_transport_<slug>.png` | `1024*1024`(1:1) | `_TRANSPORT_ILLUSTRATION_TEMPLATE`（高铁/飞机/大巴） |

> **品牌中立化**：`_poi_subject` 检测到连锁品牌名（`_BRAND_RISK_TERMS`，如星巴克/瑞幸/汉庭/希尔顿…）时，把 prompt 改写成「无品牌标识的同类场所」，规避商标风险。
> 无 key 时所有函数返回 `status="failed"` + 原因，**不阻断**主流程（海报仍有文案）。

---

## 9. 数据层：DianpingDB

`backend/data/dianping_db.py` —— 启动时把两份大众点评导出 JSON 归一化进内存，单例 `get_db()`。

- **数据**：`bj_poi_dzdp.json`(110) + `sz_poi_dzdp.json`(110) = **220**。
- **归一化**：`_normalize` 把原始「一类/二类/三类/星级/人均/lon/lat…」映射成统一 schema；`_CAT_MAP` 把「景点/周边游→景点」；`_estimate_duration` 按二类估算停留时长。
- **稳定 ID**：`_make_id(name, scene)` = `"dzdp_" + md5("{scene}:{name}")[:10]`，跨城同名不冲突，也是配图文件名的来源。

| scene | 城市 | 总数 | 景点 | 美食 | 酒店 |
|-------|------|------|------|------|------|
| `bj` | 北京 | 110 | 30 | 50 | 30 |
| `sz` | 深圳 | 110 | 30 | 50 | 30 |
| 合计 | — | **220** | 60 | 100 | 60 |

**主要方法：**
- `all(scene)` / `get_by_id(card_id)` / `stats()`。
- `search(scene, categories, keywords, subcategories, min_rating, max/min_price, limit)`：通用过滤 + 按评分降序。
- `nearby(lat, lng, scene, radius_km, categories, limit)`：haversine 半径筛选 + 按距离排序（微推荐用）。
- `select_for_trip(...)`：选点主入口——按预算定价格上限（low 80 / medium 250 / high 不限）、按强度定景点数（low 3 / medium 6 / high 10）、按偏好/人群加关键词、把「饮品小吃」(`SNACK_SUBCATS`) 排除出正餐候选；不足时逐级放宽兜底。
- `get_micro_food(scene, limit, offset)`：只返回饮品/小吃（`SNACK_SUBCATS`），带环绕分页，支撑前端「换一批」。

---

## 10. 确定性预设：preset.py

`backend/api/preset.py` —— 当用户**接受默认偏好**（默认 `打卡行 / 爱美食`，或从未触碰身份页）时，整个行程**不跑 LLM**，直接从 `backend/data/<scene>_preset.json` 的剧本构建。

- `is_default_preset(scene, identity)`：判断是否走剧本——有预设且偏好为空或恰好等于默认集时返回 True。
- `build_preset_state(...)`：把剧本里的 POI 名通过 DianpingDB 转成完整候选卡片（保留真实评分 / 价格 / 坐标 / 配图），渲染成与 `ItineraryPlannerAgent` **完全相同形状**的 `static_board`，所以下游适配器（`_board_to_days`、订单草稿、看板视图）全部无感复用。
- 每个城市内置 **3 个「两天一晚」变体**，`重新生成` 时按 `variant_idx` 循环切换。
- `total_distance_km` 预先烘焙进剧本，预览卡片无需 AMap 往返即可显示确定性公里数。
- 只有用户**自定义偏好**时，才落到真实 LLM pipeline——兼顾 Demo 的「秒开稳定」与「展示真 AI」。

---

## 11. 持久化层：SQLite（10 张表）

两个 Store 类，**共用同一个文件** `backend/data/travel_state.sqlite`（可由 `TRIP_STATE_DB_PATH` 覆盖）。该文件运行时生成、不入库（被 `.gitignore` 忽略）。

### A. `TripStateStore`（`core/state_store.py`）—— 6 张原生表

| 表 | 主键 | 内容 | 写入方式 |
|----|------|------|---------|
| `trips` | `trip_id` | 完整 TripState JSON + stage + 时间戳 | upsert |
| `orders` | `order_id` | demo 订单（pending/paid/verified/cancelled） | 增量更新 |
| `checkins` | `id` | 打卡记录（card_id/lat/lng/距离/时间） | **镜像**：每次 save 先删后插 |
| `runtime_events` | `id` | 运行时监控事件 | **镜像** |
| `recommendation_logs` | `id` | 微推荐日志 | **镜像** |
| `poster_records` | `id` | 海报记录（标题/副标题/分享语/风格/版式） | **镜像** |

> 「镜像表」= `save_state` 时按 `trip_id` 删除旧行、再用 TripState 里的列表重新插入，保证表内容与内存态一致。`trips`/`orders` 例外（upsert / 增量）。子表对 `trips` 有 `ON DELETE CASCADE` 外键，并为 `trip_id` 建索引。
>
> `create_demo_orders` 在建草稿时会先 `DELETE FROM orders WHERE trip_id=?` 再重建，避免历史草稿残留导致 `get_order_status` 返回用户未选的项。

### B. `FrontendAdapterStore`（`core/frontend_store.py`）—— 4 张适配表

| 表 | 主键 | 内容 |
|----|------|------|
| `frontend_sessions` | `scene` | 前端会话（scene → trip_id 映射 + 快照） |
| `frontend_board_states` | `order_id` | 看板状态快照 |
| `frontend_orders` | `order_id` | 前端订单（草稿/已付） |
| `poi_images` | `poi_id` | POI 配图 URL（`poi_id` → `image_url`，按 scene） |

> `/api` 适配层用这 4 张表把前端的「会话 / 订单 / 看板 / 配图」与后端原生 TripState 解耦。`poi_images` 同时被批量生图脚本写入（见 README「POI 配图批量生成」）。

---

## 12. 两套 API 面

后端在同一个 FastAPI app 上暴露**两套**接口，**都由同一个 `TravelOrchestrator` 支撑**，只是面向不同消费者。

### A. 原生生命周期 API（无前缀，`main.py`）

面向调试 / 直接驱动后端，与生命周期方法一一对应：

```
GET  /                         托管前端 dist（未构建返回 503）
GET  /health                   健康检查
GET  /debug/config             配置 / key 就绪 / 各模块 mode
GET  /debug/state-store        SQLite 各表行数
GET  /debug/langgraph          图结构 + supervisor 描述
POST /trip/smart-plan          真实 LLM Supervisor 一步规划
POST /trip/candidates          生成候选
POST /trip/select              选择卡片
POST /trip/plan                生成行程
POST /trip/route               规划路线 + 动态看板
POST /order/create-demo        创建 demo 订单
POST /order/pay                支付
POST /order/verify             核销
GET  /order/status/{trip_id}   查询订单
POST /trip/update              运行时上下文 + 监控
POST /trip/recommend           微推荐
POST /trip/poster              生成海报
```

### B. 前端适配层 API（前缀 `/api`，`api/frontend_routes.py`）

由 `attach_orchestrator(orchestrator)` 注入同一个 orchestrator，再 `app.include_router(router)` 挂载。它把请求/响应整形成前端更易用的形状（卡片、看板、流式聊天等）。

```
POST /api/chat/stream            P1 流式聊天（脚本化「思考」按字回放）
POST /api/chat                   P1 非流式聊天
GET  /api/pois                   P3 候选项（自动注入 poi_images 配图 URL）
POST /api/pois/pregenerate       兼容端点（全量出图请用批量脚本）
GET  /api/pois/{item_id}         单个 POI 详情
POST /api/pois/transport/lookup  交通查询（硬编码班次）
GET  /api/hotels /tips /spots /sight-detail   P1 内容（从 DianpingDB 派生）
POST /api/itinerary/rerank       P4 AI 重排
POST /api/itinerary/regenerate   P4 重新生成
GET  /api/itinerary/preview      P5 行程预览
POST /api/orders/draft           P6 订单草稿
GET  /api/orders/{order_id}      P6 查询订单
PATCH /api/orders/{order_id}     P6 修改订单（items / travelers / contactPhone）
POST /api/orders/{order_id}/pay  P6 支付
GET  /api/board/{order_id}       P7/P8 看板状态
POST /api/board/{order_id}/checkin   打卡（204）
POST /api/board/{order_id}/ride      叫车
GET  /api/weather                天气
GET  /api/recommend/nearby       附近推荐
GET  /api/recommend/micro        微推荐（换一批）
POST /api/poster                 生成海报
```

> 请求/响应字段以 `backend/api/frontend_routes.py` 与 `frontend/src/api/*.ts` 文件头注释为准。

---

## 13. 前端架构

`frontend/`，React 18 + Vite 5 + TypeScript。**零 UI 库、零状态管理库**：纯 React Context + 内联样式。一条 8 步移动端演示主线。

```
src/
├── main.tsx          入口，挂载 <App/>
├── App.tsx           HashRouter 路由表（见下）
├── store.tsx         AppProvider 全局状态（useApp()）
├── types.ts          领域类型（Scene = 'sz' | 'bj' 等）
├── api/              ── 后端契约层（页面只从这里发请求）──
│   ├── index.ts        barrel + Api 契约对象
│   ├── http.ts         request() —— 读 VITE_API_BASE，无 mock 兜底
│   ├── agent.ts        /api/chat · /chat/stream
│   ├── content.ts      /api/hotels · tips · spots · sight-detail
│   ├── pois.ts         /api/pois · /pois/{id} · /pois/transport/lookup
│   ├── itinerary.ts    /api/itinerary/rerank · regenerate · preview
│   ├── order.ts        /api/orders/draft · {id} · {id}/pay · patch
│   └── board.ts        /api/board/* · weather · recommend/* · poster
├── components/       MobileFrame / DemoOverlay / StreamingStatus / StepShell /
│                     NavBar / Photo / SceneSwitcher / StatusBar / Atoms / mapProjection
├── pages/            Overview + P1~P8 + Summary / Kevin / Flow / Review
└── styles/           tokens.css · components.css · app.css
```

**路由表（`App.tsx`，HashRouter）：**

| 路径 | 页面 | 别名 |
|------|------|------|
| `/` | Overview | （`*` 兜底也回到这里） |
| `/p1` | P1_AskXiaotuan（问小团 chat，10 阶段相位机流式回放） | — |
| `/p2` | Step2_Identity（身份信息） | `/identity` |
| `/p3` | Step3_Picker（POI 勾选，最复杂页 ~1205 行） | `/picker` |
| `/p4` | Step4_Rerank（AI 重排） | `/rerank` |
| `/p5` | Step5_Preview（行程预览） | `/preview` |
| `/p6` | Step6_Order（下单） | `/order` |
| `/p7` | Step7_Board（看板，旗舰页 ~1843 行） | `/board` |
| `/p8` | Step8_BoardMap（地图看板） | `/board-map` |
| — | Summary | `/summary` |
| `/kevin` `/flow` `/review` | 独立演示页（用户画像 / 流程图 / 评审） | — |

**契约层约定**：页面**只**从 `../api`（`index.ts`）import；所有请求经 `http.ts` 的 `request()` 打到 `VITE_API_BASE`，**没有 mock 兜底**（早期的 `USE_MOCK` 开关已移除）。`index.ts` 额外导出一个 `Api` 契约对象，便于测试 / 依赖注入。

**全局状态 `store.tsx`**：`AppProvider` 提供 `scene`(默认 `sz`) / `identity` / `selectedPOIs`(Set) / `poiPackages` / `paid` / `weather` / `orderId`(读 localStorage)，通过 `useApp()` 消费。

**地图投影 `mapProjection.ts`**：P7 / P8 共用的 Web-Mercator slippy-map 助手——`worldX/worldY` 换算像素、`fitZoom` 求能塞下整条路线的最大缩放级、`centerWorld` 求几何中心、`visibleTiles` 只渲染视口所需的 OpenStreetMap 瓦片（带预加载，拖动不闪白）。

---

## 14. 启动与托管

### `start.py`（开发一键启动，推荐）

`kill_port(8000/5173)` → 起后端 `uvicorn backend.main:app @127.0.0.1:8000` → 起前端 `npm run dev @127.0.0.1:5173`，并给前端注入 `VITE_API_BASE=http://127.0.0.1:8000`；把两个进程的输出带 `[backend]`/`[frontend]` 前缀合并打印；Ctrl+C 优雅停。

### `main.py`（FastAPI 装配）

- `app = FastAPI(title="Travel AI Backend MVP", version="0.1.0")`，CORS 全开（`allow_origins=["*"]`）。
- 挂载 `/static`（后端生成的图片，如海报/POI 插画）；若 `frontend/dist/assets` 存在则挂载 `/assets`（Vite 构建产物）。
- `attach_orchestrator(orchestrator)` + `include_router(frontend_router)` 接入 `/api` 适配层。
- `GET /` 返回 `frontend/dist/index.html`（未构建 → 503）。**类生产模式**下 `npm run build` 后，后端单端口同时托管前端与 API。

---

## 15. 真实 vs Mock（权威对照表）

| 模块 | 数据来源 | 说明 |
|------|---------|------|
| `tools/amap.py` 天气 | ✅ 真实 AMap，无 key 返回占位 | 绝不编造温度/天气 |
| `tools/amap.py` 路线 | ✅ 真实 AMap，失败用 haversine 估算 | 距离永远有值 |
| `tools/amap.py` 地理编码/行政区 | ✅ 真实 AMap | — |
| `tools/amap.py` 轨迹纠偏 | ✅ 真实 AMap，但默认开关关闭 | `AMAP_MAPMATCH_ENABLED=false` |
| `tools/amap.py` 打卡判定 | 🔶 本地规则（半径 + 停留） | 非外部 API，但是确定性事实 |
| `tools/amap.get_taxi_quote` | ❌ 固定公式 `18 + 6 × km` | 无真实打车 API |
| `tools/amap.search_pois` | ✅ 真实 AMap，但当前不被 Agent 使用 | POI 走 DianpingDB |
| `tools/orders.py` | ❌ 纯 SQLite mock | 无真实支付 |
| `data/dianping_db.py` | 🔶 本地 220 个真实 POI（大众点评导出） | 候选/附近推荐唯一来源 |
| `api/preset.py` | 🔶 确定性剧本（无 LLM） | 默认偏好时秒开稳定 |
| `agents.py` 各 `_enhance_*` / `_llm_*` | ✅ 真实 LongCat LLM | 无 key 走启发式兜底 |
| `graphs/smart_planner.py` | ✅ 真实 LLM Supervisor 路由 | 无 key 退化为顺序执行 |
| `graphs/official_supervisor.py` | ❌ FakeMessagesListChatModel | 仅产 trace，不做真实路由 |
| `clients/poster_image.py` | ✅ 真实 Qwen Image API | 无 key 跳过出图，仅返回文案 |
| `api/` `/api/hotels` `/tips` `/spots` `/sight-detail` | 🔶 从 DianpingDB 派生 | 内容型端点（非硬编码） |
| `api/` `/api/pois/transport/lookup` | ❌ 硬编码 | 高铁车次时刻为演示数据 |
| `api/` `/api/chat/stream` | ❌ 「思考」步骤硬编码 + 按字符流式回放 | 演示效果 |

> 一句话总结：**事实（天气/路线/打卡/订单/POI）尽量真实或确定性；语义（选点/排序/话术/文案/配图）交给 AI；演示型内容（聊天脚本、交通班次）才是硬编码。**
