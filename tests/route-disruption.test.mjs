import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRouteDisruption,
  parsePublishedRouteSnapshot,
  parseRouteDisruptionPosition,
  ROUTE_DISRUPTION_MAX_ACCURACY_METERS,
} from "../src/lib/route-disruption.ts";

const checkedAt = new Date("2026-08-15T08:00:00.000Z");

const coordinate = (longitude, latitude) => ({
  longitude,
  latitude,
  coordinateSystem: "WGS84",
  accuracyMeters: 1.5,
  capturedAt: "2026-08-14T03:00:00.000Z",
  sourceReference: "TEST-EVIDENCE://field/coordinates-v4",
});

const accessibility = () => ({
  status: "UNKNOWN",
  checkedAt: null,
  expiresAt: null,
  evidenceReference: null,
});

const constraints = () => ({
  stairs: "NONE",
  surface: "PAVED",
  maxSlopePercent: 2,
  minWidthMeters: 1.8,
  lighting: "PRESENT",
  notes: [],
});

const status = (value = "OPEN") => ({
  status: value,
  checkedAt: "2026-08-15T07:55:00.000Z",
  expiresAt: "2026-08-15T09:00:00.000Z",
  sourceReference: "TEST-EVIDENCE://operations/route-status-v8",
  responsibleParty: "测试运营责任人",
});

function publishedNetwork() {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    revision: "network-field-v4",
    publicationStatus: "PUBLISHED",
    publishedAt: "2026-08-15T07:45:00.000Z",
    withdrawnAt: null,
    expiresAt: "2026-09-15T00:00:00.000Z",
    coordinateSystem: "WGS84",
    source: {
      sourceId: "field-package-v4",
      category: "AUTHORIZED_FIELD_SURVEY",
      provider: "测试合规 GIS 采集团队",
      acquiredAt: "2026-08-14T03:00:00.000Z",
      evidenceReference: "TEST-EVIDENCE://gis/network-field-v4",
    },
    rights: {
      status: "CLEARED",
      rightsHolder: "测试景区管理方",
      licenseReference: "TEST-EVIDENCE://rights/network-v4",
      validUntil: "2026-12-31T23:59:59.000Z",
      allowsDisplay: true,
      allowsRouting: true,
      allowsCaching: false,
      allowsDerivatives: false,
    },
    review: {
      status: "APPROVED",
      reviewedRevision: "network-field-v4",
      gisReviewer: "测试 GIS 审核员甲",
      managementApprover: "测试管理方代表乙",
      reviewedAt: "2026-08-15T07:20:00.000Z",
      expiresAt: "2026-09-15T00:00:00.000Z",
      evidenceReference: "TEST-EVIDENCE://review/network-field-v4",
    },
    entrances: [
      {
        id: "entrance-main",
        name: "测试主入口",
        type: "ENTRY_EXIT",
        coordinate: coordinate(112.22, 22.59),
        verification: {
          status: "MANAGEMENT_APPROVED",
          checkedAt: "2026-08-14T04:00:00.000Z",
          expiresAt: "2026-09-15T00:00:00.000Z",
          verifier: "测试现场核验员甲",
          managementApprover: "测试入口审批人乙",
          evidenceReference: "TEST-EVIDENCE://entrance/main-v3",
        },
        publicNodeId: "node-public-entrance",
        internalNodeId: "node-internal-entrance",
      },
    ],
    nodes: [
      { id: "node-public-arrival", layer: "PUBLIC", type: "TRANSIT", entranceId: null, coordinate: coordinate(112.219, 22.59) },
      { id: "node-public-entrance", layer: "PUBLIC", type: "ENTRANCE_CONNECTOR", entranceId: "entrance-main", coordinate: coordinate(112.22, 22.59) },
      { id: "node-internal-entrance", layer: "INTERNAL", type: "ENTRANCE_CONNECTOR", entranceId: "entrance-main", coordinate: coordinate(112.22, 22.59) },
      { id: "node-internal-main", layer: "INTERNAL", type: "DESTINATION", entranceId: null, coordinate: coordinate(112.221, 22.59) },
      { id: "node-internal-branch", layer: "INTERNAL", type: "FACILITY", entranceId: null, coordinate: coordinate(112.2215, 22.5905) },
    ],
    edges: [
      {
        id: "edge-public-arrival",
        layer: "PUBLIC",
        fromNodeId: "node-public-arrival",
        toNodeId: "node-public-entrance",
        walkingDirection: "BIDIRECTIONAL",
        geometry: { type: "LineString", coordinates: [[112.219, 22.59], [112.22, 22.59]] },
        distanceMeters: 102,
        estimatedMinutes: 2,
        verificationStatus: "MANAGEMENT_APPROVED",
        accessibility: accessibility(),
        constraints: constraints(),
        dynamicStatus: status(),
      },
      {
        id: "edge-internal-main",
        layer: "INTERNAL",
        fromNodeId: "node-internal-entrance",
        toNodeId: "node-internal-main",
        walkingDirection: "BIDIRECTIONAL",
        geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.221, 22.59]] },
        distanceMeters: 102,
        estimatedMinutes: 2,
        verificationStatus: "MANAGEMENT_APPROVED",
        accessibility: accessibility(),
        constraints: constraints(),
        dynamicStatus: status(),
      },
      {
        id: "edge-internal-branch",
        layer: "INTERNAL",
        fromNodeId: "node-internal-main",
        toNodeId: "node-internal-branch",
        walkingDirection: "BIDIRECTIONAL",
        geometry: { type: "LineString", coordinates: [[112.221, 22.59], [112.2215, 22.5905]] },
        distanceMeters: 75,
        estimatedMinutes: 1.5,
        verificationStatus: "MANAGEMENT_APPROVED",
        accessibility: accessibility(),
        constraints: constraints(),
        dynamicStatus: status(),
      },
    ],
  };
}

