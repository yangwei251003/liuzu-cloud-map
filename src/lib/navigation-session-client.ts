import type { DirectedRoutePlan } from "./directed-route-engine";

export type RemoteNavigationSession = {
  id: string;
  scenicAreaId: string;
  routeFingerprint: string;
  optimization: "FASTEST" | "SHORTEST" | "SCENIC";
  originNodeId: string;
  destinationNodeId: string;
  networkRevision: string;
  operationalVersion: number;
  status: "READY" | "ACTIVE" | "PAUSED" | "REROUTE_REQUIRED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  revision: number;
  distanceMeters: number;
  estimatedMinutes: number;
  remainingDistanceBucketMeters: number;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteNavigationResult =
  | { state: "SYNCED"; session: RemoteNavigationSession }
  | { state: "AUTH_REQUIRED" | "UNAVAILABLE" | "CONFLICT" };

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const validIso = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());

export function parseRemoteNavigationSession(value: unknown): RemoteNavigationSession | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  const expected = [
    "createdAt", "destinationNodeId", "distanceMeters", "endedAt", "estimatedMinutes", "expiresAt", "id",
    "networkRevision", "operationalVersion", "optimization", "originNodeId", "remainingDistanceBucketMeters",
    "revision", "routeFingerprint", "scenicAreaId", "startedAt", "status", "updatedAt",
  ].sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) return null;
  if (
    typeof value.id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.id)
    || typeof value.scenicAreaId !== "string"
    || typeof value.routeFingerprint !== "string" || !/^drp1-[0-9a-f]{8}$/.test(value.routeFingerprint)
    || !["FASTEST", "SHORTEST", "SCENIC"].includes(String(value.optimization))
    || typeof value.originNodeId !== "string" || typeof value.destinationNodeId !== "string"
    || typeof value.networkRevision !== "string"
    || !Number.isSafeInteger(value.operationalVersion) || Number(value.operationalVersion) < 1
    || !["READY", "ACTIVE", "PAUSED", "REROUTE_REQUIRED", "COMPLETED", "CANCELLED", "EXPIRED"].includes(String(value.status))
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || typeof value.distanceMeters !== "number" || !Number.isFinite(value.distanceMeters) || value.distanceMeters < 0
    || typeof value.estimatedMinutes !== "number" || !Number.isFinite(value.estimatedMinutes) || value.estimatedMinutes < 0
    || !Number.isSafeInteger(value.remainingDistanceBucketMeters) || Number(value.remainingDistanceBucketMeters) < 0 || Number(value.remainingDistanceBucketMeters) % 50 !== 0
    || (value.startedAt !== null && !validIso(value.startedAt)) || (value.endedAt !== null && !validIso(value.endedAt))
    || !validIso(value.expiresAt) || !validIso(value.createdAt) || !validIso(value.updatedAt)
  ) return null;
  return structuredClone(value) as RemoteNavigationSession;
}

export function navigationRouteBinding(plan: DirectedRoutePlan) {
  return {
    scenicAreaId: plan.scenicAreaId,
    fromNodeId: plan.originNodeId,
    toNodeId: plan.destinationNodeId,
    expectedNetworkRevision: plan.networkRevision,
    expectedOperationalVersion: plan.operationalVersion,
    profile: plan.profile,
    optimization: plan.optimization,
    preference: plan.preference,
    routeFingerprint: plan.routeFingerprint,
  };
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function result(response: Response): Promise<RemoteNavigationResult> {
  if (response.status === 401) return { state: "AUTH_REQUIRED" };
  if (response.status === 409) return { state: "CONFLICT" };
  if (!response.ok) return { state: "UNAVAILABLE" };
  try {
    const body = await response.json() as unknown;
    const session = isRecord(body) ? parseRemoteNavigationSession(body.session) : null;
    return session ? { state: "SYNCED", session } : { state: "UNAVAILABLE" };
  } catch { return { state: "UNAVAILABLE" }; }
}

export async function createRemoteNavigationSession(plan: DirectedRoutePlan): Promise<RemoteNavigationResult> {
  try {
    return result(await fetch("/api/v1/navigation-sessions", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("navigation-create") },
      body: JSON.stringify(navigationRouteBinding(plan)),
    }));
  } catch { return { state: "UNAVAILABLE" }; }
}

export async function sendRemoteNavigationEvent(session: RemoteNavigationSession, body: UnknownRecord): Promise<RemoteNavigationResult> {
  try {
    return result(await fetch(`/api/v1/navigation-sessions/${encodeURIComponent(session.id)}/events`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("navigation-event") },
      body: JSON.stringify({ ...body, expectedRevision: session.revision }),
    }));
  } catch { return { state: "UNAVAILABLE" }; }
}

export async function readRemoteNavigationHistory(limit = 10): Promise<
  | { state: "READY"; sessions: RemoteNavigationSession[] }
  | { state: "AUTH_REQUIRED" | "UNAVAILABLE" }
> {
  try {
    const response = await fetch(`/api/v1/navigation-sessions?limit=${Math.min(50, Math.max(1, Math.floor(limit)))}`, { cache: "no-store" });
    if (response.status === 401) return { state: "AUTH_REQUIRED" };
    if (!response.ok) return { state: "UNAVAILABLE" };
    const body = await response.json() as unknown;
    if (!isRecord(body) || !Array.isArray(body.sessions) || body.sessions.length > limit) return { state: "UNAVAILABLE" };
    const sessions = body.sessions.map(parseRemoteNavigationSession);
    return sessions.every((session): session is RemoteNavigationSession => Boolean(session)) ? { state: "READY", sessions } : { state: "UNAVAILABLE" };
  } catch { return { state: "UNAVAILABLE" }; }
}
