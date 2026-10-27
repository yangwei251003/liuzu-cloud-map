import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAP_EDITOR_DRAFT_STORAGE_KEY,
  createEmptyMapEditorDraftCollection,
  createMapEditorDraft,
  mapDraftsToFeatureCollection,
  parseMapDraftGeometry,
  parseMapEditorDraftCollection,
} from "../src/lib/map-editor-draft.ts";
import {
  MAP_THEME_IDS,
  formatMapDistance,
  parseMapPoiCollection,
  parsePrototypeRouteCollection,
  searchMapCatalog,
} from "../src/lib/map-experience.ts";
import {
  FailClosedPublicRouteProvider,
  HybridLocalTileProvider,
  ValidatedManifestInternalRouteProvider,
  normalizePmtilesArchiveUrl,
} from "../src/lib/map-providers.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("仓库真实 OSM 候选点与原型路线可被游客地图严格解析", async () => {
  const [poiDocument, routeDocument] = await Promise.all([
    readFile(path.join(projectRoot, "public", "data", "gis", "pois.geojson"), "utf8"),
    readFile(path.join(projectRoot, "public", "data", "gis", "prototype-routes.geojson"), "utf8"),
  ]);
  const pois = parseMapPoiCollection(JSON.parse(poiDocument));
  const routes = parsePrototypeRouteCollection(JSON.parse(routeDocument));

  assert.ok(pois.length > 0);
  assert.ok(routes.length > 0);
  assert.ok(pois.every(({ verification, sourceUrl }) => verification === "OSM_PUBLIC_CANDIDATE" && sourceUrl.startsWith("https://www.openstreetmap.org/")));
  assert.ok(routes.every(({ status, warning }) => status === "UNVERIFIED_OSM_PROTOTYPE" && warning.includes("未现场核验")));
});

test("地图搜索同时覆盖景点与 OSM 候选点，并保持核验提示", () => {
  const spots = [{ id: "spot-1", name: "测试寺院", subtitle: "文化候选点", longitude: 112.2, latitude: 22.5, verification: "待官方核验" }];
  const pois = [{
    id: "osm-node-1",
    name: "测试停车点",
    category: "amenity",
    subtype: "parking",
    coordinates: [112.21, 22.51],
    sourceUrl: "https://www.openstreetmap.org/node/1",
    source: "OpenStreetMap contributors",
    verification: "OSM_PUBLIC_CANDIDATE",
  }];

  assert.equal(searchMapCatalog("寺院", spots, pois)[0].kind, "SCENIC_SPOT");
  assert.match(searchMapCatalog("停车", spots, pois)[0].verification, /未现场核验/);
  assert.deepEqual(MAP_THEME_IDS, ["standard", "zen", "lingnan", "night"]);
  assert.equal(formatMapDistance(850), "850 米");
  assert.equal(formatMapDistance(1_830), "1.83 公里");
  assert.equal(formatMapDistance(Number.NaN), "距离未知");
});

test("未知字段、错误来源域名与越界坐标不会进入地图目录", () => {
  const baseFeature = {
    type: "Feature",
    properties: {
      osm_type: "node",
      osm_id: 1,
      name: "测试点",
      category: "place",
      subtype: "village",
      source: "OpenStreetMap contributors",
      source_url: "https://www.openstreetmap.org/node/1",
    },
    geometry: { type: "Point", coordinates: [112.2, 22.5] },
  };
  assert.equal(parseMapPoiCollection({ type: "FeatureCollection", features: [{ ...baseFeature, geometry: { type: "Point", coordinates: [190, 22.5] } }] }).length, 0);
  assert.equal(parseMapPoiCollection({ type: "FeatureCollection", features: [{ ...baseFeature, properties: { ...baseFeature.properties, source_url: "https://example.com/node/1" } }] }).length, 0);
  assert.equal(parseMapPoiCollection({ type: "FeatureCollection", features: new Array(2_001).fill(baseFeature) }).length, 0);
});

