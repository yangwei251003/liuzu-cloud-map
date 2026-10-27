import "server-only";

import { createHash } from "node:crypto";
import { readBoundedJson } from "./bounded-json";
import { getDatabase, isDatabaseConfigured } from "./database";
import { visitorIdentityFromRequest } from "./visitor-identity-http";
import { postgresVisitorIdentityRepository } from "./visitor-identity-repository";
import { isSocialPostType, isSocialVisibility, normalizeSocialText, normalizeTags } from "@/lib/social/domain";

const JSON_LIMIT_BYTES = 32_768;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const REACTION_TYPES = ["LIKE", "COLLECT", "WENT", "WANT_TO_GO", "ADD_TO_PLAN"] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function apiError(code: string, message: string, status: number, retryable = false) {
  return response({ error: { code, message, retryable } }, status);
}

function isAvailable() {
  return isDatabaseConfigured() && process.env.SOCIAL_API_ENABLED === "1";
}

function unavailable() {
  return apiError("SOCIAL_CAPABILITY_DISABLED", "公开社交服务尚未绑定真实数据库、对象存储与审核能力；本机原型仍可体验。", 503, true);
}

export function getSocialCapabilityStatus() {
  const enabled = isAvailable();
  return response({
    schemaVersion: 1,
    enabled,
    mode: enabled ? "REVIEWED_SERVICE" : "DEVICE_ONLY",
    requirements: {
      database: isDatabaseConfigured(),
      moderation: process.env.SOCIAL_API_ENABLED === "1",
      mediaUpload: Boolean(process.env.SOCIAL_MEDIA_UPLOAD_PROVIDER?.trim() && process.env.SOCIAL_MEDIA_PUBLIC_BASE_URL?.trim()),
    },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

function hashIdempotencyKey(value: string | null) {
  if (!value || value.length < 12 || value.length > 200) return null;
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function body(request: Request) {
  const parsed = await readBoundedJson(request, JSON_LIMIT_BYTES);
  return parsed.ok && isRecord(parsed.value) ? parsed.value : null;
}

async function identity(request: Request) {
  return visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function iso(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mediaAssetIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 9) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && UUID_PATTERN.test(item));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}

async function authenticatedWrite(request: Request) {
  if (!sameOrigin(request)) return { error: apiError("REQUEST_REJECTED", "请求无法处理。", 403) };
  if (!isAvailable()) return { error: unavailable() };
  try {
    const visitor = await identity(request);
    return visitor ? { visitor } : { error: apiError("AUTH_REQUIRED", "需要登录游客账号。", 401) };
  } catch {
    return { error: apiError("AUTH_UNAVAILABLE", "账号服务暂时不可用。", 503, true) };
  }
}

export async function listSocialCommunityPosts(request: Request, placeId: string) {
  if (!PLACE_PATTERN.test(placeId)) return apiError("COMMUNITY_NOT_FOUND", "没有找到地点社区。", 404);
  if (!isAvailable()) return unavailable();
  const url = new URL(request.url);
  const scenicAreaId = url.searchParams.get("scenicAreaId");
  if (!scenicAreaId || !PLACE_PATTERN.test(scenicAreaId)) return apiError("COMMUNITY_NOT_FOUND", "没有找到地点社区。", 404);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? 12) || 12));
  const cursor = iso(url.searchParams.get("cursor"));
  try {
    const sql = getDatabase();
    const [rows, summaryRows] = await Promise.all([sql<{
      id: string; body: string; post_type: string; created_at: Date | string;
      display_name: string; handle: string; place_name: string; place_id: string; scenic_area_id: string;
      longitude: number; latitude: number; like_count: number; comment_count: number;
    }[]>`
      SELECT post.id, post.body, post.post_type, post.created_at,
             profile.display_name, profile.handle, community.display_name AS place_name, community.place_id, community.scenic_area_id,
             ST_X(community.geometry_wgs84) AS longitude,
             ST_Y(community.geometry_wgs84) AS latitude,
             (SELECT count(*)::int FROM social_reactions reaction WHERE reaction.post_id = post.id AND reaction.reaction_type = 'LIKE') AS like_count,
             (SELECT count(*)::int FROM social_comments comment WHERE comment.post_id = post.id AND comment.moderation_state = 'APPROVED' AND comment.deleted_at IS NULL) AS comment_count
      FROM social_posts post
      INNER JOIN place_communities community ON community.id = post.community_id AND community.scenic_area_id = post.scenic_area_id
      INNER JOIN published_pois formal_poi
        ON formal_poi.id = community.published_poi_id
       AND formal_poi.scenic_area_id = community.scenic_area_id
       AND formal_poi.canonical_code = community.place_id
      INNER JOIN scenic_area_publications formal_publication
        ON formal_publication.id = formal_poi.publication_id
       AND formal_publication.scenic_area_id = formal_poi.scenic_area_id
      INNER JOIN social_profiles profile ON profile.account_id = post.author_account_id AND profile.scenic_area_id = post.scenic_area_id
      WHERE community.place_id = ${placeId}
        AND community.scenic_area_id = ${scenicAreaId}
        AND community.lifecycle_state = 'PUBLISHED'
        AND community.verification_state = 'VERIFIED'
        AND community.valid_until > CURRENT_TIMESTAMP
        AND formal_poi.verification_state = 'FIELD_VERIFIED'
        AND formal_poi.valid_until > CURRENT_TIMESTAMP
        AND formal_publication.lifecycle_state = 'PUBLISHED'
        AND formal_publication.published_at IS NOT NULL
        AND formal_publication.valid_until > CURRENT_TIMESTAMP
        AND post.visibility = 'PUBLIC'
        AND post.moderation_state = 'APPROVED'
        AND post.deleted_at IS NULL
        AND (${cursor}::timestamptz IS NULL OR post.created_at < ${cursor})
      ORDER BY post.created_at DESC, post.id DESC
      LIMIT ${limit}
    `, sql<{
      place_id: string; place_name: string; post_count_24h: number;
      photo_count_24h: number; check_in_count_24h: number;
    }[]>`
      SELECT community.place_id, community.display_name AS place_name,
             (SELECT count(*)::int
                FROM social_posts post
               WHERE post.scenic_area_id = community.scenic_area_id
                 AND post.community_id = community.id
                 AND post.visibility = 'PUBLIC'
                 AND post.moderation_state = 'APPROVED'
                 AND post.deleted_at IS NULL
                 AND post.created_at >= CURRENT_TIMESTAMP - interval '24 hours') AS post_count_24h,
             (SELECT count(*)::int
                FROM social_post_media link
                INNER JOIN social_posts post ON post.id = link.post_id AND post.scenic_area_id = link.scenic_area_id
                INNER JOIN social_media_assets asset ON asset.id = link.media_asset_id AND asset.scenic_area_id = link.scenic_area_id
               WHERE post.scenic_area_id = community.scenic_area_id
                 AND post.community_id = community.id
                 AND post.visibility = 'PUBLIC'
                 AND post.moderation_state = 'APPROVED'
                 AND post.deleted_at IS NULL
                 AND post.created_at >= CURRENT_TIMESTAMP - interval '24 hours'
                 AND asset.media_kind = 'IMAGE'
                 AND asset.processing_state = 'READY'
                 AND asset.moderation_state = 'APPROVED'
                 AND asset.deleted_at IS NULL) AS photo_count_24h,
             (SELECT count(*)::int
                FROM travel_check_ins item
               WHERE item.scenic_area_id = community.scenic_area_id
                 AND item.community_id = community.id
                 AND item.visibility = 'PUBLIC'
                 AND item.deleted_at IS NULL
                 AND item.visited_at >= CURRENT_TIMESTAMP - interval '24 hours') AS check_in_count_24h
        FROM place_communities community
        INNER JOIN published_pois formal_poi
          ON formal_poi.id = community.published_poi_id
         AND formal_poi.scenic_area_id = community.scenic_area_id
         AND formal_poi.canonical_code = community.place_id
        INNER JOIN scenic_area_publications formal_publication
          ON formal_publication.id = formal_poi.publication_id
         AND formal_publication.scenic_area_id = formal_poi.scenic_area_id
       WHERE community.place_id = ${placeId}
         AND community.scenic_area_id = ${scenicAreaId}
         AND community.lifecycle_state = 'PUBLISHED'
         AND community.verification_state = 'VERIFIED'
         AND community.valid_until > CURRENT_TIMESTAMP
         AND formal_poi.verification_state = 'FIELD_VERIFIED'
         AND formal_poi.valid_until > CURRENT_TIMESTAMP
         AND formal_publication.lifecycle_state = 'PUBLISHED'
         AND formal_publication.published_at IS NOT NULL
         AND formal_publication.valid_until > CURRENT_TIMESTAMP
       LIMIT 1
    `]);
    const summary = summaryRows[0];
    if (!summary) return apiError("COMMUNITY_NOT_FOUND", "没有找到当前有效且已核验的地点社区。", 404);
    const posts = rows.map((row) => ({
      id: row.id,
      body: row.body,
      type: row.post_type,
      createdAt: new Date(row.created_at).toISOString(),
      author: { handle: row.handle, displayName: row.display_name },
      location: { scenicAreaId: row.scenic_area_id, placeId: row.place_id, placeName: row.place_name, longitude: Number(row.longitude), latitude: Number(row.latitude), coordinateSystem: "WGS84", precision: "COMMUNITY_CENTROID" },
      stats: { likes: Number(row.like_count), comments: Number(row.comment_count) },
    }));
    return response({
      schemaVersion: 1,
      posts,
      nextCursor: posts.length === limit ? posts.at(-1)?.createdAt ?? null : null,
      summary: {
        placeId: summary.place_id,
        placeName: summary.place_name,
        windowHours: 24,
        postCount: Number(summary.post_count_24h),
        photoCount: Number(summary.photo_count_24h),
        checkInCount: Number(summary.check_in_count_24h),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch {
    return apiError("SOCIAL_UNAVAILABLE", "地点动态暂时不可用。", 503, true);
  }
}

export async function createSocialPost(request: Request, placeId: string) {
  if (!PLACE_PATTERN.test(placeId)) return apiError("COMMUNITY_NOT_FOUND", "没有找到地点社区。", 404);
  const auth = await authenticatedWrite(request);
  if ("error" in auth) return auth.error;
  const value = await body(request);
  const idempotencyKeyHash = hashIdempotencyKey(request.headers.get("idempotency-key"));
  if (!value || !idempotencyKeyHash) return apiError("INVALID_POST", "动态格式或幂等键不正确。", 400);
  const postBody = typeof value.body === "string" ? normalizeSocialText(value.body) : "";
  const type = value.type;
  const visibility = value.visibility;
  const location = isRecord(value.location) ? value.location : null;
  const longitude = location ? finiteCoordinate(location.longitude, -180, 180) : null;
  const latitude = location ? finiteCoordinate(location.latitude, -90, 90) : null;
  const accuracy = location && typeof location.accuracyMeters === "number" && Number.isFinite(location.accuracyMeters) && location.accuracyMeters >= 0 ? location.accuracyMeters : null;
  const capturedAt = location ? iso(location.capturedAt) : null;
  const occurredAt = iso(value.occurredAt) ?? new Date().toISOString();
  const tags = Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string") ? normalizeTags(value.tags as string[]) : [];
  const assets = mediaAssetIds(value.mediaAssetIds ?? []);
  if (!postBody || postBody.length > 1_500 || !isSocialPostType(type) || !isSocialVisibility(visibility) || longitude === null || latitude === null || !capturedAt || !assets) {
    return apiError("INVALID_POST", "动态必须包含有限文本、可见范围、设备位置和已完成上传的媒体引用。", 400);
  }
  try {
    const sql = getDatabase();
    const result = await sql.begin(async (transaction) => {
      const communities = await transaction<{ id: string }[]>`
        SELECT community.id
        FROM place_communities community
        INNER JOIN published_pois formal_poi
          ON formal_poi.id = community.published_poi_id
         AND formal_poi.scenic_area_id = community.scenic_area_id
         AND formal_poi.canonical_code = community.place_id
        INNER JOIN scenic_area_publications formal_publication
          ON formal_publication.id = formal_poi.publication_id
         AND formal_publication.scenic_area_id = formal_poi.scenic_area_id
        WHERE community.scenic_area_id = ${auth.visitor.scenicAreaId} AND community.place_id = ${placeId}
          AND community.lifecycle_state = 'PUBLISHED' AND community.verification_state = 'VERIFIED'
          AND community.valid_until > CURRENT_TIMESTAMP
          AND formal_poi.verification_state = 'FIELD_VERIFIED' AND formal_poi.valid_until > CURRENT_TIMESTAMP
          AND formal_publication.lifecycle_state = 'PUBLISHED' AND formal_publication.published_at IS NOT NULL
          AND formal_publication.valid_until > CURRENT_TIMESTAMP
          AND ST_DWithin(community.geometry_wgs84::geography, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, 5000)
        FOR SHARE
      `;
      const community = communities[0];
      if (!community) return { state: "LOCATION_REJECTED" as const };
      const media = assets.length ? await transaction<{ id: string }[]>`
        SELECT id FROM social_media_assets
        WHERE scenic_area_id = ${auth.visitor.scenicAreaId} AND owner_account_id = ${auth.visitor.accountId}
          AND id IN ${transaction(assets)} AND processing_state = 'READY' AND moderation_state = 'APPROVED' AND deleted_at IS NULL
        FOR SHARE
      ` : [];
      if (media.length !== assets.length) return { state: "MEDIA_REJECTED" as const };
      const inserted = await transaction<{ id: string; moderation_state: string; created_at: Date | string }[]>`
        INSERT INTO social_posts (
          scenic_area_id, community_id, author_account_id, post_type, visibility, body, geometry_wgs84,
          location_source, location_accuracy_meters, location_captured_at, occurred_at, moderation_state, idempotency_key_hash
        ) VALUES (
          ${auth.visitor.scenicAreaId}, ${community.id}, ${auth.visitor.accountId}, ${type}, ${visibility}, ${postBody},
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 'DEVICE_GPS', ${accuracy}, ${capturedAt}, ${occurredAt}, 'PENDING', ${idempotencyKeyHash}
        )
        ON CONFLICT (scenic_area_id, author_account_id, idempotency_key_hash) DO NOTHING
        RETURNING id, moderation_state, created_at
      `;
      const post = inserted[0];
      if (!post) return { state: "REPLAYED" as const };
      for (const [index, mediaAssetId] of assets.entries()) {
        await transaction`INSERT INTO social_post_media (scenic_area_id, post_id, media_asset_id, sequence, alt_text) VALUES (${auth.visitor.scenicAreaId}, ${post.id}, ${mediaAssetId}, ${index + 1}, ${`旅行照片 ${index + 1}`})`;
      }
      for (const tag of tags) await transaction`INSERT INTO social_post_tags (post_id, tag) VALUES (${post.id}, ${tag}) ON CONFLICT DO NOTHING`;
      return { state: "CREATED" as const, post };
    });
    if (result.state === "LOCATION_REJECTED") return apiError("LOCATION_REJECTED", "设备位置不在所选地点社区附近，无法发布现场动态。", 422);
    if (result.state === "MEDIA_REJECTED") return apiError("MEDIA_REJECTED", "媒体尚未完成处理与审核。", 422);
    if (result.state === "REPLAYED") return response({ schemaVersion: 1, state: "REPLAYED" }, 200);
    return response({ schemaVersion: 1, state: "CREATED", post: { id: result.post.id, moderationState: result.post.moderation_state, createdAt: new Date(result.post.created_at).toISOString() } }, 202);
  } catch {
    return apiError("SOCIAL_UNAVAILABLE", "动态暂时无法提交。", 503, true);
  }
}

export async function mutateSocialReaction(request: Request, postId: string) {
  if (!UUID_PATTERN.test(postId)) return apiError("POST_NOT_FOUND", "没有找到动态。", 404);
  const auth = await authenticatedWrite(request);
  if ("error" in auth) return auth.error;
  const value = await body(request);
  const reactionType = value?.reactionType;
  const active = value?.active;
  if (typeof reactionType !== "string" || !REACTION_TYPES.includes(reactionType as (typeof REACTION_TYPES)[number]) || typeof active !== "boolean") return apiError("INVALID_REACTION", "互动类型不正确。", 400);
  try {
    const sql = getDatabase();
    if (active) await sql`INSERT INTO social_reactions (scenic_area_id, post_id, actor_account_id, reaction_type) SELECT ${auth.visitor.scenicAreaId}, post.id, ${auth.visitor.accountId}, ${reactionType} FROM social_posts post WHERE post.id = ${postId} AND post.scenic_area_id = ${auth.visitor.scenicAreaId} AND post.deleted_at IS NULL ON CONFLICT DO NOTHING`;
    else await sql`DELETE FROM social_reactions WHERE scenic_area_id = ${auth.visitor.scenicAreaId} AND post_id = ${postId} AND actor_account_id = ${auth.visitor.accountId} AND reaction_type = ${reactionType}`;
    return response({ schemaVersion: 1, postId, reactionType, active });
  } catch { return apiError("SOCIAL_UNAVAILABLE", "互动暂时无法提交。", 503, true); }
}

export async function createSocialComment(request: Request, postId: string) {
  if (!UUID_PATTERN.test(postId)) return apiError("POST_NOT_FOUND", "没有找到动态。", 404);
  const auth = await authenticatedWrite(request);
  if ("error" in auth) return auth.error;
  const value = await body(request);
  const idempotencyKeyHash = hashIdempotencyKey(request.headers.get("idempotency-key"));
  const commentBody = typeof value?.body === "string" ? normalizeSocialText(value.body, 500) : "";
  if (!commentBody || !idempotencyKeyHash) return apiError("INVALID_COMMENT", "评论格式不正确。", 400);
  try {
    const sql = getDatabase();
    const rows = await sql<{ id: string; moderation_state: string; created_at: Date | string }[]>`
      INSERT INTO social_comments (scenic_area_id, post_id, author_account_id, body, moderation_state, idempotency_key_hash)
      SELECT ${auth.visitor.scenicAreaId}, post.id, ${auth.visitor.accountId}, ${commentBody}, 'PENDING', ${idempotencyKeyHash}
      FROM social_posts post WHERE post.id = ${postId} AND post.scenic_area_id = ${auth.visitor.scenicAreaId} AND post.deleted_at IS NULL
      ON CONFLICT (scenic_area_id, author_account_id, idempotency_key_hash) DO NOTHING
      RETURNING id, moderation_state, created_at
    `;
    const comment = rows[0];
    return comment ? response({ schemaVersion: 1, comment: { id: comment.id, moderationState: comment.moderation_state, createdAt: new Date(comment.created_at).toISOString() } }, 202) : response({ schemaVersion: 1, state: "REPLAYED" });
  } catch { return apiError("SOCIAL_UNAVAILABLE", "评论暂时无法提交。", 503, true); }
}

export async function createTravelCheckIn(request: Request) {
  const auth = await authenticatedWrite(request);
  if ("error" in auth) return auth.error;
  const value = await body(request);
  const idempotencyKeyHash = hashIdempotencyKey(request.headers.get("idempotency-key"));
  const placeId = typeof value?.placeId === "string" && PLACE_PATTERN.test(value.placeId) ? value.placeId : null;
  const visibility = value?.visibility;
  const location = isRecord(value?.location) ? value.location : null;
  const longitude = location ? finiteCoordinate(location.longitude, -180, 180) : null;
  const latitude = location ? finiteCoordinate(location.latitude, -90, 90) : null;
  const visitedAt = iso(value?.visitedAt);
  const note = typeof value?.note === "string" ? normalizeSocialText(value.note, 500) : "";
  if (!idempotencyKeyHash || !placeId || !isSocialVisibility(visibility) || longitude === null || latitude === null || !visitedAt) return apiError("INVALID_CHECK_IN", "打卡必须包含地点、设备位置、旅行时间与可见范围。", 400);
  try {
    const sql = getDatabase();
    const rows = await sql<{ id: string; created_at: Date | string }[]>`
      INSERT INTO travel_check_ins (
        scenic_area_id, community_id, account_id, visited_at, note, visibility, precise_geometry_wgs84,
        public_geometry_wgs84, location_source, idempotency_key_hash
      )
      SELECT ${auth.visitor.scenicAreaId}, community.id, ${auth.visitor.accountId}, ${visitedAt}, ${note}, ${visibility},
             ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
             CASE WHEN ${visibility} = 'PRIVATE' THEN NULL ELSE ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 0.01) END,
             'DEVICE_GPS', ${idempotencyKeyHash}
      FROM place_communities community
      INNER JOIN published_pois formal_poi
        ON formal_poi.id = community.published_poi_id
       AND formal_poi.scenic_area_id = community.scenic_area_id
       AND formal_poi.canonical_code = community.place_id
      INNER JOIN scenic_area_publications formal_publication
        ON formal_publication.id = formal_poi.publication_id
       AND formal_publication.scenic_area_id = formal_poi.scenic_area_id
      WHERE community.scenic_area_id = ${auth.visitor.scenicAreaId} AND community.place_id = ${placeId}
        AND community.lifecycle_state = 'PUBLISHED' AND community.verification_state = 'VERIFIED'
        AND community.valid_until > CURRENT_TIMESTAMP
        AND formal_poi.verification_state = 'FIELD_VERIFIED' AND formal_poi.valid_until > CURRENT_TIMESTAMP
        AND formal_publication.lifecycle_state = 'PUBLISHED' AND formal_publication.published_at IS NOT NULL
        AND formal_publication.valid_until > CURRENT_TIMESTAMP
        AND ST_DWithin(community.geometry_wgs84::geography, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, 5000)
      ON CONFLICT (scenic_area_id, account_id, idempotency_key_hash) DO NOTHING
      RETURNING id, created_at
    `;
    const checkIn = rows[0];
    return checkIn ? response({ schemaVersion: 1, checkIn: { id: checkIn.id, createdAt: new Date(checkIn.created_at).toISOString() } }, 201) : apiError("CHECK_IN_REJECTED", "地点距离过远、社区不可用或请求已处理。", 422);
  } catch { return apiError("SOCIAL_UNAVAILABLE", "打卡暂时无法保存。", 503, true); }
}

export async function getSocialProfile(handle: string) {
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(handle)) return apiError("PROFILE_NOT_FOUND", "没有找到旅行档案。", 404);
  if (!isAvailable()) return unavailable();
  try {
    const sql = getDatabase();
    const rows = await sql<{ handle: string; display_name: string; bio: string; check_in_count: number; post_count: number; photo_count: number }[]>`
      SELECT profile.handle, profile.display_name, profile.bio,
             (SELECT count(*)::int FROM travel_check_ins item WHERE item.scenic_area_id = profile.scenic_area_id AND item.account_id = profile.account_id AND item.visibility = 'PUBLIC' AND item.deleted_at IS NULL) AS check_in_count,
             (SELECT count(*)::int FROM social_posts post WHERE post.scenic_area_id = profile.scenic_area_id AND post.author_account_id = profile.account_id AND post.visibility = 'PUBLIC' AND post.moderation_state = 'APPROVED' AND post.deleted_at IS NULL) AS post_count,
             (SELECT count(*)::int FROM social_post_media media INNER JOIN social_posts post ON post.id = media.post_id WHERE post.scenic_area_id = profile.scenic_area_id AND post.author_account_id = profile.account_id AND post.visibility = 'PUBLIC' AND post.moderation_state = 'APPROVED' AND post.deleted_at IS NULL) AS photo_count
      FROM social_profiles profile WHERE profile.handle = ${handle} AND profile.profile_visibility = 'PUBLIC' AND profile.moderation_state = 'ACTIVE' LIMIT 1
    `;
    const profile = rows[0];
    return profile ? response({ schemaVersion: 1, profile: { handle: profile.handle, displayName: profile.display_name, bio: profile.bio, stats: { checkIns: Number(profile.check_in_count), posts: Number(profile.post_count), photos: Number(profile.photo_count) } } }) : apiError("PROFILE_NOT_FOUND", "没有找到公开旅行档案。", 404);
  } catch { return apiError("SOCIAL_UNAVAILABLE", "旅行档案暂时不可用。", 503, true); }
}

export function getSocialUploadPolicy() {
  const configured = isAvailable() && Boolean(process.env.SOCIAL_MEDIA_UPLOAD_PROVIDER?.trim() && process.env.SOCIAL_MEDIA_PUBLIC_BASE_URL?.trim());
  return response({ schemaVersion: 1, enabled: configured, limits: { imagesPerPost: 9, imageBytes: 12_582_912, videoBytes: 104_857_600 }, acceptedImageTypes: ["image/jpeg", "image/png", "image/webp"], processing: ["virus-scan", "metadata-strip", "responsive-webp", "moderation"], message: configured ? "媒体上传能力已配置。" : "对象存储与 CDN 尚未配置；当前只开放本机图片原型。" }, configured ? 200 : 503);
}
