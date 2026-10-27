# 六祖镇原型 GIS 数据

本目录保存第三阶段开发所需的小范围 GIS 数据，不代表景区官方测绘成果。

## 当前数据

- `raw/osm-liuzu-2026-08-14.json`：通过 Overpass API 提取的 OpenStreetMap 原始快照，范围约为 `112.19–112.26E, 22.54–22.66N`。
- `processed/liuzu-osm.gpkg`：GeoPackage，按 POI、道路、水系、建筑和其他地标分层。
- `processed/*.geojson`：供 Web 地图直接读取的 WGS84 图层。
- `processed/summary.json`：要素数量、边界、几何类型和有效性检查结果。

## 使用边界

- 坐标系为 WGS84（EPSG:4326）。
- 数据版权归 OpenStreetMap contributors，按 ODbL 1.0 使用；产品地图必须显示 `© OpenStreetMap contributors` 并链接到版权页。
- OSM 覆盖可能不完整，内部步行路、入口、开放状态及安全信息仍需现场核验。
- 高德候选 POI 是 GCJ-02，须保留来源坐标系并转换后才能与本目录数据叠加，不得直接混用。

## 可重复处理

运行 `tools/process_osm_extract.py` 可从原始 Overpass JSON 重建 GeoPackage 与 GeoJSON。

参考：

- https://www.openstreetmap.org/copyright
- https://overpass-api.de/
- https://download.geofabrik.de/asia/china/guangdong.html
