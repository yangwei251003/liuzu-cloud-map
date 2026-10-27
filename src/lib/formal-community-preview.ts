export type FormalCommunityPreview = {
  placeId: string;
  placeName: string;
  windowHours: 24;
  postCount: number;
  photoCount: number;
  checkInCount: number;
  generatedAt: string;
  posts: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorDisplayName: string;
  }>;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};
const validIso = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const validCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000;
const validId = (value: unknown) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(value);

export function parseFormalCommunityPreview(value: unknown, expectedPlaceId: string, expectedScenicAreaId: string): FormalCommunityPreview | null {
  if (
    !validId(expectedPlaceId)
    || !validId(expectedScenicAreaId)
    || !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "posts", "nextCursor", "summary"])
    || value.schemaVersion !== 1
    || !Array.isArray(value.posts)
    || value.posts.length > 3
    || (value.nextCursor !== null && !validIso(value.nextCursor))
    || !isRecord(value.summary)
    || !exactKeys(value.summary, ["placeId", "placeName", "windowHours", "postCount", "photoCount", "checkInCount", "generatedAt"])
    || value.summary.placeId !== expectedPlaceId
    || typeof value.summary.placeName !== "string"
    || !value.summary.placeName.trim()
    || value.summary.placeName.length > 120
    || value.summary.windowHours !== 24
    || !validCount(value.summary.postCount)
    || !validCount(value.summary.photoCount)
    || !validCount(value.summary.checkInCount)
    || !validIso(value.summary.generatedAt)
  ) return null;
  const posts: FormalCommunityPreview["posts"] = [];
  for (const item of value.posts) {
    if (
      !isRecord(item)
      || !exactKeys(item, ["id", "body", "type", "createdAt", "author", "location", "stats"])
      || typeof item.id !== "string"
      || !/^[0-9a-f-]{36}$/i.test(item.id)
      || typeof item.body !== "string"
      || !item.body.trim()
      || item.body.length > 1_500
      || typeof item.type !== "string"
      || !validIso(item.createdAt)
      || !isRecord(item.author)
      || !exactKeys(item.author, ["handle", "displayName"])
      || typeof item.author.handle !== "string"
      || typeof item.author.displayName !== "string"
      || !item.author.displayName.trim()
      || !isRecord(item.location)
      || !exactKeys(item.location, ["scenicAreaId", "placeId", "placeName", "longitude", "latitude", "coordinateSystem", "precision"])
      || item.location.scenicAreaId !== expectedScenicAreaId
      || item.location.placeId !== expectedPlaceId
      || typeof item.location.placeName !== "string"
      || !item.location.placeName.trim()
      || typeof item.location.longitude !== "number"
      || !Number.isFinite(item.location.longitude)
      || item.location.longitude < -180
      || item.location.longitude > 180
      || typeof item.location.latitude !== "number"
      || !Number.isFinite(item.location.latitude)
      || item.location.latitude < -90
      || item.location.latitude > 90
      || item.location.coordinateSystem !== "WGS84"
      || item.location.precision !== "COMMUNITY_CENTROID"
      || !isRecord(item.stats)
      || !validCount(item.stats.likes)
      || !validCount(item.stats.comments)
    ) return null;
    posts.push({ id: item.id, body: item.body, createdAt: item.createdAt as string, authorDisplayName: item.author.displayName });
  }
  return {
    placeId: value.summary.placeId as string,
    placeName: value.summary.placeName,
    windowHours: 24,
    postCount: Number(value.summary.postCount),
    photoCount: Number(value.summary.photoCount),
    checkInCount: Number(value.summary.checkInCount),
    generatedAt: value.summary.generatedAt as string,
    posts,
  };
}
