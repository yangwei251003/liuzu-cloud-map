import { expect, test } from "@playwright/test";
import routeNetworkFixture from "../fixtures/fictional-directed-route-network.v1.json";
import operationalStateFixture from "../fixtures/fictional-route-operational-state.v1.json";

test("confirmed off-route fixes replan without GPS upload and confirmed reverse walking warns to U-turn", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    let current = { longitude: 100.001, latitude: 20, accuracy: 10, timestamp: Date.now() };
    let watchSuccess: PositionCallback | null = null;
    let watchStarts = 0;
    let watchStops = 0;
    let controlledVisibilityState: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => controlledVisibilityState,
    });
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
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) { queueMicrotask(() => success(position())); },
        watchPosition(success: PositionCallback) { watchStarts += 1; watchSuccess = success; return 41; },
        clearWatch() { watchStops += 1; watchSuccess = null; },
      },
    });
    Object.defineProperty(window, "__emitFormalNavigationFix", {
      configurable: true,
      value(longitude: number, latitude: number, accuracy: number) {
        current = { longitude, latitude, accuracy, timestamp: Date.now() };
        watchSuccess?.(position());
      },
    });
    Object.defineProperty(window, "__formalNavigationLifecycleHarness", {
      configurable: true,
      value: {
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
          return { watchStarts, watchStops, hasWatch: watchSuccess !== null };
        },
      },
    });
  });

  const routeNetwork = structuredClone(routeNetworkFixture);
  routeNetwork.scenicAreaId = "liuzu-town";
  routeNetwork.revision = "field-network-v1";
  routeNetwork.review.reviewedRevision = "field-network-v1";
  const operationalState = structuredClone(operationalStateFixture);
  operationalState.scenicAreaId = "liuzu-town";
  operationalState.networkRevision = "field-network-v1";
  operationalState.operationalVersion = 3;
  const snapshot = {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    snapshotRevision: 1,
    networkRevision: "field-network-v1",
    operationalVersion: 3,
    publishedAt: "2026-08-15T07:30:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    routeNetwork,
    operationalState,
  };
  await page.route("**/api/v1/scenic-areas/liuzu-town/snapshot", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId: crypto.randomUUID(), snapshot }) });
  });

  const routeRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/route-plans", async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    routeRequests.push(request);
    const rerouted = request.fromNodeId === "junction-alt";
    const geometry = rerouted
      ? [[100.001, 20.001], [100.003, 20]]
      : [[100.001, 20], [100.002, 20], [100.003, 20]];
    const traversals = rerouted
      ? [{ kind: "EDGE", edgeId: "edge-accessible-alt-finish", traversalDirection: "FORWARD", fromNodeId: "junction-alt", toNodeId: "destination", distanceMeters: 250, estimatedMinutes: 6, traversalMode: "WALKWAY", transportService: null, operationalFactors: { travelTimeMultiplier: 1, crowdLevel: "LOW", weatherImpact: "NONE" }, geometry: { type: "LineString", coordinates: geometry } }]
      : [
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
          routeFingerprint: rerouted ? "drp1-5678efab" : "drp1-1234abcd",
          scenicAreaId: "liuzu-town",
          networkRevision: "field-network-v1",
          operationalVersion: 3,
          originNodeId: request.fromNodeId,
          destinationNodeId: request.toNodeId,
          profile: request.profile,
          optimization: request.optimization,
          preference: request.preference,
          dynamicFactorsApplied: true,
          traversals,
          edgeIds: traversals.map((item) => item.edgeId),
          distanceMeters: rerouted ? 250 : 220,
          estimatedMinutes: rerouted ? 6 : 4,
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

  await page.goto("/guide?demo=1&stops=guoen-temple,huineng-residence,longshan-spring");
  const planner = page.getByRole("region", { name: "正式景区内部导航" });
  await expect(planner.getByText(/已匹配“路网节点 · internal-entry”/)).toBeVisible();
  await planner.getByRole("combobox", { name: "目的地" }).selectOption("destination");
  await planner.getByRole("button", { name: "生成正式路线" }).click();
  await planner.getByRole("button", { name: "开始导航" }).click();
  await expect(planner.getByRole("button", { name: "暂停导航" })).toBeVisible();

  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(() => {
      (window as typeof window & { __emitFormalNavigationFix: (longitude: number, latitude: number, accuracy: number) => void })
        .__emitFormalNavigationFix(100.001, 20.001, 10);
    });
    await page.waitForTimeout(80);
  }

  await expect(planner.getByText(/已使用最新正式快照完成确定性重算并自动恢复前台导航/)).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(2);
  expect(routeRequests[1]).toMatchObject({
    scenicAreaId: "liuzu-town",
    fromNodeId: "junction-alt",
    toNodeId: "destination",
    expectedNetworkRevision: "field-network-v1",
    expectedOperationalVersion: 3,
  });
  const serialized = JSON.stringify(routeRequests[1]);
  expect(serialized).not.toMatch(/latitude|longitude|accuracy|captured|geometry|heading|track/i);
  await expect(planner.getByText(/路线指纹 drp1-5678efab/)).toBeVisible();

  const emitFix = async (longitude: number, latitude: number) => {
    await page.evaluate(({ nextLongitude, nextLatitude }) => {
      (window as typeof window & { __emitFormalNavigationFix: (longitude: number, latitude: number, accuracy: number) => void })
        .__emitFormalNavigationFix(nextLongitude, nextLatitude, 2);
    }, { nextLongitude: longitude, nextLatitude: latitude });
    await page.waitForTimeout(550);
  };
  await emitFix(100.001, 20.001);
  const formalMap = planner.locator('[data-formal-camera-mode]');
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "following");
  await formalMap.getByRole("button", { name: "查看剩余路线" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "overview");
  await emitFix(100.001, 20.001);
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "overview");
  await formalMap.getByRole("button", { name: "回到当前位置" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "following");
  await formalMap.getByRole("button", { name: "Zoom in" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "browsing");
  await formalMap.getByRole("button", { name: "回到当前位置" }).click();
  await expect(formalMap).toHaveAttribute("data-formal-camera-mode", "following");

  const lifecycleRegion = planner.getByRole("region", { name: "实时正式导航" });
  await expect(lifecycleRegion).toHaveAttribute("data-formal-page-lifecycle", "foreground");
  const lifecycleBeforeBackground = await page.evaluate(() => (
    window as typeof window & {
      __formalNavigationLifecycleHarness: { snapshot: () => { watchStarts: number; watchStops: number; hasWatch: boolean } };
    }
  ).__formalNavigationLifecycleHarness.snapshot());
  expect(lifecycleBeforeBackground.hasWatch).toBe(true);
  await page.evaluate(() => (
    window as typeof window & { __formalNavigationLifecycleHarness: { background: () => void } }
  ).__formalNavigationLifecycleHarness.background());
  await expect(lifecycleRegion).toHaveAttribute("data-formal-page-lifecycle", "background");
  await expect(planner.getByRole("heading", { name: "导航已暂停" })).toBeVisible();
  await expect(planner.getByText(/连续定位已经停止.*最近定位样本已清除/)).toBeVisible();
  await expect(planner.getByRole("button", { name: "等待回到前台" })).toBeDisabled();
  const lifecycleInBackground = await page.evaluate(() => (
    window as typeof window & {
      __formalNavigationLifecycleHarness: { snapshot: () => { watchStarts: number; watchStops: number; hasWatch: boolean } };
    }
  ).__formalNavigationLifecycleHarness.snapshot());
  expect(lifecycleInBackground.hasWatch).toBe(false);
  expect(lifecycleInBackground.watchStops).toBe(lifecycleBeforeBackground.watchStops + 1);

  await page.evaluate(() => (
    window as typeof window & { __formalNavigationLifecycleHarness: { foreground: () => void } }
  ).__formalNavigationLifecycleHarness.foreground());
  await expect(lifecycleRegion).toHaveAttribute("data-formal-page-lifecycle", "ready-to-resume");
  await expect(planner.getByText(/前台状态已核验，请确认恢复导航/)).toBeVisible();
  await expect(planner.getByText(/不会自动恢复/)).toBeVisible();
  const lifecycleReady = await page.evaluate(() => (
    window as typeof window & {
      __formalNavigationLifecycleHarness: { snapshot: () => { watchStarts: number; watchStops: number; hasWatch: boolean } };
    }
  ).__formalNavigationLifecycleHarness.snapshot());
  expect(lifecycleReady.hasWatch).toBe(false);
  await planner.getByRole("button", { name: "确认恢复导航" }).click();
  await expect(lifecycleRegion).toHaveAttribute("data-formal-page-lifecycle", "foreground");
  await expect(planner.getByRole("button", { name: "暂停导航" })).toBeVisible();
  const lifecycleAfterResume = await page.evaluate(() => (
    window as typeof window & {
      __formalNavigationLifecycleHarness: { snapshot: () => { watchStarts: number; watchStops: number; hasWatch: boolean } };
    }
  ).__formalNavigationLifecycleHarness.snapshot());
  expect(lifecycleAfterResume.hasWatch).toBe(true);
  expect(lifecycleAfterResume.watchStarts).toBe(lifecycleBeforeBackground.watchStarts + 1);

  for (const routeFraction of [0.02, 0.04, 0.06, 0.08, 0.1, 0.12]) {
    await emitFix(100.001 + 0.002 * routeFraction, 20.001 - 0.001 * routeFraction);
  }
  for (const routeFraction of [0.1, 0.08, 0.06, 0.04, 0.02, 0, 0]) {
    await emitFix(100.001 + 0.002 * routeFraction, 20.001 - 0.001 * routeFraction);
  }

  await expect(planner.getByText("已确认反向行走", { exact: true })).toBeVisible();
  await expect(planner.getByText(/请在安全位置掉头并返回当前路线/)).toBeVisible();
  await expect(planner.locator('[data-formal-route-progress="matched"]')).toBeVisible();
  await expect(planner.getByText(/灰线已走 · 蓝线剩余/)).toBeVisible();
  await expect.poll(() => routeRequests.length).toBe(2);

  await planner.getByRole("button", { name: "暂停导航" }).click();
  await expect(planner.getByRole("heading", { name: "导航已暂停" })).toBeVisible();
  await expect(planner.locator('[data-formal-route-progress="matched"]')).toBeVisible();
  await planner.getByRole("button", { name: "恢复导航" }).click();
  await expect(planner.getByRole("heading", { name: "正在等待可靠定位" })).toBeVisible();
  await expect(planner.locator('[data-formal-route-progress="matched"]')).toBeVisible();
});
