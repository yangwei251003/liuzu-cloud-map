import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalFormalOfflinePackManifest,
  parseFormalOfflinePackManifest,
} from "../src/lib/formal-offline-pack.ts";
import { handleFormalOfflinePackRequest } from "../src/lib/server/formal-offline-pack-http.ts";
import { readFormalOfflinePack } from "../src/lib/server/formal-offline-pack-service.ts";

const now = new Date("2026-08-16T01:00:00.000Z");

function manifest() {
  const prefix = "/offline-packs/fictional-park/fictional-pack-7";
  return {
    schemaVersion: 1,
    packId: "fictional-pack-7",
    scenicAreaId: "fictional-park",
    packRevision: 7,
    snapshotRevision: 12,
    snapshotPublishedAt: "2026-08-15T23:00:00.000Z",
    networkRevision: "fictional-network-v12",
    operationalVersion: 19,
    coordinateSystem: "WGS84",
    generatedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-08-18T00:00:00.000Z",
    bounds: [112.18, 22.48, 112.26, 22.62],
    rights: {
      status: "CLEARED",
      evidenceReference: "https://evidence.example.test/offline-pack/rights-7",
    },
    assets: [
      { role: "ROUTE_NETWORK", path: `${prefix}/route-network.json`, contentType: "application/json", bytes: 101, sha256: "1".repeat(64), cachePolicy: "IMMUTABLE" },
      { role: "OPERATIONAL_STATE", path: `${prefix}/operational-state.json`, contentType: "application/json", bytes: 102, sha256: "2".repeat(64), cachePolicy: "IMMUTABLE" },
      { role: "POI_CATALOG", path: `${prefix}/poi-catalog.geojson`, contentType: "application/geo+json", bytes: 103, sha256: "3".repeat(64), cachePolicy: "IMMUTABLE" },
      { role: "MAP_STYLE", path: `${prefix}/style.json`, contentType: "application/json", bytes: 104, sha256: "4".repeat(64), cachePolicy: "IMMUTABLE" },
      { role: "VECTOR_TILES", path: `${prefix}/map.pmtiles`, contentType: "application/vnd.pmtiles", bytes: 105, sha256: "5".repeat(64), cachePolicy: "IMMUTABLE" },
    ],
    signature: {
      algorithm: "ECDSA_P256_SHA256",
      keyId: "field-release-key-1",
      value: "A".repeat(86),
    },
  };
}

function record(overrides = {}) {
  const value = manifest();
  const parsed = parseFormalOfflinePackManifest(value);
  assert.ok(parsed);
  return {
    scenicAreaId: parsed.scenicAreaId,
    packId: parsed.packId,
    packRevision: parsed.packRevision,
    snapshotRevision: parsed.snapshotRevision,
    snapshotPublishedAt: parsed.snapshotPublishedAt,
    networkRevision: parsed.networkRevision,
    operationalVersion: parsed.operationalVersion,
    coordinateSystem: parsed.coordinateSystem,
    generatedAt: parsed.generatedAt,
    expiresAt: parsed.expiresAt,
    rightsEvidenceReference: parsed.rights.evidenceReference,
    manifestSha256: createHash("sha256").update(canonicalFormalOfflinePackManifest(parsed), "utf8").digest("hex"),
    signatureValue: parsed.signature.value,
    totalBytes: parsed.assets.reduce((sum, asset) => sum + asset.bytes, 0),
    manifestJson: value,
    publicKeyId: parsed.signature.keyId,
    publicJwk: { kty: "EC", crv: "P-256", x: "A".repeat(43), y: "B".repeat(43), ext: false, alg: "ES256" },
    assets: parsed.assets.map((asset) => ({
      role: asset.role,
      path: asset.path,
      contentType: asset.contentType,
      bytes: asset.bytes,
      sha256: asset.sha256,
      cachePolicy: asset.cachePolicy,
    })),
    ...overrides,
  };
}

