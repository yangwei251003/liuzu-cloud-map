import "server-only";

const AMAP_PLACE_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
const AMAP_PLACE_AROUND_URL = "https://restapi.amap.com/v5/place/around";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 80;
const MAX_RESULT_COUNT = 6;
const MAX_NEARBY_CENTER_COUNT = 4;
const NEARBY_RADIUS_METERS = 1_200;
const NEARBY_TYPES = "080000|110000|140000";

export const AMAP_PUBLIC_POI_SOURCE_URL = "https://lbs.amap.com/api/webservice/guide/api/newpoisearch";
export const AMAP_URI_NAVIGATION_SOURCE_URL = "https://lbs.amap.com/api/uri-api/guide/travel/route";

export type AmapPublicPoi = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  category: string | null;
  coordinate: [number, number];
  entranceCoordinate: [number, number] | null;
  exitCoordinate: [number, number] | null;
};

export type AmapPoiLookup = {
  provider: "AMAP_WEB_SERVICE_V5";
  available: boolean;
  query: string;
  region: "云浮市";
  coordinateSystem: "GCJ02";
  fetchedAt: string;
  sourceUrl: string;
  message: string;
  pois: AmapPublicPoi[];
};

export type AmapNearbyPoiLookup = Omit<AmapPoiLookup, "query"> & {
  query: "ALONG_ROUTE_PUBLIC_PLACES";
};

type UpstreamRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UpstreamRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maximum = 180) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

function parseCoordinate(value: unknown): [number, number] | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText, ...rest] = value.split(",").map((part) => part.trim());
  if (rest.length || !longitudeText || !latitudeText) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < 73 || longitude > 136 || latitude < 3 || latitude > 54) return null;
  return [longitude, latitude];
}

function isValidCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((part) => typeof part === "number" && Number.isFinite(part))
    && value[0] >= 73
    && value[0] <= 136
    && value[1] >= 3
    && value[1] <= 54;
}

function parsePoi(value: unknown): AmapPublicPoi | null {
  if (!isRecord(value)) return null;
  const id = safeText(value.id, 120);
  const name = safeText(value.name, 120);
  const coordinate = parseCoordinate(value.location);
  if (!id || !name || !coordinate) return null;
  const navi = isRecord(value.navi) ? value.navi : null;
  return {
    id,
    name,
    address: safeText(value.address),
    district: safeText(value.adname, 80),
    category: safeText(value.type, 140),
    coordinate,
    entranceCoordinate: navi ? parseCoordinate(navi.entr_location) : null,
    exitCoordinate: navi ? parseCoordinate(navi.exit_location) : null,
  };
}

function readServiceKey() {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,128}$/.test(key) ? key : null;
}

function unavailable(query: string, message: string): AmapPoiLookup {
  return {
    provider: "AMAP_WEB_SERVICE_V5",
    available: false,
    query,
    region: "云浮市",
    coordinateSystem: "GCJ02",
    fetchedAt: new Date().toISOString(),
    sourceUrl: AMAP_PUBLIC_POI_SOURCE_URL,
    message,
    pois: [],
  };
}

export function normalizeAmapPoiQuery(value: string | null | undefined) {
  const text = value?.trim().replace(/\s+/g, " ") ?? "";
  if (text.length < 2 || text.length > MAX_QUERY_LENGTH) return null;
  return text;
}

export function normalizeAmapNearbyCenters(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_NEARBY_CENTER_COUNT) return null;
  const unique = new Map<string, [number, number]>();
  for (const coordinate of value) {
    if (!isValidCoordinate(coordinate)) return null;
    const normalized: [number, number] = [
      Number(coordinate[0].toFixed(6)),
      Number(coordinate[1].toFixed(6)),
    ];
    unique.set(normalized.join(","), normalized);
  }
  return unique.size ? [...unique.values()] : null;
}

