import {
  parseMapEditorDraftCollection,
  type MapEditorDraftCollection,
} from "./map-editor-draft";

export type GisDraftReviewDecision = "APPROVE_FOR_FORMALIZATION" | "REJECT";
export type GisDraftWorkflowState = "SUBMITTED" | "APPROVED_FOR_FORMALIZATION" | "REJECTED";
export type GisDraftReviewEligibility = "ELIGIBLE" | "SUBMITTER_CANNOT_REVIEW";

export type GisDraftSubmissionReceipt = {
  schemaVersion: 1;
  submissionId: string;
  scenicAreaId: string;
  submissionRevision: number;
  workflowRevision: 1 | 2;
  state: GisDraftWorkflowState;
  objectCount: number;
  contentSha256: string;
  submittedAt: string;
  reviewedAt: string | null;
  decision: GisDraftReviewDecision | null;
  reviewEvidenceReference: string | null;
};

export type GisDraftReviewQueueItem = {
  receipt: GisDraftSubmissionReceipt;
  reviewEligibility: GisDraftReviewEligibility;
};

export type GisDraftReviewQueuePage = {
  schemaVersion: 1;
  items: GisDraftReviewQueueItem[];
  nextBeforeRevision: number | null;
};

export type GisDraftSubmissionDetail = GisDraftReviewQueueItem & {
  schemaVersion: 1;
  collection: MapEditorDraftCollection;
};

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const MAX_DATABASE_REVISION = 2_147_483_647;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(new Date(value).getTime());
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

export function isGisDraftSubmissionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseGisDraftSubmissionReceipt(value: unknown): GisDraftSubmissionReceipt | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "schemaVersion", "submissionId", "scenicAreaId", "submissionRevision", "workflowRevision", "state",
      "objectCount", "contentSha256", "submittedAt", "reviewedAt", "decision", "reviewEvidenceReference",
    ])
    || value.schemaVersion !== 1
    || !isGisDraftSubmissionId(value.submissionId)
    || typeof value.scenicAreaId !== "string"
    || !SCENIC_AREA_PATTERN.test(value.scenicAreaId)
    || !Number.isSafeInteger(value.submissionRevision)
    || Number(value.submissionRevision) < 1
    || Number(value.submissionRevision) > MAX_DATABASE_REVISION
    || ![1, 2].includes(Number(value.workflowRevision))
    || !["SUBMITTED", "APPROVED_FOR_FORMALIZATION", "REJECTED"].includes(String(value.state))
    || !Number.isSafeInteger(value.objectCount)
    || Number(value.objectCount) < 1
    || Number(value.objectCount) > 200
    || typeof value.contentSha256 !== "string"
    || !HASH_PATTERN.test(value.contentSha256)
    || !isIsoInstant(value.submittedAt)
  ) return null;
  const submitted = value.state === "SUBMITTED";
  if (submitted) {
    if (value.workflowRevision !== 1 || value.reviewedAt !== null || value.decision !== null || value.reviewEvidenceReference !== null) return null;
  } else if (
    value.workflowRevision !== 2
    || !isIsoInstant(value.reviewedAt)
    || !isHttpsReference(value.reviewEvidenceReference)
    || (value.state === "APPROVED_FOR_FORMALIZATION" && value.decision !== "APPROVE_FOR_FORMALIZATION")
    || (value.state === "REJECTED" && value.decision !== "REJECT")
  ) return null;
  return structuredClone(value as GisDraftSubmissionReceipt);
}

function parseQueueItem(value: unknown): GisDraftReviewQueueItem | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["receipt", "reviewEligibility"])
    || !["ELIGIBLE", "SUBMITTER_CANNOT_REVIEW"].includes(String(value.reviewEligibility))
  ) return null;
  const receipt = parseGisDraftSubmissionReceipt(value.receipt);
  return receipt ? { receipt, reviewEligibility: value.reviewEligibility as GisDraftReviewEligibility } : null;
}

export function parseGisDraftReviewQueuePage(value: unknown): GisDraftReviewQueuePage | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "items", "nextBeforeRevision"])
    || value.schemaVersion !== 1
    || !Array.isArray(value.items)
    || value.items.length > 50
    || !(value.nextBeforeRevision === null || (Number.isSafeInteger(value.nextBeforeRevision) && Number(value.nextBeforeRevision) >= 1 && Number(value.nextBeforeRevision) <= MAX_DATABASE_REVISION))
  ) return null;
  const items = value.items.map(parseQueueItem);
  if (items.some((item) => item === null)) return null;
  const parsed = items as GisDraftReviewQueueItem[];
  if (
    parsed.some((item) => item.receipt.state !== "SUBMITTED" || item.receipt.workflowRevision !== 1)
    || new Set(parsed.map((item) => item.receipt.submissionId)).size !== parsed.length
    || parsed.some((item, index) => index > 0 && parsed[index - 1].receipt.submissionRevision <= item.receipt.submissionRevision)
  ) return null;
  if (
    value.nextBeforeRevision !== null
    && (parsed.length === 0 || value.nextBeforeRevision !== parsed[parsed.length - 1].receipt.submissionRevision)
  ) return null;
  return { schemaVersion: 1, items: parsed, nextBeforeRevision: value.nextBeforeRevision as number | null };
}

export function parseGisDraftSubmissionDetail(value: unknown): GisDraftSubmissionDetail | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "receipt", "reviewEligibility", "collection"])
    || value.schemaVersion !== 1
    || !["ELIGIBLE", "SUBMITTER_CANNOT_REVIEW"].includes(String(value.reviewEligibility))
  ) return null;
  const receipt = parseGisDraftSubmissionReceipt(value.receipt);
  const collection = parseMapEditorDraftCollection(value.collection);
  if (
    !receipt
    || !collection
    || receipt.scenicAreaId !== collection.scenicAreaId
    || receipt.objectCount !== collection.drafts.length
  ) return null;
  return {
    schemaVersion: 1,
    receipt,
    reviewEligibility: value.reviewEligibility as GisDraftReviewEligibility,
    collection,
  };
}
