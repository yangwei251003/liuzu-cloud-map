import "server-only";

import type postgres from "postgres";

import type {
  RouteOperationalObservationEdge,
  RouteOperationalObservationOverview,
  RouteOperationalObservationReceipt,
  RouteOperationalObservationSnapshot,
} from "../route-operational-observation-contract";
import { getDatabase } from "./database";
import type { RouteOperationalObservationRepository } from "./route-operational-observation-service";

type Timestamp = Date | string;

type SnapshotRow = {
  id: string;
  network_revision_id: string;
  network_revision: string;
  operational_version_id: string;
  operational_version: number;
  snapshot_revision: number;
  valid_until: Timestamp;
};

type EdgeRow = {
  id: string;
  edge_code: string;
  from_node_code: string;
  to_node_code: string;
  distance_meters: number | string;
  operational_status: "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";
  travel_time_multiplier: number | string | null;
  crowd_level: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN" | null;
  weather_impact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE" | "UNKNOWN" | null;
};

type ObservationRow = {
  id: string;
  scenic_area_id: string;
  network_revision_id: string;
  edge_id: string;
  edge_code: string;
  crowd_level: "LOW" | "MODERATE" | "HIGH";
  weather_impact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE";
  travel_time_multiplier: number | string;
  operator_note: string;
  source_reference: string;
  observed_at: Timestamp;
  expires_at: Timestamp;
  expected_snapshot_revision: number;
  workflow_revision: 1 | 2;
  review_decision: "CONFIRMED" | "REJECTED" | null;
  submitted_by_subject: string;
  submitted_at: Timestamp;
  reviewed_by_subject: string | null;
  reviewed_at: Timestamp | null;
  review_evidence_reference: string | null;
};

type ObservationActionRow = ObservationRow & {
  action: "SUBMIT" | "CONFIRM" | "REJECT";
  actor_oidc_subject: string;
  expected_workflow_revision: number;
  action_evidence_reference: string;
};

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_route_operational_observation_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function mapSnapshot(row: SnapshotRow): RouteOperationalObservationSnapshot {
  return {
    snapshotRevision: Number(row.snapshot_revision),
    networkRevisionId: row.network_revision_id,
    networkRevision: row.network_revision,
    operationalVersion: Number(row.operational_version),
    validUntil: toIso(row.valid_until),
  };
}

function mapEdge(row: EdgeRow): RouteOperationalObservationEdge {
  return {
    id: row.id,
    edgeCode: row.edge_code,
    fromNodeCode: row.from_node_code,
    toNodeCode: row.to_node_code,
    distanceMeters: Number(row.distance_meters),
    operationalStatus: row.operational_status,
    currentTravelTimeMultiplier: row.travel_time_multiplier === null ? null : Number(row.travel_time_multiplier),
    currentCrowdLevel: row.crowd_level,
    currentWeatherImpact: row.weather_impact,
  };
}

function mapObservation(row: ObservationRow, at: string): RouteOperationalObservationReceipt {
  const expired = new Date(row.expires_at).getTime() <= new Date(at).getTime();
  const effectiveState = expired
    ? "EXPIRED" as const
    : row.workflow_revision === 1
      ? "PENDING_REVIEW" as const
      : row.review_decision === "CONFIRMED" ? "CONFIRMED" as const : "REJECTED" as const;
  return {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    networkRevisionId: row.network_revision_id,
    edgeId: row.edge_id,
    edgeCode: row.edge_code,
    crowdLevel: row.crowd_level,
    weatherImpact: row.weather_impact,
    travelTimeMultiplier: Number(row.travel_time_multiplier),
    operatorNote: row.operator_note,
    sourceReference: row.source_reference,
    observedAt: toIso(row.observed_at),
    expiresAt: toIso(row.expires_at),
    expectedSnapshotRevision: Number(row.expected_snapshot_revision),
    workflowRevision: Number(row.workflow_revision) as 1 | 2,
    reviewDecision: row.review_decision,
    submittedBySubject: row.submitted_by_subject,
    submittedAt: toIso(row.submitted_at),
    reviewedBySubject: row.reviewed_by_subject,
    reviewedAt: nullableIso(row.reviewed_at),
    reviewEvidenceReference: row.review_evidence_reference,
    effectiveState,
  };
}

