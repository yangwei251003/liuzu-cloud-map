/**
 * Stable, provider-neutral contracts for the P0 controlled-test candidate.
 * Coordinates in authoritative records are always WGS84; GCJ-02 is a
 * transient display transform and must not be used for routing decisions.
 */

export type VerificationState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "WITHDRAWN" | "EXPIRED" | "REJECTED";

export type CoordinateRef = Readonly<{
  longitude: number;
  latitude: number;
  authoritativeCrs: "EPSG:4326";
  sourceCrs: string;
  transformMethod: string | null;
  transformVersion: string | null;
}>;

export type PublishedScenicSnapshot = Readonly<{
  scenicAreaId: string;
  publicationId: string;
  revision: number;
  state: "PUBLISHED";
  sourceId: string;
  verifiedUntil: string;
  publishedAt: string;
}>;

export type RouteNetworkRevision = Readonly<{
  scenicAreaId: string;
  networkRevision: number;
  operationalRevision: number;
  snapshotId: string;
  validUntil: string;
}>;

export type DirectedEdgeTraversal = Readonly<{
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  direction: "FORWARD" | "REVERSE";
  distanceMeters: number;
  estimatedSeconds: number;
}>;

export type RoutePlan = Readonly<{
  id: string;
  itineraryRevision: number;
  network: RouteNetworkRevision;
  traversal: readonly DirectedEdgeTraversal[];
  distanceMeters: number;
  estimatedSeconds: number;
  calculatedAt: string;
}>;

export type ExtractedItineraryStop = Readonly<{
  originalPlaceName: string;
  matchedPoiId: string | null;
  matchConfidence: number | null;
  sequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
  dwellMinutes: number | null;
  rationale: string | null;
  walkingOrTransport: string | null;
  meal: string | null;
  rest: string | null;
  cautions: string | null;
}>;

export type ExtractedItinerary = Readonly<{
  sourceText: string;
  stops: readonly ExtractedItineraryStop[];
  unresolvedPlaceNames: readonly string[];
  requiresReview: true;
}>;

export type LifecycleState = "READY" | "STARTED" | "PAUSED" | "REPLANNING" | "SKIPPED" | "ARRIVED" | "COMPLETED" | "ENDED" | "DELETED";

export type VisitSession = Readonly<{
  id: string;
  itineraryId: string;
  itineraryRevision: number;
  routePlanSnapshotId: string;
  lifecycleState: LifecycleState;
  revision: number;
  narrationEnabled: boolean;
}>;

export type GuideAnswerClaim = Readonly<{
  text: string;
  sourceId: string;
  factType: "CULTURE" | "HISTORY" | "POI" | "SAFETY" | "OPERATIONS";
}>;

export type ConsentPurpose = "LOCATION_NAVIGATION" | "ACCOUNT" | "PRIVATE_SHARING" | "ANALYTICS";
