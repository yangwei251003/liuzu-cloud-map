"use client";

import { DEMO_SOCIAL_POSTS, getSocialCommunity, PROTOTYPE_PROFILE } from "./catalog";
import { normalizeTags, validateCommentBody, validateDeviceLocation, validatePostBody } from "./domain";
import type { CreateCheckInInput, PublishPostInput, SocialCheckIn, SocialPost } from "./types";

const POSTS_KEY = "liuzu-social-posts-v1";
const CHECK_INS_KEY = "liuzu-social-check-ins-v1";
const EVENT_NAME = "liuzu-cloud-tour:social-store-change";

let cachedPostsSignature: string | null = null;
let cachedPostsSnapshot: SocialPost[] = [];
let cachedCheckInsSignature: string | null = null;
let cachedCheckInsSnapshot: SocialCheckIn[] = [];

function parseList<T>(raw: string | null): T[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  return parseList<T>(window.localStorage.getItem(key));
}

function writeList<T>(key: string, values: T[]) {
  window.localStorage.setItem(key, JSON.stringify(values));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeSocialStore(listener: () => void) {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}

export function readPrototypePosts() {
  if (typeof window === "undefined") return DEMO_SOCIAL_POSTS;
  const localRaw = window.localStorage.getItem(POSTS_KEY);
  const overlayRaw = window.localStorage.getItem(`${POSTS_KEY}:demo-overlays`);
  const signature = `${localRaw ?? ""}\u0000${overlayRaw ?? ""}`;
  if (signature === cachedPostsSignature) return cachedPostsSnapshot;
  const overlays = new Map(parseList<SocialPost>(overlayRaw).map((post) => [post.id, post]));
  cachedPostsSignature = signature;
  cachedPostsSnapshot = [...parseList<SocialPost>(localRaw), ...DEMO_SOCIAL_POSTS.map((post) => overlays.get(post.id) ?? post)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return cachedPostsSnapshot;
}

export function readPrototypeCheckIns() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CHECK_INS_KEY);
  const signature = raw ?? "";
  if (signature === cachedCheckInsSignature) return cachedCheckInsSnapshot;
  cachedCheckInsSignature = signature;
  cachedCheckInsSnapshot = parseList<SocialCheckIn>(raw)
    .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime());
  return cachedCheckInsSnapshot;
}

export function publishPrototypePost(input: PublishPostInput) {
  const validatedBody = validatePostBody(input.body);
  if (!validatedBody.ok) return validatedBody;
  const community = getSocialCommunity(input.placeId);
  const location = validateDeviceLocation(input.position, community);
  if (!location.ok) return location;
  const createdAt = new Date().toISOString();
  const post: SocialPost = {
    id: crypto.randomUUID(),
    authorHandle: PROTOTYPE_PROFILE.handle,
    authorName: PROTOTYPE_PROFILE.name,
    authorInitial: PROTOTYPE_PROFILE.name.slice(0, 1),
    body: validatedBody.body,
    type: input.type,
    visibility: input.visibility,
    location: {
      scenicAreaId: "liuzu-town",
      placeId: community.placeId,
      placeName: community.name.replace("游客社区", ""),
      longitude: location.longitude,
      latitude: location.latitude,
      coordinateSystem: "WGS84",
      source: "DEVICE_GPS",
      accuracyMeters: Number.isFinite(input.position.coords.accuracy) ? Math.round(input.position.coords.accuracy) : null,
      verification: "USER_SUPPLIED",
      capturedAt: new Date(input.position.timestamp).toISOString(),
    },
    media: input.media.slice(0, 4),
    tags: normalizeTags(input.tags),
    createdAt,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    comments: [],
    sourceKind: "LOCAL_PROTOTYPE",
  };
  const localPosts = readList<SocialPost>(POSTS_KEY);
  try {
    writeList(POSTS_KEY, [post, ...localPosts].slice(0, 30));
  } catch {
    return { ok: false as const, error: "本机存储空间不足，请减少图片数量或清理旧动态。" };
  }
  return { ok: true as const, post };
}

