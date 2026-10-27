import { expect, test } from "@playwright/test";
import routeNetworkFixture from "../fixtures/fictional-directed-route-network.v1.json";
import operationalStateFixture from "../fixtures/fictional-route-operational-state.v1.json";

test("formal foreground voice deduplicates route prompts and cancels on background, degraded GPS and global mute", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await page.addInitScript(() => {
    let current = { longitude: 100.001, latitude: 20, accuracy: 5, timestamp: Date.now() };
    let watchSuccess: PositionCallback | null = null;
    let controlledVisibilityState: DocumentVisibilityState = "visible";
    let activeText: string | null = null;
    const spoken: string[] = [];
    let cancels = 0;
    let resumes = 0;
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
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => controlledVisibilityState,
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) { queueMicrotask(() => success(position())); },
        watchPosition(success: PositionCallback) { watchSuccess = success; return 51; },
        clearWatch() { watchSuccess = null; },
      },
    });
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      onpause = null;
      onresume = null;
      onmark = null;
      onboundary = null;
      constructor(text: string) { this.text = text; }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        pending: false,
        speaking: false,
        paused: false,
        onvoiceschanged: null,
        getVoices() {
          return [{ default: true, lang: "zh-CN", localService: true, name: "测试中文语音", voiceURI: "mock-zh" }];
        },
        speak(utterance: MockSpeechSynthesisUtterance) {
          activeText = utterance.text;
          spoken.push(utterance.text);
          utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
        },
        cancel() { cancels += 1; activeText = null; },
        pause() {},
        resume() { resumes += 1; },
      },
    });
    Object.defineProperty(window, "__formalVoiceHarness", {
      configurable: true,
      value: {
        hasWatch() { return watchSuccess !== null; },
        emit(longitude: number, latitude: number, accuracy: number) {
          current = { longitude, latitude, accuracy, timestamp: Date.now() };
          watchSuccess?.(position());
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
        setGlobalMute(muted: boolean) {
          const preferences = {
            version: 1,
            fontScale: "default",
            highContrast: false,
            simplifiedVisuals: false,
            muted,
            reduceMotion: false,
          };
          localStorage.setItem("liuzu-cloud-tour:accessibility:v1", JSON.stringify(preferences));
          document.documentElement.dataset.muted = muted ? "true" : "false";
          window.dispatchEvent(new CustomEvent("liuzu-cloud-tour:accessibility-changed", { detail: preferences }));
        },
        snapshot() { return { spoken: [...spoken], cancels, resumes, activeText }; },
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
  await page.route("**/api/v1/route-plans", async (route) => {
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
          routeFingerprint: "drp1-a11ce123",
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

  await page.goto("/guide?demo=1&stops=guoen-temple,huineng-residence,longshan-spring");
  const planner = page.getByRole("region", { name: "正式景区内部导航" });
  await expect(planner.getByText(/已匹配“路网节点 · internal-entry”/)).toBeVisible();
  await planner.getByRole("combobox", { name: "目的地" }).selectOption("destination");
  await planner.getByRole("button", { name: "生成正式路线" }).click();
  const navigation = planner.getByRole("region", { name: "实时正式导航" });
  await expect(navigation).toHaveAttribute("data-formal-voice-state", "off");
  await planner.getByRole("button", { name: "开启导航语音" }).click();
  await expect(navigation).toHaveAttribute("data-formal-voice-state", "ready");
  await planner.getByRole("button", { name: "开始导航" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { hasWatch: () => boolean } }
  ).__formalVoiceHarness.hasWatch())).toBe(true);
  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__formalVoiceHarness.emit(100.001, 20, 5));
  await expect.poll(async () => (await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[] } } }
  ).__formalVoiceHarness.snapshot())).spoken.length).toBe(1);
  let voiceSnapshot = await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[]; cancels: number; resumes: number; activeText: string | null } } }
  ).__formalVoiceHarness.snapshot());
  expect(voiceSnapshot.spoken[0]).toMatch(/沿当前路段.*米后/);
  expect(voiceSnapshot.activeText).toBe(voiceSnapshot.spoken[0]);
  expect(voiceSnapshot.resumes).toBeGreaterThanOrEqual(1);

  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__formalVoiceHarness.emit(100.001, 20, 5));
  await page.waitForTimeout(150);
  voiceSnapshot = await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[]; cancels: number; resumes: number; activeText: string | null } } }
  ).__formalVoiceHarness.snapshot());
  expect(voiceSnapshot.spoken).toHaveLength(1);
  const cancelsBeforeBackground = voiceSnapshot.cancels;

  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { background: () => void } }
  ).__formalVoiceHarness.background());
  await expect(navigation).toHaveAttribute("data-formal-page-lifecycle", "background");
  await expect.poll(async () => (await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { activeText: string | null } } }
  ).__formalVoiceHarness.snapshot())).activeText).toBeNull();
  voiceSnapshot = await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[]; cancels: number; resumes: number; activeText: string | null } } }
  ).__formalVoiceHarness.snapshot());
  expect(voiceSnapshot.cancels).toBeGreaterThan(cancelsBeforeBackground);
  expect(voiceSnapshot.spoken).toHaveLength(1);

  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { foreground: () => void } }
  ).__formalVoiceHarness.foreground());
  await expect(navigation).toHaveAttribute("data-formal-page-lifecycle", "ready-to-resume");
  expect((await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[] } } }
  ).__formalVoiceHarness.snapshot())).spoken).toHaveLength(1);
  await planner.getByRole("button", { name: "确认恢复导航" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { hasWatch: () => boolean } }
  ).__formalVoiceHarness.hasWatch())).toBe(true);
  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__formalVoiceHarness.emit(100.001, 20, 5));
  await expect.poll(async () => (await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[] } } }
  ).__formalVoiceHarness.snapshot())).spoken.length).toBe(2);

  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__formalVoiceHarness.emit(100.0011, 20, 100));
  await expect.poll(async () => (await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[] } } }
  ).__formalVoiceHarness.snapshot())).spoken.length).toBe(3);
  voiceSnapshot = await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[]; cancels: number; resumes: number; activeText: string | null } } }
  ).__formalVoiceHarness.snapshot());
  expect(voiceSnapshot.spoken[2]).toMatch(/定位精度不足.*语音导航已暂停/);

  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { setGlobalMute: (muted: boolean) => void } }
  ).__formalVoiceHarness.setGlobalMute(true));
  await expect(navigation).toHaveAttribute("data-formal-voice-state", "global-muted");
  await expect(planner.getByRole("button", { name: "全局静音已开启" })).toBeDisabled();
  await expect.poll(async () => (await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { activeText: string | null } } }
  ).__formalVoiceHarness.snapshot())).activeText).toBeNull();
  await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { emit: (longitude: number, latitude: number, accuracy: number) => void } }
  ).__formalVoiceHarness.emit(100.0012, 20, 5));
  await page.waitForTimeout(150);
  voiceSnapshot = await page.evaluate(() => (
    window as typeof window & { __formalVoiceHarness: { snapshot: () => { spoken: string[]; cancels: number; resumes: number; activeText: string | null } } }
  ).__formalVoiceHarness.snapshot());
  expect(voiceSnapshot.spoken).toHaveLength(3);
  expect(voiceSnapshot.spoken.join(" ")).not.toMatch(/100\.001|20\.0|drp1-|field-network/);
});