type QueryableSql = postgres.Sql | postgres.TransactionSql;

async function readCurrentSnapshot(sql: QueryableSql, scenicAreaId: string, at: string, lock = false) {
  const rows = await sql<SnapshotRow[]>`
    SELECT snapshot.id, snapshot.network_revision_id, network.revision AS network_revision,
           snapshot.operational_version_id, operational.operational_version, snapshot.snapshot_revision,
           LEAST(snapshot.expires_at, publication.valid_until, network.valid_until, source.valid_until, operational.expires_at) AS valid_until
    FROM scenic_published_snapshots AS snapshot
    INNER JOIN scenic_area_publications AS publication
      ON publication.id = snapshot.publication_id AND publication.scenic_area_id = snapshot.scenic_area_id
    INNER JOIN route_network_revisions AS network
      ON network.id = snapshot.network_revision_id AND network.scenic_area_id = snapshot.scenic_area_id
    INNER JOIN data_sources AS source
      ON source.id = network.source_id AND source.scenic_area_id = snapshot.scenic_area_id
    INNER JOIN route_operational_versions AS operational
      ON operational.id = snapshot.operational_version_id AND operational.scenic_area_id = snapshot.scenic_area_id
     AND operational.network_revision_id = snapshot.network_revision_id
    WHERE snapshot.scenic_area_id = ${scenicAreaId}
      AND snapshot.lifecycle_state = 'PUBLISHED' AND snapshot.published_at IS NOT NULL
      AND snapshot.published_by_subject IS NOT NULL AND snapshot.withdrawn_at IS NULL AND snapshot.expires_at > ${at}
      AND publication.lifecycle_state = 'PUBLISHED' AND publication.published_at IS NOT NULL
      AND publication.published_by_subject IS NOT NULL AND publication.withdrawn_at IS NULL AND publication.valid_until > ${at}
      AND network.lifecycle_state = 'PUBLISHED' AND network.verification_state = 'FIELD_VERIFIED'
      AND network.coordinate_system = 'WGS84' AND network.valid_until > ${at}
      AND source.license_state = 'CLEARED' AND source.verified_at IS NOT NULL
      AND source.verified_by_subject IS NOT NULL AND source.valid_until > ${at}
      AND operational.lifecycle_state = 'PUBLISHED' AND operational.published_by_subject IS NOT NULL
      AND operational.issued_at <= ${at} AND operational.expires_at > ${at}
    ORDER BY snapshot.snapshot_revision DESC
    LIMIT 1
    ${lock ? sql`FOR UPDATE OF snapshot, operational` : sql``}
  `;
  return rows[0] ?? null;
}

async function readEdges(sql: QueryableSql, snapshot: SnapshotRow) {
  return sql<EdgeRow[]>`
    SELECT edge.id, edge.edge_code, from_node.node_code AS from_node_code, to_node.node_code AS to_node_code,
           edge.distance_meters, state.status AS operational_status, state.travel_time_multiplier,
           state.crowd_level, state.weather_impact
    FROM route_edges AS edge
    INNER JOIN route_nodes AS from_node
      ON from_node.network_revision_id = edge.network_revision_id AND from_node.id = edge.from_node_id
    INNER JOIN route_nodes AS to_node
      ON to_node.network_revision_id = edge.network_revision_id AND to_node.id = edge.to_node_id
    INNER JOIN route_edge_operational_states AS state
      ON state.network_revision_id = edge.network_revision_id AND state.edge_id = edge.id
     AND state.operational_version_id = ${snapshot.operational_version_id}
    WHERE edge.network_revision_id = ${snapshot.network_revision_id}
    ORDER BY edge.edge_code
  `;
}

