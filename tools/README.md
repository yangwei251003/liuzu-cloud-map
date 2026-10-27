# 可选地理资料处理工具

这两个原项目工具也随源码归档，默认不会运行，不影响 Node 网页或 Pages 体验。准备 Python 3.12 后可 `python -m pip install -r tools/requirements.txt`。

```sh
python tools/process_osm_extract.py path/to/authorized-overpass-export.json --output .local/gis-processed
python tools/build_prototype_routes.py --roads public/data/gis/roads.geojson --output .local/prototype-routes.geojson
```

输入必须是有权使用的公开 Overpass/OSM 数据，不是游客轨迹或私人家庭位置。转换器会排除联系、地址、owner/operator/payment 标签；按 ODbL 保留公开要素 ID、来源与几何。原始接口下载不随仓库分发。

输出默认进入忽略的 `.local/`，不得把 GPKG 数据包或未经清理的原始资料当源码提交。候选连线只供界面/算法研究，输出固定带未现场核验标记，不会更新空的正式路网快照或赋予导航资格。工具中的候选景点坐标是早期项目研究资料，不是官方入口、道路安全或当前通行证明。
