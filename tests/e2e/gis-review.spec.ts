import { expect, test } from "@playwright/test";

const submissionId = "123e4567-e89b-42d3-a456-426614174222";
const requestId = "123e4567-e89b-42d3-a456-426614174333";
const submittedAt = "2026-08-16T10:00:00.000Z";
const contentSha256 = "a".repeat(64);

const collection = {
  schemaVersion: 2,
  scenicAreaId: "liuzu-town",
  warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
  drafts: [{
    schemaVersion: 2,
    id: "candidate-path-e2e",
    scenicAreaId: "liuzu-town",
    title: "虚构审核步道",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[112.222, 22.592], [112.223, 22.593]] },
    coordinateSystem: "WGS84",
    source: { label: "虚构浏览器测试证据", url: "https://evidence.example.test/gis/e2e", capturedAt: "2026-08-16T09:00:00.000Z" },
    routingAttributes: { traversalMode: "WALKWAY", difficulty: "EASY", scenicScore: 60, accessibility: "UNKNOWN", walkingTimeMultiplier: 1 },
    visitAttributes: null,
    notes: "仅供自动化测试，不代表真实路线。",
    verificationStatus: "CANDIDATE_DRAFT",
    publicationStatus: "LOCAL_DRAFT_ONLY",
    createdAt: "2026-08-16T09:10:00.000Z",
    updatedAt: "2026-08-16T09:10:00.000Z",
  }],
};

const submittedReceipt = {
  schemaVersion: 1,
  submissionId,
  scenicAreaId: "liuzu-town",
  submissionRevision: 1,
  workflowRevision: 1,
  state: "SUBMITTED",
  objectCount: 1,
  contentSha256,
  submittedAt,
  reviewedAt: null,
  decision: null,
  reviewEvidenceReference: null,
};

test("GIS reviewer inspects an immutable candidate and records a non-publishing approval", async ({ page }) => {
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 1, requestId, page: { schemaVersion: 1, items: [{ receipt: submittedReceipt, reviewEligibility: "ELIGIBLE" }], nextBeforeRevision: null } }),
    });
  });
  await page.route(`**/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions/${submissionId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 1, requestId, detail: { schemaVersion: 1, receipt: submittedReceipt, reviewEligibility: "ELIGIBLE", collection } }),
    });
  });
  let reviewBody: unknown = null;
  let idempotencyKey = "";
  await page.route(`**/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions/${submissionId}/review`, async (route) => {
    const request = route.request();
    reviewBody = request.postDataJSON();
    idempotencyKey = request.headers()["idempotency-key"] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId,
        receipt: {
          ...submittedReceipt,
          workflowRevision: 2,
          state: "APPROVED_FOR_FORMALIZATION",
          reviewedAt: "2026-08-16T10:15:00.000Z",
          decision: "APPROVE_FOR_FORMALIZATION",
          reviewEvidenceReference: "https://evidence.example.test/reviews/e2e-approval",
        },
      }),
    });
  });

  await page.goto("/admin/gis-review");
  await expect(page.getByRole("button", { name: /候选版本 #1/ })).toBeVisible();
  await page.getByRole("button", { name: /候选版本 #1/ }).click();
  await expect(page.getByRole("heading", { name: "待专业审核" })).toBeVisible();
  await expect(page.getByText("虚构审核步道", { exact: true })).toBeVisible();
  await page.getByLabel("HTTPS 审核证据链接").fill("https://evidence.example.test/reviews/e2e-approval");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "通过并进入待正式化" }).click();

  await expect(page.getByText("专业审核已记录；该版本只进入待正式化状态，尚未发布到游客路网。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "已通过专业审核 · 待正式化" })).toBeVisible();
  expect(reviewBody).toEqual({
    schemaVersion: 1,
    expectedWorkflowRevision: 1,
    decision: "APPROVE_FOR_FORMALIZATION",
    evidenceReference: "https://evidence.example.test/reviews/e2e-approval",
  });
  expect(idempotencyKey).toMatch(/^gis-review-[0-9a-f-]{36}$/i);
});
