import { expect, test, type Page } from "@playwright/test";

const demoUrl = "/guide?demo=1&stops=guoen-temple,huineng-residence,longshan-spring";
const guideSessionKey = "liuzu-cloud-tour:guide-session:v1";

type HarnessSnapshot = {
  watchCalls: number;
  clearCalls: number[];
  cancelCalls: number;
  spoken: string[];
};

async function installForegroundHarness(page: Page) {
  await page.addInitScript(() => {
    const harness = {
      watchCalls: 0,
      clearCalls: [] as number[],
      cancelCalls: 0,
      spoken: [] as string[],
      success: null as PositionCallback | null,
      failure: null as PositionErrorCallback | null,
    };
    Object.defineProperty(window, "__foregroundGuidanceHarness", {
      configurable: true,
      value: harness,
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition(success: PositionCallback, failure: PositionErrorCallback) {
          harness.watchCalls += 1;
          harness.success = success;
          harness.failure = failure;
          return harness.watchCalls;
        },
        clearWatch(watchId: number) {
          harness.clearCalls.push(watchId);
        },
      },
    });
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          harness.cancelCalls += 1;
        },
        speak(utterance: SpeechSynthesisUtterance) {
          harness.spoken.push(utterance.text);
        },
      },
    });
  });
}

async function harnessSnapshot(page: Page): Promise<HarnessSnapshot> {
  return page.evaluate(() => {
    const harness = (window as unknown as {
      __foregroundGuidanceHarness: HarnessSnapshot;
    }).__foregroundGuidanceHarness;
    return {
      watchCalls: harness.watchCalls,
      clearCalls: [...harness.clearCalls],
      cancelCalls: harness.cancelCalls,
      spoken: [...harness.spoken],
    };
  });
}

async function emitPosition(page: Page, input: { latitude: number; longitude: number; accuracy: number; timestamp: number }) {
  await page.evaluate((position) => {
    const harness = (window as unknown as {
      __foregroundGuidanceHarness: { success: PositionCallback | null };
    }).__foregroundGuidanceHarness;
    harness.success?.({
      coords: {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: position.timestamp,
      toJSON: () => ({}),
    });
  }, input);
}

async function emitPositionError(page: Page, code: number) {
  await page.evaluate((errorCode) => {
    const harness = (window as unknown as {
      __foregroundGuidanceHarness: { failure: PositionErrorCallback | null };
    }).__foregroundGuidanceHarness;
    harness.failure?.({ code: errorCode, message: "mock_error" } as GeolocationPositionError);
  }, code);
}

test("foreground guidance requires opt-in, never auto-arrives, and cleans up on pause, end and reload", async ({ page }) => {
  await installForegroundHarness(page);
  await page.goto(demoUrl);
  expect((await harnessSnapshot(page)).watchCalls).toBe(0);

  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await expect(page.getByText(/刷新或恢复演示后不会自动开启/)).toBeVisible();
  expect((await harnessSnapshot(page)).watchCalls).toBe(0);
  await page.getByRole("button", { name: "开启连续定位" }).click();
  expect((await harnessSnapshot(page)).watchCalls).toBe(1);

  for (const timestamp of [1_000, 6_000, 11_000]) {
    await emitPosition(page, {
      latitude: 22.592678,
      longitude: 112.22292,
      accuracy: 15,
      timestamp,
    });
  }
  await expect(page.getByText(/浏览器报告精度约 15 米/)).toBeVisible();
  await expect(page.getByText(/可能已接近“国恩寺”/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
  const activeSession = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), guideSessionKey);
  expect(activeSession).toMatchObject({ status: "ACTIVE", currentIndex: 0 });

  await page.getByRole("button", { name: "播报粗略距离与方位" }).click();
  const spoken = (await harnessSnapshot(page)).spoken.at(-1) ?? "";
  expect(spoken).toContain("直线距离");
  expect(spoken).toContain("手动确认到达");
  expect(spoken).not.toMatch(/左转|右转|预计|分钟|安全|已到达/);
  const cancelBeforeManualStop = (await harnessSnapshot(page)).cancelCalls;
  await page.getByRole("button", { name: "停止当前播报" }).click();
  expect((await harnessSnapshot(page)).cancelCalls).toBe(cancelBeforeManualStop + 1);

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText(/连续定位和语音已停止/)).toBeVisible();
  let snapshot = await harnessSnapshot(page);
  expect(snapshot.clearCalls).toEqual([1]);
  expect(snapshot.cancelCalls).toBeGreaterThan(0);
  const cancelAfterPause = snapshot.cancelCalls;

  await page.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByRole("button", { name: "开启连续定位" })).toBeVisible();
  expect((await harnessSnapshot(page)).watchCalls).toBe(1);
  await page.getByRole("button", { name: "开启连续定位" }).click();
  expect((await harnessSnapshot(page)).watchCalls).toBe(2);

  await page.getByRole("button", { name: "提前结束演示" }).click();
  await page.getByRole("button", { name: "确认提前结束" }).click();
  snapshot = await harnessSnapshot(page);
  expect(snapshot.clearCalls).toEqual([1, 2]);
  expect(snapshot.cancelCalls).toBeGreaterThan(cancelAfterPause);
  await expect(page.getByRole("heading", { name: "演示已提前结束" })).toBeVisible();

  await page.getByRole("button", { name: "重新开始此演示" }).click();
  await page.getByRole("button", { name: "开启连续定位" }).click();
  expect((await harnessSnapshot(page)).watchCalls).toBe(3);
  await page.reload();
  await expect(page.getByText(/已从这台设备恢复演示进度/)).toBeVisible();
  await expect(page.getByRole("button", { name: "开启连续定位" })).toBeVisible();
  expect((await harnessSnapshot(page)).watchCalls).toBe(0);
});

test("low accuracy, timeout and denial stop the watcher and fail closed", async ({ page }) => {
  await installForegroundHarness(page);
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();

  await page.getByRole("button", { name: "开启连续定位" }).click();
  await emitPosition(page, {
    latitude: 22.592478,
    longitude: 112.22292,
    accuracy: 180,
    timestamp: 1_000,
  });
  await expect(page.getByText(/超过演示门限，已停止连续定位/)).toBeVisible();
  await expect(page.getByText("精度不足", { exact: true })).toBeVisible();
  let snapshot = await harnessSnapshot(page);
  expect(snapshot.clearCalls).toEqual([1]);
  expect(snapshot.cancelCalls).toBeGreaterThan(0);
  const cancelAfterLowAccuracy = snapshot.cancelCalls;

  await page.getByRole("button", { name: "开启连续定位" }).click();
  await emitPositionError(page, 3);
  await expect(page.getByText(/连续定位等待超时/)).toBeVisible();
  snapshot = await harnessSnapshot(page);
  expect(snapshot.clearCalls).toEqual([1, 2]);
  expect(snapshot.cancelCalls).toBeGreaterThan(cancelAfterLowAccuracy);
  const cancelAfterTimeout = snapshot.cancelCalls;

  await page.getByRole("button", { name: "开启连续定位" }).click();
  await emitPositionError(page, 1);
  await expect(page.getByText(/定位权限已拒绝/)).toBeVisible();
  snapshot = await harnessSnapshot(page);
  expect(snapshot.clearCalls).toEqual([1, 2, 3]);
  expect(snapshot.cancelCalls).toBeGreaterThan(cancelAfterTimeout);
});