export const postgresRouteOperationalObservationRepository: RouteOperationalObservationRepository = {
  async readOverview(command) {
    const sql = getDatabase();
    const snapshot = await readCurrentSnapshot(sql, command.actor.scenicAreaId, command.at);
    const edges = snapshot ? await readEdges(sql, snapshot) : [];
    const observations = snapshot ? await sql<ObservationRow[]>`
      SELECT observation.id, observation.scenic_area_id, observation.network_revision_id, observation.edge_id,
             edge.edge_code, observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
             observation.operator_note, observation.source_reference, observation.observed_at, observation.expires_at,
             observation.expected_snapshot_revision, observation.workflow_revision, observation.review_decision,
             observation.submitted_by_subject, observation.submitted_at, observation.reviewed_by_subject,
             observation.reviewed_at, observation.review_evidence_reference
      FROM route_operational_observations AS observation
      INNER JOIN route_edges AS edge
        ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
      WHERE observation.scenic_area_id = ${command.actor.scenicAreaId}
        AND observation.network_revision_id = ${snapshot.network_revision_id}
      ORDER BY observation.submitted_at DESC, observation.id DESC
      LIMIT 200
    ` : [];
    return {
      schemaVersion: 1,
      scenicAreaId: command.actor.scenicAreaId,
      actorRole: command.actor.role,
      serverTime: toIso(command.at),
      snapshot: snapshot ? mapSnapshot(snapshot) : null,
      edges: edges.map(mapEdge),
      observations: observations.map((row) => mapObservation(row, command.at)),
    } satisfies RouteOperationalObservationOverview;
  },

  async submit(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`route-operational-observation:${command.actor.scenicAreaId}`}))`;
      const replayRows = await transaction<ObservationActionRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               observation.id, observation.scenic_area_id, observation.network_revision_id, observation.edge_id,
               edge.edge_code, observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
               observation.operator_note, observation.source_reference, observation.observed_at, observation.expires_at,
               observation.expected_snapshot_revision, observation.workflow_revision, observation.review_decision,
               observation.submitted_by_subject, observation.submitted_at, observation.reviewed_by_subject,
               observation.reviewed_at, observation.review_evidence_reference
        FROM route_operational_observation_actions AS action
        INNER JOIN route_operational_observations AS observation
          ON observation.id = action.observation_id AND observation.scenic_area_id = action.scenic_area_id
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      if (replay) {
        if (
          replay.action !== "SUBMIT" || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== 0 || replay.action_evidence_reference !== command.sourceReference
          || replay.edge_id !== command.edgeId || replay.crowd_level !== command.crowdLevel
          || replay.weather_impact !== command.weatherImpact || Number(replay.travel_time_multiplier) !== command.travelTimeMultiplier
          || replay.operator_note !== command.operatorNote || toIso(replay.observed_at) !== command.observedAt
          || toIso(replay.expires_at) !== command.expiresAt || replay.expected_snapshot_revision !== command.expectedSnapshotRevision
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapObservation(replay, command.occurredAt) };
      }

      const snapshot = await readCurrentSnapshot(transaction, command.actor.scenicAreaId, command.occurredAt, true);
      if (!snapshot) return { state: "NO_CURRENT_NETWORK" as const };
      if (snapshot.snapshot_revision !== command.expectedSnapshotRevision) return { state: "EDGE_NOT_CURRENT_OR_STALE" as const };
      const edgeRows = await transaction<EdgeRow[]>`
        SELECT edge.id, edge.edge_code, from_node.node_code AS from_node_code, to_node.node_code AS to_node_code,
               edge.distance_meters, state.status AS operational_status, state.travel_time_multiplier,
               state.crowd_level, state.weather_impact
        FROM route_edges AS edge
        INNER JOIN route_nodes AS from_node ON from_node.network_revision_id = edge.network_revision_id AND from_node.id = edge.from_node_id
        INNER JOIN route_nodes AS to_node ON to_node.network_revision_id = edge.network_revision_id AND to_node.id = edge.to_node_id
        INNER JOIN route_edge_operational_states AS state
          ON state.network_revision_id = edge.network_revision_id AND state.edge_id = edge.id
         AND state.operational_version_id = ${snapshot.operational_version_id}
        WHERE edge.network_revision_id = ${snapshot.network_revision_id} AND edge.id = ${command.edgeId}
          AND edge.safety_state = 'OPEN' AND state.status = 'OPEN' AND state.expires_at > ${command.occurredAt}
        FOR UPDATE OF edge, state
      `;
      if (!edgeRows[0]) return { state: "EDGE_NOT_CURRENT_OR_STALE" as const };
      const pending = await transaction<{ id: string }[]>`
        SELECT id FROM route_operational_observations
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND network_revision_id = ${snapshot.network_revision_id} AND edge_id = ${command.edgeId}
          AND workflow_revision = 1 AND expires_at > ${command.occurredAt}
        LIMIT 1
        FOR UPDATE
      `;
      if (pending[0]) return { state: "ACTIVE_OBSERVATION_EXISTS" as const };
      const insertedRows = await transaction<ObservationRow[]>`
        WITH inserted AS (
          INSERT INTO route_operational_observations (
            scenic_area_id, network_revision_id, edge_id, crowd_level, weather_impact,
            travel_time_multiplier, operator_note, source_reference, observed_at, expires_at,
            expected_snapshot_revision, workflow_revision, review_decision,
            submitted_by_subject, submitted_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${snapshot.network_revision_id}, ${command.edgeId}, ${command.crowdLevel}, ${command.weatherImpact},
            ${command.travelTimeMultiplier}, ${command.operatorNote}, ${command.sourceReference}, ${command.observedAt}, ${command.expiresAt},
            ${command.expectedSnapshotRevision}, 1, NULL, ${command.actor.oidcSubject}, ${command.occurredAt}
          ) RETURNING *
        )
        SELECT inserted.id, inserted.scenic_area_id, inserted.network_revision_id, inserted.edge_id,
               edge.edge_code, inserted.crowd_level, inserted.weather_impact, inserted.travel_time_multiplier,
               inserted.operator_note, inserted.source_reference, inserted.observed_at, inserted.expires_at,
               inserted.expected_snapshot_revision, inserted.workflow_revision, inserted.review_decision,
               inserted.submitted_by_subject, inserted.submitted_at, inserted.reviewed_by_subject,
               inserted.reviewed_at, inserted.review_evidence_reference
        FROM inserted INNER JOIN route_edges AS edge
          ON edge.network_revision_id = inserted.network_revision_id AND edge.id = inserted.edge_id
      `;
      const inserted = insertedRows[0];
      if (!inserted) throw new Error("route_operational_observation_insert_failed");
      await transaction`
        INSERT INTO route_operational_observation_actions (
          scenic_area_id, observation_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${inserted.id}, 'SUBMIT', ${command.actor.oidcSubject}, 'OPERATIONS_EDITOR',
          0, 1, ${command.idempotencyKeyHash}, ${command.sourceReference},
          ${transaction.json({ edgeId: command.edgeId, crowdLevel: command.crowdLevel, weatherImpact: command.weatherImpact, travelTimeMultiplier: command.travelTimeMultiplier })},
          ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'OPERATIONS_EDITOR',
          'ROUTE_OPERATIONAL_OBSERVATION_SUBMITTED', 'ROUTE_OPERATIONAL_OBSERVATION', ${inserted.id},
          ${command.expectedSnapshotRevision}, ${command.idempotencyKeyHash}, ${command.sourceReference},
          ${transaction.json({ networkRevisionId: snapshot.network_revision_id, edgeId: command.edgeId })}, ${command.occurredAt}
        )
      `;
      return { state: "CREATED" as const, receipt: mapObservation(inserted, command.occurredAt) };
    });
  },

  async review(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`route-operational-observation:${command.actor.scenicAreaId}`}))`;
      const replayRows = await transaction<ObservationActionRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               observation.id, observation.scenic_area_id, observation.network_revision_id, observation.edge_id,
               edge.edge_code, observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
               observation.operator_note, observation.source_reference, observation.observed_at, observation.expires_at,
               observation.expected_snapshot_revision, observation.workflow_revision, observation.review_decision,
               observation.submitted_by_subject, observation.submitted_at, observation.reviewed_by_subject,
               observation.reviewed_at, observation.review_evidence_reference
        FROM route_operational_observation_actions AS action
        INNER JOIN route_operational_observations AS observation
          ON observation.id = action.observation_id AND observation.scenic_area_id = action.scenic_area_id
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      const action = command.decision === "CONFIRMED" ? "CONFIRM" : "REJECT";
      if (replay) {
        if (
          replay.action !== action || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== 1 || replay.action_evidence_reference !== command.reviewEvidenceReference
          || replay.id !== command.observationId
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapObservation(replay, command.occurredAt) };
      }
      const snapshot = await readCurrentSnapshot(transaction, command.actor.scenicAreaId, command.occurredAt, true);
      if (!snapshot) return { state: "REVISION_CONFLICT" as const };
      const rows = await transaction<ObservationRow[]>`
        SELECT observation.id, observation.scenic_area_id, observation.network_revision_id, observation.edge_id,
               edge.edge_code, observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
               observation.operator_note, observation.source_reference, observation.observed_at, observation.expires_at,
               observation.expected_snapshot_revision, observation.workflow_revision, observation.review_decision,
               observation.submitted_by_subject, observation.submitted_at, observation.reviewed_by_subject,
               observation.reviewed_at, observation.review_evidence_reference
        FROM route_operational_observations AS observation
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
        WHERE observation.scenic_area_id = ${command.actor.scenicAreaId} AND observation.id = ${command.observationId}
        FOR UPDATE OF observation
      `;
      const current = rows[0];
      if (!current) return { state: "NOT_FOUND" as const };
      if (current.submitted_by_subject === command.actor.oidcSubject) return { state: "SUBMITTER_CANNOT_REVIEW" as const };
      if (current.workflow_revision !== command.expectedWorkflowRevision || current.review_decision !== null) return { state: "REVISION_CONFLICT" as const };
      if (current.network_revision_id !== snapshot.network_revision_id || current.expected_snapshot_revision !== snapshot.snapshot_revision) return { state: "REVISION_CONFLICT" as const };
      if (new Date(current.expires_at).getTime() <= new Date(command.occurredAt).getTime()) return { state: "REVISION_CONFLICT" as const };
      const updatedRows = await transaction<ObservationRow[]>`
        WITH updated AS (
          UPDATE route_operational_observations
          SET workflow_revision = 2, review_decision = ${command.decision},
              reviewed_by_subject = ${command.actor.oidcSubject}, reviewed_at = ${command.occurredAt},
              review_evidence_reference = ${command.reviewEvidenceReference}
          WHERE scenic_area_id = ${command.actor.scenicAreaId} AND id = ${command.observationId}
            AND workflow_revision = 1 AND review_decision IS NULL
          RETURNING *
        )
        SELECT updated.id, updated.scenic_area_id, updated.network_revision_id, updated.edge_id,
               edge.edge_code, updated.crowd_level, updated.weather_impact, updated.travel_time_multiplier,
               updated.operator_note, updated.source_reference, updated.observed_at, updated.expires_at,
               updated.expected_snapshot_revision, updated.workflow_revision, updated.review_decision,
               updated.submitted_by_subject, updated.submitted_at, updated.reviewed_by_subject,
               updated.reviewed_at, updated.review_evidence_reference
        FROM updated INNER JOIN route_edges AS edge
          ON edge.network_revision_id = updated.network_revision_id AND edge.id = updated.edge_id
      `;
      const updated = updatedRows[0];
      if (!updated) throw new Error("route_operational_observation_review_failed");
      await transaction`
        INSERT INTO route_operational_observation_actions (
          scenic_area_id, observation_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${updated.id}, ${action}, ${command.actor.oidcSubject}, 'OPERATIONS_REVIEWER',
          1, 2, ${command.idempotencyKeyHash}, ${command.reviewEvidenceReference},
          ${transaction.json({ decision: command.decision })}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'OPERATIONS_REVIEWER',
          ${command.decision === "CONFIRMED" ? "ROUTE_OPERATIONAL_OBSERVATION_CONFIRMED" : "ROUTE_OPERATIONAL_OBSERVATION_REJECTED"},
          'ROUTE_OPERATIONAL_OBSERVATION', ${updated.id}, 1, ${command.idempotencyKeyHash},
          ${command.reviewEvidenceReference}, ${transaction.json({ decision: command.decision })}, ${command.occurredAt}
        )
      `;
      return { state: "UPDATED" as const, receipt: mapObservation(updated, command.occurredAt) };
    });
  },
};
