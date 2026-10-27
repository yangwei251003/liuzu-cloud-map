export const FACILITY_VERIFICATION = "OSM 公开数据候选 · 未经现场核验";

const facilityLabels = {
  toilets: "卫生间",
  parking: "停车点",
  hospital: "医疗设施",
  police: "警务设施",
  information: "信息服务点",
  shelter: "休息遮蔽点",
} as const;

type FacilitySubtype = keyof typeof facilityLabels;
type UnknownRecord = Record<string, unknown>;

export type AccessibleMapFacility = {
  id: string;
  name: string;
  typeLabel: string;
  subtype: FacilitySubtype;
  coordinates: [number, number];
  sourceUrl: string;
  verification: typeof FACILITY_VERIFICATION;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFacilitySubtype(value: unknown): value is FacilitySubtype {
  return typeof value === "string" && Object.hasOwn(facilityLabels, value);
}

function validCoordinates(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function validOsmUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.openstreetmap.org";
  } catch {
    return false;
  }
}

export function extractAccessibleFacilities(value: unknown): AccessibleMapFacility[] {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) return [];
  const facilities: AccessibleMapFacility[] = [];
  const seen = new Set<string>();

  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) continue;
    if (feature.geometry.type !== "Point" || !validCoordinates(feature.geometry.coordinates)) continue;
    const subtype = feature.properties.subtype;
    if (!isFacilitySubtype(subtype)) continue;
    const osmType = feature.properties.osm_type;
    const osmId = feature.properties.osm_id;
    if ((osmType !== "node" && osmType !== "way" && osmType !== "relation") || !(typeof osmId === "string" || typeof osmId === "number")) continue;
    const id = `osm-${osmType}-${String(osmId)}`;
    if (seen.has(id) || !validOsmUrl(feature.properties.source_url)) continue;
    seen.add(id);

    const rawName = typeof feature.properties.name === "string" ? feature.properties.name.trim() : "";
    const typeLabel = facilityLabels[subtype];
    facilities.push({
      id,
      name: rawName || `未命名${typeLabel}（OSM ${String(osmId)}）`,
      typeLabel,
      subtype,
      coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
      sourceUrl: feature.properties.source_url,
      verification: FACILITY_VERIFICATION,
    });
  }

  return facilities.sort((left, right) =>
    left.typeLabel.localeCompare(right.typeLabel, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"),
  );
}
