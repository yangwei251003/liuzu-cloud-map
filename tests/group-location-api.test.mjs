import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../src/lib/server/group-location-api.server.ts", import.meta.url);
const panelUrl = new URL("../src/components/TravelGroupNavigator.tsx", import.meta.url);
const mapUrl = new URL("../src/components/FormalNavigationMap.tsx", import.meta.url);

test("同行 APIs require real identity, database, explicit enablement and active membership", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /SOCIAL_API_ENABLED === "1"/);
  assert.match(source, /GROUP_LOCATION_SHARING_ENABLED === "1"/);
  assert.match(source, /visitorIdentityFromRequest/);
  assert.match(source, /sameOrigin\(request\)/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /member\.lifecycle_state = 'ACTIVE'/);
  assert.match(source, /session\.lifecycle_state = 'ACTIVE'/);
  assert.match(source, /snapshot\.expires_at > CURRENT_TIMESTAMP/);
  assert.match(source, /invite_token_hash = \$\{inviteTokenHash\}/);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)/);
});

test("location update overwrites one current point and list access is group-authorized", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /INSERT INTO group_member_location_snapshots/);
  assert.match(source, /ON CONFLICT \(share_session_id\) DO UPDATE/);
  assert.match(source, /group_member_location_snapshots\.captured_at < EXCLUDED\.captured_at/);
  assert.match(source, /WITH authorized_group AS/);
  assert.match(source, /ST_SetSRID\(ST_MakePoint/);
  assert.match(source, /parseFreshGroupLocationUpdate/);
  assert.doesNotMatch(source, /INSERT INTO group_location_share_events[\s\S]{0,250}'UPDATED'/);
});

test("traveler UI exposes explicit invite/share/stop controls and renders only fresh relative positions", async () => {
  const [panel, map] = await Promise.all([readFile(panelUrl, "utf8"), readFile(mapUrl, "utf8")]);
  for (const marker of ["创建小队", "邀请好友", "共享实时位置", "停止共享", "relativeGroupMemberLocation", "USER_STOPPED"]) {
    assert.match(panel, new RegExp(marker));
  }
  assert.match(panel, /#team-invite=/);
  assert.match(panel, /最长两分钟失效/);
  assert.match(map, /companionMarkersRef/);
  assert.match(map, /同行 \$\{companions\.length\} 人/);
});

test("all group and location route handlers are present", async () => {
  const routes = [
    "../src/app/api/v1/travel-groups/route.ts",
    "../src/app/api/v1/travel-groups/[id]/invites/route.ts",
    "../src/app/api/v1/travel-group-invites/accept/route.ts",
    "../src/app/api/v1/travel-groups/[id]/location-share/route.ts",
    "../src/app/api/v1/travel-groups/[id]/location/route.ts",
    "../src/app/api/v1/travel-groups/[id]/locations/route.ts",
  ];
  for (const route of routes) {
    const info = await stat(new URL(route, import.meta.url));
    assert.ok(info.isFile() && info.size > 0, `${route} must be a non-empty route handler`);
  }
});
