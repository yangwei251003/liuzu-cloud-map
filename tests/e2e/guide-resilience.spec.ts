import { expect, test, type Page } from "@playwright/test";
import routeNetworkFixture from "../fixtures/fictional-directed-route-network.v1.json";
import operationalStateFixture from "../fixtures/fictional-route-operational-state.v1.json";

const demoUrl = "/guide?demo=1&stops=guoen-temple,huineng-residence,longshan-spring";
const guideSessionKey = "liuzu-cloud-tour:guide-session:v1";
const accessibilityKey = "liuzu-cloud-tour:accessibility:v1";
const accessibilityEvent = "liuzu-cloud-tour:accessibility-changed";

async function expectReleaseSafeMapReady(page: Page) {
  const readyProvider = page.locator('[data-map-provider][data-map-load-status="ready"], [data-map-provider][data-map-load-status="limited"]').first();
  await expect(readyProvider).toBeVisible({ timeout: 30_000 });

  if (await readyProvider.getAttribute("data-map-load-status") === "limited") {
    await expect(readyProvider.getByRole("status")).toContainText("尚未确认完整就绪");
  }

  const provider = await readyProvider.getAttribute("data-map-provider");
  expect(["amap-jsapi-v2", "maplibre-local"]).toContain(provider);

  if (provider === "maplibre-local") {
    await expect(readyProvider.locator(".sr-only")).toContainText("不能替代现场标识或正式导航");
    await expect(page.locator('[role="status"][title*="已切换本地地图"], [role="status"]:has-text("已切换本地地图")').first()).toBeAttached();
  }

  return provider;
}

