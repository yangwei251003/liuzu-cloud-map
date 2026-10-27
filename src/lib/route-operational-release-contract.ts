export type RouteOperationalReleaseActorRole = "OPERATIONS_EMERGENCY" | "RELEASE_ADMIN";
export type RouteOperationalReleaseLifecycle = "PREPARED" | "PUBLISHED";

export type RouteOperationalReleaseSnapshot = {
  snapshotRevision: number;
  networkRevisionId: string;
  networkRevision: string;
  operationalVersion: number;
  validUntil: string;
};

export type RouteOperationalReleaseReceipt = {
  id: string;
  scenicAreaId: string;
  baseSnapshotRevision: number;
  targetSnapshotRevision: number;
  networkRevisionId: string;
  networkRevision: string;
  baseOperationalVersion: number;
  targetOperationalVersion: number;
  workflowRevision: 1 | 2;
  lifecycleState: RouteOperationalReleaseLifecycle;
  sourceReference: string;
  reasonSummary: string;
  snapshotSha256: string;
  confirmedEventCount: number;
  confirmedObservationCount: number;
  affectedEdgeCount: number;
  preparedBySubject: string;
  preparedAt: string;
  expiresAt: string;
  publishedBySubject: string | null;
  publishedAt: string | null;
  releaseEvidenceReference: string | null;
};

export type RouteOperationalReleaseOverview = {
  schemaVersion: 1;
  scenicAreaId: string;
  actorRole: RouteOperationalReleaseActorRole;
  serverTime: string;
  currentSnapshot: RouteOperationalReleaseSnapshot | null;
  pendingEventCount: number;
  confirmedEventCount: number;
  pendingObservationCount: number;
  confirmedObservationCount: number;
  candidate: RouteOperationalReleaseReceipt | null;
};

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SUBJECT_PATTERN = /^[^\u0000-\u001f\u007f\s]{1,255}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

function isPositiveRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 2_147_483_647;
}

function parseSnapshot(value: unknown): RouteOperationalReleaseSnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["snapshotRevision", "networkRevisionId", "networkRevision", "operationalVersion", "validUntil"])) return undefined;
  if (
    !isPositiveRevision(value.snapshotRevision)
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.networkRevision !== "string" || value.networkRevision.length < 1 || value.networkRevision.length > 100
    || !isPositiveRevision(value.operationalVersion)
    || !isIso(value.validUntil)
  ) return undefined;
  return value as RouteOperationalReleaseSnapshot;
}

