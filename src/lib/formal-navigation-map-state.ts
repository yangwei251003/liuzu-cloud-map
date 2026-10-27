import type { Feature, Polygon } from "geojson";
import type { FormalGuidanceQuality } from "./formal-navigation-runtime";

export const FORMAL_NAVIGATION_MAX_DISPLAY_ACCURACY_METERS = 2_000;
const EARTH_RADIUS_METERS = 6_371_008.8;
const ACCURACY_CIRCLE_SEGMENTS = 48;

export type FormalNavigationMapQualityState = "RELIABLE" | "UNCERTAIN" | "STOPPED";

export type FormalNavigationMapPoint = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
};

export function formalNavigationMapQualityState(quality: FormalGuidanceQuality): FormalNavigationMapQualityState {
  if (quality === "RELIABLE" || quality === "ARRIVED") return "RELIABLE";
  if (quality === "WAITING" || quality === "LOW_ACCURACY") return "UNCERTAIN";
  return "STOPPED";
}

function validPoint(point: FormalNavigationMapPoint) {
  return Number.isFinite(point.longitude)
    && point.longitude >= -180
    && point.longitude <= 180
    && Number.isFinite(point.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && Number.isFinite(point.accuracyMeters)
    && point.accuracyMeters > 0
    && point.accuracyMeters <= FORMAL_NAVIGATION_MAX_DISPLAY_ACCURACY_METERS;
}

function destinationPoint(point: FormalNavigationMapPoint, bearingRadians: number): [number, number] {
  const angularDistance = point.accuracyMeters / EARTH_RADIUS_METERS;
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const targetLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
  );
  const normalizedLongitude = ((targetLongitude * 180 / Math.PI + 540) % 360) - 180;
  return [normalizedLongitude, targetLatitude * 180 / Math.PI];
}

/**
 * Builds a transient WGS84 uncertainty area from the browser-reported radius.
 * The result is display-only and must never be persisted or sent to the server.
 */
export function createFormalNavigationAccuracyArea(
  point: FormalNavigationMapPoint,
  quality: FormalGuidanceQuality,
): Feature<Polygon, { qualityState: FormalNavigationMapQualityState; reportedAccuracyMeters: number }> | null {
  if (!validPoint(point)) return null;
  const coordinates = Array.from({ length: ACCURACY_CIRCLE_SEGMENTS }, (_, index) =>
    destinationPoint(point, index / ACCURACY_CIRCLE_SEGMENTS * Math.PI * 2));
  coordinates.push([...coordinates[0]]);
  return {
    type: "Feature",
    properties: {
      qualityState: formalNavigationMapQualityState(quality),
      reportedAccuracyMeters: point.accuracyMeters,
    },
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}
