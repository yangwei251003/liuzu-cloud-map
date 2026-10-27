import {
  ALL_ROUTE_TRAVERSAL_MODES,
  type DirectedRouteOptimization,
  type DirectedRoutePreference,
  type DirectedRouteProfile,
  type DirectedRouteRequest,
} from "../directed-route-engine";

export type FormalRoutePlanInput = DirectedRouteRequest;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

export const isFormalRoutingId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100 && ID_PATTERN.test(value);

const isRevision = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100;

function parseProfile(value: unknown): DirectedRouteProfile | null {
  if (!isRecord(value) || !exactKeys(value, ["kind", "maxSlopePercent", "minimumWidthMeters"])) return null;
  if (value.kind === "WALK") {
    return value.maxSlopePercent === null && value.minimumWidthMeters === null
      ? { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null }
      : null;
  }
  if (
    value.kind !== "STEP_FREE"
    || typeof value.maxSlopePercent !== "number"
    || !Number.isFinite(value.maxSlopePercent)
    || value.maxSlopePercent < 0
    || value.maxSlopePercent > 100
    || typeof value.minimumWidthMeters !== "number"
    || !Number.isFinite(value.minimumWidthMeters)
    || value.minimumWidthMeters < 0.1
    || value.minimumWidthMeters > 100
  ) {
    return null;
  }
  return {
    kind: "STEP_FREE",
    maxSlopePercent: value.maxSlopePercent,
    minimumWidthMeters: value.minimumWidthMeters,
  };
}

function parseOptimization(value: unknown): DirectedRouteOptimization | null {
  return value === "FASTEST" || value === "SHORTEST" || value === "SCENIC" ? value : null;
}

function parsePreference(value: unknown): DirectedRoutePreference | null {
  if (!isRecord(value) || !exactKeys(value, ["pace", "maximumDifficulty", "allowedTraversalModes"])) return null;
  if (!["RELAXED", "BALANCED", "ACTIVE"].includes(String(value.pace))) return null;
  if (!["EASY", "MODERATE", "HARD"].includes(String(value.maximumDifficulty))) return null;
  if (
    !Array.isArray(value.allowedTraversalModes)
    || value.allowedTraversalModes.length < 1
    || value.allowedTraversalModes.length > ALL_ROUTE_TRAVERSAL_MODES.length
    || !value.allowedTraversalModes.every((mode) => ALL_ROUTE_TRAVERSAL_MODES.includes(mode as (typeof ALL_ROUTE_TRAVERSAL_MODES)[number]))
    || new Set(value.allowedTraversalModes).size !== value.allowedTraversalModes.length
  ) {
    return null;
  }
  return {
    pace: value.pace as DirectedRoutePreference["pace"],
    maximumDifficulty: value.maximumDifficulty as DirectedRoutePreference["maximumDifficulty"],
    allowedTraversalModes: [...value.allowedTraversalModes] as DirectedRoutePreference["allowedTraversalModes"],
  };
}

/**
 * Parses the public route-plan request as a closed contract. Coordinates,
 * provider route IDs, POI searches and arbitrary routing hints are rejected:
 * the caller must use exact nodes from the currently published snapshot.
 */
export function parseFormalRoutePlanInput(value: unknown): FormalRoutePlanInput | null {
  const baseKeys = [
    "scenicAreaId",
    "fromNodeId",
    "toNodeId",
    "expectedNetworkRevision",
    "expectedOperationalVersion",
    "profile",
  ];
  const hasStrategy = isRecord(value) && (Object.hasOwn(value, "optimization") || Object.hasOwn(value, "preference"));
  const hasRecommendedRoute = isRecord(value) && Object.hasOwn(value, "recommendedRouteId");
  if (
    !isRecord(value)
    || !exactKeys(value, [...baseKeys, ...(hasStrategy ? ["optimization", "preference"] : []), ...(hasRecommendedRoute ? ["recommendedRouteId"] : [])])
    || !isFormalRoutingId(value.scenicAreaId)
    || !isFormalRoutingId(value.fromNodeId)
    || !isFormalRoutingId(value.toNodeId)
    || !isRevision(value.expectedNetworkRevision)
    || typeof value.expectedOperationalVersion !== "number"
    || !Number.isSafeInteger(value.expectedOperationalVersion)
    || value.expectedOperationalVersion < 1
    || (hasRecommendedRoute && !isFormalRoutingId(value.recommendedRouteId))
  ) {
    return null;
  }
  const profile = parseProfile(value.profile);
  const optimization = hasStrategy ? parseOptimization(value.optimization) : undefined;
  const preference = hasStrategy ? parsePreference(value.preference) : undefined;
  if (!profile || (hasStrategy && (!optimization || !preference))) return null;
  return {
    scenicAreaId: value.scenicAreaId,
    fromNodeId: value.fromNodeId,
    toNodeId: value.toNodeId,
    expectedNetworkRevision: value.expectedNetworkRevision,
    expectedOperationalVersion: value.expectedOperationalVersion,
    profile,
    ...(optimization && preference ? { optimization, preference } : {}),
    ...(hasRecommendedRoute ? { recommendedRouteId: value.recommendedRouteId as string } : {}),
  };
}
