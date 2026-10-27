import {
  parseFormalOfflinePackManifest,
  verifyFormalOfflinePackManifest,
  type FormalOfflineAssetRole,
  type FormalOfflinePackManifest,
} from "./formal-offline-pack";
import type { Feature, FeatureCollection, GeoJsonProperties, Point } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import { sha256ReadableStream } from "./incremental-sha256";
import { getSafePublishedNetwork, parseRouteNetwork } from "./route-network";
import { getSafeRouteOperationalState } from "./route-operational-state";

export const FORMAL_OFFLINE_REGISTRY_CACHE = "liuzu-cloud-tour-offline-pack-registry-v1";
export const FORMAL_OFFLINE_REGISTRY_PATH = "/offline-packs/.active-pack.json";
export const FORMAL_OFFLINE_ASSET_CACHE_PREFIX = "liuzu-cloud-tour-formal-offline-v1-";

const MAX_ENVELOPE_BYTES = 256 * 1024;
const MAX_JSON_ASSET_BYTES = 64 * 1024 * 1024;

export type InstalledFormalOfflinePack = {
  schemaVersion: 1;
  scenicAreaId: string;
  packId: string;
  packRevision: number;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  installedAt: string;
  expiresAt: string;
  cacheName: string;
  manifest: FormalOfflinePackManifest;
  verificationKey: JsonWebKey;
  expectedKeyId: string;
};

export type FormalOfflinePackInstallResult =
  | { ok: true; pack: InstalledFormalOfflinePack; totalBytes: number }
  | { ok: false; code: "UNSUPPORTED" | "PACK_UNAVAILABLE" | "MANIFEST_REJECTED" | "ASSET_REJECTED" | "STORAGE_FAILED"; message: string };

export type InstalledFormalRoutingSnapshot = {
  schemaVersion: 1;
  scenicAreaId: string;
  packId: string;
  packRevision: number;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  publishedAt: string;
  expiresAt: string;
  routeNetwork: unknown;
  operationalState: unknown;
};

export type InstalledFormalOfflineMapBundle = {
  style: StyleSpecification;
  poiCatalog: FeatureCollection<Point>;
  scenicAreaId: string;
  packId: string;
  packRevision: number;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  generatedAt: string;
  expiresAt: string;
  rightsEvidenceReference: string;
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

function onlyKeys(value: UnknownRecord, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function parseVerificationKey(value: unknown): JsonWebKey | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["kty", "crv", "x", "y", "ext", "key_ops"])
    || value.kty !== "EC"
    || value.crv !== "P-256"
    || typeof value.x !== "string"
    || !/^[A-Za-z0-9_-]{43}$/.test(value.x)
    || typeof value.y !== "string"
    || !/^[A-Za-z0-9_-]{43}$/.test(value.y)
    || value.ext !== true
    || !Array.isArray(value.key_ops)
    || value.key_ops.length !== 1
    || value.key_ops[0] !== "verify"
  ) return null;
  return { kty: "EC", crv: "P-256", x: value.x, y: value.y, ext: true, key_ops: ["verify"] };
}