export function parseRouteOperationalReleaseReceipt(value: unknown): RouteOperationalReleaseReceipt | null {
  const keys = [
    "id", "scenicAreaId", "baseSnapshotRevision", "targetSnapshotRevision", "networkRevisionId", "networkRevision",
    "baseOperationalVersion", "targetOperationalVersion", "workflowRevision", "lifecycleState", "sourceReference",
    "reasonSummary", "snapshotSha256", "confirmedEventCount", "confirmedObservationCount", "affectedEdgeCount", "preparedBySubject", "preparedAt",
    "expiresAt", "publishedBySubject", "publishedAt", "releaseEvidenceReference",
  ];
  if (!isRecord(value) || !exactKeys(value, keys)) return null;
  if (
    typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || !isPositiveRevision(value.baseSnapshotRevision) || !isPositiveRevision(value.targetSnapshotRevision)
    || Number(value.targetSnapshotRevision) <= Number(value.baseSnapshotRevision)
    || typeof value.networkRevisionId !== "string" || !UUID_PATTERN.test(value.networkRevisionId)
    || typeof value.networkRevision !== "string" || value.networkRevision.length < 1 || value.networkRevision.length > 100
    || !isPositiveRevision(value.baseOperationalVersion) || !isPositiveRevision(value.targetOperationalVersion)
    || Number(value.targetOperationalVersion) <= Number(value.baseOperationalVersion)
    || ![1, 2].includes(Number(value.workflowRevision))
    || !["PREPARED", "PUBLISHED"].includes(String(value.lifecycleState))
    || !isHttps(value.sourceReference)
    || typeof value.reasonSummary !== "string" || value.reasonSummary.trim() !== value.reasonSummary || value.reasonSummary.length < 10 || value.reasonSummary.length > 1000
    || typeof value.snapshotSha256 !== "string" || !SHA256_PATTERN.test(value.snapshotSha256)
    || !Number.isSafeInteger(value.confirmedEventCount) || Number(value.confirmedEventCount) < 0 || Number(value.confirmedEventCount) > 10_000
    || !Number.isSafeInteger(value.confirmedObservationCount) || Number(value.confirmedObservationCount) < 0 || Number(value.confirmedObservationCount) > 10_000
    || Number(value.confirmedEventCount) + Number(value.confirmedObservationCount) < 1
    || Number(value.confirmedEventCount) + Number(value.confirmedObservationCount) > 10_000
    || !Number.isSafeInteger(value.affectedEdgeCount) || Number(value.affectedEdgeCount) < 1
    || Number(value.affectedEdgeCount) > Number(value.confirmedEventCount) + Number(value.confirmedObservationCount)
    || typeof value.preparedBySubject !== "string" || !SUBJECT_PATTERN.test(value.preparedBySubject)
    || !isIso(value.preparedAt) || !isIso(value.expiresAt) || new Date(value.expiresAt).getTime() <= new Date(value.preparedAt).getTime()
    || !(value.publishedBySubject === null || (typeof value.publishedBySubject === "string" && SUBJECT_PATTERN.test(value.publishedBySubject)))
    || !(value.publishedAt === null || isIso(value.publishedAt))
    || !(value.releaseEvidenceReference === null || isHttps(value.releaseEvidenceReference))
  ) return null;
  const published = value.workflowRevision === 2 && value.lifecycleState === "PUBLISHED";
  if (
    published !== (value.publishedBySubject !== null && value.publishedAt !== null && value.releaseEvidenceReference !== null)
    || (!published && (value.workflowRevision !== 1 || value.lifecycleState !== "PREPARED"))
    || (value.publishedBySubject !== null && value.publishedBySubject === value.preparedBySubject)
  ) return null;
  return value as RouteOperationalReleaseReceipt;
}

export function parseRouteOperationalReleaseOverview(value: unknown): RouteOperationalReleaseOverview | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "scenicAreaId", "actorRole", "serverTime", "currentSnapshot", "pendingEventCount", "confirmedEventCount", "pendingObservationCount", "confirmedObservationCount", "candidate"]) || value.schemaVersion !== 1) return null;
  const currentSnapshot = parseSnapshot(value.currentSnapshot);
  const candidate = value.candidate === null ? null : parseRouteOperationalReleaseReceipt(value.candidate);
  if (
    typeof value.scenicAreaId !== "string" || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || !["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"].includes(String(value.actorRole))
    || !isIso(value.serverTime) || currentSnapshot === undefined
    || !Number.isSafeInteger(value.pendingEventCount) || Number(value.pendingEventCount) < 0 || Number(value.pendingEventCount) > 10_000
    || !Number.isSafeInteger(value.confirmedEventCount) || Number(value.confirmedEventCount) < 0 || Number(value.confirmedEventCount) > 10_000
    || !Number.isSafeInteger(value.pendingObservationCount) || Number(value.pendingObservationCount) < 0 || Number(value.pendingObservationCount) > 10_000
    || !Number.isSafeInteger(value.confirmedObservationCount) || Number(value.confirmedObservationCount) < 0 || Number(value.confirmedObservationCount) > 10_000
    || (value.candidate !== null && candidate === null)
    || (candidate !== null && candidate.scenicAreaId !== value.scenicAreaId)
  ) return null;
  return {
    schemaVersion: 1,
    scenicAreaId: value.scenicAreaId,
    actorRole: value.actorRole as RouteOperationalReleaseActorRole,
    serverTime: value.serverTime,
    currentSnapshot,
    pendingEventCount: Number(value.pendingEventCount),
    confirmedEventCount: Number(value.confirmedEventCount),
    pendingObservationCount: Number(value.pendingObservationCount),
    confirmedObservationCount: Number(value.confirmedObservationCount),
    candidate,
  };
}
