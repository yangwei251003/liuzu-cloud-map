import { createHash } from "node:crypto";

import {
  ROUTE_CROWD_LEVELS,
  ROUTE_WEATHER_IMPACTS,
  parseRouteOperationalObservationOverview,
  parseRouteOperationalObservationReceipt,
  type RouteCrowdLevel,
  type RouteOperationalObservationDecision,
  type RouteOperationalObservationOverview,
  type RouteOperationalObservationReceipt,
  type RouteOperationalObservationRole,
  type RouteWeatherImpact,
} from "../route-operational-observation-contract";

export type RouteOperationalObservationActor = {
  scenicAreaId: string;
  oidcSubject: string;
  role: RouteOperationalObservationRole;
};

export type SubmitRouteOperationalObservationCommand = {
  actor: RouteOperationalObservationActor;
  edgeId: string;
  crowdLevel: RouteCrowdLevel;
  weatherImpact: RouteWeatherImpact;
  travelTimeMultiplier: number;
  operatorNote: string;
  sourceReference: string;
  observedAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type ReviewRouteOperationalObservationCommand = {
  actor: RouteOperationalObservationActor;
  observationId: string;
  decision: RouteOperationalObservationDecision;
  expectedWorkflowRevision: 1;
  reviewEvidenceReference: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type RouteOperationalObservationRepository = {
  readOverview(command: { actor: RouteOperationalObservationActor; at: string }): Promise<RouteOperationalObservationOverview>;
  submit(command: SubmitRouteOperationalObservationCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; receipt: RouteOperationalObservationReceipt }
    | { state: "NO_CURRENT_NETWORK" | "EDGE_NOT_CURRENT_OR_STALE" | "ACTIVE_OBSERVATION_EXISTS" | "IDEMPOTENCY_CONFLICT" }
  >;
  review(command: ReviewRouteOperationalObservationCommand): Promise<
    | { state: "UPDATED" | "REPLAYED"; receipt: RouteOperationalObservationReceipt }
    | { state: "NOT_FOUND" | "REVISION_CONFLICT" | "SUBMITTER_CANNOT_REVIEW" | "IDEMPOTENCY_CONFLICT" }
  >;
};

export type SubmitRouteOperationalObservationInput = {
  schemaVersion: 1;
  edgeId: string;
  crowdLevel: RouteCrowdLevel;
  weatherImpact: RouteWeatherImpact;
  travelTimeMultiplier: number;
  operatorNote: string;
  sourceReference: string;
  observedAt: string;
  expiresAt: string;
  expectedSnapshotRevision: number;
  acknowledgeSourceBackedObservation: true;
};

export type ReviewRouteOperationalObservationInput = {
  schemaVersion: 1;
  decision: RouteOperationalObservationDecision;
  expectedWorkflowRevision: 1;
  reviewEvidenceReference: string;
  acknowledgeIndependentReview: true;
};

type UnknownRecord = Record<string, unknown>;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;
const MAX_OBSERVATION_DURATION_MS = 6 * 60 * 60 * 1000;
const MAX_PAST_OBSERVATION_MS = 60 * 60 * 1000;
const MAX_FUTURE_OBSERVATION_MS = 5 * 60 * 1000;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

function parseIso(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

function validActor(actor: RouteOperationalObservationActor, role?: RouteOperationalObservationRole) {
  return SCENIC_AREA_PATTERN.test(actor.scenicAreaId)
    && typeof actor.oidcSubject === "string" && actor.oidcSubject.length > 0 && actor.oidcSubject.length <= 255
    && !/[\s\u0000-\u001f\u007f]/.test(actor.oidcSubject)
    && ["OPERATIONS_EDITOR", "OPERATIONS_REVIEWER"].includes(actor.role)
    && (role === undefined || actor.role === role);
}

function hashIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value)
    ? createHash("sha256").update(value, "utf8").digest("hex")
    : null;
}

export function parseSubmitRouteOperationalObservationInput(value: unknown, now = new Date()): SubmitRouteOperationalObservationInput | null {
  const keys = ["schemaVersion", "edgeId", "crowdLevel", "weatherImpact", "travelTimeMultiplier", "operatorNote", "sourceReference", "observedAt", "expiresAt", "expectedSnapshotRevision", "acknowledgeSourceBackedObservation"];
  if (!isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || value.acknowledgeSourceBackedObservation !== true || Number.isNaN(now.getTime())) return null;
  const observedAt = parseIso(value.observedAt);
  const expiresAt = parseIso(value.expiresAt);
  if (
    typeof value.edgeId !== "string" || !UUID_PATTERN.test(value.edgeId)
    || !(ROUTE_CROWD_LEVELS as readonly unknown[]).includes(value.crowdLevel)
    || !(ROUTE_WEATHER_IMPACTS as readonly unknown[]).includes(value.weatherImpact)
    || typeof value.travelTimeMultiplier !== "number" || !Number.isFinite(value.travelTimeMultiplier) || value.travelTimeMultiplier < 1 || value.travelTimeMultiplier > 3
    || (value.travelTimeMultiplier === 1 && (value.crowdLevel !== "LOW" || value.weatherImpact !== "NONE"))
    || typeof value.operatorNote !== "string" || value.operatorNote.trim() !== value.operatorNote || value.operatorNote.length < 10 || value.operatorNote.length > 1000
    || !isHttps(value.sourceReference) || !observedAt || !expiresAt
    || observedAt.getTime() < now.getTime() - MAX_PAST_OBSERVATION_MS
    || observedAt.getTime() > now.getTime() + MAX_FUTURE_OBSERVATION_MS
    || expiresAt.getTime() <= now.getTime() || expiresAt.getTime() <= observedAt.getTime()
    || expiresAt.getTime() - observedAt.getTime() > MAX_OBSERVATION_DURATION_MS
    || !Number.isSafeInteger(value.expectedSnapshotRevision) || Number(value.expectedSnapshotRevision) < 1 || Number(value.expectedSnapshotRevision) > 2_147_483_647
  ) return null;
  return {
    schemaVersion: 1,
    edgeId: value.edgeId,
    crowdLevel: value.crowdLevel as RouteCrowdLevel,
    weatherImpact: value.weatherImpact as RouteWeatherImpact,
    travelTimeMultiplier: value.travelTimeMultiplier,
    operatorNote: value.operatorNote,
    sourceReference: value.sourceReference,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    expectedSnapshotRevision: Number(value.expectedSnapshotRevision),
    acknowledgeSourceBackedObservation: true,
  };
}

export function parseReviewRouteOperationalObservationInput(value: unknown): ReviewRouteOperationalObservationInput | null {
  if (
    !isRecord(value) || !exactKeys(value, ["schemaVersion", "decision", "expectedWorkflowRevision", "reviewEvidenceReference", "acknowledgeIndependentReview"])
    || value.schemaVersion !== 1 || !["CONFIRMED", "REJECTED"].includes(String(value.decision))
    || value.expectedWorkflowRevision !== 1 || !isHttps(value.reviewEvidenceReference)
    || value.acknowledgeIndependentReview !== true
  ) return null;
  return value as ReviewRouteOperationalObservationInput;
}

export async function readRouteOperationalObservationOverview(repository: RouteOperationalObservationRepository, actor: RouteOperationalObservationActor, now = new Date()) {
  if (!validActor(actor) || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const overview = parseRouteOperationalObservationOverview(await repository.readOverview({ actor, at: now.toISOString() }));
    return overview ? { state: "FOUND" as const, overview } : { state: "STORAGE_UNAVAILABLE" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function submitRouteOperationalObservation(repository: RouteOperationalObservationRepository, value: unknown, actor: RouteOperationalObservationActor, rawIdempotencyKey: unknown, now = new Date()) {
  const input = parseSubmitRouteOperationalObservationInput(value, now);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (!input || !validActor(actor, "OPERATIONS_EDITOR") || !idempotencyKeyHash) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.submit({ actor, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "CREATED" || result.state === "REPLAYED") && !parseRouteOperationalObservationReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function reviewRouteOperationalObservation(repository: RouteOperationalObservationRepository, observationId: unknown, value: unknown, actor: RouteOperationalObservationActor, rawIdempotencyKey: unknown, now = new Date()) {
  const input = parseReviewRouteOperationalObservationInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (typeof observationId !== "string" || !UUID_PATTERN.test(observationId) || !input || !validActor(actor, "OPERATIONS_REVIEWER") || !idempotencyKeyHash || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.review({ actor, observationId, ...input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "UPDATED" || result.state === "REPLAYED") && !parseRouteOperationalObservationReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}
