import {
  getSafePublishedNetwork,
  parseRouteNetwork,
  type RouteNetworkEdge,
  type RouteNetworkEntrance,
  type RouteNetworkManifest,
  type RouteDifficulty,
  type RouteTransportService,
  type RouteTraversalMode,
} from "./route-network";
import {
  getSafeRouteOperationalState,
  type RouteOperationalState,
} from "./route-operational-state";

export type DirectedRouteProfile = {
  kind: "WALK" | "STEP_FREE";
  maxSlopePercent: number | null;
  minimumWidthMeters: number | null;
};

export const STANDARD_WALK_PROFILE: DirectedRouteProfile = {
  kind: "WALK",
  maxSlopePercent: null,
  minimumWidthMeters: null,
};

export const STEP_FREE_ROUTE_PROFILE: DirectedRouteProfile = {
  kind: "STEP_FREE",
  maxSlopePercent: 5,
  minimumWidthMeters: 0.9,
};

export type DirectedRouteOptimization = "FASTEST" | "SHORTEST" | "SCENIC";

export type DirectedRoutePreference = {
  pace: "RELAXED" | "BALANCED" | "ACTIVE";
  maximumDifficulty: RouteDifficulty;
  allowedTraversalModes: RouteTraversalMode[];
};

export const ALL_ROUTE_TRAVERSAL_MODES: RouteTraversalMode[] = [
  "WALKWAY",
  "BOARDWALK",
  "MOUNTAIN_TRAIL",
  "STAIRS",
  "CABLEWAY",
  "SHUTTLE",
];

export const PEDESTRIAN_ROUTE_TRAVERSAL_MODES: RouteTraversalMode[] = [
  "WALKWAY",
  "BOARDWALK",
  "MOUNTAIN_TRAIL",
  "STAIRS",
];

export const DEFAULT_ROUTE_PREFERENCE: DirectedRoutePreference = {
  pace: "BALANCED",
  maximumDifficulty: "HARD",
  allowedTraversalModes: [...PEDESTRIAN_ROUTE_TRAVERSAL_MODES],
};

export type DirectedRouteRequest = {
  scenicAreaId: string;
  fromNodeId: string;
  toNodeId: string;
  expectedNetworkRevision: string;
  expectedOperationalVersion: number;
  profile: DirectedRouteProfile;
  optimization?: DirectedRouteOptimization;
  preference?: DirectedRoutePreference;
  recommendedRouteId?: string;
};