function routeSnapshot() {
  return {
    schemaVersion: 1,
    routePlanId: "route-field-v8",
    routeRevision: 8,
    scenicAreaId: "liuzu-town",
    networkRevision: "network-field-v4",
    trustStatus: "PUBLISHED_VALIDATED",
    validatedAt: "2026-08-15T07:50:00.000Z",
    expiresAt: "2026-08-15T09:00:00.000Z",
    edgeIds: ["edge-public-arrival", "edge-internal-main"],
    currentEdgeId: "edge-internal-main",
    corridorMeters: 30,
  };
}

function reliablePosition() {
  return {
    longitude: 112.2205,
    latitude: 22.59,
    coordinateSystem: "WGS84",
    accuracyMeters: 5,
    observedAt: "2026-08-15T07:59:50.000Z",
  };
}

function input() {
  return { network: publishedNetwork(), route: routeSnapshot(), position: reliablePosition() };
}

test("只有正式网络、可信路线、新鲜开放状态和走廊内可靠定位同时成立才 CONTINUE", () => {
  const result = evaluateRouteDisruption(input(), checkedAt);

  assert.equal(result.action, "CONTINUE");
  assert.equal(result.canContinue, true);
  assert.equal(result.code, "ON_PUBLISHED_CORRIDOR");
  assert.ok(result.offsetMeters < 1);
  assert.match(result.message, /仅支持继续查看已发布/);
  assert.match(result.safetyNotice, /不会生成捷径/);
  assert.match(result.safetyNotice, /不表示已经完成现场重算/);
});

test("正式网络不存在或撤回时停止并核验", () => {
  const missing = input();
  missing.network = null;
  assert.deepEqual(
    [evaluateRouteDisruption(missing, checkedAt).action, evaluateRouteDisruption(missing, checkedAt).code],
    ["STOP_AND_VERIFY", "NETWORK_UNAVAILABLE"],
  );

  const withdrawn = input();
  withdrawn.network.publicationStatus = "WITHDRAWN";
  withdrawn.network.withdrawnAt = "2026-08-15T07:58:00.000Z";
  const result = evaluateRouteDisruption(withdrawn, checkedAt);
  assert.equal(result.action, "STOP_AND_VERIFY");
  assert.equal(result.code, "NETWORK_UNAVAILABLE");
});

test("原型、未知或陈旧路线不能取得继续权限", () => {
  for (const trustStatus of ["UNVERIFIED_PROTOTYPE", "STALE", "UNKNOWN"]) {
    const candidate = input();
    candidate.route.trustStatus = trustStatus;
    const result = evaluateRouteDisruption(candidate, checkedAt);
    assert.equal(result.action, "REPLAN_REQUIRED");
    assert.equal(result.code, "ROUTE_UNTRUSTED");
    assert.equal(result.canContinue, false);
  }
});

test("路网 revision 变化、路线过期和不存在的当前边都要求重新校验", () => {
  const revisionChanged = input();
  revisionChanged.route.networkRevision = "network-field-old";
  assert.equal(evaluateRouteDisruption(revisionChanged, checkedAt).code, "ROUTE_REVISION_STALE");

  const expired = input();
  expired.route.expiresAt = "2026-08-15T07:59:59.000Z";
  assert.equal(evaluateRouteDisruption(expired, checkedAt).code, "ROUTE_REVISION_STALE");

  const missingEdge = input();
  missingEdge.route.currentEdgeId = "edge-not-in-route";
  assert.equal(evaluateRouteDisruption(missingEdge, checkedAt).code, "ROUTE_EDGE_MISSING");
});

test("任一路网动态状态过期都会失败关闭", () => {
  const candidate = input();
  candidate.network.edges[2].dynamicStatus.expiresAt = "2026-08-15T07:59:59.000Z";
  const result = evaluateRouteDisruption(candidate, checkedAt);

  assert.equal(result.action, "STOP_AND_VERIFY");
  assert.equal(result.code, "NETWORK_STATUS_EXPIRED");
  assert.match(result.message, /状态已过期/);
});

