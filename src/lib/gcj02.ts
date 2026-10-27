import type { AmapCoordinate } from "./amap-types";

const PI = Math.PI;
const SEMI_MAJOR_AXIS = 6_378_245;
const ECCENTRICITY_SQUARED = 0.006693421622965943;

function outsideChina([longitude, latitude]: AmapCoordinate) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(longitude: number, latitude: number) {
  let value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude ** 2 + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  value += (20 * Math.sin(latitude * PI) + 40 * Math.sin(latitude / 3 * PI)) * 2 / 3;
  value += (160 * Math.sin(latitude / 12 * PI) + 320 * Math.sin(latitude * PI / 30)) * 2 / 3;
  return value;
}

function transformLongitude(longitude: number, latitude: number) {
  let value = 300 + longitude + 2 * latitude + 0.1 * longitude ** 2 + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  value += (20 * Math.sin(longitude * PI) + 40 * Math.sin(longitude / 3 * PI)) * 2 / 3;
  value += (150 * Math.sin(longitude / 12 * PI) + 300 * Math.sin(longitude / 30 * PI)) * 2 / 3;
  return value;
}

export function wgs84ToGcj02(coordinate: AmapCoordinate): AmapCoordinate {
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || outsideChina(coordinate)) return coordinate;
  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35);
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35);
  const radians = latitude / 180 * PI;
  let magic = Math.sin(radians);
  magic = 1 - ECCENTRICITY_SQUARED * magic ** 2;
  const squareRoot = Math.sqrt(magic);
  latitudeDelta = latitudeDelta * 180 / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * squareRoot) * PI);
  longitudeDelta = longitudeDelta * 180 / (SEMI_MAJOR_AXIS / squareRoot * Math.cos(radians) * PI);
  return [longitude + longitudeDelta, latitude + latitudeDelta];
}

export function gcj02ToWgs84(coordinate: AmapCoordinate): AmapCoordinate {
  const [gcjLon, gcjLat] = coordinate;
  if (!Number.isFinite(gcjLon) || !Number.isFinite(gcjLat) || outsideChina(coordinate)) return coordinate;
  const [wgsLonApprox, wgsLatApprox] = wgs84ToGcj02(coordinate);
  const dLon = wgsLonApprox - gcjLon;
  const dLat = wgsLatApprox - gcjLat;
  return [gcjLon - dLon, gcjLat - dLat];
}

