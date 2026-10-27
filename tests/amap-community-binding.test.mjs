import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchAmapPoiCommunity } from "../src/lib/amap-community-binding.ts";

function poi(name, coordinate) {
  return { id: `amap-${name}`, name, address: null, district: "新兴县", category: "风景名胜", coordinate, entranceCoordinate: null, exitCoordinate: null };
}

test("高德沿途 POI 只有名称完全一致且坐标接近时才绑定本站社区", () => {
  assert.deepEqual(matchAmapPoiCommunity(poi("国恩寺", [112.228064, 22.589612])), {
    placeId: "guoen-temple",
    placeName: "国恩寺",
    distanceMeters: 0,
  });
  assert.equal(matchAmapPoiCommunity(poi("国恩寺", [113.228064, 23.589612])), null);
  assert.equal(matchAmapPoiCommunity(poi("国恩寺游客中心", [112.228064, 22.589612])), null);
  assert.equal(matchAmapPoiCommunity(poi("藏佛坑候选区", [112.229743, 22.566404])), null);
});

test("沿途社区优先读取审核摘要，失败时显示本机动态、照片和打卡", async () => {
  const source = await readFile(new URL("../src/components/AmapAlongRouteCommunityPreview.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/v1\/social\/communities\/\$\{encodeURIComponent\(binding\.placeId\)\}\/posts/);
  assert.match(source, /parseFormalCommunityPreview/);
  assert.match(source, /readPrototypePosts/);
  assert.match(source, /readPrototypeCheckIns/);
  assert.match(source, /postCount.*photoCount.*checkInCount/s);
  assert.match(source, /打开 \{binding\.placeName\} 地点社区/);
  assert.doesNotMatch(source, /longitude=|latitude=|currentCoordinate|geolocation/);
});

test("沿途地点卡片将地图聚焦按钮与社区链接分离", async () => {
  const source = await readFile(new URL("../src/components/AmapEmbeddedNavigator.tsx", import.meta.url), "utf8");
  assert.match(source, /<article key=\{poi\.id\} role="listitem"/);
  assert.match(source, /mapRef\.current\?\.setCenter\(poi\.entranceCoordinate \?\? poi\.coordinate\)/);
  assert.match(source, /<AmapAlongRouteCommunityPreview poi=\{poi\} \/>/);
});
