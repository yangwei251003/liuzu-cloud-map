const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const MAX_PACK_BYTES = 1024 * 1024 * 1024;
const MAX_PACK_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

export const FORMAL_OFFLINE_REQUIRED_ASSET_ROLES = [
  "ROUTE_NETWORK",
  "OPERATIONAL_STATE",
  "POI_CATALOG",
  "MAP_STYLE",
  "VECTOR_TILES",
] as const;

export type FormalOfflineAssetRole = typeof FORMAL_OFFLINE_REQUIRED_ASSET_ROLES[number]
  | "ICON_SPRITE"
  | "FONT_GLYPHS";

export type FormalOfflinePackAsset = {
  role: FormalOfflineAssetRole;
  path: string;
  contentType: string;
  bytes: number;
  sha256: string;
  cachePolicy: "IMMUTABLE";
};

export type FormalOfflinePackManifest = {
  schemaVersion: 1;
  packId: string;
  scenicAreaId: string;
  packRevision: number;
  snapshotRevision: number;
  snapshotPublishedAt: string;
  networkRevision: string;
  operationalVersion: number;
  coordinateSystem: "WGS84";
  generatedAt: string;
  expiresAt: string;
  bounds: [number, number, number, number];
  rights: {
    status: "CLEARED";
    evidenceReference: string;
  };
  assets: FormalOfflinePackAsset[];
  signature: {
    algorithm: "ECDSA_P256_SHA256";
    keyId: string;
    value: string;
  };
};

export type FormalOfflinePackVerification =
  | { ok: true; manifest: FormalOfflinePackManifest; totalBytes: number }
  | {
    ok: false;
    code: "MANIFEST_INVALID" | "MANIFEST_NOT_CURRENT" | "KEY_MISMATCH" | "SIGNATURE_INVALID" | "CRYPTO_UNAVAILABLE";
    message: string;
  };

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isId(value: unknown, max = 120): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && ID_PATTERN.test(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function isHttpsEvidence(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isBounds(value: unknown): value is [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return false;
  const [west, south, east, north] = value as number[];
  return west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;
}

const ASSET_ROLES = new Set<FormalOfflineAssetRole>([
  ...FORMAL_OFFLINE_REQUIRED_ASSET_ROLES,
  "ICON_SPRITE",
  "FONT_GLYPHS",
]);

const CONTENT_TYPES = new Set([
  "application/json",
  "application/geo+json",
  "application/vnd.pmtiles",
  "image/png",
  "image/svg+xml",
  "application/x-protobuf",
]);

function parseAsset(value: unknown, pathPrefix: string): FormalOfflinePackAsset | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["role", "path", "contentType", "bytes", "sha256", "cachePolicy"])
    || typeof value.role !== "string"
    || !ASSET_ROLES.has(value.role as FormalOfflineAssetRole)
    || typeof value.path !== "string"
    || !value.path.startsWith(pathPrefix)
    || value.path.includes("..")
    || value.path.includes("?")
    || value.path.includes("#")
    || !/^\/[A-Za-z0-9._/-]+$/.test(value.path)
    || value.path.startsWith("/data/gis/")
    || value.path.startsWith("/api/")
    || typeof value.contentType !== "string"
    || !CONTENT_TYPES.has(value.contentType)
    || !isPositiveInteger(value.bytes)
    || value.bytes > MAX_ASSET_BYTES
    || typeof value.sha256 !== "string"
    || !SHA256_PATTERN.test(value.sha256)
    || value.cachePolicy !== "IMMUTABLE"
  ) return null;
  return {
    role: value.role as FormalOfflineAssetRole,
    path: value.path,
    contentType: value.contentType,
    bytes: value.bytes,
    sha256: value.sha256,
    cachePolicy: "IMMUTABLE",
  };
}

