import type { DirectedRoutePlan } from "@/lib/directed-route-engine";
import { parseFormalRoutePlanInput, type FormalRoutePlanInput } from "./formal-routing-domain";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE_FINGERPRINT_PATTERN = /^drp1-[0-9a-f]{8}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{11,199}$/;
const MAX_REVISION = 2_147_483_646;
const MAX_DISTANCE_METERS = 1_000_000;

export const NAVIGATION_SESSION_ACTIONS = [
  "START",
  "PAUSE",
  "RESUME",
  "REROUTE_REQUIRED",
  "REROUTED",
  "ARRIVE",
  "CANCEL",
] as const;

export const NAVIGATION_SESSION_STATUSES = [
  "READY",
  "ACTIVE",
  "PAUSED",
  "REROUTE_REQUIRED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;

export const NAVIGATION_SESSION_REASON_CODES = [
  "USER_PAUSED",
  "PAGE_HIDDEN",
  "SENSOR_UNAVAILABLE",
  "OFF_ROUTE",
  "NETWORK_VERSION_CHANGED",
  "OPERATIONAL_STATE_UNAVAILABLE",
  "ROUTE_REPLACED",
  "ARRIVAL_CONFIRMED",
  "USER_EXIT",
] as const;

export type NavigationSessionAction = (typeof NAVIGATION_SESSION_ACTIONS)[number];
export type NavigationSessionStatus = (typeof NAVIGATION_SESSION_STATUSES)[number];
export type NavigationSessionReasonCode = (typeof NAVIGATION_SESSION_REASON_CODES)[number];

export type NavigationRouteBindingInput = FormalRoutePlanInput & {
  routeFingerprint: string;
};

export type NavigationSessionCreateInput = NavigationRouteBindingInput;

export type NavigationSessionEventInput =
  | { action: "START" | "RESUME"; expectedRevision: number; remainingDistanceMeters: number }
  | { action: "PAUSE"; expectedRevision: number; remainingDistanceMeters: number; reasonCode: "USER_PAUSED" | "PAGE_HIDDEN" | "SENSOR_UNAVAILABLE" }
  | { action: "REROUTE_REQUIRED"; expectedRevision: number; remainingDistanceMeters: number; reasonCode: "OFF_ROUTE" | "NETWORK_VERSION_CHANGED" | "OPERATIONAL_STATE_UNAVAILABLE" }
  | { action: "REROUTED"; expectedRevision: number; remainingDistanceMeters: number; reasonCode: "ROUTE_REPLACED"; route: NavigationRouteBindingInput }
  | { action: "ARRIVE"; expectedRevision: number; remainingDistanceMeters: number; reasonCode: "ARRIVAL_CONFIRMED" }
  | { action: "CANCEL"; expectedRevision: number; remainingDistanceMeters: number; reasonCode: "USER_EXIT" };

export type NavigationSessionTransition = {
  status: NavigationSessionStatus;
  eventKind: "STARTED" | "PAUSED" | "RESUMED" | "REROUTE_REQUIRED" | "REROUTED" | "ARRIVED" | "CANCELLED";
  requiresCurrentRoute: boolean;
  requiresReplacementRoute: boolean;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

export const isNavigationSessionId = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);
export const isNavigationSessionRevision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_REVISION;
export const isNavigationSessionStatus = (value: unknown): value is NavigationSessionStatus => typeof value === "string" && (NAVIGATION_SESSION_STATUSES as readonly string[]).includes(value);
export const parseNavigationIdempotencyKey = (value: unknown) => typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;

function finiteDistance(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_DISTANCE_METERS;
}

export function bucketNavigationDistance(value: number): number | null {
  if (!finiteDistance(value)) return null;
  return value === 0 ? 0 : Math.ceil(value / 50) * 50;
}

function routeBinding(value: unknown): NavigationRouteBindingInput | null {
  if (!isRecord(value) || !exactKeys(value, [
    "scenicAreaId",
    "fromNodeId",
    "toNodeId",
    "expectedNetworkRevision",
    "expectedOperationalVersion",
    "profile",
    "optimization",
    "preference",
    "routeFingerprint",
  ]) || typeof value.routeFingerprint !== "string" || !ROUTE_FINGERPRINT_PATTERN.test(value.routeFingerprint)) return null;
  const formalInput = parseFormalRoutePlanInput({
    scenicAreaId: value.scenicAreaId,
    fromNodeId: value.fromNodeId,
    toNodeId: value.toNodeId,
    expectedNetworkRevision: value.expectedNetworkRevision,
    expectedOperationalVersion: value.expectedOperationalVersion,
    profile: value.profile,
    optimization: value.optimization,
    preference: value.preference,
  });
  if (!formalInput?.optimization || !formalInput.preference) return null;
  return { ...formalInput, optimization: formalInput.optimization, preference: formalInput.preference, routeFingerprint: value.routeFingerprint };
}

export function parseNavigationSessionCreateInput(value: unknown): NavigationSessionCreateInput | null {
  return routeBinding(value);
}

export function parseNavigationSessionEventInput(value: unknown): NavigationSessionEventInput | null {
  if (!isRecord(value) || typeof value.action !== "string" || !isNavigationSessionRevision(value.expectedRevision) || !finiteDistance(value.remainingDistanceMeters)) return null;
  if (value.action === "START" || value.action === "RESUME") {
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters"])
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters }
      : null;
  }
  if (value.action === "PAUSE") {
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters", "reasonCode"])
      && (value.reasonCode === "USER_PAUSED" || value.reasonCode === "PAGE_HIDDEN" || value.reasonCode === "SENSOR_UNAVAILABLE")
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters, reasonCode: value.reasonCode }
      : null;
  }
  if (value.action === "REROUTE_REQUIRED") {
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters", "reasonCode"])
      && (value.reasonCode === "OFF_ROUTE" || value.reasonCode === "NETWORK_VERSION_CHANGED" || value.reasonCode === "OPERATIONAL_STATE_UNAVAILABLE")
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters, reasonCode: value.reasonCode }
      : null;
  }
  if (value.action === "REROUTED") {
    const route = routeBinding(value.route);
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters", "reasonCode", "route"])
      && value.reasonCode === "ROUTE_REPLACED" && route
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters, reasonCode: value.reasonCode, route }
      : null;
  }
  if (value.action === "ARRIVE") {
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters", "reasonCode"])
      && value.reasonCode === "ARRIVAL_CONFIRMED" && value.remainingDistanceMeters <= 50
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters, reasonCode: value.reasonCode }
      : null;
  }
  if (value.action === "CANCEL") {
    return exactKeys(value, ["action", "expectedRevision", "remainingDistanceMeters", "reasonCode"])
      && value.reasonCode === "USER_EXIT"
      ? { action: value.action, expectedRevision: value.expectedRevision, remainingDistanceMeters: value.remainingDistanceMeters, reasonCode: value.reasonCode }
      : null;
  }
  return null;
}

