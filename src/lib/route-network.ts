export type RouteNetworkPublicationStatus = "DRAFT" | "PUBLISHED" | "WITHDRAWN";
export type RouteNetworkLayer = "PUBLIC" | "INTERNAL";
export type RouteTraversalMode =
  | "WALKWAY"
  | "BOARDWALK"
  | "MOUNTAIN_TRAIL"
  | "STAIRS"
  | "CABLEWAY"
  | "SHUTTLE";
export type RouteDifficulty = "EASY" | "MODERATE" | "HARD";
export type RouteVisitInterest = "HISTORY" | "CULTURE" | "NATURE" | "PHOTOGRAPHY" | "FAMILY" | "REST";

export type RouteTransportService = {
  serviceName: string;
  boardingMinutes: number;
  expectedWaitMinutes: number;
  inVehicleMinutes: number;
  scheduleEvidenceReference: string;
};

export type RouteNetworkCoordinate = {
  longitude: number;
  latitude: number;
  coordinateSystem: "WGS84";
  accuracyMeters: number;
  capturedAt: string;
  sourceReference: string;
};

export type RouteNetworkSource = {
  sourceId: string;
  category:
    | "SCENIC_MANAGEMENT"
    | "AUTHORIZED_FIELD_SURVEY"
    | "MAP_PROVIDER_REFERENCE"
    | "OPEN_DATA_PROTOTYPE"
    | "PROJECT_EMPTY";
  provider: string;
  acquiredAt: string;
  evidenceReference: string;
};

export type RouteNetworkRights = {
  status: "CLEARED" | "RESTRICTED" | "UNKNOWN";
  rightsHolder: string | null;
  licenseReference: string | null;
  validUntil: string | null;
  allowsDisplay: boolean;
  allowsRouting: boolean;
  allowsCaching: boolean;
  allowsDerivatives: boolean;
};

export type RouteNetworkReview = {
  status: "NOT_REVIEWED" | "PENDING" | "APPROVED" | "REJECTED";
  reviewedRevision: string | null;
  gisReviewer: string | null;
  managementApprover: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  evidenceReference: string | null;
};

export type RouteNetworkEntrance = {
  id: string;
  name: string;
  type: "ENTRY" | "EXIT" | "ENTRY_EXIT" | "TRANSFER";
  coordinate: RouteNetworkCoordinate;
  verification: {
    status: "UNVERIFIED" | "FIELD_VERIFIED" | "MANAGEMENT_APPROVED";
    checkedAt: string | null;
    expiresAt: string | null;
    verifier: string | null;
    managementApprover: string | null;
    evidenceReference: string | null;
  };
  publicNodeId: string;
  internalNodeId: string;
};

export type RouteNetworkNode = {
  id: string;
  layer: RouteNetworkLayer;
  type: "ENTRANCE_CONNECTOR" | "JUNCTION" | "DESTINATION" | "FACILITY" | "TRANSIT";
  entranceId: string | null;
  coordinate: RouteNetworkCoordinate;
  displayName?: string;
  poiId?: string | null;
  /** Optional on legacy revisions; formal itinerary planning uses only complete reviewed blocks. */
  visit?: {
    interestTags: RouteVisitInterest[];
    dwellMinutes: number;
    editorialPriority: number;
    familyFriendly: boolean;
    restArea: boolean;
    photoSpot: boolean;
    evidenceReference: string;
  };
};

export type RouteNetworkEdge = {
  id: string;
  layer: RouteNetworkLayer;
  fromNodeId: string;
  toNodeId: string;
  walkingDirection: "FORWARD" | "REVERSE" | "BIDIRECTIONAL";
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
  distanceMeters: number;
  estimatedMinutes: number;
  verificationStatus: "UNVERIFIED_OSM_PROTOTYPE" | "FIELD_VERIFIED" | "MANAGEMENT_APPROVED";
  accessibility: {
    status: "VERIFIED_ACCESSIBLE" | "VERIFIED_PARTIAL" | "VERIFIED_NOT_ACCESSIBLE" | "UNKNOWN";
    checkedAt: string | null;
    expiresAt: string | null;
    evidenceReference: string | null;
  };
  constraints: {
    stairs: "NONE" | "PRESENT" | "UNKNOWN";
    surface: "PAVED" | "UNPAVED" | "MIXED" | "UNKNOWN";
    maxSlopePercent: number | null;
    minWidthMeters: number | null;
    lighting: "PRESENT" | "ABSENT" | "UNKNOWN";
    notes: string[];
  };
  dynamicStatus: {
    status: "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";
    checkedAt: string;
    expiresAt: string;
    sourceReference: string;
    responsibleParty: string;
  };
  /**
   * Optional on legacy revisions. Any strategy that depends on these values
   * must fail closed unless every edge in the published revision carries the
   * complete, reviewed block.
   */
  routing?: {
    traversalMode: RouteTraversalMode;
    difficulty: RouteDifficulty;
    scenicScore: number;
    evidenceReference: string;
    /** Required for newly published cableway and shuttle edges. */
    transportService?: RouteTransportService;
  };
};