async function boundedJson(response: Response, maximumBytes = MAX_ENVELOPE_BYTES): Promise<unknown | null> {
  if (!response.body) return null;
  const declared = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) return null;
  if (Number.isFinite(declared) && declared > maximumBytes) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel("offline_pack_envelope_too_large");
        return null;
      }
      chunks.push(result.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

async function fetchVerifiedEnvelope(fetcher: typeof fetch, scenicAreaId: string, now: Date, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetcher(`/api/v1/scenic-areas/${encodeURIComponent(scenicAreaId)}/offline-pack`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch {
    return null;
  }
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const value = await boundedJson(response);
  if (
    !isRecord(value)
    || !exactKeys(value, ["requestId", "schemaVersion", "manifest", "verificationKey", "expectedKeyId"])
    || typeof value.requestId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(value.requestId)
    || value.schemaVersion !== 1
    || typeof value.expectedKeyId !== "string"
  ) return null;
  const verificationKey = parseVerificationKey(value.verificationKey);
  if (!verificationKey) return null;
  const verified = await verifyFormalOfflinePackManifest(value.manifest, {
    publicKey: verificationKey,
    expectedKeyId: value.expectedKeyId,
    now,
  });
  return verified.ok ? { verified, verificationKey, expectedKeyId: value.expectedKeyId } : null;
}

function parseInstalledPack(value: unknown): InstalledFormalOfflinePack | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "schemaVersion", "scenicAreaId", "packId", "packRevision", "snapshotRevision", "networkRevision",
      "operationalVersion", "installedAt", "expiresAt", "cacheName", "manifest", "verificationKey", "expectedKeyId",
    ])
    || value.schemaVersion !== 1
    || typeof value.scenicAreaId !== "string"
    || typeof value.packId !== "string"
    || typeof value.packRevision !== "number"
    || typeof value.snapshotRevision !== "number"
    || typeof value.networkRevision !== "string"
    || typeof value.operationalVersion !== "number"
    || !isIsoInstant(value.installedAt)
    || !isIsoInstant(value.expiresAt)
    || typeof value.cacheName !== "string"
    || !value.cacheName.startsWith(FORMAL_OFFLINE_ASSET_CACHE_PREFIX)
    || value.cacheName.length > 240
    || typeof value.expectedKeyId !== "string"
  ) return null;
  const manifest = parseFormalOfflinePackManifest(value.manifest);
  const verificationKey = parseVerificationKey(value.verificationKey);
  if (
    !manifest
    || !verificationKey
    || manifest.scenicAreaId !== value.scenicAreaId
    || manifest.packId !== value.packId
    || manifest.packRevision !== value.packRevision
    || manifest.snapshotRevision !== value.snapshotRevision
    || manifest.networkRevision !== value.networkRevision
    || manifest.operationalVersion !== value.operationalVersion
    || manifest.expiresAt !== value.expiresAt
    || manifest.signature.keyId !== value.expectedKeyId
  ) return null;
  return {
    schemaVersion: 1,
    scenicAreaId: value.scenicAreaId,
    packId: value.packId,
    packRevision: value.packRevision,
    snapshotRevision: value.snapshotRevision,
    networkRevision: value.networkRevision,
    operationalVersion: value.operationalVersion,
    installedAt: value.installedAt,
    expiresAt: value.expiresAt,
    cacheName: value.cacheName,
    manifest,
    verificationKey,
    expectedKeyId: value.expectedKeyId,
  };
}

