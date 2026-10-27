import { expect, test } from "@playwright/test";

const routes = ["/", "/cloud-tour", "/arrival", "/community", "/journey", "/account", "/map", "/admin"];

test("全站主要路由保留可交互内容并应用正确动效等级", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
    const expectedTier = route === "/" || route === "/cloud-tour"
      ? "cinematic"
      : ["/arrival", "/community", "/journey"].includes(route)
        ? "expressive"
        : "utility";
    await expect(page.locator("[data-app-route]")).toHaveAttribute("data-motion-tier", expectedTier);
    await expect(page.locator(".route-transition-veil")).toHaveCSS("pointer-events", "none");
  }

  expect(pageErrors).toEqual([]);
});

test("390px 触摸布局与减少动态模式关闭复杂持续效果", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cloud-tour");
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator(".visitor-task-nav")).toBeVisible();
  const veilDuration = await page.locator(".route-transition-veil").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(veilDuration || "0")).toBeLessThanOrEqual(0.01);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("简洁显示与系统减少动态合并为同一运行时降级", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开显示与辅助设置" }).click();
  await page.getByText("简洁显示与标准地图").click();
  await expect(page.locator("html")).toHaveAttribute("data-simplified-visuals", "true");
  const ambientDisplay = await page.locator("[data-chanxiaoli-trigger] > span").nth(1).evaluate((element) => getComputedStyle(element).display);
  expect(ambientDisplay).toBe("none");
});

test("首页动效保持核心体验指标预算", async ({ page }) => {
  await page.addInitScript(() => {
    const metricsWindow = window as unknown as Window & { __motionVitals: { cls: number; lcp: number } };
    metricsWindow.__motionVitals = { cls: 0, lcp: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput) metricsWindow.__motionVitals.cls += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      metricsWindow.__motionVitals.lcp = entries.at(-1)?.startTime ?? 0;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(1600);
  const vitals = await page.evaluate(() => (window as unknown as Window & { __motionVitals: { cls: number; lcp: number } }).__motionVitals);
  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThan(2500);
  expect(vitals.cls).toBeLessThan(0.1);
});
