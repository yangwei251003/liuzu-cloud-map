export type ReleaseEvidenceBundle = {
  schemaVersion: 1;
  scenicAreaId: string;
  generatedAt: string;
  gis: {
    boundaryRevision: string;
    entranceRevision: string;
    internalNetworkRevision: string;
    coordinateSystem: "WGS84" | "GCJ-02";
    coordinateTransformVerified: boolean;
    sourceReference: string;
    validUntil: string;
  };
  operations: {
    statusRevision: string;
    sourceReference: string;
    responsibleParty: string;
    validFrom: string;
    validUntil: string;
  };
  content: {
    knowledgeManifestRevision: string;
    narrationManifestRevision: string;
    rightsStatus: "CLEARED" | "PENDING" | "RESTRICTED" | "UNKNOWN";
    qualityGateId: string;
    qualityGateResult: "PASS" | "FAIL" | "NOT_RUN";
    validUntil: string;
  };
  routeValidations: Array<{
    routeId: string;
    routeRevision: number;
    result: "PASS" | "FAIL";
    forwardWalked: boolean;
    reverseWalked: boolean;
    weakNetworkChecked: boolean;
    accessibilityChecked: boolean;
    emergencyFallbackChecked: boolean;
    checkedAt: string;
    validUntil: string;
    evidenceReference: string;
    fieldChecker: string;
    managementApprover: string;
  }>;
  approvals: {
    gisReviewer: string;
    contentReviewer: string;
    rightsReviewer: string;
    operationsReviewer: string;
    releaseAdministrator: string;
    managementApprovalReference: string;
    approvedAt: string;
  };
};

export type ReleaseReadinessIssue = {
  code:
    | "BUNDLE_SCHEMA_INVALID"
    | "SCENIC_AREA_INVALID"
    | "BUNDLE_TIME_INVALID"
    | "GIS_EVIDENCE_MISSING"
    | "GIS_EXPIRED"
    | "OPERATIONS_EVIDENCE_MISSING"
    | "OPERATIONS_EXPIRED"
    | "CONTENT_EVIDENCE_MISSING"
    | "CONTENT_RIGHTS_BLOCKED"
    | "QUALITY_GATE_BLOCKED"
    | "CONTENT_EXPIRED"
    | "ROUTE_VALIDATION_MISSING"
    | "ROUTE_VALIDATION_FAILED"
    | "ROUTE_VALIDATION_INCOMPLETE"
    | "ROUTE_VALIDATION_EXPIRED"
    | "APPROVAL_MISSING"
    | "SEPARATION_OF_DUTIES_REQUIRED";
  path: string;
  message: string;
};

export type ReleaseReadinessResult = {
  status: "READY_FOR_SERVER_REVIEW" | "BLOCKED";
  checkedAt: string;
  bundleRevision: string;
  issues: ReleaseReadinessIssue[];
};

type UnknownRecord = Record<string, unknown>;

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = 300) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isIso = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());

function parseRouteValidation(value: unknown): ReleaseEvidenceBundle["routeValidations"][number] | null {
  if (!isRecord(value) || !exactKeys(value, ["routeId", "routeRevision", "result", "forwardWalked", "reverseWalked", "weakNetworkChecked", "accessibilityChecked", "emergencyFallbackChecked", "checkedAt", "validUntil", "evidenceReference", "fieldChecker", "managementApprover"])) return null;
  if (!isText(value.routeId, 100) || !Number.isInteger(value.routeRevision) || (value.routeRevision as number) < 1 || !["PASS", "FAIL"].includes(String(value.result))) return null;
  if (![value.forwardWalked, value.reverseWalked, value.weakNetworkChecked, value.accessibilityChecked, value.emergencyFallbackChecked].every((item) => typeof item === "boolean")) return null;
  if (!isIso(value.checkedAt) || !isIso(value.validUntil) || !isText(value.evidenceReference, 500) || !isText(value.fieldChecker, 100) || !isText(value.managementApprover, 100)) return null;
  return value as ReleaseEvidenceBundle["routeValidations"][number];
}