export type DirectedEdgeTraversal = {
  kind: "EDGE";
  edgeId: string;
  traversalDirection: "FORWARD" | "REVERSE";
  fromNodeId: string;
  toNodeId: string;
  distanceMeters: number;
  estimatedMinutes: number;
  traversalMode: RouteTraversalMode;
  transportService: RouteTransportService | null;
  operationalFactors: {
    travelTimeMultiplier: number;
    crowdLevel: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
    weatherImpact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE" | "UNKNOWN";
  } | null;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

export type DirectedEntranceTransfer = {
  kind: "ENTRANCE_TRANSFER";
  entranceId: string;
  fromNodeId: string;
  toNodeId: string;
  distanceMeters: 0;
  estimatedMinutes: 0;
};

export type DirectedRouteTraversal = DirectedEdgeTraversal | DirectedEntranceTransfer;

export type DirectedRouteNotice =
  | "STAIRS_PRESENT"
  | "ACCESSIBILITY_UNVERIFIED"
  | "SLOPE_UNVERIFIED"
  | "WIDTH_UNVERIFIED"
  | "LIGHTING_UNVERIFIED"
  | "DYNAMIC_TIME_UNVERIFIED"
  | "DYNAMIC_TRAVEL_TIME_APPLIED"
  | "CROWD_FACTOR_APPLIED"
  | "WEATHER_FACTOR_APPLIED"
  | "CABLEWAY_INCLUDED"
  | "SHUTTLE_INCLUDED"
  | "TRANSPORT_WAIT_INCLUDED";

export type DirectedRoutePlan = {
  schemaVersion: 1;
  routeFingerprint: string;
  scenicAreaId: string;
  networkRevision: string;
  operationalVersion: number;
  originNodeId: string;
  destinationNodeId: string;
  profile: DirectedRouteProfile;
  optimization: DirectedRouteOptimization;
  recommendedRouteId?: string;
  preference: DirectedRoutePreference;
  dynamicFactorsApplied: boolean;
  traversals: DirectedRouteTraversal[];
  edgeIds: string[];
  distanceMeters: number;
  estimatedMinutes: number;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
  notices: DirectedRouteNotice[];
  generatedAt: string;
  expiresAt: string;
};

export type DirectedRouteFailureCode =
  | "INPUT_INVALID"
  | "NETWORK_UNAVAILABLE"
  | "OPERATIONAL_STATE_UNAVAILABLE"
  | "NETWORK_REVISION_CHANGED"
  | "OPERATIONAL_VERSION_CHANGED"
  | "ORIGIN_NODE_UNKNOWN"
  | "DESTINATION_NODE_UNKNOWN"
  | "RECOMMENDED_ROUTE_UNKNOWN"
  | "RECOMMENDED_ROUTE_ENDPOINT_MISMATCH"
  | "ORIGIN_EQUALS_DESTINATION"
  | "ROUTING_ATTRIBUTES_UNAVAILABLE"
  | "TRANSPORT_SERVICE_UNAVAILABLE"
  | "NO_SAFE_PATH"
  | "ROUTE_GEOMETRY_DISCONTINUOUS";

export type DirectedRoutePlanResult =
  | { ok: true; plan: DirectedRoutePlan }
  | { ok: false; code: DirectedRouteFailureCode; message: string };

type RouteArc = {
  sortKey: string;
  traversal: DirectedRouteTraversal;
};

type PathState = {
  nodeId: string;
  optimizationCost: number;
  estimatedMinutes: number;
  distanceMeters: number;
  predecessorNodeId: string | null;
  predecessorArc: RouteArc | null;
  tieKey: string;
};

type QueueEntry = Pick<PathState, "nodeId" | "optimizationCost" | "estimatedMinutes" | "distanceMeters" | "tieKey">;

type NormalizedDirectedRouteRequest = Omit<DirectedRouteRequest, "optimization" | "preference"> & {
  optimization: DirectedRouteOptimization;
  preference: DirectedRoutePreference;
};

const EPSILON = 1e-9;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100 && ID_PATTERN.test(value);

const isRevision = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100;

const equalNumber = (left: number, right: number) => Math.abs(left - right) <= EPSILON;

const compareText = (left: string, right: string) => left === right ? 0 : left < right ? -1 : 1;

const cloneCoordinate = ([longitude, latitude]: [number, number]): [number, number] => [longitude, latitude];

const sameCoordinate = (left: [number, number], right: [number, number]) =>
  Math.abs(left[0] - right[0]) <= 1e-7 && Math.abs(left[1] - right[1]) <= 1e-7;

function normalizeProfile(value: unknown): DirectedRouteProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (Object.keys(profile).sort().join("|") !== ["kind", "maxSlopePercent", "minimumWidthMeters"].join("|")) return null;
  if (profile.kind === "WALK") {
    return profile.maxSlopePercent === null && profile.minimumWidthMeters === null
      ? { ...STANDARD_WALK_PROFILE }
      : null;
  }
  if (
    profile.kind !== "STEP_FREE"
    || typeof profile.maxSlopePercent !== "number"
    || !Number.isFinite(profile.maxSlopePercent)
    || profile.maxSlopePercent < 0
    || profile.maxSlopePercent > 100
    || typeof profile.minimumWidthMeters !== "number"
    || !Number.isFinite(profile.minimumWidthMeters)
    || profile.minimumWidthMeters < 0.1
    || profile.minimumWidthMeters > 100
  ) {
    return null;
  }
  return {
    kind: "STEP_FREE",
    maxSlopePercent: profile.maxSlopePercent,
    minimumWidthMeters: profile.minimumWidthMeters,
  };
}

function normalizeOptimization(value: unknown): DirectedRouteOptimization | null {
  if (value === undefined) return "FASTEST";
  return value === "FASTEST" || value === "SHORTEST" || value === "SCENIC" ? value : null;
}

