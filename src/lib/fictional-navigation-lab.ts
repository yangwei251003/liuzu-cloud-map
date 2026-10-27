import {
  planDirectedRoute,
  STANDARD_WALK_PROFILE,
  STEP_FREE_ROUTE_PROFILE,
  type DirectedRoutePlan,
  type DirectedRoutePlanResult,
  type DirectedRouteProfile,
} from "./directed-route-engine";
import type {
  RouteNetworkCoordinate,
  RouteNetworkEdge,
  RouteNetworkManifest,
  RouteNetworkNode,
} from "./route-network";
import type { RouteOperationalState } from "./route-operational-state";

/**
 * This module is an isolated QA fixture. None of its names, coordinates,
 * evidence references or operating states describe Liuzu Town or any real
 * place. It must never be exposed through the formal scenic snapshot APIs.
 */
export const FICTIONAL_LAB_SCENIC_AREA_ID = "fictional-navigation-lab";
export const FICTIONAL_LAB_NETWORK_REVISION = "fictional-lab-network-v1";
export const FICTIONAL_LAB_CLOCK = new Date("2026-08-15T10:00:00.000Z");

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type FictionalLabProfileKind = DirectedRouteProfile["kind"];

export type FictionalLabLocation = {
  nodeId: string;
  name: string;
  shortName: string;
  x: number;
  y: number;
};

export const FICTIONAL_LAB_LOCATIONS: readonly FictionalLabLocation[] = [
  { nodeId: "public-approach", name: "虚构园区外接驳点", shortName: "接驳点", x: 34, y: 174 },
  { nodeId: "public-gate", name: "虚构园区外门", shortName: "外门", x: 88, y: 174 },
  { nodeId: "internal-gate", name: "虚构园区内门", shortName: "内门", x: 132, y: 174 },
  { nodeId: "garden-fork", name: "虚构竹影岔口", shortName: "竹影岔口", x: 246, y: 174 },
  { nodeId: "lake-fork", name: "虚构听水廊", shortName: "听水廊", x: 204, y: 72 },
  { nodeId: "tea-house", name: "虚构歇脚亭", shortName: "歇脚亭", x: 308, y: 72 },
  { nodeId: "observation-deck", name: "虚构云端观景台", shortName: "观景台", x: 408, y: 174 },
] as const;

export const FICTIONAL_LAB_INTERNAL_LOCATION_IDS = FICTIONAL_LAB_LOCATIONS
  .filter(({ nodeId }) => !nodeId.startsWith("public-"))
  .map(({ nodeId }) => nodeId);

export const FICTIONAL_LAB_EDGE_NAMES: Readonly<Record<string, string>> = {
  "edge-public-approach": "虚构园外接驳步道",
  "edge-stairs-shortcut": "虚构石阶捷径（单向）",
  "edge-garden-entry": "虚构竹影园路西段",
  "edge-garden-finish": "虚构竹影园路东段",
  "edge-lake-entry": "虚构听水无障碍道",
  "edge-lake-middle": "虚构湖畔缓坡道",
  "edge-lake-finish": "虚构歇脚亭连廊",
};

export const FICTIONAL_LAB_VISUAL_PATHS: Readonly<Record<string, string>> = {
  "edge-public-approach": "M34 174 L88 174",
  "edge-stairs-shortcut": "M132 174 Q270 246 408 174",
  "edge-garden-entry": "M132 174 L246 174",
  "edge-garden-finish": "M246 174 L408 174",
  "edge-lake-entry": "M132 174 L204 72",
  "edge-lake-middle": "M204 72 L308 72",
  "edge-lake-finish": "M308 72 L408 174",
};

const locationById = new Map(FICTIONAL_LAB_LOCATIONS.map((location) => [location.nodeId, location]));

function instant(now: Date, offsetMs: number) {
  return new Date(now.getTime() + offsetMs).toISOString();
}

