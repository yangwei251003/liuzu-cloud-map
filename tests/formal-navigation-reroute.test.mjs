import assert from "node:assert/strict";
import test from "node:test";
import { buildFormalNavigationRerouteIntent } from "../src/lib/formal-navigation-reroute.ts";

const plan = {
  schemaVersion: 1,
  routeFingerprint: "drp1-1234abcd",
  scenicAreaId: "fictional-scenic",
  networkRevision: "network-v1",
  operationalVersion: 3,
  originNodeId: "origin",
  destinationNodeId: "destination",
  profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
  optimization: "SCENIC",
  preference: { pace: "RELAXED", maximumDifficulty: "MODERATE", allowedTraversalModes: ["WALKWAY", "BOARDWALK"] },
  dynamicFactorsApplied: true,
  traversals: [],
  edgeIds: [],
  distanceMeters: 100,
  estimatedMinutes: 2,
  geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20]] },
  notices: [],
  generatedAt: "2026-08-16T00:00:00.000Z",
  expiresAt: "2026-08-16T01:00:00.000Z",
};

const nodes = [
  { id: "reroute-origin", coordinate: { longitude: 100.001, latitude: 20 } },
  { id: "destination", coordinate: { longitude: 100.003, latitude: 20 } },
];

const sample = {
  longitude: 100.00102,
  latitude: 20,
  accuracyMeters: 10,
  capturedAtMs: 10_000,
};

test("a fresh in-memory fix becomes a coordinate-free deterministic reroute request", () => {
  const result = buildFormalNavigationRerouteIntent({
    plan,
    snapshot: { networkRevision: "network-v1", operationalVersion: 3, nodes },
    sample,
    reason: "OFF_ROUTE",
    nowMs: 12_000,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.intent.request, {
    scenicAreaId: "fictional-scenic",
    fromNodeId: "reroute-origin",
    toNodeId: "destination",
    expectedNetworkRevision: "network-v1",
    expectedOperationalVersion: 3,
    profile: plan.profile,
    optimization: "SCENIC",
    preference: plan.preference,
  });
  assert.doesNotMatch(JSON.stringify(result.intent), /latitude|longitude|accuracy|captured|geometry|heading/i);
});

test("a changed operational version can reroute only against the new formal version", () => {
  const changed = buildFormalNavigationRerouteIntent({
    plan,
    snapshot: { networkRevision: "network-v1", operationalVersion: 4, nodes },
    sample,
    reason: "OPERATIONAL_VERSION_CHANGED",
    nowMs: 12_000,
  });
  assert.equal(changed.ok, true);
  if (changed.ok) assert.equal(changed.intent.request.expectedOperationalVersion, 4);

  const unchanged = buildFormalNavigationRerouteIntent({
    plan,
    snapshot: { networkRevision: "network-v1", operationalVersion: 3, nodes },
    sample,
    reason: "OPERATIONAL_VERSION_CHANGED",
    nowMs: 12_000,
  });
  assert.deepEqual(unchanged, { ok: false, code: "VERSION_NOT_CHANGED" });
});

test("stale, low-accuracy, off-network and version-drift fixes fail closed", () => {
  const base = { plan, snapshot: { networkRevision: "network-v1", operationalVersion: 3, nodes }, reason: "OFF_ROUTE" };
  assert.deepEqual(buildFormalNavigationRerouteIntent({ ...base, sample, nowMs: 20_001 }), { ok: false, code: "LOCATION_STALE" });
  assert.deepEqual(buildFormalNavigationRerouteIntent({ ...base, sample: { ...sample, accuracyMeters: 36 }, nowMs: 12_000 }), { ok: false, code: "LOCATION_LOW_ACCURACY" });
  assert.deepEqual(buildFormalNavigationRerouteIntent({ ...base, sample: { ...sample, longitude: 101 }, nowMs: 12_000 }), { ok: false, code: "NO_FORMAL_NODE_NEARBY" });
  assert.deepEqual(buildFormalNavigationRerouteIntent({ ...base, snapshot: { networkRevision: "network-v2", operationalVersion: 4, nodes }, sample, nowMs: 12_000 }), { ok: false, code: "OFF_ROUTE_VERSION_DRIFT" });
});

test("a removed or already reached destination never manufactures another route", () => {
  assert.deepEqual(buildFormalNavigationRerouteIntent({
    plan,
    snapshot: { networkRevision: "network-v2", operationalVersion: 4, nodes: nodes.slice(0, 1) },
    sample,
    reason: "NETWORK_REVISION_CHANGED",
    nowMs: 12_000,
  }), { ok: false, code: "DESTINATION_UNAVAILABLE" });

  assert.deepEqual(buildFormalNavigationRerouteIntent({
    plan,
    snapshot: { networkRevision: "network-v2", operationalVersion: 4, nodes },
    sample: { ...sample, longitude: 100.003 },
    reason: "NETWORK_REVISION_CHANGED",
    nowMs: 12_000,
  }), { ok: false, code: "DESTINATION_REACHED" });
});