export async function readInstalledFormalOfflinePack(
  options: { cacheStorage?: CacheStorage; now?: Date } = {},
): Promise<{ state: "AVAILABLE"; pack: InstalledFormalOfflinePack; cache: Cache } | { state: "UNAVAILABLE" }> {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const now = options.now ?? new Date();
  if (!cacheStorage || Number.isNaN(now.getTime())) return { state: "UNAVAILABLE" };
  try {
    const registryCache = await cacheStorage.open(FORMAL_OFFLINE_REGISTRY_CACHE);
    const response = await registryCache.match(FORMAL_OFFLINE_REGISTRY_PATH);
    if (!response) return { state: "UNAVAILABLE" };
    const pack = parseInstalledPack(await boundedJson(response));
    if (!pack || new Date(pack.expiresAt).getTime() <= now.getTime()) return { state: "UNAVAILABLE" };
    const verified = await verifyFormalOfflinePackManifest(pack.manifest, {
      publicKey: pack.verificationKey,
      expectedKeyId: pack.expectedKeyId,
      now,
    });
    if (!verified.ok) return { state: "UNAVAILABLE" };
    const cache = await cacheStorage.open(pack.cacheName);
    for (const asset of pack.manifest.assets) {
      if (!await cache.match(asset.path)) return { state: "UNAVAILABLE" };
    }
    return { state: "AVAILABLE", pack, cache };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

export async function readInstalledFormalOfflineJsonAsset(
  scenicAreaId: string,
  role: FormalOfflineAssetRole,
  options: { cacheStorage?: CacheStorage; now?: Date } = {},
): Promise<{ pack: InstalledFormalOfflinePack; value: unknown } | null> {
  const installed = await readInstalledFormalOfflinePack(options);
  if (installed.state !== "AVAILABLE" || installed.pack.scenicAreaId !== scenicAreaId) return null;
  const value = await readJsonAssetFromInstalled(installed, role);
  return value === null ? null : { pack: installed.pack, value };
}

async function readJsonAssetFromInstalled(
  installed: Extract<Awaited<ReturnType<typeof readInstalledFormalOfflinePack>>, { state: "AVAILABLE" }>,
  role: FormalOfflineAssetRole,
) {
  const assets = installed.pack.manifest.assets.filter((asset) => asset.role === role);
  if (assets.length !== 1 || !assets[0].contentType.includes("json")) return null;
  const asset = assets[0];
  const response = await installed.cache.match(asset.path);
  if (!response?.body) return null;
  const [hashStream, jsonStream] = response.body.tee();
  const integrity = sha256ReadableStream(hashStream, asset.bytes);
  const jsonResponse = new Response(jsonStream, { headers: response.headers });
  const value = await boundedJson(jsonResponse, Math.min(asset.bytes, MAX_JSON_ASSET_BYTES));
  const checked = await integrity.catch(() => null);
  if (!checked || checked.bytes !== asset.bytes || checked.sha256 !== asset.sha256 || value === null) return null;
  return value;
}

const STYLE_ROOT_KEYS = new Set(["version", "name", "metadata", "center", "zoom", "bearing", "pitch", "sources", "layers"]);
const VECTOR_SOURCE_KEYS = new Set(["type", "url", "minzoom", "maxzoom", "bounds"]);
const LAYER_KEYS = new Set(["id", "type", "metadata", "source", "source-layer", "minzoom", "maxzoom", "filter", "layout", "paint"]);
const SAFE_LAYER_TYPES = new Set(["background", "fill", "line", "circle"]);
const isIntegerZoom = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 24;
const isZoom = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 24;

function containsNetworkValue(value: unknown): boolean {
  if (typeof value === "string") return /^(?:https?:|data:|blob:|pmtiles:|\/)/i.test(value.trim());
  if (Array.isArray(value)) return value.some(containsNetworkValue);
  if (isRecord(value)) return Object.values(value).some(containsNetworkValue);
  return false;
}

function safeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Reduces a signed publisher style to a network-closed MapLibre subset. Every
 * vector source is rewritten to the one verified PMTiles asset in this pack;
 * sprites, glyphs, imports, raster sources and external URLs cannot survive.
 */
export function createSafeFormalOfflineMapStyle(
  value: unknown,
  vectorTilesPath: string,
  origin: string,
): StyleSpecification | null {
  const trustedOrigin = safeOrigin(origin);
  if (
    !trustedOrigin
    || !isRecord(value)
    || !onlyKeys(value, STYLE_ROOT_KEYS)
    || value.version !== 8
    || !isRecord(value.sources)
    || Object.keys(value.sources).length < 1
    || Object.keys(value.sources).length > 16
    || !Array.isArray(value.layers)
    || value.layers.length < 1
    || value.layers.length > 500
    || !/^\/offline-packs\/[A-Za-z0-9._/-]+\.pmtiles$/.test(vectorTilesPath)
    || vectorTilesPath.includes("..")
  ) return null;

  const sourceNames = new Set<string>();
  const sources: Record<string, { type: "vector"; url: string; minzoom?: number; maxzoom?: number; bounds?: [number, number, number, number] }> = {};
  const acceptedUrls = new Set([
    vectorTilesPath,
    `pmtiles://${vectorTilesPath}`,
    `${trustedOrigin}${vectorTilesPath}`,
    `pmtiles://${trustedOrigin}${vectorTilesPath}`,
  ]);
  for (const [name, rawSource] of Object.entries(value.sources)) {
    if (
      !/^[A-Za-z0-9._-]{1,100}$/.test(name)
      || name.startsWith("formal-")
      || !isRecord(rawSource)
      || !onlyKeys(rawSource, VECTOR_SOURCE_KEYS)
      || rawSource.type !== "vector"
      || typeof rawSource.url !== "string"
      || !acceptedUrls.has(rawSource.url)
      || (rawSource.minzoom !== undefined && !isIntegerZoom(rawSource.minzoom))
      || (rawSource.maxzoom !== undefined && !isIntegerZoom(rawSource.maxzoom))
      || (typeof rawSource.minzoom === "number" && typeof rawSource.maxzoom === "number" && rawSource.minzoom > rawSource.maxzoom)
      || (rawSource.bounds !== undefined && (
        !Array.isArray(rawSource.bounds)
        || rawSource.bounds.length !== 4
        || !rawSource.bounds.every(Number.isFinite)
        || rawSource.bounds[0] < -180
        || rawSource.bounds[2] > 180
        || rawSource.bounds[1] < -90
        || rawSource.bounds[3] > 90
        || rawSource.bounds[0] > rawSource.bounds[2]
        || rawSource.bounds[1] > rawSource.bounds[3]
      ))
    ) return null;
    sourceNames.add(name);
    sources[name] = {
      type: "vector",
      url: `pmtiles://${trustedOrigin}${vectorTilesPath}`,
      ...(typeof rawSource.minzoom === "number" ? { minzoom: rawSource.minzoom } : {}),
      ...(typeof rawSource.maxzoom === "number" ? { maxzoom: rawSource.maxzoom } : {}),
      ...(Array.isArray(rawSource.bounds) ? { bounds: [...rawSource.bounds] as [number, number, number, number] } : {}),
    };
  }

  const layers: StyleSpecification["layers"] = [];
  const layerIds = new Set<string>();
  let sourcedLayerCount = 0;
  for (const rawLayer of value.layers) {
    if (!isRecord(rawLayer) || !onlyKeys(rawLayer, LAYER_KEYS)) return null;
    if (typeof rawLayer.type !== "string" || !SAFE_LAYER_TYPES.has(rawLayer.type)) continue;
    if (
      typeof rawLayer.id !== "string"
      || !/^[A-Za-z0-9._-]{1,120}$/.test(rawLayer.id)
      || rawLayer.id.startsWith("formal-")
      || layerIds.has(rawLayer.id)
      || containsNetworkValue(rawLayer.metadata)
      || containsNetworkValue(rawLayer.filter)
      || containsNetworkValue(rawLayer.layout)
      || containsNetworkValue(rawLayer.paint)
    ) return null;
    if (rawLayer.type === "background") {
      if (rawLayer.source !== undefined || rawLayer["source-layer"] !== undefined) return null;
    } else {
      if (
        typeof rawLayer.source !== "string"
        || !sourceNames.has(rawLayer.source)
        || typeof rawLayer["source-layer"] !== "string"
        || !rawLayer["source-layer"].trim()
        || rawLayer["source-layer"].length > 160
      ) return null;
      sourcedLayerCount += 1;
    }
    if (
      (rawLayer.minzoom !== undefined && !isZoom(rawLayer.minzoom))
      || (rawLayer.maxzoom !== undefined && !isZoom(rawLayer.maxzoom))
    ) return null;
    layerIds.add(rawLayer.id);
    layers.push(structuredClone(rawLayer) as StyleSpecification["layers"][number]);
  }
  if (layers.length < 1 || sourcedLayerCount < 1) return null;
  return { version: 8, sources, layers };
}

export function parseFormalOfflinePoiCatalog(value: unknown): FeatureCollection<Point> | null {
  if (!isRecord(value) || !exactKeys(value, ["type", "features"]) || value.type !== "FeatureCollection" || !Array.isArray(value.features) || value.features.length > 50_000) return null;
  const features: Array<Feature<Point, GeoJsonProperties>> = [];
  for (const rawFeature of value.features) {
    if (!isRecord(rawFeature) || !onlyKeys(rawFeature, new Set(["type", "id", "properties", "geometry"])) || rawFeature.type !== "Feature" || !isRecord(rawFeature.geometry)) return null;
    if (!exactKeys(rawFeature.geometry, ["type", "coordinates"]) || rawFeature.geometry.type !== "Point" || !Array.isArray(rawFeature.geometry.coordinates) || rawFeature.geometry.coordinates.length !== 2) return null;
    const [longitude, latitude] = rawFeature.geometry.coordinates;
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
    if (
      rawFeature.id !== undefined
      && !(
        (typeof rawFeature.id === "string" && rawFeature.id.length > 0 && rawFeature.id.length <= 200)
        || (typeof rawFeature.id === "number" && Number.isSafeInteger(rawFeature.id))
      )
    ) return null;
    if (!isRecord(rawFeature.properties) || Object.keys(rawFeature.properties).length > 64) return null;
    const properties: GeoJsonProperties = {};
    for (const [key, property] of Object.entries(rawFeature.properties)) {
      if (
        !/^[A-Za-z0-9._-]{1,100}$/.test(key)
        || (!["string", "number", "boolean"].includes(typeof property) && property !== null)
        || (typeof property === "number" && !Number.isFinite(property))
        || (typeof property === "string" && property.length > 500)
      ) return null;
      properties[key] = property as string | number | boolean | null;
    }
    features.push({
      type: "Feature",
      ...(rawFeature.id !== undefined ? { id: rawFeature.id } : {}),
      properties,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    });
  }
  return { type: "FeatureCollection", features };
}

export async function readInstalledFormalOfflineMapBundle(
  scenicAreaId: string,
  options: { cacheStorage?: CacheStorage; now?: Date; origin?: string } = {},
): Promise<InstalledFormalOfflineMapBundle | null> {
  const installed = await readInstalledFormalOfflinePack(options);
  if (installed.state !== "AVAILABLE" || installed.pack.scenicAreaId !== scenicAreaId) return null;
  const vectorAssets = installed.pack.manifest.assets.filter((asset) => asset.role === "VECTOR_TILES");
  if (vectorAssets.length !== 1) return null;
  const [rawStyle, rawPoiCatalog] = await Promise.all([
    readJsonAssetFromInstalled(installed, "MAP_STYLE"),
    readJsonAssetFromInstalled(installed, "POI_CATALOG"),
  ]);
  const origin = options.origin ?? globalThis.location?.origin;
  if (!origin) return null;
  const style = createSafeFormalOfflineMapStyle(rawStyle, vectorAssets[0].path, origin);
  const poiCatalog = parseFormalOfflinePoiCatalog(rawPoiCatalog);
  return style && poiCatalog ? {
    style,
    poiCatalog,
    scenicAreaId: installed.pack.scenicAreaId,
    packId: installed.pack.packId,
    packRevision: installed.pack.packRevision,
    snapshotRevision: installed.pack.snapshotRevision,
    networkRevision: installed.pack.networkRevision,
    operationalVersion: installed.pack.operationalVersion,
    generatedAt: installed.pack.manifest.generatedAt,
    expiresAt: installed.pack.expiresAt,
    rightsEvidenceReference: installed.pack.manifest.rights.evidenceReference,
  } : null;
}

/** Loads the two routing contracts from one verified active cache generation. */
export async function readInstalledFormalRoutingSnapshot(
  scenicAreaId: string,
  options: { cacheStorage?: CacheStorage; now?: Date } = {},
): Promise<InstalledFormalRoutingSnapshot | null> {
  const now = options.now ?? new Date();
  const installed = await readInstalledFormalOfflinePack({ ...options, now });
  if (installed.state !== "AVAILABLE" || installed.pack.scenicAreaId !== scenicAreaId) return null;
  const [routeNetwork, operationalState] = await Promise.all([
    readJsonAssetFromInstalled(installed, "ROUTE_NETWORK"),
    readJsonAssetFromInstalled(installed, "OPERATIONAL_STATE"),
  ]);
  if (routeNetwork === null || operationalState === null) return null;
  const fullNetwork = parseRouteNetwork(routeNetwork);
  const safeNetwork = getSafePublishedNetwork(routeNetwork, now, scenicAreaId);
  if (!fullNetwork || !safeNetwork || safeNetwork.revision !== installed.pack.networkRevision) return null;
  const safeOperationalState = getSafeRouteOperationalState(operationalState, fullNetwork, now, scenicAreaId);
  if (
    !safeOperationalState
    || safeOperationalState.networkRevision !== installed.pack.networkRevision
    || safeOperationalState.operationalVersion !== installed.pack.operationalVersion
  ) return null;
  const expiresAtMs = Math.min(
    new Date(installed.pack.expiresAt).getTime(),
    new Date(safeNetwork.expiresAt as string).getTime(),
    new Date(safeOperationalState.expiresAt).getTime(),
  );
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return null;
  return {
    schemaVersion: 1,
    scenicAreaId,
    packId: installed.pack.packId,
    packRevision: installed.pack.packRevision,
    snapshotRevision: installed.pack.snapshotRevision,
    networkRevision: installed.pack.networkRevision,
    operationalVersion: installed.pack.operationalVersion,
    publishedAt: installed.pack.manifest.snapshotPublishedAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
    routeNetwork,
    operationalState,
  };
}

export async function installFormalOfflinePack(
  scenicAreaId: string,
  options: {
    fetcher?: typeof fetch;
    cacheStorage?: CacheStorage;
    now?: Date;
    nonce?: string;
    onProgress?: (progress: { completed: number; total: number; path: string }) => void;
    signal?: AbortSignal;
  } = {},
): Promise<FormalOfflinePackInstallResult> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const now = options.now ?? new Date();
  if (!fetcher || !cacheStorage || !globalThis.crypto?.subtle || Number.isNaN(now.getTime())) {
    return { ok: false, code: "UNSUPPORTED", message: "当前浏览器不支持安全离线包安装。" };
  }
  const envelope = await fetchVerifiedEnvelope(fetcher, scenicAreaId, now, options.signal);
  if (!envelope) return { ok: false, code: "PACK_UNAVAILABLE", message: "没有可验证的正式离线导航包。" };
  const { manifest } = envelope.verified;
  if (manifest.scenicAreaId !== scenicAreaId) {
    return { ok: false, code: "MANIFEST_REJECTED", message: "离线包与当前景区不一致，已拒绝安装。" };
  }
  const nonce = options.nonce ?? crypto.randomUUID();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(nonce)) {
    return { ok: false, code: "MANIFEST_REJECTED", message: "离线安装标识无效。" };
  }
  const cacheName = `${FORMAL_OFFLINE_ASSET_CACHE_PREFIX}${manifest.scenicAreaId}-${manifest.packId}-${manifest.packRevision}-${nonce}`;
  let candidate: Cache;
  try {
    candidate = await cacheStorage.open(cacheName);
  } catch {
    return { ok: false, code: "STORAGE_FAILED", message: "无法创建离线存储空间。" };
  }

  let assetsVerified = false;
  try {
    let completed = 0;
    for (const asset of manifest.assets) {
      const response = await fetcher(asset.path, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: options.signal,
      });
      if (!response.ok || response.type === "opaque" || !response.body) throw new Error("offline_asset_fetch_failed");
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== asset.contentType) throw new Error("offline_asset_content_type_mismatch");
      const cacheWrite = candidate.put(asset.path, response.clone());
      let integrity: Awaited<ReturnType<typeof sha256ReadableStream>>;
      try {
        integrity = await sha256ReadableStream(response.body, asset.bytes);
      } catch (error) {
        await cacheWrite.catch(() => undefined);
        throw error;
      }
      await cacheWrite;
      if (integrity.bytes !== asset.bytes || integrity.sha256 !== asset.sha256) throw new Error("offline_asset_integrity_mismatch");
      completed += 1;
      options.onProgress?.({ completed, total: manifest.assets.length, path: asset.path });
    }
    assetsVerified = true;

    const registryCache = await cacheStorage.open(FORMAL_OFFLINE_REGISTRY_CACHE);
    const previousResponse = await registryCache.match(FORMAL_OFFLINE_REGISTRY_PATH);
    const previous = previousResponse ? parseInstalledPack(await boundedJson(previousResponse)) : null;
    const pack: InstalledFormalOfflinePack = {
      schemaVersion: 1,
      scenicAreaId: manifest.scenicAreaId,
      packId: manifest.packId,
      packRevision: manifest.packRevision,
      snapshotRevision: manifest.snapshotRevision,
      networkRevision: manifest.networkRevision,
      operationalVersion: manifest.operationalVersion,
      installedAt: now.toISOString(),
      expiresAt: manifest.expiresAt,
      cacheName,
      manifest,
      verificationKey: envelope.verificationKey,
      expectedKeyId: envelope.expectedKeyId,
    };
    await registryCache.put(FORMAL_OFFLINE_REGISTRY_PATH, new Response(JSON.stringify(pack), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }));
    if (previous && previous.cacheName !== cacheName) await cacheStorage.delete(previous.cacheName).catch(() => false);
    return { ok: true, pack, totalBytes: envelope.verified.totalBytes };
  } catch {
    await cacheStorage.delete(cacheName).catch(() => false);
    return { ok: false, code: assetsVerified ? "STORAGE_FAILED" : "ASSET_REJECTED", message: assetsVerified
      ? "离线资源已核对，但无法安全切换活动包；旧离线包未受影响。"
      : "离线资源下载不完整或校验失败，旧离线包未受影响。" };
  }
}
