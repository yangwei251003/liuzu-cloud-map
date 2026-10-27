import assert from "node:assert/strict";
import test from "node:test";

const { buildAmapExternalNavigationUrl } = await import("../src/lib/amap-navigation.ts");

test("外部高德导航优先使用 POI 入口坐标并尝试唤起客户端", () => {
  const href = buildAmapExternalNavigationUrl({
    name: "国恩寺",
    coordinate: [112.222, 22.592],
    entranceCoordinate: [112.223, 22.593],
  }, "walk");
  const url = new URL(href);
  assert.equal(url.origin, "https://uri.amap.com");
  assert.equal(url.pathname, "/navigation");
  assert.equal(url.searchParams.get("to"), "112.223000,22.593000,国恩寺");
  assert.equal(url.searchParams.get("mode"), "walk");
  assert.equal(url.searchParams.get("callnative"), "1");
});

test("外部高德导航对空名称和越界坐标失败关闭", () => {
  assert.equal(buildAmapExternalNavigationUrl({ name: "", coordinate: [112, 22], entranceCoordinate: null }, "car"), null);
  assert.equal(buildAmapExternalNavigationUrl({ name: "越界", coordinate: [1, 2], entranceCoordinate: null }, "car"), null);
});
