import type { AmapCoordinate } from "./amap-types";
import type { AmapNavigationMode } from "./amap-navigation";

export const AMAP_ROUTE_SESSION_KEY = "liuzu-amap-route-session-v1";
export const AMAP_ROUTE_SESSION_TTL_MS = 30 * 60_000;

export type AmapRouteSessionStep = {
  instruction: string;
  road: string | null;
  distance: number;
  duration: number;
};

export type AmapRouteSessionPoint = {
  coordinate: AmapCoordinate;
  stepIndex: number;
};

export type AmapRouteSessionSnapshot = {
  schemaVersion: 1;
  destinationId: string;
  destinationName: string;
  destinationCoordinate: AmapCoordinate;
  mode: AmapNavigationMode;
  savedPhase: "ready" | "navigating" | "paused";
  summary: { distance: number; duration: number };
  steps: AmapRouteSessionStep[];
  routePoints: AmapRouteSessionPoint[];
  activeStepIndex: number;
  routePointIndex: number;
  remainingDistance: number;
  remainingDuration: number;
  savedAt: string;
  expiresAt: string;
};

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const validCoordinate = (value: unknown): value is AmapCoordinate => Array.isArray(value)
  && value.length === 2
  && value.every((item) => typeof item === "number" && Number.isFinite(item))
  && value[0] >= 72
  && value[0] <= 138
  && value[1] >= 0
  && value[1] <= 56;

function parseSnapshot(value: unknown, now: Date): AmapRouteSessionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<AmapRouteSessionSnapshot>;
  const savedAt = new Date(String(snapshot.savedAt)).getTime();
  const expiresAt = new Date(String(snapshot.expiresAt)).getTime();
  if (
    snapshot.schemaVersion !== 1
    || typeof snapshot.destinationId !== "string"
    || !snapshot.destinationId.trim()
    || snapshot.destinationId.length > 120
    || typeof snapshot.destinationName !== "string"
    || !snapshot.destinationName.trim()
    || snapshot.destinationName.length > 120
    || !validCoordinate(snapshot.destinationCoordinate)
    || (snapshot.mode !== "walk" && snapshot.mode !== "car")
    || !["ready", "navigating", "paused"].includes(String(snapshot.savedPhase))
    || !snapshot.summary
    || typeof snapshot.summary.distance !== "number"
    || !Number.isFinite(snapshot.summary.distance)
    || snapshot.summary.distance <= 0
    || snapshot.summary.distance > 2_000_000
    || typeof snapshot.summary.duration !== "number"
    || !Number.isFinite(snapshot.summary.duration)
    || snapshot.summary.duration <= 0
    || snapshot.summary.duration > 604_800
    || !Array.isArray(snapshot.steps)
    || snapshot.steps.length < 1
    || snapshot.steps.length > 300
    || !Array.isArray(snapshot.routePoints)
    || snapshot.routePoints.length < 2
    || snapshot.routePoints.length > 20_000
    || !Number.isSafeInteger(snapshot.activeStepIndex)
    || Number(snapshot.activeStepIndex) < 0
    || Number(snapshot.activeStepIndex) >= snapshot.steps.length
    || !Number.isSafeInteger(snapshot.routePointIndex)
    || Number(snapshot.routePointIndex) < 0
    || Number(snapshot.routePointIndex) >= snapshot.routePoints.length
    || typeof snapshot.remainingDistance !== "number"
    || !Number.isFinite(snapshot.remainingDistance)
    || snapshot.remainingDistance < 0
    || snapshot.remainingDistance > snapshot.summary.distance * 1.05
    || typeof snapshot.remainingDuration !== "number"
    || !Number.isFinite(snapshot.remainingDuration)
    || snapshot.remainingDuration < 0
    || snapshot.remainingDuration > snapshot.summary.duration * 1.05
    || !Number.isFinite(savedAt)
    || !Number.isFinite(expiresAt)
    || savedAt > now.getTime() + 60_000
    || expiresAt <= now.getTime()
    || expiresAt <= savedAt
    || expiresAt - savedAt > AMAP_ROUTE_SESSION_TTL_MS
  ) return null;
  if (snapshot.steps.some((step) => (
    !step
    || typeof step.instruction !== "string"
    || !step.instruction.trim()
    || step.instruction.length > 500
    || (step.road !== null && (typeof step.road !== "string" || step.road.length > 160))
    || typeof step.distance !== "number"
    || !Number.isFinite(step.distance)
    || step.distance < 0
    || typeof step.duration !== "number"
    || !Number.isFinite(step.duration)
    || step.duration < 0
  ))) return null;
  if (snapshot.routePoints.some((point) => (
    !point
    || !validCoordinate(point.coordinate)
    || !Number.isSafeInteger(point.stepIndex)
    || point.stepIndex < 0
    || point.stepIndex >= snapshot.steps!.length
  ))) return null;
  return snapshot as AmapRouteSessionSnapshot;
}

export function saveAmapRouteSession(storage: SessionStorageLike, input: Omit<AmapRouteSessionSnapshot, "schemaVersion" | "savedAt" | "expiresAt">, now = new Date()) {
  const snapshot: AmapRouteSessionSnapshot = {
    ...input,
    schemaVersion: 1,
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AMAP_ROUTE_SESSION_TTL_MS).toISOString(),
  };
  if (!parseSnapshot(snapshot, now)) return false;
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > 1_500_000) return false;
    storage.setItem(AMAP_ROUTE_SESSION_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function readAmapRouteSession(storage: SessionStorageLike, expected: { destinationId: string; mode: AmapNavigationMode }, now = new Date()) {
  try {
    const raw = storage.getItem(AMAP_ROUTE_SESSION_KEY);
    if (!raw || raw.length > 1_500_000) return null;
    const snapshot = parseSnapshot(JSON.parse(raw) as unknown, now);
    if (!snapshot || snapshot.destinationId !== expected.destinationId || snapshot.mode !== expected.mode) {
      storage.removeItem(AMAP_ROUTE_SESSION_KEY);
      return null;
    }
    return snapshot;
  } catch {
    storage.removeItem(AMAP_ROUTE_SESSION_KEY);
    return null;
  }
}

export function clearAmapRouteSession(storage: SessionStorageLike) {
  try {
    storage.removeItem(AMAP_ROUTE_SESSION_KEY);
  } catch {
    // sessionStorage may be unavailable in private or constrained contexts.
  }
}
