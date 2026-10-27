import assert from "node:assert/strict";
import test from "node:test";

import {
  createRemoteNavigationSession,
  navigationRouteBinding,
  parseRemoteNavigationSession,
  sendRemoteNavigationEvent,
} from "../src/lib/navigation-session-client.ts";

const sessionId = "00000000-0000-4000-8000-000000000021";
const now = "2026-08-16T08:00:00.000Z";

function receipt(overrides = {}) {
  return {
    id: sessionId,
    scenicAreaId: "fictional-park",
    routeFingerprint: "drp1-1234abcd",
    optimization: "FASTEST",
    originNodeId: "entry-node",
    destinationNodeId: "waterfall-node",
    networkRevision: "network-v1",
    operationalVersion: 3,
    status: "READY",
    revision: 0,
    distanceMeters: 842.4,
    estimatedMinutes: 12.4,
    remainingDistanceBucketMeters: 850,
    startedAt: null,
    endedAt: null,
    expiresAt: "2026-08-16T10:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function plan() {
  return {
    schemaVersion: 1,
    routeFingerprint: "drp1-1234abcd",
    scenicAreaId: "fictional-park",
    networkRevision: "network-v1",
    operationalVersion: 3,
    originNodeId: "entry-node",
    destinationNodeId: "waterfall-node",
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    optimization: "FASTEST",
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY"] },
    dynamicFactorsApplied: true,
    traversals: [],
    edgeIds: ["edge-1"],
    distanceMeters: 842.4,
    estimatedMinutes: 12.4,
    geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20.001]] },
    notices: [],
    generatedAt: now,
    expiresAt: "2026-08-16T10:00:00.000Z",
  };
}

test("client receipt parser is closed and rejects hidden tracking fields", () => {
  assert.deepEqual(parseRemoteNavigationSession(receipt()), receipt());
  assert.equal(parseRemoteNavigationSession({ ...receipt(), latitude: 20 }), null);
  assert.equal(parseRemoteNavigationSession({ ...receipt(), remainingDistanceBucketMeters: 842 }), null);
});

test("route binding strips geometry, coordinates, maneuvers and location samples", () => {
  const binding = navigationRouteBinding(plan());
  assert.deepEqual(Object.keys(binding).sort(), [
    "expectedNetworkRevision", "expectedOperationalVersion", "fromNodeId", "optimization",
    "preference", "profile", "routeFingerprint", "scenicAreaId", "toNodeId",
  ].sort());
  assert.doesNotMatch(JSON.stringify(binding), /geometry|coordinate|latitude|longitude|heading|track/i);
});

test("client creates and advances a revisioned session without transmitting route geometry", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: new Headers(init.headers) });
    const responseSession = calls.length === 1
      ? receipt()
      : receipt({ status: "ACTIVE", revision: 1, startedAt: now });
    return new Response(JSON.stringify({ session: responseSession }), {
      status: calls.length === 1 ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const created = await createRemoteNavigationSession(plan());
    assert.equal(created.state, "SYNCED");
    assert.equal(calls[0].url, "/api/v1/navigation-sessions");
    assert.match(calls[0].headers.get("idempotency-key"), /^navigation-create-/);
    assert.doesNotMatch(JSON.stringify(calls[0].body), /geometry|coordinate|latitude|longitude|heading|track/i);
    if (created.state !== "SYNCED") return;
    const advanced = await sendRemoteNavigationEvent(created.session, { action: "START", remainingDistanceMeters: 850 });
    assert.equal(advanced.state, "SYNCED");
    assert.deepEqual(calls[1].body, { action: "START", remainingDistanceMeters: 850, expectedRevision: 0 });
    assert.match(calls[1].headers.get("idempotency-key"), /^navigation-event-/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
