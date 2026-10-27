export type AmapNavigationMode = "walk" | "car";

export type AmapNavigationDestination = {
  name: string;
  coordinate: [number, number];
  entranceCoordinate: [number, number] | null;
};

function isUsableChinaCoordinate(value: [number, number]) {
  const [longitude, latitude] = value;
  return Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= 73
    && longitude <= 136
    && latitude >= 3
    && latitude <= 54;
}

/** Build the official AMap URI handoff without reading browser or server secrets. */
export function buildAmapExternalNavigationUrl(
  destination: AmapNavigationDestination,
  mode: AmapNavigationMode,
) {
  const name = destination.name.trim();
  const coordinate = destination.entranceCoordinate ?? destination.coordinate;
  if (!name || name.length > 120 || !isUsableChinaCoordinate(coordinate)) return null;
  const [longitude, latitude] = coordinate;
  const url = new URL("https://uri.amap.com/navigation");
  url.searchParams.set("to", `${longitude.toFixed(6)},${latitude.toFixed(6)},${name}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("src", "liuzu-cloud-tour");
  url.searchParams.set("callnative", "1");
  return url.toString();
}