function coordinate(longitude: number, latitude: number, now: Date, key: string): RouteNetworkCoordinate {
  return {
    longitude,
    latitude,
    coordinateSystem: "WGS84",
    accuracyMeters: 1,
    capturedAt: instant(now, -DAY),
    sourceReference: `TEST-EVIDENCE://fictional-navigation-lab/coordinate/${key}`,
  };
}

function node(
  id: string,
  layer: RouteNetworkNode["layer"],
  type: RouteNetworkNode["type"],
  longitude: number,
  latitude: number,
  now: Date,
  entranceId: string | null = null,
): RouteNetworkNode {
  return { id, layer, type, entranceId, coordinate: coordinate(longitude, latitude, now, id) };
}

type LabEdgeOptions = {
  id: string;
  layer: RouteNetworkEdge["layer"];
  fromNodeId: string;
  toNodeId: string;
  geometry: Array<[number, number]>;
  distanceMeters: number;
  estimatedMinutes: number;
  walkingDirection?: RouteNetworkEdge["walkingDirection"];
  accessible?: boolean;
  stairs?: boolean;
};

function edge(options: LabEdgeOptions, now: Date): RouteNetworkEdge {
  const accessible = options.accessible ?? true;
  const stairs = options.stairs ?? false;
  return {
    id: options.id,
    layer: options.layer,
    fromNodeId: options.fromNodeId,
    toNodeId: options.toNodeId,
    walkingDirection: options.walkingDirection ?? "BIDIRECTIONAL",
    geometry: { type: "LineString", coordinates: options.geometry },
    distanceMeters: options.distanceMeters,
    estimatedMinutes: options.estimatedMinutes,
    verificationStatus: "MANAGEMENT_APPROVED",
    accessibility: {
      status: accessible ? "VERIFIED_ACCESSIBLE" : "VERIFIED_NOT_ACCESSIBLE",
      checkedAt: instant(now, -12 * 60 * MINUTE),
      expiresAt: instant(now, 30 * DAY),
      evidenceReference: `TEST-EVIDENCE://fictional-navigation-lab/accessibility/${options.id}`,
    },
    constraints: {
      stairs: stairs ? "PRESENT" : "NONE",
      surface: "PAVED",
      maxSlopePercent: stairs ? 9 : 3,
      minWidthMeters: stairs ? 1.1 : 1.5,
      lighting: "PRESENT",
      notes: ["虚构测试约束，不对应任何真实道路。"],
    },
    dynamicStatus: {
      status: "OPEN",
      checkedAt: instant(now, -5 * MINUTE),
      expiresAt: instant(now, 2 * 60 * MINUTE),
      sourceReference: `TEST-EVIDENCE://fictional-navigation-lab/static-status/${options.id}`,
      responsibleParty: "Fictional QA Operations Role",
    },
    routing: {
      traversalMode: stairs ? "STAIRS" : "WALKWAY",
      difficulty: stairs ? "HARD" : "EASY",
      scenicScore: stairs ? 25 : 60,
      evidenceReference: `TEST-EVIDENCE://fictional-navigation-lab/routing/${options.id}`,
    },
  };
}

