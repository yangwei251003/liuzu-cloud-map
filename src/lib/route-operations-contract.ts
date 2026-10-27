export const ROUTE_CLOSURE_INCIDENT_TYPES = [
  "WEATHER",
  "DAMAGE",
  "CROWD_CONTROL",
  "MAINTENANCE",
  "EVENT_CONTROL",
  "SAFETY_OBSERVATION",
  "OTHER",
] as const;

export type RouteClosureIncidentType = (typeof ROUTE_CLOSURE_INCIDENT_TYPES)[number];
export type RouteClosureStatus = "CLOSED" | "RESTRICTED";
export type RouteClosureReviewDecision = "CONFIRMED" | "WITHDRAWN";
export type RouteClosureEffectiveState = "SCHEDULED" | "ACTIVE_PENDING_REVIEW" | "ACTIVE_CONFIRMED" | "WITHDRAWN" | "EXPIRED";

export type RouteOperationsSnapshot = {
  snapshotRevision: number;
  networkRevisionId: string;
  networkRevision: string;
  operationalVersion: number;
  validUntil: string;
};

export type RouteOperationsEdge = {
  id: string;
  edgeCode: string;
  fromNodeCode: string;
  toNodeCode: string;
  distanceMeters: number;
  safetyState: "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";
  operationalStatus: "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";
};

export type RouteClosureReceipt = {
  id: string;
  scenicAreaId: string;
  networkRevisionId: string;
  edgeId: string;
  edgeCode: string;
  status: RouteClosureStatus;
  incidentType: RouteClosureIncidentType;
  operatorNote: string;
  sourceReference: string;
  reasonEvidenceReference: string;
  startsAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  workflowRevision: 1 | 2;
  reviewDecision: RouteClosureReviewDecision | null;
  activatedBySubject: string;
  activatedAt: string;
  reviewedBySubject: string | null;
  reviewedAt: string | null;
  reviewEvidenceReference: string | null;
  withdrawnAt: string | null;
  effectiveState: RouteClosureEffectiveState;
};

export type RouteOperationsOverview = {
  schemaVersion: 1;
  scenicAreaId: string;
  actorRole: "OPERATIONS_EMERGENCY" | "RELEASE_ADMIN";
  serverTime: string;
  snapshot: RouteOperationsSnapshot | null;
  edges: RouteOperationsEdge[];
  events: RouteClosureReceipt[];
};

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const SUBJECT_PATTERN = /^[^\u0000-\u001f\u007f\s]{1,255}$/;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isHttps(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function nullableText(value: unknown, validator: (candidate: unknown) => candidate is string): value is string | null {
  return value === null || validator(value);
}

function parseSnapshot(value: unknown): RouteOperationsSnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["snapshotRevision", "networkRevisionId", "networkRevision", "operationalVersion", "validUntil"])) return undefined;
  if (
    !Number.isSafeInteger(value.snapshotRevision) || Number(value.snapshotRevision) < 1
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.networkRevision !== "string" || value.networkRevision.length < 1 || value.networkRevision.length > 100
    || !Number.isSafeInteger(value.operationalVersion) || Number(value.operationalVersion) < 1
    || !isIso(value.validUntil)
  ) return undefined;
  return {
    snapshotRevision: Number(value.snapshotRevision),
    networkRevisionId: value.networkRevisionId,
    networkRevision: value.networkRevision,
    operationalVersion: Number(value.operationalVersion),
    validUntil: value.validUntil,
  };
}

