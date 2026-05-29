# 高德 AMap 天气 API 接入

## 当前接入状态

本项目已将天气能力从纯 Mock Tool 升级为：

```text
AMap Weather API
↓
Mock fallback
↓
TripState.weather
```

也就是说：

- 配置 `AMAP_WEATHER_API_KEY` 后，后端会请求真实高德天气。
- 未配置 key、网络失败、接口返回错误时，后端自动回退到 Mock 天气。
- 前端后端控制台会显示 `weather.source = amap | mock`。

## 使用的接口

接口文档入口：

https://amap.apifox.cn/api-14675765

当前按高德天气查询接口形式请求：

```text
GET https://restapi.amap.com/v3/weather/weatherInfo
```

核心参数：

```text
key         高德 Web 服务 Key
city        城市名称或 adcode
extensions  base 实况天气 / all 预报天气
output      JSON
```

## 环境变量

不要把 key 写进代码。启动服务前配置：

```bash
export AMAP_WEATHER_API_KEY="你的高德 Web 服务 Key"
export AMAP_WEATHER_BASE_URL="https://restapi.amap.com/v3/weather/weatherInfo"
export AMAP_WEATHER_EXTENSIONS="base"
uvicorn backend.main:app --reload
```

也可以写入本地 `.env`：

```text
AMAP_WEATHER_API_KEY=你的高德 Web 服务 Key
AMAP_WEATHER_BASE_URL=https://restapi.amap.com/v3/weather/weatherInfo
AMAP_WEATHER_EXTENSIONS=base
```

`.env` 已被 `.gitignore` 忽略。

## Key 创建方式

我不能直接替你创建高德 Key，因为这需要你的高德开放平台账号和控制台权限。

你需要在高德开放平台创建 Web 服务 Key：

1. 登录高德开放平台控制台。
2. 创建应用。
3. 添加 Key。
4. 服务平台选择 Web 服务。
5. 启用天气查询相关 Web 服务能力。
6. 将 Key 配置到 `AMAP_WEATHER_API_KEY`。

## 后端落点

代码位置：

```text
backend/tools/amap.py
  get_weather()
  _get_amap_weather()
  _normalize_amap_weather()
```

当前 `POISelectionAgent` 会在生成候选卡片时调用：

```text
tools.get_weather(destination, travel_date)
```

返回结果写入：

```text
TripState.weather
```

后续 `ItineraryPlannerAgent` 和 `RuntimeMonitorAgent` 会继续读取这个天气状态。
