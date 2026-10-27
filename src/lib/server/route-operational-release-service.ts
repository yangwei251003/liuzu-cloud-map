import { createHash } from "node:crypto";

import {
  parseRouteOperationalReleaseOverview,
  parseRouteOperationalReleaseReceipt,
  type RouteOperationalReleaseActorRole,
  type RouteOperationalReleaseOverview,
  type RouteOperationalReleaseReceipt,
} from "../route-operational-release-contract";

export type RouteOperationalReleaseActor = {
  scenicAreaId: string;
  oidcSubject: string;
  role: RouteOperationalReleaseActorRole;
};

export type PrepareRouteOperationalReleaseCommand = {
  actor: RouteOperationalReleaseActor;
  expectedSnapshotRevision: number;
  sourceReference: string;
  reasonSummary: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type PublishRouteOperationalReleaseCommand = {
  actor: RouteOperationalReleaseActor;
  releaseId: string;
  expectedWorkflowRevision: 1;
  releaseEvidenceReference: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type RouteOperationalReleaseRepository = {
  readOverview(command: { actor: RouteOperationalReleaseActor; at: string }): Promise<RouteOperationalReleaseOverview>;
  prepare(command: PrepareRouteOperationalReleaseCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; receipt: RouteOperationalReleaseReceipt }
    | { state: "NO_CURRENT_SNAPSHOT" | "SNAPSHOT_CHANGED" | "PENDING_EVENTS" | "PENDING_OBSERVATIONS" | "NO_REVIEWED_SOURCES" | "CANDIDATE_EXISTS" | "INSUFFICIENT_VALIDITY" | "IDEMPOTENCY_CONFLICT" | "SOURCE_SNAPSHOT_INVALID" }
  >;
  publish(command: PublishRouteOperationalReleaseCommand): Promise<
    | { state: "PUBLISHED" | "REPLAYED"; receipt: RouteOperationalReleaseReceipt }
    | { state: "NOT_FOUND" | "REVISION_CONFLICT" | "PREPARER_CANNOT_PUBLISH" | "BASE_SNAPSHOT_CHANGED" | "CLOSURE_SET_CHANGED" | "OBSERVATION_SET_CHANGED" | "CANDIDATE_EXPIRED" | "IDEMPOTENCY_CONFLICT" | "SOURCE_SNAPSHOT_INVALID" }
  >;
};

export type PrepareRouteOperationalReleaseInput = {
  schemaVersion: 1;
  expectedSnapshotRevision: number;
  sourceReference: string;
  reasonSummary: string;
  acknowledgeConfirmedEventsOnly: true;
  acknowledgeReviewedFactorsOnly: true;
};

export type PublishRouteOperationalReleaseInput = {
  schemaVersion: 1;
  expectedWorkflowRevision: 1;
  releaseEvidenceReference: string;
  acknowledgeAtomicReplacement: true;
  acknowledgeOfflinePacksInvalidated: true;
};

type UnknownRecord = Record<string, unknown>;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isHttpsReference(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validActor(actor: RouteOperationalReleaseActor, role?: RouteOperationalReleaseActorRole) {
  return SCENIC_AREA_PATTERN.test(actor.scenicAreaId)
    && typeof actor.oidcSubject === "string" && actor.oidcSubject.length > 0 && actor.oidcSubject.length <= 255
    && !/[\s\u0000-\u001f\u007f]/.test(actor.oidcSubject)
    && ["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"].includes(actor.role)
    && (role === undefined || actor.role === role);
}

function hashIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value)
    ? createHash("sha256").update(value, "utf8").digest("hex")
    : null;
}

export function parsePrepareRouteOperationalReleaseInput(value: unknown): PrepareRouteOperationalReleaseInput | null {
  const keys = ["schemaVersion", "expectedSnapshotRevision", "sourceReference", "reasonSummary", "acknowledgeConfirmedEventsOnly", "acknowledgeReviewedFactorsOnly"];
  if (
    !isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.expectedSnapshotRevision) || Number(value.expectedSnapshotRevision) < 1 || Number(value.expectedSnapshotRevision) > 2_147_483_647
    || !isHttpsReference(value.sourceReference)
    || typeof value.reasonSummary !== "string" || value.reasonSummary.trim() !== value.reasonSummary || value.reasonSummary.length < 10 || value.reasonSummary.length > 1000
    || value.acknowledgeConfirmedEventsOnly !== true
    || value.acknowledgeReviewedFactorsOnly !== true
  ) return null;
  return value as PrepareRouteOperationalReleaseInput;
}

export function parsePublishRouteOperationalReleaseInput(value: unknown): PublishRouteOperationalReleaseInput | null {
  const keys = ["schemaVersion", "expectedWorkflowRevision", "releaseEvidenceReference", "acknowledgeAtomicReplacement", "acknowledgeOfflinePacksInvalidated"];
  if (
    !isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || value.expectedWorkflowRevision !== 1
    || !isHttpsReference(value.releaseEvidenceReference)
    || value.acknowledgeAtomicReplacement !== true || value.acknowledgeOfflinePacksInvalidated !== true
  ) return null;
  return value as PublishRouteOperationalReleaseInput;
}

export async function readRouteOperationalReleaseOverview(
  repository: RouteOperationalReleaseRepository,
  actor: RouteOperationalReleaseActor,
  now = new Date(),
) {
  if (!validActor(actor) || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const overview = parseRouteOperationalReleaseOverview(await repository.readOverview({ actor, at: now.toISOString() }));
    return overview ? { state: "FOUND" as const, overview } : { state: "STORAGE_UNAVAILABLE" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function prepareRouteOperationalRelease(
  repository: RouteOperationalReleaseRepository,
  value: unknown,
  actor: RouteOperationalReleaseActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parsePrepareRouteOperationalReleaseInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (!input || !validActor(actor, "OPERATIONS_EMERGENCY") || !idempotencyKeyHash || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.prepare({ actor, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "CREATED" || result.state === "REPLAYED") && !parseRouteOperationalReleaseReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function publishRouteOperationalRelease(
  repository: RouteOperationalReleaseRepository,
  releaseId: unknown,
  value: unknown,
  actor: RouteOperationalReleaseActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parsePublishRouteOperationalReleaseInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (
    typeof releaseId !== "string" || !UUID_PATTERN.test(releaseId) || !input
    || !validActor(actor, "RELEASE_ADMIN") || !idempotencyKeyHash || Number.isNaN(now.getTime())
  ) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.publish({ actor, releaseId, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "PUBLISHED" || result.state === "REPLAYED") && !parseRouteOperationalReleaseReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}
