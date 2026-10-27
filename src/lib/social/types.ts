export const SOCIAL_POST_TYPES = ["TRAVEL_NOTE", "FOOD", "SCENERY", "GUIDE", "CAUTION", "LIVE_UPDATE"] as const;
export type SocialPostType = (typeof SOCIAL_POST_TYPES)[number];

export const SOCIAL_VISIBILITIES = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type SocialVisibility = (typeof SOCIAL_VISIBILITIES)[number];

export type SocialLocation = {
  scenicAreaId: "liuzu-town";
  placeId: string;
  placeName: string;
  longitude: number;
  latitude: number;
  coordinateSystem: "WGS84";
  source: "DEVICE_GPS" | "DEMO_FIXTURE";
  accuracyMeters: number | null;
  verification: "USER_SUPPLIED" | "DEMO_FIXTURE";
  capturedAt: string;
};

export type SocialMedia = {
  id: string;
  src: string;
  alt: string;
  kind: "IMAGE";
  relation: "USER_UPLOAD" | "EXACT_SPOT" | "REGIONAL_CONTEXT";
  disclosure: string | null;
};

export type SocialComment = {
  id: string;
  authorHandle: string;
  authorName: string;
  body: string;
  createdAt: string;
  sourceKind: "LOCAL_PROTOTYPE" | "DEMO_FIXTURE";
};

export type SocialPost = {
  id: string;
  authorHandle: string;
  authorName: string;
  authorInitial: string;
  body: string;
  type: SocialPostType;
  visibility: SocialVisibility;
  location: SocialLocation;
  media: SocialMedia[];
  tags: string[];
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments: SocialComment[];
  sourceKind: "LOCAL_PROTOTYPE" | "DEMO_FIXTURE";
};

export type PlaceCommunity = {
  id: string;
  placeId: string;
  name: string;
  subtitle: string;
  longitude: number;
  latitude: number;
  coordinateSystem: "WGS84";
  verification: "CANDIDATE_PLACE";
  collectedAt: "2026-08-14";
  demoPostCount: number;
};

export type SocialCheckIn = {
  id: string;
  placeId: string;
  placeName: string;
  visitedAt: string;
  note: string;
  companionNames: string[];
  photoSrc: string | null;
  longitude: number;
  latitude: number;
  locationSource: "DEVICE_GPS";
  visibility: SocialVisibility;
  createdAt: string;
};

export type PrototypeTravelProfile = {
  handle: string;
  name: string;
  bio: string;
  cityCount: number;
  guideCount: number;
};

export type PublishPostInput = {
  placeId: string;
  body: string;
  type: SocialPostType;
  visibility: SocialVisibility;
  tags: string[];
  media: SocialMedia[];
  position: GeolocationPosition;
};

export type CreateCheckInInput = {
  placeId: string;
  visitedAt: string;
  note: string;
  companionNames: string[];
  photoSrc: string | null;
  visibility: SocialVisibility;
  position: GeolocationPosition;
};
