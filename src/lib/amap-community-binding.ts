import type { AmapAlongRoutePoi } from "./amap-along-route";
import { scenicSpots } from "./scenic-data";

export type AmapCommunityBinding = {
  placeId: string;
  placeName: string;
  distanceMeters: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/[\s·•・]/g, "").toLocaleLowerCase("zh-CN");
}

function distanceMeters(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const latitude1 = left[1] * radians;
  const latitude2 = right[1] * radians;
  const deltaLatitude = (right[1] - left[1]) * radians;
  const deltaLongitude = (right[0] - left[0]) * radians;
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function matchAmapPoiCommunity(poi: AmapAlongRoutePoi): AmapCommunityBinding | null {
  const normalized = normalizeName(poi.name);
  const coordinate = poi.entranceCoordinate ?? poi.coordinate;
  const matches = scenicSpots
    .filter((spot) => spot.id !== "zangfo-valley" && normalizeName(spot.name) === normalized)
    .map((spot) => ({ spot, distanceMeters: distanceMeters(coordinate, spot.originalGcj02) }))
    .filter(({ distanceMeters: distance }) => distance <= 750)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  if (matches.length !== 1) return null;
  return {
    placeId: matches[0].spot.id,
    placeName: matches[0].spot.name,
    distanceMeters: matches[0].distanceMeters,
  };
}
