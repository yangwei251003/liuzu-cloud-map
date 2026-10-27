import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  GROUP_LOCATION_SNAPSHOT_TTL_MS,
  parseFreshGroupLocationUpdate,
  parseGroupLocationShareAction,
} from "@/lib/group-location-sharing";
import { readBoundedJson } from "./bounded-json";
import { getDatabase, isDatabaseConfigured } from "./database";
import { visitorIdentityFromRequest } from "./visitor-identity-http";
import { postgresVisitorIdentityRepository } from "./visitor-identity-repository";

const BODY_LIMIT_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,100}$/;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

function unavailable() {
  return apiError("GROUP_LOCATION_DISABLED", "同行位置共享尚未绑定真实数据库、游客身份与显式功能开关。", 503, true);
}

function capabilityAvailable() {
  return isDatabaseConfigured()
    && process.env.SOCIAL_API_ENABLED === "1"
    && process.env.GROUP_LOCATION_SHARING_ENABLED === "1";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function idempotencyHash(request: Request) {
  const value = request.headers.get("idempotency-key");
  return value && value.length >= 12 && value.length <= 200 ? hash(value) : null;
}

async function readBody(request: Request) {
  const parsed = await readBoundedJson(request, BODY_LIMIT_BYTES);
  return parsed.ok && isRecord(parsed.value) ? parsed.value : null;
}

async function authenticated(request: Request, requireOrigin: boolean) {
  if (requireOrigin && !sameOrigin(request)) return { error: apiError("REQUEST_REJECTED", "请求无法处理。", 403) };
  if (!capabilityAvailable()) return { error: unavailable() };
  try {
    const visitor = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
    return visitor ? { visitor } : { error: apiError("AUTH_REQUIRED", "需要登录游客账号。", 401) };
  } catch {
    return { error: apiError("AUTH_UNAVAILABLE", "账号服务暂时不可用。", 503, true) };
  }
}

function validGroupId(value: string) {
  return UUID_PATTERN.test(value);
}

export async function createTemporaryTravelGroup(request: Request) {
  const auth = await authenticated(request, true);
  if ("error" in auth) return auth.error;
  const value = await readBody(request);
  const keyHash = idempotencyHash(request);
  if (
    !value
    || !exactKeys(value, ["name", "expiresInMinutes"])
    || typeof value.name !== "string"
    || value.name.trim().length < 1
    || value.name.trim().length > 80
    || !Number.isSafeInteger(value.expiresInMinutes)
    || Number(value.expiresInMinutes) < 30
    || Number(value.expiresInMinutes) > 480
    || !keyHash
  ) return apiError("GROUP_INPUT_INVALID", "小队名称、有效时长或幂等键不正确。", 400);
  const groupName = value.name.trim();
  const now = new Date();
  const endsAt = new Date(now.getTime() + Number(value.expiresInMinutes) * 60_000).toISOString();
  try {
    const sql = getDatabase();
    const result = await sql.begin(async (transaction) => {
      const inserted = await transaction<{ id: string; name: string; ends_at: Date | string }[]>`
        INSERT INTO travel_groups (
          scenic_area_id, owner_account_id, name, description, group_kind, visibility,
          lifecycle_state, starts_at, ends_at, idempotency_key_hash
        ) VALUES (
          ${auth.visitor.scenicAreaId}, ${auth.visitor.accountId}, ${groupName}, '',
          'TEMPORARY_TEAM', 'PRIVATE', 'ACTIVE', ${now.toISOString()}, ${endsAt}, ${keyHash}
        )
        ON CONFLICT (scenic_area_id, owner_account_id, idempotency_key_hash)
          WHERE idempotency_key_hash IS NOT NULL DO NOTHING
        RETURNING id, name, ends_at
      `;
      const created = inserted[0];
      if (!created) return { state: "REPLAYED" as const };
      await transaction`
        INSERT INTO travel_group_members (scenic_area_id, group_id, account_id, role, lifecycle_state, joined_at)
        VALUES (${auth.visitor.scenicAreaId}, ${created.id}, ${auth.visitor.accountId}, 'OWNER', 'ACTIVE', ${now.toISOString()})
      `;
      return { state: "CREATED" as const, created };
    });
    if (result.state === "REPLAYED") return response({ schemaVersion: 1, state: "REPLAYED" });
    return response({
      schemaVersion: 1,
      state: "CREATED",
      group: { id: result.created.id, name: result.created.name, expiresAt: new Date(result.created.ends_at).toISOString() },
    }, 201);
  } catch {
    return apiError("GROUP_UNAVAILABLE", "旅行小队暂时无法创建。", 503, true);
  }
}

export async function createTravelGroupInvite(request: Request, groupId: string) {
  if (!validGroupId(groupId)) return apiError("GROUP_NOT_FOUND", "没有找到旅行小队。", 404);
  const auth = await authenticated(request, true);
  if ("error" in auth) return auth.error;
  const value = await readBody(request);
  const keyHash = idempotencyHash(request);
  if (
    !value
    || !exactKeys(value, ["expiresInMinutes", "maxUses"])
    || !Number.isSafeInteger(value.expiresInMinutes)
    || Number(value.expiresInMinutes) < 15
    || Number(value.expiresInMinutes) > 1_440
    || !Number.isSafeInteger(value.maxUses)
    || Number(value.maxUses) < 1
    || Number(value.maxUses) > 20
    || !keyHash
  ) return apiError("INVITE_INPUT_INVALID", "邀请有效期、人数或幂等键不正确。", 400);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Number(value.expiresInMinutes) * 60_000).toISOString();
  try {
    const sql = getDatabase();
    const rows = await sql<{ id: string }[]>`
      INSERT INTO travel_group_invites (
        scenic_area_id, group_id, created_by_account_id, invite_token_hash,
        idempotency_key_hash, max_uses, expires_at
      )
      SELECT ${auth.visitor.scenicAreaId}, group_row.id, ${auth.visitor.accountId}, ${hash(token)},
             ${keyHash}, ${Number(value.maxUses)}, ${expiresAt}
      FROM travel_groups group_row
      INNER JOIN travel_group_members member
        ON member.group_id = group_row.id AND member.scenic_area_id = group_row.scenic_area_id
       AND member.account_id = ${auth.visitor.accountId}
       AND member.lifecycle_state = 'ACTIVE' AND member.role IN ('OWNER', 'ADMIN')
      WHERE group_row.id = ${groupId} AND group_row.scenic_area_id = ${auth.visitor.scenicAreaId}
        AND group_row.group_kind = 'TEMPORARY_TEAM' AND group_row.lifecycle_state = 'ACTIVE'
        AND (group_row.ends_at IS NULL OR group_row.ends_at > CURRENT_TIMESTAMP)
      ON CONFLICT (scenic_area_id, group_id, created_by_account_id, idempotency_key_hash) DO NOTHING
      RETURNING id
    `;
    if (!rows[0]) return response({ schemaVersion: 1, state: "REPLAYED_OR_NOT_AUTHORIZED" }, 409);
    return response({ schemaVersion: 1, invite: { token, expiresAt, maxUses: Number(value.maxUses) } }, 201);
  } catch {
    return apiError("INVITE_UNAVAILABLE", "小队邀请暂时无法创建。", 503, true);
  }
}

