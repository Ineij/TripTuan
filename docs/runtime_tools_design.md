# Runtime Tools Design

## 持久化数据库

当前项目已接入 **SQLite TripStateStore**，默认数据库路径：

```text
backend/data/travel_state.sqlite
```

原因：

- 不需要安装数据库服务。
- FastAPI 本地开发最省事。
- 适合保存 `TripState`、打卡记录、运行事件、推荐日志和海报记录。
- 后续迁移 PostgreSQL 时，表结构和 ORM 思路可以复用。

建议路径：

1. MVP：`SQLite + Python sqlite3`。
2. 正式多人协作/并发：`PostgreSQL + Redis`。
3. 生产环境：PostgreSQL 存业务状态，Redis 存短期会话和实时位置，OSS/CDN 存海报图片。

已建表：

| 表 | 作用 |
| --- | --- |
| `trips` | 保存 TripState 主体 JSON、stage、user_id |
| `checkins` | 保存 card_id、打卡时间、定位、距离 |
| `runtime_events` | 保存执行阶段提醒、天气风险、打车建议、MapMatch 状态 |
| `recommendation_logs` | 保存触发条件、推荐内容、是否点击 |
| `poster_records` | 保存海报文案、模板、图片地址 |
| `orders` | 保存 demo 订单、支付状态、核销状态和关联点位 |

后端入口：

```text
GET /debug/config       查看 state_store=sqlite 和表统计
GET /debug/state-store  查看 SQLite 文件路径和各表行数
GET /debug/langgraph    查看 LangGraph 已编译工作流节点
```

当前实现位于：

```text
backend/core/state_store.py
backend/graphs/travel_graph.py
backend/graphs/official_supervisor.py
backend/tools/runtime_context.py
```

## LangGraph 工作流

当前项目已接入 LangGraph `StateGraph` 和官方 `langgraph-supervisor`，不是只在代码里手写顺序调用。

`TravelGraphRunner` 会把每个 API 动作编译成独立的线性子图：

| Graph | 节点 |
| --- | --- |
| `generate_candidates` | `structured_requirement_node` → `official_supervisor` → `poi_selection_agent` → `order_status_tool` → `checkin_status_tool` → `persist_state` |
| `plan_trip` | `official_supervisor` → `itinerary_planner_agent` → `persist_state` |
| `create_demo_orders` | `order_status_tool` → `persist_state` |
| `pay_order` | `verification_tool` → `persist_state` |
| `build_route` | `map_route_tool` → `dynamic_board_node` → `persist_state` |
| `verify_order` | `verification_tool` → `persist_state` |
| `update_runtime` | `runtime_context_tool` → `official_supervisor` → `runtime_monitor_agent` → `persist_state` |
| `recommend` | `official_supervisor` → `micro_recommend_agent` → `persist_state` |
| `create_poster` | `official_supervisor` → `poster_agent` → `persist_state` |

每个节点执行后都会追加到 `TripState.langgraph_trace`，后台可视化面板会把 `LangGraph` 作为独立核心节点显示。

官方 `langgraph-supervisor` 层通过 `create_supervisor()` 编译 supervisor graph，并把 handoff 记录写入 `TripState.supervisor_trace`。MVP 中它采用确定性路由，保证产品状态流稳定；真实文案增强仍由各专职 Agent 调用配置的大模型完成。

## RuntimeContextTool

`RuntimeContextTool` 是执行阶段的事实计算工具，放在 `RuntimeMonitorAgent` 前面。

职责：

- 读取当前位置并调用高德 ReGeo。
- 读取/更新订单状态。
- 根据定位半径和停留时间计算打卡状态。
- 调用 MapMatch 判断轨迹状态。
- 汇总下一段路线、打车建议和页面停留时间。
- 输出 `trigger_flags`，供 Agent 生成提醒文案。

输出会写入：

```text
TripState.runtime_context
```

典型结构：

```json
{
  "tool": "RuntimeContextTool",
  "current_location": {},
  "weather_snapshot": {},
  "checkin_status": {},
  "order_status": {},
  "mapmatch_status": {},
  "route_progress": {},
  "taxi_quote": {},
  "trigger_flags": {
    "page_stay_over_10s": true,
    "weather_risk": false,
    "checked_in_now": false,
    "route_deviation": false,
    "taxi_recommended": true
  }
}
```

边界：`RuntimeContextTool` 只判断事实，`RuntimeMonitorAgent` 只根据这些事实生成解释和提醒。

## 订单状态与核销 Tool

当前订单链路已接入 **SQLite + Tool 层规则**，不调用真实支付或打车平台。

生命周期中的调用位置：

