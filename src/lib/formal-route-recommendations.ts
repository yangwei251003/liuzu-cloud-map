import type { DirectedRoutePlan } from "./directed-route-engine";
import type { RouteVisitInterest } from "./route-network";

export type FormalRecommendationNode = {
  id: string;
  type: "ENTRANCE_CONNECTOR" | "JUNCTION" | "DESTINATION" | "FACILITY" | "TRANSIT";
  coordinate: { longitude: number; latitude: number };
  displayName?: string;
  poiId?: string | null;
  visit?: {
    interestTags: RouteVisitInterest[];
    dwellMinutes: number;
    editorialPriority: number;
    familyFriendly: boolean;
    restArea: boolean;
    photoSpot: boolean;
    evidenceReference: string;
  };
};

export type FormalAlongRouteRecommendation = {
  nodeId: string;
  poiId: string;
  displayName: string;
  distanceAheadMeters: number;
  routeOffsetMeters: number;
  dwellMinutes: number;
  interestTags: RouteVisitInterest[];
  restArea: boolean;
  photoSpot: boolean;
  familyFriendly: boolean;
  evidenceReference: string;
};

type Projection = {
  alongMeters: number;
  offsetMeters: number;
  totalMeters: number;
};

const INTERESTS = new Set<RouteVisitInterest>(["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"]);

function coordinateValid(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function projectPoint(
  longitude: number,
  latitude: number,
  coordinates: Array<[number, number]>,
): Projection | null {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  const longitudeScale = Math.cos(latitude * Math.PI / 180) * 111_320;
  const latitudeScale = 111_320;
  const point = { x: longitude * longitudeScale, y: latitude * latitudeScale };
  const segmentLengths = coordinates.slice(1).map((coordinate, index) => {
    const start = coordinates[index];
    const meanLatitude = (start[1] + coordinate[1]) * Math.PI / 360;
    return Math.hypot(
      (coordinate[0] - start[0]) * Math.cos(meanLatitude) * 111_320,
      (coordinate[1] - start[1]) * 111_320,
    );
  });
  const totalMeters = segmentLengths.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return null;
  let best: Projection | null = null;
  let consumed = 0;
  coordinates.slice(0, -1).forEach((coordinate, index) => {
    const next = coordinates[index + 1];
    const start = { x: coordinate[0] * longitudeScale, y: coordinate[1] * latitudeScale };
    const end = { x: next[0] * longitudeScale, y: next[1] * latitudeScale };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared <= 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const projected = { x: start.x + dx * fraction, y: start.y + dy * fraction };
    const candidate = {
      alongMeters: consumed + segmentLengths[index] * fraction,
      offsetMeters: Math.hypot(point.x - projected.x, point.y - projected.y),
      totalMeters,
    };
    if (
      !best
      || candidate.offsetMeters < best.offsetMeters - 1e-6
      || (Math.abs(candidate.offsetMeters - best.offsetMeters) <= 1e-6 && candidate.alongMeters > best.alongMeters)
    ) best = candidate;
    consumed += segmentLengths[index];
  });
  return best;
}

function validVisit(node: FormalRecommendationNode) {
  const visit = node.visit;
  return Boolean(
    visit
    && Array.isArray(visit.interestTags)
    && visit.interestTags.length > 0
    && visit.interestTags.length <= INTERESTS.size
    && visit.interestTags.every((interest) => INTERESTS.has(interest))
    && new Set(visit.interestTags).size === visit.interestTags.length
    && Number.isInteger(visit.dwellMinutes)
    && visit.dwellMinutes >= 5
    && visit.dwellMinutes <= 180
    && Number.isInteger(visit.editorialPriority)
    && visit.editorialPriority >= 0
    && visit.editorialPriority <= 100
    && typeof visit.familyFriendly === "boolean"
    && typeof visit.restArea === "boolean"
    && typeof visit.photoSpot === "boolean"
    && typeof visit.evidenceReference === "string"
    && visit.evidenceReference.trim()
  );
}

export function findFormalAlongRouteRecommendations(
  plan: DirectedRoutePlan,
  nodes: FormalRecommendationNode[],
  progressRatio: number,
  options: { corridorMeters?: number; maximum?: number; minimumAheadMeters?: number } = {},
): FormalAlongRouteRecommendation[] {
  const coordinates = plan?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every(coordinateValid)
    || !Array.isArray(nodes)
    || !Number.isFinite(progressRatio)
    || progressRatio < 0
    || progressRatio > 1
  ) return [];
  const corridorMeters = Math.min(250, Math.max(20, options.corridorMeters ?? 120));
  const maximum = Math.min(5, Math.max(1, Math.floor(options.maximum ?? 3)));
  const minimumAheadMeters = Math.min(500, Math.max(0, options.minimumAheadMeters ?? 25));
  const routeProjection = projectPoint(coordinates[0][0], coordinates[0][1], coordinates);
  if (!routeProjection) return [];
  const traversedNodeIds = new Set(plan.traversals.flatMap((traversal) => (
    [traversal.fromNodeId, traversal.toNodeId]
  )));
  if (traversedNodeIds.size === 0) return [];
  const currentAlongMeters = routeProjection.totalMeters * progressRatio;
  return nodes.flatMap((node): FormalAlongRouteRecommendation[] => {
    if (
      node.id === plan.originNodeId
      || node.id === plan.destinationNodeId
      || !traversedNodeIds.has(node.id)
      || (node.type !== "DESTINATION" && node.type !== "FACILITY")
      || typeof node.poiId !== "string"
      || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(node.poiId)
      || typeof node.displayName !== "string"
      || !node.displayName.trim()
      || !validVisit(node)
    ) return [];
    const projection = projectPoint(node.coordinate.longitude, node.coordinate.latitude, coordinates);
    if (!projection || projection.offsetMeters > corridorMeters) return [];
    const distanceAheadMeters = projection.alongMeters - currentAlongMeters;
    if (distanceAheadMeters < minimumAheadMeters) return [];
    return [{
      nodeId: node.id,
      poiId: node.poiId,
      displayName: node.displayName,
      distanceAheadMeters,
      routeOffsetMeters: projection.offsetMeters,
      dwellMinutes: node.visit!.dwellMinutes,
      interestTags: [...node.visit!.interestTags],
      restArea: node.visit!.restArea,
      photoSpot: node.visit!.photoSpot,
      familyFriendly: node.visit!.familyFriendly,
      evidenceReference: node.visit!.evidenceReference,
    }];
  }).sort((left, right) => (
    left.distanceAheadMeters - right.distanceAheadMeters
    || left.routeOffsetMeters - right.routeOffsetMeters
    || left.nodeId.localeCompare(right.nodeId)
  )).slice(0, maximum);
}
