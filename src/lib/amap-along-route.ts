import type { AmapCoordinate } from "@/lib/amap-types";

export type AmapAlongRoutePoi = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  category: string | null;
  coordinate: AmapCoordinate;
  entranceCoordinate: AmapCoordinate | null;
  exitCoordinate: AmapCoordinate | null;
};

export type AmapAlongRouteRecommendation = AmapAlongRoutePoi & {
  aheadMeters: number;
  distanceToRouteMeters: number;
  routeSegmentIndex: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function haversineMeters(a: AmapCoordinate, b: AmapCoordinate) {
  const radians = Math.PI / 180;
  const latitude1 = a[1] * radians;
  const latitude2 = b[1] * radians;
  const deltaLatitude = (b[1] - a[1]) * radians;
  const deltaLongitude = (b[0] - a[0]) * radians;
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function projectToSegment(point: AmapCoordinate, start: AmapCoordinate, end: AmapCoordinate) {
  const radians = Math.PI / 180;
  const referenceLatitude = ((point[1] + start[1] + end[1]) / 3) * radians;
  const scaleX = EARTH_RADIUS_METERS * Math.cos(referenceLatitude) * radians;
  const scaleY = EARTH_RADIUS_METERS * radians;
  const segmentX = (end[0] - start[0]) * scaleX;
  const segmentY = (end[1] - start[1]) * scaleY;
  const pointX = (point[0] - start[0]) * scaleX;
  const pointY = (point[1] - start[1]) * scaleY;
  const squaredLength = segmentX ** 2 + segmentY ** 2;
  const fraction = squaredLength > 0
    ? Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / squaredLength))
    : 0;
  const offsetX = pointX - segmentX * fraction;
  const offsetY = pointY - segmentY * fraction;
  return { distanceMeters: Math.hypot(offsetX, offsetY), fraction };
}

export function sampleAmapRouteCenters(route: AmapCoordinate[], maximum = 4) {
  if (route.length < 2 || maximum < 1) return [];
  const fractions = maximum === 1
    ? [0.6]
    : Array.from({ length: maximum }, (_, index) => 0.2 + (0.75 * index) / (maximum - 1));
  const unique = new Map<string, AmapCoordinate>();
  for (const fraction of fractions) {
    const coordinate = route[Math.min(route.length - 1, Math.max(1, Math.round((route.length - 1) * fraction)))];
    unique.set(`${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`, coordinate);
  }
  return [...unique.values()];
}

export function findAmapAlongRouteRecommendations({
  pois,
  route,
  currentRouteIndex,
  corridorMeters,
  excludedPoiId,
  limit = 4,
}: {
  pois: AmapAlongRoutePoi[];
  route: AmapCoordinate[];
  currentRouteIndex: number;
  corridorMeters: number;
  excludedPoiId?: string;
  limit?: number;
}) {
  if (route.length < 2 || corridorMeters <= 0 || limit < 1) return [];
  const cumulative = [0];
  for (let index = 1; index < route.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineMeters(route[index - 1], route[index]));
  }
  const currentIndex = Math.max(0, Math.min(route.length - 1, currentRouteIndex));
  const currentDistance = cumulative[currentIndex];
  const recommendations: AmapAlongRouteRecommendation[] = [];

  for (const poi of pois) {
    if (poi.id === excludedPoiId) continue;
    const coordinate = poi.entranceCoordinate ?? poi.coordinate;
    let nearest = { distanceMeters: Number.POSITIVE_INFINITY, fraction: 0, segmentIndex: -1 };
    for (let index = currentIndex; index < route.length - 1; index += 1) {
      const projected = projectToSegment(coordinate, route[index], route[index + 1]);
      if (projected.distanceMeters < nearest.distanceMeters) nearest = { ...projected, segmentIndex: index };
    }
    if (nearest.segmentIndex < 0 || nearest.distanceMeters > corridorMeters) continue;
    const segmentLength = cumulative[nearest.segmentIndex + 1] - cumulative[nearest.segmentIndex];
    const routeDistance = cumulative[nearest.segmentIndex] + segmentLength * nearest.fraction;
    const aheadMeters = routeDistance - currentDistance;
    if (aheadMeters < 40) continue;
    recommendations.push({
      ...poi,
      aheadMeters,
      distanceToRouteMeters: nearest.distanceMeters,
      routeSegmentIndex: nearest.segmentIndex,
    });
  }

  return recommendations
    .sort((left, right) => left.aheadMeters - right.aheadMeters || left.distanceToRouteMeters - right.distanceToRouteMeters)
    .slice(0, limit);
}
