/**
 * 地图数据 API 层
 *
 * 首期在客户端本地聚合全部数据源，预留服务端 REST API 接口。
 */

import type { MapObject, MapFilterCategory } from "./map-object";
import { aggregateAllMapObjects } from "./map-object-adapter";
import { scenicSpots } from "@/lib/scenic-data";
import { MAP_CONCEPT_ENTITIES } from "@/lib/map-concept-data";
import { PortalDemoRepository } from "@/lib/portal/demo-repository";
import { parseMapPoiCollection } from "@/lib/map-experience";

type Bounds = { north: number; south: number; east: number; west: number };

let cachedPois: MapObject[] | null = null;
let cachedGeoJsonPois: Awaited<ReturnType<typeof parseMapPoiCollection>> | null = null;

/** 加载 OSM GeoJSON POI 数据（一次性） */
async function loadOsmPois() {
  if (cachedGeoJsonPois) return cachedGeoJsonPois;
  try {
    const res = await fetch("/data/gis/pois.geojson");
    if (!res.ok) return [];
    const geojson = await res.json();
    cachedGeoJsonPois = parseMapPoiCollection(geojson);
    return cachedGeoJsonPois;
  } catch {
    return [];
  }
}

/** 获取全量 MapObject（带缓存） */
export async function getAllMapObjects(): Promise<MapObject[]> {
  if (cachedPois) return cachedPois;

  const osmPois = await loadOsmPois();
  const portalPlaces = PortalDemoRepository.getPlaces().filter((p) => p.status === "published");
  const portalActivities = PortalDemoRepository.getActivities().filter((a) => a.status === "published");

  cachedPois = aggregateAllMapObjects({
    conceptEntities: MAP_CONCEPT_ENTITIES,
    scenicSpots,
    portalPlaces,
    portalActivities,
    osmPois,
  });
  return cachedPois;
}

/** Portal 数据更新时清除缓存 */
export function invalidateMapObjectCache() {
  cachedPois = null;
}

/** 按视口范围 + 筛选条件查询 MapObject */
export async function fetchMapObjects(
  bounds: Bounds | null,
  filter: MapFilterCategory = "featured",
): Promise<MapObject[]> {
  const all = await getAllMapObjects();

  let filtered = all;

  // 类型筛选
  if (filter === "featured") {
    filtered = filtered.filter((o) => o.featured);
  } else {
    filtered = filtered.filter((o) => o.type === filter);
  }

  // 视口范围筛选
  if (bounds) {
    filtered = filtered.filter((o) => {
      const [lat, lng] = o.coordinates;
      return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
    });
  }

  return filtered;
}

/** 搜索 MapObject */
export async function searchMapObjects(query: string, maxResults = 10): Promise<MapObject[]> {
  if (!query.trim()) return [];

  const all = await getAllMapObjects();
  const q = query.trim().toLowerCase();

  return all
    .filter((o) => {
      const haystack = `${o.title}${o.subtitle ?? ""}${o.description}${o.tags.join("")}${o.category ?? ""}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, maxResults);
}

/** 获取单个 MapObject 详情 */
export async function getMapObjectDetail(id: string): Promise<MapObject | null> {
  const all = await getAllMapObjects();
  return all.find((o) => o.id === id) ?? null;
}
