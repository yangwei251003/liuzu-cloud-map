import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseTravelGroupMapMembers } from "../src/lib/travel-group-map-events.ts";

const member = {
  accountId: "visitor-1",
  displayName: "阿荔",
  longitude: 112.22,
  latitude: 22.69,
  distanceMeters: 128,
  direction: "东北",
};

test("同行地图事件只接受有界、可显示的最新成员位置", () => {
  assert.deepEqual(parseTravelGroupMapMembers([member]), [member]);
  assert.equal(parseTravelGroupMapMembers([{ ...member, longitude: 181 }]), null);
  assert.equal(parseTravelGroupMapMembers([{ ...member, distanceMeters: -1 }]), null);
  assert.equal(parseTravelGroupMapMembers(Array.from({ length: 33 }, (_, index) => ({ ...member, accountId: String(index) }))), null);
});

test("高德导航转换 WGS84 同行坐标并显示头像、距离和方向", async () => {
  const source = await readFile(new URL("../src/components/AmapEmbeddedNavigator.tsx", import.meta.url), "utf8");
  assert.match(source, /readTravelGroupMapMembersEvent/);
  assert.match(source, /convertGpsCoordinate\(\[member\.longitude, member\.latitude\]\)/);
  assert.match(source, /avatar\.textContent = result\.member\.displayName/);
  assert.match(source, /label\.textContent = `\$\{result\.member\.displayName\} · \$\{result\.member\.direction\} \$\{distance\}`/);
  assert.match(source, /同行 \{companions\.length\}/);
});

test("导览页与地图页各自只提供一个旅行小队控制器", async () => {
  const [formal, guide, publicPanel] = await Promise.all([
    readFile(new URL("../src/components/FormalNavigationPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/LiveGuide.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/PublicNavigationPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal((formal.match(/<TravelGroupNavigator/g) ?? []).length, 1);
  assert.match(guide, /showTravelGroupControl=\{false\}/);
  assert.match(publicPanel, /showTravelGroupControl = true/);
  assert.match(publicPanel, /showTravelGroupControl && [\s\S]*?<TravelGroupNavigator/);
});
