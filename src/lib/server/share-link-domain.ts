import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { scenicSpots } from "../scenic-data";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORTED_SCENIC_AREA_ID = "liuzu-town";
const SHARE_STOP_CATALOG = new Map(scenicSpots.map((spot) => [spot.id, { id: spot.id, name: spot.name, verification: spot.verification }]));

export type ServerShareStop = {
  id: string;
  name: string;
  verification: string;
};

export type ServerSharePayload = {
  version: 1;
  title: string;
  duration: string;
  pace: string;
  stops: ServerShareStop[];
};

export type CreateServerShareInput = {
  scenicAreaId: string;
  title: string;
  duration: string;
  pace: string;
  stops: ServerShareStop[];
};

export type ShareLinkRecord = {
  scenicAreaId: string;
  schemaVersion: 1;
  tokenHash: string;
  revokeTokenHash: string;
  createdByAccountId: string | null;
  createdBySubject: string | null;
  payload: ServerSharePayload;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthenticatedShareOwner = {
  accountId: string;
  scenicAreaId: string;
  subject: string;
};

export type AuthenticatedShareLinkRecord = ShareLinkRecord & {
  createdByAccountId: string;
  createdBySubject: string;
};

export type ShareLinkAccessState = "ACTIVE" | "EXPIRED" | "REVOKED" | "INVALID";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

function safeString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function parseStop(value: unknown): ServerShareStop | null {
  if (!isRecord(value) || !exactKeys(value, ["id", "name", "verification"])) return null;
  const { id, name, verification } = value;
  if (!safeString(id, 2, 120) || !safeString(name, 1, 120) || !safeString(verification, 1, 80)) return null;
  const registered = SHARE_STOP_CATALOG.get(id.trim());
  if (!registered || name.trim() !== registered.name || verification.trim() !== registered.verification) return null;
  return { ...registered };
}

export function parseServerSharePayload(value: unknown): ServerSharePayload | null {
  if (!isRecord(value) || !exactKeys(value, ["duration", "pace", "stops", "title", "version"]) || value.version !== 1 || !Array.isArray(value.stops)) {
    return null;
  }
  const { title, duration, pace } = value;
  if (!safeString(title, 1, 100) || !safeString(duration, 1, 80) || !safeString(pace, 1, 80) || value.stops.length < 1 || value.stops.length > 20) {
    return null;
  }
  const stops = value.stops.map(parseStop);
  if (stops.some((stop) => stop === null)) return null;
  const parsedStops = stops as ServerShareStop[];
  if (new Set(parsedStops.map((stop) => stop.id)).size !== parsedStops.length) return null;
  return { version: 1, title: title.trim(), duration: duration.trim(), pace: pace.trim(), stops: parsedStops };
}

export function parseCreateServerShareInput(value: unknown): CreateServerShareInput | null {
  if (!isRecord(value) || !exactKeys(value, ["duration", "pace", "scenicAreaId", "stops", "title"]) || !Array.isArray(value.stops)) return null;
  const { scenicAreaId, title, duration, pace } = value;
  if (
    scenicAreaId !== SUPPORTED_SCENIC_AREA_ID ||
    !safeString(title, 1, 100) ||
    !safeString(duration, 1, 80) ||
    !safeString(pace, 1, 80) ||
    value.stops.length < 1 ||
    value.stops.length > 20
  ) {
    return null;
  }
  const stops = value.stops.map(parseStop);
  if (stops.some((stop) => stop === null)) return null;
  const parsedStops = stops as ServerShareStop[];
  if (new Set(parsedStops.map((stop) => stop.id)).size !== parsedStops.length) return null;
  return {
    scenicAreaId: SUPPORTED_SCENIC_AREA_ID,
    title: title.trim(),
    duration: duration.trim(),
    pace: pace.trim(),
    stops: parsedStops,
  };
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function isShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_ID_PATTERN.test(value);
}

export function verifyShareToken(token: unknown, expectedHash: unknown) {
  if (!isShareToken(token) || typeof expectedHash !== "string" || !HASH_PATTERN.test(expectedHash)) return false;
  const actual = Buffer.from(hashShareToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createShareLinkMaterial(
  input: CreateServerShareInput,
  owner: AuthenticatedShareOwner,
  now = new Date(),
  random = randomBytes,
) {
  const normalized = parseCreateServerShareInput(input);
  if (
    !normalized ||
    Number.isNaN(now.getTime()) ||
    !isShareId(owner.accountId) ||
    owner.scenicAreaId !== normalized.scenicAreaId ||
    owner.subject !== `visitor:${owner.scenicAreaId}:${owner.accountId}`
  ) {
    throw new Error("invalid_share_link_input");
  }
  const publicToken = random(TOKEN_BYTES).toString("base64url");
  const revokeToken = random(TOKEN_BYTES).toString("base64url");
  if (!isShareToken(publicToken) || !isShareToken(revokeToken) || publicToken === revokeToken) throw new Error("invalid_share_token_material");
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString();
  const record: AuthenticatedShareLinkRecord = {
    scenicAreaId: normalized.scenicAreaId,
    schemaVersion: 1,
    tokenHash: hashShareToken(publicToken),
    revokeTokenHash: hashShareToken(revokeToken),
    createdByAccountId: owner.accountId,
    createdBySubject: owner.subject,
    payload: {
      version: 1,
      title: normalized.title,
      duration: normalized.duration,
      pace: normalized.pace,
      stops: normalized.stops,
    },
    createdAt,
    expiresAt,
    revokedAt: null,
  };
  return { publicToken, revokeToken, record };
}

export function evaluateShareLinkRecord(record: ShareLinkRecord, now = new Date()): ShareLinkAccessState {
  const createdAt = new Date(record.createdAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const revokedAt = record.revokedAt === null ? null : new Date(record.revokedAt).getTime();
  if ([now.getTime(), createdAt, expiresAt, ...(revokedAt === null ? [] : [revokedAt])].some(Number.isNaN)) return "INVALID";
  if (expiresAt - createdAt !== SHARE_LIFETIME_MS || now.getTime() < createdAt) return "INVALID";
  if (revokedAt !== null) return revokedAt >= createdAt && revokedAt <= now.getTime() ? "REVOKED" : "INVALID";
  return now.getTime() >= expiresAt ? "EXPIRED" : "ACTIVE";
}
