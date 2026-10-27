import "server-only";

import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { bucketNavigationDistance, transitionNavigationSession } from "./navigation-session-domain";
import { getDatabase } from "./database";
import {
  isNavigationSessionReceipt,
  navigationReasonCode,
  type NavigationSessionCreateCommand,
  type NavigationSessionReceipt,
  type NavigationSessionRepository,
} from "./navigation-session-service";

type Timestamp = Date | string;
type QueryExecutor = Sql | TransactionSql;

type SessionRow = {
  id: string;
  scenic_area_id: string;
  account_id: string;
  network_revision_id: string;
  operational_version_id: string;
  route_fingerprint: string;
  optimization_strategy: NavigationSessionReceipt["optimization"];
  origin_node_code: string;
  destination_node_code: string;
  session_status: NavigationSessionReceipt["status"];
  last_remaining_distance_meters: number | string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  expires_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  revision: number;
  initial_distance_meters: number | string | null;
  estimated_minutes: number | string | null;
  network_revision: string;
  operational_version: number;
  create_idempotency_key_hash?: string | null;
  create_receipt_json?: unknown;
};

type FormalBinding = { network_id: string; operational_id: string };

function iso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_navigation_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : iso(value);
}

function mapSession(row: SessionRow): NavigationSessionReceipt {
  const remaining = Number(row.last_remaining_distance_meters ?? 0);
  const distance = Number(row.initial_distance_meters ?? 0);
  const estimated = Number(row.estimated_minutes ?? 0);
  const receipt: NavigationSessionReceipt = {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    routeFingerprint: row.route_fingerprint,
    optimization: row.optimization_strategy,
    originNodeId: row.origin_node_code,
    destinationNodeId: row.destination_node_code,
    networkRevision: row.network_revision,
    operationalVersion: Number(row.operational_version),
    status: row.session_status,
    revision: Number(row.revision),
    distanceMeters: distance,
    estimatedMinutes: estimated,
    remainingDistanceBucketMeters: remaining,
    startedAt: nullableIso(row.started_at),
    endedAt: nullableIso(row.completed_at),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (!isNavigationSessionReceipt(receipt)) throw new Error("invalid_navigation_session_row");
  return receipt;
}

function selectSession(sql: QueryExecutor, scenicAreaId: string, accountId: string, sessionId: string) {
  return sql<SessionRow[]>`
    SELECT session.id, session.scenic_area_id, session.account_id, session.network_revision_id, session.operational_version_id, session.route_fingerprint,
           session.optimization_strategy, session.origin_node_code, session.destination_node_code,
           session.session_status, session.last_remaining_distance_meters, session.started_at,
           session.completed_at, session.expires_at, session.created_at, session.updated_at,
           session.revision, session.initial_distance_meters, session.estimated_minutes,
           network.revision AS network_revision, operational.operational_version
    FROM navigation_sessions session
    INNER JOIN route_network_revisions network ON network.id = session.network_revision_id AND network.scenic_area_id = session.scenic_area_id
    INNER JOIN route_operational_versions operational ON operational.id = session.operational_version_id AND operational.scenic_area_id = session.scenic_area_id
    WHERE session.id = ${sessionId} AND session.scenic_area_id = ${scenicAreaId} AND session.account_id = ${accountId}
      AND session.create_idempotency_key_hash IS NOT NULL
    FOR UPDATE OF session
  `;
}

async function currentFormalBinding(
  sql: QueryExecutor,
  input: { scenicAreaId: string; networkRevision: string; operationalVersion: number; originNodeId: string; destinationNodeId: string },
  at: string,
): Promise<FormalBinding | null> {
  const rows = await sql<FormalBinding[]>`
    SELECT network.id AS network_id, operational.id AS operational_id
    FROM route_network_revisions network
    INNER JOIN data_sources source ON source.id = network.source_id AND source.scenic_area_id = network.scenic_area_id
    INNER JOIN route_operational_versions operational
      ON operational.network_revision_id = network.id AND operational.scenic_area_id = network.scenic_area_id
    INNER JOIN scenic_published_snapshots snapshot
      ON snapshot.network_revision_id = network.id
     AND snapshot.operational_version_id = operational.id
     AND snapshot.scenic_area_id = network.scenic_area_id
    INNER JOIN scenic_area_publications publication
      ON publication.id = snapshot.publication_id AND publication.scenic_area_id = snapshot.scenic_area_id
    WHERE network.scenic_area_id = ${input.scenicAreaId}
      AND network.revision = ${input.networkRevision}
      AND operational.operational_version = ${input.operationalVersion}
      AND network.lifecycle_state = 'PUBLISHED'
      AND network.verification_state = 'FIELD_VERIFIED'
      AND network.coordinate_system = 'WGS84'
      AND network.valid_until > ${at}
      AND source.license_state = 'CLEARED'
      AND source.verified_at IS NOT NULL
      AND source.valid_until > ${at}
      AND operational.lifecycle_state = 'PUBLISHED'
      AND operational.published_by_subject IS NOT NULL
      AND operational.issued_at <= ${at}
      AND operational.expires_at > ${at}
      AND snapshot.lifecycle_state = 'PUBLISHED'
      AND snapshot.published_at IS NOT NULL
      AND snapshot.withdrawn_at IS NULL
      AND snapshot.expires_at > ${at}
      AND publication.lifecycle_state = 'PUBLISHED'
      AND publication.published_at IS NOT NULL
      AND publication.withdrawn_at IS NULL
      AND publication.valid_until > ${at}
      AND EXISTS (SELECT 1 FROM route_nodes node WHERE node.network_revision_id = network.id AND node.node_code = ${input.originNodeId})
      AND EXISTS (SELECT 1 FROM route_nodes node WHERE node.network_revision_id = network.id AND node.node_code = ${input.destinationNodeId})
      AND NOT EXISTS (
        SELECT 1 FROM closure_events closure
        WHERE closure.scenic_area_id = network.scenic_area_id
          AND closure.network_revision_id = network.id
          AND closure.withdrawn_at IS NULL
          AND closure.starts_at <= ${at}
          AND closure.expires_at > ${at}
          AND closure.created_at >= operational.issued_at
      )
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function createReceipt(command: NavigationSessionCreateCommand, id: string): NavigationSessionReceipt {
  const remaining = bucketNavigationDistance(command.plan.distanceMeters);
  if (remaining === null) throw new Error("invalid_navigation_plan_distance");
  const receipt: NavigationSessionReceipt = {
    id,
    scenicAreaId: command.identity.scenicAreaId,
    routeFingerprint: command.plan.routeFingerprint,
    optimization: command.plan.optimization,
    originNodeId: command.plan.originNodeId,
    destinationNodeId: command.plan.destinationNodeId,
    networkRevision: command.plan.networkRevision,
    operationalVersion: command.plan.operationalVersion,
    status: "READY",
    revision: 0,
    distanceMeters: command.plan.distanceMeters,
    estimatedMinutes: command.plan.estimatedMinutes,
    remainingDistanceBucketMeters: remaining,
    startedAt: null,
    endedAt: null,
    expiresAt: command.plan.expiresAt,
    createdAt: command.occurredAt,
    updatedAt: command.occurredAt,
  };
  if (!isNavigationSessionReceipt(receipt)) throw new Error("invalid_navigation_create_receipt");
  return receipt;
}

function encodeCursor(receipt: NavigationSessionReceipt) {
  return Buffer.from(JSON.stringify({ createdAt: receipt.createdAt, id: receipt.id }), "utf8").toString("base64url");
}

function decodeCursor(value: string | null) {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const item = parsed as Record<string, unknown>;
    if (Object.keys(item).sort().join("|") !== "createdAt|id" || typeof item.createdAt !== "string" || typeof item.id !== "string") return null;
    const time = new Date(item.createdAt);
    return !Number.isNaN(time.getTime()) && /^[0-9a-f-]{36}$/i.test(item.id) ? { createdAt: time.toISOString(), id: item.id } : null;
  } catch { return null; }
}

export const postgresNavigationSessionRepository: NavigationSessionRepository = {
  async create(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const account = await transaction<{ id: string }[]>`
        SELECT id FROM visitor_accounts
        WHERE scenic_area_id = ${command.identity.scenicAreaId}
          AND id = ${command.identity.accountId}
          AND subject = ${command.identity.subject}
        FOR SHARE
      `;
      if (!account[0]) return { state: "ACCOUNT_NOT_FOUND" as const };
      const prior = await transaction<{ account_id: string; route_fingerprint: string; create_receipt_json: unknown }[]>`
        SELECT account_id, route_fingerprint, create_receipt_json
        FROM navigation_sessions
        WHERE scenic_area_id = ${command.identity.scenicAreaId}
          AND account_id = ${command.identity.accountId}
          AND create_idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      if (prior[0]) {
        const receipt = prior[0].create_receipt_json;
        return prior[0].account_id === command.identity.accountId
          && prior[0].route_fingerprint === command.plan.routeFingerprint
          && isNavigationSessionReceipt(receipt)
          ? { state: "REPLAYED" as const, session: receipt }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }
      const binding = await currentFormalBinding(transaction, {
        scenicAreaId: command.identity.scenicAreaId,
        networkRevision: command.plan.networkRevision,
        operationalVersion: command.plan.operationalVersion,
        originNodeId: command.plan.originNodeId,
        destinationNodeId: command.plan.destinationNodeId,
      }, command.occurredAt);
      if (!binding) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      const id = randomUUID();
      const receipt = createReceipt(command, id);
      await transaction`
        INSERT INTO navigation_sessions (
          id, scenic_area_id, account_id, network_revision_id, operational_version_id,
          route_fingerprint, optimization_strategy, origin_node_code, destination_node_code,
          session_status, last_remaining_distance_meters, expires_at, created_at, updated_at,
          revision, initial_distance_meters, estimated_minutes, create_idempotency_key_hash, create_receipt_json
        ) VALUES (
          ${id}, ${command.identity.scenicAreaId}, ${command.identity.accountId}, ${binding.network_id}, ${binding.operational_id},
          ${command.plan.routeFingerprint}, ${command.plan.optimization}, ${command.plan.originNodeId}, ${command.plan.destinationNodeId},
          'READY', ${receipt.remainingDistanceBucketMeters}, ${command.plan.expiresAt}, ${command.occurredAt}, ${command.occurredAt},
          0, ${command.plan.distanceMeters}, ${command.plan.estimatedMinutes}, ${command.idempotencyKeyHash}, ${transaction.json(receipt)}
        )
      `;
      return { state: "CREATED" as const, session: receipt };
    });
  },

  async applyEvent(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const replayRows = await transaction<{ receipt_json: unknown; event_kind: string; expected_revision: number | null; reason_code: string | null; route_fingerprint: string | null }[]>`
        SELECT event.receipt_json, event.event_kind, event.expected_revision, event.reason_code, event.route_fingerprint
        FROM navigation_session_events AS event
        INNER JOIN navigation_sessions AS session
          ON session.id = event.navigation_session_id AND session.scenic_area_id = event.scenic_area_id
        WHERE event.scenic_area_id = ${command.identity.scenicAreaId}
          AND event.navigation_session_id = ${command.sessionId}
          AND event.idempotency_key_hash = ${command.idempotencyKeyHash}
          AND session.account_id = ${command.identity.accountId}
          AND session.create_idempotency_key_hash IS NOT NULL
        FOR UPDATE OF event
      `;
      const replay = replayRows[0];
      if (replay) {
        const expectedEventKind = {
          START: "STARTED", PAUSE: "PAUSED", RESUME: "RESUMED", REROUTE_REQUIRED: "REROUTE_REQUIRED",
          REROUTED: "REROUTED", ARRIVE: "ARRIVED", CANCEL: "CANCELLED",
        }[command.input.action];
        return replay.event_kind === expectedEventKind
          && replay.expected_revision === command.input.expectedRevision
          && replay.reason_code === navigationReasonCode(command.input)
          && (command.input.action !== "REROUTED" || replay.route_fingerprint === command.replacementPlan?.routeFingerprint)
          && isNavigationSessionReceipt(replay.receipt_json)
          ? { state: "REPLAYED" as const, action: command.input.action, session: replay.receipt_json }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }
      const rows = await selectSession(transaction, command.identity.scenicAreaId, command.identity.accountId, command.sessionId);
      const row = rows[0];
      if (!row) return { state: "NOT_FOUND" as const };
      const current = mapSession(row);
      if (current.revision !== command.input.expectedRevision) return { state: "REVISION_CONFLICT" as const, currentRevision: current.revision };
      const transition = transitionNavigationSession(current.status, command.input.action);
      if (!transition) return { state: "INVALID_TRANSITION" as const };
      if (new Date(current.expiresAt).getTime() <= new Date(command.occurredAt).getTime()) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      const nextPlan = command.replacementPlan;
      let binding: FormalBinding | null = null;
      if (transition.requiresReplacementRoute) {
        if (!nextPlan) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
        binding = await currentFormalBinding(transaction, {
          scenicAreaId: command.identity.scenicAreaId,
          networkRevision: nextPlan.networkRevision,
          operationalVersion: nextPlan.operationalVersion,
          originNodeId: nextPlan.originNodeId,
          destinationNodeId: nextPlan.destinationNodeId,
        }, command.occurredAt);
        if (!binding) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      } else if (transition.requiresCurrentRoute) {
        binding = await currentFormalBinding(transaction, {
          scenicAreaId: current.scenicAreaId,
          networkRevision: current.networkRevision,
          operationalVersion: current.operationalVersion,
          originNodeId: current.originNodeId,
          destinationNodeId: current.destinationNodeId,
        }, command.occurredAt);
        if (!binding) return { state: "FORMAL_ROUTE_UNAVAILABLE" as const };
      }
      const maximumRemaining = nextPlan?.distanceMeters ?? current.distanceMeters;
      if (command.remainingDistanceBucketMeters > Math.ceil(maximumRemaining / 50) * 50) return { state: "INVALID_TRANSITION" as const };
      const nextRevision = current.revision + 1;
      const endedAt = transition.status === "COMPLETED" || transition.status === "CANCELLED" ? command.occurredAt : current.endedAt;
      const receipt: NavigationSessionReceipt = {
        ...current,
        ...(nextPlan ? {
          routeFingerprint: nextPlan.routeFingerprint,
          optimization: nextPlan.optimization,
          originNodeId: nextPlan.originNodeId,
          destinationNodeId: nextPlan.destinationNodeId,
          networkRevision: nextPlan.networkRevision,
          operationalVersion: nextPlan.operationalVersion,
          distanceMeters: nextPlan.distanceMeters,
          estimatedMinutes: nextPlan.estimatedMinutes,
          expiresAt: nextPlan.expiresAt,
        } : {}),
        status: transition.status,
        revision: nextRevision,
        remainingDistanceBucketMeters: command.remainingDistanceBucketMeters,
        startedAt: transition.status === "ACTIVE" && current.startedAt === null ? command.occurredAt : current.startedAt,
        endedAt,
        updatedAt: command.occurredAt,
      };
      if (!isNavigationSessionReceipt(receipt)) throw new Error("invalid_navigation_event_receipt");
      await transaction`
        UPDATE navigation_sessions SET
          network_revision_id = ${binding?.network_id ?? row.network_revision_id},
          operational_version_id = ${binding?.operational_id ?? row.operational_version_id},
          route_fingerprint = ${receipt.routeFingerprint}, optimization_strategy = ${receipt.optimization},
          origin_node_code = ${receipt.originNodeId}, destination_node_code = ${receipt.destinationNodeId},
          session_status = ${receipt.status}, last_remaining_distance_meters = ${receipt.remainingDistanceBucketMeters},
          started_at = ${receipt.startedAt}, completed_at = ${receipt.endedAt}, expires_at = ${receipt.expiresAt},
          updated_at = ${receipt.updatedAt}, revision = ${receipt.revision},
          initial_distance_meters = ${receipt.distanceMeters}, estimated_minutes = ${receipt.estimatedMinutes}
        WHERE id = ${command.sessionId} AND scenic_area_id = ${command.identity.scenicAreaId} AND account_id = ${command.identity.accountId}
      `;
      await transaction`
        INSERT INTO navigation_session_events (
          scenic_area_id, navigation_session_id, event_kind, network_revision, operational_version,
          remaining_distance_bucket_meters, reason_code, occurred_at, expected_revision,
          resulting_revision, idempotency_key_hash, route_fingerprint, receipt_json
        ) VALUES (
          ${command.identity.scenicAreaId}, ${command.sessionId}, ${transition.eventKind}, ${receipt.networkRevision}, ${receipt.operationalVersion},
          ${receipt.remainingDistanceBucketMeters}, ${navigationReasonCode(command.input)}, ${command.occurredAt}, ${command.input.expectedRevision},
          ${receipt.revision}, ${command.idempotencyKeyHash}, ${receipt.routeFingerprint}, ${transaction.json(receipt)}
        )
      `;
      return { state: "APPLIED" as const, action: command.input.action, session: receipt };
    });
  },

  async listHistory({ identity, limit, cursor }) {
    const decoded = decodeCursor(cursor);
    if (cursor !== null && !decoded) return null;
    const sql = getDatabase();
    const account = await sql<{ id: string }[]>`
      SELECT id FROM visitor_accounts
      WHERE scenic_area_id = ${identity.scenicAreaId} AND id = ${identity.accountId} AND subject = ${identity.subject}
      LIMIT 1
    `;
    if (!account[0]) return null;
    const rows = await sql<SessionRow[]>`
      SELECT session.id, session.scenic_area_id, session.account_id, session.network_revision_id, session.operational_version_id, session.route_fingerprint,
             session.optimization_strategy, session.origin_node_code, session.destination_node_code,
             session.session_status, session.last_remaining_distance_meters, session.started_at,
             session.completed_at, session.expires_at, session.created_at, session.updated_at,
             session.revision, session.initial_distance_meters, session.estimated_minutes,
             network.revision AS network_revision, operational.operational_version
      FROM navigation_sessions session
      INNER JOIN route_network_revisions network ON network.id = session.network_revision_id AND network.scenic_area_id = session.scenic_area_id
      INNER JOIN route_operational_versions operational ON operational.id = session.operational_version_id AND operational.scenic_area_id = session.scenic_area_id
      WHERE session.scenic_area_id = ${identity.scenicAreaId} AND session.account_id = ${identity.accountId}
        AND session.create_idempotency_key_hash IS NOT NULL
        AND (${decoded?.createdAt ?? null}::timestamptz IS NULL OR (session.created_at, session.id) < (${decoded?.createdAt ?? null}::timestamptz, ${decoded?.id ?? null}::uuid))
      ORDER BY session.created_at DESC, session.id DESC
      LIMIT ${limit + 1}
    `;
    const mapped = rows.map(mapSession);
    const sessions = mapped.slice(0, limit);
    return { sessions, nextCursor: mapped.length > limit && sessions.length ? encodeCursor(sessions[sessions.length - 1]) : null };
  },
};
