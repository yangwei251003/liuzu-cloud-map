import { scenicSpots } from "@/lib/scenic-data";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import type { PlaceCommunity, SocialPost } from "./types";

export const SOCIAL_COMMUNITIES: PlaceCommunity[] = scenicSpots.map((spot, index) => ({
  id: `community-${spot.id}`,
  placeId: spot.id,
  name: `${spot.name}游客社区`,
  subtitle: spot.subtitle,
  longitude: spot.longitude,
  latitude: spot.latitude,
  coordinateSystem: "WGS84",
  verification: "CANDIDATE_PLACE",
  collectedAt: "2026-08-14",
  demoPostCount: [3, 2, 1, 2, 1][index] ?? 0,
}));

export function getSocialCommunity(placeId: string) {
  return SOCIAL_COMMUNITIES.find((community) => community.placeId === placeId) ?? SOCIAL_COMMUNITIES[0];
}

function demoLocation(placeId: string, capturedAt: string) {
  const community = getSocialCommunity(placeId);
  return {
    scenicAreaId: "liuzu-town" as const,
    placeId: community.placeId,
    placeName: community.name.replace("游客社区", ""),
    longitude: community.longitude,
    latitude: community.latitude,
    coordinateSystem: "WGS84" as const,
    source: "DEMO_FIXTURE" as const,
    accuracyMeters: null,
    verification: "DEMO_FIXTURE" as const,
    capturedAt,
  };
}

function mediaFor(placeId: ScenicSpotId) {
  const selection = getScenicSpotImage(placeId, { allowContextual: true });
  if (!selection) return [];
  return [{
    id: `demo-media-${selection.asset.id}`,
    src: selection.asset.src,
    alt: selection.asset.alt,
    kind: "IMAGE" as const,
    relation: selection.relation === "EXACT_SPOT" ? "EXACT_SPOT" as const : "REGIONAL_CONTEXT" as const,
    disclosure: selection.disclosure,
  }];
}

export const DEMO_SOCIAL_POSTS: SocialPost[] = [
  {
    id: "demo-post-guoen-01",
    authorHandle: "demo_walker",
    authorName: "云游客",
    authorInitial: "云",
    body: "示例攻略：到达后先核对现场告示与开放安排，再决定参观顺序。此内容仅用于验证社区信息流，不代表当前现场状态。",
    type: "GUIDE",
    visibility: "PUBLIC",
    location: demoLocation("guoen-temple", "2026-08-15T02:10:00.000Z"),
    media: mediaFor("guoen-temple"),
    tags: ["行前准备", "旅行提醒"],
    createdAt: "2026-08-15T02:10:00.000Z",
    likeCount: 8,
    commentCount: 1,
    likedByMe: false,
    comments: [{ id: "demo-comment-01", authorHandle: "demo_reader", authorName: "慢游者", body: "我会把现场提示放在行程第一步。", createdAt: "2026-08-15T02:22:00.000Z", sourceKind: "DEMO_FIXTURE" }],
    sourceKind: "DEMO_FIXTURE",
  },
  {
    id: "demo-post-residence-01",
    authorHandle: "demo_notebook",
    authorName: "旅行手记",
    authorInitial: "记",
    body: "示例游记：把文化背景、个人感受和未经核验的传说分开记录，阅读起来更清楚。此条不陈述景点事实。",
    type: "TRAVEL_NOTE",
    visibility: "PUBLIC",
    location: demoLocation("huineng-residence", "2026-08-14T09:30:00.000Z"),
    media: mediaFor("huineng-residence"),
    tags: ["旅行手记", "慢游记录"],
    createdAt: "2026-08-14T09:30:00.000Z",
    likeCount: 5,
    commentCount: 0,
    likedByMe: false,
    comments: [],
    sourceKind: "DEMO_FIXTURE",
  },
  {
    id: "demo-post-spring-01",
    authorHandle: "demo_slowtrip",
    authorName: "慢慢走",
    authorInitial: "慢",
    body: "示例记录：旅行档案可以保留到访时间、照片与同行人，但精确位置默认只在本机可见。",
    type: "TRAVEL_NOTE",
    visibility: "PUBLIC",
    location: demoLocation("longshan-spring", "2026-08-13T07:45:00.000Z"),
    media: mediaFor("longshan-spring"),
    tags: ["隐私优先", "轻装出发"],
    createdAt: "2026-08-13T07:45:00.000Z",
    likeCount: 3,
    commentCount: 0,
    likedByMe: false,
    comments: [],
    sourceKind: "DEMO_FIXTURE",
  },
];

export const PROTOTYPE_PROFILE = {
  handle: "local_traveler",
  name: "本机旅行者",
  bio: "把走过的地方，慢慢连成自己的旅行地图。",
  cityCount: 1,
  guideCount: 0,
} as const;
