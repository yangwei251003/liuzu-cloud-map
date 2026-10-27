import { expect, test, type Page } from "@playwright/test";

const guideAnswer = {
  requestId: "e2e-chanxiaoli-voice-1",
  answer: "国恩寺相关内容应以已核对来源为准。[LZ-003]",
  claims: [{ text: "国恩寺相关内容应以已核对来源为准。[LZ-003]", sourceIds: ["LZ-003"], factTypes: ["historical_record"] }],
  factTypes: ["historical_record"],
  sources: [{
    id: "LZ-003",
    title: "第八批全国重点文物保护单位名单",
    publisher: "国务院",
    url: "https://www.gov.cn/zhengce/content/2019-10/16/content_5440577.htm",
    checkedAt: "2026-08-14",
    evidenceLevel: "A",
    factType: "historical_record",
    reviewStatus: "PROJECT_SOURCE_CHECKED",
    sourceStatus: "OFFICIAL_PRIMARY",
  }],
  provider: "local-knowledge",
  verification: "verified-context",
  refused: false,
  generatedAt: "2026-08-15T01:00:00.000Z",
  notice: "项目已核对来源，未经专业终审。",
};

async function mockGuide(page: Page) {
  await page.route("**/api/ai-guide", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideAnswer) });
  });
}

async function readyMascot(page: Page) {
  const mascot = page.getByRole("button", { name: /单击问答，长按说话，双击历史/ });
  await expect(mascot).toBeVisible();
  await expect.poll(async () => (await mascot.boundingBox())?.x ?? 0).toBeGreaterThan(200);
  return mascot;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    type TestWindow = typeof window & {
      __chanxiaoliVoiceStarts?: number;
      __chanxiaoliSpoken?: string[];
      __chanxiaoliSpeechCancels?: number;
    };
    const testWindow = window as TestWindow;
    testWindow.__chanxiaoliVoiceStarts = 0;
    testWindow.__chanxiaoliSpoken = [];
    testWindow.__chanxiaoliSpeechCancels = 0;

    class FakeSpeechRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: { results: Array<{ 0: { transcript: string }; length: number; isFinal: boolean }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        testWindow.__chanxiaoliVoiceStarts = (testWindow.__chanxiaoliVoiceStarts ?? 0) + 1;
        window.setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: "请介绍国恩寺" }, length: 1, isFinal: true }] }), 20);
      }
      stop() { window.setTimeout(() => this.onend?.(), 0); }
      abort() { window.setTimeout(() => this.onend?.(), 0); }
    }

    class FakeSpeechSynthesisUtterance {
      text: string;
      lang = "";
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }

    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeSpeechSynthesisUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() { testWindow.__chanxiaoliSpeechCancels = (testWindow.__chanxiaoliSpeechCancels ?? 0) + 1; },
        speak(utterance: FakeSpeechSynthesisUtterance) {
          testWindow.__chanxiaoliSpoken?.push(utterance.text);
          window.setTimeout(() => utterance.onstart?.(), 0);
        },
        pause() {},
        resume() {},
        getVoices() { return []; },
      },
    });
  });
});

test("静止长按角色提交语音问题，并用浏览器 TTS 朗读回答", async ({ page }) => {
  await mockGuide(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const mascot = await readyMascot(page);
  const box = await mascot.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chanxiaoliVoiceStarts?: number }).__chanxiaoliVoiceStarts ?? 0)).toBe(1);
  await expect(page.locator("[data-voice-status='listening']")).toContainText(/正在听/);
  await page.mouse.up();

  await expect(page.getByLabel("向禅小荔提问")).toHaveValue("请介绍国恩寺");
  await expect(page.getByText(guideAnswer.answer)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chanxiaoliSpoken?: string[] }).__chanxiaoliSpoken ?? [])).toContain(guideAnswer.answer);
  await expect(page.locator("[data-voice-status='speaking']")).toContainText(/正在说.*不是服务端实时语音/);

  const cancelCount = await page.evaluate(() => (window as typeof window & { __chanxiaoliSpeechCancels?: number }).__chanxiaoliSpeechCancels ?? 0);
  await page.getByRole("button", { name: "停止朗读" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chanxiaoliSpeechCancels?: number }).__chanxiaoliSpeechCancels ?? 0)).toBeGreaterThan(cancelCount);

  await mascot.dblclick();
  await expect(page.getByRole("heading", { name: "禅小荔问答历史" })).toBeVisible();
});

test("鼠标按住角色拖动时即时跟随，且不会误触问答或长按语音", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const mascot = await readyMascot(page);
  const start = await mascot.boundingBox();
  expect(start).not.toBeNull();

  const startX = start!.x + start!.width / 2;
  const startY = start!.y + start!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 300, startY - 170, { steps: 6 });
  const duringDrag = await mascot.boundingBox();
  expect(duringDrag).not.toBeNull();
  expect(duringDrag!.x).toBeLessThan(start!.x - 240);
  expect(duringDrag!.y).toBeLessThan(start!.y - 110);
  await page.mouse.up();

  await expect(page.locator("[data-chanxiaoli-panel]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chanxiaoliVoiceStarts?: number }).__chanxiaoliVoiceStarts ?? 0)).toBe(0);
  await mascot.click();
  await expect(page.locator("[data-chanxiaoli-panel]")).toBeVisible();
});

test("触控拖动通过同一 Pointer Events 状态机跟随手指", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const mascot = await readyMascot(page);
  const start = await mascot.boundingBox();
  expect(start).not.toBeNull();
  const client = await page.context().newCDPSession(page);
  const startX = start!.x + start!.width / 2;
  const startY = start!.y + start!.height / 2;

  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - 150, y: startY - 190 }] });
  await page.waitForTimeout(80);
  const duringDrag = await mascot.boundingBox();
  expect(duringDrag).not.toBeNull();
  expect(duringDrag!.x).toBeLessThan(start!.x - 100);
  expect(duringDrag!.y).toBeLessThan(start!.y - 130);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(page.locator("[data-chanxiaoli-panel]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chanxiaoliVoiceStarts?: number }).__chanxiaoliVoiceStarts ?? 0)).toBe(0);
});
