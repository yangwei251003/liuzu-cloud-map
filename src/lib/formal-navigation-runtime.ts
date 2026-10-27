import type { DirectedEdgeTraversal, DirectedRoutePlan } from "./directed-route-engine";

export const FORMAL_NAVIGATION_MAX_ACCURACY_METERS = 35;
export const FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS = 10_000;
export const FORMAL_NAVIGATION_MAX_SPEED_METERS_PER_SECOND = 12;
export const FORMAL_NAVIGATION_OUTSIDE_CORRIDOR_METERS = 30;
export const FORMAL_NAVIGATION_RECOVERY_CORRIDOR_METERS = 15;
export const FORMAL_NAVIGATION_ARRIVAL_RADIUS_METERS = 20;
export const FORMAL_NAVIGATION_REQUIRED_OUTSIDE_SAMPLES = 3;
export const FORMAL_NAVIGATION_REQUIRED_ARRIVAL_SAMPLES = 3;
export const FORMAL_NAVIGATION_REQUIRED_ARRIVAL_DWELL_MS = 10_000;
export const FORMAL_NAVIGATION_PROGRESS_MATCH_BUFFER_METERS = 15;
export const FORMAL_NAVIGATION_PROGRESS_MATCH_LATERAL_ADVANTAGE_METERS = 8;
export const FORMAL_NAVIGATION_REQUIRED_PROGRESS_JUMP_SAMPLES = 3;
export const FORMAL_NAVIGATION_WRONG_WAY_DISTANCE_METERS = 20;
export const FORMAL_NAVIGATION_WRONG_WAY_RECOVERY_METERS = 8;
export const FORMAL_NAVIGATION_REQUIRED_WRONG_WAY_SAMPLES = 3;

export type FormalNavigationStatus =
  | "READY"
  | "ACTIVE"
  | "PAUSED"
  | "REROUTE_REQUIRED"
  | "COMPLETED"
  | "CANCELLED";

export type FormalGuidanceQuality =
  | "WAITING"
  | "RELIABLE"
  | "LOW_ACCURACY"
  | "STALE"
  | "JUMP"
  | "INVALID"
  | "OFF_ROUTE"
  | "WRONG_WAY"
  | "ARRIVED"
  | "PAUSED";

export type FormalManeuverKind =
  | "STRAIGHT"
  | "LEFT"
  | "RIGHT"
  | "U_TURN"
  | "BOARD_CABLEWAY"
  | "RIDE_CABLEWAY"
  | "ALIGHT_CABLEWAY"
  | "BOARD_SHUTTLE"
  | "RIDE_SHUTTLE"
  | "ALIGHT_SHUTTLE"
  | "ARRIVE";

export type FormalNavigationManeuver = {
  kind: FormalManeuverKind;
  instruction: string;
  distanceToManeuverMeters: number;
  headingDegrees: number;
};

/** Serializable navigation summary. It intentionally contains no GPS point. */
export type FormalNavigationRuntime = {
  schemaVersion: 1;
  routeFingerprint: string;
  networkRevision: string;
  operationalVersion: number;
  planExpiresAt: string;
  status: FormalNavigationStatus;
  guidanceQuality: FormalGuidanceQuality;
  progressRatio: number;
  remainingDistanceMeters: number;
  remainingMinutes: number;
  lateralDistanceMeters: number | null;
  maneuver: FormalNavigationManeuver | null;
  lastProcessedAt: string | null;
  message: string;
};

export type FormalNavigationLocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
};

export type FormalNavigationRouteMatch = {
  segmentIndex: number;
  segmentFraction: number;
};

/** Ephemeral sensor memory. Callers must never persist or send this object. */
export type FormalNavigationTracker = {
  previousAcceptedSample: FormalNavigationLocationSample | null;
  routeProgressMeters: number | null;
  routeGeometryMeters: number | null;
  routeMatch: FormalNavigationRouteMatch | null;
  furthestRouteProgressMeters: number | null;
  progressJumpSamples: number;
  wrongWaySamples: number;
  outsideSamples: number;
  arrivalSamples: number;
  arrivalFirstSampleAtMs: number | null;
};

export type FormalNavigationTransition =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CANCEL" }
  | { type: "SENSOR_UNAVAILABLE"; message: string }
  | { type: "OPERATIONAL_STATE_UNAVAILABLE"; message: string }
  | { type: "ROUTE_VERSION_CHANGED"; networkRevision: string; operationalVersion: number };

export type FormalNavigationRuntimeResult =
  | { ok: true; runtime: FormalNavigationRuntime; tracker: FormalNavigationTracker }
  | { ok: false; code: "PLAN_INVALID" | "PLAN_EXPIRED"; message: string };