test("formal planner uses one ephemeral location match and sends only reviewed strategy inputs", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 100.00105, latitude: 20, accuracy: 20 });
  let snapshotRequests = 0;
  let replacementOperationalVersionPublished = false;
  await page.route("**/api/v1/scenic-areas/liuzu-town/snapshot", async (route) => {
    snapshotRequests += 1;
    const routeNetwork = structuredClone(routeNetworkFixture);
    routeNetwork.scenicAreaId = "liuzu-town";
    routeNetwork.revision = "field-network-v1";
    routeNetwork.review.reviewedRevision = "field-network-v1";
    const publicEntry = routeNetwork.nodes.find((node) => node.id === "public-entry");
    const destination = routeNetwork.nodes.find((node) => node.id === "destination");
    const routeRest = routeNetwork.nodes.find((node) => node.id === "junction-main");
    Object.assign(publicEntry ?? {}, { displayName: "测试入口" });
    Object.assign(destination ?? {}, { displayName: "测试目的地" });
    Object.assign(routeRest ?? {}, {
      type: "FACILITY",
      displayName: "虚构沿途休息点",
      poiId: "poi-route-rest",
      visit: { interestTags: ["NATURE", "REST"], dwellMinutes: 15, editorialPriority: 70, familyFriendly: true, restArea: true, photoSpot: true, evidenceReference: "TEST-EVIDENCE://fictional/visit/route-rest" },
    });
    const operationalState = structuredClone(operationalStateFixture);
    operationalState.scenicAreaId = "liuzu-town";
    operationalState.networkRevision = "field-network-v1";
    operationalState.operationalVersion = replacementOperationalVersionPublished ? 4 : 3;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "00000000-0000-4000-8000-000000000001",
        snapshot: {
          schemaVersion: 1,
          scenicAreaId: "liuzu-town",
          snapshotRevision: 1,
          networkRevision: "field-network-v1",
          operationalVersion: operationalState.operationalVersion,
          publishedAt: "2026-08-15T07:30:00.000Z",
          expiresAt: "2026-12-10T00:00:00.000Z",
          routeNetwork,
          operationalState,
        },
      }),
    });
  });

  let receivedBody: Record<string, unknown> | null = null;
  const routePlanBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/route-plans", async (route) => {
    receivedBody = route.request().postDataJSON() as Record<string, unknown>;
    routePlanBodies.push(receivedBody);
    const replacement = receivedBody.expectedOperationalVersion === 4;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "00000000-0000-4000-8000-000000000002",
        routePlan: {
          schemaVersion: 1,
          routeFingerprint: replacement ? "drp1-5678efab" : "drp1-1234abcd",
          scenicAreaId: "liuzu-town",
          networkRevision: "field-network-v1",
          operationalVersion: replacement ? 4 : 3,
          originNodeId: receivedBody.fromNodeId,
          destinationNodeId: receivedBody.toNodeId,
          profile: receivedBody.profile,
          optimization: receivedBody.optimization,
          preference: receivedBody.preference,
          dynamicFactorsApplied: true,
          traversals: [
            { kind: "EDGE", edgeId: "edge-main-start", traversalDirection: "FORWARD", fromNodeId: "internal-entry", toNodeId: "junction-main", distanceMeters: 430, estimatedMinutes: 9.1, geometry: { type: "LineString", coordinates: [[100.001, 20], [100.002, 20]] } },
            { kind: "EDGE", edgeId: "edge-main-finish", traversalDirection: "FORWARD", fromNodeId: "junction-main", toNodeId: "destination", distanceMeters: 430, estimatedMinutes: 9.1, geometry: { type: "LineString", coordinates: [[100.002, 20], [100.003, 20]] } },
          ],
          edgeIds: ["edge-main-start", "edge-main-finish"],
          distanceMeters: 860,
          estimatedMinutes: 18.2,
          geometry: { type: "LineString", coordinates: [[100.001, 20], [100.002, 20], [100.003, 20]] },
          notices: [],
          generatedAt: "2026-08-16T00:01:00.000Z",
          expiresAt: "2026-12-10T00:00:00.000Z",
        },
      }),
    });
  });

  const navigationSessionId = "00000000-0000-4000-8000-000000000020";
  const navigationBodies: Array<Record<string, unknown>> = [];
  let navigationRevision = 0;
  let navigationStatus = "READY";
  let navigationRouteFingerprint = "drp1-1234abcd";
  let navigationOperationalVersion = 3;
  const navigationReceipt = () => ({
    id: navigationSessionId,
    scenicAreaId: "liuzu-town",
    routeFingerprint: navigationRouteFingerprint,
    optimization: "SCENIC",
    originNodeId: "internal-entry",
    destinationNodeId: "destination",
    networkRevision: "field-network-v1",
    operationalVersion: navigationOperationalVersion,
    status: navigationStatus,
    revision: navigationRevision,
    distanceMeters: 860,
    estimatedMinutes: 18.2,
    remainingDistanceBucketMeters: 900,
    startedAt: navigationRevision > 0 ? "2026-08-16T00:02:00.000Z" : null,
    endedAt: null,
    expiresAt: "2026-12-10T00:00:00.000Z",
    createdAt: "2026-08-16T00:02:00.000Z",
    updatedAt: "2026-08-16T00:02:00.000Z",
  });
  await page.route("**/api/v1/navigation-sessions", async (route) => {
    navigationBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ session: navigationReceipt() }) });
  });
  await page.route(`**/api/v1/navigation-sessions/${navigationSessionId}/events`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    navigationBodies.push(body);
    expect(body.expectedRevision).toBe(navigationRevision);
    navigationRevision += 1;
    if (body.action === "REROUTED") {
      const replacement = body.route as { routeFingerprint: string; expectedOperationalVersion: number };
      navigationRouteFingerprint = replacement.routeFingerprint;
      navigationOperationalVersion = replacement.expectedOperationalVersion;
    }
    navigationStatus = body.action === "PAUSE" ? "PAUSED" : body.action === "REROUTE_REQUIRED" ? "REROUTE_REQUIRED" : "ACTIVE";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: navigationReceipt() }) });
  });

  let communityRequests = 0;
  await context.route("**/api/v1/social/communities/poi-route-rest/posts?limit=3&scenicAreaId=liuzu-town", async (route) => {
    communityRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        posts: [{
          id: "00000000-0000-4000-8000-000000000003",
          body: "虚构测试：树荫下有一处休息区。",
          type: "SCENERY",
          createdAt: "2026-08-16T01:00:00.000Z",
          author: { handle: "fictional-visitor", displayName: "虚构游客" },
          location: { scenicAreaId: "liuzu-town", placeId: "poi-route-rest", placeName: "虚构沿途休息点", longitude: 100.002, latitude: 20, coordinateSystem: "WGS84", precision: "COMMUNITY_CENTROID" },
          stats: { likes: 2, comments: 1 },
        }],
        nextCursor: null,
        summary: { placeId: "poi-route-rest", placeName: "虚构沿途休息点社区", windowHours: 24, postCount: 4, photoCount: 3, checkInCount: 2, generatedAt: "2026-08-16T02:00:00.000Z" },
      }),
    });
  });

  await page.goto(demoUrl);
  const planner = page.getByRole("region", { name: "正式景区内部导航" });
  await expect.poll(() => snapshotRequests).toBe(1);
  await expect(planner.getByText(/正式路网、动态状态和目的节点/)).toBeVisible();
  await expect(planner.getByText(/定位权限：已允许，进入正式路网后自动定位/)).toBeVisible();
  await expect(planner.getByText(/已匹配“路网节点 · internal-entry”.*精确坐标未保存/)).toBeVisible();
  await expect(planner.getByLabel("允许已核验索道")).not.toBeChecked();
  await expect(planner.getByLabel("允许已核验观光车")).not.toBeChecked();
  await planner.getByRole("combobox", { name: "目的地" }).selectOption("destination");
  await planner.getByRole("radio", { name: /观光/ }).click();
  await planner.getByRole("button", { name: "生成正式路线" }).click();
  await expect(planner.getByRole("heading", { name: "路线已就绪" })).toBeVisible();
  await expect(planner.getByText("860 m").first()).toBeVisible();
  await expect(planner.getByText("19 分钟").first()).toBeVisible();
  const alongRoute = planner.getByRole("region", { name: "沿途已核验推荐" });
  await expect(alongRoute.getByText("虚构沿途休息点", { exact: true })).toBeVisible();
  await expect(alongRoute.getByText(/24 小时 4 条审核动态/)).toBeVisible();
  await expect(alongRoute.getByText(/3 张审核照片/)).toBeVisible();
  const formalCommunityLink = alongRoute.getByRole("link", { name: "进入已核验地点社区" });
  await expect(formalCommunityLink).toHaveAttribute("href", "/community/poi-route-rest?source=formal&scenicAreaId=liuzu-town");
  const [formalCommunityPage] = await Promise.all([page.waitForEvent("popup"), formalCommunityLink.click()]);
  await expect(formalCommunityPage.getByRole("heading", { name: "虚构沿途休息点社区" })).toBeVisible();
  await expect(formalCommunityPage.getByLabel("过去 24 小时审核内容摘要")).toContainText("4");
  await expect(formalCommunityPage.getByText(/本页请求未包含游客当前位置/)).toBeVisible();
  await formalCommunityPage.close();
  expect(communityRequests).toBe(2);
  expect(receivedBody).toMatchObject({
    scenicAreaId: "liuzu-town",
    fromNodeId: "internal-entry",
    toNodeId: "destination",
    optimization: "SCENIC",
  });
  expect(receivedBody).not.toHaveProperty("latitude");
  expect(receivedBody).not.toHaveProperty("longitude");
  expect(receivedBody).not.toHaveProperty("edgeWeights");
  const submittedPreference = (receivedBody as unknown as { preference: { allowedTraversalModes: string[] } }).preference;
  expect(submittedPreference.allowedTraversalModes).not.toContain("CABLEWAY");
  expect(submittedPreference.allowedTraversalModes).not.toContain("SHUTTLE");

  // Refresh the simulated sensor fix immediately before the foreground watch;
  // the runtime intentionally rejects a Playwright fix older than ten seconds.
  await context.setGeolocation({ longitude: 100.001, latitude: 20, accuracy: 20 });
  await planner.getByRole("button", { name: "开始导航" }).click();
  await expect(planner.getByText("定位可靠", { exact: true })).toBeVisible();
  await expect(planner.getByRole("region", { name: "正式路线与当前位置地图" })).toBeVisible();
  await expect(planner.getByText(/定位精度圈约 20 米/)).toBeVisible();
  const formalMap = planner.locator('[data-formal-camera-mode]');
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "following");
  await formalMap.getByRole("button", { name: "查看剩余路线" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "overview");
  await expect(formalMap.getByRole("button", { name: "回到当前位置" })).toBeEnabled();
  await formalMap.getByRole("button", { name: "回到当前位置" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "following");
  await expect(planner.getByText(/导航历史：已保存路线版本与 50 米进度档位/)).toBeVisible();
  await planner.getByRole("button", { name: "暂停导航" }).click();
  await expect(planner.getByRole("button", { name: "恢复导航" })).toBeVisible();
  replacementOperationalVersionPublished = true;
  await planner.getByRole("button", { name: "恢复导航" }).click();
  await expect(planner.getByText(/已使用最新正式快照完成确定性重算并自动恢复前台导航/)).toBeVisible();
  await expect(planner.getByText(/运营版本 4/).first()).toBeVisible();
  await expect.poll(() => routePlanBodies.length).toBe(2);
  expect(routePlanBodies[1]).toMatchObject({
    fromNodeId: "internal-entry",
    toNodeId: "destination",
    expectedNetworkRevision: "field-network-v1",
    expectedOperationalVersion: 4,
    optimization: "SCENIC",
  });
  await expect.poll(() => navigationBodies.length).toBe(5);
  expect(navigationBodies.map((body) => body.action ?? "CREATE")).toEqual(["CREATE", "START", "PAUSE", "REROUTE_REQUIRED", "REROUTED"]);
  expect(navigationBodies[0]).toMatchObject({
    scenicAreaId: "liuzu-town",
    fromNodeId: "internal-entry",
    toNodeId: "destination",
    routeFingerprint: "drp1-1234abcd",
  });
  for (const body of navigationBodies) {
    expect(JSON.stringify(body)).not.toMatch(/geometry|coordinate|latitude|longitude|heading|track/i);
  }
});

