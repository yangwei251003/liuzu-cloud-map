import { expect, test } from "@playwright/test";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const observationId = "11111111-1111-4111-8111-111111111111";
const networkRevisionId = "22222222-2222-4222-8222-222222222222";
const edgeId = "33333333-3333-4333-8333-333333333333";
const endpoint = "**/api/v1/admin/scenic-areas/liuzu-town/route-operational-observations";

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: observationId,
    scenicAreaId: "liuzu-town",
    networkRevisionId,
    edgeId,
    edgeCode: "edge-main-start",
    crowdLevel: "HIGH",
    weatherImpact: "RAIN",
    travelTimeMultiplier: 1.8,
    operatorNote: "浏览器测试中的虚构客流与天气观测，不代表真实景区状态。",
    sourceReference: "https://evidence.example.test/observations/source-1",
    observedAt: "2026-08-16T08:00:00.000Z",
    expiresAt: "2026-08-16T10:00:00.000Z",
    expectedSnapshotRevision: 7,
    workflowRevision: 1,
    reviewDecision: null,
    submittedBySubject: "oidc:operations-editor",
    submittedAt: "2026-08-16T08:01:00.000Z",
    reviewedBySubject: null,
    reviewedAt: null,
    reviewEvidenceReference: null,
    effectiveState: "PENDING_REVIEW",
    ...overrides,
  };
}

function overview(role: "OPERATIONS_EDITOR" | "OPERATIONS_REVIEWER") {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    actorRole: role,
    serverTime: "2026-08-16T08:05:00.000Z",
    snapshot: { snapshotRevision: 7, networkRevisionId, networkRevision: "field-release-7", operationalVersion: 12, validUntil: "2026-08-16T12:00:00.000Z" },
    edges: [{ id: edgeId, edgeCode: "edge-main-start", fromNodeCode: "node-start", toNodeCode: "node-finish", distanceMeters: 320, operationalStatus: "OPEN", currentTravelTimeMultiplier: 1, currentCrowdLevel: "UNKNOWN", currentWeatherImpact: "UNKNOWN" }],
    observations: [receipt()],
  };
}

async function stubOtherPanels(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operations", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "测试中未启用道路管制面板。" } }) }));
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operational-releases", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "测试中未启用快照发布面板。" } }) }));
}

test("operations editor submits a source-backed short-lived factor without publishing it", async ({ page }) => {
  await stubOtherPanels(page);
  let submitted: Record<string, unknown> | null = null;
  let idempotencyKey = "";
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      idempotencyKey = route.request().headers()["idempotency-key"] ?? "";
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, receipt: receipt() }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("OPERATIONS_EDITOR") }) });
  });

  await page.goto("/admin/route-operations");
  await expect(page.getByRole("heading", { name: "客流与天气动态观测" })).toBeVisible();
  await page.getByLabel("客流等级").selectOption("HIGH");
  await page.locator("select").filter({ has: page.locator('option[value="RAIN"]') }).selectOption("RAIN");
  await page.getByLabel("预计耗时倍率（1–3）").fill("1.8");
  await page.getByLabel("观测时间").fill("2026-08-16T16:00");
  await page.getByLabel("失效时间（最长 6 小时）").fill("2026-08-16T18:00");
  await page.getByPlaceholder("只记录已观测事实、采集位置和方法，不写推测。").fill("浏览器测试中的虚构客流与天气观测，不代表真实景区状态。");
  await page.getByLabel("一手依据 HTTPS").fill("https://evidence.example.test/observations/source-1");
  await page.getByText("我确认该值来自所附依据与现场观测").click();
  await page.getByRole("button", { name: "提交观测" }).click();
  await expect(page.getByText(/尚未改变游客路线/)).toBeVisible();
  expect(submitted).toMatchObject({ schemaVersion: 1, edgeId, crowdLevel: "HIGH", weatherImpact: "RAIN", travelTimeMultiplier: 1.8, expectedSnapshotRevision: 7, acknowledgeSourceBackedObservation: true });
  expect(idempotencyKey).toMatch(/^route-factor-[0-9a-f-]{36}$/i);
});

test("independent reviewer confirms the exact observation but does not bypass snapshot publication", async ({ page }) => {
  await stubOtherPanels(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/route-operational-observations/${observationId}/review`, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: 1,
      requestId,
      receipt: receipt({ workflowRevision: 2, reviewDecision: "CONFIRMED", reviewedBySubject: "oidc:operations-reviewer", reviewedAt: "2026-08-16T08:05:00.000Z", reviewEvidenceReference: "https://evidence.example.test/observations/review-1", effectiveState: "CONFIRMED" }),
    }) });
  });
  await page.route(endpoint, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("OPERATIONS_REVIEWER") }) }));

  await page.goto("/admin/route-operations");
  await page.getByRole("button", { name: /edge-main-start · 客流高/ }).click();
  await page.getByLabel("独立复核证据 HTTPS").fill("https://evidence.example.test/observations/review-1");
  await page.getByText("我已独立核对路段、采集时间").click();
  await page.getByRole("button", { name: "确认观测" }).click();
  await expect(page.getByText(/仍须编译并独立发布完整快照/)).toBeVisible();
  expect(submitted).toMatchObject({ schemaVersion: 1, decision: "CONFIRMED", expectedWorkflowRevision: 1, acknowledgeIndependentReview: true });
});