function createFictionalLabNetwork(now = FICTIONAL_LAB_CLOCK): RouteNetworkManifest {
  const nodes: RouteNetworkNode[] = [
    node("public-approach", "PUBLIC", "TRANSIT", 100, 20, now),
    node("public-gate", "PUBLIC", "ENTRANCE_CONNECTOR", 100.001, 20, now, "fictional-lab-entry"),
    node("internal-gate", "INTERNAL", "ENTRANCE_CONNECTOR", 100.001, 20, now, "fictional-lab-entry"),
    node("garden-fork", "INTERNAL", "JUNCTION", 100.002, 20, now),
    node("lake-fork", "INTERNAL", "JUNCTION", 100.0015, 20.001, now),
    node("tea-house", "INTERNAL", "FACILITY", 100.0025, 20.001, now),
    node("observation-deck", "INTERNAL", "DESTINATION", 100.003, 20, now),
  ];

  const edges: RouteNetworkEdge[] = [
    edge({ id: "edge-public-approach", layer: "PUBLIC", fromNodeId: "public-approach", toNodeId: "public-gate", geometry: [[100, 20], [100.001, 20]], distanceMeters: 95, estimatedMinutes: 2 }, now),
    edge({ id: "edge-stairs-shortcut", layer: "INTERNAL", fromNodeId: "internal-gate", toNodeId: "observation-deck", geometry: [[100.001, 20], [100.002, 19.9996], [100.003, 20]], distanceMeters: 190, estimatedMinutes: 1.5, walkingDirection: "FORWARD", accessible: false, stairs: true }, now),
    edge({ id: "edge-garden-entry", layer: "INTERNAL", fromNodeId: "internal-gate", toNodeId: "garden-fork", geometry: [[100.001, 20], [100.002, 20]], distanceMeters: 115, estimatedMinutes: 2 }, now),
    edge({ id: "edge-garden-finish", layer: "INTERNAL", fromNodeId: "garden-fork", toNodeId: "observation-deck", geometry: [[100.002, 20], [100.003, 20]], distanceMeters: 155, estimatedMinutes: 2.5 }, now),
    edge({ id: "edge-lake-entry", layer: "INTERNAL", fromNodeId: "internal-gate", toNodeId: "lake-fork", geometry: [[100.001, 20], [100.0015, 20.001]], distanceMeters: 145, estimatedMinutes: 3 }, now),
    edge({ id: "edge-lake-middle", layer: "INTERNAL", fromNodeId: "lake-fork", toNodeId: "tea-house", geometry: [[100.0015, 20.001], [100.0025, 20.001]], distanceMeters: 130, estimatedMinutes: 2.5 }, now),
    edge({ id: "edge-lake-finish", layer: "INTERNAL", fromNodeId: "tea-house", toNodeId: "observation-deck", geometry: [[100.0025, 20.001], [100.003, 20]], distanceMeters: 150, estimatedMinutes: 3 }, now),
  ];

  return {
    schemaVersion: 1,
    scenicAreaId: FICTIONAL_LAB_SCENIC_AREA_ID,
    revision: FICTIONAL_LAB_NETWORK_REVISION,
    publicationStatus: "PUBLISHED",
    publishedAt: instant(now, -30 * MINUTE),
    withdrawnAt: null,
    expiresAt: instant(now, 30 * DAY),
    coordinateSystem: "WGS84",
    source: {
      sourceId: "fictional-qa-fixture-v1",
      category: "AUTHORIZED_FIELD_SURVEY",
      provider: "Fictional QA Fixture — no real-world correspondence",
      acquiredAt: instant(now, -DAY),
      evidenceReference: "TEST-EVIDENCE://fictional-navigation-lab/network-v1",
    },
    rights: {
      status: "CLEARED",
      rightsHolder: "Fictional QA Fixture Owner",
      licenseReference: "TEST-EVIDENCE://fictional-navigation-lab/rights-v1",
      validUntil: instant(now, 60 * DAY),
      allowsDisplay: true,
      allowsRouting: true,
      allowsCaching: false,
      allowsDerivatives: false,
    },
    review: {
      status: "APPROVED",
      reviewedRevision: FICTIONAL_LAB_NETWORK_REVISION,
      gisReviewer: "Fictional QA GIS Role",
      managementApprover: "Fictional QA Management Role",
      reviewedAt: instant(now, -45 * MINUTE),
      expiresAt: instant(now, 30 * DAY),
      evidenceReference: "TEST-EVIDENCE://fictional-navigation-lab/review-v1",
    },
    entrances: [{
      id: "fictional-lab-entry",
      name: "虚构测试入口",
      type: "ENTRY_EXIT",
      coordinate: coordinate(100.001, 20, now, "entry"),
      verification: {
        status: "MANAGEMENT_APPROVED",
        checkedAt: instant(now, -12 * 60 * MINUTE),
        expiresAt: instant(now, 30 * DAY),
        verifier: "Fictional QA Field Role",
        managementApprover: "Fictional QA Entry Role",
        evidenceReference: "TEST-EVIDENCE://fictional-navigation-lab/entry-v1",
      },
      publicNodeId: "public-gate",
      internalNodeId: "internal-gate",
    }],
    nodes,
    edges,
  };
}

