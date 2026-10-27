import type { GeoJsonProperties, Geometry } from "geojson";

export const MAP_EDITOR_DRAFT_STORAGE_KEY = "liuzu.map-editor-drafts.v2";
export const MAP_EDITOR_DRAFT_SCHEMA_VERSION = 2;

export const MAP_DRAFT_OBJECT_TYPES = ["ENTRANCE", "PATH", "POI", "FACILITY", "RECOMMENDED_ROUTE", "BOUNDARY", "NOTE"] as const;
export type MapDraftObjectType = (typeof MAP_DRAFT_OBJECT_TYPES)[number];

export const MAP_DRAFT_TRAVERSAL_MODES = ["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"] as const;
export type MapDraftTraversalMode = (typeof MAP_DRAFT_TRAVERSAL_MODES)[number];
export const MAP_DRAFT_INTERESTS = ["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"] as const;
export type MapDraftInterest = (typeof MAP_DRAFT_INTERESTS)[number];

export type MapDraftTransportService = {
  serviceName: string;
  boardingMinutes: number;
  expectedWaitMinutes: number;
  inVehicleMinutes: number;
  scheduleEvidenceReference: string;
};

export type MapDraftRoutingAttributes = {
  traversalMode: MapDraftTraversalMode;
  difficulty: "EASY" | "MODERATE" | "HARD";
  scenicScore: number;
  accessibility: "VERIFIED_ACCESSIBLE" | "NOT_ACCESSIBLE" | "PARTIAL" | "UNKNOWN";
  walkingTimeMultiplier: number;
  transportService?: MapDraftTransportService;
};

export type MapDraftVisitAttributes = {
  interests: MapDraftInterest[];
  dwellMinutes: number;
  editorialPriority: number;
  familyFriendly: boolean;
  restArea: boolean;
  photoSpot: boolean;
};

export type MapDraftGeometry = Extract<Geometry, { type: "Point" | "LineString" | "Polygon" }>;

export type MapEditorDraft = {
  schemaVersion: 2;
  id: string;
  scenicAreaId: "liuzu-town";
  title: string;
  objectType: MapDraftObjectType;
  geometry: MapDraftGeometry;
  coordinateSystem: "WGS84";
  source: {
    label: string;
    url: string | null;
    capturedAt: string;
  };
  routingAttributes: MapDraftRoutingAttributes | null;
  visitAttributes: MapDraftVisitAttributes | null;
  notes: string | null;
  verificationStatus: "CANDIDATE_DRAFT";
  publicationStatus: "LOCAL_DRAFT_ONLY";
  createdAt: string;
  updatedAt: string;
};

export type MapEditorDraftCollection = {
  schemaVersion: 2;
  scenicAreaId: "liuzu-town";
  warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION";
  drafts: MapEditorDraft[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function nullableBoundedText(value: unknown, maximum: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maximum);
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(new Date(value).getTime());
}

function validSourceUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseTransportService(value: unknown): MapDraftTransportService | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["serviceName", "boardingMinutes", "expectedWaitMinutes", "inVehicleMinutes", "scheduleEvidenceReference"])
    || !boundedText(value.serviceName, 120)
    || typeof value.boardingMinutes !== "number"
    || !Number.isFinite(value.boardingMinutes)
    || value.boardingMinutes < 0
    || value.boardingMinutes > 30
    || typeof value.expectedWaitMinutes !== "number"
    || !Number.isFinite(value.expectedWaitMinutes)
    || value.expectedWaitMinutes < 0
    || value.expectedWaitMinutes > 120
    || typeof value.inVehicleMinutes !== "number"
    || !Number.isFinite(value.inVehicleMinutes)
    || value.inVehicleMinutes <= 0
    || value.inVehicleMinutes > 240
    || !validSourceUrl(value.scheduleEvidenceReference)
    || value.scheduleEvidenceReference === null
  ) return null;
  return structuredClone(value as MapDraftTransportService);
}

