import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AMAP_ROUTE_SESSION_KEY,
  AMAP_ROUTE_SESSION_TTL_MS,
  readAmapRouteSession,
  saveAmapRouteSession,
} from "../src/lib/amap-route-session.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const input = {
  destinationId: "guoen-temple",
  destinationName: "国恩寺",
  destinationCoordinate: [112.228064, 22.589612],
  mode: "walk",
  savedPhase: "navigating",
  summary: { distance: 1_800, duration: 2_100 },
  steps: [
    { instruction: "向东步行", road: null, distance: 600, duration: 700 },
    { instruction: "到达国恩寺", road: "寺前路", distance: 1_200, duration: 1_400 },
  ],
  routePoints: [
    { coordinate: [112.22, 22.58], stepIndex: 0 },
    { coordinate: [112.224, 22.585], stepIndex: 0 },
    { coordinate: [112.228064, 22.589612], stepIndex: 1 },
  ],
  activeStepIndex: 0,
  routePointIndex: 1,
  remainingDistance: 900,
  remainingDuration: 1_050,
};

test("路线会话只在 30 分钟有效期内恢复", () => {
  const storage = new MemoryStorage();
  const now = new Date("2026-08-17T08:00:00.000Z");
  assert.equal(saveAmapRouteSession(storage, input, now), true);
  assert.equal(readAmapRouteSession(storage, { destinationId: input.destinationId, mode: input.mode }, new Date(now.getTime() + AMAP_ROUTE_SESSION_TTL_MS - 1))?.remainingDistance, 900);
  assert.equal(readAmapRouteSession(storage, { destinationId: input.destinationId, mode: input.mode }, new Date(now.getTime() + AMAP_ROUTE_SESSION_TTL_MS)), null);
  assert.equal(storage.getItem(AMAP_ROUTE_SESSION_KEY), null);
});

test("目的地或方式不匹配时拒绝恢复并清理旧快照", () => {
  const storage = new MemoryStorage();
  assert.equal(saveAmapRouteSession(storage, input), true);
  assert.equal(readAmapRouteSession(storage, { destinationId: "other", mode: "walk" }), null);
  assert.equal(storage.getItem(AMAP_ROUTE_SESSION_KEY), null);
});

test("站内导航接入保存、恢复、退出清理和离线坐标兜底", async () => {
  const source = await readFile(new URL("../src/components/AmapEmbeddedNavigator.tsx", import.meta.url), "utf8");
  assert.match(source, /readAmapRouteSession\(window\.sessionStorage/);
  assert.match(source, /saveAmapRouteSession\(window\.sessionStorage/);
  assert.match(source, /clearAmapRouteSession\(window\.sessionStorage\)/);
  assert.match(source, /resolve\(wgs84ToGcj02\(coordinate\)\)/);
  assert.match(source, /已恢复本标签页 30 分钟内的路线/);
  assert.match(source, /底图暂不可用/);
});