type Projection = {
  segmentIndex: number;
  segmentFraction: number;
  lateralDistanceMeters: number;
  traveledGeometryMeters: number;
  totalGeometryMeters: number;
};

const finiteCoordinate = (coordinate: [number, number]) => (
  Array.isArray(coordinate)
  && coordinate.length === 2
  && Number.isFinite(coordinate[0])
  && Number.isFinite(coordinate[1])
  && coordinate[0] >= -180
  && coordinate[0] <= 180
  && coordinate[1] >= -90
  && coordinate[1] <= 90
);

function coordinatesFromPlan(plan: DirectedRoutePlan) {
  const coordinates = plan.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(finiteCoordinate)) return null;
  return coordinates as Array<[number, number]>;
}

function distanceMeters(left: { longitude: number; latitude: number }, right: { longitude: number; latitude: number }) {
  const latitudeScale = 111_320;
  const longitudeScale = Math.cos(((left.latitude + right.latitude) / 2) * Math.PI / 180) * latitudeScale;
  return Math.hypot((right.longitude - left.longitude) * longitudeScale, (right.latitude - left.latitude) * latitudeScale);
}

type ProjectionMatch =
  | { type: "MATCH"; projection: Projection }
  | { type: "PROGRESS_JUMP"; nearestProjection: Projection }
  | { type: "INVALID" };

function projectionCandidates(
  sample: FormalNavigationLocationSample,
  coordinates: Array<[number, number]>,
): Projection[] | null {
  const referenceLatitude = sample.latitude * Math.PI / 180;
  const longitudeScale = Math.cos(referenceLatitude) * 111_320;
  const latitudeScale = 111_320;
  const point = { x: sample.longitude * longitudeScale, y: sample.latitude * latitudeScale };
  const segmentLengths = coordinates.slice(1).map((coordinate, index) => distanceMeters(
    { longitude: coordinates[index][0], latitude: coordinates[index][1] },
    { longitude: coordinate[0], latitude: coordinate[1] },
  ));
  const totalGeometryMeters = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(totalGeometryMeters) || totalGeometryMeters <= 0) return null;

  const candidates: Projection[] = [];
  let consumedMeters = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = { x: coordinates[index][0] * longitudeScale, y: coordinates[index][1] * latitudeScale };
    const end = { x: coordinates[index + 1][0] * longitudeScale, y: coordinates[index + 1][1] * latitudeScale };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const squaredLength = dx * dx + dy * dy;
    const fraction = squaredLength === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength));
    const projectedX = start.x + dx * fraction;
    const projectedY = start.y + dy * fraction;
    const lateralDistanceMeters = Math.hypot(point.x - projectedX, point.y - projectedY);
    const candidate: Projection = {
      segmentIndex: index,
      segmentFraction: fraction,
      lateralDistanceMeters,
      traveledGeometryMeters: consumedMeters + segmentLengths[index] * fraction,
      totalGeometryMeters,
    };
    candidates.push(candidate);
    consumedMeters += segmentLengths[index];
  }
  return candidates;
}

function projectionOrder(left: Projection, right: Projection) {
  const lateralDifference = left.lateralDistanceMeters - right.lateralDistanceMeters;
  if (Math.abs(lateralDifference) > 1e-6) return lateralDifference;
  return left.traveledGeometryMeters - right.traveledGeometryMeters;
}

