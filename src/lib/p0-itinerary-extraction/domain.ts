import type {
  ExtractedItineraryDraft,
  ExtractedItineraryDraftStop,
  ExtractedUnresolvedLocation,
  PublishedPoiCatalog,
  PublishedPoiCatalogPoi,
  StructuredItineraryExtractionRequest,
  StructuredTravelMode,
} from "./types";

const SCENIC_AREA_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POI_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_STOPS = 32;
const MAX_UNRESOLVED_LOCATIONS = 32;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MAX_ALIAS_COUNT = 30;
const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isSafeText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= maximum
    && value.trim().length >= minimum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function nullableSafeText(value: unknown, maximum: number): value is string | null {
  return value === null || isSafeText(value, maximum);
}

function isPositiveRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 10_000;
}

function isDwellMinutes(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_440);
}

function isTravelMode(value: unknown): value is StructuredTravelMode | null {
  return value === null || value === "WALK" || value === "TRANSIT" || value === "OTHER";
}

export function isScenicAreaId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100 && SCENIC_AREA_ID_PATTERN.test(value);
}

export function isIsoTimestamp(value: unknown): value is string {
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

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function parseDraftStop(value: unknown): ExtractedItineraryDraftStop | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "rawPlaceName",
      "order",
      "arrivalAt",
      "departureAt",
      "dwellMinutes",
      "reason",
      "travelMode",
      "mealNote",
      "restNote",
      "cautionNote",
    ])
    || !isSafeText(value.rawPlaceName, MAX_NAME_LENGTH)
    || !isOrder(value.order)
    || !nullableTimestamp(value.arrivalAt)
    || !nullableTimestamp(value.departureAt)
    || !isDwellMinutes(value.dwellMinutes)
    || !nullableSafeText(value.reason, MAX_NOTE_LENGTH)
    || !isTravelMode(value.travelMode)
    || !nullableSafeText(value.mealNote, MAX_NOTE_LENGTH)
    || !nullableSafeText(value.restNote, MAX_NOTE_LENGTH)
    || !nullableSafeText(value.cautionNote, MAX_NOTE_LENGTH)
  ) {
    return null;
  }
  return {
    rawPlaceName: value.rawPlaceName.trim(),
    order: value.order,
    arrivalAt: value.arrivalAt,
    departureAt: value.departureAt,
    dwellMinutes: value.dwellMinutes,
    reason: value.reason === null ? null : value.reason.trim(),
    travelMode: value.travelMode,
    mealNote: value.mealNote === null ? null : value.mealNote.trim(),
    restNote: value.restNote === null ? null : value.restNote.trim(),
    cautionNote: value.cautionNote === null ? null : value.cautionNote.trim(),
  };
}

function parseUnresolvedLocation(value: unknown): ExtractedUnresolvedLocation | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["rawPlaceName", "order", "reason"])
    || !isSafeText(value.rawPlaceName, MAX_NAME_LENGTH)
    || !isOrder(value.order)
    || !isSafeText(value.reason, MAX_NOTE_LENGTH)
  ) {
    return null;
  }
  return { rawPlaceName: value.rawPlaceName.trim(), order: value.order, reason: value.reason.trim() };
}

function parseDraft(value: unknown): ExtractedItineraryDraft | null {
  if (!isRecord(value) || !exactKeys(value, ["stops", "unresolvedLocations"]) || !Array.isArray(value.stops) || !Array.isArray(value.unresolvedLocations)) {
    return null;
  }
  if (value.stops.length < 1 || value.stops.length > MAX_STOPS || value.unresolvedLocations.length > MAX_UNRESOLVED_LOCATIONS) return null;
  const stops = value.stops.map(parseDraftStop);
  const unresolvedLocations = value.unresolvedLocations.map(parseUnresolvedLocation);
  if (
    !stops.every((item): item is ExtractedItineraryDraftStop => item !== null)
    || !unresolvedLocations.every((item): item is ExtractedUnresolvedLocation => item !== null)
  ) return null;
  const orders = [...stops, ...unresolvedLocations].map((item) => item.order);
  if (new Set(orders).size !== orders.length) return null;
  return {
    stops,
    unresolvedLocations,
  };
}

