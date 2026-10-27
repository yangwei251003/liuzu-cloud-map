import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalFormalOfflinePackPayload,
  parseFormalOfflinePackManifest,
  verifyFormalOfflineAssetBytes,
  verifyFormalOfflinePackManifest,
} from "../src/lib/formal-offline-pack.ts";

const generatedAt = "2026-08-16T00:00:00.000Z";
const now = new Date("2026-08-16T01:00:00.000Z");

function manifest(overrides = {}) {
  const packId = "liuzu-pack-7";
  const scenicAreaId = "liuzu-town";
  const prefix = `/offline-packs/${scenicAreaId}/${packId}`;
  return {
    schemaVersion: 1,
    packId,
    scenicAreaId,
    packRevision: 7,
    snapshotRevision: 12,
    snapshotPublishedAt: "2026-08-15T23:00:00.000Z",
    networkRevision: "network-field-v12",
    operationalVersion: 19,
    coordinateSystem: "WGS84",
    generatedAt,
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
    ...overrides,
  };
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function signedManifest(overrides = {}) {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const draft = manifest(overrides);
  const parsed = parseFormalOfflinePackManifest(draft);
  assert.ok(parsed);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(canonicalFormalOfflinePackPayload(parsed)),
  );
  draft.signature.value = toBase64Url(signature);
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { value: draft, publicKey };
}

test("a current signed formal offline manifest verifies with all mandatory asset roles", async () => {
  const signed = await signedManifest();
  const result = await verifyFormalOfflinePackManifest(signed.value, {
    publicKey: signed.publicKey,
    expectedKeyId: "field-release-key-1",
    now,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totalBytes, 515);
  assert.equal(result.manifest.assets.length, 5);
  assert.equal(result.manifest.coordinateSystem, "WGS84");
});

test("tampering, a foreign key id and expiry all fail closed", async () => {
  const signed = await signedManifest();
  const tampered = structuredClone(signed.value);
  tampered.operationalVersion += 1;
  const tamperedResult = await verifyFormalOfflinePackManifest(tampered, {
    publicKey: signed.publicKey,
    expectedKeyId: "field-release-key-1",
    now,
  });
  assert.deepEqual(tamperedResult.ok ? null : tamperedResult.code, "SIGNATURE_INVALID");

  const wrongKey = await verifyFormalOfflinePackManifest(signed.value, {
    publicKey: signed.publicKey,
    expectedKeyId: "another-release-key",
    now,
  });
  assert.deepEqual(wrongKey.ok ? null : wrongKey.code, "KEY_MISMATCH");

  const expired = await verifyFormalOfflinePackManifest(signed.value, {
    publicKey: signed.publicKey,
    expectedKeyId: "field-release-key-1",
    now: new Date("2026-08-18T00:00:00.000Z"),
  });
  assert.deepEqual(expired.ok ? null : expired.code, "MANIFEST_NOT_CURRENT");
});

test("candidate paths, missing roles and unknown fields never parse", () => {
  const candidatePath = manifest();
  candidatePath.assets[0].path = "/data/gis/route-network.json";
  assert.equal(parseFormalOfflinePackManifest(candidatePath), null);

  const missingRole = manifest({ assets: manifest().assets.filter((asset) => asset.role !== "VECTOR_TILES") });
  assert.equal(parseFormalOfflinePackManifest(missingRole), null);

  const unknown = manifest();
  unknown.unreviewed = true;
  assert.equal(parseFormalOfflinePackManifest(unknown), null);

});

test("an offline asset is accepted only when both byte length and SHA-256 match", async () => {
  const bytes = new TextEncoder().encode("verified offline route network");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const asset = {
    role: "ROUTE_NETWORK",
    path: "/offline-packs/liuzu-town/liuzu-pack-7/route-network.json",
    contentType: "application/json",
    bytes: bytes.byteLength,
    sha256: Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join(""),
    cachePolicy: "IMMUTABLE",
  };
  assert.equal(await verifyFormalOfflineAssetBytes(asset, bytes), true);
  assert.equal(await verifyFormalOfflineAssetBytes(asset, new TextEncoder().encode("tampered offline route network")), false);
});