test("公共与正式内部路由在服务缺失或清单无效时失败关闭", async () => {
  const publicProvider = new FailClosedPublicRouteProvider();
  const internalProvider = new ValidatedManifestInternalRouteProvider();
  const request = {
    scenicAreaId: "liuzu-town",
    from: { longitude: 112.2, latitude: 22.5, coordinateSystem: "WGS84" },
    to: { longitude: 112.21, latitude: 22.51, coordinateSystem: "WGS84" },
  };

  assert.equal(publicProvider.readiness().readiness, "UNAVAILABLE");
  assert.equal((await publicProvider.route(request)).route, null);
  assert.equal(internalProvider.inspectManifest({}).readiness, "UNAVAILABLE");
  assert.equal((await internalProvider.route(request, {})).route, null);
});

test("PMTiles 仅接受本地归档或 HTTPS，未配置时保留本地 GeoJSON", () => {
  const provider = new HybridLocalTileProvider();

  assert.equal(normalizePmtilesArchiveUrl("/data/gis/liuzu.pmtiles"), "/data/gis/liuzu.pmtiles");
  assert.equal(normalizePmtilesArchiveUrl("https://tiles.example.com/liuzu.pmtiles"), "https://tiles.example.com/liuzu.pmtiles");
  assert.equal(normalizePmtilesArchiveUrl("http://tiles.example.com/liuzu.pmtiles"), null);
  assert.equal(normalizePmtilesArchiveUrl("https://tiles.example.com/liuzu.json"), null);
  const fallback = provider.plan(null);
  assert.equal(fallback.readiness, "FALLBACK_GEOJSON");
  assert.equal(fallback.pmtilesArchiveUrl, null);
  assert.deepEqual(fallback.sources.map(({ id }) => id), ["buildings", "waterways", "roads", "pois", "prototype-routes"]);
  assert.notStrictEqual(provider.plan(null).sources, fallback.sources, "调用方不能取得共享可变数组");
});

test("候选草稿必须带来源、时间、WGS84 几何和未发布状态", () => {
  const now = new Date("2026-08-15T08:00:00.000Z");
  const draft = createMapEditorDraft({
    id: "draft-1",
    title: "测试入口候选",
    objectType: "ENTRANCE",
    geometry: { type: "Point", coordinates: [112.22, 22.59] },
    sourceLabel: "测试现场记录",
    sourceUrl: "https://example.com/evidence/1",
    capturedAt: new Date("2026-08-14T03:00:00.000Z"),
    notes: "仍需管理方确认",
    now,
  });

  assert.ok(draft);
  assert.equal(draft.coordinateSystem, "WGS84");
  assert.equal(draft.verificationStatus, "CANDIDATE_DRAFT");
  assert.equal(draft.publicationStatus, "LOCAL_DRAFT_ONLY");
  const collection = { ...createEmptyMapEditorDraftCollection(), drafts: [draft] };
  assert.deepEqual(parseMapEditorDraftCollection(collection), collection);
  const exported = mapDraftsToFeatureCollection(collection);
  assert.equal(exported.properties.warning, "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION");
  assert.equal(exported.features[0].properties.publicationStatus, "LOCAL_DRAFT_ONLY");
  assert.equal(MAP_EDITOR_DRAFT_STORAGE_KEY, "liuzu.map-editor-drafts.v2");
});

