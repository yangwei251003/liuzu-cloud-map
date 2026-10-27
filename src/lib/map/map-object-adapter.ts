/**
 * 多数据源 → MapObject 适配器
 *
 * 将项目中分散的 ScenicSpot、MapConceptEntity、Place、Activity、MapPoi
 * 五种数据源统一转换为 MapObject，供 Leaflet 地图引擎渲染。
 */

import type { MapObject, MapObjectType, MapObjectAction, MapObjectStatus } from "./map-object";
import type { ScenicSpot } from "@/lib/scenic-data";
import type { MapConceptEntity } from "@/lib/map-concept-data";
import type { MapPoi } from "@/lib/map-experience";
import type { Place, Activity } from "@/lib/portal/types";

// ── ScenicSpot 适配 ───────────────────────────────────────

export function fromScenicSpot(spot: ScenicSpot): MapObject {
  return {
    id: `scenic-${spot.id}`,
    type: "scenic_spot",
    title: spot.name,
    shortLabel: spot.name.charAt(0),
    subtitle: spot.subtitle,
    description: spot.subtitle,
    coordinates: [spot.latitude, spot.longitude],
    gcj02: spot.originalGcj02 ? [spot.originalGcj02[1], spot.originalGcj02[0]] : undefined,
    status: "available",
    source: "六祖云游核心景点",
    verification: spot.verification,
    tags: [spot.category, spot.duration],
    category: spot.category,
    featured: true,
    action: "guide",
    linkUrl: `/place/${spot.id}`,
    sourceModel: "scenic_spot",
    sourceId: spot.id,
  };
}

// ── MapConceptEntity 适配 ─────────────────────────────────

function conceptActionToMapAction(action: MapConceptEntity["action"]): MapObjectAction {
  const map: Record<MapConceptEntity["action"], MapObjectAction> = {
    chat: "chat",
    guide: "guide",
    route: "navigate",
    community: "community",
    buy: "buy",
  };
  return map[action];
}

function conceptStatusToMapStatus(status: MapConceptEntity["status"]): MapObjectStatus {
  const map: Record<MapConceptEntity["status"], MapObjectStatus> = {
    "正式开放": "open",
    "展示可用": "available",
    "待核验": "unverified",
    "位置已模糊": "blurred",
  };
  return map[status];
}

function conceptTypeToMapType(type: MapConceptEntity["type"]): MapObjectType {
  const map: Record<MapConceptEntity["type"], MapObjectType> = {
    person: "npc",
    resource: "merchant",
    place: "scenic_spot",
  };
  return map[type];
}

export function fromConceptEntity(entity: MapConceptEntity): MapObject {
  return {
    id: `concept-${entity.id}`,
    type: conceptTypeToMapType(entity.type),
    title: entity.title,
    shortLabel: entity.short,
    subtitle: entity.subType,
    description: entity.body,
    coordinates: entity.coord,
    status: conceptStatusToMapStatus(entity.status),
    source: entity.source,
    verification: entity.status,
    tags: entity.tags,
    featured: entity.featured !== false,
    action: conceptActionToMapAction(entity.action),
    linkUrl: entity.linkUrl,
    sourceModel: "concept_entity",
    sourceId: entity.id,
  };
}

// ── Portal Place 适配 ─────────────────────────────────────

function placeCategoryToMapType(category: Place["category"]): MapObjectType {
  const map: Record<string, MapObjectType> = {
    "文化": "culture",
    "山水": "scenic_spot",
    "休闲": "scenic_spot",
    "餐饮": "restaurant",
    "住宿": "lodge",
    "非遗": "culture",
    "服务": "facility",
    "在地体验": "activity",
  };
  return map[category] ?? "merchant";
}

