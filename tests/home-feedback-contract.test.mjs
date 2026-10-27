import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getAmapPresentationModes } from "../src/lib/amap-modes.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("公开首页使用文字品牌并不调用未授权 Logo", async () => {
  const home = await source("src/components/HomeReferenceExperience.tsx");
  assert.doesNotMatch(home, /LIUZU_BRAND_ASSETS\.lockup\.src/);
  assert.match(home, /public-text-brand/);
  assert.doesNotMatch(home, /className=\{styles\.brandWords\}/);
});

test("Hero 使用可暂停的图片与视频宣传轮播而不是旧的单媒体组件", async () => {
  const [home, carousel, registry] = await Promise.all([
    source("src/components/HomeReferenceExperience.tsx"),
    source("src/components/ScenicPromotionCarousel.tsx"),
    source("src/lib/promotion-media.ts"),
  ]);
  assert.match(home, /<ScenicPromotionCarousel/);
  assert.doesNotMatch(home, /<HeroJourneyMedia/);
  assert.match(carousel, /data-promotion-carousel/);
  assert.match(carousel, /暂停自动轮播/);
  assert.doesNotMatch(registry, /guoen-temple-documentary\.mp4/);
  assert.match(registry, /guoen-temple-pkkj-20260527/);
  assert.doesNotMatch(registry, /AI 原创宣传画|\/assets\/promotions\//);
});

test("首页只提供五种有明确游览用途的地图外观", async () => {
  const [home, surface] = await Promise.all([
    source("src/components/HomeReferenceExperience.tsx"),
    source("src/components/DetailedMapSurface.tsx"),
  ]);
  const modes = getAmapPresentationModes();
  assert.equal(modes.length, 5);
  assert.equal(modes.filter(({ availability }) => availability === "DEMO_ONLY").length, 0);
  assert.deepEqual(modes.map(({ id }) => id), ["amap-original", "zen", "green-water", "retro", "three-d"]);
  assert.match(home, /getAmapPresentationModes\(\)/);
  assert.match(home, /HOME_AMAP_PRESENTATION_MODES\.map/);
  assert.match(home, /mode=\{effectiveMapMode\}/);
  assert.doesNotMatch(home, /demoOnlyModesEnabled/);
  assert.doesNotMatch(home, /allowPrototypeRoutePreview/);
  assert.match(home, /variant="compact"/);
  assert.match(surface, /variant === "full" \? \(\s*<AccessibleMapCatalog/);
  assert.match(home, /aria-label="首页地图风格"/);
});

test("景点栏准确披露精确实景与区域语境的区别", async () => {
  const home = await source("src/components/HomeReferenceExperience.tsx");
  assert.match(home, /getScenicSpotImage/);
  assert.match(home, /国恩寺使用开放许可实景/);
  assert.match(home, /区域环境照片不代表对应景点本体/);
  assert.match(home, /href="\/privacy"/);
});
