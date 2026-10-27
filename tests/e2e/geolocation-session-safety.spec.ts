import { expect, test } from "@playwright/test";
import routeNetworkFixture from "../fixtures/fictional-directed-route-network.v1.json";
import operationalStateFixture from "../fixtures/fictional-route-operational-state.v1.json";

test("permission revocation pauses formal navigation and background or permission loss stops group sharing", async ({ page }) => {
  await page.addInitScript(() => {
    let permissionState: PermissionState = "granted";
    let controlledVisibilityState: DocumentVisibilityState = "visible";
    let current = { longitude: 100.001, latitude: 20, accuracy: 5, timestamp: Date.now() };
    let nextWatchId = 70;
    let oneShots = 0;
    let watchStarts = 0;
    let watchStops = 0;
    const watches = new Map<number, PositionCallback>();
    const permissionListeners = new Set<EventListenerOrEventListenerObject>();
    const position = () => ({
      coords: {
        longitude: current.longitude,
        latitude: current.latitude,
        accuracy: current.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON() { return {}; },
      },
      timestamp: current.timestamp,
      toJSON() { return {}; },
    } as GeolocationPosition);
    const permissionStatus = {
      get state() { return permissionState; },
      name: "geolocation",
      onchange: null,
      addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        permissionListeners.add(listener);
      },
      removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
        permissionListeners.delete(listener);
      },
      dispatchEvent() { return true; },
    } as PermissionStatus;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => controlledVisibilityState,
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => permissionStatus },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          oneShots += 1;
          queueMicrotask(() => success(position()));
        },
        watchPosition(success: PositionCallback) {
          const id = nextWatchId;
          nextWatchId += 1;
          watchStarts += 1;
          watches.set(id, success);
          return id;
        },
        clearWatch(id: number) {
          if (watches.delete(id)) watchStops += 1;
        },
      },
    });
    Object.defineProperty(window, "__geolocationSessionHarness", {
      configurable: true,
      value: {
        emit(longitude: number, latitude: number, accuracy: number) {
          current = { longitude, latitude, accuracy, timestamp: Date.now() };
          for (const success of [...watches.values()]) success(position());
        },
        permission(next: PermissionState) {
          permissionState = next;
          const event = new Event("change");
          for (const listener of [...permissionListeners]) {
            if (typeof listener === "function") listener(event);
            else listener.handleEvent(event);
          }
        },
        background() {
          controlledVisibilityState = "hidden";
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
          document.dispatchEvent(new Event("freeze"));
        },
        foreground() {
          controlledVisibilityState = "visible";
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
          document.dispatchEvent(new Event("resume"));
        },
        snapshot() {
          return { oneShots, watchStarts, watchStops, activeWatches: watches.size, permissionState };
        },
      },
    });
  });

  const routeNetwork = structuredClone(routeNetworkFixture);
  routeNetwork.scenicAreaId = "liuzu-town";
  routeNetwork.revision = "permission-network-v1";
  routeNetwork.review.reviewedRevision = "permission-network-v1";
  const operationalState = structuredClone(operationalStateFixture);
  operationalState.scenicAreaId = "liuzu-town";
  operationalState.networkRevision = "permission-network-v1";
  operationalState.operationalVersion = 5;
  const snapshot = {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    snapshotRevision: 1,
    networkRevision: "permission-network-v1",
    operationalVersion: 5,
    publishedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    routeNetwork,
    operationalState,
  };
  let routePlanRequests = 0;
  const groupShareActions: string[] = [];
  let groupPositionWrites = 0;

  await page.route("**/api/v1/scenic-areas/liuzu-town/snapshot", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId: crypto.randomUUID(), snapshot }) });
  });
  await page.route("**/api/v1/route-plans", async (route) => {
    routePlanRequests += 1;
    const request = route.request().postDataJSON() as Record<string, unknown>;
    const geometry = [[100.001, 20], [100.002, 20], [100.003, 20]];
    const traversals = [
      { kind: "EDGE", edgeId: "edge-main-start", traversalDirection: "FORWARD", fromNodeId: "internal-entry", toNodeId: "junction-main", distanceMeters: 110, estimatedMinutes: 2, traversalMode: "WALKWAY", transportService: null, operationalFactors: { travelTimeMultiplier: 1, crowdLevel: "LOW", weatherImpact: "NONE" }, geometry: { type: "LineString", coordinates: geometry.slice(0, 2) } },
      { kind: "EDGE", edgeId: "edge-main-finish", traversalDirection: "FORWARD", fromNodeId: "junction-main", toNodeId: "destination", distanceMeters: 110, estimatedMinutes: 2, traversalMode: "WALKWAY", transportService: null, operationalFactors: { travelTimeMultiplier: 1, crowdLevel: "LOW", weatherImpact: "NONE" }, geometry: { type: "LineString", coordinates: geometry.slice(1) } },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        routePlan: {
          schemaVersion: 1,
          routeFingerprint: "drp1-b20ca11e",
          scenicAreaId: "liuzu-town",
          networkRevision: "permission-network-v1",
          operationalVersion: 5,
          originNodeId: request.fromNodeId,
          destinationNodeId: request.toNodeId,
          profile: request.profile,
          optimization: request.optimization,
          preference: request.preference,
          dynamicFactorsApplied: false,
          traversals,
          edgeIds: traversals.map((item) => item.edgeId),
          distanceMeters: 220,
          estimatedMinutes: 4,
          geometry: { type: "LineString", coordinates: geometry },
          notices: [],
          generatedAt: new Date().toISOString(),
          expiresAt: "2026-12-10T00:00:00.000Z",
        },
      }),
    });
  });
  await page.route("**/api/v1/navigation-sessions**", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTH_REQUIRED" } }) });
  });
  await page.route("**/api/v1/travel-groups", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ group: { id: "group-permission-test" } }) });
  });
  await page.route("**/api/v1/travel-groups/group-permission-test/location-share", async (route) => {
    const body = route.request().postDataJSON() as { action?: string };
    groupShareActions.push(body.action ?? "UNKNOWN");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/v1/travel-groups/group-permission-test/location", async (route) => {
    groupPositionWrites += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/v1/travel-groups/group-permission-test/locations", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ members: [] }) });
  });

  await page.goto("/guide?demo=1&stops=guoen-temple,huineng-residence,longshan-spring");
  const planner = page.getByRole("region", { name: "正式景区内部导航" });
  await expect(planner.getByText(/已匹配“路网节点 · internal-entry”/)).toBeVisible();
  await planner.getByRole("combobox", { name: "目的地" }).selectOption("destination");
  await planner.getByRole("button", { name: "生成正式路线" }).click();
  const navigation = planner.getByRole("region", { name: "实时正式导航" });
  await planner.getByRole("button", { name: "开始导航" }).click();
  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__geolocationSessionHarness.emit(100.001, 20, 5));
  await expect(navigation.getByText("定位可靠", { exact: true })).toBeVisible();
  await expect(navigation.getByText(/定位精度圈约 5 米/)).toBeVisible();

  const beforeRevoke = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { oneShots: number; watchStarts: number; watchStops: number; activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(beforeRevoke.oneShots).toBe(1);
  expect(beforeRevoke.activeWatches).toBe(1);

  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { permission: (state: PermissionState) => void } }
  ).__geolocationSessionHarness.permission("denied"));
  await expect(navigation.getByText("导航已暂停")).toBeVisible();
  await expect(navigation.getByText(/定位权限已撤回/)).toBeVisible();
  await expect(navigation.getByText("等待前台定位")).toBeVisible();
  await expect(planner.getByRole("button", { name: "等待重新允许定位" })).toBeDisabled();
  const afterRevoke = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { oneShots: number; watchStarts: number; watchStops: number; activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(afterRevoke.activeWatches).toBe(0);
  expect(afterRevoke.watchStops).toBeGreaterThan(beforeRevoke.watchStops);

  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { permission: (state: PermissionState) => void } }
  ).__geolocationSessionHarness.permission("granted"));
  await expect(planner.getByRole("button", { name: "恢复导航" })).toBeEnabled();
  const afterRegrant = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { oneShots: number; watchStarts: number; watchStops: number; activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(afterRegrant.oneShots).toBe(1);
  expect(routePlanRequests).toBe(1);
  expect(afterRegrant.activeWatches).toBe(0);

  await planner.getByRole("button", { name: "恢复导航" }).click();
  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__geolocationSessionHarness.emit(100.0011, 20, 5));
  await expect(navigation.getByText("定位可靠", { exact: true })).toBeVisible();
  await planner.getByRole("button", { name: "暂停导航" }).click();

  const group = planner.getByText("好友同行导航");
  await group.click();
  await planner.getByRole("button", { name: "创建小队" }).click();
  await planner.getByRole("button", { name: "共享实时位置" }).click();
  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__geolocationSessionHarness.emit(100.0012, 20, 5));
  await expect.poll(() => groupPositionWrites).toBe(1);
  await expect(planner.getByRole("button", { name: "停止共享" })).toBeVisible();
  const beforeBackground = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { watchStarts: number; activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(beforeBackground.activeWatches).toBe(1);

  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { background: () => void } }
  ).__geolocationSessionHarness.background());
  await expect.poll(() => groupShareActions.filter((action) => action === "STOP").length).toBe(1);
  await expect(planner.getByRole("button", { name: "共享实时位置" })).toBeVisible();
  const afterBackground = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { watchStarts: number; activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(afterBackground.activeWatches).toBe(0);

  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { foreground: () => void } }
  ).__geolocationSessionHarness.foreground());
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { watchStarts: number } } }
  ).__geolocationSessionHarness.snapshot())).watchStarts).toBe(beforeBackground.watchStarts);

  await planner.getByRole("button", { name: "共享实时位置" }).click();
  await expect(planner.getByRole("button", { name: "停止共享" })).toBeVisible();
  await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { permission: (state: PermissionState) => void } }
  ).__geolocationSessionHarness.permission("denied"));
  await expect.poll(() => groupShareActions.filter((action) => action === "STOP").length).toBe(2);
  await expect(planner.getByRole("button", { name: "共享实时位置" })).toBeVisible();
  await expect(planner.getByText(/定位权限已撤回，同行位置共享已停止/)).toBeVisible();
  const finalHarness = await page.evaluate(() => (
    window as typeof window & { __geolocationSessionHarness: { snapshot: () => { activeWatches: number } } }
  ).__geolocationSessionHarness.snapshot());
  expect(finalHarness.activeWatches).toBe(0);
  expect(routePlanRequests).toBe(1);
});
