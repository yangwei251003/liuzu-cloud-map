import { getSafePublishedNetwork, type RouteNetworkManifest } from "./route-network";
import {
  getSafeRouteOperationalState,
  type RouteOperationalEdgeState,
  type RouteOperationalEdgeStatus,
  type RouteOperationalState,
} from "./route-operational-state";

export type RouteOperationalClosureEffect = {
  closureEventId: string;
  edgeId: string;
  status: Extract<RouteOperationalEdgeStatus, "CLOSED" | "RESTRICTED">;
  checkedAt: string;
  expiresAt: string;
  sourceReference: string;
  responsibleParty: string;
};

export type RouteOperationalFactorEffect = {
  observationId: string;
  edgeId: string;
  crowdLevel: "LOW" | "MODERATE" | "HIGH";
  weatherImpact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE";
  travelTimeMultiplier: number;
  observedAt: string;
  expiresAt: string;
  sourceReference: string;
  responsibleParty: string;
};

export type CompiledRouteOperationalRelease = {
  snapshotJson: {
    schemaVersion: 1;
    routeNetwork: RouteNetworkManifest;
    operationalState: RouteOperationalState;
  };
  affectedEdgeIds: string[];
};

function strictHttps(value: string) {
  try {
    const url = new URL(value);
    return value.length <= 500 && url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validInstant(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/** Stable JSON used by the database integrity hash. */
export function canonicalizeRouteOperationalSnapshot(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_snapshot_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeRouteOperationalSnapshot).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeRouteOperationalSnapshot(record[key])}`).join(",")}}`;
  }
  throw new Error("unsupported_snapshot_value");
}

/**
 * Compiles a replacement state from one already published immutable snapshot.
 * Geometry and static routing attributes are never accepted from the caller.
 */
export function compileRouteOperationalRelease(input: {
  scenicAreaId: string;
  targetOperationalVersion: number;
  issuedAt: string;
  expiresAt: string;
  sourceReference: string;
  responsibleParty: string;
  routeNetwork: unknown;
  baseOperationalState: unknown;
  effects?: RouteOperationalClosureEffect[];
  factors?: RouteOperationalFactorEffect[];
}, now = new Date()): CompiledRouteOperationalRelease | null {
  const effects = input.effects ?? [];
  const factors = input.factors ?? [];
  if (
    Number.isNaN(now.getTime())
    || !Number.isSafeInteger(input.targetOperationalVersion) || input.targetOperationalVersion < 1
    || !validInstant(input.issuedAt) || !validInstant(input.expiresAt)
    || new Date(input.issuedAt).getTime() > now.getTime() + 5 * 60_000
    || new Date(input.expiresAt).getTime() <= now.getTime()
    || !strictHttps(input.sourceReference)
    || !input.responsibleParty || input.responsibleParty.length > 200
    || effects.length + factors.length < 1 || effects.length + factors.length > 10_000
  ) return null;

  const routeNetwork = getSafePublishedNetwork(input.routeNetwork, now, input.scenicAreaId);
  const baseState = getSafeRouteOperationalState(input.baseOperationalState, input.routeNetwork, now, input.scenicAreaId);
  if (!routeNetwork || !baseState || input.targetOperationalVersion <= baseState.operationalVersion) return null;
  const expiresAtMs = new Date(input.expiresAt).getTime();
  if (expiresAtMs > new Date(baseState.expiresAt).getTime()) return null;

  const networkEdgeIds = new Set(routeNetwork.edges.map((edge) => edge.id));
  const effectsByEdge = new Map<string, RouteOperationalClosureEffect[]>();
  const closureEventIds = new Set<string>();
  for (const effect of effects) {
    if (
      !effect.closureEventId || closureEventIds.has(effect.closureEventId)
      || !networkEdgeIds.has(effect.edgeId)
      || !["CLOSED", "RESTRICTED"].includes(effect.status)
      || !validInstant(effect.checkedAt) || !validInstant(effect.expiresAt)
      || new Date(effect.checkedAt).getTime() > now.getTime() + 5 * 60_000
      || new Date(effect.expiresAt).getTime() < expiresAtMs
      || !strictHttps(effect.sourceReference)
      || !effect.responsibleParty || effect.responsibleParty.length > 200
    ) return null;
    closureEventIds.add(effect.closureEventId);
    const current = effectsByEdge.get(effect.edgeId) ?? [];
    current.push(effect);
    effectsByEdge.set(effect.edgeId, current);
  }

  const factorsByEdge = new Map<string, RouteOperationalFactorEffect>();
  const observationIds = new Set<string>();
  for (const factor of factors) {
    if (
      !factor.observationId || observationIds.has(factor.observationId)
      || factorsByEdge.has(factor.edgeId) || !networkEdgeIds.has(factor.edgeId)
      || !["LOW", "MODERATE", "HIGH"].includes(factor.crowdLevel)
      || !["NONE", "RAIN", "HEAT", "WIND", "MULTIPLE"].includes(factor.weatherImpact)
      || !Number.isFinite(factor.travelTimeMultiplier)
      || factor.travelTimeMultiplier < 1 || factor.travelTimeMultiplier > 3
      || (factor.travelTimeMultiplier === 1 && (factor.crowdLevel !== "LOW" || factor.weatherImpact !== "NONE"))
      || !validInstant(factor.observedAt) || !validInstant(factor.expiresAt)
      || new Date(factor.observedAt).getTime() > now.getTime() + 5 * 60_000
      || new Date(factor.expiresAt).getTime() < expiresAtMs
      || !strictHttps(factor.sourceReference)
      || !factor.responsibleParty || factor.responsibleParty.length > 200
    ) return null;
    observationIds.add(factor.observationId);
    factorsByEdge.set(factor.edgeId, factor);
  }

  const edgeStates: RouteOperationalEdgeState[] = baseState.edgeStates.map((base) => {
    const closureEffects = effectsByEdge.get(base.edgeId);
    const factor = factorsByEdge.get(base.edgeId);
    const next = structuredClone(base);
    if (closureEffects?.length) {
      const status = closureEffects.some((effect) => effect.status === "CLOSED") ? "CLOSED" : "RESTRICTED";
      const newest = closureEffects.filter((effect) => effect.status === status).sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0]!;
      next.status = status;
      next.checkedAt = newest.checkedAt;
      next.sourceReference = newest.sourceReference;
      next.responsibleParty = newest.responsibleParty;
    }
    if (factor) {
      next.routing = {
        travelTimeMultiplier: factor.travelTimeMultiplier,
        crowdLevel: factor.crowdLevel,
        weatherImpact: factor.weatherImpact,
      };
      if (!closureEffects?.length) {
        next.checkedAt = factor.observedAt;
        next.sourceReference = factor.sourceReference;
        next.responsibleParty = factor.responsibleParty;
      }
    }
    if (closureEffects?.length || factor) next.expiresAt = input.expiresAt;
    return next;
  });

  const operationalState: RouteOperationalState = {
    schemaVersion: 1,
    scenicAreaId: input.scenicAreaId,
    networkRevision: routeNetwork.revision,
    operationalVersion: input.targetOperationalVersion,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    sourceReference: input.sourceReference,
    responsibleParty: input.responsibleParty,
    edgeStates,
  };
  const safeState = getSafeRouteOperationalState(operationalState, routeNetwork, now, input.scenicAreaId);
  if (!safeState) return null;
  return {
    snapshotJson: { schemaVersion: 1, routeNetwork: structuredClone(routeNetwork), operationalState: safeState },
    affectedEdgeIds: [...new Set([...effectsByEdge.keys(), ...factorsByEdge.keys()])].sort(),
  };
}
