export type GisFormalizationActorRole = "GIS_REVIEWER" | "RELEASE_ADMIN";
export type GisFormalizationLifecycle = "PREPARED" | "PUBLISHED";
export type GisFormalizationPathLayer = "PUBLIC" | "INTERNAL";
export type GisFormalizationDirection = "FORWARD" | "REVERSE" | "BIDIRECTIONAL";
export type GisFormalizationEntranceType = "ENTRY" | "EXIT" | "ENTRY_EXIT";

export type GisFormalizationSubmissionSummary = {
  submissionId: string;
  submissionRevision: number;
  objectCount: number;
  contentSha256: string;
  reviewedAt: string;
};

export type GisFormalizationReceipt = {
  id: string;
  scenicAreaId: string;
  submissionId: string;
  submissionRevision: number;
  workflowRevision: 1 | 2;
  lifecycleState: GisFormalizationLifecycle;
  planSha256: string;
  nodeCount: number;
  edgeCount: number;
  poiCount: number;
  preparedBySubject: string;
  preparedAt: string;
  validUntil: string;
  operationalExpiresAt: string;
  publishedBySubject: string | null;
  publishedAt: string | null;
  managementEvidenceReference: string | null;
  snapshotRevision: number | null;
  networkRevision: string;
};

export type GisFormalizationOverview = {
  schemaVersion: 1;
  scenicAreaId: string;
  actorRole: GisFormalizationActorRole;
  serverTime: string;
  approvedSubmissions: GisFormalizationSubmissionSummary[];
  candidates: GisFormalizationReceipt[];
};

export type GisFormalizationPathPolicy = {
  draftId: string;
  layer: GisFormalizationPathLayer;
  walkingDirection: GisFormalizationDirection;
};

export type GisFormalizationEntrancePolicy = {
  draftId: string;
  type: GisFormalizationEntranceType;
};

export type PrepareGisFormalizationInput = {
  schemaVersion: 1;
  submissionId: string;
  expectedSubmissionWorkflowRevision: 2;
  providerName: string;
  sourceReference: string;
  fieldEvidenceReference: string;
  licenseReference: string;
  rightsHolder: string;
  coordinateAccuracyMeters: number;
  validUntil: string;
  operationalSourceReference: string;
  operationalResponsibleParty: string;
  operationalExpiresAt: string;
  pathPolicies: GisFormalizationPathPolicy[];
  entrancePolicies: GisFormalizationEntrancePolicy[];
  acknowledgeAllObjectSourcesVerified: true;
  acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true;
  acknowledgeExactTopologyNoImplicitSnapping: true;
  acknowledgeNotesExcludedFromPublication: true;
};

export type PublishGisFormalizationInput = {
  schemaVersion: 1;
  expectedWorkflowRevision: 1;
  managementEvidenceReference: string;
  acknowledgeAtomicReplacement: true;
  acknowledgeAllEdgesInitiallyOpen: true;
  acknowledgeOfflinePackRequiresSeparateRelease: true;
};

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCENIC_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const NETWORK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUBJECT_PATTERN = /^[^\u0000-\u001f\u007f\s]{1,255}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function isGisFormalizationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isGisFormalizationHttpsReference(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isPositiveRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 2_147_483_647;
}

function parseSubmissionSummary(value: unknown): GisFormalizationSubmissionSummary | null {
  if (!isRecord(value) || !exactKeys(value, ["submissionId", "submissionRevision", "objectCount", "contentSha256", "reviewedAt"])) return null;
  if (
    !isGisFormalizationUuid(value.submissionId)
    || !isPositiveRevision(value.submissionRevision)
    || !Number.isSafeInteger(value.objectCount) || Number(value.objectCount) < 1 || Number(value.objectCount) > 200
    || typeof value.contentSha256 !== "string" || !HASH_PATTERN.test(value.contentSha256)
    || !isIso(value.reviewedAt)
  ) return null;
  return value as GisFormalizationSubmissionSummary;
}

