import assert from "node:assert/strict";
import test from "node:test";
import {
  formalNavigationRemainingOverviewCoordinates,
  shouldAutoFollowFormalNavigationPosition,
  transitionFormalNavigationCamera,
} from "../src/lib/formal-navigation-map-camera.ts";

test("camera enters browsing on a user gesture and only explicit controls resume following", () => {
  assert.equal(transitionFormalNavigationCamera("FOLLOWING", "USER_GESTURE"), "BROWSING");
  assert.equal(transitionFormalNavigationCamera("BROWSING", "SHOW_REMAINING"), "OVERVIEW");
  assert.equal(transitionFormalNavigationCamera("OVERVIEW", "RECENTER"), "FOLLOWING");
  assert.equal(transitionFormalNavigationCamera("BROWSING", "ROUTE_CHANGED"), "FOLLOWING");
});

test("automatic camera following requires a reliable bounded position", () => {
  const position = { longitude: 112.2, latitude: 22.5 };
  assert.equal(shouldAutoFollowFormalNavigationPosition("FOLLOWING", "RELIABLE", position), true);
  assert.equal(shouldAutoFollowFormalNavigationPosition("FOLLOWING", "ARRIVED", position), true);
  assert.equal(shouldAutoFollowFormalNavigationPosition("BROWSING", "RELIABLE", position), false);
  assert.equal(shouldAutoFollowFormalNavigationPosition("OVERVIEW", "RELIABLE", position), false);
  assert.equal(shouldAutoFollowFormalNavigationPosition("FOLLOWING", "LOW_ACCURACY", position), false);
  assert.equal(shouldAutoFollowFormalNavigationPosition("FOLLOWING", "RELIABLE", { longitude: 181, latitude: 22.5 }), false);
  assert.equal(shouldAutoFollowFormalNavigationPosition("FOLLOWING", "RELIABLE", null), false);
});

test("remaining-route overview excludes completed geometry and falls back to the destination after arrival", () => {
  const remainingRoute = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { state: "remaining" },
      geometry: { type: "LineString", coordinates: [[1, 0], [2, 0], [3, 0]] },
    }],
  };
  assert.deepEqual(
    formalNavigationRemainingOverviewCoordinates(remainingRoute, [[0, 0], [1, 0], [2, 0], [3, 0]]),
    [[1, 0], [2, 0], [3, 0]],
  );
  assert.deepEqual(
    formalNavigationRemainingOverviewCoordinates({ type: "FeatureCollection", features: [] }, [[0, 0], [3, 0]]),
    [[3, 0]],
  );
});

test("overview ignores invalid coordinates instead of sending them to the map", () => {
  const remainingRoute = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: null,
      geometry: { type: "LineString", coordinates: [[181, 0], [2, 0], [3, 0]] },
    }],
  };
  assert.deepEqual(
    formalNavigationRemainingOverviewCoordinates(remainingRoute, [[0, 0], [3, 0]]),
    [[2, 0], [3, 0]],
  );
});