function createFictionalLabOperationalState(
  closedEdgeIds: Iterable<string> = [],
  operationalVersion = 1,
  now = FICTIONAL_LAB_CLOCK,
): RouteOperationalState {
  const closed = new Set(closedEdgeIds);
  const network = createFictionalLabNetwork(now);
  return {
    schemaVersion: 1,
    scenicAreaId: network.scenicAreaId,
    networkRevision: network.revision,
    operationalVersion,
    issuedAt: instant(now, -MINUTE),
    expiresAt: instant(now, 90 * MINUTE),
    sourceReference: `TEST-EVIDENCE://fictional-navigation-lab/operations-v${operationalVersion}`,
    responsibleParty: "Fictional QA Operations Role",
    edgeStates: network.edges.map(({ id }) => ({
      edgeId: id,
      status: closed.has(id) ? "CLOSED" : "OPEN",
      checkedAt: instant(now, -MINUTE),
      expiresAt: instant(now, 90 * MINUTE),
      sourceReference: `TEST-EVIDENCE://fictional-navigation-lab/operations-v${operationalVersion}/${id}`,
      responsibleParty: "Fictional QA Operations Role",
    })),
  };
}

export type FictionalRouteRequest = {
  fromNodeId: string;
  toNodeId: string;
  profileKind: FictionalLabProfileKind;
  closedEdgeIds?: Iterable<string>;
  operationalVersion?: number;
  now?: Date;
};

export type FictionalLabRouteResult = {
  classification: "FICTIONAL_SIMULATION";
  realWorldUseProhibited: true;
  realWorldCorrespondence: "NONE";
  simulatedAt: string;
  result: DirectedRoutePlanResult;
};

export function planFictionalLabRoute({
  fromNodeId,
  toNodeId,
  profileKind,
  closedEdgeIds = [],
  operationalVersion = 1,
  now = FICTIONAL_LAB_CLOCK,
}: FictionalRouteRequest): FictionalLabRouteResult {
  const network = createFictionalLabNetwork(now);
  const operationalState = createFictionalLabOperationalState(closedEdgeIds, operationalVersion, now);
  const profile = profileKind === "STEP_FREE" ? STEP_FREE_ROUTE_PROFILE : STANDARD_WALK_PROFILE;
  const result = planDirectedRoute(network, operationalState, {
    scenicAreaId: network.scenicAreaId,
    fromNodeId,
    toNodeId,
    expectedNetworkRevision: network.revision,
    expectedOperationalVersion: operationalState.operationalVersion,
    profile,
  }, now);
  return {
    classification: "FICTIONAL_SIMULATION",
    realWorldUseProhibited: true,
    realWorldCorrespondence: "NONE",
    simulatedAt: now.toISOString(),
    result,
  };
}

export function getFictionalLocation(nodeId: string) {
  return locationById.get(nodeId) ?? null;
}

export function getDestinationClosureEdgeIds(destinationNodeId: string, now = FICTIONAL_LAB_CLOCK) {
  return createFictionalLabNetwork(now).edges
    .filter(({ layer, fromNodeId, toNodeId }) => layer === "INTERNAL" && (fromNodeId === destinationNodeId || toNodeId === destinationNodeId))
    .map(({ id }) => id);
}

export function getFictionalLabTopology(now = FICTIONAL_LAB_CLOCK) {
  const network = createFictionalLabNetwork(now);
  return {
    classification: "FICTIONAL_SIMULATION" as const,
    realWorldUseProhibited: true as const,
    realWorldCorrespondence: "NONE" as const,
    networkRevision: network.revision,
    simulatedAt: now.toISOString(),
    edges: network.edges.map(({ id, fromNodeId, toNodeId, walkingDirection }) => ({
      id,
      fromNodeId,
      toNodeId,
      walkingDirection,
    })),
  };
}