function projectToRoute(
  sample: FormalNavigationLocationSample,
  coordinates: Array<[number, number]>,
  tracker: FormalNavigationTracker,
): ProjectionMatch {
  const candidates = projectionCandidates(sample, coordinates);
  if (!candidates || candidates.length === 0) return { type: "INVALID" };
  const nearestProjection = [...candidates].sort(projectionOrder)[0];
  const previousProgress = tracker.routeProgressMeters;
  const previousSample = tracker.previousAcceptedSample;
  const geometryMatches = tracker.routeGeometryMeters === null
    || Math.abs(tracker.routeGeometryMeters - nearestProjection.totalGeometryMeters) <= 0.5;
  if (previousProgress === null || !previousSample || !geometryMatches) {
    return { type: "MATCH", projection: nearestProjection };
  }

  const observedMovementMeters = distanceMeters(sample, previousSample);
  const maximumProgressChangeMeters = observedMovementMeters
    + previousSample.accuracyMeters
    + sample.accuracyMeters
    + FORMAL_NAVIGATION_PROGRESS_MATCH_BUFFER_METERS;
  const plausibleCandidates = candidates.filter((candidate) => (
    Math.abs(candidate.traveledGeometryMeters - previousProgress) <= maximumProgressChangeMeters
  ));
  if (plausibleCandidates.length === 0) {
    return { type: "PROGRESS_JUMP", nearestProjection };
  }
  plausibleCandidates.sort((left, right) => {
    const lateralDifference = left.lateralDistanceMeters - right.lateralDistanceMeters;
    if (Math.abs(lateralDifference) > 1e-6) return lateralDifference;
    const leftProgressDifference = Math.abs(left.traveledGeometryMeters - previousProgress);
    const rightProgressDifference = Math.abs(right.traveledGeometryMeters - previousProgress);
    if (Math.abs(leftProgressDifference - rightProgressDifference) > 1e-6) {
      return leftProgressDifference - rightProgressDifference;
    }
    return left.traveledGeometryMeters - right.traveledGeometryMeters;
  });
  const matchedProjection = plausibleCandidates[0];
  const nearestProgressChange = Math.abs(nearestProjection.traveledGeometryMeters - previousProgress);
  if (
    nearestProgressChange > maximumProgressChangeMeters
    && matchedProjection.lateralDistanceMeters - nearestProjection.lateralDistanceMeters
      >= FORMAL_NAVIGATION_PROGRESS_MATCH_LATERAL_ADVANTAGE_METERS
    && nearestProjection.lateralDistanceMeters - sample.accuracyMeters
      <= FORMAL_NAVIGATION_OUTSIDE_CORRIDOR_METERS
  ) {
    return { type: "PROGRESS_JUMP", nearestProjection };
  }
  return { type: "MATCH", projection: matchedProjection };
}

