import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const experienceUrl = new URL("../src/components/DetailedMapExperience.tsx", import.meta.url);
const surfaceUrl = new URL("../src/components/DetailedMapSurface.tsx", import.meta.url);
const amapUrl = new URL("../src/components/AmapDetailedMap.tsx", import.meta.url);
const canvasUrl = new URL("../src/components/DetailedMapCanvas.tsx", import.meta.url);
const publicNavigationUrl = new URL("../src/components/PublicNavigationPanel.tsx", import.meta.url);
const stylesUrl = new URL("../src/app/map/map-workspace.css", import.meta.url);
const exhibitionUrl = new URL("../src/lib/amap-digital-exhibition.ts", import.meta.url);
const locaLayerUrl = new URL("../src/components/AmapDigitalExhibitionLayers.ts", import.meta.url);

test("地图工作台保留参考图的规划、图层、工具与路线时间轴区域", async () => {
  const [experience, styles] = await Promise.all([
    readFile(experienceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  for (const marker of [
    "map-tour-planner",
    "map-tour-layer-panel",
    "map-tour-map-tools",
    "map-tour-route-dock",
    "map-tour-route-timeline",
    "map-tour-mobile-quickbar",
    "map-tour-style-tray",
    "map-tour-legend-panel",
    "map-tour-panel-handle",
  ]) {
    assert.match(experience, new RegExp(marker));
    assert.match(styles, new RegExp(`\\.${marker}`));
  }
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /bottom: 3\.65rem/);
});

test("地图路线文案以游客语言说明导航与现场边界", async () => {
  const [experience, publicNavigation] = await Promise.all([
    readFile(experienceUrl, "utf8"),
    readFile(publicNavigationUrl, "utf8"),
  ]);
  for (const disclosure of ["高德地图导航", "开始导航", "进入景区后请结合现场标识", "景区内部步行请留意当天通行提示"]) {
    assert.match(`${experience}\n${publicNavigation}`, new RegExp(disclosure));
  }
  assert.match(publicNavigation, /开始导航/);
  assert.match(publicNavigation, /buildAmapExternalNavigationUrl/);
  assert.doesNotMatch(publicNavigation, /打开高德开始导航|buildAmapNavigationUrl|uri\.amap\.com\/navigation/);
  assert.doesNotMatch(experience, /预计到达时间|已正式发布|官方推荐路线/);
});

test("地图页默认高德原图并提供五种有游览用途的完整信息皮肤", async () => {
  const [experience, surface, amap, canvas] = await Promise.all([
    readFile(experienceUrl, "utf8"),
    readFile(surfaceUrl, "utf8"),
    readFile(amapUrl, "utf8"),
    readFile(canvasUrl, "utf8"),
  ]);
  assert.match(experience, /useState<AmapPresentationModeId>\("amap-original"\)/);
  assert.match(experience, /getAmapPresentationModes\(\)/);
  assert.match(experience, /map-tour-style-tray/);
  assert.match(experience, /map-tour-style-trigger/);
  assert.match(experience, /map-tour-exhibit-grid/);
  assert.match(experience, /map-tour-exhibition-status/);
  assert.match(experience, /map-tour-spot-detail/);
  assert.match(experience, /toggleFullscreen/);
  assert.match(experience, /requestFullscreen/);
  assert.match(experience, /data-planner-collapsed/);
  assert.match(experience, /data-right-panel-collapsed/);
  assert.match(experience, /data-route-dock-collapsed/);
  assert.match(experience, /MAP_PRESENTATION_MODES\.map/);
  assert.doesNotMatch(experience, /demoOnlyModesEnabled/);
  assert.doesNotMatch(experience, /allowPrototypeRoutePreview/);
  assert.match(experience, /detailed-map-workspace-title/);
  assert.doesNotMatch(experience, /forceLocal=/);
  assert.match(experience, /id="map-search"/);
  assert.match(experience, /role="tab"/);
  assert.match(surface, /data-detailed-map-variant/);
  assert.match(surface, /data-map-release-boundary/);
  assert.match(surface, /variant === "full"/);
  assert.match(surface, /aria-expanded=\{open\}/);
  assert.match(surface, /关闭地点与服务设施目录/);
  assert.doesNotMatch(surface, /<details/);
  assert.match(surface, /activateFallback/);
  assert.match(surface, /const renderLocal = forceLocal \|\| useLocalFallback/);
  assert.match(amap, /data-map-provider="amap-jsapi-v2"/);
  assert.match(amap, /data-map-art-overlay/);
  assert.match(amap, /data-map-art-geography="none"/);
  assert.match(amap, /const edgeOnlyMask = "radial-gradient/);
  assert.match(amap, /maskImage: usesTransparentOrnamentFrame \? "none" : edgeOnlyMask/);
  assert.match(amap, /map\.setFeatures\(requestedFeatures\)/);
  assert.doesNotMatch(amap, /requestedFeatures\.filter\(\(feature\) => feature !== "point"\)/);
  assert.match(amap, /艺术示意底纹 · 不对应真实地形/);
  assert.match(amap, /data-map-compact-controls/);
  assert.match(amap, /MAP_READY_TIMEOUT_MS/);
  assert.match(amap, /map\.on\("complete", handleComplete\)/);
  assert.match(amap, /map\.on\("error", handleError\)/);
  assert.match(amap, /status === "limited"/);
  assert.match(surface, /readiness: "LIMITED"/);
  const constructionStart = amap.indexOf("const map = new namespace.Map");
  const completeHandlerStart = amap.indexOf("handleComplete = () =>", constructionStart);
  const completeListener = amap.indexOf('map.on("complete", handleComplete)');
  assert.ok(constructionStart >= 0 && completeHandlerStart > constructionStart && completeListener > completeHandlerStart);
  assert.doesNotMatch(amap.slice(constructionStart, completeHandlerStart), /setStatus\("ready"\)/);
  assert.match(amap.slice(completeHandlerStart, completeListener), /setStatus\("ready"\)/);
  assert.match(amap, /visibleLayers\.places\s*\?/);
  assert.match(amap, /button\.dataset\.mode = modeId/);
  assert.match(amap, /boxShadow: selected/);
  assert.match(amap, /halo\.style/);
  assert.match(amap, /艺术风格只改变视觉表现/);
  assert.match(amap, /不改变道路、地点、文字标注或坐标/);
  assert.match(amap, /高德专题叠加暂时不可用/);
  assert.match(amap, /loadOfficialLoca/);
  assert.match(amap, /showBuildingBlock: true/);
  assert.match(amap, /onMapBlankClick/);
  assert.match(amap, /Custom scenic marker handlers stop propagation/);
  assert.doesNotMatch(amap, /if \(target && target !== map\) return/);
  assert.match(canvas, /presentationMode/);
  assert.match(canvas, /data-map-provider="maplibre-local"/);
  assert.match(canvas, /data-map-art-overlay/);
  assert.match(canvas, /data-map-art-geography="none"/);
  assert.match(experience, /高德地点与设施/);
  assert.match(experience, /水系随高德底图/);
  assert.match(experience, /景区步道暂不可用/);
});

test("数字展馆展示层独立于底图风格，且未经核验的数据不会被伪造成真实地图业务", async () => {
  const [experience, exhibition, locaLayer, styles] = await Promise.all([
    readFile(experienceUrl, "utf8"),
    readFile(exhibitionUrl, "utf8"),
    readFile(locaLayerUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(experience, /DIGITAL_EXHIBITION_DISCLOSURE/);
  assert.match(exhibition, /当前为颜色与动效演示，不代表实时客流、官方路线、主题片区、历史轨迹或开放状态/);
  assert.match(experience, /getDigitalExhibitionLayer/);
  assert.match(experience, /MOBILE_EXHIBITION_LAYERS/);
  assert.match(exhibition, /候选点位·未经现场核验/);
  assert.match(experience, /查看地点资料/);
  assert.match(styles, /map-exhibition-particle-drift/);
  assert.match(styles, /map-tour-workspace:fullscreen/);
  assert.match(styles, /data-route-dock-collapsed/);

  for (const field of ["source", "license", "capturedAt", "verification"]) {
    assert.match(exhibition, new RegExp(`${field}:`));
  }
  assert.match(exhibition, /id: "route-flow"[\s\S]*?renderableNow: false/);
  assert.match(exhibition, /id: "theme-zones"[\s\S]*?renderableNow: false/);
  assert.match(exhibition, /id: "story-replay"[\s\S]*?renderableNow: false/);
  assert.match(exhibition, /id: "comparison-columns"[\s\S]*?renderableNow: false/);
  assert.match(exhibition, /CULTURAL_RELATIONSHIP_VISUAL_DEMO/);
  assert.match(locaLayer, /Loca's own animation clock/);
  assert.match(locaLayer, /culture-links.*heat-demo/s);
  assert.doesNotMatch(locaLayer, /window\.requestAnimationFrame/);
});
