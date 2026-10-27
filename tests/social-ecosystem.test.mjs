import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  distanceMeters,
  normalizeTags,
  validateCommentBody,
  validateDeviceLocation,
  validatePostBody,
} from "../src/lib/social/domain.ts";

const migrationUrl = new URL("../database/migrations/004_social_ecosystem.sql", import.meta.url);
const rollbackUrl = new URL("../database/rollbacks/004_social_ecosystem.sql", import.meta.url);
const communityUrl = new URL("../src/components/SocialCommunityExperience.tsx", import.meta.url);
const profileUrl = new URL("../src/components/TravelProfileExperience.tsx", import.meta.url);
const mapUrl = new URL("../src/components/DetailedMapExperience.tsx", import.meta.url);
const navUrl = new URL("../src/components/MobileTaskNav.tsx", import.meta.url);
const homeUrl = new URL("../src/components/HomeReferenceExperience.tsx", import.meta.url);
const accountUrl = new URL("../src/components/VisitorAccountCenter.tsx", import.meta.url);
const apiUrl = new URL("../src/lib/server/social-api.server.ts", import.meta.url);

test("社交数据库将内容、位置、租户、权限和审核状态绑定在同一模型中", async () => {
  const [migration, rollback] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(rollbackUrl, "utf8")]);
  for (const table of [
    "social_profiles", "place_communities", "social_media_assets", "social_posts", "social_post_media",
    "social_comments", "social_reactions", "travel_check_ins", "travel_records", "social_follows",
    "friend_relations", "travel_groups", "travel_group_members", "conversations", "social_messages",
    "official_accounts", "social_notifications", "social_reports",
  ]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /geometry_wgs84 geometry\(Point, 4326\) NOT NULL/);
  assert.match(migration, /location_source text NOT NULL CHECK \(location_source IN \('DEVICE_GPS', 'USER_CONFIRMED'\)\)/);
  assert.match(migration, /visibility text NOT NULL CHECK \(visibility IN \('PUBLIC', 'FRIENDS', 'PRIVATE'\)\)/);
  assert.match(migration, /moderation_state text NOT NULL DEFAULT 'PENDING'/);
  assert.match(migration, /cdn_url text/);
  assert.match(migration, /public_geometry_wgs84/);
  assert.match(migration, /never return in public profile or feed APIs/i);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+(?:place_communities|social_posts|travel_check_ins)/i);
  assert.match(rollback, /DROP TABLE IF EXISTS social_profiles/);
  assert.match(rollback, /DROP TABLE IF EXISTS place_communities/);
});

test("动态与打卡位置校验拒绝远距离绑定并限制文本与标签", () => {
  const community = { longitude: 112.22292, latitude: 22.592478 };
  const nearPosition = { coords: { longitude: 112.223, latitude: 22.5925, accuracy: 20 }, timestamp: Date.now() };
  const farPosition = { coords: { longitude: 113.2644, latitude: 23.1291, accuracy: 20 }, timestamp: Date.now() };
  assert.equal(validateDeviceLocation(nearPosition, community).ok, true);
  assert.equal(validateDeviceLocation(farPosition, community).ok, false);
  assert.ok(distanceMeters(community, farPosition.coords) > 5_000);
  assert.equal(validatePostBody("   ").ok, false);
  assert.equal(validatePostBody(" 一次慢慢走的旅行 ").body, "一次慢慢走的旅行");
  assert.equal(validateCommentBody(" ").ok, false);
  assert.deepEqual(normalizeTags(["#慢游", "慢游", " 文化 ", "旅行", "地图", "照片", "多余"]), ["慢游", "文化", "旅行", "地图", "照片", "多余"]);
});

test("第一阶段 UI 覆盖地点社区、GPS 发布、图片、互动、旅行档案与打卡", async () => {
  const [community, profile] = await Promise.all([readFile(communityUrl, "utf8"), readFile(profileUrl, "utf8")]);
  for (const marker of ["发布地点动态", "旅行打卡", "定位并发布", "compressSocialImage", "togglePrototypeLike", "addPrototypeComment", "好友可见", "私密记录"]) assert.match(community, new RegExp(marker));
  assert.match(community, /requestDevicePosition/);
  assert.match(community, /最多 4 张/);
  assert.match(community, /分享你的所见、攻略与旅行灵感/);
  assert.match(community, /<CommunityPrograms placeId=\{placeId\}/);
  for (const marker of ["个人旅行地图", "最近旅行记录", "精确位置不公开", "readPrototypeCheckIns"]) assert.match(profile, new RegExp(marker));
});

test("社交入口已融合全站导航与地图社交图层", async () => {
  const [map, nav, home, account] = await Promise.all([readFile(mapUrl, "utf8"), readFile(navUrl, "utf8"), readFile(homeUrl, "utf8"), readFile(accountUrl, "utf8")]);
  assert.match(nav, /label: "社区", href: "\/community"/);
  assert.match(home, /<Link href="\/community">社区<\/Link>/);
  assert.match(home, /进入地点社区/);
  assert.match(home, /href=\{`\/community\/\$\{selectedSpot\.id\}`\}/);
  assert.match(account, /href="\/community"/);
  assert.match(account, /`\/profile\/\$\{encodeURIComponent\(state\.visitor\.handle\)\}`/);
  assert.match(map, /socialLayerVisible/);
  assert.match(map, /<strong>地点社区<\/strong>/);
  assert.match(map, /进入对应地点的讨论区/);
  assert.match(map, /router\.push\(`\/community\/\$\{spotId\}`\)/);
});

test("最新版社区在正式服务、设备模式和断网之间给出明确状态", async () => {
  const community = await readFile(communityUrl, "utf8");
  assert.match(community, /正在核验社区服务/);
  assert.match(community, /审核社区服务已连接/);
  assert.match(community, /当前内容保存在这台设备/);
  assert.match(community, /当前网络不可用/);
  assert.match(community, /\/api\/v1\/social\/status/);
  assert.match(community, /controller\.abort\(\)/);
});

test("服务端社交接口只在真库、显式开关与审核链启用后开放", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /SOCIAL_API_ENABLED === "1"/);
  assert.match(source, /getSocialCapabilityStatus/);
  assert.match(source, /mode: enabled \? "REVIEWED_SERVICE" : "DEVICE_ONLY"/);
  assert.match(source, /visitorIdentityFromRequest/);
  assert.match(source, /sameOrigin/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /ST_DWithin/);
  assert.match(source, /moderation_state = 'APPROVED'/);
  assert.match(source, /precision: "COMMUNITY_CENTROID"/);
  assert.match(source, /ST_SnapToGrid/);
  assert.match(source, /post_count_24h/);
  assert.match(source, /photo_count_24h/);
  assert.match(source, /check_in_count_24h/);
  assert.match(source, /community\.verification_state = 'VERIFIED'/);
  assert.match(source, /community\.scenic_area_id = \$\{scenicAreaId\}/);
  assert.match(source, /formal_poi\.canonical_code = community\.place_id/);
  assert.match(source, /formal_poi\.verification_state = 'FIELD_VERIFIED'/);
  assert.match(source, /formal_publication\.lifecycle_state = 'PUBLISHED'/);
  assert.match(source, /formal_publication\.valid_until > CURRENT_TIMESTAMP/);
  assert.match(source, /asset\.processing_state = 'READY'/);
  assert.doesNotMatch(source, /scenicAreaId: "liuzu-town"/);
  assert.doesNotMatch(source, /process\.env\.[A-Z_]*KEY[^\n]*response/);
});