test("mobile field controls stay before the map and global mute fails closed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__guideSpeechCancelCalls", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          (window as typeof window & { __guideSpeechCancelCalls: number }).__guideSpeechCancelCalls += 1;
        },
        speak() {},
      },
    });
  });

  await page.goto(demoUrl);
  const fieldBar = page.getByRole("region", { name: "手机现场操作" });
  await expect(fieldBar).toBeVisible();
  const fieldBarPrecedesMap = await fieldBar.evaluate((bar) => {
    const map = document.querySelector(".map-shell");
    return Boolean(map && (bar.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(fieldBarPrecedesMap).toBe(true);

  const cancelCallsBefore = await page.evaluate(() => (window as typeof window & { __guideSpeechCancelCalls: number }).__guideSpeechCancelCalls);
  await page.evaluate(({ key, eventName }) => {
    const preferences = { version: 1, fontScale: "default", highContrast: false, simplifiedVisuals: true, muted: true, reduceMotion: false };
    localStorage.setItem(key, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent(eventName, { detail: preferences }));
  }, { key: accessibilityKey, eventName: accessibilityEvent });
  await expect(page.getByRole("button", { name: /全局静音已开启/ })).toBeDisabled();
  // Simplified visuals do not re-enable the retired skin controls. A configured
  // build keeps the official AMap layer; a reproducible build without vendor
  // credentials must finish on the explicitly disclosed local candidate layer.
  await expectReleaseSafeMapReady(page);
  const disruptionNotice = page.locator('[data-route-disruption-action="STOP_AND_VERIFY"]');
  await expect(disruptionNotice).toHaveAttribute("data-route-disruption-code", "NETWORK_UNAVAILABLE");
  await expect(disruptionNotice).toContainText("当前没有可用的正式路网");
  await expect(disruptionNotice).toContainText("不会生成捷径");
  const cancelCallsAfter = await page.evaluate(() => (window as typeof window & { __guideSpeechCancelCalls: number }).__guideSpeechCancelCalls);
  expect(cancelCallsAfter).toBeGreaterThan(cancelCallsBefore);

  await page.getByRole("button", { name: "现场栏：开始演示导览" }).click();
  await page.getByRole("button", { name: "现场栏：暂停演示" }).click();
  await expect(page.getByRole("button", { name: "现场栏：恢复演示" })).toBeVisible();
  await page.getByRole("button", { name: "现场栏：恢复演示" }).click();
  await page.getByRole("button", { name: "现场栏：手动确认到达" }).click();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "现场栏：查看现场求助" }).click();
  await expect(page.locator("#on-site-help")).toBeFocused();
  await expect(page.getByRole("link", { name: "拨打全国通用报警电话 110" })).toHaveAttribute("href", "tel:110");
  await expect(page.getByRole("link", { name: "拨打全国通用医疗急救电话 120" })).toHaveAttribute("href", "tel:120");
});

