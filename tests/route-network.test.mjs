import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getSafePublishedNetwork,
  parseRouteNetwork,
  validateRouteNetwork,
} from "../src/lib/route-network.ts";

const checkedAt = new Date("2026-08-15T08:00:00.000Z");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const coordinate = (longitude, latitude) => ({
  longitude,
  latitude,
  coordinateSystem: "WGS84",
  accuracyMeters: 1.5,
  capturedAt: "2026-08-14T03:00:00.000Z",
  sourceReference: "TEST-EVIDENCE://field/coordinate-pack-v3",
});

const accessibilityUnknown = () => ({
  status: "UNKNOWN",
  checkedAt: null,
  expiresAt: null,
  evidenceReference: null,
});

const constraints = () => ({
  stairs: "NONE",
  surface: "PAVED",
  maxSlopePercent: 3.2,
  minWidthMeters: 1.8,
  lighting: "PRESENT",
  notes: ["测试数据，不代表真实景区情况。"],
});

const dynamicStatus = (status = "OPEN") => ({
  status,
  checkedAt: "2026-08-15T07:30:00.000Z",
  expiresAt: "2026-08-16T08:00:00.000Z",
  sourceReference: "TEST-EVIDENCE://operations/status-v5",
  responsibleParty: "测试运营责任人",
});

function validPublishedNetwork() {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    revision: "network-field-v3",
    publicationStatus: "PUBLISHED",
    publishedAt: "2026-08-15T07:45:00.000Z",
    withdrawnAt: null,
    expiresAt: "2026-09-15T00:00:00.000Z",
    coordinateSystem: "WGS84",
    source: {
      sourceId: "field-package-v3",
      category: "AUTHORIZED_FIELD_SURVEY",
      provider: "测试合规 GIS 采集团队",
      acquiredAt: "2026-08-14T03:00:00.000Z",
      evidenceReference: "TEST-EVIDENCE://gis/network-field-v3",
    },
    rights: {
      status: "CLEARED",
      rightsHolder: "测试景区管理方",
      licenseReference: "TEST-EVIDENCE://rights/network-v3",
      validUntil: "2026-12-31T23:59:59.000Z",
      allowsDisplay: true,
      allowsRouting: true,
      allowsCaching: false,
      allowsDerivatives: false,
    },
    review: {
      status: "APPROVED",
      reviewedRevision: "network-field-v3",
      gisReviewer: "测试 GIS 审核员甲",
      managementApprover: "测试管理方代表乙",
      reviewedAt: "2026-08-15T07:20:00.000Z",
      expiresAt: "2026-09-15T00:00:00.000Z",
      evidenceReference: "TEST-EVIDENCE://review/network-field-v3",
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
          evidenceReference: "TEST-EVIDENCE://entrances/main-v2",
        },
        publicNodeId: "node-public-entrance",
        internalNodeId: "node-internal-entrance",
      },
    ],
    nodes: [
      { id: "node-public-arrival", layer: "PUBLIC", type: "TRANSIT", entranceId: null, coordinate: coordinate(112.219, 22.59) },
      { id: "node-public-entrance", layer: "PUBLIC", type: "ENTRANCE_CONNECTOR", entranceId: "entrance-main", coordinate: coordinate(112.22, 22.59) },
      { id: "node-internal-entrance", layer: "INTERNAL", type: "ENTRANCE_CONNECTOR", entranceId: "entrance-main", coordinate: coordinate(112.22, 22.59) },
      { id: "node-internal-destination", layer: "INTERNAL", type: "DESTINATION", entranceId: null, coordinate: coordinate(112.221, 22.59) },
      { id: "node-internal-closed-branch", layer: "INTERNAL", type: "FACILITY", entranceId: null, coordinate: coordinate(112.2215, 22.5905) },
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
        accessibility: accessibilityUnknown(),
        constraints: constraints(),
        dynamicStatus: dynamicStatus(),
      },
      {
        id: "edge-internal-main",
        layer: "INTERNAL",
        fromNodeId: "node-internal-entrance",
        toNodeId: "node-internal-destination",
        walkingDirection: "BIDIRECTIONAL",
        geometry: { type: "LineString", coordinates: [[112.22, 22.59], [112.221, 22.59]] },
        distanceMeters: 102,
        estimatedMinutes: 2,
        verificationStatus: "MANAGEMENT_APPROVED",
        accessibility: {
          status: "VERIFIED_ACCESSIBLE",
          checkedAt: "2026-08-14T05:00:00.000Z",
          expiresAt: "2026-09-15T00:00:00.000Z",
          evidenceReference: "TEST-EVIDENCE://accessibility/internal-main-v2",
        },
        constraints: constraints(),
        dynamicStatus: dynamicStatus(),
      },
      {
        id: "edge-internal-closed-branch",
        layer: "INTERNAL",
        fromNodeId: "node-internal-destination",
        toNodeId: "node-internal-closed-branch",
        walkingDirection: "BIDIRECTIONAL",
        geometry: { type: "LineString", coordinates: [[112.221, 22.59], [112.2215, 22.5905]] },
        distanceMeters: 75,
        estimatedMinutes: 1.5,
        verificationStatus: "MANAGEMENT_APPROVED",
        accessibility: accessibilityUnknown(),
        constraints: constraints(),
        dynamicStatus: dynamicStatus("CLOSED"),
      },
    ],
  };
}