export async function acceptTravelGroupInvite(request: Request) {
  const auth = await authenticated(request, true);
  if ("error" in auth) return auth.error;
  const value = await readBody(request);
  if (!value || !exactKeys(value, ["token"]) || typeof value.token !== "string" || !TOKEN_PATTERN.test(value.token)) {
    return apiError("INVITE_INVALID", "邀请链接无效或已损坏。", 400);
  }
  const inviteTokenHash = hash(value.token);
  try {
    const sql = getDatabase();
    const result = await sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string; group_id: string; owner_account_id: string; max_uses: number; used_count: number }[]>`
        SELECT invite.id, invite.group_id, group_row.owner_account_id, invite.max_uses, invite.used_count
        FROM travel_group_invites invite
        INNER JOIN travel_groups group_row ON group_row.id = invite.group_id AND group_row.scenic_area_id = invite.scenic_area_id
        WHERE invite.scenic_area_id = ${auth.visitor.scenicAreaId}
          AND invite.invite_token_hash = ${inviteTokenHash}
          AND invite.revoked_at IS NULL AND invite.expires_at > CURRENT_TIMESTAMP
          AND invite.used_count < invite.max_uses
          AND group_row.lifecycle_state = 'ACTIVE' AND (group_row.ends_at IS NULL OR group_row.ends_at > CURRENT_TIMESTAMP)
        FOR UPDATE OF invite
      `;
      const invite = rows[0];
      if (!invite || invite.owner_account_id === auth.visitor.accountId) return { state: "REJECTED" as const };
      const members = await transaction<{ account_id: string }[]>`
        INSERT INTO travel_group_members (scenic_area_id, group_id, account_id, role, lifecycle_state, joined_at)
        VALUES (${auth.visitor.scenicAreaId}, ${invite.group_id}, ${auth.visitor.accountId}, 'MEMBER', 'ACTIVE', CURRENT_TIMESTAMP)
        ON CONFLICT (group_id, account_id) DO UPDATE
          SET lifecycle_state = 'ACTIVE', joined_at = CURRENT_TIMESTAMP
          WHERE travel_group_members.lifecycle_state IN ('INVITED', 'REQUESTED', 'LEFT', 'REMOVED')
        RETURNING account_id
      `;
      if (!members[0]) return { state: "REJECTED" as const };
      await transaction`
        UPDATE travel_group_invites
        SET used_count = used_count + 1,
            revoked_at = CASE WHEN used_count + 1 >= max_uses THEN CURRENT_TIMESTAMP ELSE revoked_at END
        WHERE id = ${invite.id}
      `;
      return { state: "ACCEPTED" as const, groupId: invite.group_id };
    });
    return result.state === "ACCEPTED"
      ? response({ schemaVersion: 1, state: "ACCEPTED", groupId: result.groupId })
      : apiError("INVITE_REJECTED", "邀请已过期、已用完或当前账号不能加入。", 410);
  } catch {
    return apiError("INVITE_UNAVAILABLE", "暂时无法加入旅行小队。", 503, true);
  }
}