export type RouteNetworkRecommendedRoute = {
  id: string;
  name: string;
  originNodeId: string;
  destinationNodeId: string;
  segments: Array<{
    edgeId: string;
    traversalDirection: "FORWARD" | "REVERSE";
  }>;
  traversalModes: RouteTraversalMode[];
  distanceMeters: number;
  estimatedMinutes: number;
  sourceReference: string;
};

export type RouteNetworkManifest = {
  schemaVersion: 1;
  scenicAreaId: string;
  revision: string;
  publicationStatus: RouteNetworkPublicationStatus;
  publishedAt: string | null;
  withdrawnAt: string | null;
  expiresAt: string | null;
  coordinateSystem: "WGS84";
  source: RouteNetworkSource;
  rights: RouteNetworkRights;
  review: RouteNetworkReview;
  entrances: RouteNetworkEntrance[];
  nodes: RouteNetworkNode[];
  edges: RouteNetworkEdge[];
  /** Optional on legacy revisions; new formal publications materialize reviewed route templates. */
  recommendedRoutes?: RouteNetworkRecommendedRoute[];
};

export type RouteNetworkValidationIssue = {
  code:
    | "CLOCK_INVALID"
    | "SCHEMA_INVALID"
    | "SCENIC_AREA_MISMATCH"
    | "NOT_PUBLISHED"
    | "WITHDRAWN"
    | "DATASET_EXPIRED"
    | "TIME_INVALID"
    | "SOURCE_UNPUBLISHABLE"
    | "RIGHTS_BLOCKED"
    | "REVIEW_BLOCKED"
    | "NO_ENTRANCE"
    | "NO_PUBLIC_EDGE"
    | "NO_INTERNAL_EDGE"
    | "DUPLICATE_ID"
    | "ENTRANCE_UNVERIFIED"
    | "ENTRANCE_CONNECTION_INVALID"
    | "EDGE_REFERENCE_INVALID"
    | "CROSS_LAYER_EDGE"
    | "EDGE_GEOMETRY_INVALID"
    | "EDGE_UNVERIFIED"
    | "STATUS_EXPIRED"
    | "ACCESSIBILITY_EVIDENCE_INVALID"
    | "RECOMMENDED_ROUTE_INVALID"
    | "NETWORK_DISCONNECTED"
    | "NO_OPEN_CROSS_LAYER_CONNECTION";
  path: string;
  message: string;
};

export type RouteNetworkValidationResult = {
  status: "PUBLISHABLE" | "BLOCKED";
  checkedAt: string;
  network: RouteNetworkManifest | null;
  issues: RouteNetworkValidationIssue[];
};

type UnknownRecord = Record<string, unknown>;

const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_ENTRANCES = 200;
const MAX_NODES = 20_000;
const MAX_EDGES = 50_000;
const MAX_RECOMMENDED_ROUTES = 200;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const isText = (value: unknown, max = 500): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isNullableText = (value: unknown, max = 500): value is string | null =>
  value === null || isText(value, max);

const isId = (value: unknown): value is string => isText(value, 100) && ID_PATTERN.test(value);

const isIsoInstant = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const isNullableIsoInstant = (value: unknown): value is string | null => value === null || isIsoInstant(value);

const isFiniteInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parseCoordinate(value: unknown): RouteNetworkCoordinate | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["longitude", "latitude", "coordinateSystem", "accuracyMeters", "capturedAt", "sourceReference"]) ||
    !isFiniteInRange(value.longitude, -180, 180) ||
    !isFiniteInRange(value.latitude, -90, 90) ||
    value.coordinateSystem !== "WGS84" ||
    !isFiniteInRange(value.accuracyMeters, 0, 10_000) ||
    !isIsoInstant(value.capturedAt) ||
    !isText(value.sourceReference)
  ) {
    return null;
  }
  return value as RouteNetworkCoordinate;
}

function parseSource(value: unknown): RouteNetworkSource | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["sourceId", "category", "provider", "acquiredAt", "evidenceReference"]) ||
    !isId(value.sourceId) ||
    !["SCENIC_MANAGEMENT", "AUTHORIZED_FIELD_SURVEY", "MAP_PROVIDER_REFERENCE", "OPEN_DATA_PROTOTYPE", "PROJECT_EMPTY"].includes(String(value.category)) ||
    !isText(value.provider, 200) ||
    !isIsoInstant(value.acquiredAt) ||
    !isText(value.evidenceReference)
  ) {
    return null;
  }
  return value as RouteNetworkSource;
}

function parseRights(value: unknown): RouteNetworkRights | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "rightsHolder", "licenseReference", "validUntil", "allowsDisplay", "allowsRouting", "allowsCaching", "allowsDerivatives"]) ||
    !["CLEARED", "RESTRICTED", "UNKNOWN"].includes(String(value.status)) ||
    !isNullableText(value.rightsHolder, 200) ||
    !isNullableText(value.licenseReference) ||
    !isNullableIsoInstant(value.validUntil) ||
    ![value.allowsDisplay, value.allowsRouting, value.allowsCaching, value.allowsDerivatives].every((item) => typeof item === "boolean")
  ) {
    return null;
  }
  return value as RouteNetworkRights;
}

