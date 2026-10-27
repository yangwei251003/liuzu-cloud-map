import { createHash } from "node:crypto";
import type { DirectedRoutePlan } from "@/lib/directed-route-engine";
import {
  bucketNavigationDistance,
  isNavigationSessionId,
  isNavigationSessionRevision,
  isNavigationSessionStatus,
  parseNavigationIdempotencyKey,
  parseNavigationSessionCreateInput,
  parseNavigationSessionEventInput,
  planMatchesNavigationBinding,
  type NavigationRouteBindingInput,
  type NavigationSessionAction,
  type NavigationSessionCreateInput,
  type NavigationSessionEventInput,
  type NavigationSessionReasonCode,
  type NavigationSessionStatus,
} from "./navigation-session-domain";

export type NavigationSessionIdentity = { accountId: string; scenicAreaId: string; subject: string };

export type NavigationSessionReceipt = {
  id: string;
  scenicAreaId: string;
  routeFingerprint: string;
  optimization: "FASTEST" | "SHORTEST" | "SCENIC";
  originNodeId: string;
  destinationNodeId: string;
  networkRevision: string;
  operationalVersion: number;
  status: NavigationSessionStatus;
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

export type NavigationSessionCreateCommand = {
  identity: NavigationSessionIdentity;
  input: NavigationSessionCreateInput;
  plan: DirectedRoutePlan;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type NavigationSessionEventCommand = {
  identity: NavigationSessionIdentity;
  sessionId: string;
  input: NavigationSessionEventInput;
  replacementPlan: DirectedRoutePlan | null;
  remainingDistanceBucketMeters: number;
  idempotencyKeyHash: string;
  occurredAt: string;
};

export type NavigationSessionHistoryPage = { sessions: NavigationSessionReceipt[]; nextCursor: string | null };

export type NavigationSessionRepository = {
  create(command: NavigationSessionCreateCommand): Promise<
    | { state: "CREATED" | "REPLAYED"; session: NavigationSessionReceipt }
    | { state: "ACCOUNT_NOT_FOUND" | "FORMAL_ROUTE_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "STORAGE_UNAVAILABLE" }
  >;
  applyEvent(command: NavigationSessionEventCommand): Promise<
    | { state: "APPLIED" | "REPLAYED"; action: NavigationSessionAction; session: NavigationSessionReceipt }
    | { state: "NOT_FOUND" | "FORMAL_ROUTE_UNAVAILABLE" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "STORAGE_UNAVAILABLE" }
    | { state: "REVISION_CONFLICT"; currentRevision: number }
  >;
  listHistory(input: { identity: NavigationSessionIdentity; limit: number; cursor: string | null }): Promise<NavigationSessionHistoryPage | null>;
};

export type NavigationPlanResolver = (binding: NavigationRouteBindingInput, now: Date) => Promise<
  | { state: "AVAILABLE"; plan: DirectedRoutePlan }
  | { state: "FORMAL_NETWORK_UNAVAILABLE" | "ROUTE_VERSION_CHANGED" | "ROUTE_UNAVAILABLE" }
>;

export function hashNavigationIdempotencyKey(value: unknown): string | null {
  const parsed = parseNavigationIdempotencyKey(value);
  return parsed ? createHash("sha256").update(parsed, "utf8").digest("hex") : null;
}

function validDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

export function isNavigationSessionReceipt(value: unknown): value is NavigationSessionReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  const expected = [
    "createdAt", "destinationNodeId", "distanceMeters", "endedAt", "estimatedMinutes", "expiresAt", "id",
    "networkRevision", "operationalVersion", "optimization", "originNodeId", "remainingDistanceBucketMeters",
    "revision", "routeFingerprint", "scenicAreaId", "startedAt", "status", "updatedAt",
  ].sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && isNavigationSessionId(item.id)
    && typeof item.scenicAreaId === "string"
    && typeof item.routeFingerprint === "string" && /^drp1-[0-9a-f]{8}$/.test(item.routeFingerprint)
    && (item.optimization === "FASTEST" || item.optimization === "SHORTEST" || item.optimization === "SCENIC")
    && typeof item.originNodeId === "string" && typeof item.destinationNodeId === "string"
    && typeof item.networkRevision === "string"
    && typeof item.operationalVersion === "number" && Number.isSafeInteger(item.operationalVersion) && item.operationalVersion > 0
    && isNavigationSessionStatus(item.status)
    && isNavigationSessionRevision(item.revision)
    && typeof item.distanceMeters === "number" && Number.isFinite(item.distanceMeters) && item.distanceMeters >= 0
    && typeof item.estimatedMinutes === "number" && Number.isFinite(item.estimatedMinutes) && item.estimatedMinutes >= 0
    && typeof item.remainingDistanceBucketMeters === "number" && Number.isSafeInteger(item.remainingDistanceBucketMeters) && item.remainingDistanceBucketMeters >= 0 && item.remainingDistanceBucketMeters % 50 === 0
    && (item.startedAt === null || typeof item.startedAt === "string" && validDate(item.startedAt))
    && (item.endedAt === null || typeof item.endedAt === "string" && validDate(item.endedAt))
    && typeof item.expiresAt === "string" && validDate(item.expiresAt)
    && typeof item.createdAt === "string" && validDate(item.createdAt)
    && typeof item.updatedAt === "string" && validDate(item.updatedAt);
}

function planIsCurrent(plan: DirectedRoutePlan, input: NavigationRouteBindingInput, now: Date) {
  return planMatchesNavigationBinding(plan, input)
    && new Date(plan.generatedAt).getTime() <= now.getTime() + 5 * 60_000
    && new Date(plan.expiresAt).getTime() > now.getTime();
}

export async function createNavigationSession(
  repository: NavigationSessionRepository,
  resolvePlan: NavigationPlanResolver,
  rawInput: unknown,
  identity: NavigationSessionIdentity,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseNavigationSessionCreateInput(rawInput);
  const idempotencyKeyHash = hashNavigationIdempotencyKey(rawIdempotencyKey);
  if (!input || !idempotencyKeyHash || input.scenicAreaId !== identity.scenicAreaId || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  let resolution: Awaited<ReturnType<NavigationPlanResolver>>;
  try { resolution = await resolvePlan(input, now); }
  catch { return { state: "FORMAL_ROUTE_UNAVAILABLE" as const }; }
  if (resolution.state !== "AVAILABLE" || !planIsCurrent(resolution.plan, input, now)) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
  try {
    return await repository.create({ identity, input, plan: resolution.plan, idempotencyKeyHash, occurredAt: now.toISOString() });
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function applyNavigationSessionEvent(
  repository: NavigationSessionRepository,
  resolvePlan: NavigationPlanResolver,
  sessionId: string,
  rawInput: unknown,
  identity: NavigationSessionIdentity,
  rawIdempotencyKey: unknown,
  now = new Date(),
) {
  const input = parseNavigationSessionEventInput(rawInput);
  const idempotencyKeyHash = hashNavigationIdempotencyKey(rawIdempotencyKey);
  if (!isNavigationSessionId(sessionId) || !input || !idempotencyKeyHash || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" as const };
  const remainingDistanceBucketMeters = bucketNavigationDistance(input.remainingDistanceMeters);
  if (remainingDistanceBucketMeters === null) return { state: "INVALID_INPUT" as const };
  let replacementPlan: DirectedRoutePlan | null = null;
  if (input.action === "REROUTED") {
    if (input.route.scenicAreaId !== identity.scenicAreaId) return { state: "INVALID_INPUT" as const };
    let resolution: Awaited<ReturnType<NavigationPlanResolver>>;
    try { resolution = await resolvePlan(input.route, now); }
    catch { return { state: "FORMAL_ROUTE_UNAVAILABLE" as const }; }
    if (resolution.state !== "AVAILABLE" || !planIsCurrent(resolution.plan, input.route, now)) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
    replacementPlan = resolution.plan;
  }
  try {
    return await repository.applyEvent({ identity, sessionId, input, replacementPlan, remainingDistanceBucketMeters, idempotencyKeyHash, occurredAt: now.toISOString() });
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export async function listNavigationSessionHistory(
  repository: NavigationSessionRepository,
  identity: NavigationSessionIdentity,
  limit: number,
  cursor: string | null,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (cursor !== null && (cursor.length < 8 || cursor.length > 500))) return { state: "INVALID_INPUT" as const };
  try {
    const page = await repository.listHistory({ identity, limit, cursor });
    return page ? { state: "AVAILABLE" as const, page } : { state: "ACCOUNT_NOT_FOUND" as const };
  } catch {
    return { state: "STORAGE_UNAVAILABLE" as const };
  }
}

export function navigationReasonCode(input: NavigationSessionEventInput): NavigationSessionReasonCode | null {
  return "reasonCode" in input ? input.reasonCode : null;
}
