import {
  planDirectedRoute,
  type DirectedRoutePlan,
} from "../directed-route-engine";
import {
  getSafePublishedNetwork,
  parseRouteNetwork,
  type RouteNetworkManifest,
} from "../route-network";
import {
  getSafeRouteOperationalState,
  type RouteOperationalState,
} from "../route-operational-state";
import {
  planFormalScenicItinerary,
  type FormalScenicItinerary,
  type FormalScenicItineraryInput,
} from "../formal-scenic-itinerary";
import { isFormalRoutingId, type FormalRoutePlanInput } from "./formal-routing-domain";
import type { FormalRoutingRepository, PublishedFormalRoutingSnapshotRecord } from "./formal-routing-repository";

export type PublishedFormalRoutingSnapshot = {
  schemaVersion: 1;
  scenicAreaId: string;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  publishedAt: string;
  expiresAt: string;
  routeNetwork: RouteNetworkManifest;
  operationalState: RouteOperationalState;
};

export type ReadFormalRoutingSnapshotResult =
  | { state: "AVAILABLE"; snapshot: PublishedFormalRoutingSnapshot }
  | { state: "FORMAL_NETWORK_UNAVAILABLE" };

export type CreateFormalRoutePlanResult =
  | { state: "AVAILABLE"; plan: DirectedRoutePlan }
  | { state: "FORMAL_NETWORK_UNAVAILABLE" }
  | { state: "ROUTE_VERSION_CHANGED" }
  | { state: "ROUTE_UNAVAILABLE" };

export type CreateFormalScenicItineraryResult =
  | { state: "AVAILABLE"; itinerary: FormalScenicItinerary }
  | { state: "FORMAL_NETWORK_UNAVAILABLE" }
  | { state: "ROUTE_VERSION_CHANGED" }
  | { state: "ITINERARY_UNAVAILABLE" };

type SnapshotEnvelope = {
  schemaVersion: 1;
  routeNetwork: unknown;
  operationalState: unknown;
};

const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseSnapshotEnvelope(value: unknown): SnapshotEnvelope | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "routeNetwork", "operationalState"])
    || value.schemaVersion !== 1
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    routeNetwork: structuredClone(value.routeNetwork),
    operationalState: structuredClone(value.operationalState),
  };
}