test("严格发布包通过后，安全读取只保留当前 OPEN 边", () => {
  const input = validPublishedNetwork();
  const result = validateRouteNetwork(input, checkedAt);
  const safe = getSafePublishedNetwork(input, checkedAt);

  assert.equal(result.status, "PUBLISHABLE");
  assert.deepEqual(result.issues, []);
  assert.ok(safe);
  assert.deepEqual(safe.edges.map(({ id }) => id), ["edge-public-arrival", "edge-internal-main"]);
  assert.notStrictEqual(safe, input);
  assert.equal(input.edges.length, 3, "纯逻辑读取不得修改调用方输入");
});

test("仓库内正式路网清单明确为空，并始终失败关闭", async () => {
  const file = path.join(projectRoot, "public", "data", "gis", "route-network-manifest.v1.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const parsed = parseRouteNetwork(manifest);
  const result = validateRouteNetwork(manifest, checkedAt);

  assert.ok(parsed, "空清单仍须满足数据交换 schema");
  assert.equal(parsed.publicationStatus, "DRAFT");
  assert.deepEqual(parsed.entrances, []);
  assert.deepEqual(parsed.nodes, []);
  assert.deepEqual(parsed.edges, []);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(({ code }) => code === "NO_ENTRANCE"));
  assert.equal(getSafePublishedNetwork(manifest, checkedAt), null);
});

test("顶层或嵌套未知字段，以及错误坐标系都会被 schema 拒绝", () => {
  assert.equal(parseRouteNetwork({ ...validPublishedNetwork(), trusted: true }), null);

  const nestedUnknown = validPublishedNetwork();
  nestedUnknown.edges[0].dynamicStatus.trusted = true;
  assert.equal(parseRouteNetwork(nestedUnknown), null);

  const wrongCrs = validPublishedNetwork();
  wrongCrs.entrances[0].coordinate.coordinateSystem = "GCJ-02";
  assert.equal(parseRouteNetwork(wrongCrs), null);
  assert.deepEqual(validateRouteNetwork(wrongCrs, checkedAt).issues.map(({ code }) => code), ["SCHEMA_INVALID"]);
});

test("撤回、数据集过期或边状态过期任一条件都会拒绝", () => {
  const withdrawn = validPublishedNetwork();
  withdrawn.publicationStatus = "WITHDRAWN";
  withdrawn.withdrawnAt = "2026-08-15T07:55:00.000Z";
  assert.ok(validateRouteNetwork(withdrawn, checkedAt).issues.some(({ code }) => code === "WITHDRAWN"));

  const datasetExpired = validPublishedNetwork();
  datasetExpired.expiresAt = "2026-08-15T07:59:59.000Z";
  assert.ok(validateRouteNetwork(datasetExpired, checkedAt).issues.some(({ code }) => code === "DATASET_EXPIRED"));

  const statusExpired = validPublishedNetwork();
  statusExpired.edges[0].dynamicStatus.expiresAt = "2026-08-15T07:59:59.000Z";
  assert.ok(validateRouteNetwork(statusExpired, checkedAt).issues.some(({ code }) => code === "STATUS_EXPIRED"));
});

test("没有入口或入口没有现场与管理方双重核验时拒绝", () => {
  const noEntrance = validPublishedNetwork();
  noEntrance.entrances = [];
  assert.ok(validateRouteNetwork(noEntrance, checkedAt).issues.some(({ code }) => code === "NO_ENTRANCE"));

  const unverified = validPublishedNetwork();
  unverified.entrances[0].verification.status = "UNVERIFIED";
  assert.ok(validateRouteNetwork(unverified, checkedAt).issues.some(({ code }) => code === "ENTRANCE_UNVERIFIED"));
});