test("候选道路权重和景点游览属性按对象类型严格绑定", () => {
  const now = new Date("2026-08-15T08:00:00.000Z");
  const path = createMapEditorDraft({
    id: "draft-path",
    title: "虚构测试步道",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.221, 22.591]] },
    sourceLabel: "测试证据",
    capturedAt: now,
    routingAttributes: { traversalMode: "BOARDWALK", difficulty: "MODERATE", scenicScore: 70, accessibility: "UNKNOWN", walkingTimeMultiplier: 1.2 },
    now,
  });
  assert.ok(path);
  assert.equal(path.routingAttributes.traversalMode, "BOARDWALK");
  assert.equal(path.visitAttributes, null);

  const shuttle = createMapEditorDraft({
    id: "draft-shuttle",
    title: "虚构测试观光车",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.222, 22.592]] },
    sourceLabel: "测试运营证据",
    sourceUrl: "https://evidence.example.test/shuttle/geometry",
    capturedAt: now,
    routingAttributes: {
      traversalMode: "SHUTTLE",
      difficulty: "EASY",
      scenicScore: 50,
      accessibility: "VERIFIED_ACCESSIBLE",
      walkingTimeMultiplier: 1,
      transportService: {
        serviceName: "虚构测试接驳线",
        boardingMinutes: 2,
        expectedWaitMinutes: 8,
        inVehicleMinutes: 6,
        scheduleEvidenceReference: "https://evidence.example.test/shuttle/schedule",
      },
    },
    now,
  });
  assert.ok(shuttle);
  assert.equal(shuttle.routingAttributes.transportService.expectedWaitMinutes, 8);
  assert.equal(createMapEditorDraft({
    id: "draft-shuttle-without-service",
    title: "缺少班次证据的观光车",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.222, 22.592]] },
    sourceLabel: "测试运营证据",
    capturedAt: now,
    routingAttributes: { traversalMode: "SHUTTLE", difficulty: "EASY", scenicScore: 50, accessibility: "UNKNOWN", walkingTimeMultiplier: 1 },
    now,
  }), null);

  const poi = createMapEditorDraft({
    id: "draft-poi",
    title: "虚构测试景点",
    objectType: "POI",
    geometry: { type: "Point", coordinates: [112.22, 22.59] },
    sourceLabel: "测试证据",
    capturedAt: now,
    visitAttributes: { interests: ["HISTORY", "PHOTOGRAPHY"], dwellMinutes: 20, editorialPriority: 60, familyFriendly: true, restArea: false, photoSpot: true },
    now,
  });
  assert.ok(poi);
  assert.deepEqual(poi.visitAttributes.interests, ["HISTORY", "PHOTOGRAPHY"]);
  assert.equal(poi.routingAttributes, null);

  assert.equal(createMapEditorDraft({
    id: "draft-path-without-weights",
    title: "缺少权重",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.221, 22.591]] },
    sourceLabel: "测试证据",
    capturedAt: now,
    now,
  }), null);
  assert.equal(createMapEditorDraft({
    id: "draft-poi-wrong-geometry",
    title: "错误几何",
    objectType: "POI",
    geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.221, 22.591]] },
    sourceLabel: "测试证据",
    capturedAt: now,
    visitAttributes: { interests: ["NATURE"], dwellMinutes: 20, editorialPriority: 60, familyFriendly: true, restArea: false, photoSpot: true },
    now,
  }), null);
});

test("草稿解析拒绝越界/未闭合几何、HTTP 来源、未知字段和重复 ID", () => {
  assert.equal(parseMapDraftGeometry({ type: "Point", coordinates: [181, 22.5] }), null);
  assert.equal(parseMapDraftGeometry({ type: "LineString", coordinates: [[112.2, 22.5]] }), null);
  assert.equal(parseMapDraftGeometry({ type: "Polygon", coordinates: [[[112.2, 22.5], [112.3, 22.5], [112.3, 22.6], [112.2, 22.6]]] }), null);

  const now = new Date("2026-08-15T08:00:00.000Z");
  const draft = createMapEditorDraft({
    id: "draft-duplicate",
    title: "测试候选",
    objectType: "NOTE",
    geometry: { type: "Point", coordinates: [112.22, 22.59] },
    sourceLabel: "测试来源",
    capturedAt: now,
    now,
  });
  assert.ok(draft);
  assert.equal(createMapEditorDraft({
    id: "draft-http",
    title: "测试候选",
    objectType: "NOTE",
    geometry: { type: "Point", coordinates: [112.22, 22.59] },
    sourceLabel: "测试来源",
    sourceUrl: "http://example.com/evidence",
    capturedAt: now,
    now,
  }), null);
  assert.equal(parseMapEditorDraftCollection({ ...createEmptyMapEditorDraftCollection(), drafts: [draft, structuredClone(draft)] }), null);
  assert.equal(parseMapEditorDraftCollection({ ...createEmptyMapEditorDraftCollection(), trusted: true, drafts: [] }), null);
  assert.equal(createMapEditorDraft({
    id: "draft-invalid-clock",
    title: "测试候选",
    objectType: "NOTE",
    geometry: { type: "Point", coordinates: [112.22, 22.59] },
    sourceLabel: "测试来源",
    capturedAt: new Date("invalid"),
    now,
  }), null);
});
