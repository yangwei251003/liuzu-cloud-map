const CACHE = "liuzu-cloud-tour-v8";
const OFFLINE_PACK_CACHE = "liuzu-cloud-tour-offline-pack-v2";
const FORMAL_OFFLINE_REGISTRY_CACHE = "liuzu-cloud-tour-offline-pack-registry-v1";
const FORMAL_OFFLINE_REGISTRY_PATH = "/offline-packs/.active-pack.json";
const FORMAL_OFFLINE_ASSET_CACHE_PREFIX = "liuzu-cloud-tour-formal-offline-v1-";
const RETIRED = ["liuzu-cloud-tour-v1", "liuzu-cloud-tour-v2", "liuzu-cloud-tour-v3", "liuzu-cloud-tour-v4", "liuzu-cloud-tour-v5", "liuzu-cloud-tour-v6", "liuzu-cloud-tour-v7", "liuzu-cloud-tour-offline-pack-v0", "liuzu-cloud-tour-offline-pack-v1"];
const NETWORK_ONLY_PREFIXES = ["/share", "/account", "/admin"];
// There is no currently approved, published scenic snapshot. Candidate GIS
// and prototype routes must never be described as an offline navigation pack.
// Add entries only through the formal publication pipeline after rights,
// provenance, verification and expiry gates have all passed.
const OFFLINE_PACK_AVAILABLE = false;
const OFFLINE_PACK_UNAVAILABLE_REASON = "本机尚无已通过数据权利、发布、现场核验与签名校验的当前正式离线导航包；离线导航已停止。";
const SHELL = [
  "/",
  "/privacy",
  "/assets/images/neutral-app-icon.svg",
];
const OFFLINE_PACK = [];

const REQUIRED_ASSET_ROLES = ["ROUTE_NETWORK", "OPERATIONAL_STATE", "POI_CATALOG", "MAP_STYLE", "VECTOR_TILES"];
const ASSET_ROLES = new Set([...REQUIRED_ASSET_ROLES, "ICON_SPRITE", "FONT_GLYPHS"]);
const CONTENT_TYPES = new Set(["application/json", "application/geo+json", "application/vnd.pmtiles", "image/png", "image/svg+xml", "application/x-protobuf"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new Error("non_canonical_value");
}

function parseFormalManifest(value, now) {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "packId", "scenicAreaId", "packRevision", "snapshotRevision", "snapshotPublishedAt", "networkRevision", "operationalVersion", "coordinateSystem", "generatedAt", "expiresAt", "bounds", "rights", "assets", "signature"])
    || value.schemaVersion !== 1
    || typeof value.packId !== "string"
    || !ID_PATTERN.test(value.packId)
    || typeof value.scenicAreaId !== "string"
    || !ID_PATTERN.test(value.scenicAreaId)
    || !isPositiveInteger(value.packRevision)
    || !isPositiveInteger(value.snapshotRevision)
    || typeof value.snapshotPublishedAt !== "string"
    || !Number.isFinite(new Date(value.snapshotPublishedAt).getTime())
    || typeof value.networkRevision !== "string"
    || !value.networkRevision
    || value.networkRevision.length > 120
    || !isPositiveInteger(value.operationalVersion)
    || value.coordinateSystem !== "WGS84"
    || !Array.isArray(value.bounds)
    || value.bounds.length !== 4
    || !value.bounds.every(Number.isFinite)
    || !isRecord(value.rights)
    || !exactKeys(value.rights, ["status", "evidenceReference"])
    || value.rights.status !== "CLEARED"
    || typeof value.rights.evidenceReference !== "string"
    || !value.rights.evidenceReference.startsWith("https://")
    || !Array.isArray(value.assets)
    || value.assets.length < 5
    || value.assets.length > 64
    || !isRecord(value.signature)
    || !exactKeys(value.signature, ["algorithm", "keyId", "value"])
    || value.signature.algorithm !== "ECDSA_P256_SHA256"
    || typeof value.signature.keyId !== "string"
    || !ID_PATTERN.test(value.signature.keyId)
    || typeof value.signature.value !== "string"
    || !/^[A-Za-z0-9_-]{40,200}$/.test(value.signature.value)
  ) return null;
  const generatedAt = new Date(value.generatedAt).getTime();
  const expiresAt = new Date(value.expiresAt).getTime();
  if (
    !Number.isFinite(generatedAt)
    || !Number.isFinite(expiresAt)
    || generatedAt > now + 5 * 60_000
    || expiresAt <= now
    || expiresAt <= generatedAt
    || expiresAt - generatedAt > 72 * 60 * 60_000
  ) return null;
  const prefix = `/offline-packs/${value.scenicAreaId}/${value.packId}/`;
  let totalBytes = 0;
  for (const asset of value.assets) {
    if (
      !isRecord(asset)
      || !exactKeys(asset, ["role", "path", "contentType", "bytes", "sha256", "cachePolicy"])
      || !ASSET_ROLES.has(asset.role)
      || typeof asset.path !== "string"
      || !asset.path.startsWith(prefix)
      || asset.path.includes("..")
      || asset.path.includes("?")
      || asset.path.includes("#")
      || !/^\/[A-Za-z0-9._/-]+$/.test(asset.path)
      || !CONTENT_TYPES.has(asset.contentType)
      || !isPositiveInteger(asset.bytes)
      || asset.bytes > 512 * 1024 * 1024
      || typeof asset.sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(asset.sha256)
      || asset.cachePolicy !== "IMMUTABLE"
    ) return null;
    totalBytes += asset.bytes;
  }
  if (totalBytes > 1024 * 1024 * 1024 || new Set(value.assets.map((asset) => asset.path)).size !== value.assets.length) return null;
  if (!REQUIRED_ASSET_ROLES.every((role) => value.assets.filter((asset) => asset.role === role).length === 1)) return null;
  return value;
}

