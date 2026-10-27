import { createHash } from "node:crypto";

import type { VisitorIdentity } from "./visitor-identity-domain";
import {
  isDeletedItineraryReceipt,
  isItineraryCurrentRevision,
  isItineraryId,
  isItineraryReceipt,
  isItineraryScenicAreaId,
  parseItineraryCreateInput,
  parseItineraryDeleteInput,
  parseItineraryEditInput,
  parseItineraryIdempotencyKey,
  type DeletedItineraryReceipt,
  type ItineraryCreateInput,
  type ItineraryDeleteInput,
  type ItineraryEditInput,
  type ItineraryReceipt,
} from "./itinerary-revision-domain";

export type ItineraryIdentity = Pick<VisitorIdentity, "accountId" | "scenicAreaId" | "subject">;

export type CreateItineraryCommand = {
  identity: ItineraryIdentity;
  input: ItineraryCreateInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type EditItineraryCommand = {
  identity: ItineraryIdentity;
  itineraryId: string;
  input: ItineraryEditInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type DeleteItineraryCommand = {
  identity: ItineraryIdentity;
  itineraryId: string;
  input: ItineraryDeleteInput;
  idempotencyKeyHash: string;
  occurredAt: string;
};

/**
 * Implementations must use one transaction per write.  In particular, an
 * edit must lock the owner row, validate every selected POI and entrance
 * against one current published catalog, append (not alter) its stop rows,
 * invalidate prior session readiness, and then advance the revision.
 */
export type ItineraryRepository = {
  list(identity: ItineraryIdentity): Promise<ItineraryReceipt[]>;
  read(identity: ItineraryIdentity, itineraryId: string): Promise<ItineraryReceipt | null>;
  create(command: CreateItineraryCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; itinerary: ItineraryReceipt }
    | { state: "ACCOUNT_NOT_FOUND" | "PUBLISHED_CATALOG_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" }
  >;
  edit(command: EditItineraryCommand): Promise<
    | { state: "UPDATED" | "REPLAYED"; itinerary: ItineraryReceipt }
    | { state: "NOT_FOUND" | "PUBLISHED_CATALOG_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" }
    | { state: "REVISION_CONFLICT"; currentRevision: number | null }
  >;
  remove(command: DeleteItineraryCommand): Promise<
    | { state: "DELETED" | "REPLAYED"; itinerary: DeletedItineraryReceipt }
    | { state: "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" }
    | { state: "REVISION_CONFLICT"; currentRevision: number | null }
  >;
};

export type CreateItineraryResult =
  | { state: "CREATED" | "REPLAYED"; itinerary: ItineraryReceipt }
  | { state: "INVALID_INPUT" | "ACCOUNT_NOT_FOUND" | "PUBLISHED_CATALOG_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" };

export type EditItineraryResult =
  | { state: "UPDATED" | "REPLAYED"; itinerary: ItineraryReceipt }
  | { state: "INVALID_INPUT" | "NOT_FOUND" | "PUBLISHED_CATALOG_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" }
  | { state: "REVISION_CONFLICT"; currentRevision: number | null };

export type DeleteItineraryResult =
  | { state: "DELETED" | "REPLAYED"; itinerary: DeletedItineraryReceipt }
  | { state: "INVALID_INPUT" | "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" }
  | { state: "REVISION_CONFLICT"; currentRevision: number | null };

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function isIdentity(value: ItineraryIdentity) {
  return (
    isItineraryId(value.accountId)
    && isItineraryScenicAreaId(value.scenicAreaId)
    && value.subject === `visitor:${value.scenicAreaId}:${value.accountId}`
  );
}

function validOperation(identity: ItineraryIdentity, idempotencyKeyHash: string, now: Date) {
  return isIdentity(identity) && HASH_PATTERN.test(idempotencyKeyHash) && Number.isFinite(now.getTime());
}

export function hashItineraryIdempotencyKey(value: unknown): string | null {
  const key = parseItineraryIdempotencyKey(value);
  return key ? createHash("sha256").update(key, "utf8").digest("hex") : null;
}

export async function listSavedItineraries(
  repository: ItineraryRepository,
  identity: ItineraryIdentity,
): Promise<{ state: "AVAILABLE"; itineraries: ItineraryReceipt[] } | { state: "UNAVAILABLE" }> {
  if (!isIdentity(identity)) return { state: "UNAVAILABLE" };
  try {
    const itineraries = await repository.list(identity);
    return itineraries.every(isItineraryReceipt)
      ? { state: "AVAILABLE", itineraries }
      : { state: "UNAVAILABLE" };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

export async function readSavedItinerary(
  repository: ItineraryRepository,
  identity: ItineraryIdentity,
  itineraryId: unknown,
): Promise<{ state: "AVAILABLE"; itinerary: ItineraryReceipt } | { state: "NOT_FOUND" | "UNAVAILABLE" }> {
  if (!isIdentity(identity) || !isItineraryId(itineraryId)) return { state: "NOT_FOUND" };
  try {
    const itinerary = await repository.read(identity, itineraryId);
    if (itinerary === null) return { state: "NOT_FOUND" };
    return isItineraryReceipt(itinerary) ? { state: "AVAILABLE", itinerary } : { state: "UNAVAILABLE" };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

export async function createSavedItinerary(
  repository: ItineraryRepository,
  value: unknown,
  identity: ItineraryIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<CreateItineraryResult> {
  const input = parseItineraryCreateInput(value);
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
    if ((result.state === "CREATED" || result.state === "REPLAYED") && isItineraryReceipt(result.itinerary)) return result;
    return result.state === "CREATED" || result.state === "REPLAYED" ? { state: "UNAVAILABLE" } : result;
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

export async function editSavedItinerary(
  repository: ItineraryRepository,
  itineraryId: unknown,
  value: unknown,
  identity: ItineraryIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<EditItineraryResult> {
  const input = parseItineraryEditInput(value);
  if (!input || !isItineraryId(itineraryId) || !validOperation(identity, idempotencyKeyHash, now)) {
    return { state: "INVALID_INPUT" };
  }
  try {
    const result = await repository.edit({
      identity,
      itineraryId,
      input,
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
    if ((result.state === "UPDATED" || result.state === "REPLAYED") && isItineraryReceipt(result.itinerary)) return result;
    if (result.state === "REVISION_CONFLICT") {
      return result.currentRevision === null || isItineraryCurrentRevision(result.currentRevision)
        ? result
        : { state: "UNAVAILABLE" };
    }
    return result.state === "UPDATED" || result.state === "REPLAYED" ? { state: "UNAVAILABLE" } : result;
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

export async function deleteSavedItinerary(
  repository: ItineraryRepository,
  itineraryId: unknown,
  value: unknown,
  identity: ItineraryIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<DeleteItineraryResult> {
  const input = parseItineraryDeleteInput(value);
  if (!input || !isItineraryId(itineraryId) || !validOperation(identity, idempotencyKeyHash, now)) {
    return { state: "INVALID_INPUT" };
  }
  try {
    const result = await repository.remove({
      identity,
      itineraryId,
      input,
      idempotencyKeyHash,
      occurredAt: now.toISOString(),
    });
    if ((result.state === "DELETED" || result.state === "REPLAYED") && isDeletedItineraryReceipt(result.itinerary)) return result;
    if (result.state === "REVISION_CONFLICT") {
      return result.currentRevision === null || isItineraryCurrentRevision(result.currentRevision)
        ? result
        : { state: "UNAVAILABLE" };
    }
    return result.state === "DELETED" || result.state === "REPLAYED" ? { state: "UNAVAILABLE" } : result;
  } catch {
    return { state: "UNAVAILABLE" };
  }
}
