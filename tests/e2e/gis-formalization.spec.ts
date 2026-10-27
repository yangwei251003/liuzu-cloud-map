import { expect, test } from "@playwright/test";

const requestId = "44444444-4444-4444-8444-444444444444";
const submissionId = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";

function draft(id: string, title: string, objectType: string, geometry: unknown, routingAttributes: unknown = null, visitAttributes: unknown = null) {
  return {
    schemaVersion: 2, id, scenicAreaId: "liuzu-town", title, objectType, geometry, coordinateSystem: "WGS84",
    source: { label: `虚构测试来源 ${title}`, url: `https://evidence.example.test/${id}`, capturedAt: "2026-08-15T01:00:00.000Z" },
    routingAttributes, visitAttributes, notes: null, verificationStatus: "CANDIDATE_DRAFT", publicationStatus: "LOCAL_DRAFT_ONLY",
    createdAt: "2026-08-15T01:00:00.000Z", updatedAt: "2026-08-15T01:00:00.000Z",
  };
}

const routing = { traversalMode: "WALKWAY", difficulty: "EASY", scenicScore: 60, accessibility: "VERIFIED_ACCESSIBLE", walkingTimeMultiplier: 1 };
const collection = {
  schemaVersion: 2, scenicAreaId: "liuzu-town", warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
  drafts: [
    draft("public-access", "虚构公共接入路", "PATH", { type: "LineString", coordinates: [[112.999, 22], [113, 22]] }, routing),
    draft("internal-walk", "虚构内部步道", "PATH", { type: "LineString", coordinates: [[113, 22], [113.001, 22]] }, routing),
    draft("main-entry", "虚构入口", "ENTRANCE", { type: "Point", coordinates: [113, 22] }),
    draft("fictional-poi", "虚构景点", "POI", { type: "Point", coordinates: [113.001, 22] }, null, { interests: ["NATURE"], dwellMinutes: 20, editorialPriority: 60, familyFriendly: true, restArea: false, photoSpot: true }),
    draft("boundary", "虚构边界", "BOUNDARY", { type: "Polygon", coordinates: [[[112.998, 21.999], [113.002, 21.999], [113.002, 22.001], [112.998, 22.001], [112.998, 21.999]]] }),
  ],
};

function submissionDetail() {
  return {
    schemaVersion: 1,
    receipt: { schemaVersion: 1, submissionId, scenicAreaId: "liuzu-town", submissionRevision: 9, workflowRevision: 2, state: "APPROVED_FOR_FORMALIZATION", objectCount: 5, contentSha256: "b".repeat(64), submittedAt: "2026-08-15T01:00:00.000Z", reviewedAt: "2026-08-16T01:00:00.000Z", decision: "APPROVE_FOR_FORMALIZATION", reviewEvidenceReference: "https://evidence.example.test/review" },
    reviewEligibility: "ELIGIBLE",
    collection,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: releaseId, scenicAreaId: "liuzu-town", submissionId, submissionRevision: 9,
    workflowRevision: 1, lifecycleState: "PREPARED", planSha256: "a".repeat(64), nodeCount: 4, edgeCount: 2, poiCount: 1,
    preparedBySubject: "oidc:gis-formalizer-b", preparedAt: "2026-08-16T02:00:00.000Z",
    validUntil: "2026-08-23T02:00:00.000Z", operationalExpiresAt: "2026-08-17T02:00:00.000Z",
    publishedBySubject: null, publishedAt: null, managementEvidenceReference: null, snapshotRevision: null,
    networkRevision: "r-9-aaaaaaaaaaaa",
    ...overrides,
  };
}

function overview(role: "GIS_REVIEWER" | "RELEASE_ADMIN", candidates: Record<string, unknown>[] = []) {
  return {
    schemaVersion: 1, scenicAreaId: "liuzu-town", actorRole: role, serverTime: "2026-08-16T02:00:00.000Z",
    approvedSubmissions: role === "GIS_REVIEWER" ? [{ submissionId, submissionRevision: 9, objectCount: 5, contentSha256: "b".repeat(64), reviewedAt: "2026-08-16T01:00:00.000Z" }] : [],
    candidates,
  };
}