function parseReview(value: unknown): RouteNetworkReview | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "reviewedRevision", "gisReviewer", "managementApprover", "reviewedAt", "expiresAt", "evidenceReference"]) ||
    !["NOT_REVIEWED", "PENDING", "APPROVED", "REJECTED"].includes(String(value.status)) ||
    !isNullableText(value.reviewedRevision, 100) ||
    !isNullableText(value.gisReviewer, 200) ||
    !isNullableText(value.managementApprover, 200) ||
    !isNullableIsoInstant(value.reviewedAt) ||
    !isNullableIsoInstant(value.expiresAt) ||
    !isNullableText(value.evidenceReference)
  ) {
    return null;
  }
  return value as RouteNetworkReview;
}

function parseEntrance(value: unknown): RouteNetworkEntrance | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["id", "name", "type", "coordinate", "verification", "publicNodeId", "internalNodeId"]) ||
    !isId(value.id) ||
    !isText(value.name, 150) ||
    !["ENTRY", "EXIT", "ENTRY_EXIT", "TRANSFER"].includes(String(value.type)) ||
    !parseCoordinate(value.coordinate) ||
    !isId(value.publicNodeId) ||
    !isId(value.internalNodeId) ||
    !isRecord(value.verification) ||
    !exactKeys(value.verification, ["status", "checkedAt", "expiresAt", "verifier", "managementApprover", "evidenceReference"]) ||
    !["UNVERIFIED", "FIELD_VERIFIED", "MANAGEMENT_APPROVED"].includes(String(value.verification.status)) ||
    !isNullableIsoInstant(value.verification.checkedAt) ||
    !isNullableIsoInstant(value.verification.expiresAt) ||
    !isNullableText(value.verification.verifier, 200) ||
    !isNullableText(value.verification.managementApprover, 200) ||
    !isNullableText(value.verification.evidenceReference)
  ) {
    return null;
  }
  return value as RouteNetworkEntrance;
}

function parseNode(value: unknown): RouteNetworkNode | null {
  const baseKeys = ["id", "layer", "type", "entranceId", "coordinate"];
  const expectedKeys = isRecord(value) ? [
    ...baseKeys,
    ...(Object.hasOwn(value, "displayName") ? ["displayName"] : []),
    ...(Object.hasOwn(value, "poiId") ? ["poiId"] : []),
    ...(Object.hasOwn(value, "visit") ? ["visit"] : []),
  ] : baseKeys;
  const visit = isRecord(value) && Object.hasOwn(value, "visit") ? value.visit : undefined;
  const validVisit = visit === undefined || (
    isRecord(visit)
    && exactKeys(visit, ["interestTags", "dwellMinutes", "editorialPriority", "familyFriendly", "restArea", "photoSpot", "evidenceReference"])
    && Array.isArray(visit.interestTags)
    && visit.interestTags.length > 0
    && visit.interestTags.length <= 6
    && visit.interestTags.every((interest) => ["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"].includes(String(interest)))
    && new Set(visit.interestTags).size === visit.interestTags.length
    && Number.isSafeInteger(visit.dwellMinutes)
    && Number(visit.dwellMinutes) >= 5
    && Number(visit.dwellMinutes) <= 180
    && Number.isSafeInteger(visit.editorialPriority)
    && Number(visit.editorialPriority) >= 0
    && Number(visit.editorialPriority) <= 100
    && typeof visit.familyFriendly === "boolean"
    && typeof visit.restArea === "boolean"
    && typeof visit.photoSpot === "boolean"
    && isText(visit.evidenceReference, 500)
  );
  if (
    !isRecord(value) ||
    !exactKeys(value, expectedKeys) ||
    !isId(value.id) ||
    !["PUBLIC", "INTERNAL"].includes(String(value.layer)) ||
    !["ENTRANCE_CONNECTOR", "JUNCTION", "DESTINATION", "FACILITY", "TRANSIT"].includes(String(value.type)) ||
    !(value.entranceId === null || isId(value.entranceId)) ||
    !parseCoordinate(value.coordinate) ||
    (Object.hasOwn(value, "displayName") && !isText(value.displayName, 100)) ||
    (Object.hasOwn(value, "poiId") && !(value.poiId === null || isText(value.poiId, 100))) ||
    !validVisit
  ) {
    return null;
  }
  return value as RouteNetworkNode;
}

function parseGeometry(value: unknown): RouteNetworkEdge["geometry"] | null {
  if (!isRecord(value) || !exactKeys(value, ["type", "coordinates"]) || value.type !== "LineString" || !Array.isArray(value.coordinates) || value.coordinates.length < 2 || value.coordinates.length > 20_000) return null;
  for (const position of value.coordinates) {
    if (!Array.isArray(position) || position.length !== 2 || !isFiniteInRange(position[0], -180, 180) || !isFiniteInRange(position[1], -90, 90)) return null;
  }
  return value as RouteNetworkEdge["geometry"];
}

function parseAccessibility(value: unknown): RouteNetworkEdge["accessibility"] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "checkedAt", "expiresAt", "evidenceReference"]) ||
    !["VERIFIED_ACCESSIBLE", "VERIFIED_PARTIAL", "VERIFIED_NOT_ACCESSIBLE", "UNKNOWN"].includes(String(value.status)) ||
    !isNullableIsoInstant(value.checkedAt) ||
    !isNullableIsoInstant(value.expiresAt) ||
    !isNullableText(value.evidenceReference)
  ) {
    return null;
  }
  return value as RouteNetworkEdge["accessibility"];
}

