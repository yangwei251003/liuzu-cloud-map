export const GROUP_LOCATION_MAX_ACCURACY_METERS = 50;
export const GROUP_LOCATION_MAX_SAMPLE_AGE_MS = 15_000;
export const GROUP_LOCATION_SNAPSHOT_TTL_MS = 120_000;
export const GROUP_LOCATION_MAX_SESSION_MINUTES = 480;

export type GroupLocationUpdate = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export type GroupLocationShareAction =
  | { action: "START"; expiresInMinutes: number; consentRevision: number }
  | { action: "STOP"; reason: "USER_STOPPED" };

export type GroupMemberLocation = GroupLocationUpdate & {
  accountId: string;
  displayName: string;
  expiresAt: string;
};

export type RelativeGroupMemberLocation = GroupMemberLocation & {
  distanceMeters: number;
  direction: "北" | "东北" | "东" | "东南" | "南" | "西南" | "西" | "西北";
  bearingDegrees: number;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(new Date(value).getTime());
}

export function parseGroupLocationShareAction(value: unknown): GroupLocationShareAction | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;
  if (
    value.action === "START"
    && exactKeys(value, ["action", "expiresInMinutes", "consentRevision"])
    && Number.isSafeInteger(value.expiresInMinutes)
    && Number(value.expiresInMinutes) >= 15
    && Number(value.expiresInMinutes) <= GROUP_LOCATION_MAX_SESSION_MINUTES
    && Number.isSafeInteger(value.consentRevision)
    && Number(value.consentRevision) >= 1
  ) {
    return {
      action: "START",
      expiresInMinutes: Number(value.expiresInMinutes),
      consentRevision: Number(value.consentRevision),
    };
  }
  if (
    value.action === "STOP"
    && exactKeys(value, ["action", "reason"])
    && value.reason === "USER_STOPPED"
  ) return { action: "STOP", reason: "USER_STOPPED" };
  return null;
}

export function parseFreshGroupLocationUpdate(value: unknown, now = new Date()): GroupLocationUpdate | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["longitude", "latitude", "accuracyMeters", "capturedAt"])
    || !isCoordinate(value.longitude, -180, 180)
    || !isCoordinate(value.latitude, -90, 90)
    || typeof value.accuracyMeters !== "number"
    || !Number.isFinite(value.accuracyMeters)
    || value.accuracyMeters <= 0
    || value.accuracyMeters > GROUP_LOCATION_MAX_ACCURACY_METERS
    || !isIsoInstant(value.capturedAt)
  ) return null;
  const nowMs = now.getTime();
  const capturedAtMs = new Date(value.capturedAt).getTime();
  if (!Number.isFinite(nowMs) || capturedAtMs > nowMs + 1_000 || nowMs - capturedAtMs > GROUP_LOCATION_MAX_SAMPLE_AGE_MS) return null;
  return {
    longitude: value.longitude,
    latitude: value.latitude,
    accuracyMeters: value.accuracyMeters,
    capturedAt: value.capturedAt,
  };
}

function bearingDegrees(from: GroupLocationUpdate, to: GroupLocationUpdate) {
  const latitude1 = from.latitude * Math.PI / 180;
  const latitude2 = to.latitude * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function distanceMeters(from: GroupLocationUpdate, to: GroupLocationUpdate) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const latitude1 = from.latitude * Math.PI / 180;
  const latitude2 = to.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function cardinalDirection(bearing: number): RelativeGroupMemberLocation["direction"] {
  const directions: RelativeGroupMemberLocation["direction"][] = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(bearing / 45) % directions.length];
}

export function relativeGroupMemberLocation(
  viewer: GroupLocationUpdate,
  member: GroupMemberLocation,
  now = new Date(),
): RelativeGroupMemberLocation | null {
  const viewerSample = parseFreshGroupLocationUpdate(viewer, now);
  const memberSample = parseFreshGroupLocationUpdate({
    longitude: member.longitude,
    latitude: member.latitude,
    accuracyMeters: member.accuracyMeters,
    capturedAt: member.capturedAt,
  }, now);
  const expiresAtMs = new Date(member.expiresAt).getTime();
  if (!viewerSample || !memberSample || !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return null;
  const bearing = bearingDegrees(viewerSample, memberSample);
  return {
    ...member,
    distanceMeters: distanceMeters(viewerSample, memberSample),
    direction: cardinalDirection(bearing),
    bearingDegrees: bearing,
  };
}