export async function searchAmapPublicPois(rawQuery: string): Promise<AmapPoiLookup> {
  const query = normalizeAmapPoiQuery(rawQuery);
  if (!query) return unavailable(rawQuery, "地点名称不符合查询长度要求。");
  const key = readServiceKey();
  if (!key) return unavailable(query, "高德 Web 服务能力尚未配置；不能把候选坐标当作真实入口。");

  const url = new URL(AMAP_PLACE_SEARCH_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", query);
  url.searchParams.set("region", "云浮市");
  url.searchParams.set("city_limit", "true");
  url.searchParams.set("page_size", String(MAX_RESULT_COUNT));
  url.searchParams.set("page_num", "1");
  url.searchParams.set("show_fields", "navi");

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return unavailable(query, "暂时无法连接高德地点服务，请稍后重试或在高德地图中直接搜索。");
  }
  if (!response.ok) return unavailable(query, "高德地点服务暂时未返回可用结果，请在高德地图中直接搜索。");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return unavailable(query, "高德地点服务返回格式异常，已停止使用本次结果。");
  }
  if (!isRecord(payload) || (payload.status !== "1" && payload.status !== 1)) {
    return unavailable(query, "高德地点服务未确认本次查询，已停止使用本次结果。");
  }

  const unique = new Map<string, AmapPublicPoi>();
  if (Array.isArray(payload.pois)) {
    for (const rawPoi of payload.pois) {
      const poi = parsePoi(rawPoi);
      if (poi && !unique.has(poi.id)) unique.set(poi.id, poi);
    }
  }
  const pois = [...unique.values()].slice(0, MAX_RESULT_COUNT);
  return {
    provider: "AMAP_WEB_SERVICE_V5",
    available: true,
    query,
    region: "云浮市",
    coordinateSystem: "GCJ02",
    fetchedAt: new Date().toISOString(),
    sourceUrl: AMAP_PUBLIC_POI_SOURCE_URL,
    message: pois.length ? "已取得高德公开 POI；入口坐标仅在高德本次结果明确返回时展示。" : "高德本次未返回匹配 POI，请修改名称或直接在高德地图搜索。",
    pois,
  };
}

export async function searchAmapNearbyPublicPois(rawCenters: unknown): Promise<AmapNearbyPoiLookup> {
  const centers = normalizeAmapNearbyCenters(rawCenters);
  const query = "ALONG_ROUTE_PUBLIC_PLACES" as const;
  if (!centers) return unavailable(query, "沿途查询坐标不符合要求。") as AmapNearbyPoiLookup;
  const key = readServiceKey();
  if (!key) return unavailable(query, "高德 Web 服务能力尚未配置，沿途公开地点暂不可用。") as AmapNearbyPoiLookup;

  const requests = centers.map(async (center) => {
    const url = new URL(AMAP_PLACE_AROUND_URL);
    url.searchParams.set("key", key);
    url.searchParams.set("location", `${center[0].toFixed(6)},${center[1].toFixed(6)}`);
    url.searchParams.set("radius", String(NEARBY_RADIUS_METERS));
    url.searchParams.set("types", NEARBY_TYPES);
    url.searchParams.set("sortrule", "distance");
    url.searchParams.set("region", "云浮市");
    url.searchParams.set("city_limit", "true");
    url.searchParams.set("page_size", "15");
    url.searchParams.set("page_num", "1");
    url.searchParams.set("show_fields", "navi");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error("AMAP_NEARBY_HTTP_ERROR");
    const payload: unknown = await response.json();
    if (!isRecord(payload) || (payload.status !== "1" && payload.status !== 1)) throw new Error("AMAP_NEARBY_RESPONSE_ERROR");
    return Array.isArray(payload.pois) ? payload.pois : [];
  });

  const settled = await Promise.allSettled(requests);
  const successful = settled.filter((item): item is PromiseFulfilledResult<unknown[]> => item.status === "fulfilled");
  if (!successful.length) return unavailable(query, "暂时无法连接高德周边地点服务，主导航不受影响。") as AmapNearbyPoiLookup;

  const unique = new Map<string, AmapPublicPoi>();
  for (const result of successful) {
    for (const rawPoi of result.value) {
      const poi = parsePoi(rawPoi);
      if (poi && !unique.has(poi.id)) unique.set(poi.id, poi);
    }
  }
  const pois = [...unique.values()].slice(0, 40);
  return {
    provider: "AMAP_WEB_SERVICE_V5",
    available: true,
    query,
    region: "云浮市",
    coordinateSystem: "GCJ02",
    fetchedAt: new Date().toISOString(),
    sourceUrl: AMAP_PUBLIC_POI_SOURCE_URL,
    message: pois.length
      ? "已取得高德路线采样点周边的公开地点；本站会继续按实际路线走廊和前方进度过滤。"
      : "高德本次未返回路线附近的公开景点或文化休闲地点。",
    pois,
  };
}