function normalizePreference(value: unknown): DirectedRoutePreference | null {
  if (value === undefined) return structuredClone(DEFAULT_ROUTE_PREFERENCE);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const preference = value as Record<string, unknown>;
  if (Object.keys(preference).sort().join("|") !== ["pace", "maximumDifficulty", "allowedTraversalModes"].sort().join("|")) return null;
  if (!["RELAXED", "BALANCED", "ACTIVE"].includes(String(preference.pace))) return null;
  if (!["EASY", "MODERATE", "HARD"].includes(String(preference.maximumDifficulty))) return null;
  if (
    !Array.isArray(preference.allowedTraversalModes)
    || preference.allowedTraversalModes.length < 1
    || preference.allowedTraversalModes.length > ALL_ROUTE_TRAVERSAL_MODES.length
    || !preference.allowedTraversalModes.every((mode) => ALL_ROUTE_TRAVERSAL_MODES.includes(mode as RouteTraversalMode))
    || new Set(preference.allowedTraversalModes).size !== preference.allowedTraversalModes.length
  ) {
    return null;
  }
  return {
    pace: preference.pace as DirectedRoutePreference["pace"],
    maximumDifficulty: preference.maximumDifficulty as RouteDifficulty,
    allowedTraversalModes: [...preference.allowedTraversalModes] as RouteTraversalMode[],
  };
}

function normalizeRequest(value: DirectedRouteRequest): NormalizedDirectedRouteRequest | null {
  if (
    !value
    || !isId(value.scenicAreaId)
    || !isId(value.fromNodeId)
    || !isId(value.toNodeId)
    || !isRevision(value.expectedNetworkRevision)
    || !Number.isSafeInteger(value.expectedOperationalVersion)
    || value.expectedOperationalVersion < 1
    || (value.recommendedRouteId !== undefined && !isId(value.recommendedRouteId))
  ) {
    return null;
  }
  const profile = normalizeProfile(value.profile);
  const optimization = normalizeOptimization(value.optimization);
  const preference = normalizePreference(value.preference);
  if (!profile || !optimization || !preference) return null;
  return {
    scenicAreaId: value.scenicAreaId,
    fromNodeId: value.fromNodeId,
    toNodeId: value.toNodeId,
    expectedNetworkRevision: value.expectedNetworkRevision,
    expectedOperationalVersion: value.expectedOperationalVersion,
    profile,
    optimization,
    preference,
    ...(value.recommendedRouteId ? { recommendedRouteId: value.recommendedRouteId } : {}),
  };
}

function edgeTraversal(
  edge: RouteNetworkEdge,
  direction: "FORWARD" | "REVERSE",
  operationalRouting: RouteOperationalState["edgeStates"][number]["routing"],
): DirectedEdgeTraversal {
  const forward = direction === "FORWARD";
  const coordinates = (forward ? edge.geometry.coordinates : [...edge.geometry.coordinates].reverse()).map(cloneCoordinate);
  const routing = edge.routing;
  if (!routing) throw new Error("routing_attributes_required");
  return {
    kind: "EDGE",
    edgeId: edge.id,
    traversalDirection: direction,
    fromNodeId: forward ? edge.fromNodeId : edge.toNodeId,
    toNodeId: forward ? edge.toNodeId : edge.fromNodeId,
    distanceMeters: edge.distanceMeters,
    estimatedMinutes: edge.estimatedMinutes * (operationalRouting?.travelTimeMultiplier ?? 1),
    traversalMode: routing.traversalMode,
    transportService: routing.transportService ? structuredClone(routing.transportService) : null,
    operationalFactors: operationalRouting ? structuredClone(operationalRouting) : null,
    geometry: { type: "LineString", coordinates },
  };
}

function transferTraversal(
  entrance: RouteNetworkEntrance,
  direction: "PUBLIC_TO_INTERNAL" | "INTERNAL_TO_PUBLIC",
): DirectedEntranceTransfer {
  return {
    kind: "ENTRANCE_TRANSFER",
    entranceId: entrance.id,
    fromNodeId: direction === "PUBLIC_TO_INTERNAL" ? entrance.publicNodeId : entrance.internalNodeId,
    toNodeId: direction === "PUBLIC_TO_INTERNAL" ? entrance.internalNodeId : entrance.publicNodeId,
    distanceMeters: 0,
    estimatedMinutes: 0,
  };
}

