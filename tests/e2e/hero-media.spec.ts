import { expect, test } from "@playwright/test";

test("首页实景图片每四秒轮播，视频由游客播放且不循环", async ({ page }) => {
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

test("设备减少动态时仍按四秒换片，但使用无动画过渡", async ({ page }) => {
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