function parseConstraints(value: unknown): RouteNetworkEdge["constraints"] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["stairs", "surface", "maxSlopePercent", "minWidthMeters", "lighting", "notes"]) ||
    !["NONE", "PRESENT", "UNKNOWN"].includes(String(value.stairs)) ||
    !["PAVED", "UNPAVED", "MIXED", "UNKNOWN"].includes(String(value.surface)) ||
    !(value.maxSlopePercent === null || isFiniteInRange(value.maxSlopePercent, 0, 100)) ||
    !(value.minWidthMeters === null || isFiniteInRange(value.minWidthMeters, 0.1, 100)) ||
    !["PRESENT", "ABSENT", "UNKNOWN"].includes(String(value.lighting)) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 20 ||
    !value.notes.every((note) => isText(note, 300))
  ) {
    return null;
  }
  return value as RouteNetworkEdge["constraints"];
}

function parseDynamicStatus(value: unknown): RouteNetworkEdge["dynamicStatus"] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "checkedAt", "expiresAt", "sourceReference", "responsibleParty"]) ||
    !["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].includes(String(value.status)) ||
    !isIsoInstant(value.checkedAt) ||
    !isIsoInstant(value.expiresAt) ||
    !isText(value.sourceReference) ||
    !isText(value.responsibleParty, 200)
  ) {
    return null;
  }
  return value as RouteNetworkEdge["dynamicStatus"];
}

function parseRoutingAttributes(value: unknown): NonNullable<RouteNetworkEdge["routing"]> | null {
  const hasTransportService = isRecord(value) && Object.hasOwn(value, "transportService");
  if (
    !isRecord(value) ||
    !exactKeys(value, ["traversalMode", "difficulty", "scenicScore", "evidenceReference", ...(hasTransportService ? ["transportService"] : [])]) ||
    !["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"].includes(String(value.traversalMode)) ||
    !["EASY", "MODERATE", "HARD"].includes(String(value.difficulty)) ||
    !Number.isSafeInteger(value.scenicScore) ||
    (value.scenicScore as number) < 0 ||
    (value.scenicScore as number) > 100 ||
    !isText(value.evidenceReference)
  ) {
    return null;
  }
  const transportMode = value.traversalMode === "CABLEWAY" || value.traversalMode === "SHUTTLE";
  if (!transportMode && hasTransportService) return null;
  if (hasTransportService) {
    const service = value.transportService;
    if (
      !isRecord(service)
      || !exactKeys(service, ["serviceName", "boardingMinutes", "expectedWaitMinutes", "inVehicleMinutes", "scheduleEvidenceReference"])
      || !isText(service.serviceName, 120)
      || !isFiniteInRange(service.boardingMinutes, 0, 30)
      || !isFiniteInRange(service.expectedWaitMinutes, 0, 120)
      || !isFiniteInRange(service.inVehicleMinutes, 0.01, 240)
      || !isText(service.scheduleEvidenceReference, 500)
    ) return null;
    try {
      const evidence = new URL(service.scheduleEvidenceReference as string);
      if (evidence.protocol !== "https:" || evidence.username || evidence.password) return null;
    } catch {
      return null;
    }
  }
  return value as NonNullable<RouteNetworkEdge["routing"]>;
}

function parseEdge(value: unknown): RouteNetworkEdge | null {
  const baseKeys = ["id", "layer", "fromNodeId", "toNodeId", "walkingDirection", "geometry", "distanceMeters", "estimatedMinutes", "verificationStatus", "accessibility", "constraints", "dynamicStatus"];
  const hasRouting = isRecord(value) && Object.hasOwn(value, "routing");
  if (
    !isRecord(value) ||
    !exactKeys(value, hasRouting ? [...baseKeys, "routing"] : baseKeys) ||
    !isId(value.id) ||
    !["PUBLIC", "INTERNAL"].includes(String(value.layer)) ||
    !isId(value.fromNodeId) ||
    !isId(value.toNodeId) ||
    value.fromNodeId === value.toNodeId ||
    !["FORWARD", "REVERSE", "BIDIRECTIONAL"].includes(String(value.walkingDirection)) ||
    !parseGeometry(value.geometry) ||
    !isFiniteInRange(value.distanceMeters, 0.1, 10_000_000) ||
    !isFiniteInRange(value.estimatedMinutes, 0.1, 1_000_000) ||
    !["UNVERIFIED_OSM_PROTOTYPE", "FIELD_VERIFIED", "MANAGEMENT_APPROVED"].includes(String(value.verificationStatus)) ||
    !parseAccessibility(value.accessibility) ||
    !parseConstraints(value.constraints) ||
    !parseDynamicStatus(value.dynamicStatus) ||
    (hasRouting && !parseRoutingAttributes(value.routing))
  ) {
    return null;
  }
  if (hasRouting) {
    const routing = parseRoutingAttributes(value.routing);
    const service = routing?.transportService;
    const reviewedTransportMinutes = service
      ? service.boardingMinutes + service.expectedWaitMinutes + service.inVehicleMinutes
      : null;
    if (reviewedTransportMinutes !== null && Math.abs(Number(value.estimatedMinutes) - reviewedTransportMinutes) > 0.01) return null;
  }
  return value as RouteNetworkEdge;
}