function parseVerificationKey(value) {
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
  return value;
}

function decodeBase64Url(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = self.atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function verifyRegistrySignature(registry) {
  if (!self.crypto?.subtle) return false;
  const signature = decodeBase64Url(registry.manifest.signature.value);
  if (!signature) return false;
  try {
    const key = await self.crypto.subtle.importKey("jwk", registry.verificationKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const payload = new TextEncoder().encode(canonicalize({
      ...registry.manifest,
      signature: { algorithm: registry.manifest.signature.algorithm, keyId: registry.manifest.signature.keyId },
    }));
    return self.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, payload);
  } catch {
    return false;
  }
}

async function loadActiveRegistry() {
  try {
    const registryCache = await caches.open(FORMAL_OFFLINE_REGISTRY_CACHE);
    const response = await registryCache.match(FORMAL_OFFLINE_REGISTRY_PATH);
    if (!response) return null;
    const length = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(length) && length > 256 * 1024) return null;
    const value = await response.json();
    const now = Date.now();
    if (
      !isRecord(value)
      || !exactKeys(value, ["schemaVersion", "scenicAreaId", "packId", "packRevision", "snapshotRevision", "networkRevision", "operationalVersion", "installedAt", "expiresAt", "cacheName", "manifest", "verificationKey", "expectedKeyId"])
      || value.schemaVersion !== 1
      || typeof value.cacheName !== "string"
      || !value.cacheName.startsWith(FORMAL_OFFLINE_ASSET_CACHE_PREFIX)
      || value.cacheName.length > 240
      || !/^[A-Za-z0-9._-]+$/.test(value.cacheName)
      || typeof value.installedAt !== "string"
      || !Number.isFinite(new Date(value.installedAt).getTime())
      || new Date(value.installedAt).getTime() > now + 5 * 60_000
      || typeof value.expectedKeyId !== "string"
    ) return null;
    const manifest = parseFormalManifest(value.manifest, now);
    const verificationKey = parseVerificationKey(value.verificationKey);
    if (
      !manifest
      || !verificationKey
      || value.scenicAreaId !== manifest.scenicAreaId
      || value.packId !== manifest.packId
      || value.packRevision !== manifest.packRevision
      || value.snapshotRevision !== manifest.snapshotRevision
      || value.networkRevision !== manifest.networkRevision
      || value.operationalVersion !== manifest.operationalVersion
      || value.expiresAt !== manifest.expiresAt
      || value.expectedKeyId !== manifest.signature.keyId
      || !await verifyRegistrySignature({ ...value, manifest, verificationKey })
    ) return null;
    return { ...value, manifest, verificationKey };
  } catch {
    return null;
  }
}

async function inspectCache(cacheName, entries) {
  const cache = await caches.open(cacheName);
  const inspected = await Promise.all(entries.map(async (entry) => ({ entry, cached: Boolean(await cache.match(entry)) })));
  return inspected.filter(({ cached }) => !cached).map(({ entry }) => entry);
}

async function getCacheStatus() {
  const [shellMissing, registry] = await Promise.all([inspectCache(CACHE, SHELL), loadActiveRegistry()]);
  const offlinePackMissing = registry ? await inspectCache(registry.cacheName, registry.manifest.assets.map((asset) => asset.path)) : [];
  return {
    cacheName: CACHE,
    shellCacheName: CACHE,
    offlinePackCacheName: registry?.cacheName ?? OFFLINE_PACK_CACHE,
    shellReady: shellMissing.length === 0,
    offlinePackAvailable: Boolean(registry),
    offlinePackReady: Boolean(registry) && offlinePackMissing.length === 0,
    offlinePackUnavailableReason: registry ? null : OFFLINE_PACK_UNAVAILABLE_REASON,
    shellMissing,
    offlinePackMissing,
    missing: [...shellMissing, ...offlinePackMissing],
  };
}