function interpolateCoordinate(
  coordinates: Array<[number, number]>,
  fraction: number,
): [number, number] {
  if (coordinates.length === 1) return [...coordinates[0]];
  const clamped = Math.min(1, Math.max(0, fraction));
  const segmentLengths = coordinates.slice(1).map((point, index) => {
    const previous = coordinates[index];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  const total = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return [...coordinates[0]];
  let target = total * clamped;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index];
    if (target <= length || index === segmentLengths.length - 1) {
      const local = length === 0 ? 0 : target / length;
      const start = coordinates[index];
      const end = coordinates[index + 1];
      return [start[0] + (end[0] - start[0]) * local, start[1] + (end[1] - start[1]) * local];
    }
    target -= length;
  }
  return [...coordinates[coordinates.length - 1]];
}

export type FictionalNavigationProgress = {
  classification: "FICTIONAL_SIMULATION";
  realWorldUseProhibited: true;
  realWorldCorrespondence: "NONE";
  traveledMeters: number;
  remainingMeters: number;
  remainingMinutes: number;
  progressRatio: number;
  traversalIndex: number;
  traversalFraction: number;
  activeEdgeId: string | null;
  activeFromNodeId: string;
  activeToNodeId: string;
  coordinate: [number, number];
  instruction: string;
  headingDegrees: number;
  arrived: boolean;
};

export function calculateFictionalNavigationProgress(
  plan: DirectedRoutePlan,
  traveledMeters: number,
): FictionalNavigationProgress {
  const edgeTraversals = plan.traversals.filter((traversal) => traversal.kind === "EDGE");
  const clamped = Math.min(plan.distanceMeters, Math.max(0, traveledMeters));
  const arrived = clamped >= plan.distanceMeters;
  let consumed = 0;
  let activeIndex = Math.max(0, edgeTraversals.length - 1);
  for (let index = 0; index < edgeTraversals.length; index += 1) {
    const traversal = edgeTraversals[index];
    if (clamped <= consumed + traversal.distanceMeters || index === edgeTraversals.length - 1) {
      activeIndex = index;
      break;
    }
    consumed += traversal.distanceMeters;
  }
  const active = edgeTraversals[activeIndex];
  if (!active) {
    throw new Error("Fictional navigation plan has no edge traversal.");
  }
  const distanceIntoTraversal = Math.min(active.distanceMeters, Math.max(0, clamped - consumed));
  const traversalFraction = active.distanceMeters === 0 ? 1 : distanceIntoTraversal / active.distanceMeters;
  const remainingMeters = Math.max(0, plan.distanceMeters - clamped);
  const remainingMinutes = plan.distanceMeters === 0 ? 0 : plan.estimatedMinutes * (remainingMeters / plan.distanceMeters);
  const edgeName = FICTIONAL_LAB_EDGE_NAMES[active.edgeId] ?? active.edgeId;
  const destination = getFictionalLocation(plan.destinationNodeId)?.shortName ?? "虚构终点";
  const instruction = arrived
    ? `已抵达${destination}，本次虚构导航演练结束。`
    : activeIndex === edgeTraversals.length - 1
      ? `沿${edgeName}前行约 ${Math.ceil(active.distanceMeters - distanceIntoTraversal)} 米，抵达${destination}。`
      : `沿${edgeName}前行约 ${Math.ceil(active.distanceMeters - distanceIntoTraversal)} 米，到达${getFictionalLocation(active.toNodeId)?.shortName ?? "下一节点"}。`;
  const coordinate = interpolateCoordinate(active.geometry.coordinates, traversalFraction);
  const headingStart = interpolateCoordinate(active.geometry.coordinates, Math.min(1, traversalFraction + 0.001));
  const headingDegrees = (Math.atan2(
    headingStart[0] - coordinate[0],
    headingStart[1] - coordinate[1],
  ) * 180 / Math.PI + 360) % 360;

  return {
    classification: "FICTIONAL_SIMULATION",
    realWorldUseProhibited: true,
    realWorldCorrespondence: "NONE",
    traveledMeters: clamped,
    remainingMeters,
    remainingMinutes,
    progressRatio: plan.distanceMeters === 0 ? 1 : clamped / plan.distanceMeters,
    traversalIndex: activeIndex,
    traversalFraction,
    activeEdgeId: active.edgeId,
    activeFromNodeId: active.fromNodeId,
    activeToNodeId: active.toNodeId,
    coordinate,
    instruction,
    headingDegrees,
    arrived,
  };
}