function isProfileEligible(edge: RouteNetworkEdge, profile: DirectedRouteProfile) {
  if (profile.kind === "WALK") return true;
  if (edge.routing?.traversalMode === "CABLEWAY" || edge.routing?.traversalMode === "SHUTTLE") {
    return edge.accessibility.status === "VERIFIED_ACCESSIBLE" && edge.constraints.stairs === "NONE";
  }
  return (
    edge.accessibility.status === "VERIFIED_ACCESSIBLE"
    && edge.constraints.stairs === "NONE"
    && edge.constraints.maxSlopePercent !== null
    && edge.constraints.maxSlopePercent <= (profile.maxSlopePercent as number)
    && edge.constraints.minWidthMeters !== null
    && edge.constraints.minWidthMeters >= (profile.minimumWidthMeters as number)
  );
}

const DIFFICULTY_RANK: Record<RouteDifficulty, number> = { EASY: 1, MODERATE: 2, HARD: 3 };

function isPreferenceEligible(edge: RouteNetworkEdge, preference: DirectedRoutePreference) {
  if (!edge.routing) return false;
  return (
    DIFFICULTY_RANK[edge.routing.difficulty] <= DIFFICULTY_RANK[preference.maximumDifficulty]
    && preference.allowedTraversalModes.includes(edge.routing.traversalMode)
  );
}

function buildArcs(
  network: RouteNetworkManifest,
  operationalState: RouteOperationalState,
  profile: DirectedRouteProfile,
  preference: DirectedRoutePreference,
) {
  const operationalByEdgeId = new Map(operationalState.edgeStates.map((state) => [state.edgeId, state]));
  const arcs: RouteArc[] = [];
  for (const edge of network.edges) {
    const state = operationalByEdgeId.get(edge.id);
    if (!state || state.status !== "OPEN" || !isProfileEligible(edge, profile) || !isPreferenceEligible(edge, preference)) continue;
    if (edge.walkingDirection === "FORWARD" || edge.walkingDirection === "BIDIRECTIONAL") {
      const traversal = edgeTraversal(edge, "FORWARD", state.routing);
      arcs.push({ sortKey: `edge:${edge.id}:forward`, traversal });
    }
    if (edge.walkingDirection === "REVERSE" || edge.walkingDirection === "BIDIRECTIONAL") {
      const traversal = edgeTraversal(edge, "REVERSE", state.routing);
      arcs.push({ sortKey: `edge:${edge.id}:reverse`, traversal });
    }
  }

  for (const entrance of network.entrances) {
    const supportsPublicToInternal = entrance.type === "ENTRY" || entrance.type === "ENTRY_EXIT" || entrance.type === "TRANSFER";
    const supportsInternalToPublic = entrance.type === "EXIT" || entrance.type === "ENTRY_EXIT" || entrance.type === "TRANSFER";
    if (supportsPublicToInternal) {
      const traversal = transferTraversal(entrance, "PUBLIC_TO_INTERNAL");
      arcs.push({ sortKey: `entrance:${entrance.id}:public-to-internal`, traversal });
    }
    if (supportsInternalToPublic) {
      const traversal = transferTraversal(entrance, "INTERNAL_TO_PUBLIC");
      arcs.push({ sortKey: `entrance:${entrance.id}:internal-to-public`, traversal });
    }
  }
  return arcs;
}

function addNotice(notices: Set<DirectedRouteNotice>, edge: RouteNetworkEdge) {
  if (edge.constraints.stairs === "PRESENT") notices.add("STAIRS_PRESENT");
  if (edge.accessibility.status !== "VERIFIED_ACCESSIBLE") notices.add("ACCESSIBILITY_UNVERIFIED");
  if (edge.constraints.maxSlopePercent === null) notices.add("SLOPE_UNVERIFIED");
  if (edge.constraints.minWidthMeters === null) notices.add("WIDTH_UNVERIFIED");
  if (edge.constraints.lighting === "UNKNOWN") notices.add("LIGHTING_UNVERIFIED");
  if (edge.routing?.traversalMode === "CABLEWAY") notices.add("CABLEWAY_INCLUDED");
  if (edge.routing?.traversalMode === "SHUTTLE") notices.add("SHUTTLE_INCLUDED");
  if (edge.routing?.transportService && (edge.routing.transportService.boardingMinutes > 0 || edge.routing.transportService.expectedWaitMinutes > 0)) {
    notices.add("TRANSPORT_WAIT_INCLUDED");
  }
}