function parseEdge(value: unknown): RouteOperationsEdge | null {
  if (!isRecord(value) || !exactKeys(value, ["id", "edgeCode", "fromNodeCode", "toNodeCode", "distanceMeters", "safetyState", "operationalStatus"])) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.edgeCode !== "string" || !CODE_PATTERN.test(value.edgeCode)
    || typeof value.fromNodeCode !== "string" || !CODE_PATTERN.test(value.fromNodeCode)
    || typeof value.toNodeCode !== "string" || !CODE_PATTERN.test(value.toNodeCode)
    || typeof value.distanceMeters !== "number" || !Number.isFinite(value.distanceMeters) || value.distanceMeters <= 0
    || !["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].includes(String(value.safetyState))
    || !["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].includes(String(value.operationalStatus))
  ) return null;
  return value as RouteOperationsEdge;
}

export function parseRouteClosureReceipt(value: unknown): RouteClosureReceipt | null {
  const keys = [
    "id", "scenicAreaId", "networkRevisionId", "edgeId", "edgeCode", "status", "incidentType",
    "operatorNote", "sourceReference", "reasonEvidenceReference", "startsAt", "expiresAt",
    "expectedSnapshotRevision", "workflowRevision", "reviewDecision", "activatedBySubject", "activatedAt",
    "reviewedBySubject", "reviewedAt", "reviewEvidenceReference", "withdrawnAt", "effectiveState",
  ];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.edgeId !== "string" || !UUID_PATTERN.test(value.edgeId)
    || typeof value.edgeCode !== "string" || !CODE_PATTERN.test(value.edgeCode)
    || !["CLOSED", "RESTRICTED"].includes(String(value.status))
    || !(ROUTE_CLOSURE_INCIDENT_TYPES as readonly unknown[]).includes(value.incidentType)
    || typeof value.operatorNote !== "string" || value.operatorNote.length < 10 || value.operatorNote.length > 1000
    || !isHttps(value.sourceReference) || !isHttps(value.reasonEvidenceReference)
    || !isIso(value.startsAt) || !isIso(value.expiresAt) || new Date(value.expiresAt).getTime() <= new Date(value.startsAt).getTime()
    || !Number.isSafeInteger(value.expectedSnapshotRevision) || Number(value.expectedSnapshotRevision) < 1
    || ![1, 2].includes(Number(value.workflowRevision))
    || !(value.reviewDecision === null || ["CONFIRMED", "WITHDRAWN"].includes(String(value.reviewDecision)))
    || typeof value.activatedBySubject !== "string" || !SUBJECT_PATTERN.test(value.activatedBySubject)
    || !isIso(value.activatedAt)
    || !nullableText(value.reviewedBySubject, (candidate): candidate is string => typeof candidate === "string" && SUBJECT_PATTERN.test(candidate))
    || !nullableText(value.reviewedAt, isIso)
    || !nullableText(value.reviewEvidenceReference, isHttps)
    || !nullableText(value.withdrawnAt, isIso)
    || !["SCHEDULED", "ACTIVE_PENDING_REVIEW", "ACTIVE_CONFIRMED", "WITHDRAWN", "EXPIRED"].includes(String(value.effectiveState))
  ) return null;
  const reviewed = value.workflowRevision === 2;
  if (
    (!reviewed && (value.reviewDecision !== null || value.reviewedBySubject !== null || value.reviewedAt !== null || value.reviewEvidenceReference !== null || value.withdrawnAt !== null))
    || (reviewed && (value.reviewDecision === null || value.reviewedBySubject === null || value.reviewedAt === null || value.reviewEvidenceReference === null))
    || (value.reviewDecision === "WITHDRAWN") !== (value.withdrawnAt !== null)
    || (value.reviewedBySubject !== null && value.reviewedBySubject === value.activatedBySubject)
  ) return null;
  return value as RouteClosureReceipt;
}

export function parseRouteOperationsOverview(value: unknown): RouteOperationsOverview | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "scenicAreaId", "actorRole", "serverTime", "snapshot", "edges", "events"]) || value.schemaVersion !== 1) return null;
  const snapshot = parseSnapshot(value.snapshot);
  if (
    typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || !["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"].includes(String(value.actorRole))
    || !isIso(value.serverTime) || snapshot === undefined
    || !Array.isArray(value.edges) || value.edges.length > 10_000
    || !Array.isArray(value.events) || value.events.length > 200
  ) return null;
  const edges = value.edges.map(parseEdge);
  const events = value.events.map(parseRouteClosureReceipt);
  if (edges.some((edge) => edge === null) || events.some((event) => event === null)) return null;
  if (snapshot === null && edges.length > 0) return null;
  if (new Set(edges.map((edge) => edge!.id)).size !== edges.length || new Set(events.map((event) => event!.id)).size !== events.length) return null;
  return { schemaVersion: 1, scenicAreaId: value.scenicAreaId, actorRole: value.actorRole as RouteOperationsOverview["actorRole"], serverTime: value.serverTime, snapshot, edges: edges as RouteOperationsEdge[], events: events as RouteClosureReceipt[] };
}
