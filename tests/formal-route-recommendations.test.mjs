import assert from "node:assert/strict";
import test from "node:test";

import { findFormalAlongRouteRecommendations } from "../src/lib/formal-route-recommendations.ts";

const plan = {
  schemaVersion: 1,
  routeFingerprint: "drp1-1234abcd",
  scenicAreaId: "fictional-area",
  networkRevision: "network-v1",
  operationalVersion: 1,
  originNodeId: "origin",
  destinationNodeId: "destination",
  profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
  optimization: "SCENIC",
  preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY"] },
  dynamicFactorsApplied: true,
  traversals: [{ kind: "EDGE", edgeId: "edge", traversalDirection: "FORWARD", fromNodeId: "origin", toNodeId: "near", distanceMeters: 500, estimatedMinutes: 7, geometry: { type: "LineString", coordinates: [[100, 20], [100.004, 20]] } }, { kind: "EDGE", edgeId: "edge-2", traversalDirection: "FORWARD", fromNodeId: "near", toNodeId: "later", distanceMeters: 400, estimatedMinutes: 6, geometry: { type: "LineString", coordinates: [[100.004, 20], [100.008, 20]] } }, { kind: "EDGE", edgeId: "edge-3", traversalDirection: "FORWARD", fromNodeId: "later", toNodeId: "destination", distanceMeters: 150, estimatedMinutes: 2, geometry: { type: "LineString", coordinates: [[100.008, 20], [100.01, 20]] } }],
  edgeIds: ["edge"],
  distanceMeters: 1_050,
  estimatedMinutes: 15,
  geometry: { type: "LineString", coordinates: [[100, 20], [100.01, 20]] },
  notices: [],
  generatedAt: "2026-08-16T00:00:00.000Z",
  expiresAt: "2026-08-16T00:15:00.000Z",
};

function node(id, longitude, overrides = {}) {
  return {
    id,
    type: "DESTINATION",
    coordinate: { longitude, latitude: 20 },
    displayName: `虚构景点 ${id}`,
    poiId: `poi-${id}`,
    visit: {
      interestTags: ["NATURE"],
      dwellMinutes: 20,
      editorialPriority: 50,
      familyFriendly: true,
      restArea: false,
      photoSpot: true,
      evidenceReference: `TEST-EVIDENCE://${id}`,
    },
    ...overrides,
  };
}

test("reviewed POIs ahead and inside the route corridor are returned in route order", () => {
  const result = findFormalAlongRouteRecommendations(plan, [
    node("later", 100.008),
    node("near", 100.004),
    node("behind", 100.001),
  ], 0.2);
  assert.deepEqual(result.map(({ nodeId }) => nodeId), ["near", "later"]);
  assert.ok(result[0].distanceAheadMeters > 150 && result[0].distanceAheadMeters < 300);
  assert.equal(result[0].evidenceReference, "TEST-EVIDENCE://near");
});

test("unreviewed, off-corridor, destination and already-passed nodes never become recommendations", () => {
  const result = findFormalAlongRouteRecommendations(plan, [
    node("no-visit", 100.006, { visit: undefined }),
    node("off-route", 100.006, { coordinate: { longitude: 100.006, latitude: 20.01 } }),
    node("destination", 100.01),
    node("passed", 100.003),
  ], 0.5);
  assert.deepEqual(result, []);
});

test("a nearby POI not present on the selected traversal chain is not presented as along-route", () => {
  assert.deepEqual(findFormalAlongRouteRecommendations(plan, [node("adjacent", 100.006)], 0), []);
  assert.deepEqual(findFormalAlongRouteRecommendations({ ...plan, traversals: [] }, [node("near", 100.004)], 0), []);
});

test("malformed geometry, progress or injected POI ids fail closed", () => {
  assert.deepEqual(findFormalAlongRouteRecommendations({ ...plan, geometry: { type: "LineString", coordinates: [[181, 20], [100, 20]] } }, [node("valid", 100.005)], 0), []);
  assert.deepEqual(findFormalAlongRouteRecommendations(plan, [node("invalid", 100.005, { poiId: "../api" })], 0), []);
  assert.deepEqual(findFormalAlongRouteRecommendations(plan, [node("valid", 100.005)], 2), []);
});