test("a separate GIS reviewer prepares an exact-layer formalization candidate", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/gis-draft-submissions/${submissionId}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, detail: submissionDetail() }) }));
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/gis-formalizations", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, receipt: candidate() }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("GIS_REVIEWER") }) });
  });

  await page.goto("/admin/gis-formalization");
  await page.getByRole("button", { name: /候选版本 #9/ }).click();
  await expect(page.getByRole("heading", { name: /候选 #9/ })).toBeVisible();
  await page.getByLabel("数据提供方").fill("虚构测绘团队");
  await page.getByLabel("权利主体").fill("虚构权利主体");
  await page.getByLabel("正式来源 HTTPS").fill("https://evidence.example.test/formal-source");
  await page.getByLabel("现场核验 HTTPS").fill("https://evidence.example.test/field-review");
  await page.getByLabel("许可证明 HTTPS").fill("https://evidence.example.test/license");
  await page.getByLabel("坐标精度（米，≤50）").fill("2");
  await page.getByLabel("静态数据有效至（≤30天）").fill("2026-08-23T10:00");
  await page.getByLabel("初始运营状态有效至（≤72小时）").fill("2026-08-17T10:00");
  await page.getByLabel("运营状态来源 HTTPS").fill("https://evidence.example.test/initial-open");
  await page.getByLabel("运营责任方").fill("虚构运营值班台");
  await page.getByLabel("虚构公共接入路 路网分层").selectOption("PUBLIC");
  await page.getByLabel("虚构公共接入路 通行方向").selectOption("BIDIRECTIONAL");
  await page.getByLabel("虚构内部步道 路网分层").selectOption("INTERNAL");
  await page.getByLabel("虚构内部步道 通行方向").selectOption("BIDIRECTIONAL");
  await page.getByText("虚构入口").locator("select").selectOption("ENTRY");
  for (const text of ["我已核对每个拟发布对象", "我已核对许可允许展示", "我理解端点只按六位坐标", "我确认 NOTE 只保留"]) await page.getByText(text).click();
  await page.getByRole("button", { name: "生成不可变正式化候选" }).click();
  await expect(page.getByText(/不可变正式化候选已生成/)).toBeVisible();
  const submittedBody = submitted as Record<string, unknown> | null;
  expect(submittedBody).toMatchObject({ schemaVersion: 1, submissionId, acknowledgeExactTopologyNoImplicitSnapping: true, acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true });
  const policies = (submittedBody?.["pathPolicies"] ?? []) as Record<string, unknown>[];
  expect(policies.map((policy) => policy.layer)).toEqual(["PUBLIC", "INTERNAL"]);
});

test("release admin explicitly confirms initial open state and atomically publishes", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/gis-formalizations/${releaseId}/publish`, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, receipt: candidate({ workflowRevision: 2, lifecycleState: "PUBLISHED", publishedBySubject: "oidc:release-admin-c", publishedAt: "2026-08-16T02:05:00.000Z", managementEvidenceReference: "https://evidence.example.test/management-release", snapshotRevision: 12 }) }) });
  });
  await page.route("**/api/v1/admin/scenic-areas/liuzu-town/gis-formalizations", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, requestId, overview: overview("RELEASE_ADMIN", [candidate()]) }) }));

  await page.goto("/admin/gis-formalization");
  await page.getByLabel("管理发布证据 HTTPS").fill("https://evidence.example.test/management-release");
  for (const text of ["我确认发布事务会撤下旧正式快照", "我依据本次运营证据明确确认", "我确认新快照不会自动产生离线包"]) await page.getByText(text).click();
  await page.getByRole("button", { name: "原子发布此候选" }).click();
  await expect(page.getByText(/正式快照 revision 12 已原子发布/)).toBeVisible();
  expect(submitted).toMatchObject({ schemaVersion: 1, expectedWorkflowRevision: 1, acknowledgeAtomicReplacement: true, acknowledgeAllEdgesInitiallyOpen: true, acknowledgeOfflinePackRequiresSeparateRelease: true });
});