export function parseReleaseEvidenceBundle(value: unknown): ReleaseEvidenceBundle | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "scenicAreaId", "generatedAt", "gis", "operations", "content", "routeValidations", "approvals"]) || value.schemaVersion !== 1 || !isText(value.scenicAreaId, 80) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.scenicAreaId as string) || !isIso(value.generatedAt)) return null;
  if (!isRecord(value.gis) || !exactKeys(value.gis, ["boundaryRevision", "entranceRevision", "internalNetworkRevision", "coordinateSystem", "coordinateTransformVerified", "sourceReference", "validUntil"])) return null;
  if (![value.gis.boundaryRevision, value.gis.entranceRevision, value.gis.internalNetworkRevision].every((item) => isText(item, 100)) || !["WGS84", "GCJ-02"].includes(String(value.gis.coordinateSystem)) || typeof value.gis.coordinateTransformVerified !== "boolean" || !isText(value.gis.sourceReference, 500) || !isIso(value.gis.validUntil)) return null;
  if (!isRecord(value.operations) || !exactKeys(value.operations, ["statusRevision", "sourceReference", "responsibleParty", "validFrom", "validUntil"])) return null;
  if (!isText(value.operations.statusRevision, 100) || !isText(value.operations.sourceReference, 500) || !isText(value.operations.responsibleParty, 100) || !isIso(value.operations.validFrom) || !isIso(value.operations.validUntil)) return null;
  if (!isRecord(value.content) || !exactKeys(value.content, ["knowledgeManifestRevision", "narrationManifestRevision", "rightsStatus", "qualityGateId", "qualityGateResult", "validUntil"])) return null;
  if (!isText(value.content.knowledgeManifestRevision, 100) || !isText(value.content.narrationManifestRevision, 100) || !["CLEARED", "PENDING", "RESTRICTED", "UNKNOWN"].includes(String(value.content.rightsStatus)) || !isText(value.content.qualityGateId, 100) || !["PASS", "FAIL", "NOT_RUN"].includes(String(value.content.qualityGateResult)) || !isIso(value.content.validUntil)) return null;
  if (!Array.isArray(value.routeValidations) || value.routeValidations.length > 100) return null;
  const routes = value.routeValidations.map(parseRouteValidation);
  if (routes.some((item) => item === null) || new Set(routes.map((item) => item?.routeId)).size !== routes.length) return null;
  if (!isRecord(value.approvals) || !exactKeys(value.approvals, ["gisReviewer", "contentReviewer", "rightsReviewer", "operationsReviewer", "releaseAdministrator", "managementApprovalReference", "approvedAt"])) return null;
  if (![value.approvals.gisReviewer, value.approvals.contentReviewer, value.approvals.rightsReviewer, value.approvals.operationsReviewer, value.approvals.releaseAdministrator].every((item) => isText(item, 100)) || !isText(value.approvals.managementApprovalReference, 500) || !isIso(value.approvals.approvedAt)) return null;
  return value as ReleaseEvidenceBundle;
}

function revisionOf(bundle: ReleaseEvidenceBundle) {
  return [bundle.scenicAreaId, bundle.gis.boundaryRevision, bundle.gis.entranceRevision, bundle.gis.internalNetworkRevision, bundle.operations.statusRevision, bundle.content.knowledgeManifestRevision, bundle.content.narrationManifestRevision, ...bundle.routeValidations.map((route) => `${route.routeId}@${route.routeRevision}`)].join("|");
}