async function cachedRangeResponse(request, cached) {
  const range = request.headers?.get?.("range");
  if (!range) return cached;
  const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
  const blob = await cached.blob();
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : blob.size - 1;
  const end = Math.min(requestedEnd, blob.size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= blob.size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  }
  const headers = new Headers(cached.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(blob.slice(start, end + 1, cached.headers.get("content-type") || undefined), { status: 206, headers });
}

async function serveFormalOfflineAsset(request, pathname) {
  const registry = await loadActiveRegistry();
  if (!registry || !registry.manifest.assets.some((asset) => asset.path === pathname)) {
    return fetch(request, { cache: "no-store" });
  }
  const cache = await caches.open(registry.cacheName);
  const cached = await cache.match(pathname);
  return cached ? cachedRangeResponse(request, cached) : fetch(request, { cache: "no-store" });
}

async function cacheMissingEntries(cache, entries) {
  for (const entry of entries) {
    if (await cache.match(entry)) continue;
    const response = await fetch(entry, { cache: "reload", credentials: "same-origin" });
    if (!response.ok) throw new Error(`download_failed:${entry}:${response.status}`);
    await cache.put(entry, response.clone());
  }
}

async function downloadOfflinePack(port) {
  if (!OFFLINE_PACK_AVAILABLE) {
    port.postMessage({
      type: "OFFLINE_PACK_UNAVAILABLE",
      cacheName: CACHE,
      shellCacheName: CACHE,
      offlinePackCacheName: OFFLINE_PACK_CACHE,
      shellReady: false,
      offlinePackAvailable: false,
      offlinePackReady: false,
      offlinePackUnavailableReason: OFFLINE_PACK_UNAVAILABLE_REASON,
      shellMissing: [...SHELL],
      offlinePackMissing: [],
      missing: [...SHELL],
      message: OFFLINE_PACK_UNAVAILABLE_REASON,
    });
    return;
  }
  let currentEntry = null;
  try {
    const shellCache = await caches.open(CACHE);
    await cacheMissingEntries(shellCache, SHELL);
    const packCache = await caches.open(OFFLINE_PACK_CACHE);
    let completed = 0;
    for (const entry of OFFLINE_PACK) {
      currentEntry = entry;
      const alreadyCached = Boolean(await packCache.match(entry));
      if (!alreadyCached) {
        const response = await fetch(entry, { cache: "reload", credentials: "same-origin" });
        if (!response.ok) throw new Error(`download_failed:${entry}:${response.status}`);
        await packCache.put(entry, response.clone());
      }
      completed += 1;
      port.postMessage({
        type: "OFFLINE_PACK_PROGRESS",
        offlinePackCacheName: OFFLINE_PACK_CACHE,
        completed,
        total: OFFLINE_PACK.length,
        entry,
        alreadyCached,
      });
    }
    port.postMessage({ type: "OFFLINE_PACK_COMPLETE", ...(await getCacheStatus()) });
  } catch {
    port.postMessage({
      type: "OFFLINE_PACK_ERROR",
      failedEntry: currentEntry,
      message: "离线地图包未完整下载，请检查网络和可用空间后重试。",
      ...(await getCacheStatus().catch(() => ({
        cacheName: CACHE,
        shellCacheName: CACHE,
        offlinePackCacheName: OFFLINE_PACK_CACHE,
        shellReady: false,
        offlinePackAvailable: false,
        offlinePackReady: false,
        offlinePackUnavailableReason: OFFLINE_PACK_UNAVAILABLE_REASON,
        shellMissing: [...SHELL],
        offlinePackMissing: [...OFFLINE_PACK],
        missing: [...SHELL, ...OFFLINE_PACK],
      }))),
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => RETIRED.includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  const port = event.ports?.[0];
  if (!port) return;
  if (event.data?.type === "GET_CACHE_STATUS") {
    event.waitUntil(
      getCacheStatus()
        .then((status) => port.postMessage({ type: "CACHE_STATUS", ...status }))
        .catch(() => port.postMessage({
          type: "CACHE_STATUS",
          cacheName: CACHE,
          shellCacheName: CACHE,
          offlinePackCacheName: OFFLINE_PACK_CACHE,
          shellReady: false,
          offlinePackAvailable: false,
          offlinePackReady: false,
          offlinePackUnavailableReason: OFFLINE_PACK_UNAVAILABLE_REASON,
          shellMissing: [...SHELL],
          offlinePackMissing: [...OFFLINE_PACK],
          missing: [...SHELL, ...OFFLINE_PACK],
        })),
    );
    return;
  }
  if (event.data?.type === "DOWNLOAD_OFFLINE_PACK") event.waitUntil(downloadOfflinePack(port));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
  ) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (request.method !== "GET") return;
  // Candidate and draft GIS are never an application-shell cache entry. A
  // future formal offline package has to opt in through OFFLINE_PACK above.
  if (url.pathname.startsWith("/data/gis/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (url.pathname.startsWith("/offline-packs/")) {
    event.respondWith(serveFormalOfflineAsset(request, url.pathname));
    return;
  }
  if (OFFLINE_PACK_AVAILABLE && OFFLINE_PACK.includes(url.pathname)) {
    event.respondWith(caches.open(OFFLINE_PACK_CACHE).then((cache) => cache.match(request)).then((cached) => cached || fetch(request)));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
