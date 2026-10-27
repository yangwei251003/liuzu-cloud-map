export const ROUTE_CROWD_LEVELS = ["LOW", "MODERATE", "HIGH"] as const;
export const ROUTE_WEATHER_IMPACTS = ["NONE", "RAIN", "HEAT", "WIND", "MULTIPLE"] as const;

export type RouteCrowdLevel = (typeof ROUTE_CROWD_LEVELS)[number];
export type RouteWeatherImpact = (typeof ROUTE_WEATHER_IMPACTS)[number];
export type RouteOperationalObservationRole = "OPERATIONS_EDITOR" | "OPERATIONS_REVIEWER";
export type RouteOperationalObservationDecision = "CONFIRMED" | "REJECTED";
export type RouteOperationalObservationEffectiveState = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED";

export type RouteOperationalObservationSnapshot = {
  snapshotRevision: number;
  networkRevisionId: string;
  networkRevision: string;
  operationalVersion: number;
  validUntil: string;
};

export type RouteOperationalObservationEdge = {
  id: string;
  edgeCode: string;
  fromNodeCode: string;
  toNodeCode: string;
  distanceMeters: number;
  operationalStatus: "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";
  currentTravelTimeMultiplier: number | null;
  currentCrowdLevel: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN" | null;
  currentWeatherImpact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE" | "UNKNOWN" | null;
};

export type RouteOperationalObservationReceipt = {
  id: string;
  scenicAreaId: string;
  networkRevisionId: string;
  edgeId: string;
  edgeCode: string;
  crowdLevel: RouteCrowdLevel;
  weatherImpact: RouteWeatherImpact;
  travelTimeMultiplier: number;
  operatorNote: string;
  sourceReference: string;
  observedAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  workflowRevision: 1 | 2;
  reviewDecision: RouteOperationalObservationDecision | null;
  submittedBySubject: string;
  submittedAt: string;
  reviewedBySubject: string | null;
  reviewedAt: string | null;
  reviewEvidenceReference: string | null;
  effectiveState: RouteOperationalObservationEffectiveState;
};

export type RouteOperationalObservationOverview = {
  schemaVersion: 1;
  scenicAreaId: string;
  actorRole: RouteOperationalObservationRole;
  serverTime: string;
  snapshot: RouteOperationalObservationSnapshot | null;
  edges: RouteOperationalObservationEdge[];
  observations: RouteOperationalObservationReceipt[];
};

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const SUBJECT_PATTERN = /^[^\u0000-\u001f\u007f\s]{1,255}$/;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

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

function positiveRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 2_147_483_647;
}

function nullable<T>(value: unknown, parser: (candidate: unknown) => candidate is T): value is T | null {
  return value === null || parser(value);
}

function parseSnapshot(value: unknown): RouteOperationalObservationSnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["snapshotRevision", "networkRevisionId", "networkRevision", "operationalVersion", "validUntil"])) return undefined;
  if (
    !positiveRevision(value.snapshotRevision)
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.networkRevision !== "string" || value.networkRevision.length < 1 || value.networkRevision.length > 100
    || !positiveRevision(value.operationalVersion) || !isIso(value.validUntil)
  ) return undefined;
  return value as RouteOperationalObservationSnapshot;
}

function parseEdge(value: unknown): RouteOperationalObservationEdge | null {
  if (!isRecord(value) || !exactKeys(value, ["id", "edgeCode", "fromNodeCode", "toNodeCode", "distanceMeters", "operationalStatus", "currentTravelTimeMultiplier", "currentCrowdLevel", "currentWeatherImpact"])) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.edgeCode !== "string" || !CODE_PATTERN.test(value.edgeCode)
    || typeof value.fromNodeCode !== "string" || !CODE_PATTERN.test(value.fromNodeCode)
    || typeof value.toNodeCode !== "string" || !CODE_PATTERN.test(value.toNodeCode)
    || typeof value.distanceMeters !== "number" || !Number.isFinite(value.distanceMeters) || value.distanceMeters <= 0
    || !["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].includes(String(value.operationalStatus))
    || !(value.currentTravelTimeMultiplier === null || (typeof value.currentTravelTimeMultiplier === "number" && Number.isFinite(value.currentTravelTimeMultiplier) && value.currentTravelTimeMultiplier >= 0.5 && value.currentTravelTimeMultiplier <= 5))
    || !(value.currentCrowdLevel === null || ["LOW", "MODERATE", "HIGH", "UNKNOWN"].includes(String(value.currentCrowdLevel)))
    || !(value.currentWeatherImpact === null || ["NONE", "RAIN", "HEAT", "WIND", "MULTIPLE", "UNKNOWN"].includes(String(value.currentWeatherImpact)))
  ) return null;
  return value as RouteOperationalObservationEdge;
}

