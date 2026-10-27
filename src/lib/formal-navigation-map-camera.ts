import type { FeatureCollection, LineString } from "geojson";
import type { FormalGuidanceQuality } from "@/lib/formal-navigation-runtime";

export type FormalNavigationCameraMode = "FOLLOWING" | "BROWSING" | "OVERVIEW";

export type FormalNavigationCameraAction =
  | "USER_GESTURE"
  | "SHOW_REMAINING"
  | "RECENTER"
  | "ROUTE_CHANGED";

type CameraPosition = {
  longitude: number;
  latitude: number;
};

function finiteCoordinate(coordinate: unknown): coordinate is [number, number] {
  return (
    Array.isArray(coordinate)
    && coordinate.length === 2
    && Number.isFinite(coordinate[0])
    && Number.isFinite(coordinate[1])
    && coordinate[0] >= -180
    && coordinate[0] <= 180
    && coordinate[1] >= -90
    && coordinate[1] <= 90
  );
}

function finitePosition(position: CameraPosition | null): position is CameraPosition {
  return Boolean(position && finiteCoordinate([position.longitude, position.latitude]));
}

export function transitionFormalNavigationCamera(
  current: FormalNavigationCameraMode,
  action: FormalNavigationCameraAction,
): FormalNavigationCameraMode {
  if (action === "USER_GESTURE") return "BROWSING";
  if (action === "SHOW_REMAINING") return "OVERVIEW";
  if (action === "RECENTER" || action === "ROUTE_CHANGED") return "FOLLOWING";
  return current;
}

export function shouldAutoFollowFormalNavigationPosition(
  mode: FormalNavigationCameraMode,
  guidanceQuality: FormalGuidanceQuality,
  position: CameraPosition | null,
) {
  return (
    mode === "FOLLOWING"
    && (guidanceQuality === "RELIABLE" || guidanceQuality === "ARRIVED")
    && finitePosition(position)
  );
}

export function formalNavigationRemainingOverviewCoordinates(
  remainingRoute: FeatureCollection<LineString>,
  fallbackRouteCoordinates: Array<[number, number]>,
) {
  const remainingCoordinates = remainingRoute.features.flatMap((feature) => (
    feature.geometry.type === "LineString"
      ? feature.geometry.coordinates.filter(finiteCoordinate)
      : []
  ));
  if (remainingCoordinates.length > 0) return remainingCoordinates;
  const fallbackCoordinates = fallbackRouteCoordinates.filter(finiteCoordinate);
  const destination = fallbackCoordinates.at(-1);
  return destination ? [destination] : [];
}