function validMetadata(record: PublishedFormalRoutingSnapshotRecord, scenicAreaId: string, now: Date) {
  if (
    !isFormalRoutingId(scenicAreaId)
    || record.scenicAreaId !== scenicAreaId
    || !Number.isSafeInteger(record.snapshotRevision)
    || record.snapshotRevision < 1
    || typeof record.networkRevision !== "string"
    || !record.networkRevision.trim()
    || record.networkRevision.length > 100
    || !Number.isSafeInteger(record.operationalVersion)
    || record.operationalVersion < 1
  ) {
    return false;
  }
  const publishedAt = new Date(record.publishedAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const nowMs = now.getTime();
  return Number.isFinite(publishedAt) && Number.isFinite(expiresAt) && publishedAt <= nowMs + FUTURE_CLOCK_SKEW_MS && expiresAt > nowMs && expiresAt > publishedAt;
}

function validatedSnapshot(
  record: PublishedFormalRoutingSnapshotRecord,
  scenicAreaId: string,
  now: Date,
): PublishedFormalRoutingSnapshot | null {
  if (!validMetadata(record, scenicAreaId, now)) return null;
  const envelope = parseSnapshotEnvelope(record.snapshotJson);
  if (!envelope) return null;
  const fullNetwork = parseRouteNetwork(envelope.routeNetwork);
  const routeNetwork = getSafePublishedNetwork(envelope.routeNetwork, now, scenicAreaId);
  if (!fullNetwork || !routeNetwork || routeNetwork.revision !== record.networkRevision) return null;
  const operationalState = getSafeRouteOperationalState(envelope.operationalState, fullNetwork, now, scenicAreaId);
  if (
    !operationalState
    || operationalState.networkRevision !== routeNetwork.revision
    || operationalState.operationalVersion !== record.operationalVersion
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    scenicAreaId,
    snapshotRevision: record.snapshotRevision,
    networkRevision: routeNetwork.revision,
    operationalVersion: operationalState.operationalVersion,
    publishedAt: record.publishedAt,
    expiresAt: record.expiresAt,
    routeNetwork,
    operationalState,
  };
}

async function loadValidatedSnapshot(
  repository: FormalRoutingRepository,
  scenicAreaId: string,
  now: Date,
): Promise<{ snapshot: PublishedFormalRoutingSnapshot; rawNetwork: unknown; rawOperationalState: unknown } | null> {
  if (Number.isNaN(now.getTime()) || !isFormalRoutingId(scenicAreaId)) return null;
  try {
    const record = await repository.readCurrentPublishedSnapshot(scenicAreaId);
    if (!record) return null;
    const envelope = parseSnapshotEnvelope(record.snapshotJson);
    if (!envelope) return null;
    const snapshot = validatedSnapshot(record, scenicAreaId, now);
    return snapshot ? { snapshot, rawNetwork: envelope.routeNetwork, rawOperationalState: envelope.operationalState } : null;
  } catch {
    // A storage/schema/configuration error must never route using stale data.
    return null;
  }
}

/**
 * Loads a public snapshot only after the repository and both route contracts
 * demonstrate a current, approved formal network and operating state.
 */
export async function readFormalRoutingSnapshot(
  repository: FormalRoutingRepository,
  scenicAreaId: string,
  now = new Date(),
): Promise<ReadFormalRoutingSnapshotResult> {
  const loaded = await loadValidatedSnapshot(repository, scenicAreaId, now);
  return loaded ? { state: "AVAILABLE", snapshot: loaded.snapshot } : { state: "FORMAL_NETWORK_UNAVAILABLE" };
}

/**
 * Invokes the pure directed engine only after `loadValidatedSnapshot` succeeds.
 * Any lost freshness/closure guarantee while planning returns the same
 * unavailable state rather than an inferred or provider-generated route.
 */
export async function createFormalRoutePlan(
  repository: FormalRoutingRepository,
  input: FormalRoutePlanInput,
  now = new Date(),
): Promise<CreateFormalRoutePlanResult> {
  const loaded = await loadValidatedSnapshot(repository, input.scenicAreaId, now);
  if (!loaded) return { state: "FORMAL_NETWORK_UNAVAILABLE" };
  try {
    const result = planDirectedRoute(loaded.rawNetwork, loaded.rawOperationalState, input, now);
    if (result.ok) return { state: "AVAILABLE", plan: result.plan };
    if (result.code === "NETWORK_UNAVAILABLE" || result.code === "OPERATIONAL_STATE_UNAVAILABLE") {
      return { state: "FORMAL_NETWORK_UNAVAILABLE" };
    }
    if (result.code === "NETWORK_REVISION_CHANGED" || result.code === "OPERATIONAL_VERSION_CHANGED") {
      return { state: "ROUTE_VERSION_CHANGED" };
    }
    return { state: "ROUTE_UNAVAILABLE" };
  } catch {
    return { state: "FORMAL_NETWORK_UNAVAILABLE" };
  }
}

/**
 * Builds a multi-stop itinerary only from the same validated snapshot used by
 * single-route planning. Natural-language text never reaches this boundary;
 * callers must submit explicit, user-confirmed constraints.
 */
export async function createFormalScenicItinerary(
  repository: FormalRoutingRepository,
  input: FormalScenicItineraryInput,
  now = new Date(),
): Promise<CreateFormalScenicItineraryResult> {
  const loaded = await loadValidatedSnapshot(repository, input.scenicAreaId, now);
  if (!loaded) return { state: "FORMAL_NETWORK_UNAVAILABLE" };
  if (
    loaded.snapshot.networkRevision !== input.expectedNetworkRevision
    || loaded.snapshot.operationalVersion !== input.expectedOperationalVersion
  ) return { state: "ROUTE_VERSION_CHANGED" };
  try {
    const result = planFormalScenicItinerary(loaded.rawNetwork, loaded.rawOperationalState, input, now);
    return result.ok
      ? { state: "AVAILABLE", itinerary: result.itinerary }
      : { state: "ITINERARY_UNAVAILABLE" };
  } catch {
    return { state: "FORMAL_NETWORK_UNAVAILABLE" };
  }
}
