import { expect, test } from "@playwright/test";

const requestId = "33333333-3333-4333-8333-333333333333";
const releaseId = "11111111-1111-4111-8111-111111111111";
const networkRevisionId = "22222222-2222-4222-8222-222222222222";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: releaseId,
    scenicAreaId: "liuzu-town",
    baseSnapshotRevision: 7,
    targetSnapshotRevision: 8,
    networkRevisionId,
    networkRevision: "field-release-7",
    baseOperationalVersion: 12,
    targetOperationalVersion: 13,
    workflowRevision: 1,
    lifecycleState: "PREPARED",
    sourceReference: "https://evidence.example.test/releases/source-8",
    reasonSummary: "浏览器测试使用的虚构发布说明，不代表真实景区状态。",
    snapshotSha256: "a".repeat(64),
    confirmedEventCount: 1,
    confirmedObservationCount: 0,
    affectedEdgeCount: 1,
    preparedBySubject: "oidc:operations-a",
    preparedAt: "2026-08-16T10:00:00.000Z",
    expiresAt: "2026-08-16T14:00:00.000Z",
    publishedBySubject: null,
    publishedAt: null,
    releaseEvidenceReference: null,
    ...overrides,
  };
}

function overview(role: "OPERATIONS_EMERGENCY" | "RELEASE_ADMIN", release: Record<string, unknown> | null) {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    actorRole: role,
    serverTime: "2026-08-16T10:00:00.000Z",
    currentSnapshot: { snapshotRevision: 7, networkRevisionId, networkRevision: "field-release-7", operationalVersion: 12, validUntil: "2026-08-16T14:00:00.000Z" },
    pendingEventCount: 0,
    confirmedEventCount: 1,
    pendingObservationCount: 0,
    confirmedObservationCount: 0,
    candidate: release,
  };
}

async function stubRouteOperations(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operations", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "测试中未启用道路事件面板。" } }) }));
}

test("operations role compiles a confirmed closure set into an immutable candidate", async ({ page }) => {
  await stubRouteOperations(page);
  let submitted: Record<string, unknown> | null = null;
  let idempotencyKey = "";
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operational-releases", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      idempotencyKey = route.request().headers()["idempotency-key"] ?? "";
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, receipt: candidate() }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("OPERATIONS_EMERGENCY", null) }) });
  });

  await page.goto("/admin/route-operations");
  await expect(page.getByRole("heading", { name: "替代运营快照发布" })).toBeVisible();
  await page.getByLabel("编译与发布依据 HTTPS").fill("https://evidence.example.test/releases/source-8");
  await page.getByLabel("准备说明（10–1000 字）").fill("浏览器测试使用的虚构发布说明，不代表真实景区状态。");
  await page.getByText("我确认只编译当前正式路网中已由另一身份确认").click();
  await page.getByRole("button", { name: "生成不可变候选" }).click();
  await expect(page.getByText(/不可变候选已生成/)).toBeVisible();
  expect(submitted).toMatchObject({ schemaVersion: 1, expectedSnapshotRevision: 7, acknowledgeConfirmedEventsOnly: true, acknowledgeReviewedFactorsOnly: true });
  expect(idempotencyKey).toMatch(/^route-operational-release-[0-9a-f-]{36}$/i);
});

test("release admin explicitly publishes the replacement and acknowledges offline invalidation", async ({ page }) => {
  await stubRouteOperations(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/route-operational-releases/${releaseId}/publish`, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: 1,
      requestId,
      receipt: candidate({ workflowRevision: 2, lifecycleState: "PUBLISHED", publishedBySubject: "oidc:release-b", publishedAt: "2026-08-16T10:05:00.000Z", releaseEvidenceReference: "https://evidence.example.test/releases/approval-8" }),
    }) });
  });
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operational-releases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("RELEASE_ADMIN", candidate()) }) }));

  await page.goto("/admin/route-operations");
  await page.getByLabel("独立发布证据 HTTPS").fill("https://evidence.example.test/releases/approval-8");
  await page.getByText("我确认发布会在同一事务中撤下基础快照").click();
  await page.getByText("我确认绑定旧快照或旧运营版本的离线包将失效").click();
  await page.getByRole("button", { name: "原子发布替代快照" }).click();
  await expect(page.getByText(/正式快照已更新为 r8/)).toBeVisible();
  expect(submitted).toMatchObject({ schemaVersion: 1, expectedWorkflowRevision: 1, acknowledgeAtomicReplacement: true, acknowledgeOfflinePacksInvalidated: true });
});
