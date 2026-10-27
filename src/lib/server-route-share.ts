import type { SavedRoute } from "./journey-store";
import { scenicSpots } from "./scenic-data";

export const SERVER_ROUTE_SHARE_STORAGE_KEY = "liuzu-cloud-tour:server-route-shares:v2";
export const SERVER_ROUTE_SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const LEGACY_SERVER_ROUTE_SHARE_STORAGE_KEY = "liuzu-cloud-tour:server-route-shares:v1";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 40;

type UnknownRecord = Record<string, unknown>;

export type ServerRouteShareStop = {
  id: string;
  name: string;
  verification: string;
};

export type CreateServerRouteShareInput = {
  scenicAreaId: "liuzu-town";
  title: string;
  duration: string;
  pace: string;
  stops: ServerRouteShareStop[];
};

export type CreatedServerRouteShare = {
  shareId: string;
  shareToken: string;
  createdAt: string;
  expiresAt: string;
};

export type ReadServerRouteShare = {
  shareId: string;
  scenicAreaId: "liuzu-town";
  route: {
    version: 1;
    title: string;
    duration: string;
    pace: string;
    stops: ServerRouteShareStop[];
  };
  createdAt: string;
  expiresAt: string;
};

export type ServerRouteShareRecord = {
  shareId: string;
  routeId: string;
  routeTitle: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type ServerRouteShareRegistry = {
  version: 2;
  records: ServerRouteShareRecord[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

function cleanText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validLifetime(createdAt: string, expiresAt: string) {
  return new Date(expiresAt).getTime() - new Date(createdAt).getTime() === SERVER_ROUTE_SHARE_LIFETIME_MS;
}

function parseStop(value: unknown): ServerRouteShareStop | null {
  if (!isRecord(value) || !exactKeys(value, ["id", "name", "verification"])) return null;
  if (!cleanText(value.id, 120) || !cleanText(value.name, 120) || !cleanText(value.verification, 80)) return null;
  const known = scenicSpots.find((spot) => spot.id === value.id);
  if (!known || known.name !== value.name || known.verification !== value.verification) return null;
  return { id: known.id, name: known.name, verification: known.verification };
}

function parseStops(value: unknown): ServerRouteShareStop[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const stops = value.map(parseStop);
  if (stops.some((stop) => stop === null)) return null;
  const parsed = stops as ServerRouteShareStop[];
  return new Set(parsed.map((stop) => stop.id)).size === parsed.length ? parsed : null;
}

export function createServerRouteShareInput(route: SavedRoute): CreateServerRouteShareInput {
  const stops = route.stops.map((stop) => {
    const known = scenicSpots.find((spot) => spot.id === stop.id);
    if (!known || known.name !== stop.name) throw new Error("unknown_server_share_stop");
    return { id: known.id, name: known.name, verification: known.verification };
  });
  const input = {
    scenicAreaId: "liuzu-town" as const,
    title: route.title.trim(),
    duration: route.duration.trim(),
    pace: route.pace.trim(),
    stops,
  };
  if (!cleanText(input.title, 100) || !cleanText(input.duration, 80) || !cleanText(input.pace, 80) || stops.length < 1 || stops.length > 20) {
    throw new Error("invalid_server_share_route");
  }
  return input;
}

export function parseCreatedServerRouteShare(value: unknown): CreatedServerRouteShare | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["createdAt", "expiresAt", "mode", "schemaVersion", "shareId", "shareToken", "warning"]) ||
    value.schemaVersion !== 2 ||
    value.mode !== "AUTHENTICATED_SERVER" ||
    typeof value.shareId !== "string" ||
    !SHARE_ID_PATTERN.test(value.shareId) ||
    typeof value.shareToken !== "string" ||
    !TOKEN_PATTERN.test(value.shareToken) ||
    !isoDate(value.createdAt) ||
    !isoDate(value.expiresAt) ||
    !validLifetime(value.createdAt, value.expiresAt) ||
    typeof value.warning !== "string"
  ) {
    return null;
  }
  return {
    shareId: value.shareId,
    shareToken: value.shareToken,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

export function parseReadServerRouteShare(value: unknown): ReadServerRouteShare | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["createdAt", "expiresAt", "route", "scenicAreaId", "schemaVersion", "shareId", "state"]) ||
    value.schemaVersion !== 1 ||
    value.state !== "ACTIVE" ||
    value.scenicAreaId !== "liuzu-town" ||
    typeof value.shareId !== "string" ||
    !SHARE_ID_PATTERN.test(value.shareId) ||
    !isoDate(value.createdAt) ||
    !isoDate(value.expiresAt) ||
    !validLifetime(value.createdAt, value.expiresAt) ||
    !isRecord(value.route) ||
    !exactKeys(value.route, ["duration", "pace", "stops", "title", "version"]) ||
    value.route.version !== 1 ||
    !cleanText(value.route.title, 100) ||
    !cleanText(value.route.duration, 80) ||
    !cleanText(value.route.pace, 80)
  ) {
    return null;
  }
  const stops = parseStops(value.route.stops);
  if (!stops) return null;
  return {
    shareId: value.shareId,
    scenicAreaId: "liuzu-town",
    route: {
      version: 1,
      title: value.route.title,
      duration: value.route.duration,
      pace: value.route.pace,
      stops,
    },
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

export function buildServerRouteShareUrl(shareToken: string, origin: string) {
  if (!TOKEN_PATTERN.test(shareToken)) throw new Error("invalid_server_share_token");
  const url = new URL("/share", origin);
  url.hash = shareToken;
  return url.toString();
}

export function isServerRouteShareToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function createEmptyServerRouteShareRegistry(): ServerRouteShareRegistry {
  return { version: 2, records: [] };
}

function parseServerRouteShareRecord(value: unknown): ServerRouteShareRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["createdAt", "expiresAt", "revokedAt", "routeId", "routeTitle", "shareId"]) ||
    typeof value.shareId !== "string" ||
    !SHARE_ID_PATTERN.test(value.shareId) ||
    !cleanText(value.routeId, 160) ||
    !cleanText(value.routeTitle, 100) ||
    !isoDate(value.createdAt) ||
    !isoDate(value.expiresAt) ||
    !validLifetime(value.createdAt, value.expiresAt) ||
    !(value.revokedAt === null || isoDate(value.revokedAt))
  ) {
    return null;
  }
  if (value.revokedAt && new Date(value.revokedAt).getTime() < new Date(value.createdAt).getTime()) return null;
  return {
    shareId: value.shareId,
    routeId: value.routeId,
    routeTitle: value.routeTitle,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    revokedAt: value.revokedAt,
  };
}

