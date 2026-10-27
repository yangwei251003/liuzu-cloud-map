import assert from "node:assert/strict";
import test from "node:test";
import { wgs84ToGcj02 } from "../src/lib/gcj02.ts";
import { scenicSpots } from "../src/lib/scenic-data.ts";

test("本地 WGS84 转 GCJ-02 与已登记候选坐标保持近似一致", () => {
  for (const spot of scenicSpots) {
    const converted = wgs84ToGcj02([spot.longitude, spot.latitude]);
    assert.ok(Math.abs(converted[0] - spot.originalGcj02[0]) < 0.00005, `${spot.name} 经度偏差过大`);
    assert.ok(Math.abs(converted[1] - spot.originalGcj02[1]) < 0.00005, `${spot.name} 纬度偏差过大`);
  }
});

test("中国范围外坐标保持不变", () => {
  const coordinate = [-0.1276, 51.5072];
  assert.deepEqual(wgs84ToGcj02(coordinate), coordinate);
});
