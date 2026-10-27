import {
  FORMAL_NAVIGATION_MAX_ACCURACY_METERS,
  FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS,
  type FormalNavigationLocationSample,
} from "./formal-navigation-runtime";
import { matchLocationToFormalNode, type FormalLocationNode } from "./formal-location-match";
import type { DirectedRoutePlan, DirectedRouteRequest } from "./directed-route-engine";

export type FormalNavigationRerouteReason =
  | "OFF_ROUTE"
  | "NETWORK_REVISION_CHANGED"
  | "OPERATIONAL_VERSION_CHANGED";

export type FormalNavigationRerouteSnapshot = {
  networkRevision: string;
  operationalVersion: number;
  nodes: FormalLocationNode[];
};

export type FormalNavigationRerouteIntent = {
  schemaVersion: 1;
  reason: FormalNavigationRerouteReason;
  supersedesRouteFingerprint: string;
  originNodeId: string;
  destinationNodeId: string;
  request: DirectedRouteRequest;
};

export type FormalNavigationRerouteIntentResult =
  | { ok: true; intent: FormalNavigationRerouteIntent }
  | {
    ok: false;
    code:
      | "INPUT_INVALID"
      | "LOCATION_INVALID"
      | "LOCATION_STALE"
      | "LOCATION_LOW_ACCURACY"
      | "NO_FORMAL_NODE_NEARBY"
      | "DESTINATION_UNAVAILABLE"
      | "DESTINATION_REACHED"
      | "VERSION_NOT_CHANGED"
      | "OFF_ROUTE_VERSION_DRIFT";
  };

function validRevision(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

/**
 * Converts one fresh in-memory browser fix into a node-only deterministic
 * reroute request. The returned intent deliberately contains no coordinate,
 * accuracy, heading, geometry, or sensor timestamp and is safe to send to the
 * formal route-plan endpoint.
 */
export function buildFormalNavigationRerouteIntent(input: {
  plan: DirectedRoutePlan;
  snapshot: FormalNavigationRerouteSnapshot;
  sample: FormalNavigationLocationSample;
  reason: FormalNavigationRerouteReason;
  nowMs?: number;
}): FormalNavigationRerouteIntentResult {
  const nowMs = input.nowMs ?? Date.now();
  const { plan, snapshot, sample, reason } = input;
  if (
    !Number.isFinite(nowMs)
    || !plan
    || plan.schemaVersion !== 1
    || typeof plan.scenicAreaId !== "string"
    || !plan.scenicAreaId
    || typeof plan.routeFingerprint !== "string"
    || !/^drp1-[0-9a-f]{8}$/.test(plan.routeFingerprint)
    || typeof plan.destinationNodeId !== "string"
    || !plan.destinationNodeId
    || !validRevision(plan.networkRevision)
    || !validVersion(plan.operationalVersion)
    || !validRevision(snapshot?.networkRevision)
    || !validVersion(snapshot?.operationalVersion)
    || !Array.isArray(snapshot?.nodes)
    || !["OFF_ROUTE", "NETWORK_REVISION_CHANGED", "OPERATIONAL_VERSION_CHANGED"].includes(reason)
  ) {
    return { ok: false, code: "INPUT_INVALID" };
  }

  if (
    !sample
    || !Number.isFinite(sample.latitude)
    || sample.latitude < -90
    || sample.latitude > 90
    || !Number.isFinite(sample.longitude)
    || sample.longitude < -180
    || sample.longitude > 180
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters <= 0
    || !Number.isFinite(sample.capturedAtMs)
    || sample.capturedAtMs > nowMs + 1_000
  ) {
    return { ok: false, code: "LOCATION_INVALID" };
  }
  if (nowMs - sample.capturedAtMs > FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS) {
    return { ok: false, code: "LOCATION_STALE" };
  }
  if (sample.accuracyMeters > FORMAL_NAVIGATION_MAX_ACCURACY_METERS) {
    return { ok: false, code: "LOCATION_LOW_ACCURACY" };
  }

  const versionChanged = snapshot.networkRevision !== plan.networkRevision
    || snapshot.operationalVersion !== plan.operationalVersion;
  if (reason === "OFF_ROUTE" && versionChanged) {
    return { ok: false, code: "OFF_ROUTE_VERSION_DRIFT" };
  }
  if (reason !== "OFF_ROUTE" && !versionChanged) {
    return { ok: false, code: "VERSION_NOT_CHANGED" };
  }
  if (!snapshot.nodes.some((node) => node.id === plan.destinationNodeId)) {
    return { ok: false, code: "DESTINATION_UNAVAILABLE" };
  }

  const match = matchLocationToFormalNode({
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters,
  }, snapshot.nodes);
  if (!match.ok) {
    return {
      ok: false,
      code: match.code === "LOW_ACCURACY"
        ? "LOCATION_LOW_ACCURACY"
        : match.code === "NO_FORMAL_NODE_NEARBY"
          ? "NO_FORMAL_NODE_NEARBY"
          : "LOCATION_INVALID",
    };
  }
  if (match.nodeId === plan.destinationNodeId) {
    return { ok: false, code: "DESTINATION_REACHED" };
  }

  return {
    ok: true,
    intent: {
      schemaVersion: 1,
      reason,
      supersedesRouteFingerprint: plan.routeFingerprint,
      originNodeId: match.nodeId,
      destinationNodeId: plan.destinationNodeId,
      request: {
        scenicAreaId: plan.scenicAreaId,
        fromNodeId: match.nodeId,
        toNodeId: plan.destinationNodeId,
        expectedNetworkRevision: snapshot.networkRevision,
        expectedOperationalVersion: snapshot.operationalVersion,
        profile: structuredClone(plan.profile),
        optimization: plan.optimization,
        preference: structuredClone(plan.preference),
      },
    },
  };
}