function parseRecommendedRoute(value: unknown): RouteNetworkRecommendedRoute | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["id", "name", "originNodeId", "destinationNodeId", "segments", "traversalModes", "distanceMeters", "estimatedMinutes", "sourceReference"])
    || !isId(value.id)
    || !isText(value.name, 150)
    || !isId(value.originNodeId)
    || !isId(value.destinationNodeId)
    || value.originNodeId === value.destinationNodeId
    || !Array.isArray(value.segments)
    || value.segments.length < 1
    || value.segments.length > 2_000
    || value.segments.some((segment) => !isRecord(segment)
      || !exactKeys(segment, ["edgeId", "traversalDirection"])
      || !isId(segment.edgeId)
      || !["FORWARD", "REVERSE"].includes(String(segment.traversalDirection)))
    || !Array.isArray(value.traversalModes)
    || value.traversalModes.length < 1
    || value.traversalModes.length > 6
    || value.traversalModes.some((mode) => !["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"].includes(String(mode)))
    || new Set(value.traversalModes).size !== value.traversalModes.length
    || !isFiniteInRange(value.distanceMeters, 0.1, 10_000_000)
    || !isFiniteInRange(value.estimatedMinutes, 0.1, 1_000_000)
    || !isText(value.sourceReference)
  ) return null;
  try {
    const source = new URL(value.sourceReference as string);
    if (source.protocol !== "https:" || source.username || source.password) return null;
  } catch {
    return null;
  }
  return value as RouteNetworkRecommendedRoute;
}

/**
 * Parses only the closed JSON contract. It does not imply that a syntactically
 * valid draft is safe to publish or route with.
 */
export function parseRouteNetwork(value: unknown): RouteNetworkManifest | null {
  const hasRecommendedRoutes = isRecord(value) && Object.hasOwn(value, "recommendedRoutes");
  const rawRecommendedRoutes = isRecord(value) && Array.isArray(value.recommendedRoutes) ? value.recommendedRoutes : null;
  if (
    !isRecord(value) ||
    !exactKeys(value, ["schemaVersion", "scenicAreaId", "revision", "publicationStatus", "publishedAt", "withdrawnAt", "expiresAt", "coordinateSystem", "source", "rights", "review", "entrances", "nodes", "edges", ...(hasRecommendedRoutes ? ["recommendedRoutes"] : [])]) ||
    value.schemaVersion !== 1 ||
    !isId(value.scenicAreaId) ||
    !isText(value.revision, 100) ||
    !["DRAFT", "PUBLISHED", "WITHDRAWN"].includes(String(value.publicationStatus)) ||
    !isNullableIsoInstant(value.publishedAt) ||
    !isNullableIsoInstant(value.withdrawnAt) ||
    !isNullableIsoInstant(value.expiresAt) ||
    value.coordinateSystem !== "WGS84" ||
    !parseSource(value.source) ||
    !parseRights(value.rights) ||
    !parseReview(value.review) ||
    !Array.isArray(value.entrances) ||
    value.entrances.length > MAX_ENTRANCES ||
    !Array.isArray(value.nodes) ||
    value.nodes.length > MAX_NODES ||
    !Array.isArray(value.edges) ||
    value.edges.length > MAX_EDGES ||
    (hasRecommendedRoutes && (!rawRecommendedRoutes || rawRecommendedRoutes.length > MAX_RECOMMENDED_ROUTES))
  ) {
    return null;
  }

  if (value.entrances.some((item) => !parseEntrance(item)) || value.nodes.some((item) => !parseNode(item)) || value.edges.some((item) => !parseEdge(item)) || (hasRecommendedRoutes && rawRecommendedRoutes!.some((item: unknown) => !parseRecommendedRoute(item)))) return null;
  return cloneJson(value as RouteNetworkManifest);
}

const sameCoordinate = (left: RouteNetworkCoordinate, right: RouteNetworkCoordinate) =>
  Math.abs(left.longitude - right.longitude) <= 1e-7 && Math.abs(left.latitude - right.latitude) <= 1e-7;

const geometryMatchesNode = (position: [number, number], node: RouteNetworkNode) =>
  Math.abs(position[0] - node.coordinate.longitude) <= 1e-7 && Math.abs(position[1] - node.coordinate.latitude) <= 1e-7;

function addUniqueIdIssues<T extends { id: string }>(
  values: T[],
  path: string,
  issues: RouteNetworkValidationIssue[],
) {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    if (ids.has(item.id)) issues.push({ code: "DUPLICATE_ID", path: `${path}.${index}.id`, message: `${item.id} 在 ${path} 中重复。` });
    ids.add(item.id);
  });
}

function reachableNodeIds(
  layer: RouteNetworkLayer,
  seeds: string[],
  nodes: RouteNetworkNode[],
  edges: RouteNetworkEdge[],
) {
  const adjacency = new Map<string, Set<string>>();
  nodes.filter((node) => node.layer === layer).forEach((node) => adjacency.set(node.id, new Set()));
  edges.filter((edge) => edge.layer === layer).forEach((edge) => {
    adjacency.get(edge.fromNodeId)?.add(edge.toNodeId);
    adjacency.get(edge.toNodeId)?.add(edge.fromNodeId);
  });
  const visited = new Set<string>();
  const queue = seeds.filter((seed) => adjacency.has(seed));
  while (queue.length) {
    const nodeId = queue.shift() as string;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    adjacency.get(nodeId)?.forEach((next) => {
      if (!visited.has(next)) queue.push(next);
    });
  }
  return visited;
}