test("当前边 CLOSED 或 RESTRICTED 时停止自动导览并询问现场人员", () => {
  for (const [edgeStatus, code] of [["CLOSED", "CURRENT_EDGE_CLOSED"], ["RESTRICTED", "CURRENT_EDGE_RESTRICTED"]]) {
    const candidate = input();
    candidate.network.edges[1].dynamicStatus.status = edgeStatus;
    const result = evaluateRouteDisruption(candidate, checkedAt);
    assert.equal(result.action, "ASK_STAFF");
    assert.equal(result.code, code);
    assert.equal(result.canContinue, false);
    assert.match(`${result.message}${result.safetyNotice}`, /不会.*捷径|不会.*绕行/);
  }
});

test("当前边状态 UNKNOWN 时不沿用旧提示", () => {
  const candidate = input();
  candidate.network.edges[1].dynamicStatus.status = "UNKNOWN";
  const result = evaluateRouteDisruption(candidate, checkedAt);

  assert.equal(result.action, "STOP_AND_VERIFY");
  assert.equal(result.code, "EDGE_STATUS_UNKNOWN");
});

test("后续路段关闭不会触发伪绕行，只要求重新校验", () => {
  const candidate = input();
  candidate.route.edgeIds.push("edge-internal-branch");
  candidate.network.edges[2].dynamicStatus.status = "CLOSED";
  const result = evaluateRouteDisruption(candidate, checkedAt);

  assert.equal(result.action, "REPLAN_REQUIRED");
  assert.equal(result.code, "ROUTE_AHEAD_BLOCKED");
  assert.match(result.message, /不会自动生成绕行/);
});

test("定位精度不足、位置过时或时间位于未来时停止判断", () => {
  const lowAccuracy = input();
  lowAccuracy.position.accuracyMeters = ROUTE_DISRUPTION_MAX_ACCURACY_METERS + 1;
  assert.equal(evaluateRouteDisruption(lowAccuracy, checkedAt).code, "POSITION_UNRELIABLE");

  const stale = input();
  stale.position.observedAt = "2026-08-15T07:59:00.000Z";
  assert.equal(evaluateRouteDisruption(stale, checkedAt).code, "POSITION_UNRELIABLE");

  const future = input();
  future.position.observedAt = "2026-08-15T08:00:06.000Z";
  assert.equal(evaluateRouteDisruption(future, checkedAt).code, "POSITION_UNRELIABLE");
});

test("确认偏离走廊时 ASK_STAFF，误差圈压线时 STOP_AND_VERIFY", () => {
  const offRoute = input();
  offRoute.position.latitude = 22.591;
  const offResult = evaluateRouteDisruption(offRoute, checkedAt);
  assert.equal(offResult.action, "ASK_STAFF");
  assert.equal(offResult.code, "OFF_PUBLISHED_CORRIDOR");
  assert.ok(offResult.offsetMeters > offResult.corridorMeters);

  const ambiguous = input();
  ambiguous.position.latitude = 22.590315;
  ambiguous.position.accuracyMeters = 10;
  const ambiguousResult = evaluateRouteDisruption(ambiguous, checkedAt);
  assert.equal(ambiguousResult.action, "STOP_AND_VERIFY");
  assert.equal(ambiguousResult.code, "POSITION_AMBIGUOUS");
});

test("严格输入拒绝未知字段、错误坐标系和无效校验时钟", () => {
  assert.equal(parsePublishedRouteSnapshot({ ...routeSnapshot(), trusted: true }), null);
  assert.equal(parseRouteDisruptionPosition({ ...reliablePosition(), coordinateSystem: "GCJ-02" }), null);

  const extra = { ...input(), autoReroute: true };
  assert.equal(evaluateRouteDisruption(extra, checkedAt).code, "INPUT_INVALID");
  assert.equal(evaluateRouteDisruption(input(), new Date("invalid")).code, "INPUT_INVALID");
});

test("所有非继续决定都明确禁止继续，并保留无重算/无绕行声明", () => {
  const cases = [];
  const noNetwork = input();
  noNetwork.network = null;
  cases.push(noNetwork);
  const lowAccuracy = input();
  lowAccuracy.position.accuracyMeters = 80;
  cases.push(lowAccuracy);
  const closed = input();
  closed.network.edges[1].dynamicStatus.status = "CLOSED";
  cases.push(closed);

  for (const candidate of cases) {
    const result = evaluateRouteDisruption(candidate, checkedAt);
    assert.equal(result.canContinue, false);
    assert.match(result.safetyNotice, /不会生成捷径/);
    assert.match(result.safetyNotice, /不表示.*现场重算.*安全绕行/);
  }
});