export async function mutateGroupLocationShare(request: Request, groupId: string) {
  if (!validGroupId(groupId)) return apiError("GROUP_NOT_FOUND", "没有找到旅行小队。", 404);
  const auth = await authenticated(request, true);
  if ("error" in auth) return auth.error;
  const action = parseGroupLocationShareAction(await readBody(request));
  if (!action) return apiError("SHARE_ACTION_INVALID", "位置共享操作不正确。", 400);
  try {
    const sql = getDatabase();
    if (action.action === "STOP") {
      const result = await sql.begin(async (transaction) => {
        const rows = await transaction<{ id: string }[]>`
          UPDATE group_location_share_sessions session
          SET lifecycle_state = 'STOPPED', stopped_at = CURRENT_TIMESTAMP, stop_reason = ${action.reason}
          FROM travel_group_members member
          WHERE session.scenic_area_id = ${auth.visitor.scenicAreaId}
            AND session.group_id = ${groupId} AND session.account_id = ${auth.visitor.accountId}
            AND session.lifecycle_state = 'ACTIVE' AND session.stopped_at IS NULL
            AND member.scenic_area_id = session.scenic_area_id AND member.group_id = session.group_id
            AND member.account_id = session.account_id AND member.lifecycle_state = 'ACTIVE'
          RETURNING session.id
        `;
        const stopped = rows[0];
        if (!stopped) return null;
        await transaction`DELETE FROM group_member_location_snapshots WHERE scenic_area_id = ${auth.visitor.scenicAreaId} AND share_session_id = ${stopped.id}`;
        await transaction`
          INSERT INTO group_location_share_events (scenic_area_id, share_session_id, group_id, account_id, event_kind, reason_code)
          VALUES (${auth.visitor.scenicAreaId}, ${stopped.id}, ${groupId}, ${auth.visitor.accountId}, 'STOPPED', ${action.reason})
        `;
        return stopped;
      });
      return result
        ? response({ schemaVersion: 1, state: "STOPPED" })
        : apiError("SHARE_NOT_ACTIVE", "当前没有正在共享的位置。", 409);
    }

    const keyHash = idempotencyHash(request);
    if (!keyHash) return apiError("IDEMPOTENCY_REQUIRED", "开始共享需要有效幂等键。", 400);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + action.expiresInMinutes * 60_000).toISOString();
    const result = await sql.begin(async (transaction) => {
      await transaction`
        UPDATE group_location_share_sessions
        SET lifecycle_state = 'EXPIRED', stopped_at = CURRENT_TIMESTAMP, stop_reason = 'TTL_EXPIRED'
        WHERE scenic_area_id = ${auth.visitor.scenicAreaId} AND group_id = ${groupId}
          AND account_id = ${auth.visitor.accountId} AND lifecycle_state = 'ACTIVE'
          AND expires_at <= CURRENT_TIMESTAMP
      `;
      const active = await transaction<{ id: string; expires_at: Date | string }[]>`
        SELECT session.id, session.expires_at FROM group_location_share_sessions session
        WHERE session.scenic_area_id = ${auth.visitor.scenicAreaId} AND session.group_id = ${groupId}
          AND session.account_id = ${auth.visitor.accountId} AND session.lifecycle_state = 'ACTIVE'
          AND session.stopped_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `;
      if (active[0]) return { state: "ALREADY_ACTIVE" as const, id: active[0].id, expiresAt: new Date(active[0].expires_at).toISOString() };
      await transaction`
        DELETE FROM group_member_location_snapshots
        WHERE scenic_area_id = ${auth.visitor.scenicAreaId} AND group_id = ${groupId}
          AND account_id = ${auth.visitor.accountId}
      `;
      const rows = await transaction<{ id: string }[]>`
        INSERT INTO group_location_share_sessions (
          scenic_area_id, group_id, account_id, consent_revision, idempotency_key_hash,
          sharing_precision, lifecycle_state, started_at, expires_at
        )
        SELECT ${auth.visitor.scenicAreaId}, member.group_id, ${auth.visitor.accountId}, ${action.consentRevision},
               ${keyHash}, 'EXACT_TO_ACTIVE_MEMBERS', 'ACTIVE', ${now.toISOString()}, ${expiresAt}
        FROM travel_group_members member
        INNER JOIN travel_groups group_row ON group_row.id = member.group_id AND group_row.scenic_area_id = member.scenic_area_id
        WHERE member.scenic_area_id = ${auth.visitor.scenicAreaId} AND member.group_id = ${groupId}
          AND member.account_id = ${auth.visitor.accountId} AND member.lifecycle_state = 'ACTIVE'
          AND group_row.group_kind = 'TEMPORARY_TEAM' AND group_row.lifecycle_state = 'ACTIVE'
          AND (group_row.ends_at IS NULL OR group_row.ends_at > CURRENT_TIMESTAMP)
        ON CONFLICT (scenic_area_id, account_id, idempotency_key_hash) DO NOTHING
        RETURNING id
      `;
      const started = rows[0];
      if (!started) return { state: "REJECTED" as const };
      await transaction`
        INSERT INTO group_location_share_events (scenic_area_id, share_session_id, group_id, account_id, event_kind)
        VALUES (${auth.visitor.scenicAreaId}, ${started.id}, ${groupId}, ${auth.visitor.accountId}, 'STARTED')
      `;
      return { state: "STARTED" as const, id: started.id, expiresAt };
    });
    if (result.state === "REJECTED") return apiError("SHARE_REJECTED", "账号不是有效小队成员，或请求已经处理。", 403);
    return response({ schemaVersion: 1, state: result.state, shareSessionId: result.id, expiresAt: result.expiresAt });
  } catch {
    return apiError("SHARE_UNAVAILABLE", "位置共享暂时不可用。", 503, true);
  }
}