export function getFictionalVisualPosition(progress: FictionalNavigationProgress) {
  const from = getFictionalLocation(progress.activeFromNodeId);
  const to = getFictionalLocation(progress.activeToNodeId);
  if (!from || !to) return null;
  if (progress.activeEdgeId === "edge-stairs-shortcut") {
    const t = progress.traversalFraction;
    const control = { x: 270, y: 246 };
    return {
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y,
    };
  }
  return { x: from.x + (to.x - from.x) * progress.traversalFraction, y: from.y + (to.y - from.y) * progress.traversalFraction };
}

export type FictionalLocationSample = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
};

export type FictionalLocationAssessment = {
  status: "ACCEPT" | "PAUSE_LOW_ACCURACY" | "PAUSE_STALE" | "PAUSE_JUMP" | "PAUSE_INVALID";
  reason: string;
};

function approximateDistanceMeters(left: FictionalLocationSample, right: FictionalLocationSample) {
  const latitudeScale = 111_320;
  const longitudeScale = Math.cos(((left.latitude + right.latitude) / 2) * Math.PI / 180) * latitudeScale;
  return Math.hypot((right.longitude - left.longitude) * longitudeScale, (right.latitude - left.latitude) * latitudeScale);
}

export function assessFictionalLocationSample(
  sample: FictionalLocationSample,
  previous: FictionalLocationSample | null,
  nowMs: number,
): FictionalLocationAssessment {
  if (
    !Number.isFinite(sample.longitude)
    || !Number.isFinite(sample.latitude)
    || sample.longitude < -180
    || sample.longitude > 180
    || sample.latitude < -90
    || sample.latitude > 90
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters < 0
    || !Number.isFinite(sample.capturedAtMs)
  ) {
    return { status: "PAUSE_INVALID", reason: "位置样本格式无效，必须暂停。" };
  }
  if (nowMs - sample.capturedAtMs > 10_000 || sample.capturedAtMs > nowMs + 1_000) {
    return { status: "PAUSE_STALE", reason: "位置样本已过期或来自未来，必须暂停。" };
  }
  if (sample.accuracyMeters > 35) {
    return { status: "PAUSE_LOW_ACCURACY", reason: "定位精度超过 35 米安全阈值，必须暂停。" };
  }
  if (previous) {
    const elapsedSeconds = (sample.capturedAtMs - previous.capturedAtMs) / 1000;
    if (elapsedSeconds <= 0) return { status: "PAUSE_INVALID", reason: "位置样本时间没有前进，必须暂停。" };
    const speedMetersPerSecond = approximateDistanceMeters(previous, sample) / elapsedSeconds;
    if (speedMetersPerSecond > 8) return { status: "PAUSE_JUMP", reason: "位置发生不合理跳点，必须暂停。" };
  }
  return { status: "ACCEPT", reason: "虚构位置样本处于演练阈值内。" };
}

export function updateFictionalDeviationHysteresis(previousOutsideCount: number, distanceFromRouteMeters: number) {
  if (!Number.isFinite(distanceFromRouteMeters) || distanceFromRouteMeters < 0) {
    return { outsideCount: 3, deviated: true };
  }
  if (distanceFromRouteMeters > 30) {
    const outsideCount = Math.min(3, Math.max(0, previousOutsideCount) + 1);
    return { outsideCount, deviated: outsideCount >= 3 };
  }
  if (distanceFromRouteMeters < 15) return { outsideCount: 0, deviated: false };
  return { outsideCount: Math.max(0, previousOutsideCount), deviated: false };
}