export function parseServerRouteShareRegistry(value: unknown): ServerRouteShareRegistry | null {
  if (!isRecord(value) || !exactKeys(value, ["records", "version"]) || value.version !== 2 || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) {
    return null;
  }
  const records = value.records.map(parseServerRouteShareRecord);
  if (records.some((record) => record === null)) return null;
  const parsed = records as ServerRouteShareRecord[];
  if (new Set(parsed.map((record) => record.shareId)).size !== parsed.length) return null;
  return { version: 2, records: parsed };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearLegacyServerRouteShareTokens() {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_SERVER_ROUTE_SHARE_STORAGE_KEY);
  } catch {
    // A browser that disallows storage cannot be used to retain a legacy token.
  }
}

export function readServerRouteShareRegistry() {
  clearLegacyServerRouteShareTokens();
  const storage = browserStorage();
  if (!storage) return { registry: createEmptyServerRouteShareRegistry(), error: typeof window === "undefined" ? null : "当前浏览器无法读取跨设备分享索引。" };
  try {
    const raw = storage.getItem(SERVER_ROUTE_SHARE_STORAGE_KEY);
    if (!raw) return { registry: createEmptyServerRouteShareRegistry(), error: null };
    const registry = parseServerRouteShareRegistry(JSON.parse(raw) as unknown);
    return registry
      ? { registry, error: null }
      : { registry: createEmptyServerRouteShareRegistry(), error: "跨设备分享索引格式异常，已停止修改。" };
  } catch {
    return { registry: createEmptyServerRouteShareRegistry(), error: "读取跨设备分享索引失败。" };
  }
}

export function writeServerRouteShareRegistry(registry: ServerRouteShareRegistry) {
  const parsed = parseServerRouteShareRegistry(registry);
  if (!parsed) return { ok: false as const, error: "跨设备分享索引未通过安全校验。" };
  clearLegacyServerRouteShareTokens();
  const storage = browserStorage();
  if (!storage) return { ok: false as const, error: "当前浏览器不允许保存跨设备分享索引。" };
  try {
    storage.setItem(SERVER_ROUTE_SHARE_STORAGE_KEY, JSON.stringify(parsed));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "跨设备分享已创建，但本机无法保存其管理索引；请保留刚才的链接。" };
  }
}

export function addServerRouteShareRecord(registry: ServerRouteShareRegistry, record: ServerRouteShareRecord) {
  const parsed = parseServerRouteShareRecord(record);
  if (!parsed) throw new Error("invalid_server_share_record");
  const next = parseServerRouteShareRegistry({
    version: 2,
    records: [parsed, ...registry.records.filter((item) => item.shareId !== parsed.shareId)].slice(0, MAX_RECORDS),
  });
  if (!next) throw new Error("invalid_server_share_registry");
  return next;
}

export function markServerRouteShareRevoked(
  registry: ServerRouteShareRegistry,
  shareId: string,
  revokedAt = new Date(),
) {
  if (!SHARE_ID_PATTERN.test(shareId) || Number.isNaN(revokedAt.getTime())) throw new Error("invalid_server_share_revocation");
  const target = registry.records.find((record) => record.shareId === shareId);
  if (!target) throw new Error("server_share_not_found");
  const next = parseServerRouteShareRegistry({
    version: 2,
    records: registry.records.map((record) =>
      record.shareId === shareId ? { ...record, revokedAt: revokedAt.toISOString() } : record,
    ),
  });
  if (!next) throw new Error("invalid_server_share_registry");
  return next;
}

export function getServerRouteShareStatus(record: ServerRouteShareRecord, now = new Date()): "active" | "expired" | "revoked" {
  if (record.revokedAt) return "revoked";
  return now.getTime() >= new Date(record.expiresAt).getTime() ? "expired" : "active";
}