function bearingDegrees(from: [number, number], to: [number, number]) {
  const latitude1 = from[1] * Math.PI / 180;
  const latitude2 = to[1] * Math.PI / 180;
  const longitudeDelta = (to[0] - from[0]) * Math.PI / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function normalizeTurnDelta(value: number) {
  return ((value + 540) % 360) - 180;
}

type EdgeSegmentContext = {
  traversal: DirectedEdgeTraversal;
  nextTraversal: DirectedEdgeTraversal | null;
  progressRatio: number;
  remainingMeters: number;
};

function edgeSegmentContext(plan: DirectedRoutePlan, projection: Projection): EdgeSegmentContext | null {
  let globalSegmentIndex = 0;
  const edgeTraversals = plan.traversals.filter((traversal): traversal is DirectedEdgeTraversal => traversal.kind === "EDGE");
  for (let edgeIndex = 0; edgeIndex < edgeTraversals.length; edgeIndex += 1) {
    const traversal = edgeTraversals[edgeIndex];
    const coordinates = traversal.geometry.coordinates;
    const segmentLengths = coordinates.slice(0, -1).map((coordinate, index) => distanceMeters(
      { longitude: coordinate[0], latitude: coordinate[1] },
      { longitude: coordinates[index + 1][0], latitude: coordinates[index + 1][1] },
    ));
    const geometryMeters = segmentLengths.reduce((total, length) => total + length, 0);
    for (let localSegmentIndex = 0; localSegmentIndex < segmentLengths.length; localSegmentIndex += 1) {
      if (globalSegmentIndex === projection.segmentIndex) {
        const traveledGeometryMeters = segmentLengths.slice(0, localSegmentIndex).reduce((total, length) => total + length, 0)
          + segmentLengths[localSegmentIndex] * projection.segmentFraction;
        const progressRatio = geometryMeters > 0 ? Math.min(1, Math.max(0, traveledGeometryMeters / geometryMeters)) : 0;
        return {
          traversal,
          nextTraversal: edgeTraversals[edgeIndex + 1] ?? null,
          progressRatio,
          remainingMeters: traversal.distanceMeters * (1 - progressRatio),
        };
      }
      globalSegmentIndex += 1;
    }
  }
  return null;
}

function transportManeuver(
  context: EdgeSegmentContext,
  headingDegrees: number,
): FormalNavigationManeuver | null {
  const { traversal, nextTraversal, progressRatio, remainingMeters } = context;
  const service = traversal.transportService;
  const cableway = traversal.traversalMode === "CABLEWAY";
  const shuttle = traversal.traversalMode === "SHUTTLE";
  if ((cableway || shuttle) && service) {
    const vehicle = cableway ? "索道" : "观光车";
    const boardKind: FormalManeuverKind = cableway ? "BOARD_CABLEWAY" : "BOARD_SHUTTLE";
    const rideKind: FormalManeuverKind = cableway ? "RIDE_CABLEWAY" : "RIDE_SHUTTLE";
    const alightKind: FormalManeuverKind = cableway ? "ALIGHT_CABLEWAY" : "ALIGHT_SHUTTLE";
    if (progressRatio <= 0.12) {
      return {
        kind: boardKind,
        instruction: `在此核对现场班次后乘坐${service.serviceName}；预计登乘与候乘 ${Math.ceil(service.boardingMinutes + service.expectedWaitMinutes)} 分钟、乘行 ${Math.ceil(service.inVehicleMinutes)} 分钟。`,
        distanceToManeuverMeters: 0,
        headingDegrees,
      };
    }
    if (progressRatio >= 0.88 || remainingMeters <= 20) {
      return {
        kind: alightKind,
        instruction: `继续乘坐${service.serviceName}约 ${Math.ceil(remainingMeters)} 米后到站，准备离开${vehicle}并核对现场出口。`,
        distanceToManeuverMeters: remainingMeters,
        headingDegrees,
      };
    }
    return {
      kind: rideKind,
      instruction: `正在乘坐${service.serviceName}，约 ${Math.ceil(remainingMeters)} 米后到站。`,
      distanceToManeuverMeters: remainingMeters,
      headingDegrees,
    };
  }

  const nextService = nextTraversal?.transportService;
  const nearTransportBoarding = remainingMeters <= 50
    && nextService
    && (nextTraversal.traversalMode === "CABLEWAY" || nextTraversal.traversalMode === "SHUTTLE");
  if (nearTransportBoarding) {
    return {
      kind: nextTraversal.traversalMode === "CABLEWAY" ? "BOARD_CABLEWAY" : "BOARD_SHUTTLE",
      instruction: `前行约 ${Math.ceil(remainingMeters)} 米至${nextService.serviceName}乘坐点；请先核对现场班次和运营标识。`,
      distanceToManeuverMeters: remainingMeters,
      headingDegrees,
    };
  }
  return null;
}

function remainingMinutesForProjection(plan: DirectedRoutePlan, projection: Projection, fallbackRatio: number) {
  const context = edgeSegmentContext(plan, projection);
  if (!context) return Math.max(0, plan.estimatedMinutes * (1 - fallbackRatio));
  const edgeTraversals = plan.traversals.filter((traversal): traversal is DirectedEdgeTraversal => traversal.kind === "EDGE");
  const currentIndex = edgeTraversals.findIndex((traversal) => traversal === context.traversal);
  if (currentIndex < 0) return Math.max(0, plan.estimatedMinutes * (1 - fallbackRatio));
  return Math.max(0,
    context.traversal.estimatedMinutes * (1 - context.progressRatio)
      + edgeTraversals.slice(currentIndex + 1).reduce((total, traversal) => total + traversal.estimatedMinutes, 0),
  );
}

function remainingDistanceForProjection(plan: DirectedRoutePlan, projection: Projection, fallbackRatio: number) {
  const context = edgeSegmentContext(plan, projection);
  if (!context) return Math.max(0, plan.distanceMeters * (1 - fallbackRatio));
  const edgeTraversals = plan.traversals.filter((traversal): traversal is DirectedEdgeTraversal => traversal.kind === "EDGE");
  const currentIndex = edgeTraversals.findIndex((traversal) => traversal === context.traversal);
  if (currentIndex < 0) return Math.max(0, plan.distanceMeters * (1 - fallbackRatio));
  return Math.max(0,
    context.traversal.distanceMeters * (1 - context.progressRatio)
      + edgeTraversals.slice(currentIndex + 1).reduce((total, traversal) => total + traversal.distanceMeters, 0),
  );
}

function firstNonZeroBearing(coordinates: Array<[number, number]>) {
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    if (distanceMeters(
      { longitude: coordinates[index][0], latitude: coordinates[index][1] },
      { longitude: coordinates[index + 1][0], latitude: coordinates[index + 1][1] },
    ) > 0.01) return bearingDegrees(coordinates[index], coordinates[index + 1]);
  }
  return null;
}

function lastNonZeroBearing(coordinates: Array<[number, number]>) {
  for (let index = coordinates.length - 2; index >= 0; index -= 1) {
    if (distanceMeters(
      { longitude: coordinates[index][0], latitude: coordinates[index][1] },
      { longitude: coordinates[index + 1][0], latitude: coordinates[index + 1][1] },
    ) > 0.01) return bearingDegrees(coordinates[index], coordinates[index + 1]);
  }
  return null;
}

function turnKind(delta: number): FormalManeuverKind {
  if (Math.abs(delta) >= 150) return "U_TURN";
  if (delta >= 25) return "RIGHT";
  if (delta <= -25) return "LEFT";
  return "STRAIGHT";
}