/** Validates whether a manifest can be consumed as a current published network. */
export function validateRouteNetwork(
  value: unknown,
  now = new Date(),
  expectedScenicAreaId = "liuzu-town",
): RouteNetworkValidationResult {
  if (Number.isNaN(now.getTime())) {
    return {
      status: "BLOCKED",
      checkedAt: new Date(0).toISOString(),
      network: null,
      issues: [{ code: "CLOCK_INVALID", path: "$now", message: "校验时钟无效，路网已失败关闭。" }],
    };
  }

  const checkedAt = now.toISOString();
  const network = parseRouteNetwork(value);
  if (!network) {
    return {
      status: "BLOCKED",
      checkedAt,
      network: null,
      issues: [{ code: "SCHEMA_INVALID", path: "$", message: "路网不符合严格 schema，已拒绝加载。" }],
    };
  }

  const issues: RouteNetworkValidationIssue[] = [];
  const nowMs = now.getTime();
  const isExpired = (instant: string | null) => instant === null || new Date(instant).getTime() <= nowMs;
  const isFuture = (instant: string) => new Date(instant).getTime() > nowMs + FUTURE_CLOCK_SKEW_MS;

  if (network.scenicAreaId !== expectedScenicAreaId) issues.push({ code: "SCENIC_AREA_MISMATCH", path: "scenicAreaId", message: `路网属于 ${network.scenicAreaId}，不能用于 ${expectedScenicAreaId}。` });
  if (network.publicationStatus !== "PUBLISHED") issues.push({ code: "NOT_PUBLISHED", path: "publicationStatus", message: "路网不是已发布 revision。" });
  if (network.withdrawnAt !== null || network.publicationStatus === "WITHDRAWN") issues.push({ code: "WITHDRAWN", path: "withdrawnAt", message: "路网已经撤回，不能继续使用。" });
  if (network.publishedAt === null || (network.publishedAt !== null && isFuture(network.publishedAt))) issues.push({ code: "TIME_INVALID", path: "publishedAt", message: "发布时间缺失或位于未来。" });
  if (network.expiresAt === null || isExpired(network.expiresAt)) issues.push({ code: "DATASET_EXPIRED", path: "expiresAt", message: "路网有效期缺失或已经过期。" });
  if (network.withdrawnAt !== null && network.publishedAt !== null && new Date(network.withdrawnAt).getTime() < new Date(network.publishedAt).getTime()) issues.push({ code: "TIME_INVALID", path: "withdrawnAt", message: "撤回时间早于发布时间。" });
  if (isFuture(network.source.acquiredAt)) issues.push({ code: "TIME_INVALID", path: "source.acquiredAt", message: "来源采集时间位于未来。" });

  if (["MAP_PROVIDER_REFERENCE", "OPEN_DATA_PROTOTYPE", "PROJECT_EMPTY"].includes(network.source.category)) {
    issues.push({ code: "SOURCE_UNPUBLISHABLE", path: "source.category", message: "空数据、地图供应商引用或开放地图原型不能单独升级为公共/内部正式路网。" });
  }
  if (
    network.rights.status !== "CLEARED" ||
    !network.rights.rightsHolder ||
    !network.rights.licenseReference ||
    !network.rights.allowsDisplay ||
    !network.rights.allowsRouting ||
    isExpired(network.rights.validUntil)
  ) {
    issues.push({ code: "RIGHTS_BLOCKED", path: "rights", message: "展示、路由或有效期权利未完整放行。" });
  }
  if (
    network.review.status !== "APPROVED" ||
    network.review.reviewedRevision !== network.revision ||
    !network.review.gisReviewer ||
    !network.review.managementApprover ||
    network.review.gisReviewer?.trim().toLocaleLowerCase() === network.review.managementApprover?.trim().toLocaleLowerCase() ||
    !network.review.reviewedAt ||
    !network.review.evidenceReference ||
    isExpired(network.review.expiresAt) ||
    (network.review.reviewedAt !== null && isFuture(network.review.reviewedAt))
  ) {
    issues.push({ code: "REVIEW_BLOCKED", path: "review", message: "GIS 与管理方审核未对当前 revision 完整、独立且在有效期内通过。" });
  }

  addUniqueIdIssues(network.entrances, "entrances", issues);
  addUniqueIdIssues(network.nodes, "nodes", issues);
  addUniqueIdIssues(network.edges, "edges", issues);
  addUniqueIdIssues(network.recommendedRoutes ?? [], "recommendedRoutes", issues);

  if (!network.entrances.some((entrance) => entrance.type === "ENTRY" || entrance.type === "ENTRY_EXIT")) {
    issues.push({ code: "NO_ENTRANCE", path: "entrances", message: "没有可进入景区的已核验入口。" });
  }
  if (!network.edges.some((edge) => edge.layer === "PUBLIC")) issues.push({ code: "NO_PUBLIC_EDGE", path: "edges", message: "公共道路层为空。" });
  if (!network.edges.some((edge) => edge.layer === "INTERNAL")) issues.push({ code: "NO_INTERNAL_EDGE", path: "edges", message: "景区内部路网层为空。" });

  const nodesById = new Map(network.nodes.map((node) => [node.id, node]));
  const entrancesById = new Map(network.entrances.map((entrance) => [entrance.id, entrance]));

  network.nodes.forEach((node, index) => {
    if (isFuture(node.coordinate.capturedAt)) issues.push({ code: "TIME_INVALID", path: `nodes.${index}.coordinate.capturedAt`, message: `${node.id} 的坐标采集时间位于未来。` });
    if (node.type === "ENTRANCE_CONNECTOR") {
      const entrance = node.entranceId ? entrancesById.get(node.entranceId) : undefined;
      if (!entrance || (node.layer === "PUBLIC" ? entrance.publicNodeId !== node.id : entrance.internalNodeId !== node.id)) {
        issues.push({ code: "ENTRANCE_CONNECTION_INVALID", path: `nodes.${index}`, message: `${node.id} 不是合法入口连接节点。` });
      }
    } else if (node.entranceId !== null) {
      issues.push({ code: "ENTRANCE_CONNECTION_INVALID", path: `nodes.${index}.entranceId`, message: "只有入口连接节点可以引用 entranceId。" });
    }
  });

  network.entrances.forEach((entrance, index) => {
    const verification = entrance.verification;
    if (
      verification.status !== "MANAGEMENT_APPROVED" ||
      !verification.checkedAt ||
      !verification.expiresAt ||
      !verification.verifier ||
      !verification.managementApprover ||
      verification.verifier.trim().toLocaleLowerCase() === verification.managementApprover.trim().toLocaleLowerCase() ||
      !verification.evidenceReference ||
      isExpired(verification.expiresAt) ||
      (verification.checkedAt !== null && isFuture(verification.checkedAt))
    ) {
      issues.push({ code: "ENTRANCE_UNVERIFIED", path: `entrances.${index}.verification`, message: `${entrance.id} 未完成现场与管理方双重核验，或核验证据已过期。` });
    }
    if (isFuture(entrance.coordinate.capturedAt)) issues.push({ code: "TIME_INVALID", path: `entrances.${index}.coordinate.capturedAt`, message: `${entrance.id} 的坐标采集时间位于未来。` });
    const publicNode = nodesById.get(entrance.publicNodeId);
    const internalNode = nodesById.get(entrance.internalNodeId);
    if (
      !publicNode ||
      !internalNode ||
      publicNode.layer !== "PUBLIC" ||
      internalNode.layer !== "INTERNAL" ||
      publicNode.type !== "ENTRANCE_CONNECTOR" ||
      internalNode.type !== "ENTRANCE_CONNECTOR" ||
      publicNode.entranceId !== entrance.id ||
      internalNode.entranceId !== entrance.id ||
      !sameCoordinate(entrance.coordinate, publicNode.coordinate) ||
      !sameCoordinate(entrance.coordinate, internalNode.coordinate)
    ) {
      issues.push({ code: "ENTRANCE_CONNECTION_INVALID", path: `entrances.${index}`, message: `${entrance.id} 未在同一核验坐标正确连接公共层与内部层。` });
    }
  });

  network.edges.forEach((edge, index) => {
    const from = nodesById.get(edge.fromNodeId);
    const to = nodesById.get(edge.toNodeId);
    if (!from || !to) {
      issues.push({ code: "EDGE_REFERENCE_INVALID", path: `edges.${index}`, message: `${edge.id} 引用了不存在的节点。` });
      return;
    }
    if (from.layer !== edge.layer || to.layer !== edge.layer) {
      issues.push({ code: "CROSS_LAYER_EDGE", path: `edges.${index}`, message: `${edge.id} 跨越公共/内部层，已拒绝。` });
    }
    const first = edge.geometry.coordinates[0];
    const last = edge.geometry.coordinates[edge.geometry.coordinates.length - 1];
    if (!geometryMatchesNode(first, from) || !geometryMatchesNode(last, to)) {
      issues.push({ code: "EDGE_GEOMETRY_INVALID", path: `edges.${index}.geometry`, message: `${edge.id} 的线端点与步行方向/拓扑节点不一致。` });
    }
    if (edge.verificationStatus !== "MANAGEMENT_APPROVED") {
      issues.push({ code: "EDGE_UNVERIFIED", path: `edges.${index}.verificationStatus`, message: `${edge.id} 不是管理方批准的实测边。` });
    }
    const dynamic = edge.dynamicStatus;
    if (isFuture(dynamic.checkedAt) || new Date(dynamic.expiresAt).getTime() <= new Date(dynamic.checkedAt).getTime() || isExpired(dynamic.expiresAt)) {
      issues.push({ code: "STATUS_EXPIRED", path: `edges.${index}.dynamicStatus`, message: `${edge.id} 的动态状态无效或已过期。` });
    }
    const accessibility = edge.accessibility;
    const accessibilityUnknownIsClean = accessibility.status === "UNKNOWN" && accessibility.checkedAt === null && accessibility.expiresAt === null && accessibility.evidenceReference === null;
    const accessibilityVerifiedIsCurrent = accessibility.status !== "UNKNOWN" && accessibility.checkedAt !== null && accessibility.expiresAt !== null && accessibility.evidenceReference !== null && !isFuture(accessibility.checkedAt) && new Date(accessibility.expiresAt).getTime() > new Date(accessibility.checkedAt).getTime() && !isExpired(accessibility.expiresAt);
    if (!accessibilityUnknownIsClean && !accessibilityVerifiedIsCurrent) {
      issues.push({ code: "ACCESSIBILITY_EVIDENCE_INVALID", path: `edges.${index}.accessibility`, message: `${edge.id} 的无障碍状态与证据/有效期不一致。` });
    }
  });

  const edgesById = new Map(network.edges.map((edge) => [edge.id, edge]));
  (network.recommendedRoutes ?? []).forEach((route, index) => {
    const origin = nodesById.get(route.originNodeId);
    const destination = nodesById.get(route.destinationNodeId);
    let currentNodeId = route.originNodeId;
    const modes = new Set<RouteTraversalMode>();
    let distanceMeters = 0;
    let estimatedMinutes = 0;
    const seenEdges = new Set<string>();
    let valid = Boolean(origin && destination && origin.layer === "INTERNAL" && destination.layer === "INTERNAL");
    for (const segment of route.segments) {
      const edge = edgesById.get(segment.edgeId);
      if (!edge || edge.layer !== "INTERNAL" || seenEdges.has(segment.edgeId)) { valid = false; break; }
      seenEdges.add(segment.edgeId);
      const forward = segment.traversalDirection === "FORWARD";
      const directionAllowed = forward
        ? edge.walkingDirection === "FORWARD" || edge.walkingDirection === "BIDIRECTIONAL"
        : edge.walkingDirection === "REVERSE" || edge.walkingDirection === "BIDIRECTIONAL";
      const fromNodeId = forward ? edge.fromNodeId : edge.toNodeId;
      const toNodeId = forward ? edge.toNodeId : edge.fromNodeId;
      if (!directionAllowed || fromNodeId !== currentNodeId || !edge.routing) { valid = false; break; }
      currentNodeId = toNodeId;
      modes.add(edge.routing.traversalMode);
      distanceMeters += edge.distanceMeters;
      estimatedMinutes += edge.estimatedMinutes;
    }
    if (
      currentNodeId !== route.destinationNodeId
      || modes.size !== route.traversalModes.length
      || route.traversalModes.some((mode) => !modes.has(mode))
      || Math.abs(distanceMeters - route.distanceMeters) > 0.05
      || Math.abs(estimatedMinutes - route.estimatedMinutes) > 0.05
    ) valid = false;
    if (!valid) issues.push({ code: "RECOMMENDED_ROUTE_INVALID", path: `recommendedRoutes.${index}`, message: `${route.id} 未形成当前内部路网中连续、唯一且方向可通行的正式边序列。` });
  });

  for (const layer of ["PUBLIC", "INTERNAL"] as const) {
    const seeds = network.entrances.map((entrance) => layer === "PUBLIC" ? entrance.publicNodeId : entrance.internalNodeId);
    const reachable = reachableNodeIds(layer, seeds, network.nodes, network.edges);
    const disconnected = network.nodes.filter((node) => node.layer === layer && !reachable.has(node.id));
    if (disconnected.length) {
      issues.push({ code: "NETWORK_DISCONNECTED", path: "nodes", message: `${layer} 层存在无法从核验入口到达的节点：${disconnected.map((node) => node.id).join("、")}。` });
    }
  }

  const openEdges = network.edges.filter((edge) => edge.dynamicStatus.status === "OPEN");
  const openIncidentNodes = new Set(openEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
  const hasOpenBridge = network.entrances.some((entrance) =>
    (entrance.type === "ENTRY" || entrance.type === "ENTRY_EXIT") &&
    openIncidentNodes.has(entrance.publicNodeId) &&
    openIncidentNodes.has(entrance.internalNodeId));
  if (!hasOpenBridge) issues.push({ code: "NO_OPEN_CROSS_LAYER_CONNECTION", path: "entrances", message: "当前没有同时接入开放公共边和开放内部边的核验入口。" });

  return { status: issues.length ? "BLOCKED" : "PUBLISHABLE", checkedAt, network, issues };
}

/**
 * Returns a detached, current network containing only OPEN edges. Any schema,
 * provenance, rights, review, topology or freshness problem returns null.
 */
export function getSafePublishedNetwork(
  value: unknown,
  now = new Date(),
  expectedScenicAreaId = "liuzu-town",
): RouteNetworkManifest | null {
  const result = validateRouteNetwork(value, now, expectedScenicAreaId);
  if (result.status !== "PUBLISHABLE" || !result.network) return null;
  const openEdges = result.network.edges.filter((edge) => edge.dynamicStatus.status === "OPEN").map(cloneJson);
  const openEdgeIds = new Set(openEdges.map((edge) => edge.id));
  return {
    ...cloneJson(result.network),
    edges: openEdges,
    ...(result.network.recommendedRoutes ? {
      recommendedRoutes: result.network.recommendedRoutes
        .filter((route) => route.segments.every((segment) => openEdgeIds.has(segment.edgeId)))
        .map(cloneJson),
    } : {}),
  };
}
