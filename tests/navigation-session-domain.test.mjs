import assert from "node:assert/strict";
import test from "node:test";

import {
  bucketNavigationDistance,
  parseNavigationSessionCreateInput,
  parseNavigationSessionEventInput,
  transitionNavigationSession,
} from "../src/lib/server/navigation-session-domain.ts";

function routeBinding(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    fromNodeId: "entry-node",
    toNodeId: "waterfall-node",
    expectedNetworkRevision: "network-v1",
    expectedOperationalVersion: 3,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    optimization: "SCENIC",
    preference: { pace: "BALANCED", maximumDifficulty: "MODERATE", allowedTraversalModes: ["WALKWAY", "BOARDWALK"] },
    routeFingerprint: "drp1-1234abcd",
    ...overrides,
  };
}

test("navigation session creation accepts only a reproducible formal route binding", () => {
  assert.deepEqual(parseNavigationSessionCreateInput(routeBinding()), routeBinding());
  assert.equal(parseNavigationSessionCreateInput({ ...routeBinding(), latitude: 20 }), null);
  assert.equal(parseNavigationSessionCreateInput({ ...routeBinding(), geometry: [[100, 20]] }), null);
  assert.equal(parseNavigationSessionCreateInput(routeBinding({ routeFingerprint: "client-route" })), null);
  assert.equal(parseNavigationSessionCreateInput(routeBinding({ expectedOperationalVersion: 0 })), null);
});

test("navigation events expose only bounded distance and closed lifecycle reasons", () => {
  assert.deepEqual(parseNavigationSessionEventInput({ action: "PAUSE", expectedRevision: 1, remainingDistanceMeters: 842.4, reasonCode: "USER_PAUSED" }), {
    action: "PAUSE", expectedRevision: 1, remainingDistanceMeters: 842.4, reasonCode: "USER_PAUSED",
  });
  assert.deepEqual(parseNavigationSessionEventInput({ action: "REROUTED", expectedRevision: 3, remainingDistanceMeters: 610, reasonCode: "ROUTE_REPLACED", route: routeBinding() })?.route, routeBinding());
  assert.equal(parseNavigationSessionEventInput({ action: "PAUSE", expectedRevision: 1, remainingDistanceMeters: 800, reasonCode: "OFF_ROUTE" }), null);
  assert.equal(parseNavigationSessionEventInput({ action: "ARRIVE", expectedRevision: 2, remainingDistanceMeters: 200, reasonCode: "ARRIVAL_CONFIRMED" }), null);
  assert.equal(parseNavigationSessionEventInput({ action: "CANCEL", expectedRevision: 2, remainingDistanceMeters: 700, reasonCode: "USER_EXIT", longitude: 100 }), null);
  assert.equal(bucketNavigationDistance(0), 0);
  assert.equal(bucketNavigationDistance(801), 850);
  assert.equal(bucketNavigationDistance(Number.NaN), null);
});

test("navigation lifecycle is deterministic and terminal states never resume", () => {
  assert.deepEqual(transitionNavigationSession("READY", "START"), { status: "ACTIVE", eventKind: "STARTED", requiresCurrentRoute: true, requiresReplacementRoute: false });
  assert.equal(transitionNavigationSession("ACTIVE", "PAUSE")?.status, "PAUSED");
  assert.equal(transitionNavigationSession("PAUSED", "RESUME")?.status, "ACTIVE");
  assert.equal(transitionNavigationSession("ACTIVE", "REROUTE_REQUIRED")?.status, "REROUTE_REQUIRED");
  assert.equal(transitionNavigationSession("REROUTE_REQUIRED", "REROUTED")?.status, "ACTIVE");
  assert.equal(transitionNavigationSession("ACTIVE", "ARRIVE")?.status, "COMPLETED");
  assert.equal(transitionNavigationSession("PAUSED", "CANCEL")?.status, "CANCELLED");
  assert.equal(transitionNavigationSession("COMPLETED", "RESUME"), null);
  assert.equal(transitionNavigationSession("CANCELLED", "START"), null);
});
