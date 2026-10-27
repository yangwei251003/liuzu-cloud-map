import { expect, test } from "@playwright/test";

test("homepage preferences generate, save and map a distinct demo-only personal route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "生成我的路线" }).click();

  const planner = page.getByRole("dialog", { name: "今天想怎么逛？" });
  await expect(planner).toBeVisible();
  await expect(planner.getByText(/输入或选择时间、节奏、同行人与兴趣/)).toBeVisible();

  await expect(planner.getByRole("button", { name: "3小时", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "均衡", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "独自", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "禅文化", exact: true })).toHaveAttribute("aria-pressed", "true");

  await planner.getByRole("button", { name: /生成 3小时 · 均衡 · 独自路线/ }).click();
  await expect(planner.getByRole("heading", { name: "禅文化 · 3小时候选线" })).toBeVisible();
  await expect(planner.getByText("六祖惠能故居", { exact: true })).toBeVisible();
  await expect(planner.getByText("禅域小镇", { exact: true })).toHaveCount(0);

  await planner.getByRole("button", { name: "半天", exact: true }).click();
  await planner.getByRole("button", { name: "轻松", exact: true }).click();
  await planner.getByRole("button", { name: "长辈同行", exact: true }).click();
  await planner.getByRole("button", { name: "禅文化", exact: true }).click();
  await planner.getByRole("button", { name: "休闲放松", exact: true }).click();

  await expect(planner.getByRole("button", { name: "半天", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "轻松", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "长辈同行", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "休闲放松", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(planner.getByRole("button", { name: "禅文化", exact: true })).toHaveAttribute("aria-pressed", "false");

  await planner.getByRole("button", { name: /生成 半天 · 轻松 · 长辈同行路线/ }).click();
  const routeTitle = "休闲放松 · 半天候选线";
  await expect(planner.getByRole("heading", { name: routeTitle })).toBeVisible();
  await expect(planner.getByText("禅域小镇", { exact: true })).toBeVisible();
  await expect(planner.getByText("六祖惠能故居", { exact: true })).toHaveCount(0);
  await expect(planner.getByText("DEMO ONLY", { exact: true })).toBeVisible();
  await expect(planner.getByText(/全部站点仍是研究候选点，未经管理方与现场核验/)).toBeVisible();
  await expect(planner.getByText(/不含路途、排队、开放限制或临时管制/)).toBeVisible();
  await expect(planner.getByText(/候选行程升级为正式导航/)).toBeVisible();
  await expect(planner.getByText("145 分钟", { exact: true })).toBeVisible();

  await planner.getByRole("button", { name: "保存到我的旅程" }).click();
  await expect(planner.getByText(/已保存到这台设备，可在“我的旅程”回看/)).toBeVisible();

  await planner.getByRole("button", { name: "在地图中查看" }).click();
  await expect(planner).toBeHidden();
  await expect(page.getByText(`正在查看“${routeTitle}”`, { exact: false })).toBeVisible();
  await expect(page.getByText("未经现场复走", { exact: true })).toBeVisible();

  await page.locator('a[href="/journey"]').filter({ hasText: /^我的$/ }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole("heading", { name: routeTitle })).toBeVisible();
  const savedStops = page.getByRole("list", { name: `${routeTitle}的途经地点` });
  await expect(savedStops.getByText("龙山温泉", { exact: true })).toBeVisible();
  await expect(savedStops.getByText("国恩寺", { exact: true })).toBeVisible();
  await expect(savedStops.getByText("禅域小镇", { exact: true })).toBeVisible();
  await expect(page.locator(".public-build-notice")).toContainText("地图非正式导航");
});
