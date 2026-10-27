import assert from "node:assert/strict";
import test from "node:test";
import {
  AMAP_DEMO_ONLY_PRESENTATION_MODES,
  AMAP_PRESENTATION_MODE_IDS,
  AMAP_PRESENTATION_MODES,
  getAmapFeatures,
  getAmapOverlayPlan,
  getAmapPresentationModes,
  getReleaseSafeAmapPresentationMode,
} from "../src/lib/amap-modes.ts";

test("游客界面只公开五种有明确游览用途的完整信息地图", () => {
  assert.deepEqual(AMAP_PRESENTATION_MODE_IDS, ["amap-original", "zen", "green-water", "retro", "three-d"]);
  assert.equal(AMAP_PRESENTATION_MODES.length, 5);
  assert.deepEqual(AMAP_PRESENTATION_MODES.map(({ name }) => name), ["标准地图", "禅意皮肤", "青山绿水", "复古国风", "3D 立体"]);
  assert.ok(AMAP_PRESENTATION_MODES.every((mode) => (
    mode.availability === "RELEASE"
    && mode.dataContract === "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY"
    && mode.overlay === "pins"
    && /街道|道路/.test(mode.disclosure)
    && /地点/.test(mode.disclosure)
  )));
  assert.equal(AMAP_PRESENTATION_MODES[0].mapStyle, "amap://styles/normal");
  assert.equal(AMAP_PRESENTATION_MODES.find(({ id }) => id === "zen")?.mapStyle, "amap://styles/whitesmoke");
  assert.equal(AMAP_PRESENTATION_MODES.find(({ id }) => id === "green-water")?.mapStyle, "amap://styles/fresh");
  assert.equal(AMAP_PRESENTATION_MODES.find(({ id }) => id === "retro")?.mapStyle, "amap://styles/light");
});

test("飞线、热力、散点和波纹只留在内部研究能力，不进入游客列表", () => {
  assert.equal(AMAP_DEMO_ONLY_PRESENTATION_MODES.length, 4);
  assert.ok(AMAP_DEMO_ONLY_PRESENTATION_MODES.every((mode) => mode.availability === "DEMO_ONLY"));
  assert.deepEqual(getAmapPresentationModes(false).map(({ id }) => id), ["amap-original", "zen", "green-water", "retro", "three-d"]);
  assert.equal(getAmapPresentationModes(true).length, 9);
  assert.equal(getReleaseSafeAmapPresentationMode("fly-lines").id, "amap-original");
  assert.equal(getReleaseSafeAmapPresentationMode("fly-lines", true).id, "fly-lines");
  assert.equal(getReleaseSafeAmapPresentationMode("not-a-mode").id, "amap-original");
});

test("四种核心艺术皮肤绑定独立位图且标准地图保持无装饰", () => {
  const modes = new Map(getAmapPresentationModes(true).map((mode) => [mode.id, mode]));
  assert.equal(modes.get("amap-original")?.artAssetPath, null);
  assert.equal(modes.get("green-water")?.artAssetPath, "/assets/map-skins/v4/green-water-atlas-v1.webp");
  assert.equal(modes.get("zen")?.artAssetPath, "/assets/map-skins/v4/zen-ink-atlas-v1.webp");
  assert.equal(modes.get("retro")?.artAssetPath, "/assets/map-skins/v4/retro-indigo-atlas-v1.webp");
  assert.equal(modes.get("three-d")?.artAssetPath, "/assets/map-skins/v4/three-d-isometric-atlas-v1.webp");
  assert.ok([...modes.values()].every((mode) => mode.artOpacity >= 0 && mode.artOpacity <= 0.72));
  assert.equal(modes.get("green-water")?.artOpacity, 0.08);
  assert.equal(modes.get("zen")?.artOpacity, 0.08);
  assert.equal(modes.get("retro")?.artOpacity, 0.12);
  assert.equal(modes.get("three-d")?.artOpacity, 0.08);
  assert.ok(AMAP_PRESENTATION_MODES.filter((mode) => mode.artAssetPath).every((mode) => /完整保留|真实坐标/.test(mode.disclosure)));
});

test("底图图层切换和全部实验叠加均不会宣称导航能力", () => {
  assert.deepEqual(getAmapFeatures({ roads: true, buildings: true, places: true, facilities: true }), ["bg", "point", "road", "building"]);
  assert.deepEqual(getAmapFeatures({ roads: false, buildings: false, places: false, facilities: false }), ["bg"]);
  for (const mode of [...AMAP_PRESENTATION_MODES, ...AMAP_DEMO_ONLY_PRESENTATION_MODES]) {
    assert.equal(getAmapOverlayPlan(mode.id, false).navigationCapable, false);
  }
  assert.equal(getAmapOverlayPlan("ripple", false).animate, true);
  assert.equal(getAmapOverlayPlan("ripple", true).animate, false);
  assert.equal(getAmapOverlayPlan("fly-lines", false).factualGeometry, false);
  assert.equal(getAmapOverlayPlan("heat", false).factualGeometry, false);
});