export function fromPortalPlace(place: Place): MapObject {
  return {
    id: `place-${place.id}`,
    type: placeCategoryToMapType(place.category),
    title: place.name,
    shortLabel: place.name.charAt(0),
    subtitle: place.subtitle,
    description: place.summary || place.description || "",
    coordinates: [place.latitude, place.longitude],
    gcj02: place.gcj02 ? [place.gcj02[1], place.gcj02[0]] : undefined,
    status: place.status === "published" ? "open" : "unverified",
    source: "商户入驻申报",
    verification: place.status,
    tags: place.serviceTags || [],
    category: place.category,
    featured: place.featured ?? false,
    action: "navigate",
    imageUrl: place.images?.[0],
    sourceModel: "portal_place",
    sourceId: place.id,
  };
}

// ── Portal Activity 适配 ──────────────────────────────────

export function fromPortalActivity(activity: Activity): MapObject {
  return {
    id: `activity-${activity.id}`,
    type: "activity",
    title: activity.name,
    shortLabel: activity.name.charAt(0),
    subtitle: activity.category,
    description: activity.timeDescription || "",
    coordinates: [activity.latitude, activity.longitude],
    gcj02: activity.gcj02 ? [activity.gcj02[1], activity.gcj02[0]] : undefined,
    status: activity.status === "published" ? "open" : "unverified",
    source: activity.organizationName || "活动主办方",
    verification: activity.status,
    tags: [activity.category, activity.bookingMethod],
    category: activity.category,
    featured: false,
    action: "book",
    sourceModel: "portal_activity",
    sourceId: activity.id,
  };
}

// ── OSM POI 适配 ──────────────────────────────────────────

function osmCategoryToMapType(category: string, subtype: string): MapObjectType {
  if (category === "tourism" || category === "historic") return "scenic_spot";
  if (category === "place") return "village";
  if (category === "amenity") {
    if (subtype === "restaurant" || subtype === "cafe" || subtype === "fast_food") return "restaurant";
    if (subtype === "hotel" || subtype === "guest_house") return "lodge";
    return "facility";
  }
  return "facility";
}

export function fromOsmPoi(poi: MapPoi): MapObject {
  return {
    id: `osm-${poi.id}`,
    type: osmCategoryToMapType(poi.category, poi.subtype),
    title: poi.name || `${poi.subtype}`,
    shortLabel: (poi.name || poi.subtype).charAt(0),
    description: `来源：OpenStreetMap · ${poi.category} / ${poi.subtype}`,
    coordinates: poi.coordinates,
    status: "unverified",
    source: poi.source,
    verification: poi.verification,
    tags: [poi.category, poi.subtype].filter(Boolean),
    category: poi.category,
    featured: false,
    sourceModel: "osm_poi",
    sourceId: poi.id,
  };
}

// ── 聚合器 ────────────────────────────────────────────────

type AggregateOptions = {
  scenicSpots?: readonly ScenicSpot[];
  conceptEntities?: readonly MapConceptEntity[];
  portalPlaces?: readonly Place[];
  portalActivities?: readonly Activity[];
  osmPois?: readonly MapPoi[];
};

/**
 * 聚合全部数据源为统一 MapObject[]，以 sourceModel + sourceId 去重。
 * 优先级：concept_entity > scenic_spot > portal_place > portal_activity > osm_poi
 */
export function aggregateAllMapObjects(options: AggregateOptions): MapObject[] {
  const seen = new Set<string>();
  const result: MapObject[] = [];

  function add(obj: MapObject) {
    const key = `${obj.sourceModel}:${obj.sourceId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(obj);
  }

  // 概念实体优先（手工策展）
  options.conceptEntities?.forEach((e) => add(fromConceptEntity(e)));
  // 核心景点
  options.scenicSpots?.forEach((s) => add(fromScenicSpot(s)));
  // 商户动态数据
  options.portalPlaces?.forEach((p) => add(fromPortalPlace(p)));
  options.portalActivities?.forEach((a) => add(fromPortalActivity(a)));
  // OSM 公共数据（量最大，优先级最低）
  options.osmPois?.forEach((p) => add(fromOsmPoi(p)));

  return result;
}
