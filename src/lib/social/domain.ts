import { SOCIAL_POST_TYPES, SOCIAL_VISIBILITIES, type PlaceCommunity } from "./types";

const MAX_LOCATION_DISTANCE_METERS = 5_000;
const MAX_POST_BODY_LENGTH = 1_500;
const MAX_COMMENT_LENGTH = 500;

export function isSocialPostType(value: unknown): value is (typeof SOCIAL_POST_TYPES)[number] {
  return typeof value === "string" && SOCIAL_POST_TYPES.includes(value as (typeof SOCIAL_POST_TYPES)[number]);
}

export function isSocialVisibility(value: unknown): value is (typeof SOCIAL_VISIBILITIES)[number] {
  return typeof value === "string" && SOCIAL_VISIBILITIES.includes(value as (typeof SOCIAL_VISIBILITIES)[number]);
}

export function normalizeSocialText(value: string, maximum = MAX_POST_BODY_LENGTH) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function normalizeTags(values: readonly string[]) {
  return [...new Set(values.map((value) => value.replace(/^#/, "").trim()).filter(Boolean))].slice(0, 6).map((value) => value.slice(0, 20));
}

export function validatePostBody(value: string) {
  const body = normalizeSocialText(value);
  if (!body) return { ok: false as const, error: "请写下这次旅行分享。" };
  if (body.length > MAX_POST_BODY_LENGTH) return { ok: false as const, error: `动态最多 ${MAX_POST_BODY_LENGTH} 个字符。` };
  return { ok: true as const, body };
}

export function validateCommentBody(value: string) {
  const body = normalizeSocialText(value, MAX_COMMENT_LENGTH);
  if (!body) return { ok: false as const, error: "评论不能为空。" };
  return { ok: true as const, body };
}

function radians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(a: { longitude: number; latitude: number }, b: { longitude: number; latitude: number }) {
  const radius = 6_371_000;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const startLatitude = radians(a.latitude);
  const endLatitude = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(haversine));
}

export function validateDeviceLocation(position: GeolocationPosition, community: PlaceCommunity) {
  const longitude = position.coords.longitude;
  const latitude = position.coords.latitude;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { ok: false as const, error: "浏览器没有返回有效位置。" };
  }
  const distance = distanceMeters({ longitude, latitude }, community);
  if (distance > MAX_LOCATION_DISTANCE_METERS) {
    return { ok: false as const, error: "当前位置距所选地点较远，无法绑定为现场动态。请到达附近后再试。", distance };
  }
  return { ok: true as const, longitude, latitude, distance };
}

export function relativeSocialTime(iso: string, now = Date.now()) {
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return "时间未知";
  const minutes = Math.max(0, Math.floor((now - value) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}
