import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FORMAL_OFFLINE_REGISTRY_CACHE,
  FORMAL_OFFLINE_REGISTRY_PATH,
  createSafeFormalOfflineMapStyle,
  installFormalOfflinePack,
  parseFormalOfflinePoiCatalog,
  readInstalledFormalOfflineJsonAsset,
  readInstalledFormalOfflineMapBundle,
  readInstalledFormalOfflinePack,
  readInstalledFormalRoutingSnapshot,
} from "../src/lib/formal-offline-pack-client.ts";
import {
  canonicalFormalOfflinePackPayload,
  parseFormalOfflinePackManifest,
} from "../src/lib/formal-offline-pack.ts";
import { planDirectedRoute } from "../src/lib/directed-route-engine.ts";

class MemoryCache {
  entries = new Map();

  key(request) {
    return typeof request === "string" ? request : request.url;
  }

  async match(request) {
    return this.entries.get(this.key(request))?.clone();
  }

  async put(request, response) {
    const bytes = await response.arrayBuffer();
    this.entries.set(this.key(request), new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }));
  }
}

class MemoryCacheStorage {
  stores = new Map();

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache());
    return this.stores.get(name);
  }

  async delete(name) {
    return this.stores.delete(name);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetBytes(revision) {
  return new Map([
    ["ROUTE_NETWORK", new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, revision, nodes: [], edges: [] }))],
    ["OPERATIONAL_STATE", new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, version: revision }))],
    ["POI_CATALOG", new TextEncoder().encode(JSON.stringify({ type: "FeatureCollection", features: [] }))],
    ["MAP_STYLE", new TextEncoder().encode(JSON.stringify({ version: 8, sources: {}, layers: [] }))],
    ["VECTOR_TILES", new Uint8Array([80, 77, 84, 105, 108, 101, 115, revision])],
  ]);
}

async function signedPack(revision, overrides = {}) {
  const packId = `fictional-pack-${revision}`;
  const prefix = `/offline-packs/fictional-park/${packId}`;
  const bytesByRole = overrides.bytesByRole ?? assetBytes(revision);
  const specifications = [
    ["ROUTE_NETWORK", "route-network.json", "application/json"],
    ["OPERATIONAL_STATE", "operational-state.json", "application/json"],
    ["POI_CATALOG", "poi-catalog.geojson", "application/geo+json"],
    ["MAP_STYLE", "style.json", "application/json"],
    ["VECTOR_TILES", "map.pmtiles", "application/vnd.pmtiles"],
  ];
  const draft = {
    schemaVersion: 1,
    packId,
    scenicAreaId: "fictional-park",
    packRevision: revision,
    snapshotRevision: overrides.snapshotRevision ?? revision,
    snapshotPublishedAt: "2026-08-15T23:00:00.000Z",
    networkRevision: overrides.networkRevision ?? `fictional-network-v${revision}`,
    operationalVersion: overrides.operationalVersion ?? revision,
    coordinateSystem: "WGS84",
    generatedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-08-18T00:00:00.000Z",
    bounds: [112.18, 22.48, 112.26, 22.62],
    rights: { status: "CLEARED", evidenceReference: `https://evidence.example.test/offline/${revision}` },
    assets: specifications.map(([role, name, contentType]) => {
      const bytes = bytesByRole.get(role);
      return { role, path: `${prefix}/${name}`, contentType, bytes: bytes.byteLength, sha256: sha256(bytes), cachePolicy: "IMMUTABLE" };
    }),
    signature: { algorithm: "ECDSA_P256_SHA256", keyId: "field-release-key-1", value: "A".repeat(86) },
  };
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const parsed = parseFormalOfflinePackManifest(draft);
  assert.ok(parsed);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(canonicalFormalOfflinePackPayload(parsed)),
  );
  draft.signature.value = Buffer.from(signature).toString("base64url");
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const verificationKey = {
    kty: "EC",
    crv: "P-256",
    x: publicKey.x,
    y: publicKey.y,
    ext: true,
    key_ops: ["verify"],
  };
  return { draft, bytesByRole, verificationKey };
}

function fetcherFor(pack, tamperRole = null) {
  return async (input) => {
    const path = String(input);
    if (path.startsWith("/api/v1/scenic-areas/")) {
      return Response.json({
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        schemaVersion: 1,
        manifest: pack.draft,
        verificationKey: pack.verificationKey,
        expectedKeyId: "field-release-key-1",
      });
    }
    const asset = pack.draft.assets.find((candidate) => candidate.path === path);
    assert.ok(asset, `unexpected fetch ${path}`);
    const source = pack.bytesByRole.get(asset.role);
    const bytes = asset.role === tamperRole ? new Uint8Array([...source, 0]) : source;
    return new Response(bytes, { status: 200, headers: { "Content-Type": asset.contentType } });
  };
}

