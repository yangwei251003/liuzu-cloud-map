import "server-only";

import { getDatabase } from "./database";
import type {
  VisitorAccountRecord,
  VisitorAuthOperation,
  VisitorIdentityRepository,
} from "./visitor-identity-service";

type AccountRow = {
  id: string;
  scenic_area_id: string;
  subject: string;
  handle: string;
  password_version: number;
  password_salt: string;
  password_hash: string;
  locked_until: Date | string | null;
  created_at: Date | string;
};

type ThrottleRow = {
  window_started_at: Date | string;
  failure_count: number;
  locked_until: Date | string | null;
};

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_visitor_identity_timestamp");
  return date.toISOString();
}

function nullableIso(value: Date | string | null) {
  return value === null ? null : toIso(value);
}

function mapAccount(row: AccountRow): VisitorAccountRecord {
  if (row.password_version !== 1) throw new Error("unsupported_visitor_password_version");
  return {
    accountId: row.id,
    scenicAreaId: row.scenic_area_id,
    subject: row.subject,
    handle: row.handle,
    passwordVersion: 1,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    lockedUntil: nullableIso(row.locked_until),
    createdAt: toIso(row.created_at),
  };
}

function databaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function auditEvent(operation: VisitorAuthOperation) {
  return operation === "LOGIN" ? "LOGIN_FAILED" : "REGISTRATION_REJECTED";
}

