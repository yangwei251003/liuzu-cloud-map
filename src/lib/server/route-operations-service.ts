import { createHash } from "node:crypto";

import {
  ROUTE_CLOSURE_INCIDENT_TYPES,
  parseRouteClosureReceipt,
  parseRouteOperationsOverview,
  type RouteClosureIncidentType,
  type RouteClosureReceipt,
  type RouteClosureReviewDecision,
  type RouteClosureStatus,
  type RouteOperationsOverview,
} from "../route-operations-contract";

export type RouteOperationsActor = {
  scenicAreaId: string;
  oidcSubject: string;
  role: "OPERATIONS_EMERGENCY" | "RELEASE_ADMIN";
};

export type ActivateRouteClosureCommand = {
  actor: RouteOperationsActor;
  edgeId: string;
  status: RouteClosureStatus;
  incidentType: RouteClosureIncidentType;
  operatorNote: string;
  sourceReference: string;
  reasonEvidenceReference: string;
  startsAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type ReviewRouteClosureCommand = {
  actor: RouteOperationsActor;
  closureEventId: string;
  decision: RouteClosureReviewDecision;
  expectedWorkflowRevision: 1;
  reviewEvidenceReference: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type RouteOperationsRepository = {
  readOverview(command: { actor: RouteOperationsActor; at: string }): Promise<RouteOperationsOverview>;
  activate(command: ActivateRouteClosureCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; receipt: RouteClosureReceipt }
    | { state: "NO_CURRENT_NETWORK" | "EDGE_NOT_CURRENT_OR_STALE" | "ACTIVE_EVENT_EXISTS" | "IDEMPOTENCY_CONFLICT" }
  >;
  review(command: ReviewRouteClosureCommand): Promise<
    | { state: "UPDATED" | "REPLAYED"; receipt: RouteClosureReceipt }
    | { state: "NOT_FOUND" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "ACTIVATOR_CANNOT_REVIEW" }
  >;
};

export type ActivateRouteClosureInput = {
  schemaVersion: 1;
  edgeId: string;
  status: RouteClosureStatus;
  incidentType: RouteClosureIncidentType;
  operatorNote: string;
  sourceReference: string;
  reasonEvidenceReference: string;
  startsAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  acknowledgeImmediateRouteStop: true;
};

export type ReviewRouteClosureInput = {
  schemaVersion: 1;
  decision: RouteClosureReviewDecision;
  expectedWorkflowRevision: 1;
  reviewEvidenceReference: string;
  acknowledgeWithdrawalIsNotProofOfOpen: true;
};

type UnknownRecord = Record<string, unknown>;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;
const MAX_DATABASE_REVISION = 2_147_483_647;
const MAX_EVENT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_START_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_START_MS = 24 * 60 * 60 * 1000;

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

function parseIso(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

function validActor(actor: RouteOperationsActor, role?: RouteOperationsActor["role"]) {
  return SCENIC_AREA_PATTERN.test(actor.scenicAreaId)
    && typeof actor.oidcSubject === "string"
    && actor.oidcSubject.length > 0
    && actor.oidcSubject.length <= 255
    && !/[\s\u0000-\u001f\u007f]/.test(actor.oidcSubject)
    && ["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"].includes(actor.role)
    && (role === undefined || actor.role === role);
}

function hashIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value)
    ? createHash("sha256").update(value, "utf8").digest("hex")
    : null;
}

export function parseActivateRouteClosureInput(value: unknown, now = new Date()): ActivateRouteClosureInput | null {
  const keys = ["schemaVersion", "edgeId", "status", "incidentType", "operatorNote", "sourceReference", "reasonEvidenceReference", "startsAt", "expiresAt", "expectedSnapshotRevision", "acknowledgeImmediateRouteStop"];
  if (!isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || value.acknowledgeImmediateRouteStop !== true || Number.isNaN(now.getTime())) return null;
  const startsAt = parseIso(value.startsAt);
  const expiresAt = parseIso(value.expiresAt);
  if (
    typeof value.edgeId !== "string" || !UUID_PATTERN.test(value.edgeId)
    || !["CLOSED", "RESTRICTED"].includes(String(value.status))
    || !(ROUTE_CLOSURE_INCIDENT_TYPES as readonly unknown[]).includes(value.incidentType)
    || typeof value.operatorNote !== "string" || value.operatorNote.trim() !== value.operatorNote || value.operatorNote.length < 10 || value.operatorNote.length > 1000
    || !isHttpsReference(value.sourceReference) || !isHttpsReference(value.reasonEvidenceReference)
    || !startsAt || !expiresAt
    || startsAt.getTime() < now.getTime() - MAX_PAST_START_MS
    || startsAt.getTime() > now.getTime() + MAX_FUTURE_START_MS
    || expiresAt.getTime() <= Math.max(startsAt.getTime(), now.getTime())
    || expiresAt.getTime() - startsAt.getTime() > MAX_EVENT_DURATION_MS
    || !Number.isSafeInteger(value.expectedSnapshotRevision) || Number(value.expectedSnapshotRevision) < 1 || Number(value.expectedSnapshotRevision) > MAX_DATABASE_REVISION
  ) return null;
  return {
    schemaVersion: 1,
    edgeId: value.edgeId,
    status: value.status as RouteClosureStatus,
    incidentType: value.incidentType as RouteClosureIncidentType,
    operatorNote: value.operatorNote,
    sourceReference: value.sourceReference,
    reasonEvidenceReference: value.reasonEvidenceReference,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    expectedSnapshotRevision: Number(value.expectedSnapshotRevision),
    acknowledgeImmediateRouteStop: true,
  };
}

export function parseReviewRouteClosureInput(value: unknown): ReviewRouteClosureInput | null {
  const keys = ["schemaVersion", "decision", "expectedWorkflowRevision", "reviewEvidenceReference", "acknowledgeWithdrawalIsNotProofOfOpen"];
  if (
    !isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1
    || !["CONFIRMED", "WITHDRAWN"].includes(String(value.decision))
    || value.expectedWorkflowRevision !== 1
    || !isHttpsReference(value.reviewEvidenceReference)
    || value.acknowledgeWithdrawalIsNotProofOfOpen !== true
  ) return null;
  return {
    schemaVersion: 1,
    decision: value.decision as RouteClosureReviewDecision,
    expectedWorkflowRevision: 1,
    reviewEvidenceReference: value.reviewEvidenceReference,
    acknowledgeWithdrawalIsNotProofOfOpen: true,
  };
}

export async function readRouteOperationsOverview(
  repository: RouteOperationsRepository,
  actor: RouteOperationsActor,
  now = new Date(),
) {
  if (!validActor(actor) || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const overview = parseRouteOperationsOverview(await repository.readOverview({ actor, at: now.toISOString() }));
    return overview ? { state: "FOUND" as const, overview } : { state: "STORAGE_UNAVAILABLE" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function activateRouteClosure(
  repository: RouteOperationsRepository,
  value: unknown,
  actor: RouteOperationsActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseActivateRouteClosureInput(value, now);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (!input || !validActor(actor, "OPERATIONS_EMERGENCY") || !idempotencyKeyHash) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.activate({ actor, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "CREATED" || result.state === "REPLAYED") && !parseRouteClosureReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function reviewRouteClosure(
  repository: RouteOperationsRepository,
  closureEventId: unknown,
  value: unknown,
  actor: RouteOperationsActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseReviewRouteClosureInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (
    typeof closureEventId !== "string" || !UUID_PATTERN.test(closureEventId)
    || !input || !validActor(actor, "RELEASE_ADMIN") || !idempotencyKeyHash || Number.isNaN(now.getTime())
  ) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.review({ actor, closureEventId, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "UPDATED" || result.state === "REPLAYED") && !parseRouteClosureReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}