function scenicDifficultyMultiplier(edge: RouteNetworkEdge, pace: DirectedRoutePreference["pace"]) {
  if (!edge.routing || pace === "ACTIVE") return 1;
  if (pace === "BALANCED") return edge.routing.difficulty === "HARD" ? 1.2 : 1;
  if (edge.routing.difficulty === "HARD") return 1.6;
  return edge.routing.difficulty === "MODERATE" ? 1.2 : 1;
}

function arcOptimizationCost(
  arc: RouteArc,
  edgeById: Map<string, RouteNetworkEdge>,
  optimization: DirectedRouteOptimization,
  preference: DirectedRoutePreference,
) {
  const traversal = arc.traversal;
  if (traversal.kind === "ENTRANCE_TRANSFER") return 0;
  if (optimization === "SHORTEST") return traversal.distanceMeters;
  if (optimization === "FASTEST") return traversal.estimatedMinutes;
  const edge = edgeById.get(traversal.edgeId);
  if (!edge?.routing) return Number.POSITIVE_INFINITY;
  const scenicFactor = 2 - 1.5 * (edge.routing.scenicScore / 100);
  return traversal.estimatedMinutes * scenicFactor * scenicDifficultyMultiplier(edge, preference.pace);
}

class MinHeap {
  private readonly values: QueueEntry[] = [];

  get size() {
    return this.values.length;
  }

  push(value: QueueEntry) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): QueueEntry | null {
    if (!this.values.length) return null;
    const minimum = this.values[0];
    const last = this.values.pop();
    if (!last || !this.values.length) return minimum;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.compare(this.values[right], this.values[left]) < 0 ? right : left;
      if (this.compare(last, this.values[child]) <= 0) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return minimum;
  }

  private compare(left: QueueEntry, right: QueueEntry) {
    if (!equalNumber(left.optimizationCost, right.optimizationCost)) return left.optimizationCost - right.optimizationCost;
    if (!equalNumber(left.estimatedMinutes, right.estimatedMinutes)) return left.estimatedMinutes - right.estimatedMinutes;
    if (!equalNumber(left.distanceMeters, right.distanceMeters)) return left.distanceMeters - right.distanceMeters;
    const nodeComparison = compareText(left.nodeId, right.nodeId);
    if (nodeComparison) return nodeComparison;
    return compareText(left.tieKey, right.tieKey);
  }
}

function betterPath(candidate: PathState, existing: PathState | undefined) {
  if (!existing) return true;
  if (!equalNumber(candidate.optimizationCost, existing.optimizationCost)) return candidate.optimizationCost < existing.optimizationCost;
  if (!equalNumber(candidate.estimatedMinutes, existing.estimatedMinutes)) return candidate.estimatedMinutes < existing.estimatedMinutes;
  if (!equalNumber(candidate.distanceMeters, existing.distanceMeters)) return candidate.distanceMeters < existing.distanceMeters;
  return compareText(candidate.tieKey, existing.tieKey) < 0;
}

function reconstructPath(best: Map<string, PathState>, originNodeId: string, destinationNodeId: string) {
  const arcs: RouteArc[] = [];
  let nodeId = destinationNodeId;
  const seen = new Set<string>();
  while (nodeId !== originNodeId) {
    if (seen.has(nodeId)) return null;
    seen.add(nodeId);
    const state = best.get(nodeId);
    if (!state || state.predecessorArc === null || state.predecessorNodeId === null) return null;
    arcs.unshift(state.predecessorArc);
    nodeId = state.predecessorNodeId;
  }
  return arcs;
}

function routeGeometry(arcs: RouteArc[]): Array<[number, number]> | null {
  const coordinates: Array<[number, number]> = [];
  for (const arc of arcs) {
    if (arc.traversal.kind !== "EDGE") continue;
    const segment = arc.traversal.geometry.coordinates;
    if (!segment.length) return null;
    if (!coordinates.length) {
      coordinates.push(...segment.map(cloneCoordinate));
      continue;
    }
    if (!sameCoordinate(coordinates[coordinates.length - 1], segment[0])) return null;
    coordinates.push(...segment.slice(1).map(cloneCoordinate));
  }
  return coordinates.length >= 2 ? coordinates : null;
}

