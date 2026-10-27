import { ALL_ROUTE_TRAVERSAL_MODES, type DirectedRoutePreference, type DirectedRouteProfile } from "../directed-route-engine";
import type { FormalScenicItineraryInput, ScenicItineraryCompanion } from "../formal-scenic-itinerary";
import type { RouteVisitInterest } from "../route-network";
import { isFormalRoutingId } from "./formal-routing-domain";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseProfile(value: unknown): DirectedRouteProfile | null {
  if (!isRecord(value) || !exactKeys(value, ["kind", "maxSlopePercent", "minimumWidthMeters"])) return null;
  if (value.kind === "WALK" && value.maxSlopePercent === null && value.minimumWidthMeters === null) {
    return { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null };
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
  ) return null;
  return { kind: "STEP_FREE", maxSlopePercent: value.maxSlopePercent, minimumWidthMeters: value.minimumWidthMeters };
}

function parsePreference(value: unknown): DirectedRoutePreference | null {
  if (!isRecord(value) || !exactKeys(value, ["pace", "maximumDifficulty", "allowedTraversalModes"])) return null;
  if (!(["RELAXED", "BALANCED", "ACTIVE"] as unknown[]).includes(value.pace)) return null;
  if (!(["EASY", "MODERATE", "HARD"] as unknown[]).includes(value.maximumDifficulty)) return null;
  if (
    !Array.isArray(value.allowedTraversalModes)
    || value.allowedTraversalModes.length < 1
    || value.allowedTraversalModes.length > ALL_ROUTE_TRAVERSAL_MODES.length
    || !value.allowedTraversalModes.every((mode) => ALL_ROUTE_TRAVERSAL_MODES.includes(mode as (typeof ALL_ROUTE_TRAVERSAL_MODES)[number]))
    || new Set(value.allowedTraversalModes).size !== value.allowedTraversalModes.length
  ) return null;
  return {
    pace: value.pace as DirectedRoutePreference["pace"],
    maximumDifficulty: value.maximumDifficulty as DirectedRoutePreference["maximumDifficulty"],
    allowedTraversalModes: [...value.allowedTraversalModes] as DirectedRoutePreference["allowedTraversalModes"],
  };
}

export function parseFormalScenicItineraryInput(value: unknown): FormalScenicItineraryInput | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "scenicAreaId",
      "originNodeId",
      "exitNodeId",
      "expectedNetworkRevision",
      "expectedOperationalVersion",
      "budgetMinutes",
      "interests",
      "companion",
      "maxStops",
      "profile",
      "preference",
    ])
    || !isFormalRoutingId(value.scenicAreaId)
    || !isFormalRoutingId(value.originNodeId)
    || !isFormalRoutingId(value.exitNodeId)
    || typeof value.expectedNetworkRevision !== "string"
    || !value.expectedNetworkRevision.trim()
    || value.expectedNetworkRevision.length > 100
    || !Number.isSafeInteger(value.expectedOperationalVersion)
    || Number(value.expectedOperationalVersion) < 1
    || !Number.isSafeInteger(value.budgetMinutes)
    || Number(value.budgetMinutes) < 60
    || Number(value.budgetMinutes) > 480
    || !Array.isArray(value.interests)
    || value.interests.length < 1
    || value.interests.length > 6
    || !value.interests.every((interest) => ["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"].includes(String(interest)))
    || new Set(value.interests).size !== value.interests.length
    || !["SOLO", "FRIENDS", "FAMILY", "SENIOR"].includes(String(value.companion))
    || !Number.isSafeInteger(value.maxStops)
    || Number(value.maxStops) < 1
    || Number(value.maxStops) > 8
  ) return null;
  const profile = parseProfile(value.profile);
  const preference = parsePreference(value.preference);
  if (!profile || !preference) return null;
  return {
    scenicAreaId: value.scenicAreaId,
    originNodeId: value.originNodeId,
    exitNodeId: value.exitNodeId,
    expectedNetworkRevision: value.expectedNetworkRevision,
    expectedOperationalVersion: Number(value.expectedOperationalVersion),
    budgetMinutes: Number(value.budgetMinutes),
    interests: [...value.interests] as RouteVisitInterest[],
    companion: value.companion as ScenicItineraryCompanion,
    maxStops: Number(value.maxStops),
    profile,
    preference,
  };
}