export function togglePrototypeLike(postId: string) {
  const localPosts = readList<SocialPost>(POSTS_KEY);
  const local = localPosts.find((post) => post.id === postId);
  if (local) {
    local.likedByMe = !local.likedByMe;
    local.likeCount = Math.max(0, local.likeCount + (local.likedByMe ? 1 : -1));
    writeList(POSTS_KEY, [...localPosts]);
    return;
  }
  const overlays = readList<SocialPost>(`${POSTS_KEY}:demo-overlays`);
  const seeded = DEMO_SOCIAL_POSTS.find((post) => post.id === postId);
  if (!seeded) return;
  const current = overlays.find((post) => post.id === postId) ?? structuredClone(seeded);
  current.likedByMe = !current.likedByMe;
  current.likeCount = Math.max(0, current.likeCount + (current.likedByMe ? 1 : -1));
  writeList(`${POSTS_KEY}:demo-overlays`, [current, ...overlays.filter((post) => post.id !== postId)]);
}

export function readPostWithOverlays(post: SocialPost) {
  return post;
}

export function addPrototypeComment(postId: string, value: string) {
  const validated = validateCommentBody(value);
  if (!validated.ok) return validated;
  const localPosts = readList<SocialPost>(POSTS_KEY);
  let post = localPosts.find((candidate) => candidate.id === postId);
  let key = POSTS_KEY;
  let list = localPosts;
  if (!post) {
    key = `${POSTS_KEY}:demo-overlays`;
    list = readList<SocialPost>(key);
    post = list.find((candidate) => candidate.id === postId) ?? structuredClone(DEMO_SOCIAL_POSTS.find((candidate) => candidate.id === postId));
  }
  if (!post) return { ok: false as const, error: "这条动态已不存在。" };
  post.comments.push({ id: crypto.randomUUID(), authorHandle: PROTOTYPE_PROFILE.handle, authorName: PROTOTYPE_PROFILE.name, body: validated.body, createdAt: new Date().toISOString(), sourceKind: "LOCAL_PROTOTYPE" });
  post.commentCount = post.comments.length;
  writeList(key, [post, ...list.filter((candidate) => candidate.id !== postId)]);
  return { ok: true as const };
}

export function createPrototypeCheckIn(input: CreateCheckInInput) {
  const community = getSocialCommunity(input.placeId);
  const location = validateDeviceLocation(input.position, community);
  if (!location.ok) return location;
  const checkIn: SocialCheckIn = {
    id: crypto.randomUUID(),
    placeId: community.placeId,
    placeName: community.name.replace("游客社区", ""),
    visitedAt: new Date(input.visitedAt).toISOString(),
    note: input.note.trim().slice(0, 500),
    companionNames: input.companionNames.map((name) => name.trim()).filter(Boolean).slice(0, 12),
    photoSrc: input.photoSrc,
    longitude: location.longitude,
    latitude: location.latitude,
    locationSource: "DEVICE_GPS",
    visibility: input.visibility,
    createdAt: new Date().toISOString(),
  };
  const current = readList<SocialCheckIn>(CHECK_INS_KEY);
  try {
    writeList(CHECK_INS_KEY, [checkIn, ...current].slice(0, 50));
  } catch {
    return { ok: false as const, error: "本机存储空间不足，无法保存这次打卡。" };
  }
  return { ok: true as const, checkIn };
}

export async function compressSocialImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("只支持图片文件。 ");
  if (file.size > 12 * 1024 * 1024) throw new Error("单张图片不能超过 12MB。 ");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1_440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("图片处理能力不可用。 ");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.78);
}

export function requestDevicePosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("当前浏览器不支持定位。"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("未获得位置权限，动态与打卡不会在无位置的情况下发布。")), {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 30_000,
    });
  });
}
