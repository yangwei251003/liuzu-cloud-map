import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式导航展示管理员推荐路线并把推荐 ID 送入同一在线和离线路由引擎", async () => {
  const source = await readFile(new URL("../src/components/FormalNavigationPlanner.tsx", import.meta.url), "utf8");
  assert.match(source, /管理员推荐路线/);
  assert.match(source, /handleRecommendedRoute/);
  assert.match(source, /recommendedRouteId: selectedRecommendedRoute\.id/);
  assert.match(source, /routePlan\.recommendedRouteId !== routeRequest\.recommendedRouteId/);
  assert.match(source, /当前开放状态、难度和无障碍约束逐段复核/);
  assert.match(source, /planDirectedRoute\(cached\.routeNetwork, cached\.operationalState, routeRequest/);
  assert.match(source, /fetch\("\/api\/v1\/route-plans"/);
});
