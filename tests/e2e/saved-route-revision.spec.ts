import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("saved route edits create a new revision and invalidate the old execution binding", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("liuzu-cloud-tour:journey-center:v1", JSON.stringify({
      version: 1,
      routes: [{
        id: "route-edit-e2e",
        title: "寻源半日线",
        plannedDate: "2026-08-16",
        duration: "3 小时",
        pace: "游记提取",
        note: "原计划备注",
        transport: "步行优先（需核验）",
        sourceText: "从一段游记生成的候选路线。",
        status: "DEMO_ONLY",
        planId: "plan-before-edit",
        revision: 4,
        validationStatus: "BLOCKED",
        unresolvedCount: 0,
        stops: [
          { id: "guoen-temple", name: "国恩寺", verification: "候选点位", dwellMinutes: 30 },
          { id: "huineng-residence", name: "六祖惠能故居", verification: "候选点位", dwellMinutes: 40 },
          { id: "longshan-spring", name: "龙山温泉", verification: "候选点位", dwellMinutes: 50 },
        ],
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      }],
      stamps: [],
      drafts: [],
      updatedAt: "2026-08-15T00:00:00.000Z",
    }));
  });

  await page.goto("/journey");
  const route = page.locator("article").filter({ has: page.getByRole("heading", { name: "寻源半日线", exact: true }) });
  await route.getByRole("button", { name: "编辑路线寻源半日线" }).click();

  const editorHeading = page.getByRole("heading", { name: "编辑“寻源半日线”" });
  await expect(editorHeading).toBeFocused();
  const editor = page.locator("#route-editor-route-edit-e2e");
  await editor.getByLabel("路线名称").fill("寻源慢游线");
  await editor.getByLabel("计划日期").fill("2026-08-20");
  await editor.getByLabel("游览节奏").selectOption({ label: "深度" });
  await editor.getByLabel("点位间交通").selectOption({ label: "公共交通" });
  await editor.getByLabel(/给自己的备注/).fill("和家人同行，预留休息时间。");
  await editor.getByRole("spinbutton").first().fill("60");
  await editor.getByRole("button", { name: "上移六祖惠能故居" }).click();
  await editor.getByRole("button", { name: "移除龙山温泉" }).click();
  await editor.getByRole("button", { name: "保存为新修订" }).click();

  await expect(page.getByText(/已保存为修订 5；旧计划绑定已清空，需重新生成\/校验/)).toBeVisible();
  const revisedRoute = page.locator("article").filter({ has: page.getByRole("heading", { name: "寻源慢游线", exact: true }) });
  await expect(revisedRoute.getByText("修订 5", { exact: true })).toBeVisible();
  await expect(revisedRoute.getByText("需重新生成/校验", { exact: true })).toBeVisible();
  await expect(revisedRoute.getByRole("link", { name: "重新生成并校验路线寻源慢游线" })).toHaveAttribute("href", "/plan");
  const stops = revisedRoute.getByRole("list", { name: "寻源慢游线的途经地点" }).getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(stops.nth(0)).toContainText("六祖惠能故居");
  await expect(stops.nth(1)).toContainText("国恩寺");
  await expect(page.getByText(/此前生成的分享链接仍保留当时内容/)).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("liuzu-cloud-tour:journey-center:v1") ?? "null").routes[0]);
  expect(saved).toMatchObject({
    title: "寻源慢游线",
    plannedDate: "2026-08-20",
    pace: "深度",
    transport: "公共交通",
    revision: 5,
    executionStatus: "NEEDS_REVALIDATION",
    status: "NEEDS_REVALIDATION",
  });
  expect(saved.planId).toBeUndefined();
  expect(saved.validationStatus).toBeUndefined();
  expect(saved.unresolvedCount).toBeUndefined();

  await revisedRoute.getByRole("button", { name: "编辑路线寻源慢游线" }).click();
  await page.locator("#route-editor-route-edit-e2e").getByRole("button", { name: "保存为新修订" }).click();
  await expect(page.getByText("没有检测到实际修改；路线修订号保持不变。", { exact: true })).toBeVisible();
  const noOpRevision = await page.evaluate(() => JSON.parse(localStorage.getItem("liuzu-cloud-tour:journey-center:v1") ?? "null").routes[0].revision);
  expect(noOpRevision).toBe(5);
});