function turnAction(kind: FormalManeuverKind) {
  return kind === "RIGHT" ? "右转" : kind === "LEFT" ? "左转" : kind === "U_TURN" ? "掉头" : "继续直行";
}

function maneuverForProjection(
  plan: DirectedRoutePlan,
  projection: Projection,
  coordinates: Array<[number, number]>,
  remainingDistanceMeters: number,
): FormalNavigationManeuver {
  const segmentStart = coordinates[projection.segmentIndex];
  const segmentEnd = coordinates[projection.segmentIndex + 1];
  const currentBearing = bearingDegrees(segmentStart, segmentEnd);
  if (remainingDistanceMeters <= FORMAL_NAVIGATION_ARRIVAL_RADIUS_METERS) {
    return {
      kind: "ARRIVE",
      instruction: "已接近目的地，请核对现场标识后确认到达。",
      distanceToManeuverMeters: remainingDistanceMeters,
      headingDegrees: currentBearing,
    };
  }

  const segmentContext = edgeSegmentContext(plan, projection);
  if (segmentContext) {
    const transport = transportManeuver(segmentContext, currentBearing);
    if (transport) return transport;
    const nextTraversal = segmentContext.nextTraversal;
    if (!nextTraversal) {
      return {
        kind: "STRAIGHT",
        instruction: `沿当前路段继续前行约 ${Math.ceil(segmentContext.remainingMeters)} 米。`,
        distanceToManeuverMeters: segmentContext.remainingMeters,
        headingDegrees: currentBearing,
      };
    }
    const exitBearing = lastNonZeroBearing(segmentContext.traversal.geometry.coordinates) ?? currentBearing;
    const entryBearing = firstNonZeroBearing(nextTraversal.geometry.coordinates) ?? exitBearing;
    const kind = turnKind(normalizeTurnDelta(entryBearing - exitBearing));
    return {
      kind,
      instruction: `沿当前路段前行约 ${Math.ceil(segmentContext.remainingMeters)} 米后${turnAction(kind)}。`,
      distanceToManeuverMeters: segmentContext.remainingMeters,
      headingDegrees: currentBearing,
    };
  }

  const distanceToSegmentEnd = distanceMeters(
    {
      longitude: segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * projection.segmentFraction,
      latitude: segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * projection.segmentFraction,
    },
    { longitude: segmentEnd[0], latitude: segmentEnd[1] },
  );
  const next = coordinates[projection.segmentIndex + 2];
  if (!next) {
    return {
      kind: "STRAIGHT",
      instruction: `沿当前路线继续前行约 ${Math.ceil(remainingDistanceMeters)} 米。`,
      distanceToManeuverMeters: remainingDistanceMeters,
      headingDegrees: currentBearing,
    };
  }

  const nextBearing = bearingDegrees(segmentEnd, next);
  const delta = normalizeTurnDelta(nextBearing - currentBearing);
  const kind = turnKind(delta);
  return {
    kind,
    instruction: `前行约 ${Math.ceil(distanceToSegmentEnd)} 米后${turnAction(kind)}。`,
    distanceToManeuverMeters: distanceToSegmentEnd,
    headingDegrees: currentBearing,
  };
}

function emptyTracker(): FormalNavigationTracker {
  return {
    previousAcceptedSample: null,
    routeProgressMeters: null,
    routeGeometryMeters: null,
    routeMatch: null,
    furthestRouteProgressMeters: null,
    progressJumpSamples: 0,
    wrongWaySamples: 0,
    outsideSamples: 0,
    arrivalSamples: 0,
    arrivalFirstSampleAtMs: null,
  };
}

/** Clears consecutive sensor evidence after a pause without discarding confirmed route progress. */
export function prepareFormalNavigationTrackerForResume(
  tracker: FormalNavigationTracker,
): FormalNavigationTracker {
  return {
    ...tracker,
    previousAcceptedSample: null,
    routeMatch: tracker.routeMatch ? { ...tracker.routeMatch } : null,
    progressJumpSamples: 0,
    wrongWaySamples: 0,
    outsideSamples: 0,
    arrivalSamples: 0,
    arrivalFirstSampleAtMs: null,
  };
}