test("公共/内部边不能跨层，且所有节点必须连到核验入口", () => {
  const crossLayer = validPublishedNetwork();
  crossLayer.edges[0].layer = "INTERNAL";
  assert.ok(validateRouteNetwork(crossLayer, checkedAt).issues.some(({ code }) => code === "CROSS_LAYER_EDGE"));

  const disconnected = validPublishedNetwork();
  disconnected.nodes.push({ id: "node-public-orphan", layer: "PUBLIC", type: "JUNCTION", entranceId: null, coordinate: coordinate(112.218, 22.589) });
  assert.ok(validateRouteNetwork(disconnected, checkedAt).issues.some(({ code }) => code === "NETWORK_DISCONNECTED"));
});

test("入口的公共/内部连接节点必须同点且正确互引", () => {
  const mismatched = validPublishedNetwork();
  mismatched.nodes.find(({ id }) => id === "node-internal-entrance").coordinate.longitude += 0.0001;
  assert.ok(validateRouteNetwork(mismatched, checkedAt).issues.some(({ code }) => code === "ENTRANCE_CONNECTION_INVALID"));
});

test("OSM 原型即使形状完整也只能保持 UNVERIFIED，不能改名成正式网络", () => {
  const prototype = validPublishedNetwork();
  prototype.source.category = "OPEN_DATA_PROTOTYPE";
  prototype.source.provider = "OpenStreetMap contributors";
  prototype.edges.forEach((edge) => { edge.verificationStatus = "UNVERIFIED_OSM_PROTOTYPE"; });

  const result = validateRouteNetwork(prototype, checkedAt);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(({ code }) => code === "SOURCE_UNPUBLISHABLE"));
  assert.ok(result.issues.some(({ code }) => code === "EDGE_UNVERIFIED"));
  assert.equal(getSafePublishedNetwork(prototype, checkedAt), null);

  const renamedOnly = structuredClone(prototype);
  renamedOnly.edges.forEach((edge) => { edge.verificationStatus = "MANAGEMENT_APPROVED"; });
  assert.ok(validateRouteNetwork(renamedOnly, checkedAt).issues.some(({ code }) => code === "SOURCE_UNPUBLISHABLE"));

  const statusOnly = structuredClone(prototype);
  statusOnly.source.category = "AUTHORIZED_FIELD_SURVEY";
  assert.ok(validateRouteNetwork(statusOnly, checkedAt).issues.some(({ code }) => code === "EDGE_UNVERIFIED"));
});

test("动态状态全部关闭时，不会返回伪造的跨层可走网络", () => {
  const closed = validPublishedNetwork();
  closed.edges.forEach((edge) => { edge.dynamicStatus.status = "CLOSED"; });
  const result = validateRouteNetwork(closed, checkedAt);

  assert.ok(result.issues.some(({ code }) => code === "NO_OPEN_CROSS_LAYER_CONNECTION"));
  assert.equal(getSafePublishedNetwork(closed, checkedAt), null);
});

test("无障碍结论要么明确 UNKNOWN，要么带当前有效证据", () => {
  const staleAccessibility = validPublishedNetwork();
  staleAccessibility.edges[1].accessibility.expiresAt = "2026-08-15T07:59:59.000Z";
  assert.ok(validateRouteNetwork(staleAccessibility, checkedAt).issues.some(({ code }) => code === "ACCESSIBILITY_EVIDENCE_INVALID"));

  const inventedUnknownEvidence = validPublishedNetwork();
  inventedUnknownEvidence.edges[0].accessibility.checkedAt = "2026-08-14T05:00:00.000Z";
  assert.ok(validateRouteNetwork(inventedUnknownEvidence, checkedAt).issues.some(({ code }) => code === "ACCESSIBILITY_EVIDENCE_INVALID"));
});

test("重复 ID、其他景区和无效校验时钟均失败关闭", () => {
  const duplicate = validPublishedNetwork();
  duplicate.edges.push(structuredClone(duplicate.edges[0]));
  assert.ok(validateRouteNetwork(duplicate, checkedAt).issues.some(({ code }) => code === "DUPLICATE_ID"));

  const wrongArea = validPublishedNetwork();
  wrongArea.scenicAreaId = "another-scenic-area";
  assert.ok(validateRouteNetwork(wrongArea, checkedAt).issues.some(({ code }) => code === "SCENIC_AREA_MISMATCH"));

  assert.deepEqual(validateRouteNetwork(validPublishedNetwork(), new Date("invalid")).issues.map(({ code }) => code), ["CLOCK_INVALID"]);
});
