import { scenicSpots } from "./scenic-data";
import type { SavedRoute } from "./journey-store";

export const ROUTE_SHARE_STORAGE_KEY = "liuzu-cloud-tour:route-shares:v1";
export const ROUTE_SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_SHARE_TOKEN_LENGTH = 5_000;
const MAX_SHARE_RECORDS = 40;
const shareIdPattern = /^share-[A-Za-z0-9_-]{12,80}$/;
const checksumPattern = /^[a-f0-9]{8}$/;

type UnknownRecord = Record<string, unknown>;

export type SharedRouteStop = {
  id: string;
  name: string;
};

export type RouteSharePayload = {
  version: 1;
  shareId: string;
  issuedAt: string;
  expiresAt: string;
  route: {
    title: string;
    duration: string;
    pace: string;
    stops: SharedRouteStop[];
  };
};

export type RouteShareDecodeResult =
  | { status: "valid"; payload: RouteSharePayload }
  | { status: "expired"; payload: RouteSharePayload }
  | { status: "invalid"; reason: string };

export type RouteShareRecord = {
  shareId: string;
  routeId: string;
  routeTitle: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type RouteShareRegistry = {
  version: 1;
  records: RouteShareRecord[];
};

export type RouteShareRegistryReadResult = {
  registry: RouteShareRegistry;
  error: string | null;
};

export type RouteShareRegistryWriteResult =
  | { ok: true }
  | { ok: false; error: string };

export function createEmptyRouteShareRegistry(): RouteShareRegistry {
  return { version: 1, records: [] };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: UnknownRecord, keys: string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isCleanText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function createShareId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `share-${randomId}`;
  const random = Math.random().toString(36).slice(2, 14);
  return `share-${Date.now().toString(36)}${random}`;
}

export function parseRouteSharePayload(value: unknown): RouteSharePayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "shareId", "issuedAt", "expiresAt", "route"])) {
    return null;
  }
  if (value.version !== 1 || typeof value.shareId !== "string" || !shareIdPattern.test(value.shareId)) return null;
  if (!isIsoDate(value.issuedAt) || !isIsoDate(value.expiresAt) || !isRecord(value.route)) return null;
  if (!hasExactKeys(value.route, ["title", "duration", "pace", "stops"])) return null;
  if (
    !isCleanText(value.route.title, 80) ||
    !isCleanText(value.route.duration, 40) ||
    !isCleanText(value.route.pace, 40) ||
    !Array.isArray(value.route.stops) ||
    value.route.stops.length === 0 ||
    value.route.stops.length > 12
  ) {
    return null;
  }

  const issuedAtMs = new Date(value.issuedAt).getTime();
  const expiresAtMs = new Date(value.expiresAt).getTime();
  if (expiresAtMs - issuedAtMs !== ROUTE_SHARE_LIFETIME_MS) return null;

  const seen = new Set<string>();
  const stops: SharedRouteStop[] = [];
  for (const item of value.route.stops) {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "name"])) return null;
    if (!isCleanText(item.id, 80) || !isCleanText(item.name, 80) || seen.has(item.id)) return null;
    const knownSpot = scenicSpots.find((spot) => spot.id === item.id);
    if (!knownSpot || knownSpot.name !== item.name) return null;
    seen.add(item.id);
    stops.push({ id: item.id, name: item.name });
  }

  return {
    version: 1,
    shareId: value.shareId,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    route: {
      title: value.route.title,
      duration: value.route.duration,
      pace: value.route.pace,
      stops,
    },
  };
}

export function createRouteSharePayload(
  route: SavedRoute,
  options: { now?: Date; shareId?: string } = {},
): RouteSharePayload {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid_share_time");
  const shareId = options.shareId ?? createShareId();
  if (!shareIdPattern.test(shareId)) throw new Error("invalid_share_id");

  const stops = route.stops.map((stop) => {
    const knownSpot = scenicSpots.find((spot) => spot.id === stop.id);
    if (!knownSpot || knownSpot.name !== stop.name) throw new Error("unknown_share_stop");
    return { id: knownSpot.id, name: knownSpot.name };
  });

  const payload: RouteSharePayload = {
    version: 1,
    shareId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ROUTE_SHARE_LIFETIME_MS).toISOString(),
    route: {
      title: route.title.trim(),
      duration: route.duration.trim(),
      pace: route.pace.trim(),
      stops,
    },
  };

  const parsed = parseRouteSharePayload(payload);
  if (!parsed) throw new Error("invalid_share_route");
  return parsed;
}

