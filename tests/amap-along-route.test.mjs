import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  findAmapAlongRouteRecommendations,
  sampleAmapRouteCenters,
} from "../src/lib/amap-along-route.ts";

const route = [
  [112, 22],
  [112.01, 22],
  [112.02, 22],
  [112.03, 22],
];

function poi(id, coordinate) {
  return { id, name: id, address: null, district: null, category: "风景名胜", coordinate, entranceCoordinate: null, exitCoordinate: null };
}

test("高德路线采样不发送精确起点且保持有界去重", () => {
  const centers = sampleAmapRouteCenters(route, 4);
  assert.ok(centers.length >= 2 && centers.length <= 4);
  assert.notDeepEqual(centers[0], route[0]);
  assert.deepEqual(new Set(centers.map((coordinate) => coordinate.join(","))).size, centers.length);
});

test("沿途推荐只保留走廊内、仍在前方且不是目的地的公开地点", () => {
  const recommendations = findAmapAlongRouteRecommendations({
    pois: [
      poi("already-passed", [112.004, 22]),
      poi("near-next", [112.015, 22.0007]),
      poi("near-later", [112.025, 22.0005]),
      poi("off-corridor", [112.02, 22.004]),
      poi("destination", [112.028, 22]),
    ],
    route,
    currentRouteIndex: 1,
    corridorMeters: 180,
    excludedPoiId: "destination",
  });
  assert.deepEqual(recommendations.map(({ id }) => id), ["near-next", "near-later"]);
  assert.ok(recommendations.every(({ aheadMeters, distanceToRouteMeters }) => aheadMeters > 0 && distanceToRouteMeters <= 180));
});

test("沿途接口使用高德 V5 周边搜索、服务端密钥和有界采样", async () => {
  const [service, routeSource] = await Promise.all([
    readFile(new URL("../src/lib/amap-web-service.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/map/along-route/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(service, /https:\/\/restapi\.amap\.com\/v5\/place\/around/);
  assert.match(service, /MAX_NEARBY_CENTER_COUNT = 4/);
  assert.match(service, /process\.env\.AMAP_WEB_SERVICE_KEY/);
  assert.match(service, /radius/);
  assert.match(routeSource, /searchAmapNearbyPublicPois/);
  assert.doesNotMatch(routeSource, /AMAP_WEB_SERVICE_KEY|process\.env/);
});
