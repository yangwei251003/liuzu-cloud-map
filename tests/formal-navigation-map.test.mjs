import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createFormalNavigationAccuracyArea,
  formalNavigationMapQualityState,
} from "../src/lib/formal-navigation-map-state.ts";

const mapUrl = new URL("../src/components/FormalNavigationMap.tsx", import.meta.url);

function distanceMeters(left, right) {
  const latitudeScale = 111_320;
  const longitudeScale = Math.cos(((left[1] + right[1]) / 2) * Math.PI / 180) * latitudeScale;
  return Math.hypot((right[0] - left[0]) * longitudeScale, (right[1] - left[1]) * latitudeScale);
}

test("formal navigation accuracy area is a bounded closed WGS84 polygon", () => {
  const area = createFormalNavigationAccuracyArea({ longitude: 112.2, latitude: 22.5, accuracyMeters: 20 }, "RELIABLE");
  assert.ok(area);
  assert.equal(area.geometry.type, "Polygon");
  assert.equal(area.geometry.coordinates[0].length, 49);
  assert.deepEqual(area.geometry.coordinates[0][0], area.geometry.coordinates[0].at(-1));
  assert.equal(area.properties.qualityState, "RELIABLE");
  const radius = distanceMeters([112.2, 22.5], area.geometry.coordinates[0][0]);
  assert.ok(radius > 19.5 && radius < 20.5);
});

test("accuracy area rejects invalid or unbounded browser values and classifies quality without guessing", () => {
  assert.equal(createFormalNavigationAccuracyArea({ longitude: 112.2, latitude: 22.5, accuracyMeters: 0 }, "RELIABLE"), null);
  assert.equal(createFormalNavigationAccuracyArea({ longitude: 181, latitude: 22.5, accuracyMeters: 20 }, "RELIABLE"), null);
  assert.equal(createFormalNavigationAccuracyArea({ longitude: 112.2, latitude: 22.5, accuracyMeters: 2_001 }, "LOW_ACCURACY"), null);
  assert.equal(formalNavigationMapQualityState("RELIABLE"), "RELIABLE");
  assert.equal(formalNavigationMapQualityState("ARRIVED"), "RELIABLE");
  assert.equal(formalNavigationMapQualityState("LOW_ACCURACY"), "UNCERTAIN");
  assert.equal(formalNavigationMapQualityState("OFF_ROUTE"), "STOPPED");
  assert.equal(formalNavigationMapQualityState("WRONG_WAY"), "STOPPED");
  assert.equal(formalNavigationMapQualityState("PAUSED"), "STOPPED");
});

test("formal map renders and updates a dedicated accuracy source below the route", async () => {
  const source = await readFile(mapUrl, "utf8");
  assert.match(source, /formal-position-accuracy/);
  assert.match(source, /createFormalNavigationAccuracyArea/);
  assert.match(source, /setData\(accuracyAreaCollection/);
  assert.match(source, /定位精度圈/);
  assert.match(source, /formal-route-completed/);
  assert.match(source, /formal-route-remaining/);
  assert.match(source, /buildFormalNavigationRouteDisplay/);
  assert.match(source, /灰线已走 · 蓝线剩余/);
  assert.match(source, /data-formal-camera-mode/);
  assert.match(source, /transitionFormalNavigationCamera/);
  assert.match(source, /shouldAutoFollowFormalNavigationPosition/);
  assert.match(source, /map\.on\("dragstart", suspendAutomaticFollow\)/);
  assert.match(source, /map\.on\("zoomstart", suspendAutomaticFollow\)/);
  assert.match(source, /查看剩余路线/);
  assert.match(source, /回到当前位置/);
});
