/**
 * A deliberately small, closed contract for the P0 extraction hand-off.
 * The extraction provider may describe what the visitor wrote, but it never
 * supplies a POI identifier, coordinate, route, opening decision, or ETA.
 */
export const STRUCTURED_ITINERARY_SCHEMA_VERSION = 1 as const;

export type StructuredTravelMode = "WALK" | "TRANSIT" | "OTHER";

export type PublishedPoiOpeningState = "OPEN" | "CLOSED" | "UNKNOWN";

export type PublishedPoiCatalogPoi = {
  id: string;
  canonicalName: string;
  aliases: string[];
  verificationState: "FIELD_VERIFIED";
  sourceLicenseState: "CLEARED";
  validUntil: string;
  openingState: PublishedPoiOpeningState;
};

/**
 * This is an injected, already-published catalog boundary. It is intentionally
 * separate from the prototype scenic-data module: candidate data is never a
 * valid source for this contract.
 */
export type PublishedPoiCatalog = {
  schemaVersion: 1;
  scenicAreaId: string;
  publicationRevision: number;
  publicationState: "PUBLISHED";
  publishedAt: string;
  expiresAt: string;
  pois: PublishedPoiCatalogPoi[];
};

export type ExtractedItineraryDraftStop = {
  rawPlaceName: string;
  order: number;
  arrivalAt: string | null;
  departureAt: string | null;
  dwellMinutes: number | null;
  reason: string | null;
  travelMode: StructuredTravelMode | null;
  mealNote: string | null;
  restNote: string | null;
  cautionNote: string | null;
};

export type ExtractedUnresolvedLocation = {
  rawPlaceName: string;
  order: number;
  reason: string;
};

export type ExtractedItineraryDraft = {
  stops: ExtractedItineraryDraftStop[];
  unresolvedLocations: ExtractedUnresolvedLocation[];
};

export type StructuredItineraryExtractionRequest = {
  schemaVersion: 1;
  scenicAreaId: string;
  expectedCatalogRevision: number;
  extraction: ExtractedItineraryDraft;
};

export type PoiMatchConfidence = {
  level: "EXACT" | "ALIAS";
  score: 1 | 0.98;
};

export type StructuredItineraryStop = ExtractedItineraryDraftStop & {
  matchedPoiId: string | null;
  matchConfidence: PoiMatchConfidence | null;
  resolutionState: "MATCHED" | "UNRESOLVED";
  openingState: PublishedPoiOpeningState | null;
  timeState: "VALID" | "INCOMPLETE" | "CONFLICT";
  routePlanningState: "NOT_PLANNED";
};

export type UnresolvedItineraryLocation = {
  rawPlaceName: string;
  order: number;
  reason: string;
  code:
    | "UNKNOWN_PUBLISHED_POI"
    | "AMBIGUOUS_PUBLISHED_POI"
    | "POI_CLOSED"
    | "POI_OPENING_UNAVAILABLE"
    | "MODEL_REPORTED_UNRESOLVED";
  matchedPoiId: string | null;
};

export type StructuredItineraryUnresolvedIssue = {
  code: "DEPARTURE_BEFORE_ARRIVAL" | "DWELL_DURATION_MISMATCH" | "ORDER_TIME_CONFLICT";
  order: number;
  rawPlaceName: string;
  message: string;
};

export type StructuredItineraryExtraction = {
  schemaVersion: 1;
  scenicAreaId: string;
  catalogRevision: number;
  status: "REVIEW_REQUIRED";
  stops: StructuredItineraryStop[];
  unresolvedLocations: UnresolvedItineraryLocation[];
  unresolvedIssues: StructuredItineraryUnresolvedIssue[];
  warnings: string[];
};

export type PublishedPoiCatalogRepository = {
  readCurrentPublishedPoiCatalog(scenicAreaId: string): Promise<PublishedPoiCatalog | null>;
};

export type ResolveStructuredItineraryResult =
  | { state: "AVAILABLE"; itinerary: StructuredItineraryExtraction }
  | { state: "PUBLISHED_CATALOG_UNAVAILABLE" }
  | { state: "CATALOG_REVISION_CHANGED"; catalogRevision: number };
