export const MAP_THEME_IDS = ["standard", "zen", "lingnan", "night"] as const;

export type MapThemeId = (typeof MAP_THEME_IDS)[number];

export type MapThemeDefinition = {
  id: MapThemeId;
  name: string;
  shortName: string;
  description: string;
  colors: {
    background: string;
    water: string;
    building: string;
    buildingOutline: string;
    roadCasing: string;
    roadMajor: string;
    roadMinor: string;
    footway: string;
    poi: string;
    label: string;
    route: string;
  };
};

export const MAP_THEMES: Record<MapThemeId, MapThemeDefinition> = {
  standard: {
    id: "standard",
    name: "标准清晰",
    shortName: "标准",
    description: "提高道路与设施辨识度，适合现场查看。",
    colors: {
      background: "#edf0ed",
      water: "#79a6b3",
      building: "#d6dcda",
      buildingOutline: "#bcc6c2",
      roadCasing: "#ffffff",
      roadMajor: "#78858a",
      roadMinor: "#a6ada9",
      footway: "#9a8061",
      poi: "#315f52",
      label: "#173f35",
      route: "#c84f43",
    },
  },
  zen: {
    id: "zen",
    name: "禅意宣纸",
    shortName: "禅意",
    description: "竹青与淡金叠加，但不改变道路几何。",
    colors: {
      background: "#e9eee5",
      water: "#8daeb2",
      building: "#d4d8ca",
      buildingOutline: "#c1c9bb",
      roadCasing: "#fffaf0",
      roadMajor: "#a78955",
      roadMinor: "#c1a46d",
      footway: "#7f6d50",
      poi: "#315f52",
      label: "#173f35",
      route: "#d95a4a",
    },
  },
  lingnan: {
    id: "lingnan",
    name: "岭南晨色",
    shortName: "岭南",
    description: "暖灰瓦与晨光色，用于行前探索。",
    colors: {
      background: "#f2eadc",
      water: "#6e9ca6",
      building: "#d8c6a8",
      buildingOutline: "#bfa987",
      roadCasing: "#fff8ea",
      roadMajor: "#8b684b",
      roadMinor: "#b68c63",
      footway: "#6c795d",
      poi: "#355e4d",
      label: "#29463d",
      route: "#bb5547",
    },
  },
  night: {
    id: "night",
    name: "灯影夜游",
    shortName: "夜游",
    description: "低亮背景与金色道路；仅为视觉预览。",
    colors: {
      background: "#172722",
      water: "#315f68",
      building: "#30423c",
      buildingOutline: "#425a51",
      roadCasing: "#20332d",
      roadMajor: "#d0b26f",
      roadMinor: "#8e815f",
      footway: "#a18e68",
      poi: "#dfc47c",
      label: "#f3ead7",
      route: "#e46c58",
    },
  },
};

export const MAP_LAYER_IDS = ["buildings", "water", "roads", "places", "facilities", "routes"] as const;
export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

export const MAP_LAYER_LABELS: Record<MapLayerId, string> = {
  buildings: "建筑轮廓",
  water: "水系",
  roads: "道路与步道",
  places: "村镇与景点",
  facilities: "公共设施",
  routes: "候选路线",
};

export const DEFAULT_VISIBLE_MAP_LAYERS: Record<MapLayerId, boolean> = {
  buildings: true,
  water: true,
  roads: true,
  places: true,
  facilities: true,
  routes: true,
};

export const FACILITY_SUBTYPES = ["toilets", "parking", "hospital", "police", "information", "shelter"] as const;
export type FacilitySubtype = (typeof FACILITY_SUBTYPES)[number];

export const FACILITY_LABELS: Record<FacilitySubtype, string> = {
  toilets: "卫生间",
  parking: "停车点",
  hospital: "医疗设施",
  police: "警务设施",
  information: "信息服务",
  shelter: "休息遮蔽",
};

type UnknownRecord = Record<string, unknown>;

export type MapPoi = {
  id: string;
  name: string;
  category: string;
  subtype: string;
  coordinates: [number, number];
  sourceUrl: string;
  source: string;
  verification: "OSM_PUBLIC_CANDIDATE";
};

export type PrototypeRouteSummary = {
  id: string;
  from: string;
  to: string;
  distanceMeters: number;
  status: "UNVERIFIED_OSM_PROTOTYPE";
  warning: string;
  source: string;
};