test("a signed pack installs into an isolated cache and becomes active only after every streamed hash passes", async () => {
  const cacheStorage = new MemoryCacheStorage();
  const pack = await signedPack(7);
  const result = await installFormalOfflinePack("fictional-park", {
    fetcher: fetcherFor(pack),
    cacheStorage,
    now: new Date("2026-08-16T01:00:00.000Z"),
    nonce: "install-0007",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const registry = await cacheStorage.open(FORMAL_OFFLINE_REGISTRY_CACHE);
  assert.ok(await registry.match(FORMAL_OFFLINE_REGISTRY_PATH));
  const installed = await readInstalledFormalOfflinePack({ cacheStorage, now: new Date("2026-08-16T02:00:00.000Z") });
  assert.equal(installed.state, "AVAILABLE");
  assert.equal(installed.state === "AVAILABLE" ? installed.pack.cacheName : null, result.pack.cacheName);
  const network = await readInstalledFormalOfflineJsonAsset("fictional-park", "ROUTE_NETWORK", {
    cacheStorage,
    now: new Date("2026-08-16T02:00:00.000Z"),
  });
  assert.equal(network?.value.revision, 7);
});

test("a tampered replacement is deleted and cannot displace the previously verified active pack", async () => {
  const cacheStorage = new MemoryCacheStorage();
  const first = await signedPack(7);
  const installed = await installFormalOfflinePack("fictional-park", {
    fetcher: fetcherFor(first), cacheStorage, now: new Date("2026-08-16T01:00:00.000Z"), nonce: "install-0007",
  });
  assert.equal(installed.ok, true);
  const second = await signedPack(8);
  const rejected = await installFormalOfflinePack("fictional-park", {
    fetcher: fetcherFor(second, "VECTOR_TILES"), cacheStorage, now: new Date("2026-08-16T02:00:00.000Z"), nonce: "install-0008",
  });
  assert.deepEqual(rejected.ok ? null : rejected.code, "ASSET_REJECTED");
  const active = await readInstalledFormalOfflinePack({ cacheStorage, now: new Date("2026-08-16T02:01:00.000Z") });
  assert.equal(active.state, "AVAILABLE");
  assert.equal(active.state === "AVAILABLE" ? active.pack.packRevision : null, 7);
  assert.equal(cacheStorage.stores.has("liuzu-cloud-tour-formal-offline-v1-fictional-park-fictional-pack-8-8-install-0008"), false);
});

test("expiry and a mutated registry never yield an installed formal pack", async () => {
  const cacheStorage = new MemoryCacheStorage();
  const pack = await signedPack(7);
  await installFormalOfflinePack("fictional-park", {
    fetcher: fetcherFor(pack), cacheStorage, now: new Date("2026-08-16T01:00:00.000Z"), nonce: "install-0007",
  });
  assert.equal(
    (await readInstalledFormalOfflinePack({ cacheStorage, now: new Date("2026-08-18T00:00:00.000Z") })).state,
    "UNAVAILABLE",
  );
  const registry = await cacheStorage.open(FORMAL_OFFLINE_REGISTRY_CACHE);
  const response = await registry.match(FORMAL_OFFLINE_REGISTRY_PATH);
  const value = await response.json();
  value.networkRevision = "tampered-network";
  await registry.put(FORMAL_OFFLINE_REGISTRY_PATH, Response.json(value));
  assert.equal(
    (await readInstalledFormalOfflinePack({ cacheStorage, now: new Date("2026-08-16T02:00:00.000Z") })).state,
    "UNAVAILABLE",
  );
});

test("a fully validated cached route network and operating state can plan locally with the same deterministic engine", async () => {
  const [routeNetwork, operationalState] = await Promise.all([
    readFile(new URL("./fixtures/fictional-directed-route-network.v1.json", import.meta.url)),
    readFile(new URL("./fixtures/fictional-route-operational-state.v1.json", import.meta.url)),
  ]);
  const bytesByRole = assetBytes(9);
  bytesByRole.set("ROUTE_NETWORK", new Uint8Array(routeNetwork));
  bytesByRole.set("OPERATIONAL_STATE", new Uint8Array(operationalState));
  bytesByRole.set("MAP_STYLE", new TextEncoder().encode(JSON.stringify({
    version: 8,
    sources: { scenic: { type: "vector", url: "pmtiles:///offline-packs/fictional-park/fictional-pack-9/map.pmtiles", minzoom: 10, maxzoom: 18 } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#e8efe9" } },
      { id: "roads", type: "line", source: "scenic", "source-layer": "roads", paint: { "line-color": "#76877d", "line-width": 2 } },
    ],
  })));
  bytesByRole.set("POI_CATALOG", new TextEncoder().encode(JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", id: "poi-1", properties: { name: "虚构测试点" }, geometry: { type: "Point", coordinates: [100.002, 20] } }],
  })));
  const pack = await signedPack(9, {
    bytesByRole,
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
  });
  const cacheStorage = new MemoryCacheStorage();
  const installed = await installFormalOfflinePack("fictional-park", {
    fetcher: fetcherFor(pack), cacheStorage, now: new Date("2026-08-16T01:00:00.000Z"), nonce: "install-0009",
  });
  assert.equal(installed.ok, true);
  const snapshot = await readInstalledFormalRoutingSnapshot("fictional-park", {
    cacheStorage,
    now: new Date("2026-08-16T02:00:00.000Z"),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.networkRevision, "fictional-network-v1");
  assert.equal(snapshot.operationalVersion, 7);
  const mapBundle = await readInstalledFormalOfflineMapBundle("fictional-park", {
    cacheStorage,
    now: new Date("2026-08-16T02:00:00.000Z"),
    origin: "https://offline.example.test",
  });
  assert.ok(mapBundle);
  assert.equal(mapBundle.packId, snapshot.packId);
  assert.equal(mapBundle.packRevision, snapshot.packRevision);
  assert.equal(mapBundle.snapshotRevision, snapshot.snapshotRevision);
  assert.equal(mapBundle.networkRevision, snapshot.networkRevision);
  assert.equal(mapBundle.operationalVersion, snapshot.operationalVersion);
  assert.equal(mapBundle.style.sources.scenic.url, "pmtiles://https://offline.example.test/offline-packs/fictional-park/fictional-pack-9/map.pmtiles");
  assert.equal(mapBundle.poiCatalog.features[0].properties.name, "虚构测试点");
  const result = planDirectedRoute(snapshot.routeNetwork, snapshot.operationalState, {
    scenicAreaId: "fictional-park",
    fromNodeId: "public-origin",
    toNodeId: "destination",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
  }, new Date("2026-08-16T02:00:00.000Z"));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.plan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
});

test("offline styles are reduced to package-local PMTiles and unsafe network-bearing styles fail closed", () => {
  const vectorPath = "/offline-packs/fictional-park/pack-1/map.pmtiles";
  const style = {
    version: 8,
    sources: { scenic: { type: "vector", url: `pmtiles://${vectorPath}` } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#e8efe9" } },
      { id: "paths", type: "line", source: "scenic", "source-layer": "paths", paint: { "line-color": "#173f35" } },
      { id: "labels-removed", type: "symbol", source: "scenic", "source-layer": "labels", layout: { "text-field": ["get", "name"] } },
    ],
  };
  const safe = createSafeFormalOfflineMapStyle(style, vectorPath, "https://offline.example.test");
  assert.ok(safe);
  assert.equal(safe.sources.scenic.url, `pmtiles://https://offline.example.test${vectorPath}`);
  assert.deepEqual(safe.layers.map((layer) => layer.id), ["paper", "paths"]);

  const remote = structuredClone(style);
  remote.sources.scenic.url = "https://tiles.attacker.example/map.pmtiles";
  assert.equal(createSafeFormalOfflineMapStyle(remote, vectorPath, "https://offline.example.test"), null);
  assert.equal(createSafeFormalOfflineMapStyle({ ...style, imports: [] }, vectorPath, "https://offline.example.test"), null);
  const networkPaint = structuredClone(style);
  networkPaint.layers[1].paint["line-pattern"] = "https://attacker.example/pattern.png";
  assert.equal(createSafeFormalOfflineMapStyle(networkPaint, vectorPath, "https://offline.example.test"), null);
  const reservedLayer = structuredClone(style);
  reservedLayer.layers[1].id = "formal-route";
  assert.equal(createSafeFormalOfflineMapStyle(reservedLayer, vectorPath, "https://offline.example.test"), null);
});

test("offline POI catalogs accept bounded WGS84 points and reject non-point or out-of-range geometry", () => {
  const valid = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "虚构点" }, geometry: { type: "Point", coordinates: [100, 20] } }] };
  assert.equal(parseFormalOfflinePoiCatalog(valid)?.features.length, 1);
  const line = structuredClone(valid);
  line.features[0].geometry = { type: "LineString", coordinates: [[100, 20], [101, 21]] };
  assert.equal(parseFormalOfflinePoiCatalog(line), null);
  const outside = structuredClone(valid);
  outside.features[0].geometry.coordinates = [181, 20];
  assert.equal(parseFormalOfflinePoiCatalog(outside), null);
  const nonFiniteProperty = structuredClone(valid);
  nonFiniteProperty.features[0].properties.score = Number.POSITIVE_INFINITY;
  assert.equal(parseFormalOfflinePoiCatalog(nonFiniteProperty), null);
});