export function createFormalNavigationRuntime(
  plan: DirectedRoutePlan,
  now = new Date(),
): FormalNavigationRuntimeResult {
  const coordinates = coordinatesFromPlan(plan);
  const expiresAt = new Date(plan.expiresAt).getTime();
  if (
    Number.isNaN(now.getTime())
    || !coordinates
    || typeof plan.routeFingerprint !== "string"
    || !/^drp1-[0-9a-f]{8}$/.test(plan.routeFingerprint)
    || typeof plan.networkRevision !== "string"
    || !Number.isSafeInteger(plan.operationalVersion)
    || !Number.isFinite(plan.distanceMeters)
    || plan.distanceMeters <= 0
    || !Number.isFinite(plan.estimatedMinutes)
    || plan.estimatedMinutes <= 0
    || !Number.isFinite(expiresAt)
  ) {
    return { ok: false, code: "PLAN_INVALID", message: "正式路线结构无效，不能开始导航。" };
  }
  if (expiresAt <= now.getTime()) {
    return { ok: false, code: "PLAN_EXPIRED", message: "正式路线已过期，必须刷新运营状态后重新规划。" };
  }
  return {
    ok: true,
    runtime: {
      schemaVersion: 1,
      routeFingerprint: plan.routeFingerprint,
      networkRevision: plan.networkRevision,
      operationalVersion: plan.operationalVersion,
      planExpiresAt: plan.expiresAt,
      status: "READY",
      guidanceQuality: "WAITING",
      progressRatio: 0,
      remainingDistanceMeters: plan.distanceMeters,
      remainingMinutes: plan.estimatedMinutes,
      lateralDistanceMeters: null,
      maneuver: null,
      lastProcessedAt: null,
      message: "路线已就绪，开始后才会请求前台连续定位。",
    },
    tracker: emptyTracker(),
  };
}

export function transitionFormalNavigation(
  runtime: FormalNavigationRuntime,
  event: FormalNavigationTransition,
  now = new Date(),
): FormalNavigationRuntime {
  if (Number.isNaN(now.getTime())) return runtime;
  if (new Date(runtime.planExpiresAt).getTime() <= now.getTime() && !["COMPLETED", "CANCELLED"].includes(runtime.status)) {
    return { ...runtime, status: "REROUTE_REQUIRED", guidanceQuality: "STALE", maneuver: null, message: "路线或运营状态已过期，必须重新规划。" };
  }
  if (event.type === "ROUTE_VERSION_CHANGED") {
    if (event.networkRevision === runtime.networkRevision && event.operationalVersion === runtime.operationalVersion) return runtime;
    return { ...runtime, status: "REROUTE_REQUIRED", guidanceQuality: "STALE", maneuver: null, message: "路网或运营版本已变化，旧指令已停止。" };
  }
  if (event.type === "OPERATIONAL_STATE_UNAVAILABLE" && !["COMPLETED", "CANCELLED"].includes(runtime.status)) {
    return {
      ...runtime,
      status: "REROUTE_REQUIRED",
      guidanceQuality: "STALE",
      maneuver: null,
      message: event.message,
    };
  }
  if (event.type === "SENSOR_UNAVAILABLE" && runtime.status === "ACTIVE") {
    return {
      ...runtime,
      status: "PAUSED",
      guidanceQuality: "INVALID",
      maneuver: null,
      message: event.message,
    };
  }
  if (event.type === "START" && runtime.status === "READY") {
    return { ...runtime, status: "ACTIVE", guidanceQuality: "WAITING", message: "正在等待可靠的前台定位样本。" };
  }
  if (event.type === "PAUSE" && runtime.status === "ACTIVE") {
    return { ...runtime, status: "PAUSED", guidanceQuality: "PAUSED", maneuver: null, message: "导航已暂停，连续定位应立即停止。" };
  }
  if (event.type === "RESUME" && runtime.status === "PAUSED") {
    return { ...runtime, status: "ACTIVE", guidanceQuality: "WAITING", maneuver: null, message: "导航已恢复，正在等待新的可靠定位。" };
  }
  if (event.type === "CANCEL" && !["COMPLETED", "CANCELLED"].includes(runtime.status)) {
    return { ...runtime, status: "CANCELLED", guidanceQuality: "PAUSED", maneuver: null, message: "本次导航已退出，连续定位应立即停止。" };
  }
  return runtime;
}

function rejectedLocation(
  runtime: FormalNavigationRuntime,
  quality: FormalGuidanceQuality,
  message: string,
  nowMs: number,
) {
  return {
    ...runtime,
    guidanceQuality: quality,
    maneuver: null,
    lateralDistanceMeters: null,
    lastProcessedAt: new Date(nowMs).toISOString(),
    message,
  };
}