export function parseFormalOfflinePackManifest(value: unknown): FormalOfflinePackManifest | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "schemaVersion",
      "packId",
      "scenicAreaId",
      "packRevision",
      "snapshotRevision",
      "snapshotPublishedAt",
      "networkRevision",
      "operationalVersion",
      "coordinateSystem",
      "generatedAt",
      "expiresAt",
      "bounds",
      "rights",
      "assets",
      "signature",
    ])
    || value.schemaVersion !== 1
    || !isId(value.packId)
    || !isId(value.scenicAreaId)
    || !isPositiveInteger(value.packRevision)
    || !isPositiveInteger(value.snapshotRevision)
    || !isIsoInstant(value.snapshotPublishedAt)
    || !isRevision(value.networkRevision)
    || !isPositiveInteger(value.operationalVersion)
    || value.coordinateSystem !== "WGS84"
    || !isIsoInstant(value.generatedAt)
    || !isIsoInstant(value.expiresAt)
    || !isBounds(value.bounds)
    || !isRecord(value.rights)
    || !exactKeys(value.rights, ["status", "evidenceReference"])
    || value.rights.status !== "CLEARED"
    || !isHttpsEvidence(value.rights.evidenceReference)
    || !Array.isArray(value.assets)
    || value.assets.length < FORMAL_OFFLINE_REQUIRED_ASSET_ROLES.length
    || value.assets.length > 64
    || !isRecord(value.signature)
    || !exactKeys(value.signature, ["algorithm", "keyId", "value"])
    || value.signature.algorithm !== "ECDSA_P256_SHA256"
    || !isId(value.signature.keyId)
    || typeof value.signature.value !== "string"
    || value.signature.value.length < 40
    || value.signature.value.length > 200
    || !BASE64URL_PATTERN.test(value.signature.value)
  ) return null;

  const prefix = `/offline-packs/${value.scenicAreaId}/${value.packId}/`;
  const assets = value.assets.map((asset) => parseAsset(asset, prefix));
  if (assets.some((asset) => asset === null)) return null;
  const safeAssets = assets as FormalOfflinePackAsset[];
  if (new Set(safeAssets.map((asset) => asset.path)).size !== safeAssets.length) return null;
  const roles = new Set(safeAssets.map((asset) => asset.role));
  if (!FORMAL_OFFLINE_REQUIRED_ASSET_ROLES.every((role) => roles.has(role))) return null;
  if (!FORMAL_OFFLINE_REQUIRED_ASSET_ROLES.every(
    (role) => safeAssets.filter((asset) => asset.role === role).length === 1,
  )) return null;
  const totalBytes = safeAssets.reduce((sum, asset) => sum + asset.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_PACK_BYTES) return null;

  return {
    schemaVersion: 1,
    packId: value.packId,
    scenicAreaId: value.scenicAreaId,
    packRevision: value.packRevision,
    snapshotRevision: value.snapshotRevision,
    snapshotPublishedAt: value.snapshotPublishedAt,
    networkRevision: value.networkRevision,
    operationalVersion: value.operationalVersion,
    coordinateSystem: "WGS84",
    generatedAt: value.generatedAt,
    expiresAt: value.expiresAt,
    bounds: [...value.bounds],
    rights: { status: "CLEARED", evidenceReference: value.rights.evidenceReference },
    assets: safeAssets.map((asset) => ({ ...asset })),
    signature: {
      algorithm: "ECDSA_P256_SHA256",
      keyId: value.signature.keyId,
      value: value.signature.value,
    },
  };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw new Error("non_canonical_value");
}

export function canonicalFormalOfflinePackPayload(manifest: FormalOfflinePackManifest): string {
  return canonicalize({
    ...manifest,
    signature: {
      algorithm: manifest.signature.algorithm,
      keyId: manifest.signature.keyId,
    },
  });
}

/** Stable representation used by the publication control-plane SHA-256 record. */
export function canonicalFormalOfflinePackManifest(manifest: FormalOfflinePackManifest): string {
  return canonicalize(manifest);
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isolatedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function verifyFormalOfflinePackManifest(
  value: unknown,
  options: { publicKey: JsonWebKey; expectedKeyId: string; now?: Date },
): Promise<FormalOfflinePackVerification> {
  const manifest = parseFormalOfflinePackManifest(value);
  if (!manifest) return { ok: false, code: "MANIFEST_INVALID", message: "离线包清单结构无效，已拒绝使用。" };
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const generatedAtMs = new Date(manifest.generatedAt).getTime();
  const snapshotPublishedAtMs = new Date(manifest.snapshotPublishedAt).getTime();
  const expiresAtMs = new Date(manifest.expiresAt).getTime();
  if (
    !Number.isFinite(nowMs)
    || snapshotPublishedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS
    || snapshotPublishedAtMs > generatedAtMs + FUTURE_CLOCK_SKEW_MS
    || generatedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS
    || expiresAtMs <= nowMs
    || expiresAtMs <= generatedAtMs
    || expiresAtMs - generatedAtMs > MAX_PACK_LIFETIME_MS
  ) {
    return { ok: false, code: "MANIFEST_NOT_CURRENT", message: "离线包清单未生效、已过期或有效期过长，已拒绝使用。" };
  }
  if (manifest.signature.keyId !== options.expectedKeyId) {
    return { ok: false, code: "KEY_MISMATCH", message: "离线包签名密钥与受信配置不一致，已拒绝使用。" };
  }
  if (!globalThis.crypto?.subtle) {
    return { ok: false, code: "CRYPTO_UNAVAILABLE", message: "当前环境无法校验离线包签名，已拒绝使用。" };
  }
  const signature = decodeBase64Url(manifest.signature.value);
  if (!signature) return { ok: false, code: "SIGNATURE_INVALID", message: "离线包签名编码无效，已拒绝使用。" };
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "jwk",
      options.publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const payload = new TextEncoder().encode(canonicalFormalOfflinePackPayload(manifest));
    const verified = await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      isolatedArrayBuffer(signature),
      payload,
    );
    if (!verified) return { ok: false, code: "SIGNATURE_INVALID", message: "离线包签名校验失败，已拒绝使用。" };
  } catch {
    return { ok: false, code: "SIGNATURE_INVALID", message: "离线包签名无法验证，已拒绝使用。" };
  }
  return {
    ok: true,
    manifest,
    totalBytes: manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
  };
}

export async function verifyFormalOfflineAssetBytes(
  asset: FormalOfflinePackAsset,
  bytes: Uint8Array,
): Promise<boolean> {
  if (!globalThis.crypto?.subtle || bytes.byteLength !== asset.bytes) return false;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", isolatedArrayBuffer(bytes)));
  const actual = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  return actual === asset.sha256;
}
