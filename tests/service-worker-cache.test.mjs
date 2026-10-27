import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const swPath = path.join(projectRoot, "public", "sw.js");
const policyPath = path.join(projectRoot, "tests", "fixtures", "service-worker-cache-policy.v1.json");
const swSource = await readFile(swPath, "utf8");
const policy = JSON.parse(await readFile(policyPath, "utf8"));

function parseArray(source, name) {
  const literal = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))?.[1];
  assert.ok(literal, `service worker must declare a static ${name} array`);
  return JSON.parse(literal.replace(/,\s*]/g, "]"));
}

function parseServiceWorkerManifest(source) {
  const cache = source.match(/const CACHE = "([^"]+)";/)?.[1];
  const offlinePackCache = source.match(/const OFFLINE_PACK_CACHE = "([^"]+)";/)?.[1];
  const offlinePackAvailable = source.match(/const OFFLINE_PACK_AVAILABLE = (true|false);/)?.[1];
  assert.ok(cache, "service worker must declare a CACHE name");
  assert.ok(offlinePackCache, "service worker must declare an OFFLINE_PACK_CACHE name");
  assert.ok(offlinePackAvailable, "service worker must declare whether a formal offline pack is available");
  return {
    cache,
    offlinePackCache,
    offlinePackAvailable: offlinePackAvailable === "true",
    retired: parseArray(source, "RETIRED"),
    networkOnlyPrefixes: parseArray(source, "NETWORK_ONLY_PREFIXES"),
    shell: parseArray(source, "SHELL"),
    offlinePack: parseArray(source, "OFFLINE_PACK"),
  };
}

function response(ok = true, status = ok ? 200 : 503) {
  return { ok, status, clone() { return response(ok, status); } };
}

function workerContext({ caches, fetch = async () => { throw new Error("fetch_not_expected"); } }) {
  const listeners = new Map();
  const context = vm.createContext({
    URL,
    Headers,
    Request,
    Response,
    TextEncoder,
    fetch,
    caches,
    self: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
      location: { origin: "https://offline.test" },
      crypto,
      atob,
    },
  });
  vm.runInContext(swSource, context, { filename: swPath });
  return listeners;
}

const manifest = parseServiceWorkerManifest(swSource);
const routeFiles = new Map([
  ["/", "src/app/page.tsx"],
  ["/arrival", "src/app/arrival/page.tsx"],
  ["/cloud-tour", "src/app/cloud-tour/page.tsx"],
  ["/map", "src/app/map/page.tsx"],
  ["/plan", "src/app/plan/page.tsx"],
  ["/guide", "src/app/guide/page.tsx"],
  ["/guide/ask", "src/app/guide/ask/page.tsx"],
  ["/journey", "src/app/journey/page.tsx"],
  ["/journey/knowledge", "src/app/journey/knowledge/page.tsx"],
  ["/account", "src/app/account/page.tsx"],
  ["/share", "src/app/share/page.tsx"],
  ["/privacy", "src/app/privacy/page.tsx"],
  ["/admin", "src/app/admin/page.tsx"],
  ["/admin/readiness", "src/app/admin/readiness/page.tsx"],
]);

test("cache policy fails closed until a formal offline map pack is approved", () => {
  assert.equal(policy.schemaVersion, 5);
  assert.equal(manifest.cache, policy.activeCacheName);
  assert.equal(manifest.offlinePackCache, policy.offlinePackCacheName);
  assert.deepEqual(manifest.retired, policy.retiredCacheNames);
  assert.deepEqual(manifest.networkOnlyPrefixes, policy.networkOnlyPrefixes);
  assert.deepEqual(manifest.shell, policy.shellEntries);
  assert.deepEqual(manifest.offlinePack, policy.offlinePackEntries);
  assert.equal(manifest.offlinePackAvailable, false);
  assert.deepEqual(manifest.offlinePack, []);
  assert.equal(new Set(manifest.shell).size, manifest.shell.length, "SHELL entries must be unique");
  assert.equal(new Set(manifest.offlinePack).size, manifest.offlinePack.length, "OFFLINE_PACK entries must be unique");
  assert.deepEqual(manifest.shell.filter((entry) => manifest.offlinePack.includes(entry)), []);
  assert.equal(manifest.shell.some((entry) => entry.startsWith("/data/gis/") || entry.includes("maplibre")), false);
  for (const prefix of policy.forbiddenCachePrefixes) {
    assert.equal([...manifest.shell, ...manifest.offlinePack].some((entry) => entry.startsWith(prefix)), false, `${prefix} must not be precached`);
  }
});

