import "server-only";

import type { Sql, TransactionSql } from "postgres";

import { getDatabase } from "./database";
import {
  isVisitSessionAction,
  isVisitSessionCurrentRevision,
  isVisitSessionId,
  isVisitSessionRevision,
  isVisitSessionState,
  transitionVisitSession,
  type VisitSessionAction,
} from "./visit-session-domain";
import {
  isVisitSessionReceipt,
  type ApplyVisitSessionEventCommand,
  type CreateVisitSessionCommand,
  type VisitSessionReceipt,
  type VisitSessionRepository,
} from "./visit-session-service";

type Timestamp = Date | string;
type QueryExecutor = Sql | TransactionSql;

type SessionRow = {
  id: string;
  scenic_area_id: string;
  owner_account_id: string | null;
  itinerary_id: string | null;
  itinerary_revision: number | null;
  route_plan_snapshot_id: string | null;
  lifecycle_state: string;
  narration_enabled: boolean;
  started_at: Timestamp | null;
  ended_at: Timestamp | null;
  expected_revision: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type EventRow = {
  event_type: string;
  metadata: unknown;
};

type StoredEventMetadata = {
  schemaVersion: 1;
  action: VisitSessionAction;
  expectedRevision: number;
  replacementRoutePlanSnapshotId: string | null;
  session: VisitSessionReceipt;
};

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_visit_session_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function mapSession(row: SessionRow): VisitSessionReceipt {
  if (
    !isVisitSessionId(row.id)
    || !isVisitSessionId(row.itinerary_id)
    || !isVisitSessionId(row.route_plan_snapshot_id)
    || !isVisitSessionRevision(row.itinerary_revision)
    || row.itinerary_revision < 1
    || !isVisitSessionRevision(row.expected_revision)
    || row.expected_revision >= 2_147_483_646
    || !isVisitSessionState(row.lifecycle_state)
    || typeof row.narration_enabled !== "boolean"
  ) {
    throw new Error("invalid_visit_session_row");
  }
  const receipt: VisitSessionReceipt = {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    itineraryId: row.itinerary_id,
    itineraryRevision: row.itinerary_revision,
    routePlanSnapshotId: row.route_plan_snapshot_id,
    lifecycleState: row.lifecycle_state,
    // Migration 003 retains the last expected revision; current revision is
    // derived deterministically as expected_revision + 1.
    revision: row.expected_revision + 1,
    narrationEnabled: row.narration_enabled,
    startedAt: nullableIso(row.started_at),
    endedAt: nullableIso(row.ended_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  if (!isVisitSessionCurrentRevision(receipt.revision) || !isVisitSessionReceipt(receipt)) {
    throw new Error("invalid_visit_session_receipt");
  }
  return receipt;
}

function sameCreateRequest(session: VisitSessionReceipt, command: CreateVisitSessionCommand) {
  return (
    session.scenicAreaId === command.input.scenicAreaId
    && session.itineraryId === command.input.itineraryId
    && session.itineraryRevision === command.input.itineraryRevision
    && session.routePlanSnapshotId === command.input.routePlanSnapshotId
    && session.narrationEnabled === command.input.narrationEnabled
  );
}

function originalCreateReceipt(session: VisitSessionReceipt): VisitSessionReceipt {
  const receipt: VisitSessionReceipt = {
    ...session,
    lifecycleState: "READY",
    revision: 1,
    startedAt: null,
    endedAt: null,
    updatedAt: session.createdAt,
  };
  if (!isVisitSessionReceipt(receipt)) throw new Error("invalid_visit_session_create_replay");
  return receipt;
}

function parseStoredEventMetadata(value: unknown): StoredEventMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    "action",
    "expectedRevision",
    "replacementRoutePlanSnapshotId",
    "schemaVersion",
    "session",
  ];
  if (keys.length !== expected.length || !expected.every((key, index) => keys[index] === key)) return null;
  if (
    record.schemaVersion !== 1
    || !isVisitSessionAction(record.action)
    || !isVisitSessionRevision(record.expectedRevision)
    || (record.replacementRoutePlanSnapshotId !== null && !isVisitSessionId(record.replacementRoutePlanSnapshotId))
    || !isVisitSessionReceipt(record.session as VisitSessionReceipt)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    action: record.action,
    expectedRevision: record.expectedRevision,
    replacementRoutePlanSnapshotId: record.replacementRoutePlanSnapshotId,
    session: structuredClone(record.session as VisitSessionReceipt),
  };
}

function storedEventMetadata(command: ApplyVisitSessionEventCommand, session: VisitSessionReceipt): StoredEventMetadata {
  return {
    schemaVersion: 1,
    action: command.input.action,
    expectedRevision: command.input.expectedRevision,
    replacementRoutePlanSnapshotId: command.input.replacementRoutePlanSnapshotId,
    session,
  };
}

/**
 * A plan is usable only when it is owned by the same visitor itinerary and
 * still agrees with the current, field-verified published snapshot and an
 * unexpired operational version. No coordinates, candidate geometry, AI
 * route, or third-party provider result can satisfy this query.
 */
async function hasCurrentFormalRoute(
  sql: QueryExecutor,
  identity: CreateVisitSessionCommand["identity"],
  itineraryId: string,
  itineraryRevision: number,
  routePlanSnapshotId: string,
  at: string,
) {
  const rows = await sql<{ id: string }[]>`
    SELECT plan.id
    FROM route_plan_snapshots AS plan
    INNER JOIN itineraries AS itinerary
      ON itinerary.id = plan.itinerary_id
     AND itinerary.scenic_area_id = plan.scenic_area_id
    INNER JOIN route_network_revisions AS network
      ON network.id = plan.network_revision_id
     AND network.scenic_area_id = plan.scenic_area_id
    INNER JOIN data_sources AS route_source
      ON route_source.id = network.source_id
     AND route_source.scenic_area_id = plan.scenic_area_id
    INNER JOIN route_operational_versions AS operational
      ON operational.id = plan.operational_version_id
     AND operational.scenic_area_id = plan.scenic_area_id
     AND operational.network_revision_id = plan.network_revision_id
    INNER JOIN scenic_published_snapshots AS published
      ON published.scenic_area_id = plan.scenic_area_id
     AND published.network_revision_id = plan.network_revision_id
     AND published.operational_version_id = plan.operational_version_id
    INNER JOIN scenic_area_publications AS publication
      ON publication.id = published.publication_id
     AND publication.scenic_area_id = plan.scenic_area_id
    WHERE plan.id = ${routePlanSnapshotId}
      AND plan.scenic_area_id = ${identity.scenicAreaId}
      AND plan.itinerary_id = ${itineraryId}
      AND plan.itinerary_revision = ${itineraryRevision}
      AND plan.expires_at > ${at}
      AND itinerary.owner_account_id = ${identity.accountId}
      AND itinerary.revision = ${itineraryRevision}
      AND itinerary.lifecycle_state IN ('SAVED', 'EXECUTING')
      AND network.lifecycle_state = 'PUBLISHED'
      AND network.verification_state = 'FIELD_VERIFIED'
      AND network.coordinate_system = 'WGS84'
      AND network.valid_until > ${at}
      AND route_source.license_state = 'CLEARED'
      AND route_source.verified_at IS NOT NULL
      AND route_source.verified_by_subject IS NOT NULL
      AND route_source.valid_until > ${at}
      AND operational.lifecycle_state = 'PUBLISHED'
      AND operational.published_by_subject IS NOT NULL
      AND operational.issued_at <= ${at}
      AND operational.expires_at > ${at}
      AND published.lifecycle_state = 'PUBLISHED'
      AND published.published_at IS NOT NULL
      AND published.published_by_subject IS NOT NULL
      AND published.withdrawn_at IS NULL
      AND published.expires_at > ${at}
      AND publication.lifecycle_state = 'PUBLISHED'
      AND publication.published_at IS NOT NULL
      AND publication.published_by_subject IS NOT NULL
      AND publication.withdrawn_at IS NULL
      AND publication.valid_until > ${at}
      AND NOT EXISTS (
        SELECT 1
        FROM closure_events AS closure
        WHERE closure.scenic_area_id = plan.scenic_area_id
          AND closure.network_revision_id = plan.network_revision_id
          AND closure.withdrawn_at IS NULL
          AND closure.starts_at <= ${at}
          AND closure.expires_at > ${at}
          AND closure.created_at >= operational.issued_at
      )
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

function sessionSelect(sql: QueryExecutor, identity: ApplyVisitSessionEventCommand["identity"], sessionId: string) {
  return sql<SessionRow[]>`
    SELECT id, scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
           lifecycle_state, narration_enabled, started_at, ended_at, expected_revision, created_at, updated_at
    FROM visit_sessions
    WHERE id = ${sessionId}
      AND scenic_area_id = ${identity.scenicAreaId}
      AND owner_account_id = ${identity.accountId}
    FOR UPDATE
  `;
}

function shouldSetStartedAt(nextState: VisitSessionReceipt["lifecycleState"], current: VisitSessionReceipt, at: string) {
  return nextState === "STARTED" && current.startedAt === null ? at : current.startedAt;
}

function shouldSetEndedAt(nextState: VisitSessionReceipt["lifecycleState"], current: VisitSessionReceipt, at: string) {
  return (nextState === "COMPLETED" || nextState === "ENDED") && current.endedAt === null ? at : current.endedAt;
}

export const postgresVisitSessionRepository: VisitSessionRepository = {
  async create(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const accounts = await transaction<{ id: string }[]>`
        SELECT id
        FROM visitor_accounts
        WHERE id = ${command.identity.accountId}
          AND scenic_area_id = ${command.identity.scenicAreaId}
          AND subject = ${command.identity.subject}
        FOR SHARE
      `;
      if (!accounts[0]) return { state: "NOT_FOUND" as const };

      const existingRows = await transaction<SessionRow[]>`
        SELECT id, scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
               lifecycle_state, narration_enabled, started_at, ended_at, expected_revision, created_at, updated_at
        FROM visit_sessions
        WHERE scenic_area_id = ${command.input.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const existing = existingRows[0];
      if (existing) {
        if (existing.owner_account_id !== command.identity.accountId) return { state: "IDEMPOTENCY_CONFLICT" as const };
        const session = mapSession(existing);
        return sameCreateRequest(session, command)
          ? { state: "REPLAYED" as const, session: originalCreateReceipt(session) }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }

      if (!await hasCurrentFormalRoute(
        transaction,
        command.identity,
        command.input.itineraryId,
        command.input.itineraryRevision,
        command.input.routePlanSnapshotId,
        command.occurredAt,
      )) {
        return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      }

      const inserted = await transaction<SessionRow[]>`
        INSERT INTO visit_sessions (
          scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
          lifecycle_state, narration_enabled, expected_revision, idempotency_key_hash,
          created_at, updated_at
        ) VALUES (
          ${command.input.scenicAreaId}, ${command.identity.accountId}, ${command.input.itineraryId},
          ${command.input.itineraryRevision}, ${command.input.routePlanSnapshotId},
          'READY', ${command.input.narrationEnabled}, ${command.input.expectedRevision}, ${command.idempotencyKeyHash},
          ${command.occurredAt}, ${command.occurredAt}
        )
        ON CONFLICT (scenic_area_id, idempotency_key_hash) DO NOTHING
        RETURNING id, scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
                  lifecycle_state, narration_enabled, started_at, ended_at, expected_revision, created_at, updated_at
      `;
      const created = inserted[0];
      if (created) return { state: "CREATED" as const, session: mapSession(created) };

      // A concurrent identical create may win after the first idempotency read.
      const racedRows = await transaction<SessionRow[]>`
        SELECT id, scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
               lifecycle_state, narration_enabled, started_at, ended_at, expected_revision, created_at, updated_at
        FROM visit_sessions
        WHERE scenic_area_id = ${command.input.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const raced = racedRows[0];
      if (!raced || raced.owner_account_id !== command.identity.accountId) return { state: "IDEMPOTENCY_CONFLICT" as const };
      const session = mapSession(raced);
      return sameCreateRequest(session, command)
        ? { state: "REPLAYED" as const, session: originalCreateReceipt(session) }
        : { state: "IDEMPOTENCY_CONFLICT" as const };
    });
  },

  async applyEvent(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const rows = await sessionSelect(transaction, command.identity, command.sessionId);
      const row = rows[0];
      if (!row) return { state: "NOT_FOUND" as const };
      const current = mapSession(row);

      const replayRows = await transaction<EventRow[]>`
        SELECT event_type, metadata
        FROM visit_session_events
        WHERE visit_session_id = ${command.sessionId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const replay = replayRows[0];
      if (replay) {
        const metadata = parseStoredEventMetadata(replay.metadata);
        if (
          !metadata
          || metadata.action !== command.input.action
          || metadata.expectedRevision !== command.input.expectedRevision
          || metadata.replacementRoutePlanSnapshotId !== command.input.replacementRoutePlanSnapshotId
        ) {
          return { state: "IDEMPOTENCY_CONFLICT" as const };
        }
        return { state: "REPLAYED" as const, action: metadata.action, session: metadata.session };
      }

      if (current.revision !== command.input.expectedRevision) {
        return { state: "REVISION_CONFLICT" as const, currentRevision: current.revision };
      }
      const transition = transitionVisitSession(current.lifecycleState, command.input.action);
      if (!transition) return { state: "INVALID_TRANSITION" as const };

      const replacement = command.input.replacementRoutePlanSnapshotId;
      if (transition.requiresReplacementFormalRoute) {
        if (!replacement || !await hasCurrentFormalRoute(
          transaction,
          command.identity,
          current.itineraryId,
          current.itineraryRevision,
          replacement,
          command.occurredAt,
        )) {
          return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
        }
      } else if (transition.requiresCurrentFormalRoute && !await hasCurrentFormalRoute(
        transaction,
        command.identity,
        current.itineraryId,
        current.itineraryRevision,
        current.routePlanSnapshotId,
        command.occurredAt,
      )) {
        return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      }

      const nextRoutePlanSnapshotId = replacement ?? current.routePlanSnapshotId;
      const nextStartedAt = shouldSetStartedAt(transition.lifecycleState, current, command.occurredAt);
      const nextEndedAt = shouldSetEndedAt(transition.lifecycleState, current, command.occurredAt);
      const nextRevision = current.revision + 1;
      const updatedRows = await transaction<SessionRow[]>`
        UPDATE visit_sessions
        SET lifecycle_state = ${transition.lifecycleState},
            route_plan_snapshot_id = ${nextRoutePlanSnapshotId},
            started_at = ${nextStartedAt},
            ended_at = ${nextEndedAt},
            expected_revision = ${command.input.expectedRevision},
            updated_at = ${command.occurredAt}
        WHERE id = ${command.sessionId}
          AND scenic_area_id = ${command.identity.scenicAreaId}
          AND owner_account_id = ${command.identity.accountId}
          AND expected_revision = ${command.input.expectedRevision - 1}
        RETURNING id, scenic_area_id, owner_account_id, itinerary_id, itinerary_revision, route_plan_snapshot_id,
                  lifecycle_state, narration_enabled, started_at, ended_at, expected_revision, created_at, updated_at
      `;
      const updated = updatedRows[0];
      if (!updated) return { state: "REVISION_CONFLICT" as const, currentRevision: null };
      const session = mapSession(updated);
      if (session.revision !== nextRevision) throw new Error("invalid_visit_session_revision_increment");
      const metadata = storedEventMetadata(command, session);
      await transaction`
        INSERT INTO visit_session_events (
          visit_session_id, event_type, metadata, idempotency_key_hash, occurred_at
        ) VALUES (
          ${command.sessionId}, ${transition.eventType}, ${transaction.json(metadata)},
          ${command.idempotencyKeyHash}, ${command.occurredAt}
        )
      `;
      return { state: "APPLIED" as const, action: command.input.action, session };
    });
  },
};
