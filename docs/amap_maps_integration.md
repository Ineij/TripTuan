# 高德 AMap 地图 Tool 接入

## 当前接入状态

项目地图 Tool 层已切换为：

```text
AMap Web Service
↓
Mock fallback
↓
TripState
```

也就是说，配置高德 Web 服务 Key 后，后端会优先调用高德接口；接口失败、网络失败或权限未开通时，自动回退到 Mock/本地计算，并在响应中写入 `source` 和 `fallback_reason`。

## 已接入能力

| 能力 | 高德接口 | 代码入口 | 当前用途 |
| --- | --- | --- | --- |
| 地理编码 | `/v3/geocode/geo` | `tools.geocode_address()` | 地址转经纬度，辅助 POI 检索 |
| 逆地理编码 | `/v3/geocode/regeo` | `tools.reverse_geocode()` | 实时定位转位置描述 |
| POI 关键字搜索 | `/v3/place/text` | `tools.search_pois()` | 生成候选点位 |
| 周边搜索 | `/v3/place/around` | `tools.search_pois()` | 补充餐饮、小吃、奶茶、休息点 |
| 步行路径规划 | `/v3/direction/walking` | `tools.get_route_between()` | 近距离路线距离和耗时 |
| 驾车路径规划 | `/v3/direction/driving` | `tools.get_route_between()` | 远距离/打车建议 |
| 行政区划 | `/v3/config/district` | `tools.get_division()` | 城市/区县归属和 adcode 辅助 |
| 轨迹纠偏 | `/v4/grasproad/driving` | `tools.match_trace()` | 已封装真实请求；默认关闭，开通权限后启用 |

## 环境变量

```bash
export AMAP_API_KEY="你的高德 Web 服务 Key"
export AMAP_MAP_API_KEY="你的高德 Web 服务 Key"

export AMAP_GEO_URL="https://restapi.amap.com/v3/geocode/geo"
export AMAP_REGEO_URL="https://restapi.amap.com/v3/geocode/regeo"
export AMAP_PLACE_TEXT_URL="https://restapi.amap.com/v3/place/text"
export AMAP_PLACE_AROUND_URL="https://restapi.amap.com/v3/place/around"
export AMAP_ROUTE_WALKING_URL="https://restapi.amap.com/v3/direction/walking"
export AMAP_ROUTE_DRIVING_URL="https://restapi.amap.com/v3/direction/driving"
export AMAP_DISTRICT_URL="https://restapi.amap.com/v3/config/district"
export AMAP_MAPMATCH_URL="https://restapi.amap.com/v4/grasproad/driving"
export AMAP_MAPMATCH_ENABLED="false"
```

当前 `.env` 已支持本地读取，且 `.env` 已被 `.gitignore` 忽略。

## 后端运行面板怎么看

打开：

```text
http://127.0.0.1:8000/
```

点击 `Run Full Workflow` 后观察：

- `AMap Maps Key = configured`
- `candidate_source = amap | mock`
- `route_source = amap | mock`
- `regeo_source = amap | mock`
- `weather_source = amap | mock`

如果 source 是 `mock`，在 `TripState JSON` 中查看 `fallback_reason`。

## 注意

高德轨迹纠偏通常需要额外服务权限和真实轨迹点数据。当前项目已实现 `match_trace()` Tool：`AMAP_MAPMATCH_ENABLED=true` 时会把前端上传的 `lng/lat/speed/angle/timestamp` 转成高德需要的 `x/y/sp/ag/tm` 后请求 `/v4/grasproad/driving`；默认 fallback，不会影响主流程。
