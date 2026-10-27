import { createHash } from "node:crypto";

import {
  isVisitSessionId,
  isVisitSessionCurrentRevision,
  isVisitSessionRevision,
  isVisitSessionScenicAreaId,
  isVisitSessionState,
  parseVisitSessionCreateInput,
  parseVisitSessionEventInput,
  parseVisitSessionIdempotencyKey,
  type VisitSessionAction,
  type VisitSessionCreateInput,
  type VisitSessionEventInput,
  type VisitSessionState,
} from "./visit-session-domain";

export type VisitSessionIdentity = {
  accountId: string;
  scenicAreaId: string;
  subject: string;
};

/** Minimal, non-location-bearing representation returned by the P0 API. */
export type VisitSessionReceipt = {
  id: string;
  scenicAreaId: string;
  itineraryId: string;
  itineraryRevision: number;
  routePlanSnapshotId: string;
  lifecycleState: VisitSessionState;
  revision: number;
  narrationEnabled: boolean;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Public P0 server representation; deliberately excludes precise location. */
export type VisitSession = VisitSessionReceipt;

export type CreateVisitSessionCommand = {
  identity: VisitSessionIdentity;
  input: VisitSessionCreateInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type ApplyVisitSessionEventCommand = {
  identity: VisitSessionIdentity;
  sessionId: string;
  input: VisitSessionEventInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

/**
 * A repository implementation must make each mutation atomic: lock the
 * tenant-owned session, check the hashed idempotency key, compare revision,
 * validate the formal route-plan snapshot when required, then write the
 * session and its coarse event in one transaction. The PostGIS adapter maps
 * this contract to the `visit_sessions` / `visit_session_events` tables from
 * migration 003.
 */
export type VisitSessionRepository = {
  create(input: CreateVisitSessionCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; session: VisitSessionReceipt }
    | { state: "NOT_FOUND" | "FORMAL_ROUTE_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" }
  >;
  applyEvent(input: ApplyVisitSessionEventCommand): Promise<
    | { state: "APPLIED" | "REPLAYED"; session: VisitSessionReceipt; action: VisitSessionAction }
    | { state: "NOT_FOUND" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "FORMAL_ROUTE_UNAVAILABLE" }
    | { state: "REVISION_CONFLICT"; currentRevision: number | null }
  >;
};

export type CreateVisitSessionResult =
  | { state: "CREATED" | "REPLAYED"; session: VisitSessionReceipt }
  | { state: "INVALID_INPUT" | "NOT_FOUND" | "FORMAL_ROUTE_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" };

export type ApplyVisitSessionEventResult =
  | { state: "APPLIED" | "REPLAYED"; session: VisitSessionReceipt; action: VisitSessionAction }
  | { state: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "FORMAL_ROUTE_UNAVAILABLE" | "UNAVAILABLE" }
  | { state: "REVISION_CONFLICT"; currentRevision: number | null };

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isIdentity(value: VisitSessionIdentity) {
  return (
    isVisitSessionId(value.accountId)
    && isVisitSessionScenicAreaId(value.scenicAreaId)
    && value.subject === `visitor:${value.scenicAreaId}:${value.accountId}`
  );
}

export function isVisitSessionReceipt(value: VisitSessionReceipt): boolean {
  return (
    isVisitSessionId(value.id)
    && isVisitSessionScenicAreaId(value.scenicAreaId)
    && isVisitSessionId(value.itineraryId)
    && isVisitSessionId(value.routePlanSnapshotId)
    && isVisitSessionRevision(value.itineraryRevision)
    && value.itineraryRevision >= 1
    && isVisitSessionState(value.lifecycleState)
    && isVisitSessionCurrentRevision(value.revision)
    && typeof value.narrationEnabled === "boolean"
    && (value.startedAt === null || isTimestamp(value.startedAt))
    && (value.endedAt === null || isTimestamp(value.endedAt))
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
  );
}

function validOperation(identity: VisitSessionIdentity, idempotencyKeyHash: string, now: Date) {
  return isIdentity(identity) && HASH_PATTERN.test(idempotencyKeyHash) && Number.isFinite(now.getTime());
}

export function hashVisitSessionIdempotencyKey(value: unknown): string | null {
  const key = parseVisitSessionIdempotencyKey(value);
  return key ? createHash("sha256").update(key, "utf8").digest("hex") : null;
}

export async function createVisitSession(
  repository: VisitSessionRepository,
  value: unknown,
  identity: VisitSessionIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<CreateVisitSessionResult> {
  const input = parseVisitSessionCreateInput(value);
  if (!input || !validOperation(identity, idempotencyKeyHash, now) || input.scenicAreaId !== identity.scenicAreaId) {
    return { state: "INVALID_INPUT" };
  }
  try {
    const result = await repository.create({
      identity,
      input,
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
    if (result.state === "CREATED" || result.state === "REPLAYED") {
      return isVisitSessionReceipt(result.session) ? result : { state: "UNAVAILABLE" };
    }
    return result;
  } catch {
    // Storage and route evidence failures must not degrade into a local route.
    return { state: "UNAVAILABLE" };
  }
}

export async function applyVisitSessionEvent(
  repository: VisitSessionRepository,
  sessionId: unknown,
  value: unknown,
  identity: VisitSessionIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<ApplyVisitSessionEventResult> {
  const input = parseVisitSessionEventInput(value);
  if (!input || !isVisitSessionId(sessionId) || !validOperation(identity, idempotencyKeyHash, now)) {
    return { state: "INVALID_INPUT" };
  }
  try {
    const result = await repository.applyEvent({
      identity,
      sessionId,
      input,
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
    if (result.state === "APPLIED" || result.state === "REPLAYED") {
      return isVisitSessionReceipt(result.session) ? result : { state: "UNAVAILABLE" };
    }
    if (result.state === "REVISION_CONFLICT") {
      return isVisitSessionCurrentRevision(result.currentRevision) || result.currentRevision === null
        ? result
        : { state: "UNAVAILABLE" };
    }
    return result;
  } catch {
    return { state: "UNAVAILABLE" };
  }
}
