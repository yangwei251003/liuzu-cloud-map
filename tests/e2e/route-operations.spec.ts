import { expect, test } from "@playwright/test";

const requestId = "123e4567-e89b-42d3-a456-426614174601";
const edgeId = "123e4567-e89b-42d3-a456-426614174602";
const eventId = "123e4567-e89b-42d3-a456-426614174603";
const networkRevisionId = "123e4567-e89b-42d3-a456-426614174604";

test("emergency operator binds a closure to the current formal snapshot and receives a pending-review receipt", async ({ page }) => {
  let receipt: Record<string, unknown> | null = null;
  let submittedBody: Record<string, unknown> | null = null;
  let idempotencyKey = "";
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/route-operations", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      submittedBody = request.postDataJSON() as Record<string, unknown>;
      idempotencyKey = request.headers()["idempotency-key"] ?? "";
      receipt = {
        id: eventId,
        scenicAreaId: "liuzu-town",
        networkRevisionId,
        edgeId,
        edgeCode: "edge-field-1",
        status: submittedBody.status,
        incidentType: submittedBody.incidentType,
        operatorNote: submittedBody.operatorNote,
        sourceReference: submittedBody.sourceReference,
        reasonEvidenceReference: submittedBody.reasonEvidenceReference,
        startsAt: submittedBody.startsAt,
        expiresAt: submittedBody.expiresAt,
        expectedSnapshotRevision: 7,
        workflowRevision: 1,
        reviewDecision: null,
        activatedBySubject: "oidc:emergency-operator",
        activatedAt: "2026-08-16T10:00:00.000Z",
        reviewedBySubject: null,
        reviewedAt: null,
        reviewEvidenceReference: null,
        withdrawnAt: null,
        effectiveState: "ACTIVE_PENDING_REVIEW",
      };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, receipt }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId,
        overview: {
          schemaVersion: 1,
          scenicAreaId: "liuzu-town",
          actorRole: "OPERATIONS_EMERGENCY",
          serverTime: "2026-08-16T10:00:00.000Z",
          snapshot: { snapshotRevision: 7, networkRevisionId, networkRevision: "field-release-7", operationalVersion: 12, validUntil: "2026-08-17T10:00:00.000Z" },
          edges: [{ id: edgeId, edgeCode: "edge-field-1", fromNodeCode: "entrance-a", toNodeCode: "platform-b", distanceMeters: 145, safetyState: "OPEN", operationalStatus: "OPEN" }],
          events: receipt ? [receipt] : [],
        },
      }),
    });
  });

  await page.goto("/admin/route-operations");
  await expect(page.getByRole("heading", { name: "正式道路管制" })).toBeVisible();
  const activationForm = page.getByRole("region", { name: "立即新增管制事件" });
  await activationForm.getByLabel("正式路段", { exact: true }).selectOption(edgeId);
  await activationForm.getByLabel("现场说明（10–1000 字）").fill("浏览器自动化测试确认的安全事件，不代表真实景区道路情况。");
  await activationForm.getByLabel("来源记录 HTTPS").fill("https://evidence.example.test/operations/e2e-source");
  await activationForm.getByLabel("原因证据 HTTPS").fill("https://evidence.example.test/operations/e2e-reason");
  await activationForm.getByText("我确认该操作会立即使受影响的旧正式路线停止").click();
  await activationForm.getByRole("button", { name: "立即生效并进入复核" }).click();

  await expect(page.getByText(/管制事件已立即生效/)).toBeVisible();
  expect(submittedBody).toMatchObject({
    schemaVersion: 1,
    edgeId,
    status: "CLOSED",
    incidentType: "SAFETY_OBSERVATION",
    expectedSnapshotRevision: 7,
    acknowledgeImmediateRouteStop: true,
  });
  expect(idempotencyKey).toMatch(/^route-closure-[0-9a-f-]{36}$/i);
});