function earliestExpiry(network: RouteNetworkManifest, operational: RouteOperationalState, arcs: RouteArc[]) {
  const operatingByEdge = new Map(operational.edgeStates.map((state) => [state.edgeId, state]));
  const staticByEdge = new Map(network.edges.map((edge) => [edge.id, edge]));
  const candidates = [network.expiresAt, network.rights.validUntil, network.review.expiresAt, operational.expiresAt]
    .filter((value): value is string => typeof value === "string");
  for (const arc of arcs) {
    if (arc.traversal.kind !== "EDGE") continue;
    const edge = staticByEdge.get(arc.traversal.edgeId);
    const state = operatingByEdge.get(arc.traversal.edgeId);
    if (edge) candidates.push(edge.dynamicStatus.expiresAt);
    if (state) candidates.push(state.expiresAt);
  }
  return candidates.reduce((earliest, candidate) =>
    new Date(candidate).getTime() < new Date(earliest).getTime() ? candidate : earliest,
  );
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function failure(code: DirectedRouteFailureCode, message: string): DirectedRoutePlanResult {
  return { ok: false, code, message };
}

/**
 * Computes a route exclusively from a validated WGS84 network and a current,
 * complete operating-state snapshot. It never snaps arbitrary coordinates,
 * consults a map provider, or falls back to prototype route geometry.
 */
export function planDirectedRoute(
  networkValue: unknown,
  operationalStateValue: unknown,
  request: DirectedRouteRequest,
  now = new Date(),
): DirectedRoutePlanResult {
  if (Number.isNaN(now.getTime())) return failure("INPUT_INVALID", "校验时钟无效，不能生成路线。");
  const normalizedRequest = normalizeRequest(request);
  if (!normalizedRequest) return failure("INPUT_INVALID", "路线请求不符合严格 schema。");
  if (normalizedRequest.fromNodeId === normalizedRequest.toNodeId) {
    return failure("ORIGIN_EQUALS_DESTINATION", "起点和终点相同，不生成虚构的导航路线。");
  }

  const fullNetwork = parseRouteNetwork(networkValue);
  const network = getSafePublishedNetwork(networkValue, now, normalizedRequest.scenicAreaId);
  if (!fullNetwork || !network) {
    return failure("NETWORK_UNAVAILABLE", "正式路网未通过发布、来源、审核、入口、拓扑或有效期校验。");
  }
  if (normalizedRequest.expectedNetworkRevision !== network.revision) {
    return failure("NETWORK_REVISION_CHANGED", "请求绑定的路网 revision 已变化，必须重新确认路线。");
  }

  const operationalState = getSafeRouteOperationalState(
    operationalStateValue,
    fullNetwork,
    now,
    normalizedRequest.scenicAreaId,
  );
  if (!operationalState) {
    return failure("OPERATIONAL_STATE_UNAVAILABLE", "运营状态缺失、过期或未完整覆盖当前路网，不能继续生成路线。");
  }
  if (normalizedRequest.expectedOperationalVersion !== operationalState.operationalVersion) {
    return failure("OPERATIONAL_VERSION_CHANGED", "请求绑定的运营状态版本已变化，必须重新确认路线。");
  }

  if (network.edges.some((edge) => !edge.routing)) {
    return failure("ROUTING_ATTRIBUTES_UNAVAILABLE", "当前正式路网未完整发布道路类型、难度与观光评分，不能使用所选策略。");
  }
  const requestedTransportModes = new Set<RouteTraversalMode>(normalizedRequest.preference.allowedTraversalModes.filter((mode) => mode === "CABLEWAY" || mode === "SHUTTLE"));
  if (network.edges.some((edge) => edge.routing && requestedTransportModes.has(edge.routing.traversalMode) && !edge.routing.transportService)) {
    return failure("TRANSPORT_SERVICE_UNAVAILABLE", "索道或观光车缺少已审核的服务名称、候乘时间、乘行时间或班次证据，不能参与路线规划。");
  }

  const nodeIds = new Set(network.nodes.map((node) => node.id));
  if (!nodeIds.has(normalizedRequest.fromNodeId)) return failure("ORIGIN_NODE_UNKNOWN", "起点不是当前正式路网节点。");
  if (!nodeIds.has(normalizedRequest.toNodeId)) return failure("DESTINATION_NODE_UNKNOWN", "终点不是当前正式路网节点。");

  const adjacency = new Map<string, RouteArc[]>();
  for (const nodeId of nodeIds) adjacency.set(nodeId, []);
  const availableArcs = buildArcs(network, operationalState, normalizedRequest.profile, normalizedRequest.preference);
  for (const arc of availableArcs) {
    adjacency.get(arc.traversal.fromNodeId)?.push(arc);
  }
  for (const arcs of adjacency.values()) arcs.sort((left, right) => compareText(left.sortKey, right.sortKey));
  const edgeById = new Map(network.edges.map((edge) => [edge.id, edge]));

  let arcs: RouteArc[] | null = null;
  if (normalizedRequest.recommendedRouteId) {
    const recommended = network.recommendedRoutes?.find((route) => route.id === normalizedRequest.recommendedRouteId);
    if (!recommended) return failure("RECOMMENDED_ROUTE_UNKNOWN", "所选管理员推荐路线不属于当前正式路网版本。");
    if (recommended.originNodeId !== normalizedRequest.fromNodeId || recommended.destinationNodeId !== normalizedRequest.toNodeId) {
      return failure("RECOMMENDED_ROUTE_ENDPOINT_MISMATCH", "所选管理员推荐路线与当前起点或终点不一致。");
    }
    const arcBySegment = new Map(availableArcs.flatMap((arc) => arc.traversal.kind === "EDGE"
      ? [[`${arc.traversal.edgeId}:${arc.traversal.traversalDirection}`, arc] as const]
      : []));
    const prescribed = recommended.segments.map((segment) => arcBySegment.get(`${segment.edgeId}:${segment.traversalDirection}`) ?? null);
    if (prescribed.some((arc) => arc === null)) return failure("NO_SAFE_PATH", "管理员推荐路线包含当前关闭或不符合游客约束的路段。");
    arcs = prescribed as RouteArc[];
    let currentNodeId = normalizedRequest.fromNodeId;
    if (arcs.some((arc) => {
      if (arc.traversal.fromNodeId !== currentNodeId) return true;
      currentNodeId = arc.traversal.toNodeId;
      return false;
    }) || currentNodeId !== normalizedRequest.toNodeId) {
      return failure("ROUTE_GEOMETRY_DISCONTINUOUS", "管理员推荐路线的正式边序列不连续，已拒绝输出。");
    }
  } else {
    const best = new Map<string, PathState>();
    const queue = new MinHeap();
    const origin: PathState = {
      nodeId: normalizedRequest.fromNodeId,
      optimizationCost: 0,
      estimatedMinutes: 0,
      distanceMeters: 0,
      predecessorNodeId: null,
      predecessorArc: null,
      tieKey: "origin",
    };
    best.set(origin.nodeId, origin);
    queue.push(origin);
    const settled = new Set<string>();
    while (queue.size) {
      const current = queue.pop();
      if (!current) break;
      const known = best.get(current.nodeId);
      if (!known || !equalNumber(known.optimizationCost, current.optimizationCost) || !equalNumber(known.estimatedMinutes, current.estimatedMinutes) || !equalNumber(known.distanceMeters, current.distanceMeters) || known.tieKey !== current.tieKey) continue;
      if (settled.has(current.nodeId)) continue;
      settled.add(current.nodeId);
      if (current.nodeId === normalizedRequest.toNodeId) break;
      for (const arc of adjacency.get(current.nodeId) ?? []) {
        const traversal = arc.traversal;
        if (settled.has(traversal.toNodeId)) continue;
        const optimizationCost = arcOptimizationCost(arc, edgeById, normalizedRequest.optimization, normalizedRequest.preference);
        if (!Number.isFinite(optimizationCost)) continue;
        const candidate: PathState = {
          nodeId: traversal.toNodeId,
          optimizationCost: known.optimizationCost + optimizationCost,
          estimatedMinutes: known.estimatedMinutes + traversal.estimatedMinutes,
          distanceMeters: known.distanceMeters + traversal.distanceMeters,
          predecessorNodeId: known.nodeId,
          predecessorArc: arc,
          tieKey: `${known.nodeId}|${arc.sortKey}`,
        };
        if (!betterPath(candidate, best.get(candidate.nodeId))) continue;
        best.set(candidate.nodeId, candidate);
        queue.push(candidate);
      }
    }
    if (!best.has(normalizedRequest.toNodeId)) return failure("NO_SAFE_PATH", "当前开放、已核验且符合约束的有向路网中不存在安全路径。");
    arcs = reconstructPath(best, normalizedRequest.fromNodeId, normalizedRequest.toNodeId);
    if (!arcs) return failure("NO_SAFE_PATH", "路线前驱链不完整，已拒绝输出路线。");
  }
  const geometry = routeGeometry(arcs);
  if (!geometry) return failure("ROUTE_GEOMETRY_DISCONTINUOUS", "路线几何不连续，已拒绝输出路线。");

  const operationalByEdgeId = new Map(operationalState.edgeStates.map((state) => [state.edgeId, state]));
  const notices = new Set<DirectedRouteNotice>();
  for (const arc of arcs) {
    if (arc.traversal.kind !== "EDGE") continue;
    const edge = edgeById.get(arc.traversal.edgeId);
    if (edge && normalizedRequest.profile.kind === "WALK") addNotice(notices, edge);
    const operationalRouting = operationalByEdgeId.get(arc.traversal.edgeId)?.routing;
    if (!operationalRouting) {
      notices.add("DYNAMIC_TIME_UNVERIFIED");
    } else {
      if (operationalRouting.travelTimeMultiplier !== 1) notices.add("DYNAMIC_TRAVEL_TIME_APPLIED");
      if (operationalRouting.crowdLevel !== "UNKNOWN") notices.add("CROWD_FACTOR_APPLIED");
      if (operationalRouting.weatherImpact !== "UNKNOWN" && operationalRouting.weatherImpact !== "NONE") notices.add("WEATHER_FACTOR_APPLIED");
    }
  }
  const traversals = arcs.map((arc) => structuredClone(arc.traversal));
  const edgeIds = traversals.flatMap((traversal) => traversal.kind === "EDGE" ? [traversal.edgeId] : []);
  const routeFingerprint = `drp1-${fnv1a(JSON.stringify({
    scenicAreaId: network.scenicAreaId,
    networkRevision: network.revision,
    operationalVersion: operationalState.operationalVersion,
    originNodeId: normalizedRequest.fromNodeId,
    destinationNodeId: normalizedRequest.toNodeId,
    profile: normalizedRequest.profile,
    optimization: normalizedRequest.optimization,
    preference: normalizedRequest.preference,
    ...(normalizedRequest.recommendedRouteId ? { recommendedRouteId: normalizedRequest.recommendedRouteId } : {}),
    traversals: traversals.map((traversal) => traversal.kind === "EDGE"
      ? [traversal.kind, traversal.edgeId, traversal.traversalDirection]
      : [traversal.kind, traversal.entranceId, traversal.fromNodeId, traversal.toNodeId]),
  }))}`;

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      routeFingerprint,
      scenicAreaId: network.scenicAreaId,
      networkRevision: network.revision,
      operationalVersion: operationalState.operationalVersion,
      originNodeId: normalizedRequest.fromNodeId,
      destinationNodeId: normalizedRequest.toNodeId,
      profile: structuredClone(normalizedRequest.profile),
      optimization: normalizedRequest.optimization,
      ...(normalizedRequest.recommendedRouteId ? { recommendedRouteId: normalizedRequest.recommendedRouteId } : {}),
      preference: structuredClone(normalizedRequest.preference),
      dynamicFactorsApplied: edgeIds.every((edgeId) => Boolean(operationalByEdgeId.get(edgeId)?.routing)),
      traversals,
      edgeIds,
      distanceMeters: traversals.reduce((total, traversal) => total + traversal.distanceMeters, 0),
      estimatedMinutes: traversals.reduce((total, traversal) => total + traversal.estimatedMinutes, 0),
      geometry: { type: "LineString", coordinates: geometry.map(cloneCoordinate) },
      notices: [...notices].sort(),
      generatedAt: now.toISOString(),
      expiresAt: earliestExpiry(network, operationalState, arcs),
    },
  };
}
