import type { Feature, FeatureCollection, LineString } from "geojson";
import type { DirectedRoutePlan } from "./directed-route-engine";
import type { FormalNavigationRouteMatch } from "./formal-navigation-runtime";

type RoutePartProperties = { routePart: "COMPLETED" | "REMAINING" };
type TransportProperties = { traversalMode: "CABLEWAY" | "SHUTTLE"; serviceName: string };

export type FormalNavigationRouteDisplay = {
  matchApplied: boolean;
  matchedCoordinate: [number, number] | null;
  completedRoute: FeatureCollection<LineString, RoutePartProperties>;
  remainingRoute: FeatureCollection<LineString, RoutePartProperties>;
  remainingTransportRoute: FeatureCollection<LineString, TransportProperties>;
};

const emptyLineCollection = <TProperties>(): FeatureCollection<LineString, TProperties> => ({
  type: "FeatureCollection",
  features: [],
});

function finiteCoordinate(coordinate: unknown): coordinate is [number, number] {
  return Array.isArray(coordinate)
    && coordinate.length === 2
    && Number.isFinite(coordinate[0])
    && coordinate[0] >= -180
    && coordinate[0] <= 180
    && Number.isFinite(coordinate[1])
    && coordinate[1] >= -90
    && coordinate[1] <= 90;
}

function sameCoordinate(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) <= 1e-12 && Math.abs(left[1] - right[1]) <= 1e-12;
}

function appendDistinct(coordinates: Array<[number, number]>, coordinate: [number, number]) {
  if (!coordinates.at(-1) || !sameCoordinate(coordinates.at(-1)!, coordinate)) coordinates.push(coordinate);
}

function lineFeature<TProperties>(
  coordinates: Array<[number, number]>,
  properties: TProperties,
): Feature<LineString, TProperties> | null {
  if (coordinates.length < 2) return null;
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

function fullRouteCollection(
  coordinates: Array<[number, number]>,
): FeatureCollection<LineString, RoutePartProperties> {
  const feature = lineFeature<RoutePartProperties>(
    coordinates.map((coordinate) => [...coordinate]),
    { routePart: "REMAINING" },
  );
  return { type: "FeatureCollection", features: feature ? [feature] : [] };
}

function allTransportRoutes(plan: Pick<DirectedRoutePlan, "traversals">) {
  const collection = emptyLineCollection<TransportProperties>();
  plan.traversals.forEach((traversal) => {
    if (traversal.kind !== "EDGE" || (traversal.traversalMode !== "CABLEWAY" && traversal.traversalMode !== "SHUTTLE")) return;
    const coordinates = traversal.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(finiteCoordinate)) return;
    const feature = lineFeature(coordinates.map((coordinate) => [...coordinate]), {
      traversalMode: traversal.traversalMode,
      serviceName: traversal.transportService?.serviceName ?? "",
    });
    if (feature) collection.features.push(feature);
  });
  return collection;
}

function validMatch(match: FormalNavigationRouteMatch | null, coordinateCount: number) {
  return Boolean(
    match
    && Number.isSafeInteger(match.segmentIndex)
    && match.segmentIndex >= 0
    && match.segmentIndex < coordinateCount - 1
    && Number.isFinite(match.segmentFraction)
    && match.segmentFraction >= 0
    && match.segmentFraction <= 1,
  );
}

export function buildFormalNavigationRouteDisplay(
  plan: Pick<DirectedRoutePlan, "geometry" | "traversals">,
  match: FormalNavigationRouteMatch | null,
): FormalNavigationRouteDisplay {
  const coordinates = plan.geometry?.coordinates;
  const invalidGeometry = !Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every(finiteCoordinate);
  if (invalidGeometry) {
    return {
      matchApplied: false,
      matchedCoordinate: null,
      completedRoute: emptyLineCollection<RoutePartProperties>(),
      remainingRoute: emptyLineCollection<RoutePartProperties>(),
      remainingTransportRoute: emptyLineCollection<TransportProperties>(),
    };
  }

  const safeCoordinates = coordinates as Array<[number, number]>;
  if (!validMatch(match, safeCoordinates.length) || !match) {
    return {
      matchApplied: false,
      matchedCoordinate: null,
      completedRoute: emptyLineCollection<RoutePartProperties>(),
      remainingRoute: fullRouteCollection(safeCoordinates),
      remainingTransportRoute: allTransportRoutes(plan),
    };
  }

  const segmentStart = safeCoordinates[match.segmentIndex];
  const segmentEnd = safeCoordinates[match.segmentIndex + 1];
  const matchedCoordinate: [number, number] = [
    segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * match.segmentFraction,
    segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * match.segmentFraction,
  ];
  const completedCoordinates = safeCoordinates.slice(0, match.segmentIndex + 1).map((coordinate) => [...coordinate] as [number, number]);
  appendDistinct(completedCoordinates, matchedCoordinate);
  const remainingCoordinates: Array<[number, number]> = [matchedCoordinate];
  safeCoordinates.slice(match.segmentIndex + 1).forEach((coordinate) => appendDistinct(remainingCoordinates, [...coordinate]));
  const completedFeature = lineFeature<RoutePartProperties>(completedCoordinates, { routePart: "COMPLETED" });
  const remainingFeature = lineFeature<RoutePartProperties>(remainingCoordinates, { routePart: "REMAINING" });

  const edgeSegmentCount = plan.traversals.reduce((total, traversal) => (
    traversal.kind === "EDGE" ? total + Math.max(0, traversal.geometry.coordinates.length - 1) : total
  ), 0);
  const topologyAligned = edgeSegmentCount === safeCoordinates.length - 1;
  // When traversal segment counts drift from the route geometry, omit the
  // progress-sensitive overlay instead of presenting a passed service as remaining.
  const remainingTransportRoute = emptyLineCollection<TransportProperties>();
  if (topologyAligned) {
    let globalSegmentIndex = 0;
    plan.traversals.forEach((traversal) => {
      if (traversal.kind !== "EDGE") return;
      const traversalSegmentCount = Math.max(0, traversal.geometry.coordinates.length - 1);
      const startSegmentIndex = globalSegmentIndex;
      const endSegmentIndex = globalSegmentIndex + traversalSegmentCount;
      globalSegmentIndex = endSegmentIndex;
      if (traversal.traversalMode !== "CABLEWAY" && traversal.traversalMode !== "SHUTTLE") return;
      if (match.segmentIndex >= endSegmentIndex) return;
      let transportCoordinates = traversal.geometry.coordinates.map((coordinate) => [...coordinate] as [number, number]);
      if (match.segmentIndex >= startSegmentIndex) {
        const localSegmentIndex = match.segmentIndex - startSegmentIndex;
        transportCoordinates = [matchedCoordinate];
        traversal.geometry.coordinates.slice(localSegmentIndex + 1)
          .forEach((coordinate) => appendDistinct(transportCoordinates, [...coordinate]));
      }
      const feature = lineFeature(transportCoordinates, {
        traversalMode: traversal.traversalMode,
        serviceName: traversal.transportService?.serviceName ?? "",
      });
      if (feature) remainingTransportRoute.features.push(feature);
    });
  }

  return {
    matchApplied: true,
    matchedCoordinate,
    completedRoute: { type: "FeatureCollection", features: completedFeature ? [completedFeature] : [] },
    remainingRoute: { type: "FeatureCollection", features: remainingFeature ? [remainingFeature] : [] },
    remainingTransportRoute,
  };
}