function parseRoutingAttributes(value: unknown): MapDraftRoutingAttributes | null {
  const hasTransportService = isRecord(value) && Object.hasOwn(value, "transportService");
  if (
    !isRecord(value)
    || !exactKeys(value, ["traversalMode", "difficulty", "scenicScore", "accessibility", "walkingTimeMultiplier", ...(hasTransportService ? ["transportService"] : [])])
    || !MAP_DRAFT_TRAVERSAL_MODES.includes(value.traversalMode as MapDraftTraversalMode)
    || !["EASY", "MODERATE", "HARD"].includes(String(value.difficulty))
    || !Number.isInteger(value.scenicScore)
    || Number(value.scenicScore) < 0
    || Number(value.scenicScore) > 100
    || !["VERIFIED_ACCESSIBLE", "NOT_ACCESSIBLE", "PARTIAL", "UNKNOWN"].includes(String(value.accessibility))
    || typeof value.walkingTimeMultiplier !== "number"
    || !Number.isFinite(value.walkingTimeMultiplier)
    || value.walkingTimeMultiplier < 0.5
    || value.walkingTimeMultiplier > 5
  ) return null;
  const transportMode = value.traversalMode === "CABLEWAY" || value.traversalMode === "SHUTTLE";
  const transportService = hasTransportService ? parseTransportService(value.transportService) : null;
  if (
    (transportMode && (!transportService || value.walkingTimeMultiplier !== 1))
    || (!transportMode && hasTransportService)
  ) return null;
  return structuredClone(value as MapDraftRoutingAttributes);
}

function parseVisitAttributes(value: unknown): MapDraftVisitAttributes | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["interests", "dwellMinutes", "editorialPriority", "familyFriendly", "restArea", "photoSpot"])
    || !Array.isArray(value.interests)
    || value.interests.length < 1
    || value.interests.length > MAP_DRAFT_INTERESTS.length
    || !value.interests.every((interest) => MAP_DRAFT_INTERESTS.includes(interest as MapDraftInterest))
    || new Set(value.interests).size !== value.interests.length
    || !Number.isInteger(value.dwellMinutes)
    || Number(value.dwellMinutes) < 5
    || Number(value.dwellMinutes) > 180
    || !Number.isInteger(value.editorialPriority)
    || Number(value.editorialPriority) < 0
    || Number(value.editorialPriority) > 100
    || typeof value.familyFriendly !== "boolean"
    || typeof value.restArea !== "boolean"
    || typeof value.photoSpot !== "boolean"
  ) return null;
  return structuredClone(value as MapDraftVisitAttributes);
}

function validPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function countAndValidateCoordinates(value: unknown, depth: number): { valid: boolean; count: number } {
  if (depth === 0) return { valid: validPosition(value), count: validPosition(value) ? 1 : 0 };
  if (!Array.isArray(value) || value.length === 0) return { valid: false, count: 0 };
  let count = 0;
  for (const child of value) {
    const result = countAndValidateCoordinates(child, depth - 1);
    if (!result.valid) return { valid: false, count };
    count += result.count;
    if (count > 10_000) return { valid: false, count };
  }
  return { valid: true, count };
}

export function parseMapDraftGeometry(value: unknown): MapDraftGeometry | null {
  if (!isRecord(value) || !exactKeys(value, ["type", "coordinates"])) return null;
  if (value.type === "Point" && countAndValidateCoordinates(value.coordinates, 0).valid) {
    return structuredClone(value as unknown as MapDraftGeometry);
  }
  if (value.type === "LineString") {
    const check = countAndValidateCoordinates(value.coordinates, 1);
    if (check.valid && check.count >= 2) return structuredClone(value as unknown as MapDraftGeometry);
  }
  if (value.type === "Polygon") {
    const check = countAndValidateCoordinates(value.coordinates, 2);
    if (check.valid && check.count >= 4) {
      const rings = value.coordinates as unknown[][];
      const outer = rings[0];
      if (Array.isArray(outer) && JSON.stringify(outer[0]) === JSON.stringify(outer[outer.length - 1])) {
        return structuredClone(value as unknown as MapDraftGeometry);
      }
    }
  }
  return null;
}

export function parseMapEditorDraft(value: unknown): MapEditorDraft | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "id", "scenicAreaId", "title", "objectType", "geometry", "coordinateSystem", "source", "routingAttributes", "visitAttributes", "notes", "verificationStatus", "publicationStatus", "createdAt", "updatedAt"])
    || value.schemaVersion !== MAP_EDITOR_DRAFT_SCHEMA_VERSION
    || !boundedText(value.id, 100)
    || value.scenicAreaId !== "liuzu-town"
    || !boundedText(value.title, 120)
    || !MAP_DRAFT_OBJECT_TYPES.includes(value.objectType as MapDraftObjectType)
    || value.coordinateSystem !== "WGS84"
    || !isRecord(value.source)
    || !exactKeys(value.source, ["label", "url", "capturedAt"])
    || !boundedText(value.source.label, 180)
    || !validSourceUrl(value.source.url)
    || !isIsoInstant(value.source.capturedAt)
    || !nullableBoundedText(value.notes, 1_000)
    || value.verificationStatus !== "CANDIDATE_DRAFT"
    || value.publicationStatus !== "LOCAL_DRAFT_ONLY"
    || !isIsoInstant(value.createdAt)
    || !isIsoInstant(value.updatedAt)
  ) return null;
  const geometry = parseMapDraftGeometry(value.geometry);
  if (!geometry) return null;
  const lineObject = value.objectType === "PATH" || value.objectType === "RECOMMENDED_ROUTE";
  const visitObject = value.objectType === "POI" || value.objectType === "FACILITY";
  if (
    (value.objectType === "ENTRANCE" || visitObject) && geometry.type !== "Point"
    || lineObject && geometry.type !== "LineString"
    || value.objectType === "BOUNDARY" && geometry.type !== "Polygon"
  ) return null;
  const routingAttributes = value.routingAttributes === null ? null : parseRoutingAttributes(value.routingAttributes);
  const visitAttributes = value.visitAttributes === null ? null : parseVisitAttributes(value.visitAttributes);
  if ((lineObject && routingAttributes === null) || (!lineObject && value.routingAttributes !== null)) return null;
  if ((visitObject && visitAttributes === null) || (!visitObject && value.visitAttributes !== null)) return null;
  return structuredClone({ ...value, geometry, routingAttributes, visitAttributes } as MapEditorDraft);
}

