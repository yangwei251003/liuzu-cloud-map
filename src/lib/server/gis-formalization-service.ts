import { createHash } from "node:crypto";

import {
  isGisFormalizationUuid,
  parseGisFormalizationOverview,
  parseGisFormalizationReceipt,
  parsePrepareGisFormalizationInput,
  parsePublishGisFormalizationInput,
  type GisFormalizationActorRole,
  type GisFormalizationOverview,
  type GisFormalizationReceipt,
  type PrepareGisFormalizationInput,
} from "../gis-formalization-contract";

export type GisFormalizationActor = {
  scenicAreaId: string;
  oidcSubject: string;
  role: GisFormalizationActorRole;
};

export type PrepareGisFormalizationCommand = {
  actor: GisFormalizationActor;
  input: PrepareGisFormalizationInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type PublishGisFormalizationCommand = {
  actor: GisFormalizationActor;
  releaseId: string;
  expectedWorkflowRevision: 1;
  managementEvidenceReference: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type GisFormalizationRepository = {
  readOverview(command: { actor: GisFormalizationActor; at: string }): Promise<GisFormalizationOverview>;
  prepare(command: PrepareGisFormalizationCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; receipt: GisFormalizationReceipt }
    | { state: "SUBMISSION_NOT_FOUND" | "SUBMISSION_NOT_APPROVED" | "REVIEWER_CANNOT_PREPARE" | "CANDIDATE_EXISTS" | "SOURCE_CHANGED" | "PLAN_BLOCKED" | "IDEMPOTENCY_CONFLICT" }
  >;
  publish(command: PublishGisFormalizationCommand): Promise<
    | { state: "PUBLISHED" | "REPLAYED"; receipt: GisFormalizationReceipt }
    | { state: "NOT_FOUND" | "REVISION_CONFLICT" | "PREPARER_CANNOT_PUBLISH" | "DUTY_SEPARATION_FAILED" | "CANDIDATE_EXPIRED" | "SOURCE_CHANGED" | "PLAN_INVALID" | "ACTIVE_CLOSURES" | "OPERATIONAL_RELEASE_PENDING" | "IDEMPOTENCY_CONFLICT" }
  >;
};

const SCENIC_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

function validActor(actor: GisFormalizationActor, role?: GisFormalizationActorRole) {
  return SCENIC_PATTERN.test(actor.scenicAreaId)
    && typeof actor.oidcSubject === "string" && actor.oidcSubject.length > 0 && actor.oidcSubject.length <= 255
    && !/[\s\u0000-\u001f\u007f]/.test(actor.oidcSubject)
    && ["GIS_REVIEWER", "RELEASE_ADMIN"].includes(actor.role)
    && (role === undefined || actor.role === role);
}

function hashIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value)
    ? createHash("sha256").update(value, "utf8").digest("hex")
    : null;
}

export async function readGisFormalizationOverview(
  repository: GisFormalizationRepository,
  actor: GisFormalizationActor,
  now = new Date(),
) {
  if (!validActor(actor) || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const overview = parseGisFormalizationOverview(await repository.readOverview({ actor, at: now.toISOString() }));
    return overview ? { state: "FOUND" as const, overview } : { state: "STORAGE_UNAVAILABLE" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function prepareGisFormalization(
  repository: GisFormalizationRepository,
  value: unknown,
  actor: GisFormalizationActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parsePrepareGisFormalizationInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (!input || !validActor(actor, "GIS_REVIEWER") || !idempotencyKeyHash || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.prepare({ actor, input, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "CREATED" || result.state === "REPLAYED") && !parseGisFormalizationReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function publishGisFormalization(
  repository: GisFormalizationRepository,
  releaseId: unknown,
  value: unknown,
  actor: GisFormalizationActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parsePublishGisFormalizationInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (!isGisFormalizationUuid(releaseId) || !input || !validActor(actor, "RELEASE_ADMIN") || !idempotencyKeyHash || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  try {
    const result = await repository.publish({ actor, releaseId, expectedWorkflowRevision: 1, managementEvidenceReference: input.managementEvidenceReference, idempotencyKeyHash, occurredAt: now.toISOString() });
    if ((result.state === "PUBLISHED" || result.state === "REPLAYED") && !parseGisFormalizationReceipt(result.receipt)) return { state: "STORAGE_UNAVAILABLE" as const };
    return result;
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}
