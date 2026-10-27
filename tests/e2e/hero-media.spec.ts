import { expect, test } from "@playwright/test";

test.skip("原素材版本：实景轮播与视频播放（公开版缺少授权素材）", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /今天，\s*想怎样遇见新兴？/ })).toBeVisible();
  const carousel = page.locator("[data-promotion-carousel]");
  await expect(carousel).toHaveAttribute("data-static-mode", "false");
  await expect(carousel).toHaveAttribute("data-auto-rotating", "true");
  await expect(carousel.getByRole("group", { name: /第 1 张，共 7 张：国恩寺/ })).toBeVisible();
  await expect(carousel.getByText("景点实景 · 画质修复", { exact: true })).toBeVisible();
  await page.waitForTimeout(4_300);
  await expect(carousel.getByRole("group", { name: /第 2 张，共 7 张：六祖惠能故居/ })).toBeVisible();
  await expect(carousel).toHaveAttribute("data-auto-rotating", "true");
  await carousel.getByRole("button", { name: /查看第 7 张：国恩寺纪实/ }).click();
  await expect(carousel).toHaveAttribute("data-auto-rotating", "false");
  const video = carousel.getByLabel("国恩寺文化纪实视频封面");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", "/assets/scenic/user-v1/guoen-temple-documentary.mp4");
  const videoState = await video.evaluate((element) => {
    if (!(element instanceof HTMLVideoElement)) throw new Error("Hero media is not a video element");
    return {
      muted: element.muted,
      loop: element.loop,
      playsInline: element.playsInline,
      paused: element.paused,
    };
  });
  expect(videoState).toMatchObject({ muted: true, loop: false, playsInline: true, paused: true });
  await carousel.getByRole("button", { name: "播放当前视频" }).click();
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
  await expect(carousel.getByRole("button", { name: "暂停当前视频" })).toBeVisible();
  await page.screenshot({ path: "test-results/home-hero-video-desktop.png", fullPage: false });
});

test.skip("原素材版本：减少动态（公开版缺少授权素材）", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const carousel = page.locator("[data-promotion-carousel]");
  await expect(carousel).toHaveAttribute("data-static-mode", "false");
  await expect(carousel).toHaveAttribute("data-auto-rotating", "true");
  await page.waitForTimeout(4_300);
  await expect(carousel.getByRole("group", { name: /第 2 张，共 7 张/ })).toBeVisible();
  await expect(carousel.getByText("景点实景 · 画质修复", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/home-hero-reduced-motion-mobile.png", fullPage: false });
});

// 公开版使用经确认许可的 4 张图片，不包含旧版纪录片视频。
test("公开许可轮播展示来源边界并按四秒换片", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const carousel = page.locator("[data-promotion-carousel]");
  await expect(carousel).toHaveAttribute("data-auto-rotating", "true");
  await expect(carousel.getByRole("group", { name: /第 1 张，共 4 张：国恩寺/ })).toBeVisible();
  await expect(carousel.getByText("开放许可景点实景", { exact: true })).toBeVisible();
  await page.waitForTimeout(4_300);
  await expect(carousel.getByRole("group", { name: /第 2 张，共 4 张：新兴天露山/ })).toBeVisible();
  await expect(carousel.getByText("新兴县周边实景 · 非本景点", { exact: true })).toBeVisible();
  await carousel.getByRole("button", { name: /查看第 1 张：国恩寺/ }).click();
  await expect(carousel.getByRole("group", { name: /第 1 张，共 4 张：国恩寺/ })).toBeVisible();
});

test("公开许可轮播在减少动态的手机设置下仍可访问", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const carousel = page.locator("[data-promotion-carousel]");
  await expect(carousel.getByRole("button", { name: /查看第 4 张：新兴天露山/ })).toBeVisible();
  await carousel.getByRole("button", { name: /查看第 4 张：新兴天露山/ }).click();
  await expect(carousel.getByRole("group", { name: /第 4 张，共 4 张：新兴天露山/ })).toBeVisible();
  await expect(carousel.getByText("新兴县周边实景 · 非本景点", { exact: true })).toBeVisible();
});
