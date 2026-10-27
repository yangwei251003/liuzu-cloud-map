import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      rate = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    let speaking = false;
    let paused = false;
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: MockSpeechSynthesisUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        get speaking() { return speaking; },
        get paused() { return paused; },
        speak(utterance: MockSpeechSynthesisUtterance) {
          speaking = true;
          paused = false;
          (window as typeof window & { __cloudTourSpeechText?: string }).__cloudTourSpeechText = utterance.text;
        },
        pause() { paused = true; },
        resume() { paused = false; speaking = true; },
        cancel() { paused = false; speaking = false; },
      },
    });
  });
});

test("cloud tour completes a sourced chapter, persists progress and clears it explicitly", async ({ page }) => {
  await page.goto("/cloud-tour");
  await expect(page.getByRole("heading", { name: "不在现场，也能循着证据走一程" })).toBeVisible();
  await expect(page.getByText("线上云游，不是现场导航。")).toBeVisible();
  await page.getByRole("button", { name: "按寻源半日线开始云游" }).click();

  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
  await expect(page.getByText("史实 / 文保记录").first()).toBeVisible();
  await expect(page.getByText(/项目已核对来源/).first()).toBeVisible();

  await page.getByRole("button", { name: "播放讲解朗读" }).click();
  await expect(page.getByRole("button", { name: "暂停讲解朗读" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __cloudTourSpeechText?: string }).__cloudTourSpeechText)).toContain("全国重点文物保护单位");
  await page.getByRole("button", { name: "暂停讲解朗读" }).click();
  await expect(page.getByRole("button", { name: "继续讲解朗读" })).toBeVisible();
  await page.getByRole("button", { name: "静音" }).click();
  await expect(page.getByRole("button", { name: "取消静音" })).toBeVisible();

  await page.getByLabel("保护对象的年代口径").check();
  await page.getByRole("button", { name: "提交答案并核对来源" }).click();
  await expect(page.getByText(/已收下内容印章/)).toBeVisible();
  await page.getByRole("button", { name: "下一章" }).click();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();
  await expect(page.getByText(/已恢复保存在此设备上的云游进度/)).toBeVisible();

  await page.getByRole("button", { name: "清除云游进度" }).click();
  const clearDialog = page.getByRole("dialog", { name: "确认清除云游进度？" });
  await expect(clearDialog).toBeVisible();
  await expect(clearDialog).toContainText("将删除这台设备上的章节进度和内容印章");
  await page.getByRole("button", { name: "确认清除" }).click();
  await expect(page.getByRole("heading", { name: "选择云游章节组" })).toBeVisible();
});

test("single-station cloud tour works with keyboard and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cloud-tour");
  const singleStationButton = page.getByRole("button", { name: "开始藏佛坑候选区单站云游" });
  await singleStationButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#station-title")).toBeFocused();
  await expect(page.getByText(/点位仍待现场消歧/)).toBeVisible();
  await expect(page.getByText(/不能据此生成入口、山路或安全导航/)).toBeVisible();

  const animationDuration = await page.locator("article").first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.01);

  await page.getByLabel("作为需要进一步核对的地点线索").check();
  await page.getByRole("button", { name: "提交答案并核对来源" }).click();
  await expect(page.getByText(/学习进度，不是现场到访证明/)).toBeVisible();
  await page.getByRole("button", { name: "完成这次云游" }).click();
  await expect(page.getByRole("heading", { name: "这次线上云游已完成" })).toBeVisible();
  await expect(page.getByText(/不代表实际到访/)).toBeVisible();
});