function checksum(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8_192));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid_base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(`${base64}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeRouteShareToken(payload: RouteSharePayload): string {
  const parsed = parseRouteSharePayload(payload);
  if (!parsed) throw new Error("invalid_share_payload");
  const payloadJson = JSON.stringify(parsed);
  return encodeBase64Url(JSON.stringify({ payload: parsed, checksum: checksum(payloadJson) }));
}

export function decodeRouteShareToken(token: string, now: Date = new Date()): RouteShareDecodeResult {
  const normalizedToken = token.startsWith("#") ? token.slice(1) : token;
  if (!normalizedToken || normalizedToken.length > MAX_SHARE_TOKEN_LENGTH || Number.isNaN(now.getTime())) {
    return { status: "invalid", reason: "分享内容为空或超出允许长度。" };
  }

  try {
    const raw = JSON.parse(decodeBase64Url(normalizedToken)) as unknown;
    if (!isRecord(raw) || !hasExactKeys(raw, ["payload", "checksum"]) || !checksumPattern.test(String(raw.checksum))) {
      return { status: "invalid", reason: "分享结构无法识别。" };
    }
    const payload = parseRouteSharePayload(raw.payload);
    if (!payload || checksum(JSON.stringify(payload)) !== raw.checksum) {
      return { status: "invalid", reason: "分享内容已损坏或被改动。" };
    }
    if (now.getTime() >= new Date(payload.expiresAt).getTime()) return { status: "expired", payload };
    return { status: "valid", payload };
  } catch {
    return { status: "invalid", reason: "分享链接无法解析。" };
  }
}

export function buildRouteShareUrl(token: string, origin: string): string {
  if (!token || token.length > MAX_SHARE_TOKEN_LENGTH) throw new Error("invalid_share_token");
  const url = new URL("/share", origin);
  url.hash = token;
  return url.toString();
}

function parseRouteShareRecord(value: unknown): RouteShareRecord | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["shareId", "routeId", "routeTitle", "token", "createdAt", "expiresAt", "revokedAt"])
  ) {
    return null;
  }
  if (
    typeof value.shareId !== "string" ||
    !shareIdPattern.test(value.shareId) ||
    !isCleanText(value.routeId, 160) ||
    !isCleanText(value.routeTitle, 80) ||
    !isCleanText(value.token, MAX_SHARE_TOKEN_LENGTH) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.expiresAt) ||
    !(value.revokedAt === null || isIsoDate(value.revokedAt))
  ) {
    return null;
  }

  const decoded = decodeRouteShareToken(value.token, new Date(value.createdAt));
  if (
    decoded.status !== "valid" ||
    decoded.payload.shareId !== value.shareId ||
    decoded.payload.route.title !== value.routeTitle ||
    decoded.payload.issuedAt !== value.createdAt ||
    decoded.payload.expiresAt !== value.expiresAt
  ) {
    return null;
  }
  if (value.revokedAt !== null && new Date(value.revokedAt).getTime() < new Date(value.createdAt).getTime()) return null;

  return {
    shareId: value.shareId,
    routeId: value.routeId,
    routeTitle: value.routeTitle,
    token: value.token,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    revokedAt: value.revokedAt,
  };
}

export function parseRouteShareRegistry(value: unknown): RouteShareRegistry | null {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "records"]) || value.version !== 1) return null;
  if (!Array.isArray(value.records) || value.records.length > MAX_SHARE_RECORDS) return null;
  const records = value.records.map(parseRouteShareRecord);
  if (records.some((record) => record === null)) return null;
  const typedRecords = records as RouteShareRecord[];
  if (new Set(typedRecords.map((record) => record.shareId)).size !== typedRecords.length) return null;
  return { version: 1, records: typedRecords };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRouteShareRegistry(): RouteShareRegistryReadResult {
  const storage = browserStorage();
  if (!storage) {
    return {
      registry: createEmptyRouteShareRegistry(),
      error: typeof window === "undefined" ? null : "当前浏览器无法读取本机分享记录。",
    };
  }
  try {
    const raw = storage.getItem(ROUTE_SHARE_STORAGE_KEY);
    if (!raw) return { registry: createEmptyRouteShareRegistry(), error: null };
    const registry = parseRouteShareRegistry(JSON.parse(raw) as unknown);
    if (!registry) {
      return { registry: createEmptyRouteShareRegistry(), error: "本机分享记录格式异常，已停止创建或撤销链接。" };
    }
    return { registry, error: null };
  } catch {
    return { registry: createEmptyRouteShareRegistry(), error: "读取本机分享记录失败，请稍后重试。" };
  }
}

export function writeRouteShareRegistry(registry: RouteShareRegistry): RouteShareRegistryWriteResult {
  const parsed = parseRouteShareRegistry(registry);
  if (!parsed) return { ok: false, error: "分享记录未通过安全校验，未写入本机。" };
  const storage = browserStorage();
  if (!storage) return { ok: false, error: "当前浏览器不允许保存分享记录。" };
  try {
    storage.setItem(ROUTE_SHARE_STORAGE_KEY, JSON.stringify(parsed));
    return { ok: true };
  } catch {
    return { ok: false, error: "本机空间不足或保存被浏览器阻止。" };
  }
}

export function addRouteShareRecord(registry: RouteShareRegistry, record: RouteShareRecord): RouteShareRegistry {
  const parsedRecord = parseRouteShareRecord(record);
  if (!parsedRecord) throw new Error("invalid_share_record");
  const records = [parsedRecord, ...registry.records.filter((item) => item.shareId !== parsedRecord.shareId)].slice(
    0,
    MAX_SHARE_RECORDS,
  );
  const next = parseRouteShareRegistry({ version: 1, records });
  if (!next) throw new Error("invalid_share_registry");
  return next;
}

export function revokeRouteShareRecord(
  registry: RouteShareRegistry,
  shareId: string,
  revokedAt: Date = new Date(),
): RouteShareRegistry {
  if (!shareIdPattern.test(shareId) || Number.isNaN(revokedAt.getTime())) throw new Error("invalid_share_revocation");
  const target = registry.records.find((record) => record.shareId === shareId);
  if (!target) throw new Error("share_not_found");
  const iso = revokedAt.toISOString();
  if (revokedAt.getTime() < new Date(target.createdAt).getTime()) throw new Error("invalid_share_revocation_time");
  const next = parseRouteShareRegistry({
    version: 1,
    records: registry.records.map((record) => (record.shareId === shareId ? { ...record, revokedAt: iso } : record)),
  });
  if (!next) throw new Error("invalid_share_registry");
  return next;
}

export function getRouteShareRecordStatus(
  record: RouteShareRecord,
  now: Date = new Date(),
): "active" | "expired" | "revoked" {
  if (record.revokedAt) return "revoked";
  return now.getTime() >= new Date(record.expiresAt).getTime() ? "expired" : "active";
}