export function parseGisFormalizationReceipt(value: unknown): GisFormalizationReceipt | null {
  const keys = [
    "id", "scenicAreaId", "submissionId", "submissionRevision", "workflowRevision", "lifecycleState", "planSha256",
    "nodeCount", "edgeCount", "poiCount", "preparedBySubject", "preparedAt", "validUntil", "operationalExpiresAt",
    "publishedBySubject", "publishedAt", "managementEvidenceReference", "snapshotRevision", "networkRevision",
  ];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  if (
    !isGisFormalizationUuid(value.id) || typeof value.scenicAreaId !== "string" || !SCENIC_PATTERN.test(value.scenicAreaId)
    || !isGisFormalizationUuid(value.submissionId) || !isPositiveRevision(value.submissionRevision)
    || ![1, 2].includes(Number(value.workflowRevision)) || !["PREPARED", "PUBLISHED"].includes(String(value.lifecycleState))
    || typeof value.planSha256 !== "string" || !HASH_PATTERN.test(value.planSha256)
    || !Number.isSafeInteger(value.nodeCount) || Number(value.nodeCount) < 2 || Number(value.nodeCount) > 20_000
    || !Number.isSafeInteger(value.edgeCount) || Number(value.edgeCount) < 2 || Number(value.edgeCount) > 50_000
    || !Number.isSafeInteger(value.poiCount) || Number(value.poiCount) < 1 || Number(value.poiCount) > 10_000
    || typeof value.preparedBySubject !== "string" || !SUBJECT_PATTERN.test(value.preparedBySubject)
    || !isIso(value.preparedAt) || !isIso(value.validUntil) || !isIso(value.operationalExpiresAt)
    || new Date(value.validUntil).getTime() <= new Date(value.preparedAt).getTime()
    || new Date(value.operationalExpiresAt).getTime() <= new Date(value.preparedAt).getTime()
    || new Date(value.operationalExpiresAt).getTime() > new Date(value.validUntil).getTime()
    || !(value.publishedBySubject === null || (typeof value.publishedBySubject === "string" && SUBJECT_PATTERN.test(value.publishedBySubject)))
    || !(value.publishedAt === null || isIso(value.publishedAt))
    || !(value.managementEvidenceReference === null || isGisFormalizationHttpsReference(value.managementEvidenceReference))
    || !(value.snapshotRevision === null || isPositiveRevision(value.snapshotRevision))
    || typeof value.networkRevision !== "string" || !NETWORK_PATTERN.test(value.networkRevision) || value.networkRevision.length > 100
  ) return null;
  const published = value.workflowRevision === 2 && value.lifecycleState === "PUBLISHED";
  if (
    published !== (value.publishedBySubject !== null && value.publishedAt !== null && value.managementEvidenceReference !== null && value.snapshotRevision !== null)
    || (!published && (value.workflowRevision !== 1 || value.lifecycleState !== "PREPARED"))
    || (value.publishedBySubject !== null && value.publishedBySubject === value.preparedBySubject)
  ) return null;
  return value as GisFormalizationReceipt;
}

export function parseGisFormalizationOverview(value: unknown): GisFormalizationOverview | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "scenicAreaId", "actorRole", "serverTime", "approvedSubmissions", "candidates"]) || value.schemaVersion !== 1) return null;
  if (
    typeof value.scenicAreaId !== "string" || !SCENIC_PATTERN.test(value.scenicAreaId)
    || !["GIS_REVIEWER", "RELEASE_ADMIN"].includes(String(value.actorRole)) || !isIso(value.serverTime)
    || !Array.isArray(value.approvedSubmissions) || value.approvedSubmissions.length > 50
    || !Array.isArray(value.candidates) || value.candidates.length > 50
  ) return null;
  const approvedSubmissions = value.approvedSubmissions.map(parseSubmissionSummary);
  const candidates = value.candidates.map(parseGisFormalizationReceipt);
  if (approvedSubmissions.some((item) => item === null) || candidates.some((item) => item === null)) return null;
  return {
    schemaVersion: 1,
    scenicAreaId: value.scenicAreaId,
    actorRole: value.actorRole as GisFormalizationActorRole,
    serverTime: value.serverTime,
    approvedSubmissions: approvedSubmissions as GisFormalizationSubmissionSummary[],
    candidates: candidates as GisFormalizationReceipt[],
  };
}

function parsePathPolicy(value: unknown): GisFormalizationPathPolicy | null {
  if (!isRecord(value) || !exactKeys(value, ["draftId", "layer", "walkingDirection"])) return null;
  if (typeof value.draftId !== "string" || !ID_PATTERN.test(value.draftId) || !["PUBLIC", "INTERNAL"].includes(String(value.layer)) || !["FORWARD", "REVERSE", "BIDIRECTIONAL"].includes(String(value.walkingDirection))) return null;
  return value as GisFormalizationPathPolicy;
}