function repository(value = record()) {
  return {
    async readCurrentPublishedPack(scenicAreaId) {
      return scenicAreaId === value.scenicAreaId ? structuredClone(value) : null;
    },
  };
}

test("formal offline pack service returns only a cross-checked manifest and sanitized verification key", async () => {
  const result = await readFormalOfflinePack(repository(), "fictional-park", now);
  assert.equal(result.state, "AVAILABLE");
  if (result.state !== "AVAILABLE") return;
  assert.equal(result.envelope.manifest.packId, "fictional-pack-7");
  assert.deepEqual(result.envelope.verificationKey, {
    kty: "EC",
    crv: "P-256",
    x: "A".repeat(43),
    y: "B".repeat(43),
    ext: true,
    key_ops: ["verify"],
  });
  assert.equal(result.envelope.expectedKeyId, "field-release-key-1");
});

test("database/manifest drift, inventory drift, private JWK data and expiry all fail closed", async () => {
  const metadataDrift = await readFormalOfflinePack(repository(record({ networkRevision: "foreign-network" })), "fictional-park", now);
  assert.equal(metadataDrift.state, "FORMAL_OFFLINE_PACK_UNAVAILABLE");

  const inventory = record();
  inventory.assets[0].sha256 = "f".repeat(64);
  assert.equal((await readFormalOfflinePack(repository(inventory), "fictional-park", now)).state, "FORMAL_OFFLINE_PACK_UNAVAILABLE");

  const privateKey = record();
  privateKey.publicJwk.d = "private-material-must-not-cross-boundary";
  assert.equal((await readFormalOfflinePack(repository(privateKey), "fictional-park", now)).state, "FORMAL_OFFLINE_PACK_UNAVAILABLE");

  assert.equal(
    (await readFormalOfflinePack(repository(), "fictional-park", new Date("2026-08-18T00:00:00.000Z"))).state,
    "FORMAL_OFFLINE_PACK_UNAVAILABLE",
  );
});

test("formal offline pack API is no-store and remains disabled without the explicit capability", async () => {
  const request = new Request("https://example.test/api/v1/scenic-areas/fictional-park/offline-pack");
  const available = await handleFormalOfflinePackRequest(request, {
    repository: repository(),
    isAvailable: () => true,
  }, "fictional-park", now);
  assert.equal(available.status, 200);
  assert.equal(available.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(available.headers.get("cross-origin-resource-policy"), "same-origin");
  const body = await available.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(available.headers.get("x-request-id"), body.requestId);
  assert.equal(body.manifest.packId, "fictional-pack-7");

  const disabled = await handleFormalOfflinePackRequest(request, {
    repository: { async readCurrentPublishedPack() { throw new Error("must_not_read"); } },
    isAvailable: () => false,
  }, "fictional-park", now);
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, "FORMAL_OFFLINE_PACK_UNAVAILABLE");

  const invalid = await handleFormalOfflinePackRequest(request, {
    repository: repository(),
    isAvailable: () => true,
  }, "../candidate", now);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_SCENIC_AREA");
});

test("postgres offline-pack query retains the complete formal publication gate", async () => {
  const source = await readFile(new URL("../src/lib/server/formal-offline-pack-repository.ts", import.meta.url), "utf8");
  for (const predicate of [
    "pack.lifecycle_state = 'PUBLISHED'",
    "snapshot.lifecycle_state = 'PUBLISHED'",
    "publication.lifecycle_state = 'PUBLISHED'",
    "network.verification_state = 'FIELD_VERIFIED'",
    "route_source.license_state = 'CLEARED'",
    "operational.lifecycle_state = 'PUBLISHED'",
    "signing_key.lifecycle_state = 'ACTIVE'",
    "gis_review.review_role = 'GIS_REVIEWER'",
    "management_review.review_role = 'MANAGEMENT_APPROVER'",
    "gis_review.reviewer_subject <> management_review.reviewer_subject",
    "reviewed_manifest_sha256 = pack.manifest_sha256",
    "NOT EXISTS (",
  ]) assert.match(source, new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /SELECT\s+.*private/i);
});
