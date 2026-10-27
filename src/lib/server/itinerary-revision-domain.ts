/**
 * Closed P0 contract for a saved visitor itinerary.  The client may select
 * only identifiers from the currently published POI catalog.  It cannot
 * submit coordinates, provider paths, AI route geometry, or arbitrary stop
 * metadata: every unsupported field fails the exact-key parser below.
 */

const SCENIC_AREA_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{7,127}$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export const MAX_ITINERARY_STOPS = 32;
const MAX_TITLE_LENGTH = 120;
const MAX_DWELL_MINUTES = 1_440;
const MAX_EXPECTED_REVISION = 2_147_483_646;
const MAX_CURRENT_REVISION = 2_147_483_647;

type UnknownRecord = Record<string, unknown>;

export type ItineraryStopInput = {
  poiId: string;
  dwellMinutes: number | null;
};

export type ItineraryCreateInput = {
  schemaVersion: 1;
  scenicAreaId: string;
  expectedRevision: 0;
  title: string;
  startsAt: string | null;
  entranceId: string | null;
  stops: ItineraryStopInput[];
};

export type ItineraryEditInput = {
  schemaVersion: 1;
  expectedRevision: number;
  title: string;
  startsAt: string | null;
  entranceId: string | null;
  stops: ItineraryStopInput[];
};

export type ItineraryDeleteInput = {
  schemaVersion: 1;
  expectedRevision: number;
};

export type ItineraryLifecycleState = "SAVED" | "DELETED";

export type ItineraryStopReceipt = {
  sequence: number;
  poiId: string;
  label: string;
  dwellMinutes: number | null;
};

export type ItineraryReceipt = {
  id: string;
  scenicAreaId: string;
  revision: number;
  lifecycleState: "SAVED";
  title: string;
  startsAt: string | null;
  entranceId: string | null;
  executionState: "REPLAN_REQUIRED";
  stops: ItineraryStopReceipt[];
  createdAt: string;
  updatedAt: string;
};

export type DeletedItineraryReceipt = {
  id: string;
  scenicAreaId: string;
  revision: number;
  lifecycleState: "DELETED";
  executionState: "INVALIDATED";
  deletedAt: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, expected: readonly string[]) {
  const actual = Object.keys(record).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function isSafeText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= maximum
    && value.trim().length >= minimum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6], 10);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isDwellMinutes(value: unknown): value is number | null {
  return value === null || (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_DWELL_MINUTES
  );
}

function parseStop(value: unknown): ItineraryStopInput | null {
  const dwellMinutes = isRecord(value) ? value.dwellMinutes : undefined;
  if (
    !isRecord(value)
    || !exactKeys(value, ["dwellMinutes", "poiId"])
    || !isItineraryId(value.poiId)
    || !isDwellMinutes(dwellMinutes)
  ) {
    return null;
  }
  return { poiId: value.poiId, dwellMinutes };
}

function parseStops(value: unknown): ItineraryStopInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITINERARY_STOPS) return null;
  const stops = value.map(parseStop);
  if (!stops.every((stop): stop is ItineraryStopInput => stop !== null)) return null;
  if (new Set(stops.map((stop) => stop.poiId)).size !== stops.length) return null;
  return stops;
}

function parseItineraryBody(value: unknown, expectedKeys: readonly string[]) {
  if (!isRecord(value) || !exactKeys(value, expectedKeys)) return null;
  if (
    !isItineraryRevision(value.expectedRevision)
    || !isSafeText(value.title, MAX_TITLE_LENGTH)
    || !isNullableTimestamp(value.startsAt)
    || (value.entranceId !== null && !isItineraryId(value.entranceId))
  ) {
    return null;
  }
  const stops = parseStops(value.stops);
  if (!stops) return null;
  return {
    expectedRevision: value.expectedRevision,
    title: value.title.trim(),
    startsAt: value.startsAt,
    entranceId: value.entranceId,
    stops,
  };
}

export function isItineraryId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isItineraryScenicAreaId(value: unknown): value is string {
  return typeof value === "string" && SCENIC_AREA_ID_PATTERN.test(value);
}

export function isItineraryRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_EXPECTED_REVISION;
}

export function isItineraryCurrentRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CURRENT_REVISION;
}

export function parseItineraryCreateInput(value: unknown): ItineraryCreateInput | null {
  const parsed = parseItineraryBody(value, [
    "entranceId",
    "expectedRevision",
    "scenicAreaId",
    "schemaVersion",
    "startsAt",
    "stops",
    "title",
  ]);
  if (!parsed || !isRecord(value) || value.schemaVersion !== 1 || value.expectedRevision !== 0 || !isItineraryScenicAreaId(value.scenicAreaId)) {
    return null;
  }
  return { schemaVersion: 1, scenicAreaId: value.scenicAreaId, ...parsed, expectedRevision: 0 };
}

export function parseItineraryEditInput(value: unknown): ItineraryEditInput | null {
  const parsed = parseItineraryBody(value, [
    "entranceId",
    "expectedRevision",
    "schemaVersion",
    "startsAt",
    "stops",
    "title",
  ]);
  if (!parsed || !isRecord(value) || value.schemaVersion !== 1 || parsed.expectedRevision < 1) return null;
  return { schemaVersion: 1, ...parsed };
}

export function parseItineraryDeleteInput(value: unknown): ItineraryDeleteInput | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["expectedRevision", "schemaVersion"])
    || value.schemaVersion !== 1
    || !isItineraryRevision(value.expectedRevision)
    || value.expectedRevision < 1
  ) {
    return null;
  }
  return { schemaVersion: 1, expectedRevision: value.expectedRevision };
}

export function parseItineraryIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

export function isItineraryReceipt(value: unknown): value is ItineraryReceipt {
  if (!isRecord(value) || !exactKeys(value, [
    "createdAt",
    "entranceId",
    "executionState",
    "id",
    "lifecycleState",
    "revision",
    "scenicAreaId",
    "startsAt",
    "stops",
    "title",
    "updatedAt",
  ])) return false;
  if (
    !isItineraryId(value.id)
    || !isItineraryScenicAreaId(value.scenicAreaId)
    || !isItineraryCurrentRevision(value.revision)
    || value.lifecycleState !== "SAVED"
    || value.executionState !== "REPLAN_REQUIRED"
    || !isSafeText(value.title, MAX_TITLE_LENGTH)
    || !isNullableTimestamp(value.startsAt)
    || (value.entranceId !== null && !isItineraryId(value.entranceId))
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.updatedAt)
    || !Array.isArray(value.stops)
    || value.stops.length < 1
    || value.stops.length > MAX_ITINERARY_STOPS
  ) return false;
  return value.stops.every((stop, index) => {
    if (!isRecord(stop) || !exactKeys(stop, ["dwellMinutes", "label", "poiId", "sequence"])) return false;
    const dwellMinutes = stop.dwellMinutes;
    return stop.sequence === index + 1
      && isItineraryId(stop.poiId)
      && isSafeText(stop.label, MAX_TITLE_LENGTH)
      && isDwellMinutes(dwellMinutes);
  });
}

export function isDeletedItineraryReceipt(value: unknown): value is DeletedItineraryReceipt {
  return isRecord(value)
    && exactKeys(value, ["deletedAt", "executionState", "id", "lifecycleState", "revision", "scenicAreaId"])
    && isItineraryId(value.id)
    && isItineraryScenicAreaId(value.scenicAreaId)
    && isItineraryCurrentRevision(value.revision)
    && value.lifecycleState === "DELETED"
    && value.executionState === "INVALIDATED"
    && isIsoTimestamp(value.deletedAt);
}