export async function updateGroupLocation(request: Request, groupId: string) {
  if (!validGroupId(groupId)) return apiError("GROUP_NOT_FOUND", "没有找到旅行小队。", 404);
  const auth = await authenticated(request, true);
  if ("error" in auth) return auth.error;
  const now = new Date();
  const update = parseFreshGroupLocationUpdate(await readBody(request), now);
  if (!update) return apiError("LOCATION_REJECTED", "位置必须是 15 秒内、精度不超过 50 米的 WGS84 样本。", 422);
  const expiresAt = new Date(new Date(update.capturedAt).getTime() + GROUP_LOCATION_SNAPSHOT_TTL_MS).toISOString();
  try {
    const sql = getDatabase();
    const rows = await sql<{ share_session_id: string }[]>`
      INSERT INTO group_member_location_snapshots (
        scenic_area_id, share_session_id, group_id, account_id, geometry_wgs84,
        accuracy_meters, captured_at, expires_at, updated_at
      )
      SELECT session.scenic_area_id, session.id, session.group_id, session.account_id,
             ST_SetSRID(ST_MakePoint(${update.longitude}, ${update.latitude}), 4326),
             ${update.accuracyMeters}, ${update.capturedAt}, ${expiresAt}, CURRENT_TIMESTAMP
      FROM group_location_share_sessions session
      INNER JOIN travel_group_members member
        ON member.scenic_area_id = session.scenic_area_id AND member.group_id = session.group_id
       AND member.account_id = session.account_id AND member.lifecycle_state = 'ACTIVE'
      WHERE session.scenic_area_id = ${auth.visitor.scenicAreaId} AND session.group_id = ${groupId}
        AND session.account_id = ${auth.visitor.accountId} AND session.lifecycle_state = 'ACTIVE'
        AND session.stopped_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP
      ON CONFLICT (share_session_id) DO UPDATE SET
        geometry_wgs84 = EXCLUDED.geometry_wgs84,
        accuracy_meters = EXCLUDED.accuracy_meters,
        captured_at = EXCLUDED.captured_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE group_member_location_snapshots.captured_at < EXCLUDED.captured_at
      RETURNING share_session_id
    `;
    return rows[0]
      ? response({ schemaVersion: 1, state: "UPDATED", expiresAt })
      : apiError("SHARE_NOT_ACTIVE", "位置共享未开启、已过期或样本时间没有推进。", 409);
  } catch {
    return apiError("LOCATION_UNAVAILABLE", "同行位置暂时无法更新。", 503, true);
  }
}

