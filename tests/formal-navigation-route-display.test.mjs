import assert from "node:assert/strict";
import test from "node:test";
import { buildFormalNavigationRouteDisplay } from "../src/lib/formal-navigation-route-display.ts";

function plan(overrides = {}) {
  return {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0], [1, 1]] },
    traversals: [],
    ...overrides,
  };
}

test("route display splits completed and remaining geometry at the exact matched segment fraction", () => {
  const display = buildFormalNavigationRouteDisplay(plan(), { segmentIndex: 0, segmentFraction: 0.5 });
  assert.equal(display.matchApplied, true);
  assert.deepEqual(display.completedRoute.features[0]?.geometry.coordinates, [[0, 0], [0.5, 0]]);
  assert.deepEqual(display.remainingRoute.features[0]?.geometry.coordinates, [[0.5, 0], [1, 0], [1, 1]]);
  assert.deepEqual(display.matchedCoordinate, [0.5, 0]);
});

test("route display removes the remaining highlight only at the exact destination", () => {
  const display = buildFormalNavigationRouteDisplay(plan(), { segmentIndex: 1, segmentFraction: 1 });
  assert.equal(display.matchApplied, true);
  assert.deepEqual(display.completedRoute.features[0]?.geometry.coordinates, [[0, 0], [1, 0], [1, 1]]);
  assert.equal(display.remainingRoute.features.length, 0);
  assert.deepEqual(display.matchedCoordinate, [1, 1]);
});

test("invalid route matches fail safely to a full remaining route and no completed-route claim", () => {
  const display = buildFormalNavigationRouteDisplay(plan(), { segmentIndex: 9, segmentFraction: 0.5 });
  assert.equal(display.matchApplied, false);
  assert.equal(display.completedRoute.features.length, 0);
  assert.deepEqual(display.remainingRoute.features[0]?.geometry.coordinates, [[0, 0], [1, 0], [1, 1]]);
  assert.equal(display.matchedCoordinate, null);
});

test("remaining transport overlays are clipped at the current transport segment and omit passed service legs", () => {
  const display = buildFormalNavigationRouteDisplay(plan({
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    traversals: [
      { kind: "EDGE", traversalMode: "WALKWAY", geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] } },
      { kind: "EDGE", traversalMode: "CABLEWAY", transportService: { serviceName: "测试索道" }, geometry: { type: "LineString", coordinates: [[1, 0], [2, 0]] } },
      { kind: "EDGE", traversalMode: "SHUTTLE", transportService: { serviceName: "测试观光车" }, geometry: { type: "LineString", coordinates: [[2, 0], [3, 0]] } },
    ],
  }), { segmentIndex: 1, segmentFraction: 0.5 });

  assert.equal(display.remainingTransportRoute.features.length, 2);
  assert.deepEqual(display.remainingTransportRoute.features[0].geometry.coordinates, [[1.5, 0], [2, 0]]);
  assert.deepEqual(display.remainingTransportRoute.features[1].geometry.coordinates, [[2, 0], [3, 0]]);
  assert.deepEqual(display.remainingTransportRoute.features.map((feature) => feature.properties?.traversalMode), ["CABLEWAY", "SHUTTLE"]);
});

test("transport overlays disappear instead of making a remaining-leg claim when traversal topology drifts", () => {
  const display = buildFormalNavigationRouteDisplay(plan({
    traversals: [
      { kind: "EDGE", traversalMode: "CABLEWAY", transportService: { serviceName: "测试索道" }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] } },
    ],
  }), { segmentIndex: 0, segmentFraction: 0.5 });

  assert.equal(display.matchApplied, true);
  assert.equal(display.remainingTransportRoute.features.length, 0);
});