export function evaluateReleaseReadiness(value: unknown, now = new Date(), expectedScenicAreaId = "liuzu-town"): ReleaseReadinessResult {
  if (Number.isNaN(now.getTime())) {
    return {
      status: "BLOCKED",
      checkedAt: new Date(0).toISOString(),
      bundleRevision: "invalid-time",
      issues: [{ code: "BUNDLE_TIME_INVALID", path: "$now", message: "校验时钟无效，系统已失败关闭。" }],
    };
  }
  const checkedAt = now.toISOString();
  const bundle = parseReleaseEvidenceBundle(value);
  if (!bundle) return { status: "BLOCKED", checkedAt, bundleRevision: "invalid", issues: [{ code: "BUNDLE_SCHEMA_INVALID", path: "$", message: "证据包不符合严格 schema，已拒绝进入 READY。" }] };
  const issues: ReleaseReadinessIssue[] = [];
  const expired = (value: string) => new Date(value).getTime() <= now.getTime();
  const tooFarInFuture = (value: string) => new Date(value).getTime() > now.getTime() + 5 * 60_000;
  if (bundle.scenicAreaId !== expectedScenicAreaId) issues.push({ code: "SCENIC_AREA_INVALID", path: "scenicAreaId", message: `证据包属于 ${bundle.scenicAreaId}，当前只能校验 ${expectedScenicAreaId}。` });
  if (new Date(bundle.generatedAt).getTime() > now.getTime() + 5 * 60_000) issues.push({ code: "BUNDLE_TIME_INVALID", path: "generatedAt", message: "证据包生成时间位于未来，不能用于发布。" });
  if (!bundle.gis.coordinateTransformVerified) issues.push({ code: "GIS_EVIDENCE_MISSING", path: "gis.coordinateTransformVerified", message: "坐标转换尚未验证。" });
  if (expired(bundle.gis.validUntil)) issues.push({ code: "GIS_EXPIRED", path: "gis.validUntil", message: "GIS 发布证据已过期。" });
  if (new Date(bundle.operations.validFrom).getTime() > now.getTime()) issues.push({ code: "OPERATIONS_EVIDENCE_MISSING", path: "operations.validFrom", message: "运营状态尚未生效。" });
  if (new Date(bundle.operations.validUntil).getTime() <= new Date(bundle.operations.validFrom).getTime()) issues.push({ code: "BUNDLE_TIME_INVALID", path: "operations.validUntil", message: "运营状态有效期必须晚于生效时间。" });
  if (expired(bundle.operations.validUntil)) issues.push({ code: "OPERATIONS_EXPIRED", path: "operations.validUntil", message: "运营状态证据已过期。" });
  if (bundle.content.rightsStatus !== "CLEARED") issues.push({ code: "CONTENT_RIGHTS_BLOCKED", path: "content.rightsStatus", message: "讲解与内容权利未清晰放行。" });
  if (bundle.content.qualityGateResult !== "PASS") issues.push({ code: "QUALITY_GATE_BLOCKED", path: "content.qualityGateResult", message: "AI/内容质量门禁未通过。" });
  if (expired(bundle.content.validUntil)) issues.push({ code: "CONTENT_EXPIRED", path: "content.validUntil", message: "内容 manifest 已过期。" });
  if (!bundle.routeValidations.length) issues.push({ code: "ROUTE_VALIDATION_MISSING", path: "routeValidations", message: "至少需要一条现场路线校验记录。" });
  bundle.routeValidations.forEach((route, index) => {
    if (tooFarInFuture(route.checkedAt)) issues.push({ code: "BUNDLE_TIME_INVALID", path: `routeValidations.${index}.checkedAt`, message: `${route.routeId} 的现场校验时间位于未来。` });
    if (new Date(route.validUntil).getTime() <= new Date(route.checkedAt).getTime()) issues.push({ code: "BUNDLE_TIME_INVALID", path: `routeValidations.${index}.validUntil`, message: `${route.routeId} 的有效期必须晚于现场校验时间。` });
    if (route.result !== "PASS") issues.push({ code: "ROUTE_VALIDATION_FAILED", path: `routeValidations.${index}.result`, message: `${route.routeId} 的现场校验未通过。` });
    if (![route.forwardWalked, route.reverseWalked, route.weakNetworkChecked, route.accessibilityChecked, route.emergencyFallbackChecked].every(Boolean)) issues.push({ code: "ROUTE_VALIDATION_INCOMPLETE", path: `routeValidations.${index}`, message: `${route.routeId} 尚未完成正反向、弱网、无障碍与应急检查。` });
    if (expired(route.validUntil)) issues.push({ code: "ROUTE_VALIDATION_EXPIRED", path: `routeValidations.${index}.validUntil`, message: `${route.routeId} 的现场校验已过期。` });
  });
  if (tooFarInFuture(bundle.approvals.approvedAt)) issues.push({ code: "BUNDLE_TIME_INVALID", path: "approvals.approvedAt", message: "管理审核时间位于未来。" });
  const actors = [bundle.approvals.gisReviewer, bundle.approvals.contentReviewer, bundle.approvals.rightsReviewer, bundle.approvals.operationsReviewer, bundle.approvals.releaseAdministrator].map((item) => item.trim().toLocaleLowerCase());
  if (new Set(actors).size !== actors.length) issues.push({ code: "SEPARATION_OF_DUTIES_REQUIRED", path: "approvals", message: "GIS、内容、权利、运营审核人与发布管理员必须为不同操作者。" });
  return { status: issues.length ? "BLOCKED" : "READY_FOR_SERVER_REVIEW", checkedAt, bundleRevision: revisionOf(bundle), issues };
}

export function createReleaseEvidenceTemplate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    generatedAt: "",
    gis: { boundaryRevision: "", entranceRevision: "", internalNetworkRevision: "", coordinateSystem: "WGS84", coordinateTransformVerified: false, sourceReference: "", validUntil: "" },
    operations: { statusRevision: "", sourceReference: "", responsibleParty: "", validFrom: "", validUntil: "" },
    content: { knowledgeManifestRevision: "", narrationManifestRevision: "", rightsStatus: "PENDING", qualityGateId: "", qualityGateResult: "NOT_RUN", validUntil: "" },
    routeValidations: [],
    approvals: { gisReviewer: "", contentReviewer: "", rightsReviewer: "", operationsReviewer: "", releaseAdministrator: "", managementApprovalReference: "", approvedAt: "" },
  };
}