export async function listGroupLocations(request: Request, groupId: string) {
  if (!validGroupId(groupId)) return apiError("GROUP_NOT_FOUND", "没有找到旅行小队。", 404);
  const auth = await authenticated(request, false);
  if ("error" in auth) return auth.error;
  try {
    const sql = getDatabase();
    const rows = await sql<{
      account_id: string;
      display_name: string;
      longitude: number;
      latitude: number;
      accuracy_meters: number;
      captured_at: Date | string;
      expires_at: Date | string;
    }[]>`
      WITH authorized_group AS (
        SELECT member.group_id
        FROM travel_group_members member
        INNER JOIN travel_groups group_row ON group_row.id = member.group_id AND group_row.scenic_area_id = member.scenic_area_id
        WHERE member.scenic_area_id = ${auth.visitor.scenicAreaId} AND member.group_id = ${groupId}
          AND member.account_id = ${auth.visitor.accountId} AND member.lifecycle_state = 'ACTIVE'
          AND group_row.lifecycle_state = 'ACTIVE' AND (group_row.ends_at IS NULL OR group_row.ends_at > CURRENT_TIMESTAMP)
      )
      SELECT snapshot.account_id,
             COALESCE(profile.display_name, '同行成员') AS display_name,
             ST_X(snapshot.geometry_wgs84) AS longitude,
             ST_Y(snapshot.geometry_wgs84) AS latitude,
             snapshot.accuracy_meters,
             snapshot.captured_at,
             snapshot.expires_at
      FROM group_member_location_snapshots snapshot
      INNER JOIN authorized_group allowed ON allowed.group_id = snapshot.group_id
      INNER JOIN group_location_share_sessions session
        ON session.id = snapshot.share_session_id AND session.scenic_area_id = snapshot.scenic_area_id
       AND session.lifecycle_state = 'ACTIVE' AND session.stopped_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP
      INNER JOIN travel_group_members member
        ON member.scenic_area_id = snapshot.scenic_area_id AND member.group_id = snapshot.group_id
       AND member.account_id = snapshot.account_id AND member.lifecycle_state = 'ACTIVE'
      LEFT JOIN social_profiles profile
        ON profile.scenic_area_id = snapshot.scenic_area_id AND profile.account_id = snapshot.account_id
       AND profile.moderation_state = 'ACTIVE'
      WHERE snapshot.scenic_area_id = ${auth.visitor.scenicAreaId}
        AND snapshot.group_id = ${groupId} AND snapshot.expires_at > CURRENT_TIMESTAMP
      ORDER BY snapshot.account_id
    `;
    return response({
      schemaVersion: 1,
      groupId,
      members: rows.map((row) => ({
        accountId: row.account_id,
        displayName: row.display_name,
        longitude: Number(row.longitude),
        latitude: Number(row.latitude),
        accuracyMeters: Number(row.accuracy_meters),
        capturedAt: new Date(row.captured_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      })),
    });
  } catch {
    return apiError("LOCATIONS_UNAVAILABLE", "同行位置暂时不可读取。", 503, true);
  }
}