export function transitionNavigationSession(current: NavigationSessionStatus, action: NavigationSessionAction): NavigationSessionTransition | null {
  if (current === "READY" && action === "START") return { status: "ACTIVE", eventKind: "STARTED", requiresCurrentRoute: true, requiresReplacementRoute: false };
  if (current === "ACTIVE" && action === "PAUSE") return { status: "PAUSED", eventKind: "PAUSED", requiresCurrentRoute: false, requiresReplacementRoute: false };
  if (current === "PAUSED" && action === "RESUME") return { status: "ACTIVE", eventKind: "RESUMED", requiresCurrentRoute: true, requiresReplacementRoute: false };
  if ((current === "ACTIVE" || current === "PAUSED") && action === "REROUTE_REQUIRED") return { status: "REROUTE_REQUIRED", eventKind: "REROUTE_REQUIRED", requiresCurrentRoute: false, requiresReplacementRoute: false };
  if (current === "REROUTE_REQUIRED" && action === "REROUTED") return { status: "ACTIVE", eventKind: "REROUTED", requiresCurrentRoute: false, requiresReplacementRoute: true };
  if (current === "ACTIVE" && action === "ARRIVE") return { status: "COMPLETED", eventKind: "ARRIVED", requiresCurrentRoute: false, requiresReplacementRoute: false };
  if (!["COMPLETED", "CANCELLED", "EXPIRED"].includes(current) && action === "CANCEL") return { status: "CANCELLED", eventKind: "CANCELLED", requiresCurrentRoute: false, requiresReplacementRoute: false };
  return null;
}

export function planMatchesNavigationBinding(plan: DirectedRoutePlan, binding: NavigationRouteBindingInput) {
  return plan.routeFingerprint === binding.routeFingerprint
    && plan.scenicAreaId === binding.scenicAreaId
    && plan.originNodeId === binding.fromNodeId
    && plan.destinationNodeId === binding.toNodeId
    && plan.networkRevision === binding.expectedNetworkRevision
    && plan.operationalVersion === binding.expectedOperationalVersion
    && plan.optimization === binding.optimization;
}
