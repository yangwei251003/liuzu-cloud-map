import "server-only";

import { getDatabase } from "./database";
import { parseServerSharePayload, type AuthenticatedShareLinkRecord } from "./share-link-domain";
import type { ShareLinkRepository, StoredServerShareLink } from "./share-link-service";

type ShareLinkRow = {
  id: string;
  scenic_area_id: string;
  schema_version: number;
  token_hash: string;
  revoke_token_hash: string;
  payload: unknown;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_by_account_id: string | null;
  created_by_subject: string | null;
};

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_share_link_timestamp");
  return date.toISOString();
}

function mapRow(row: ShareLinkRow): StoredServerShareLink {
  const payload = parseServerSharePayload(row.payload);
  if (row.schema_version !== 1 || !payload) throw new Error("invalid_share_link_record");
  return {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    schemaVersion: 1,
    tokenHash: row.token_hash,
    revokeTokenHash: row.revoke_token_hash,
    createdByAccountId: row.created_by_account_id,
    createdBySubject: row.created_by_subject,
    payload,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    revokedAt: row.revoked_at === null ? null : toIso(row.revoked_at),
  };
}

export const postgresShareLinkRepository: ShareLinkRepository = {
  async create(record: AuthenticatedShareLinkRecord) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
        INSERT INTO share_links (
          scenic_area_id, schema_version, token_hash, revoke_token_hash, payload,
          created_by_account_id, created_by_subject,
          created_at, expires_at, revoked_at, updated_at
        ) VALUES (
          ${record.scenicAreaId}, ${record.schemaVersion}, ${record.tokenHash}, ${record.revokeTokenHash},
          ${transaction.json(record.payload)}, ${record.createdByAccountId}, ${record.createdBySubject},
          ${record.createdAt}, ${record.expiresAt}, ${record.revokedAt}, ${record.createdAt}
        )
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) throw new Error("share_link_insert_failed");
      await transaction`
        INSERT INTO share_link_audit_events (share_link_id, event_type, actor_subject, occurred_at)
        VALUES (${id}, 'CREATED', ${record.createdBySubject}, ${record.createdAt})
      `;
      return { id };
    });
  },

  async findByPublicTokenHash(tokenHash: string) {
    const sql = getDatabase();
    const rows = await sql<ShareLinkRow[]>`
      SELECT id, scenic_area_id, schema_version, token_hash, revoke_token_hash, payload,
             created_by_account_id, created_by_subject, created_at, expires_at, revoked_at
      FROM share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async revokeOwned(input) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const rows = await transaction<{ id: string; revoked_at: Date | string | null }[]>`
        SELECT id, revoked_at
        FROM share_links
        WHERE id = ${input.shareId}
          AND scenic_area_id = ${input.scenicAreaId}
          AND created_by_account_id = ${input.accountId}
          AND created_by_subject = ${input.actorSubject}
          AND (${input.revokeTokenHash}::char(64) IS NULL OR revoke_token_hash = ${input.revokeTokenHash})
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return "NOT_FOUND" as const;
      if (row.revoked_at !== null) return "ALREADY_REVOKED" as const;
      await transaction`
        UPDATE share_links
        SET revoked_at = ${input.revokedAt}, updated_at = ${input.revokedAt}
        WHERE id = ${input.shareId}
      `;
      await transaction`
        INSERT INTO share_link_audit_events (share_link_id, event_type, actor_subject, occurred_at)
        VALUES (${input.shareId}, 'REVOKED', ${input.actorSubject}, ${input.revokedAt})
      `;
      return "REVOKED" as const;
    });
  },
};