test("every declared route, shell asset and offline-pack asset exists", async () => {
  for (const route of policy.appRoutes) {
    const relative = routeFiles.get(route);
    assert.ok(relative, `app route ${route} needs a route-file mapping in the policy test`);
    const info = await stat(path.join(projectRoot, relative));
    assert.ok(info.isFile() && info.size > 0, `${route} must resolve to a non-empty page`);
  }
  for (const entry of policy.shellEntries) {
    const relative = routeFiles.get(entry) ?? path.join("public", entry.slice(1));
    const info = await stat(path.join(projectRoot, relative));
    assert.ok(info.isFile() && info.size > 0, `${entry} must exist and be non-empty`);
  }
  for (const asset of policy.offlinePackEntries) {
    const info = await stat(path.join(projectRoot, "public", asset.slice(1)));
    assert.ok(info.isFile() && info.size > 0, `${asset} must exist and be non-empty`);
  }
});

test("install downloads only the lightweight shell and activation withdraws every retired version", async () => {
  const added = [];
  const deleted = [];
  const listeners = workerContext({
    caches: {
      open: async (name) => ({
        addAll: async (entries) => added.push({ name, entries: [...entries] }),
        put: async () => undefined,
        match: async () => null,
      }),
      keys: async () => [policy.activeCacheName, policy.offlinePackCacheName, ...policy.retiredCacheNames, "another-product-v7"],
      delete: async (name) => { deleted.push(name); return true; },
      match: async () => null,
    },
  });

  let installWork;
  listeners.get("install")({ waitUntil: (promise) => { installWork = promise; } });
  await installWork;
  assert.deepEqual(added, [{ name: policy.activeCacheName, entries: manifest.shell }]);
  assert.equal(added[0].entries.some((entry) => manifest.offlinePack.includes(entry)), false);

  let activateWork;
  listeners.get("activate")({ waitUntil: (promise) => { activateWork = promise; } });
  await activateWork;
  assert.deepEqual(deleted.sort(), [...policy.retiredCacheNames].sort());
});

test("GET_CACHE_STATUS reports an unavailable formal pack without a generic ready claim", async () => {
  const shellEntries = new Set(manifest.shell);
  const replies = [];
  const listeners = workerContext({
    caches: {
      open: async (name) => ({
        addAll: async () => undefined,
        put: async () => undefined,
        match: async (entry) => name === manifest.cache && shellEntries.has(entry) ? response() : null,
      }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });

  let messageWork;
  listeners.get("message")({
    data: { type: "GET_CACHE_STATUS" },
    ports: [{ postMessage: (value) => replies.push(value) }],
    waitUntil: (promise) => { messageWork = promise; },
  });
  await messageWork;

  assert.equal(replies.length, 1);
  assert.equal(replies[0].shellReady, true);
  assert.equal(replies[0].offlinePackAvailable, false);
  assert.equal(replies[0].offlinePackReady, false);
  assert.equal("ready" in replies[0], false);
  assert.deepEqual(Array.from(replies[0].shellMissing), []);
  assert.deepEqual(Array.from(replies[0].offlinePackMissing), []);
  assert.deepEqual(Array.from(replies[0].missing), []);
  assert.match(replies[0].offlinePackUnavailableReason, /数据权利.*现场核验.*签名校验/);
});

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

async function activeRegistryFixture() {
  const now = Date.now();
  const assets = [
    ["ROUTE_NETWORK", "route-network.json", "application/json"],
    ["OPERATIONAL_STATE", "operational-state.json", "application/json"],
    ["POI_CATALOG", "poi-catalog.geojson", "application/geo+json"],
    ["MAP_STYLE", "style.json", "application/json"],
    ["VECTOR_TILES", "map.pmtiles", "application/vnd.pmtiles"],
  ].map(([role, name, contentType]) => ({
    role,
    path: `/offline-packs/fictional-park/pack-1/${name}`,
    contentType,
    bytes: role === "VECTOR_TILES" ? 10 : 2,
    sha256: "a".repeat(64),
    cachePolicy: "IMMUTABLE",
  }));
  const manifest = {
    schemaVersion: 1,
    packId: "pack-1",
    scenicAreaId: "fictional-park",
    packRevision: 1,
    snapshotRevision: 1,
    snapshotPublishedAt: new Date(now - 2 * 60_000).toISOString(),
    networkRevision: "network-1",
    operationalVersion: 1,
    coordinateSystem: "WGS84",
    generatedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
    bounds: [112, 22, 113, 23],
    rights: { status: "CLEARED", evidenceReference: "https://evidence.example.test/pack-1" },
    assets,
    signature: { algorithm: "ECDSA_P256_SHA256", keyId: "key-1", value: "A".repeat(86) },
  };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const payload = canonicalize({ ...manifest, signature: { algorithm: manifest.signature.algorithm, keyId: manifest.signature.keyId } });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(payload));
  manifest.signature.value = Buffer.from(signature).toString("base64url");
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    schemaVersion: 1,
    scenicAreaId: manifest.scenicAreaId,
    packId: manifest.packId,
    packRevision: manifest.packRevision,
    snapshotRevision: manifest.snapshotRevision,
    networkRevision: manifest.networkRevision,
    operationalVersion: manifest.operationalVersion,
    installedAt: new Date(now).toISOString(),
    expiresAt: manifest.expiresAt,
    cacheName: "liuzu-cloud-tour-formal-offline-v1-fictional-park-pack-1-install-1",
    manifest,
    verificationKey: { kty: "EC", crv: "P-256", x: exported.x, y: exported.y, ext: true, key_ops: ["verify"] },
    expectedKeyId: "key-1",
  };
}