function parseEntrancePolicy(value: unknown): GisFormalizationEntrancePolicy | null {
  if (!isRecord(value) || !exactKeys(value, ["draftId", "type"])) return null;
  if (typeof value.draftId !== "string" || !ID_PATTERN.test(value.draftId) || !["ENTRY", "EXIT", "ENTRY_EXIT"].includes(String(value.type))) return null;
  return value as GisFormalizationEntrancePolicy;
}

export function parsePrepareGisFormalizationInput(value: unknown): PrepareGisFormalizationInput | null {
  const keys = [
    "schemaVersion", "submissionId", "expectedSubmissionWorkflowRevision", "providerName", "sourceReference",
    "fieldEvidenceReference", "licenseReference", "rightsHolder", "coordinateAccuracyMeters", "validUntil",
    "operationalSourceReference", "operationalResponsibleParty", "operationalExpiresAt", "pathPolicies", "entrancePolicies",
    "acknowledgeAllObjectSourcesVerified", "acknowledgeRightsPermitDisplayRoutingCachingDerivatives",
    "acknowledgeExactTopologyNoImplicitSnapping", "acknowledgeNotesExcludedFromPublication",
  ];
  if (!isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || !isGisFormalizationUuid(value.submissionId) || value.expectedSubmissionWorkflowRevision !== 2) return null;
  if (
    typeof value.providerName !== "string" || value.providerName.trim() !== value.providerName || value.providerName.length < 2 || value.providerName.length > 200
    || !isGisFormalizationHttpsReference(value.sourceReference) || !isGisFormalizationHttpsReference(value.fieldEvidenceReference)
    || !isGisFormalizationHttpsReference(value.licenseReference)
    || typeof value.rightsHolder !== "string" || value.rightsHolder.trim() !== value.rightsHolder || value.rightsHolder.length < 2 || value.rightsHolder.length > 200
    || typeof value.coordinateAccuracyMeters !== "number" || !Number.isFinite(value.coordinateAccuracyMeters) || value.coordinateAccuracyMeters <= 0 || value.coordinateAccuracyMeters > 50
    || !isIso(value.validUntil) || !isGisFormalizationHttpsReference(value.operationalSourceReference)
    || typeof value.operationalResponsibleParty !== "string" || value.operationalResponsibleParty.trim() !== value.operationalResponsibleParty || value.operationalResponsibleParty.length < 2 || value.operationalResponsibleParty.length > 200
    || !isIso(value.operationalExpiresAt) || !Array.isArray(value.pathPolicies) || value.pathPolicies.length < 2 || value.pathPolicies.length > 200
    || !Array.isArray(value.entrancePolicies) || value.entrancePolicies.length < 1 || value.entrancePolicies.length > 50
    || value.acknowledgeAllObjectSourcesVerified !== true || value.acknowledgeRightsPermitDisplayRoutingCachingDerivatives !== true
    || value.acknowledgeExactTopologyNoImplicitSnapping !== true || value.acknowledgeNotesExcludedFromPublication !== true
  ) return null;
  const pathPolicies = value.pathPolicies.map(parsePathPolicy);
  const entrancePolicies = value.entrancePolicies.map(parseEntrancePolicy);
  if (pathPolicies.some((item) => item === null) || entrancePolicies.some((item) => item === null)) return null;
  if (new Set(pathPolicies.map((item) => item!.draftId)).size !== pathPolicies.length || new Set(entrancePolicies.map((item) => item!.draftId)).size !== entrancePolicies.length) return null;
  return { ...(value as PrepareGisFormalizationInput), pathPolicies: pathPolicies as GisFormalizationPathPolicy[], entrancePolicies: entrancePolicies as GisFormalizationEntrancePolicy[] };
}

export function parsePublishGisFormalizationInput(value: unknown): PublishGisFormalizationInput | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "expectedWorkflowRevision", "managementEvidenceReference", "acknowledgeAtomicReplacement", "acknowledgeAllEdgesInitiallyOpen", "acknowledgeOfflinePackRequiresSeparateRelease"])) return null;
  if (
    value.schemaVersion !== 1 || value.expectedWorkflowRevision !== 1 || !isGisFormalizationHttpsReference(value.managementEvidenceReference)
    || value.acknowledgeAtomicReplacement !== true || value.acknowledgeAllEdgesInitiallyOpen !== true || value.acknowledgeOfflinePackRequiresSeparateRelease !== true
  ) return null;
  return value as PublishGisFormalizationInput;
}