export type MapSearchResult = {
  id: string;
  kind: "SCENIC_SPOT" | "OSM_POI";
  name: string;
  detail: string;
  coordinates: [number, number];
  verification: string;
};

export type SearchableScenicSpot = {
  id: string;
  name: string;
  subtitle: string;
  longitude: number;
  latitude: number;
  verification: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function boundedText(value: unknown, maximum = 160): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maximum ? text : null;
}

function osmSourceUrl(value: unknown): string | null {
  const text = boundedText(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname === "www.openstreetmap.org" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseMapPoiCollection(value: unknown, maximumFeatures = 2_000): MapPoi[] {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features) || value.features.length > maximumFeatures) return [];
  const result: MapPoi[] = [];
  const seen = new Set<string>();

  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) continue;
    if (feature.geometry.type !== "Point" || !isFiniteCoordinate(feature.geometry.coordinates)) continue;
    const osmType = boundedText(feature.properties.osm_type, 20);
    const osmId = typeof feature.properties.osm_id === "number" || typeof feature.properties.osm_id === "string"
      ? String(feature.properties.osm_id)
      : null;
    const category = boundedText(feature.properties.category, 60);
    const subtype = boundedText(feature.properties.subtype, 60);
    const sourceUrl = osmSourceUrl(feature.properties.source_url);
    if (!osmType || !osmId || !category || !subtype || !sourceUrl) continue;
    const id = `osm-${osmType}-${osmId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const suppliedName = boundedText(feature.properties.name, 120);
    result.push({
      id,
      name: suppliedName ?? `未命名${subtype}（OSM ${osmId}）`,
      category,
      subtype,
      coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
      sourceUrl,
      source: boundedText(feature.properties.source, 120) ?? "OpenStreetMap contributors",
      verification: "OSM_PUBLIC_CANDIDATE",
    });
  }

  return result;
}

export function parsePrototypeRouteCollection(value: unknown, maximumFeatures = 100): PrototypeRouteSummary[] {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features) || value.features.length > maximumFeatures) return [];
  const result: PrototypeRouteSummary[] = [];
  const seen = new Set<string>();

  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    const id = boundedText(feature.properties.id, 120);
    const from = boundedText(feature.properties.from, 120);
    const to = boundedText(feature.properties.to, 120);
    const warning = boundedText(feature.properties.warning, 240);
    const source = boundedText(feature.properties.source, 120);
    const distanceMeters = feature.properties.distance_m;
    if (
      !id
      || seen.has(id)
      || !from
      || !to
      || !warning
      || !source
      || feature.properties.status !== "UNVERIFIED_OSM_PROTOTYPE"
      || typeof distanceMeters !== "number"
      || !Number.isFinite(distanceMeters)
      || distanceMeters <= 0
      || distanceMeters > 200_000
    ) continue;
    seen.add(id);
    result.push({ id, from, to, distanceMeters, warning, source, status: "UNVERIFIED_OSM_PROTOTYPE" });
  }
  return result;
}

function normalizedQuery(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").slice(0, 80);
}

export function searchMapCatalog(
  query: string,
  spots: SearchableScenicSpot[],
  pois: MapPoi[],
  maximumResults = 20,
): MapSearchResult[] {
  const term = normalizedQuery(query);
  if (!term || maximumResults < 1) return [];
  const results: MapSearchResult[] = [];

  for (const spot of spots) {
    if (`${spot.name} ${spot.subtitle}`.toLocaleLowerCase("zh-CN").includes(term)) {
      results.push({
        id: spot.id,
        kind: "SCENIC_SPOT",
        name: spot.name,
        detail: spot.subtitle,
        coordinates: [spot.longitude, spot.latitude],
        verification: `${spot.verification} · 未经现场核验`,
      });
    }
  }

  for (const poi of pois) {
    if (`${poi.name} ${poi.category} ${poi.subtype}`.toLocaleLowerCase("zh-CN").includes(term)) {
      results.push({
        id: poi.id,
        kind: "OSM_POI",
        name: poi.name,
        detail: `${poi.category} · ${poi.subtype}`,
        coordinates: poi.coordinates,
        verification: "OSM 公开数据候选 · 未现场核验",
      });
    }
    if (results.length >= maximumResults) break;
  }

  return results.slice(0, maximumResults);
}

export function formatMapDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return "距离未知";
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} 米`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters >= 10_000 ? 1 : 2)} 公里`;
}

export function isMapThemeId(value: string): value is MapThemeId {
  return MAP_THEME_IDS.includes(value as MapThemeId);
}
