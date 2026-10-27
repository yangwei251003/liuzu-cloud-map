import { createHash } from "node:crypto";

import {
  parseMapEditorDraftCollection,
  type MapEditorDraftCollection,
} from "../map-editor-draft";
import {
  isGisDraftSubmissionId,
  parseGisDraftReviewQueuePage,
  parseGisDraftSubmissionDetail,
  type GisDraftReviewDecision,
  type GisDraftReviewQueuePage,
  type GisDraftSubmissionDetail,
  type GisDraftSubmissionReceipt,
} from "../gis-draft-review-contract";

export {
  parseGisDraftReviewQueuePage,
  parseGisDraftSubmissionDetail,
  parseGisDraftSubmissionReceipt,
} from "../gis-draft-review-contract";
export type {
  GisDraftReviewDecision,
  GisDraftReviewEligibility,
  GisDraftReviewQueueItem,
  GisDraftReviewQueuePage,
  GisDraftSubmissionDetail,
  GisDraftSubmissionReceipt,
  GisDraftWorkflowState,
} from "../gis-draft-review-contract";

export type GisDraftAdminActor = {
  scenicAreaId: string;
  oidcSubject: string;
  role: "GIS_EDITOR" | "GIS_REVIEWER";
};

export type CreateGisDraftSubmissionCommand = {
  actor: GisDraftAdminActor;
  collection: MapEditorDraftCollection;
  contentSha256: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type ReviewGisDraftSubmissionCommand = {
  actor: GisDraftAdminActor;
  submissionId: string;
  expectedWorkflowRevision: 1;
  decision: GisDraftReviewDecision;
  evidenceReference: string;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type ListPendingGisDraftSubmissionsCommand = {
  actor: GisDraftAdminActor;
  limit: number;
  beforeRevision: number | null;
};

export type ReadGisDraftSubmissionCommand = {
  actor: GisDraftAdminActor;
  submissionId: string;
};

export type GisDraftSubmissionRepository = {
  create(command: CreateGisDraftSubmissionCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; receipt: GisDraftSubmissionReceipt }
    | { state: "IDEMPOTENCY_CONFLICT" }
  >;
  review(command: ReviewGisDraftSubmissionCommand): Promise<
    | { state: "UPDATED" | "REPLAYED"; receipt: GisDraftSubmissionReceipt }
    | { state: "NOT_FOUND" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "SUBMITTER_CANNOT_REVIEW" }
  >;
  listPending(command: ListPendingGisDraftSubmissionsCommand): Promise<GisDraftReviewQueuePage>;
  readForReview(command: ReadGisDraftSubmissionCommand): Promise<GisDraftSubmissionDetail | null>;
};

export type GisDraftSubmissionInput = {
  schemaVersion: 1;
  collection: MapEditorDraftCollection;
};

export type GisDraftReviewInput = {
  schemaVersion: 1;
  expectedWorkflowRevision: 1;
  decision: GisDraftReviewDecision;
  evidenceReference: string;
};

type UnknownRecord = Record<string, unknown>;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;
const MAX_DATABASE_REVISION = 2_147_483_647;
const GIS_COORDINATE_PRECISION = 6;

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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_canonical_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("unsupported_canonical_value");
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashIdempotencyKey(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_PATTERN.test(value) ? hash(value) : null;
}

function roundedCoordinate(value: number) {
  const factor = 10 ** GIS_COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

function normalizeCollection(collection: MapEditorDraftCollection): MapEditorDraftCollection {
  return {
    ...collection,
    drafts: collection.drafts.map((draft) => ({
      ...draft,
      geometry: draft.geometry.type === "Point"
        ? { type: "Point", coordinates: draft.geometry.coordinates.map(roundedCoordinate) as [number, number] }
        : draft.geometry.type === "LineString"
          ? { type: "LineString", coordinates: draft.geometry.coordinates.map((position) => position.map(roundedCoordinate) as [number, number]) }
          : { type: "Polygon", coordinates: draft.geometry.coordinates.map((ring) => ring.map((position) => position.map(roundedCoordinate) as [number, number])) },
      source: { ...draft.source, capturedAt: new Date(draft.source.capturedAt).toISOString() },
      createdAt: new Date(draft.createdAt).toISOString(),
      updatedAt: new Date(draft.updatedAt).toISOString(),
    })),
  };
}

function validActor(actor: GisDraftAdminActor, role: GisDraftAdminActor["role"]) {
  return SCENIC_AREA_PATTERN.test(actor.scenicAreaId)
    && typeof actor.oidcSubject === "string"
    && actor.oidcSubject.length > 0
    && actor.oidcSubject.length <= 255
    && !/[\s\u0000-\u001f\u007f]/.test(actor.oidcSubject)
    && actor.role === role;
}

export function parseGisDraftSubmissionInput(value: unknown): GisDraftSubmissionInput | null {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "collection"]) || value.schemaVersion !== 1) return null;
  const collection = parseMapEditorDraftCollection(value.collection);
  return collection && collection.drafts.length > 0 ? { schemaVersion: 1, collection } : null;
}