test("demo progress, pause and explicit early terminal survive refresh", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "暂停" }).click();

  const beforeReload = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), guideSessionKey);
  expect(beforeReload).toMatchObject({ status: "PAUSED", currentIndex: 1, endReason: null });
  expect(beforeReload.revision).toBeGreaterThanOrEqual(3);

  await page.reload();
  await expect(page.getByText(/已从这台设备恢复演示进度/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();
  await expect(page.getByText("演示已暂停", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "恢复" })).toBeVisible();

  await page.getByRole("button", { name: "提前结束演示" }).click();
  await page.getByRole("button", { name: "确认提前结束" }).click();
  await expect(page.getByRole("heading", { name: "演示已提前结束" })).toBeVisible();
  await expect(page.getByText(/不代表路线完成/)).toBeVisible();
  const ended = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), guideSessionKey);
  expect(ended).toMatchObject({ status: "COMPLETED", currentIndex: 1, endReason: "ended_early" });
});

test("guide session fails closed when browser storage rejects session writes", async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(name: string, value: string) {
      if (name === key) throw new DOMException("Blocked", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, guideSessionKey);

  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await expect(page.getByText(/状态没有推进/)).toBeVisible();
  await expect(page.getByText("候选数据演示 · 等待开始", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "我已了解，仅开始演示导览" })).toBeVisible();
});