test("a signature-verified registry makes only its exact immutable assets available", async () => {
  const registry = await activeRegistryFixture();
  const shellEntries = new Set(manifest.shell);
  const assetEntries = new Map(registry.manifest.assets.map((asset) => [asset.path, new Response(
    asset.role === "VECTOR_TILES" ? new Uint8Array(10).map((_, index) => index) : "{}",
    { headers: { "Content-Type": asset.contentType } },
  )]));
  const replies = [];
  const listeners = workerContext({
    caches: {
      open: async (name) => ({
        addAll: async () => undefined,
        put: async () => undefined,
        match: async (entry) => {
          if (name === manifest.cache && shellEntries.has(entry)) return new Response("shell");
          if (name === "liuzu-cloud-tour-offline-pack-registry-v1" && entry === "/offline-packs/.active-pack.json") return Response.json(registry);
          return name === registry.cacheName ? assetEntries.get(entry)?.clone() ?? null : null;
        },
      }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });
  let messageWork;
  listeners.get("message")({
    data: { type: "GET_CACHE_STATUS" },
    ports: [{ postMessage: (value) => replies.push(value) }],
    waitUntil: (promise) => { messageWork = promise; },
  });
  await messageWork;
  assert.equal(replies[0].offlinePackAvailable, true);
  assert.equal(replies[0].offlinePackReady, true);
  assert.equal(replies[0].offlinePackCacheName, registry.cacheName);
  assert.deepEqual(Array.from(replies[0].offlinePackMissing), []);

  let rangeWork;
  const request = new Request("https://offline.test/offline-packs/fictional-park/pack-1/map.pmtiles", {
    headers: { Range: "bytes=2-5" },
  });
  listeners.get("fetch")({ request, respondWith: (promise) => { rangeWork = promise; } });
  const ranged = await rangeWork;
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), "bytes 2-5/10");
  assert.deepEqual([...new Uint8Array(await ranged.arrayBuffer())], [2, 3, 4, 5]);
});