export function parseRouteOperationalObservationReceipt(value: unknown): RouteOperationalObservationReceipt | null {
  const keys = [
    "id", "scenicAreaId", "networkRevisionId", "edgeId", "edgeCode", "crowdLevel", "weatherImpact",
    "travelTimeMultiplier", "operatorNote", "sourceReference", "observedAt", "expiresAt",
    "expectedSnapshotRevision", "workflowRevision", "reviewDecision", "submittedBySubject", "submittedAt",
    "reviewedBySubject", "reviewedAt", "reviewEvidenceReference", "effectiveState",
  ];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.edgeId !== "string" || !UUID_PATTERN.test(value.edgeId)
    || typeof value.edgeCode !== "string" || !CODE_PATTERN.test(value.edgeCode)
    || !(ROUTE_CROWD_LEVELS as readonly unknown[]).includes(value.crowdLevel)
    || !(ROUTE_WEATHER_IMPACTS as readonly unknown[]).includes(value.weatherImpact)
    || typeof value.travelTimeMultiplier !== "number" || !Number.isFinite(value.travelTimeMultiplier) || value.travelTimeMultiplier < 1 || value.travelTimeMultiplier > 3
    || (value.travelTimeMultiplier === 1 && (value.crowdLevel !== "LOW" || value.weatherImpact !== "NONE"))
    || typeof value.operatorNote !== "string" || value.operatorNote.trim() !== value.operatorNote || value.operatorNote.length < 10 || value.operatorNote.length > 1000
    || !isHttps(value.sourceReference) || !isIso(value.observedAt) || !isIso(value.expiresAt) || !isIso(value.submittedAt)
    || new Date(value.expiresAt).getTime() <= Math.max(new Date(value.observedAt).getTime(), new Date(value.submittedAt).getTime())
    || !positiveRevision(value.expectedSnapshotRevision) || ![1, 2].includes(Number(value.workflowRevision))
    || !(value.reviewDecision === null || ["CONFIRMED", "REJECTED"].includes(String(value.reviewDecision)))
    || typeof value.submittedBySubject !== "string" || !SUBJECT_PATTERN.test(value.submittedBySubject)
    || !nullable(value.reviewedBySubject, (candidate): candidate is string => typeof candidate === "string" && SUBJECT_PATTERN.test(candidate))
    || !nullable(value.reviewedAt, isIso) || !nullable(value.reviewEvidenceReference, isHttps)
    || !["PENDING_REVIEW", "CONFIRMED", "REJECTED", "EXPIRED"].includes(String(value.effectiveState))
  ) return null;
  const reviewed = value.workflowRevision === 2;
  if (
    (!reviewed && (value.reviewDecision !== null || value.reviewedBySubject !== null || value.reviewedAt !== null || value.reviewEvidenceReference !== null))
    || (reviewed && (value.reviewDecision === null || value.reviewedBySubject === null || value.reviewedAt === null || value.reviewEvidenceReference === null))
    || (value.reviewedBySubject !== null && value.reviewedBySubject === value.submittedBySubject)
  ) return null;
  return value as RouteOperationalObservationReceipt;
}

export function parseRouteOperationalObservationOverview(value: unknown): RouteOperationalObservationOverview | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "scenicAreaId", "actorRole", "serverTime", "snapshot", "edges", "observations"]) || value.schemaVersion !== 1) return null;
  const snapshot = parseSnapshot(value.snapshot);
  if (
    typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || !["OPERATIONS_EDITOR", "OPERATIONS_REVIEWER"].includes(String(value.actorRole))
    || !isIso(value.serverTime) || snapshot === undefined
    || !Array.isArray(value.edges) || value.edges.length > 10_000
    || !Array.isArray(value.observations) || value.observations.length > 200
  ) return null;
  const edges = value.edges.map(parseEdge);
  const observations = value.observations.map(parseRouteOperationalObservationReceipt);
  if (edges.some((edge) => edge === null) || observations.some((observation) => observation === null)) return null;
  if (snapshot === null && edges.length > 0) return null;
  if (new Set(edges.map((edge) => edge!.id)).size !== edges.length || new Set(observations.map((item) => item!.id)).size !== observations.length) return null;
  return { schemaVersion: 1, scenicAreaId: value.scenicAreaId, actorRole: value.actorRole as RouteOperationalObservationRole, serverTime: value.serverTime, snapshot, edges: edges as RouteOperationalObservationEdge[], observations: observations as RouteOperationalObservationReceipt[] };
}
