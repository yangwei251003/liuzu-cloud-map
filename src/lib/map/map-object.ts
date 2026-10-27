/**
 * 云游地图统一地图对象模型
 *
 * 所有地图上展示的实体（景点、村落、商户、设施、NPC 等）
 * 都统一转换为 MapObject 后交给地图引擎渲染。
 */

// ── 类型常量 ──────────────────────────────────────────────

export const MAP_OBJECT_TYPES = [
  "scenic_spot",
  "village",
  "merchant",
  "restaurant",
  "lodge",
  "facility",
  "culture",
  "activity",
  "npc",
  "visitor",
  "community",
] as const;

export type MapObjectType = (typeof MAP_OBJECT_TYPES)[number];

export const MAP_OBJECT_TYPE_LABELS: Record<MapObjectType, string> = {
  scenic_spot: "景点",
  village: "村落",
  merchant: "商户",
  restaurant: "餐饮",
  lodge: "民宿",
  facility: "公共设施",
  culture: "文化资源",
  activity: "活动",
  npc: "向导",
  visitor: "游客",
  community: "社区",
};

// ── Marker 形状 ───────────────────────────────────────────

export type MarkerShape = "circle" | "square" | "diamond" | "hexagon" | "pin" | "badge" | "circle-sm";

export type MarkerStyle = {
  shape: MarkerShape;
  color: string;
  size: number; // px
  cssClass: string;
};

/** 每种对象类型的默认 Marker 样式 */
export const MARKER_STYLES: Record<MapObjectType, MarkerStyle> = {
  scenic_spot: { shape: "diamond", color: "#d8a746", size: 38, cssClass: "marker-diamond" },
  village:     { shape: "hexagon", color: "#4a8c6f", size: 36, cssClass: "marker-hexagon" },
  merchant:    { shape: "square",  color: "#c9484b", size: 40, cssClass: "marker-square" },
  restaurant:  { shape: "square",  color: "#d4844a", size: 36, cssClass: "marker-square" },
  lodge:       { shape: "square",  color: "#4a7aad", size: 36, cssClass: "marker-square" },
  facility:    { shape: "circle-sm", color: "#6b7c72", size: 28, cssClass: "marker-circle-sm" },
  culture:     { shape: "diamond", color: "#a67c52", size: 36, cssClass: "marker-diamond" },
  activity:    { shape: "badge",   color: "#2d8f5e", size: 40, cssClass: "marker-badge" },
  npc:         { shape: "circle",  color: "#174a3a", size: 42, cssClass: "marker-circle" },
  visitor:     { shape: "circle-sm", color: "#2f74a8", size: 30, cssClass: "marker-user" },
  community:   { shape: "square",  color: "#6b5b8a", size: 36, cssClass: "marker-square" },
};

// ── 数据来源 ──────────────────────────────────────────────

export type MapObjectSourceModel =
  | "scenic_spot"
  | "concept_entity"
  | "portal_place"
  | "portal_activity"
  | "osm_poi"
  | "custom";

// ── 核心 MapObject ────────────────────────────────────────

export type MapObjectStatus = "open" | "available" | "unverified" | "blurred" | "closed";

export type MapObjectAction = "navigate" | "chat" | "guide" | "community" | "buy" | "book" | "checkin";

export type MapObject = {
  id: string;
  type: MapObjectType;
  title: string;
  shortLabel: string;
  subtitle?: string;
  description: string;
  coordinates: [number, number]; // [lat, lng] WGS-84
  gcj02?: [number, number];
  status: MapObjectStatus;
  source: string;
  verification: string;
  tags: string[];
  category?: string;
  featured?: boolean;
  action?: MapObjectAction;
  linkUrl?: string;
  imageUrl?: string;
  distance?: number;
  sourceModel: MapObjectSourceModel;
  sourceId: string;
};

// ── 筛选类型 ──────────────────────────────────────────────

export type MapFilterCategory = "featured" | MapObjectType;

export const MAP_FILTER_OPTIONS: { id: MapFilterCategory; label: string; shape?: MarkerShape; color?: string }[] = [
  { id: "featured", label: "精选" },
  { id: "scenic_spot", label: "景点", shape: "diamond", color: "#d8a746" },
  { id: "village", label: "村落", shape: "hexagon", color: "#4a8c6f" },
  { id: "merchant", label: "商户", shape: "square", color: "#c9484b" },
  { id: "restaurant", label: "餐饮", shape: "square", color: "#d4844a" },
  { id: "lodge", label: "民宿", shape: "square", color: "#4a7aad" },
  { id: "facility", label: "设施", shape: "circle-sm", color: "#6b7c72" },
  { id: "culture", label: "文化", shape: "diamond", color: "#a67c52" },
  { id: "activity", label: "活动", shape: "badge", color: "#2d8f5e" },
  { id: "npc", label: "向导", shape: "circle", color: "#174a3a" },
];