test("arrival stays on the current stop when stamp storage fails", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(name: string, value: string) {
      if (name === "liuzu-cloud-tour:journey-center:v1") throw new DOMException("Blocked", "QuotaExceededError");
      return original.call(this, name, value);
    };
  });

  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByText(/到点与印章未能一起保存.*已恢复到操作前状态/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), guideSessionKey);
  expect(session).toMatchObject({ status: "ACTIVE", currentIndex: 0 });
});

test("arrival stays on the current stop when session progress storage fails", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(name: string, value: string) {
      if (name === key) throw new DOMException("Blocked", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, guideSessionKey);

  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByText(/到点保存中断且自动恢复失败.*已停止继续推进/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), guideSessionKey);
  expect(session).toMatchObject({ status: "ACTIVE", currentIndex: 0, revision: 1 });
});

test("low-accuracy and denied location never become arrival claims", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 112.22292, latitude: 22.592478, accuracy: 250 });
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await page.getByRole("button", { name: "开启连续定位" }).click();
  await expect(page.getByText(/超过演示门限，已停止连续定位/)).toBeVisible();
  await expect(page.getByText("精度不足", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();

  const deniedPage = await context.newPage();
  await deniedPage.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          queueMicrotask(() => error({ code: 1 } as GeolocationPositionError));
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
  });
  await deniedPage.goto(demoUrl);
  await deniedPage.getByRole("button", { name: "开启连续定位" }).click();
  await expect(deniedPage.getByText(/定位权限已拒绝/)).toBeVisible();
  await expect(deniedPage.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
});

test("detailed map discovery stays keyboard-operable with a release-safe provider", async ({ page }) => {
  await page.goto("/map");
  await expectReleaseSafeMapReady(page);

  const discoveryTab = page.getByRole("tab", { name: "景点探索" });
  await discoveryTab.focus();
  await page.keyboard.press("Enter");
  await expect(discoveryTab).toHaveAttribute("aria-selected", "true");

  const search = page.locator("#map-search");
  await search.fill("国恩寺");
  const result = page.getByRole("button", { name: /国恩寺/ }).first();
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".map-tour-status")).toContainText("国恩寺");
});