```text
POST /trip/plan
↓
POST /order/create-demo
↓
POST /order/pay
↓
POST /trip/route
↓
POST /order/verify
↓
POST /trip/update
```

也就是先规划和支付，再生成导航路线；到店/到景点后再核销。

职责拆分：

| Tool | 职责 | 是否调用外部接口 |
| --- | --- | --- |
| `OrderStatusTool` | 创建 demo 订单、读取订单状态、汇总 paid/verified 计数 | 否 |
| `VerificationTool` | 模拟支付成功、模拟到店核销，并写回 `orders` 表 | 否 |

链路：

```text
用户选择点位
↓
POST /order/create-demo  为选中点位创建 demo 订单
↓
POST /order/pay          把订单从 pending 改成 paid
↓
POST /trip/route         生成动态路线后开始出行
↓
POST /order/verify       把指定订单从 paid 改成 verified
↓
TripState.order_status + SQLite orders 同步更新
```

API：

```text
POST /order/create-demo
POST /order/pay
POST /order/verify
GET  /order/status/{trip_id}
```

设计边界：

- 订单事实不交给大模型判断。
- 当前为 demo/mock 订单，不涉及真实支付、退款、商户核销码。
- 后续接真实订单系统时，只需要替换 Tool 内部实现，`TravelOrchestrator` 和前端状态展示可以保持稳定。

## 真实打卡 Tool

真实打卡不交给大模型判断，应该由确定性规则完成。

当前实现已经加入 `evaluate_checkin()`：

```text
当前位置 + 已选点位坐标 + 停留时间
↓
计算最近点位距离
↓
距离小于 CHECKIN_RADIUS_METERS
且停留大于 CHECKIN_MIN_STAY_SECONDS
↓
写入 checked_in_card_ids
```

默认规则：

```bash
CHECKIN_RADIUS_METERS=80
CHECKIN_MIN_STAY_SECONDS=10
```

实际产品里建议再增加：

- 前端持续上报定位，而不是只上报一次。
- 同一个点位只允许打卡一次。
- 打卡记录写数据库。
- 使用高德 ReGeo 校验当前位置描述。
- 使用 MapMatch 判断用户是否在合理道路轨迹上，减少 GPS 漂移误判。
- 风险场景下要求用户主动点击“确认到达”。

## 高德 MapMatch

当前 `match_trace()` 已改成：

- `AMAP_MAPMATCH_ENABLED=false`：直接返回 mock fallback。
- `AMAP_MAPMATCH_ENABLED=true`：请求高德 `/v4/grasproad/driving`。

环境变量：

```bash
AMAP_MAPMATCH_URL=https://restapi.amap.com/v4/grasproad/driving
AMAP_MAPMATCH_ENABLED=true
```

前端或客户端需要上传轨迹点：

```json
[
  {
    "lng": 114.0412,
    "lat": 22.3129,
    "speed": 3.2,
    "angle": 90,
    "timestamp": 1780304400
  }
]
```

Tool 会转换为高德需要的 `x/y/sp/ag/tm` 格式。

## 海报生成

当前已接入 `QwenPosterImageTool`，`PosterAgent` 不再只返回结构化文案，而是会调用阿里百炼 `qwen-image-2.0-pro` 生成 PNG 海报。

链路：

```text
PosterAgent 生成原创海报文案
↓
QwenPosterImageTool 读取 TripState 并构造生图提示词
↓
调用 qwen-image-2.0-pro 生成复古旅行拼贴风格 PNG
↓
保存到 backend/static/generated/
↓
返回 poster.image_url
```

海报包含：

- `title`
- `subtitle`
- `share_text`
- `poster_style`
- `layout`
- `image_url`
- `image_path`
- `image_generation_status`
- `image_generation_model`
- `image_generation_error`
- `image_prompt`
- `render_tool`
- `render_format`

视觉方向：

- 1080 x 1920 竖版 PNG 社媒海报。
- 美团黄作为主视觉点睛色。
- 复古纸张、旅行地图、城市印章、路线折线、年度总结式数据卡。
- 包含目的地、日期、偏好、天气、路线距离、行程时长、打卡数、行程时间轴。

边界约定：`PosterAgent` 只负责文案和布局意图，`QwenPosterImageTool` 负责图片生成。如果模型接口没有返回 PNG，系统不会伪装成本地生图成功，而是返回 `image_generation_status=failed` 和 `image_prompt` 供调试。

推荐链路：

```text
PosterAgent 生成文案和布局 JSON
↓
QwenPosterImageTool 调用 qwen-image-2.0-pro
↓
ObjectStorageTool 保存图片
↓
返回 poster.image_url
```
