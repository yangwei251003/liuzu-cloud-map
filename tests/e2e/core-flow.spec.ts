import { expect, test } from "@playwright/test";

test("detailed map exposes five visitor-focused presentation modes and a closed-by-default accessible place catalog", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "六祖云游详细地图", exact: true })).toBeVisible();
  const mapSurface = page.locator('[data-map-release-boundary="release"]');
  await expect(mapSurface).toBeVisible();
  await expect(mapSurface).toHaveAttribute("data-detailed-map-mode", "amap-original");
  const settledMap = page.locator('[data-map-load-status="ready"], [data-map-load-status="limited"]').first();
  await expect(settledMap).toBeVisible({ timeout: 30_000 });
  if (await settledMap.getAttribute("data-map-load-status") === "limited") {
    await expect(settledMap.getByRole("status")).toContainText("尚未确认完整就绪");
  }
  await expect(page.getByRole("region", { name: "六祖云游详细地图", exact: true }).last()).toBeVisible();

  const styleTrigger = page.getByRole("button", { name: /地图风格与展示层/ });
  await expect(styleTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("group", { name: "选择地图底图风格" })).toHaveCount(0);
  await styleTrigger.click();
  await expect(styleTrigger).toHaveAttribute("aria-expanded", "true");
  const modeChoices = page.getByRole("group", { name: "选择地图底图风格" }).getByRole("button");
  await expect(modeChoices).toHaveCount(5);
  await expect(modeChoices.filter({ hasText: "标准地图" })).toBeVisible();
  await modeChoices.filter({ hasText: "禅意皮肤" }).click();
  await expect(mapSurface).toHaveAttribute("data-detailed-map-mode", "zen");

  const catalog = page.locator("[data-map-accessible-catalog]");
  const catalogToggle = catalog.getByRole("button", { name: "地点与服务设施", exact: true });
  await expect(catalogToggle).toHaveAttribute("aria-expanded", "false");
  await expect(catalog.getByRole("heading", { name: "地点与服务设施目录" })).toHaveCount(0);

  await catalogToggle.click();
  await expect(catalogToggle).toHaveAttribute("aria-expanded", "true");
  await catalog.getByRole("button", { name: "关闭地点与服务设施目录" }).click();
  await expect(catalogToggle).toBeFocused();

  await catalogToggle.click();
  await page.keyboard.press("Escape");
  await expect(catalogToggle).toBeFocused();

  await catalogToggle.click();
  const catalogSearch = catalog.getByLabel("按名称、类别或设施搜索");
  await catalogSearch.fill("国恩寺");
  await catalog.getByRole("button", { name: /国恩寺/ }).click();
  await expect(page.locator(".map-tour-status")).toContainText("国恩寺");
});