export function createEmptyMapEditorDraftCollection(): MapEditorDraftCollection {
  return {
    schemaVersion: MAP_EDITOR_DRAFT_SCHEMA_VERSION,
    scenicAreaId: "liuzu-town",
    warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
    drafts: [],
  };
}

export function parseMapEditorDraftCollection(value: unknown): MapEditorDraftCollection | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "scenicAreaId", "warning", "drafts"])
    || value.schemaVersion !== MAP_EDITOR_DRAFT_SCHEMA_VERSION
    || value.scenicAreaId !== "liuzu-town"
    || value.warning !== "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION"
    || !Array.isArray(value.drafts)
    || value.drafts.length > 200
  ) return null;
  const drafts = value.drafts.map(parseMapEditorDraft);
  if (drafts.some((draft) => draft === null)) return null;
  const ids = drafts.map((draft) => draft!.id);
  if (new Set(ids).size !== ids.length) return null;
  return { ...createEmptyMapEditorDraftCollection(), drafts: drafts as MapEditorDraft[] };
}

export function createMapEditorDraft(input: {
  id: string;
  title: string;
  objectType: MapDraftObjectType;
  geometry: unknown;
  sourceLabel: string;
  sourceUrl?: string | null;
  capturedAt: Date;
  routingAttributes?: MapDraftRoutingAttributes | null;
  visitAttributes?: MapDraftVisitAttributes | null;
  notes?: string | null;
  now: Date;
}): MapEditorDraft | null {
  if (Number.isNaN(input.capturedAt.getTime()) || Number.isNaN(input.now.getTime())) return null;
  const instant = input.now.toISOString();
  const candidate: MapEditorDraft = {
    schemaVersion: MAP_EDITOR_DRAFT_SCHEMA_VERSION,
    id: input.id,
    scenicAreaId: "liuzu-town",
    title: input.title.trim(),
    objectType: input.objectType,
    geometry: input.geometry as MapDraftGeometry,
    coordinateSystem: "WGS84",
    source: {
      label: input.sourceLabel.trim(),
      url: input.sourceUrl?.trim() || null,
      capturedAt: input.capturedAt.toISOString(),
    },
    routingAttributes: input.routingAttributes ?? null,
    visitAttributes: input.visitAttributes ?? null,
    notes: input.notes?.trim() || null,
    verificationStatus: "CANDIDATE_DRAFT",
    publicationStatus: "LOCAL_DRAFT_ONLY",
    createdAt: instant,
    updatedAt: instant,
  };
  return parseMapEditorDraft(candidate);
}

export function mapDraftsToFeatureCollection(collection: MapEditorDraftCollection) {
  return {
    type: "FeatureCollection" as const,
    properties: {
      schemaVersion: collection.schemaVersion,
      scenicAreaId: collection.scenicAreaId,
      warning: collection.warning,
    } satisfies GeoJsonProperties,
    features: collection.drafts.map((draft) => ({
      type: "Feature" as const,
      id: draft.id,
      geometry: structuredClone(draft.geometry),
      properties: {
        title: draft.title,
        objectType: draft.objectType,
        coordinateSystem: draft.coordinateSystem,
        sourceLabel: draft.source.label,
        sourceUrl: draft.source.url,
        capturedAt: draft.source.capturedAt,
        routingAttributes: draft.routingAttributes,
        visitAttributes: draft.visitAttributes,
        notes: draft.notes,
        verificationStatus: draft.verificationStatus,
        publicationStatus: draft.publicationStatus,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    })),
  };
}