export function advanceFormalNavigation(
  plan: DirectedRoutePlan,
  runtime: FormalNavigationRuntime,
  tracker: FormalNavigationTracker,
  sample: FormalNavigationLocationSample,
  nowMs = Date.now(),
): { runtime: FormalNavigationRuntime; tracker: FormalNavigationTracker } {
  if (runtime.status !== "ACTIVE") return { runtime, tracker };
  if (new Date(runtime.planExpiresAt).getTime() <= nowMs) {
    return {
      runtime: { ...runtime, status: "REROUTE_REQUIRED", guidanceQuality: "STALE", maneuver: null, message: "路线已过期，旧指令已停止。" },
      tracker: emptyTracker(),
    };
  }
  if (
    !Number.isFinite(sample.latitude)
    || !Number.isFinite(sample.longitude)
    || sample.latitude < -90
    || sample.latitude > 90
    || sample.longitude < -180
    || sample.longitude > 180
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters <= 0
    || !Number.isFinite(sample.capturedAtMs)
  ) {
    return { runtime: rejectedLocation(runtime, "INVALID", "定位样本无效，方向指令已暂停。", nowMs), tracker };
  }
  if (nowMs - sample.capturedAtMs > FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS || sample.capturedAtMs > nowMs + 1_000) {
    return { runtime: rejectedLocation(runtime, "STALE", "定位样本过期或来自未来，方向指令已暂停。", nowMs), tracker };
  }
  if (sample.accuracyMeters > FORMAL_NAVIGATION_MAX_ACCURACY_METERS) {
    return { runtime: rejectedLocation(runtime, "LOW_ACCURACY", "定位精度不足，方向指令已暂停。", nowMs), tracker };
  }
  if (tracker.previousAcceptedSample) {
    const elapsedSeconds = (sample.capturedAtMs - tracker.previousAcceptedSample.capturedAtMs) / 1_000;
    const traveled = distanceMeters(sample, tracker.previousAcceptedSample);
    if (elapsedSeconds <= 0 || traveled / elapsedSeconds > FORMAL_NAVIGATION_MAX_SPEED_METERS_PER_SECOND) {
      return { runtime: rejectedLocation(runtime, "JUMP", "检测到定位跳点，方向指令已暂停。", nowMs), tracker };
    }
  }

  const coordinates = coordinatesFromPlan(plan);
  const projectionMatch = coordinates ? projectToRoute(sample, coordinates, tracker) : { type: "INVALID" as const };
  if (!coordinates || projectionMatch.type === "INVALID") {
    return {
      runtime: { ...runtime, status: "REROUTE_REQUIRED", guidanceQuality: "INVALID", maneuver: null, message: "路线几何已失效，必须重新规划。" },
      tracker: emptyTracker(),
    };
  }
  if (projectionMatch.type === "PROGRESS_JUMP") {
    const progressJumpSamples = Math.min(
      FORMAL_NAVIGATION_REQUIRED_PROGRESS_JUMP_SAMPLES,
      tracker.progressJumpSamples + 1,
    );
    // The sensor fix passed validity, freshness, accuracy and speed gates. Keep it
    // only as the latest ephemeral fix so a confirmed branch jump can replan from
    // the current area; do not advance the old route progress from this sample.
    const nextTracker = {
      ...tracker,
      previousAcceptedSample: { ...sample },
      progressJumpSamples,
    };
    if (progressJumpSamples >= FORMAL_NAVIGATION_REQUIRED_PROGRESS_JUMP_SAMPLES) {
      return {
        runtime: {
          ...runtime,
          status: "REROUTE_REQUIRED",
          guidanceQuality: "OFF_ROUTE",
          lateralDistanceMeters: projectionMatch.nearestProjection.lateralDistanceMeters,
          maneuver: null,
          lastProcessedAt: new Date(sample.capturedAtMs).toISOString(),
          message: "已连续检测到路线进度不连续，旧指令已停止并需要重新规划。",
        },
        tracker: nextTracker,
      };
    }
    return {
      runtime: rejectedLocation(runtime, "JUMP", "定位落在路线的远端分支，正在连续复核，方向指令已暂停。", nowMs),
      tracker: nextTracker,
    };
  }
  const projection = projectionMatch.projection;

  const definitelyOutside = projection.lateralDistanceMeters - sample.accuracyMeters > FORMAL_NAVIGATION_OUTSIDE_CORRIDOR_METERS;
  const definitelyInside = projection.lateralDistanceMeters + sample.accuracyMeters < FORMAL_NAVIGATION_RECOVERY_CORRIDOR_METERS;
  const outsideSamples = definitelyOutside
    ? Math.min(FORMAL_NAVIGATION_REQUIRED_OUTSIDE_SAMPLES, tracker.outsideSamples + 1)
    : definitelyInside ? 0 : tracker.outsideSamples;
  const furthestRouteProgressMeters = Math.max(
    tracker.furthestRouteProgressMeters ?? projection.traveledGeometryMeters,
    projection.traveledGeometryMeters,
  );
  const backwardProgressMeters = furthestRouteProgressMeters - projection.traveledGeometryMeters;
  const wrongWayEvidence = definitelyInside
    && backwardProgressMeters - sample.accuracyMeters >= FORMAL_NAVIGATION_WRONG_WAY_DISTANCE_METERS;
  const wrongWayRecovered = backwardProgressMeters <= FORMAL_NAVIGATION_WRONG_WAY_RECOVERY_METERS;
  const wrongWaySamples = wrongWayEvidence
    ? Math.min(FORMAL_NAVIGATION_REQUIRED_WRONG_WAY_SAMPLES, tracker.wrongWaySamples + 1)
    : wrongWayRecovered ? 0 : tracker.wrongWaySamples;
  const nextTracker: FormalNavigationTracker = {
    ...tracker,
    previousAcceptedSample: { ...sample },
    routeProgressMeters: projection.traveledGeometryMeters,
    routeGeometryMeters: projection.totalGeometryMeters,
    routeMatch: {
      segmentIndex: projection.segmentIndex,
      segmentFraction: projection.segmentFraction,
    },
    furthestRouteProgressMeters,
    progressJumpSamples: 0,
    wrongWaySamples,
    outsideSamples,
  };
  if (outsideSamples >= FORMAL_NAVIGATION_REQUIRED_OUTSIDE_SAMPLES) {
    return {
      runtime: {
        ...runtime,
        status: "REROUTE_REQUIRED",
        guidanceQuality: "OFF_ROUTE",
        lateralDistanceMeters: projection.lateralDistanceMeters,
        maneuver: null,
        lastProcessedAt: new Date(sample.capturedAtMs).toISOString(),
        message: "已连续确认偏离正式路线，旧指令已停止并需要重新规划。",
      },
      tracker: nextTracker,
    };
  }

  const geometryProgressRatio = Math.min(1, Math.max(0, projection.traveledGeometryMeters / projection.totalGeometryMeters));
  const remainingDistanceMeters = remainingDistanceForProjection(plan, projection, geometryProgressRatio);
  const progressRatio = Math.min(1, Math.max(0, 1 - remainingDistanceMeters / plan.distanceMeters));
  const remainingMinutes = remainingMinutesForProjection(plan, projection, geometryProgressRatio);
  const arrivalQualifies = (
    remainingDistanceMeters <= FORMAL_NAVIGATION_ARRIVAL_RADIUS_METERS
    && projection.lateralDistanceMeters + sample.accuracyMeters <= FORMAL_NAVIGATION_OUTSIDE_CORRIDOR_METERS
  );
  if (arrivalQualifies) {
    nextTracker.arrivalSamples += 1;
    nextTracker.arrivalFirstSampleAtMs ??= sample.capturedAtMs;
  } else {
    nextTracker.arrivalSamples = 0;
    nextTracker.arrivalFirstSampleAtMs = null;
  }
  const arrived = (
    nextTracker.arrivalSamples >= FORMAL_NAVIGATION_REQUIRED_ARRIVAL_SAMPLES
    && nextTracker.arrivalFirstSampleAtMs !== null
    && sample.capturedAtMs - nextTracker.arrivalFirstSampleAtMs >= FORMAL_NAVIGATION_REQUIRED_ARRIVAL_DWELL_MS
  );
  const routeManeuver = maneuverForProjection(plan, projection, coordinates, remainingDistanceMeters);
  const wrongWay = wrongWaySamples >= FORMAL_NAVIGATION_REQUIRED_WRONG_WAY_SAMPLES;
  const maneuver: FormalNavigationManeuver = wrongWay ? {
    kind: "U_TURN",
    instruction: "已连续确认沿路线反向行走，请在安全位置掉头并返回当前路线。",
    distanceToManeuverMeters: 0,
    headingDegrees: routeManeuver.headingDegrees,
  } : routeManeuver;
  return {
    runtime: {
      ...runtime,
      status: arrived ? "COMPLETED" : "ACTIVE",
      guidanceQuality: arrived ? "ARRIVED" : wrongWay ? "WRONG_WAY" : "RELIABLE",
      progressRatio,
      remainingDistanceMeters,
      remainingMinutes,
      lateralDistanceMeters: projection.lateralDistanceMeters,
      maneuver: arrived ? { ...maneuver, kind: "ARRIVE", instruction: "已连续确认接近终点，请核对现场标识。" } : maneuver,
      lastProcessedAt: new Date(sample.capturedAtMs).toISOString(),
      message: arrived ? "导航已完成，连续定位应立即停止。" : maneuver.instruction,
    },
    tracker: nextTracker,
  };
}
