# POI 图片批量风格化工具

这个包用于把 CSV 里的真实 POI 图片批量送到千问 / DashScope 图片接口，生成统一的 1:1 Instagram editorial 风格推荐图，并把生成后的在线图片链接写回表格。

默认模型：`qwen-image-2.0-pro`

## 0. 包里有什么

```text
generate_csv_poi_images_dashscope.py  # 批量生成图片，并在结束时回写 CSV
sync_generated_image_links.py         # 随时把已生成图片链接同步回 CSV / Excel
start_local_static_server.sh          # 本地图片静态服务，生成 http://127.0.0.1:8000/static/... 链接
poi_image_csv_template.csv            # CSV 模板
requirements.txt                      # 可选依赖，用于导出 Excel
README.md                             # 使用说明
```

## 1. 放到项目里

推荐把整个文件夹放在 TripTuan 项目根目录的 `deliverables/` 下。如果只复制脚本，也可以这样放：

```text
TripTuan/
  backend/
  frontend/
  deliverables/
    dashscope_csv_image_tool/
      generate_csv_poi_images_dashscope.py
      sync_generated_image_links.py
      start_local_static_server.sh
```

下面所有命令都在 TripTuan 项目根目录运行。

## 2. CSV 格式

CSV 必须包含这些列：

```csv
poi_id,name,type,city,source_image_url
1,示例咖啡店,美食,深圳,http://...
```

字段说明：

- `poi_id`：POI 唯一 ID，用来命名输出图
- `name`：POI 名称，会进入提示词
- `type`：如 `美食`、`酒店`、`景点`
- `city`：如 `深圳`
- `source_image_url`：真实原图 URL

## 3. 配置 API Key

不要把 key 写进代码或提交到 Git。

在项目根目录创建 `.env.local`：

```bash
printf 'DASHSCOPE_API_KEY=你的DashScopeKey\n' > .env.local
```

也可以临时用环境变量：

```bash
export DASHSCOPE_API_KEY="你的DashScopeKey"
```

如果需要导出 `.xlsx`，安装可选依赖：

```bash
python3 -m pip install -r deliverables/dashscope_csv_image_tool/requirements.txt
```

## 4. 深圳数据批量生成

假设深圳 CSV 叫 `sz_poi.csv`：

```bash
python3 deliverables/dashscope_csv_image_tool/generate_csv_poi_images_dashscope.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "http://127.0.0.1:8000" \
  --delay 60
```

输出位置：

```text
backend/static/generated/pois/csv-source/   # 下载的真实原图
backend/static/generated/pois/csv-preview/  # 生成后的风格化图
backend/static/generated/pois/csv-preview/manifest.jsonl
backend/static/generated/pois/csv-preview/sz_poi_with_generated_images.csv
```

生成后的 CSV 会新增：

```csv
generated_image_url
```

默认会写成这种在线链接：

```text
http://127.0.0.1:8000/static/generated/pois/csv-preview/sz_1_示例咖啡店_ins.png
```

## 5. 本地部署图片服务

开一个新终端，在 TripTuan 项目根目录运行：

```bash
bash deliverables/dashscope_csv_image_tool/start_local_static_server.sh
```

或者直接运行：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory backend
```

这样图片就能通过下面这种 URL 打开：

```text
http://127.0.0.1:8000/static/generated/pois/csv-preview/xxx.png
```

注意：`127.0.0.1` 只对本机有效。发给别人或线上项目使用时，需要把 `--public-base-url` 换成你们的后端域名或 CDN 域名。

例如：

```bash
python3 deliverables/dashscope_csv_image_tool/generate_csv_poi_images_dashscope.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "https://your-domain.com" \
  --delay 60
```

CSV 里就会写成：

```text
https://your-domain.com/static/generated/pois/csv-preview/xxx.png
```

## 6. 生成中途同步表格

如果图片还没全部跑完，也可以随时把“已经生成好的图片”同步回表格：

```bash
python3 deliverables/dashscope_csv_image_tool/sync_generated_image_links.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "http://127.0.0.1:8000"
```

如果想同时导出 Excel：

```bash
python3 -m pip install openpyxl

python3 deliverables/dashscope_csv_image_tool/sync_generated_image_links.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "http://127.0.0.1:8000" \
  --xlsx
```

输出：

```text
backend/static/generated/pois/csv-preview/sz_poi_with_generated_images.csv
backend/static/generated/pois/csv-preview/sz_poi_with_generated_images.xlsx
```

## 7. 常用参数

```bash
--limit 5        # 只处理前 5 条；不填则处理全部
--offset 2       # 跳过前 2 条，从第 3 条继续
--delay 60       # 每张成功后等待 60 秒，避免限流
--overwrite      # 已生成的图片也重新生成
--dry-run        # 只检查 CSV 和 prompt，不调用 API
--scene sz       # 深圳用 sz，北京用 bj
--model qwen-image-2.0-pro
--public-base-url "http://127.0.0.1:8000"
```

## 8. 断点续跑

如果遇到 `HTTP 429 / Throttling.RateQuota`，说明被限流了。等一会儿后可以从失败位置继续。

例如前 20 张成功，第 21 张限流：

```bash
python3 deliverables/dashscope_csv_image_tool/generate_csv_poi_images_dashscope.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --offset 20 \
  --public-base-url "http://127.0.0.1:8000" \
  --delay 60
```

如果不确定已经生成到哪，可以看文件数量：

```bash
find backend/static/generated/pois/csv-preview -maxdepth 1 -name 'sz_*_ins.png' | wc -l
```

## 9. 后台运行

长批量建议后台运行并写日志：

```bash
nohup python3 -u deliverables/dashscope_csv_image_tool/generate_csv_poi_images_dashscope.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "http://127.0.0.1:8000" \
  --delay 60 \
  > backend/static/generated/pois/csv-preview/sz_generation.log 2>&1 &
```

看实时进度：

```bash
tail -f backend/static/generated/pois/csv-preview/sz_generation.log
```

## 10. 风格原则

脚本内置 prompt 会尽量做到：

- 基于真实原图风格化，不凭空换地点
- 保留门头、招牌、入口、菜品、景观等关键结构
- 统一成 1:1 推荐卡片图
- 风格偏 premium Instagram editorial / boutique lifestyle
- 低饱和、自然光、柔和阴影、胶片颗粒、matte 质感
- 避免水印、UI、话题标签、廉价广告、过度 HDR、塑料感

## 11. 线上合并建议

开发阶段可以先用 `http://127.0.0.1:8000` 本地预览。

上线或给别人访问时，有两种方式：

1. 把 `backend/static/generated/pois/csv-preview/` 部署到后端静态目录，让后端域名提供 `/static/...`。
2. 把图片上传到 CDN，然后用 CDN 域名作为 `--public-base-url` 重新同步表格。

如果图片已经生成好了，不需要重新生成，只需要重新同步链接：

```bash
python3 deliverables/dashscope_csv_image_tool/sync_generated_image_links.py \
  --csv "./sz_poi.csv" \
  --scene sz \
  --public-base-url "https://your-domain.com" \
  --xlsx
```