export function parseGisDraftReviewInput(value: unknown): GisDraftReviewInput | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "expectedWorkflowRevision", "decision", "evidenceReference"])
    || value.schemaVersion !== 1
    || value.expectedWorkflowRevision !== 1
    || !["APPROVE_FOR_FORMALIZATION", "REJECT"].includes(String(value.decision))
    || !isHttpsReference(value.evidenceReference)
  ) return null;
  return {
    schemaVersion: 1,
    expectedWorkflowRevision: 1,
    decision: value.decision as GisDraftReviewDecision,
    evidenceReference: value.evidenceReference,
  };
}

export function contentHashForGisDraftCollection(collection: MapEditorDraftCollection) {
  const normalized = normalizeCollection(collection);
  return hash(canonicalJson({
    ...normalized,
    drafts: [...normalized.drafts].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  }));
}

export function parseGisDraftReviewQueueQuery(value: unknown): { limit: number; beforeRevision: number | null } | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["limit", "beforeRevision"])
    || !Number.isSafeInteger(value.limit)
    || Number(value.limit) < 1
    || Number(value.limit) > 50
    || !(value.beforeRevision === null || (Number.isSafeInteger(value.beforeRevision) && Number(value.beforeRevision) >= 1 && Number(value.beforeRevision) <= MAX_DATABASE_REVISION))
  ) return null;
  return { limit: Number(value.limit), beforeRevision: value.beforeRevision as number | null };
}

export async function listPendingGisDraftSubmissions(
  repository: GisDraftSubmissionRepository,
  value: unknown,
  actor: GisDraftAdminActor,
) {
  const query = parseGisDraftReviewQueueQuery(value);
  if (!query || !validActor(actor, "GIS_REVIEWER")) return { state: "INVALID_INPUT" as const };
  try {
    const page = parseGisDraftReviewQueuePage(await repository.listPending({ actor, ...query }));
    return page ? { state: "FOUND" as const, page } : { state: "STORAGE_UNAVAILABLE" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function readGisDraftSubmissionForReview(
  repository: GisDraftSubmissionRepository,
  submissionId: unknown,
  actor: GisDraftAdminActor,
) {
  if (!isGisDraftSubmissionId(submissionId) || !validActor(actor, "GIS_REVIEWER")) return { state: "INVALID_INPUT" as const };
  try {
    const value = await repository.readForReview({ actor, submissionId });
    if (value === null) return { state: "NOT_FOUND" as const };
    const detail = parseGisDraftSubmissionDetail(value);
    if (!detail || contentHashForGisDraftCollection(detail.collection) !== detail.receipt.contentSha256) {
      return { state: "STORAGE_UNAVAILABLE" as const };
    }
    return { state: "FOUND" as const, detail };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function submitGisDraftCollection(
  repository: GisDraftSubmissionRepository,
  value: unknown,
  actor: GisDraftAdminActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseGisDraftSubmissionInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (
    !input
    || !validActor(actor, "GIS_EDITOR")
    || input.collection.scenicAreaId !== actor.scenicAreaId
    || !idempotencyKeyHash
    || Number.isNaN(now.getTime())
  ) return { state: "INVALID_INPUT" as const };
  try {
    const normalizedCollection = normalizeCollection(input.collection);
    return await repository.create({
      actor,
      collection: normalizedCollection,
      contentSha256: contentHashForGisDraftCollection(normalizedCollection),
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function reviewGisDraftSubmission(
  repository: GisDraftSubmissionRepository,
  submissionId: unknown,
  value: unknown,
  actor: GisDraftAdminActor,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseGisDraftReviewInput(value);
  const idempotencyKeyHash = hashIdempotencyKey(rawIdempotencyKey);
  if (
    !isGisDraftSubmissionId(submissionId)
    || !input
    || !validActor(actor, "GIS_REVIEWER")
    || !idempotencyKeyHash
    || Number.isNaN(now.getTime())
  ) return { state: "INVALID_INPUT" as const };
  try {
    return await repository.review({
      actor,
      submissionId,
      expectedWorkflowRevision: input.expectedWorkflowRevision,
      decision: input.decision,
      evidenceReference: input.evidenceReference,
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}
