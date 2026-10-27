import assert from "node:assert/strict";
import test from "node:test";
import {
  createReleaseEvidenceTemplate,
  evaluateReleaseReadiness,
  parseReleaseEvidenceBundle,
} from "../src/lib/release-readiness.ts";

const checkedAt = new Date("2026-08-15T08:00:00.000Z");

function validEvidenceBundle() {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    generatedAt: "2026-08-15T07:30:00.000Z",
    gis: {
      boundaryRevision: "boundary-field-v3",
      entranceRevision: "entrance-field-v2",
      internalNetworkRevision: "network-field-v5",
      coordinateSystem: "GCJ-02",
      coordinateTransformVerified: true,
      sourceReference: "TEST-EVIDENCE://gis/field-package-v5",
      validUntil: "2026-11-15T00:00:00.000Z",
    },
    operations: {
      statusRevision: "operations-test-v4",
      sourceReference: "TEST-EVIDENCE://operations/status-v4",
      responsibleParty: "测试运营责任人",
      validFrom: "2026-08-15T00:00:00.000Z",
      validUntil: "2026-08-31T23:59:59.000Z",
    },
    content: {
      knowledgeManifestRevision: "knowledge-test-v7",
      narrationManifestRevision: "narration-test-v6",
      rightsStatus: "CLEARED",
      qualityGateId: "quality-test-run-14",
      qualityGateResult: "PASS",
      validUntil: "2026-10-15T00:00:00.000Z",
    },
    routeValidations: [
      {
        routeId: "route-test-core-loop",
        routeRevision: 3,
        result: "PASS",
        forwardWalked: true,
        reverseWalked: true,
        weakNetworkChecked: true,
        accessibilityChecked: true,
        emergencyFallbackChecked: true,
        checkedAt: "2026-08-14T08:00:00.000Z",
        validUntil: "2026-09-15T00:00:00.000Z",
        evidenceReference: "TEST-EVIDENCE://routes/core-loop/field-run-3",
        fieldChecker: "测试现场核验员甲",
        managementApprover: "测试管理方代表乙",
      },
    ],
    approvals: {
      gisReviewer: "测试GIS审核员甲",
      contentReviewer: "测试内容审核员乙",
      rightsReviewer: "测试权利审核员丙",
      operationsReviewer: "测试运营审核员丁",
      releaseAdministrator: "测试发布管理员戊",
      managementApprovalReference: "TEST-EVIDENCE://management/release-approval-9",
      approvedAt: "2026-08-15T07:45:00.000Z",
    },
  };
}

test("证据完整时只进入服务端复核，不会在本地生成正式 READY", () => {
  const result = evaluateReleaseReadiness(validEvidenceBundle(), checkedAt);

  assert.equal(result.status, "READY_FOR_SERVER_REVIEW");
  assert.deepEqual(result.issues, []);
  assert.notEqual(result.status, "READY");
  assert.match(result.bundleRevision, /^liuzu-town\|boundary-field-v3\|/);
});

test("空白模板故意失败关闭，不携带伪审核或伪现场结论", () => {
  const template = createReleaseEvidenceTemplate();
  const result = evaluateReleaseReadiness(template, checkedAt);

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.issues.map(({ code }) => code), ["BUNDLE_SCHEMA_INVALID"]);
  assert.equal(template.routeValidations.length, 0);
  assert.equal(template.approvals.gisReviewer, "");
  assert.equal(template.gis.coordinateTransformVerified, false);
});

test("严格 schema 拒绝未知字段、重复路线和无效景区标识", () => {
  const withUnknownField = { ...validEvidenceBundle(), trusted: true };
  assert.equal(parseReleaseEvidenceBundle(withUnknownField), null);

  const duplicateRoute = validEvidenceBundle();
  duplicateRoute.routeValidations.push(structuredClone(duplicateRoute.routeValidations[0]));
  assert.equal(parseReleaseEvidenceBundle(duplicateRoute), null);

  const invalidScenicArea = validEvidenceBundle();
  invalidScenicArea.scenicAreaId = "六祖镇";
  assert.equal(parseReleaseEvidenceBundle(invalidScenicArea), null);
});

test("其他景区的合法证据包不能误用于六祖镇", () => {
  const bundle = validEvidenceBundle();
  bundle.scenicAreaId = "another-scenic-area";
  const result = evaluateReleaseReadiness(bundle, checkedAt);

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(({ code }) => code === "SCENIC_AREA_INVALID"));
});

test("GIS、运营、内容与现场证据任一过期都会阻断", () => {
  const bundle = validEvidenceBundle();
  bundle.gis.validUntil = "2026-08-15T07:59:59.000Z";
  bundle.operations.validUntil = "2026-08-15T07:59:59.000Z";
  bundle.content.validUntil = "2026-08-15T07:59:59.000Z";
  bundle.routeValidations[0].validUntil = "2026-08-15T07:59:59.000Z";

  const result = evaluateReleaseReadiness(bundle, checkedAt);
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(
    new Set(result.issues.map(({ code }) => code)),
    new Set(["GIS_EXPIRED", "OPERATIONS_EXPIRED", "CONTENT_EXPIRED", "ROUTE_VALIDATION_EXPIRED"]),
  );
});

test("坐标、权利、质量、实走和职责分离必须同时成立", () => {
  const bundle = validEvidenceBundle();
  bundle.gis.coordinateTransformVerified = false;
  bundle.content.rightsStatus = "PENDING";
  bundle.content.qualityGateResult = "FAIL";
  bundle.routeValidations[0].reverseWalked = false;
  bundle.approvals.releaseAdministrator = bundle.approvals.contentReviewer;

  const result = evaluateReleaseReadiness(bundle, checkedAt);
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(
    new Set(result.issues.map(({ code }) => code)),
    new Set([
      "GIS_EVIDENCE_MISSING",
      "CONTENT_RIGHTS_BLOCKED",
      "QUALITY_GATE_BLOCKED",
      "ROUTE_VALIDATION_INCOMPLETE",
      "SEPARATION_OF_DUTIES_REQUIRED",
    ]),
  );
});

test("没有现场路线记录或现场结果失败时拒绝放行", () => {
  const missing = validEvidenceBundle();
  missing.routeValidations = [];
  assert.deepEqual(
    evaluateReleaseReadiness(missing, checkedAt).issues.map(({ code }) => code),
    ["ROUTE_VALIDATION_MISSING"],
  );

  const failed = validEvidenceBundle();
  failed.routeValidations[0].result = "FAIL";
  assert.ok(evaluateReleaseReadiness(failed, checkedAt).issues.some(({ code }) => code === "ROUTE_VALIDATION_FAILED"));
});

test("未来审核与倒置有效期被判定为时间证据错误", () => {
  const bundle = validEvidenceBundle();
  bundle.operations.validUntil = bundle.operations.validFrom;
  bundle.routeValidations[0].checkedAt = "2026-08-16T08:00:00.000Z";
  bundle.routeValidations[0].validUntil = "2026-08-16T07:00:00.000Z";
  bundle.approvals.approvedAt = "2026-08-16T08:00:00.000Z";

  const result = evaluateReleaseReadiness(bundle, checkedAt);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.filter(({ code }) => code === "BUNDLE_TIME_INVALID").length >= 4);
});

test("无效校验时钟会失败关闭", () => {
  const result = evaluateReleaseReadiness(validEvidenceBundle(), new Date("invalid"));
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.issues.map(({ code }) => code), ["BUNDLE_TIME_INVALID"]);
});