/**
 * This parser intentionally has no field for a POI ID, coordinate, URL, route
 * hint, opening decision, or confidence. Such values are backend-derived only.
 */
export function parseStructuredItineraryExtractionRequest(value: unknown): StructuredItineraryExtractionRequest | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "scenicAreaId", "expectedCatalogRevision", "extraction"])
    || value.schemaVersion !== 1
    || !isScenicAreaId(value.scenicAreaId)
    || !isPositiveRevision(value.expectedCatalogRevision)
  ) {
    return null;
  }
  const extraction = parseDraft(value.extraction);
  return extraction
    ? {
      schemaVersion: 1,
      scenicAreaId: value.scenicAreaId,
      expectedCatalogRevision: value.expectedCatalogRevision,
      extraction,
    }
    : null;
}

function parseCatalogPoi(value: unknown): PublishedPoiCatalogPoi | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "id",
      "canonicalName",
      "aliases",
      "verificationState",
      "sourceLicenseState",
      "validUntil",
      "openingState",
    ])
    || typeof value.id !== "string"
    || !POI_ID_PATTERN.test(value.id)
    || !isSafeText(value.canonicalName, MAX_NAME_LENGTH)
    || !Array.isArray(value.aliases)
    || value.aliases.length > MAX_ALIAS_COUNT
    || !value.aliases.every((alias) => isSafeText(alias, MAX_NAME_LENGTH))
    || value.verificationState !== "FIELD_VERIFIED"
    || value.sourceLicenseState !== "CLEARED"
    || !isIsoTimestamp(value.validUntil)
    || (value.openingState !== "OPEN" && value.openingState !== "CLOSED" && value.openingState !== "UNKNOWN")
  ) {
    return null;
  }
  return {
    id: value.id,
    canonicalName: value.canonicalName.trim(),
    aliases: value.aliases.map((alias) => alias.trim()),
    verificationState: "FIELD_VERIFIED",
    sourceLicenseState: "CLEARED",
    validUntil: value.validUntil,
    openingState: value.openingState,
  };
}

/**
 * Validates the catalog at the repository boundary. A single missing right,
 * field verification, expiry, malformed timestamp, or duplicate ID makes the
 * whole catalog unavailable instead of allowing a partial/candidate fallback.
 */
export function validatePublishedPoiCatalog(
  value: unknown,
  scenicAreaId: string,
  now = new Date(),
): PublishedPoiCatalog | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "schemaVersion",
      "scenicAreaId",
      "publicationRevision",
      "publicationState",
      "publishedAt",
      "expiresAt",
      "pois",
    ])
    || value.schemaVersion !== 1
    || value.scenicAreaId !== scenicAreaId
    || !isScenicAreaId(value.scenicAreaId)
    || !isPositiveRevision(value.publicationRevision)
    || value.publicationState !== "PUBLISHED"
    || !isIsoTimestamp(value.publishedAt)
    || !isIsoTimestamp(value.expiresAt)
    || !Array.isArray(value.pois)
    || value.pois.length < 1
    || value.pois.length > 500
    || Number.isNaN(now.getTime())
  ) {
    return null;
  }

  const publishedAt = Date.parse(value.publishedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (publishedAt > now.getTime() + FUTURE_CLOCK_SKEW_MS || expiresAt <= now.getTime() || expiresAt <= publishedAt) return null;

  const pois = value.pois.map(parseCatalogPoi);
  if (pois.some((item) => item === null)) return null;
  const typedPois = pois as PublishedPoiCatalogPoi[];
  if (new Set(typedPois.map((poi) => poi.id)).size !== typedPois.length) return null;
  if (typedPois.some((poi) => Date.parse(poi.validUntil) <= now.getTime())) return null;

  return {
    schemaVersion: 1,
    scenicAreaId: value.scenicAreaId,
    publicationRevision: value.publicationRevision,
    publicationState: "PUBLISHED",
    publishedAt: value.publishedAt,
    expiresAt: value.expiresAt,
    pois: typedPois,
  };
}

/** Exact, normalized spelling only. This deliberately is not a fuzzy matcher. */
export function normalizePublishedPlaceName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
}