test("a registry with changed signed metadata is ignored and cannot authorize an offline path", async () => {
  const registry = await activeRegistryFixture();
  registry.networkRevision = "tampered-network";
  const fetched = [];
  const listeners = workerContext({
    fetch: async (...args) => { fetched.push(args); return new Response("network", { status: 200 }); },
    caches: {
      open: async (name) => ({
        addAll: async () => undefined,
        put: async () => undefined,
        match: async (entry) => name === "liuzu-cloud-tour-offline-pack-registry-v1" && entry === "/offline-packs/.active-pack.json"
          ? Response.json(registry)
          : null,
      }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });
  let fetchWork;
  const request = new Request("https://offline.test/offline-packs/fictional-park/pack-1/map.pmtiles");
  listeners.get("fetch")({ request, respondWith: (promise) => { fetchWork = promise; } });
  const result = await fetchWork;
  assert.equal(await result.text(), "network");
  assert.equal(fetched[0][1].cache, "no-store");
});

test("DOWNLOAD_OFFLINE_PACK refuses candidate GIS until a formal pack is approved", async () => {
  const fetched = [];
  const cacheCalls = [];
  const replies = [];
  const listeners = workerContext({
    fetch: async (entry) => { fetched.push(entry); return response(); },
    caches: {
      open: async (...args) => { cacheCalls.push(args); throw new Error("cache_not_expected"); },
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });

  let messageWork;
  listeners.get("message")({
    data: { type: "DOWNLOAD_OFFLINE_PACK" },
    ports: [{ postMessage: (value) => replies.push(value) }],
    waitUntil: (promise) => { messageWork = promise; },
  });
  await messageWork;

  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, "OFFLINE_PACK_UNAVAILABLE");
  assert.equal(replies[0].offlinePackAvailable, false);
  assert.equal(replies[0].offlinePackReady, false);
  assert.match(replies[0].message, /离线导航已停止/);
  assert.deepEqual(fetched, []);
  assert.deepEqual(cacheCalls, []);
});

test("candidate GIS is network-only and never silently enters CacheStorage", async () => {
  const fetched = [];
  const cacheCalls = [];
  const listeners = workerContext({
    fetch: async (...args) => { fetched.push(args); return response(); },
    caches: {
      open: async (...args) => { cacheCalls.push(["open", ...args]); throw new Error("cache_not_expected"); },
      keys: async () => [],
      delete: async () => true,
      match: async (...args) => { cacheCalls.push(["match", ...args]); throw new Error("cache_not_expected"); },
    },
  });

  let fetchWork;
  const request = { method: "GET", mode: "cors", url: "https://offline.test/data/gis/prototype-routes.geojson" };
  listeners.get("fetch")({ request, respondWith: (promise) => { fetchWork = promise; } });
  await fetchWork;
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0][0], request);
  assert.equal(fetched[0][1]?.cache, "no-store");
  assert.deepEqual(cacheCalls, []);
});

test("share, account, admin and API requests are network-only and never enter CacheStorage", async () => {
  for (const pathname of ["/share", "/share?token=should-not-cache", "/account", "/admin", "/admin/readiness", "/account?_rsc=test", "/api/v1/shared-routes/resolve"]) {
    const fetched = [];
    const cacheCalls = [];
    const listeners = workerContext({
      fetch: async (...args) => { fetched.push(args); return response(); },
      caches: {
        open: async (...args) => { cacheCalls.push(["open", ...args]); throw new Error("cache_not_expected"); },
        keys: async () => [],
        delete: async () => true,
        match: async (...args) => { cacheCalls.push(["match", ...args]); return null; },
      },
    });
    let fetchWork;
    const request = { method: "GET", mode: pathname.includes("_rsc") || pathname.startsWith("/api/") ? "cors" : "navigate", url: `https://offline.test${pathname}` };
    listeners.get("fetch")({ request, respondWith: (promise) => { fetchWork = promise; } });
    await fetchWork;
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0][0], request);
    assert.equal(fetched[0][1]?.cache, "no-store");
    assert.deepEqual(cacheCalls, []);
  }
});

test("share-resolve POST is also explicitly network-only", async () => {
  const fetched = [];
  const listeners = workerContext({
    fetch: async (...args) => { fetched.push(args); return response(); },
    caches: {
      open: async () => { throw new Error("cache_not_expected"); },
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });
  let fetchWork;
  const request = { method: "POST", mode: "cors", url: "https://offline.test/api/v1/shared-routes/resolve" };
  listeners.get("fetch")({ request, respondWith: (promise) => { fetchWork = promise; } });
  await fetchWork;
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0][0], request);
  assert.equal(fetched[0][1]?.cache, "no-store");
});

test("cache version withdraws candidate data, APIs/GIS stay network-only and unavailable state is explicit", () => {
  const version = (name) => Number.parseInt(name.match(/-v(\d+)$/)?.[1] ?? "", 10);
  const activeVersion = version(policy.activeCacheName);
  assert.ok(Number.isInteger(activeVersion));
  for (const retired of policy.retiredCacheNames.filter((name) => /^liuzu-cloud-tour-v\d+$/.test(name))) {
    assert.ok(version(retired) < activeVersion, `${retired} must be older than ${policy.activeCacheName}`);
  }
  assert.ok(policy.retiredCacheNames.includes("liuzu-cloud-tour-v6"));
  assert.ok(policy.retiredCacheNames.includes("liuzu-cloud-tour-v7"));
  assert.match(swSource, /url\.pathname === "\/api" \|\|/);
  assert.match(swSource, /cache: "no-store"/);
  assert.match(swSource, /url\.pathname\.startsWith\("\/data\/gis\/"\)/);
  assert.match(swSource, /OFFLINE_PACK_UNAVAILABLE/);
  assert.match(swSource, /caches\.match\("\/"\)/);
  assert.match(swSource, /DOWNLOAD_OFFLINE_PACK/);
});