test("demo-only visitor loop turns a note into a route, guide, stamps and read-only share", async ({ page, context }) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "提取并保留未决信息" }).click();
  await expect(page.getByText(/已用本地规则|已用受限 AI|网络不可用/)).toBeVisible();
  await expect(page.getByRole("button", { name: "移除国恩寺" })).toBeVisible();

  const ambiguity = page.getByRole("group", { name: "原文“六祖文化”" });
  await ambiguity.getByRole("combobox", { name: "明确选择一个地点，或排除这段表达" }).selectOption("EXCLUDED");
  await ambiguity.getByLabel(/决定说明/).fill("原文表达文化主题，不新增重复目的地。");

  const huinengStop = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "移除六祖惠能故居" }) });
  const longshanStop = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "移除龙山温泉" }) });
  await huinengStop.getByRole("spinbutton").fill("45");
  await longshanStop.getByRole("spinbutton").fill("60");

  const nonDwellIssues = page.locator("fieldset").filter({ has: page.getByText(/尚未转换为可执行时间窗|尚未获得路线、设施或可达性证据/) });
  await expect(nonDwellIssues).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const issue = nonDwellIssues.nth(index);
    await issue.getByLabel("处理方式").selectOption("EXPLICITLY_IGNORED");
    await issue.getByLabel(/忽略原因/).fill("仅验证候选演示流程，不形成时间或可达性承诺。");
  }

  const savePlan = page.getByRole("button", { name: "确认并保存路线" });
  await expect(savePlan).toBeEnabled();
  await savePlan.click();
  await expect(page.getByText(/路线已经保存到“我的旅程”/)).toBeVisible();
  await page.getByRole("link", { name: "开始查看逐站导览" }).click();

  await expect(page).toHaveURL(/\/guide\?demo=1&planId=/);
  await expect(page.getByRole("heading", { name: "国恩寺", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我已了解，仅开始演示导览" }).click();
  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByRole("heading", { name: "六祖惠能故居", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByRole("heading", { name: "龙山温泉", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我已现场确认到达（手动）" }).click();
  await expect(page.getByRole("heading", { name: "旅程完成" })).toBeVisible();

  await page.getByRole("link", { name: /查看我的路线、印章与游记/ }).click();
  await expect(page.getByRole("heading", { name: "从游记生成的六祖候选行程" })).toBeVisible();
  await page.getByRole("button", { name: "分享路线从游记生成的六祖候选行程" }).click();
  await expect(page.getByRole("dialog", { name: "确认公开字段" })).toBeVisible();
  await expect(page.getByText(/不会包含：游记原文、来源证据/)).toBeVisible();
  await page.getByRole("button", { name: "生成本机演示 7 天链接" }).click();
  await expect(page.getByText("本机演示 · 7 天内有效")).toBeVisible();

  const shareSection = page.locator("#route-shares");
  const href = await shareSection.getByRole("link", { name: "查看" }).getAttribute("href");
  expect(href).toContain("/share#");
  const sharedPage = await context.newPage();
  await sharedPage.goto(href!);
  await expect(sharedPage.getByText("只读路线预览")).toBeVisible();
  await expect(sharedPage.getByRole("heading", { name: "从游记生成的六祖候选行程" })).toBeVisible();
  await expect(sharedPage.getByText(/游记原文|来源证据/)).toHaveCount(0);

  await page.bringToFront();
  await shareSection.getByRole("button", { name: "本机撤销" }).click();
  await shareSection.getByRole("button", { name: "确认本机撤销" }).click();
  await expect(shareSection.getByText("已在本机撤销")).toBeVisible();
  await sharedPage.reload();
  await expect(sharedPage.getByRole("heading", { name: "分享者已撤销这条链接" })).toBeVisible();
});

test("an unvalidated itinerary cannot start outside explicit demo mode", async ({ page }) => {
  await page.goto("/guide?stops=guoen-temple,huineng-residence");
  const blocked = page.getByRole("alert").filter({ has: page.getByText("景区内部线路尚未达到可执行标准") });
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText("系统不会虚构景区内导航");
  await expect(blocked.getByRole("link", { name: "使用高德真实道路导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: /开始.*导览/ })).toHaveCount(0);
});

test("grounded guide uses current spot context and refuses live operational claims", async ({ page }) => {
  await page.goto("/guide/ask?spot=guoen-temple");
  await expect(page.getByText(/当前景点：国恩寺/)).toBeVisible();
  const question = page.getByLabel("你想了解什么？");
  await question.fill("国恩寺为什么是全国重点文物保护单位？");
  await page.getByRole("button", { name: "向禅小荔提问" }).click();
  const answer = page.getByRole("region", { name: "问问禅小荔" }).locator("article");
  await expect(answer).toContainText("全国重点文物保护单位");
  await expect(answer.getByRole("heading", { name: "本次来源" })).toBeVisible();
  await expect(answer.getByRole("link", { name: /\[LZ-003\].*第八批全国重点文物保护单位名单/ })).toBeVisible();

  await question.fill("国恩寺今天几点开放，哪条路线最安全？");
  await page.getByRole("button", { name: "向禅小荔提问" }).click();
  await expect(page.getByText("证据不足，已拒答")).toBeVisible();
  await expect(page.getByText(/目前不能确认/)).toBeVisible();
});

test("visitor correction reaches the governance queue and can be erased with local data", async ({ page }) => {
  await page.goto("/");
  await page.locator("#map").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "听景点故事" }).click();
  await page.getByRole("button", { name: "信息有误？提交纠错" }).click();
  await page.getByLabel("哪里不准确？正确情况是什么？").fill("现场入口标识与当前候选点不一致，请运营人员核验。 ");
  await page.getByRole("button", { name: "提交到纠错队列" }).click();
  await expect(page.getByText(/已在本机创建纠错单/)).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "游客纠错" }).click();
  await expect(page.getByRole("heading", { name: "国恩寺信息纠错" })).toBeVisible();
  await expect(page.getByText(/现场入口标识与当前候选点不一致/)).toBeVisible();

  await page.goto("/privacy");
  await page.getByRole("button", { name: "删除我的本机数据" }).click();
  await expect(page.getByText("请再次确认：删除后无法恢复")).toBeVisible();
  await page.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page.getByRole("status").filter({ hasText: /这台设备上的计划.*已清除/ })).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "游客纠错" }).click();
  await expect(page.getByText("纠错队列为空")).toBeVisible();
});

test("mobile navigation and install manifest expose the core product", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const mobileNav = page.getByRole("navigation", { name: "移动端主导航" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("link")).toHaveCount(5);
  await expect(mobileNav.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
  await expect(mobileNav.getByRole("link", { name: "行程" })).toHaveAttribute("href", "/plan");
  await expect(mobileNav.getByRole("link", { name: "地图" })).toHaveAttribute("href", "/map");
  await expect(mobileNav.getByRole("link", { name: "社区" })).toHaveAttribute("href", "/community");
  await expect(mobileNav.getByRole("link", { name: "我的" })).toHaveAttribute("href", "/account");

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.webmanifest");
    if (!response.ok) throw new Error(`manifest_${response.status}`);
    return response.json();
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/assets/images/neutral-app-icon.svg", sizes: "any", type: "image/svg+xml" }),
  ]));
});