export const postgresVisitorIdentityRepository: VisitorIdentityRepository = {
  async createAccountWithSession(input) {
    const sql = getDatabase();
    try {
      return await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO visitor_accounts (
            id, scenic_area_id, subject, handle, password_version, password_salt, password_hash,
            created_at, updated_at
          ) VALUES (
            ${input.identity.accountId}, ${input.identity.scenicAreaId}, ${input.identity.subject},
            ${input.identity.handle}, ${input.password.passwordVersion}, ${input.password.passwordSalt},
            ${input.password.passwordHash}, ${input.session.createdAt}, ${input.session.createdAt}
          )
        `;
        await transaction`
          INSERT INTO visitor_sessions (
            id, scenic_area_id, account_id, token_hash, created_at, expires_at
          ) VALUES (
            ${input.session.sessionId}, ${input.identity.scenicAreaId}, ${input.identity.accountId},
            ${input.session.tokenHash}, ${input.session.createdAt}, ${input.session.expiresAt}
          )
        `;
        if (input.throttleDimensionHashes.length > 0) {
          await transaction`
            DELETE FROM visitor_auth_throttles
            WHERE scenic_area_id = ${input.identity.scenicAreaId}
              AND operation = 'REGISTER'
              AND dimension_hash = ANY(${input.throttleDimensionHashes}::char(64)[])
          `;
        }
        await transaction`
          INSERT INTO visitor_auth_audit_events (
            scenic_area_id, account_id, actor_subject, event_type, occurred_at
          ) VALUES (
            ${input.identity.scenicAreaId}, ${input.identity.accountId}, ${input.identity.subject},
            'REGISTERED', ${input.session.createdAt}
          )
        `;
        return "CREATED" as const;
      });
    } catch (error) {
      const constraint = typeof error === "object" && error !== null && "constraint_name" in error
        ? String((error as { constraint_name?: unknown }).constraint_name ?? "")
        : typeof error === "object" && error !== null && "constraint" in error
          ? String((error as { constraint?: unknown }).constraint ?? "")
          : "";
      if (databaseErrorCode(error) === "23505" && constraint === "visitor_accounts_scenic_area_id_handle_key") {
        return "CONFLICT" as const;
      }
      throw error;
    }
  },

  async findAccountByHandle(scenicAreaId, handle) {
    const sql = getDatabase();
    const rows = await sql<AccountRow[]>`
      SELECT id, scenic_area_id, subject, handle, password_version, password_salt,
             password_hash, locked_until, created_at
      FROM visitor_accounts
      WHERE scenic_area_id = ${scenicAreaId} AND handle = ${handle}
      LIMIT 1
    `;
    return rows[0] ? mapAccount(rows[0]) : null;
  },

  async readThrottle(input) {
    if (input.dimensionHashes.length === 0) return { lockedUntil: null };
    const sql = getDatabase();
    const rows = await sql<{ locked_until: Date | string | null }[]>`
      SELECT locked_until
      FROM visitor_auth_throttles
      WHERE scenic_area_id = ${input.scenicAreaId}
        AND operation = ${input.operation}
        AND dimension_hash = ANY(${input.dimensionHashes}::char(64)[])
        AND locked_until > ${input.now}
      ORDER BY locked_until DESC
      LIMIT 1
    `;
    return { lockedUntil: rows[0] ? nullableIso(rows[0].locked_until) : null };
  },

  async recordAuthFailure(input) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const nowMs = new Date(input.occurredAt).getTime();
      if (!Number.isFinite(nowMs)) throw new Error("invalid_auth_failure_timestamp");
      let latestLock: string | null = null;

      for (const dimensionHash of input.dimensionHashes) {
        await transaction`SELECT pg_advisory_xact_lock(hashtext(${`${input.scenicAreaId}:${input.operation}:${dimensionHash}`}))`;
        const rows = await transaction<ThrottleRow[]>`
          SELECT window_started_at, failure_count, locked_until
          FROM visitor_auth_throttles
          WHERE scenic_area_id = ${input.scenicAreaId}
            AND operation = ${input.operation}
            AND dimension_hash = ${dimensionHash}
          FOR UPDATE
        `;
        const existing = rows[0];
        const existingWindowMs = existing ? new Date(existing.window_started_at).getTime() : Number.NaN;
        const withinWindow = Number.isFinite(existingWindowMs) && nowMs - existingWindowMs < input.windowMs;
        const failureCount = withinWindow ? existing.failure_count + 1 : 1;
        const windowStartedAt = withinWindow ? toIso(existing.window_started_at) : input.occurredAt;
        const existingLockMs = existing?.locked_until ? new Date(existing.locked_until).getTime() : Number.NaN;
        const calculatedLockMs = failureCount >= input.threshold ? nowMs + input.lockMs : Number.NaN;
        const lockMs = Math.max(
          Number.isFinite(existingLockMs) ? existingLockMs : Number.NEGATIVE_INFINITY,
          Number.isFinite(calculatedLockMs) ? calculatedLockMs : Number.NEGATIVE_INFINITY,
        );
        const lockedUntil = Number.isFinite(lockMs) ? new Date(lockMs).toISOString() : null;

        await transaction`
          INSERT INTO visitor_auth_throttles (
            scenic_area_id, operation, dimension_hash, window_started_at,
            failure_count, locked_until, updated_at
          ) VALUES (
            ${input.scenicAreaId}, ${input.operation}, ${dimensionHash}, ${windowStartedAt},
            ${failureCount}, ${lockedUntil}, ${input.occurredAt}
          )
          ON CONFLICT (scenic_area_id, operation, dimension_hash) DO UPDATE SET
            window_started_at = EXCLUDED.window_started_at,
            failure_count = EXCLUDED.failure_count,
            locked_until = EXCLUDED.locked_until,
            updated_at = EXCLUDED.updated_at
        `;
        if (lockedUntil && (!latestLock || lockedUntil > latestLock)) latestLock = lockedUntil;
      }

      if (input.accountId && input.operation === "LOGIN") {
        await transaction`
          UPDATE visitor_accounts
          SET failed_login_count = failed_login_count + 1,
              last_failed_login_at = ${input.occurredAt},
              locked_until = ${latestLock},
              updated_at = ${input.occurredAt}
          WHERE scenic_area_id = ${input.scenicAreaId} AND id = ${input.accountId}
        `;
      }
      await transaction`
        INSERT INTO visitor_auth_audit_events (
          scenic_area_id, account_id, actor_subject, event_type,
          dimension_hash, occurred_at
        ) VALUES (
          ${input.scenicAreaId}, ${input.accountId}, ${input.actorSubject},
          ${auditEvent(input.operation)}, ${input.dimensionHashes[0] ?? null}, ${input.occurredAt}
        )
      `;
      return { lockedUntil: latestLock };
    });
  },

  async createSessionAfterLogin(input) {
    const sql = getDatabase();
    await sql.begin(async (transaction) => {
      const updated = await transaction<{ id: string }[]>`
        UPDATE visitor_accounts
        SET failed_login_count = 0, last_failed_login_at = NULL, locked_until = NULL,
            updated_at = ${input.session.createdAt}
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND id = ${input.identity.accountId}
          AND subject = ${input.identity.subject}
        RETURNING id
      `;
      if (!updated[0]) throw new Error("visitor_account_not_found");
      await transaction`
        UPDATE visitor_sessions
        SET revoked_at = ${input.session.createdAt}
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND revoked_at IS NULL
          AND expires_at <= ${input.session.createdAt}
      `;
      await transaction`
        INSERT INTO visitor_sessions (
          id, scenic_area_id, account_id, token_hash, created_at, expires_at
        ) VALUES (
          ${input.session.sessionId}, ${input.identity.scenicAreaId}, ${input.identity.accountId},
          ${input.session.tokenHash}, ${input.session.createdAt}, ${input.session.expiresAt}
        )
      `;
      if (input.throttleDimensionHashes.length > 0) {
        await transaction`
          DELETE FROM visitor_auth_throttles
          WHERE scenic_area_id = ${input.identity.scenicAreaId}
            AND operation = 'LOGIN'
            AND dimension_hash = ANY(${input.throttleDimensionHashes}::char(64)[])
        `;
      }
      await transaction`
        INSERT INTO visitor_auth_audit_events (
          scenic_area_id, account_id, actor_subject, event_type, occurred_at
        ) VALUES (
          ${input.identity.scenicAreaId}, ${input.identity.accountId}, ${input.identity.subject},
          'LOGIN_SUCCEEDED', ${input.session.createdAt}
        )
      `;
    });
  },

  async findIdentityBySessionTokenHash(tokenHash, now) {
    const sql = getDatabase();
    const rows = await sql<{
      id: string;
      scenic_area_id: string;
      subject: string;
      handle: string;
    }[]>`
      SELECT a.id, a.scenic_area_id, a.subject, a.handle
      FROM visitor_sessions AS s
      JOIN visitor_accounts AS a
        ON a.scenic_area_id = s.scenic_area_id AND a.id = s.account_id
      WHERE s.token_hash = ${tokenHash}
        AND s.revoked_at IS NULL
        AND s.expires_at > ${now}
      LIMIT 1
    `;
    const row = rows[0];
    return row
      ? { accountId: row.id, scenicAreaId: row.scenic_area_id, subject: row.subject, handle: row.handle }
      : null;
  },

  async revokeSessionByTokenHash(tokenHash, revokedAt) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const rows = await transaction<{
        id: string;
        scenic_area_id: string;
        account_id: string;
        subject: string;
      }[]>`
        SELECT s.id, s.scenic_area_id, s.account_id, a.subject
        FROM visitor_sessions AS s
        JOIN visitor_accounts AS a
          ON a.scenic_area_id = s.scenic_area_id AND a.id = s.account_id
        WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL
        FOR UPDATE OF s
      `;
      const row = rows[0];
      if (!row) return "NOT_FOUND" as const;
      await transaction`
        UPDATE visitor_sessions SET revoked_at = ${revokedAt}
        WHERE id = ${row.id}
      `;
      await transaction`
        INSERT INTO visitor_auth_audit_events (
          scenic_area_id, account_id, actor_subject, event_type, occurred_at
        ) VALUES (
          ${row.scenic_area_id}, ${row.account_id}, ${row.subject},
          'SESSION_REVOKED', ${revokedAt}
        )
      `;
      return "REVOKED" as const;
    });
  },
};
