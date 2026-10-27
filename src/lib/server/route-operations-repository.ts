import "server-only";

import type {
  RouteClosureEffectiveState,
  RouteClosureReceipt,
  RouteOperationsEdge,
  RouteOperationsOverview,
  RouteOperationsSnapshot,
} from "../route-operations-contract";
import { getDatabase } from "./database";
import type { RouteOperationsRepository } from "./route-operations-service";

type SnapshotRow = {
  snapshot_revision: number;
  network_revision_id: string;
  network_revision: string;
  operational_version: number;
  valid_until: Date | string;
};

type EdgeRow = {
  id: string;
  edge_code: string;
  from_node_code: string;
  to_node_code: string;
  distance_meters: number | string;
  safety_state: RouteOperationsEdge["safetyState"];
  operational_status: RouteOperationsEdge["operationalStatus"];
};

type ClosureRow = {
  id: string;
  scenic_area_id: string;
  network_revision_id: string;
  edge_id: string;
  edge_code: string;
  status: RouteClosureReceipt["status"];
  incident_type: RouteClosureReceipt["incidentType"];
  operator_note: string;
  source_reference: string;
  reason_reference: string;
  starts_at: Date | string;
  expires_at: Date | string;
  expected_revision: number;
  workflow_revision: 1 | 2;
  review_decision: RouteClosureReceipt["reviewDecision"];
  preauthorized_by_subject: string;
  created_at: Date | string;
  reviewed_by_subject: string | null;
  reviewed_at: Date | string | null;
  review_evidence_reference: string | null;
  withdrawn_at: Date | string | null;
};

type ActionReplayRow = ClosureRow & {
  action: "ACTIVATE" | "CONFIRM" | "WITHDRAW";
  actor_oidc_subject: string;
  expected_workflow_revision: number;
  action_evidence_reference: string;
};

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_route_operations_timestamp");
  return date.toISOString();
}

function nullableIso(value: Date | string | null) {
  return value === null ? null : toIso(value);
}

function effectiveState(row: ClosureRow, at: Date): RouteClosureEffectiveState {
  if (row.withdrawn_at !== null) return "WITHDRAWN";
  if (new Date(row.expires_at).getTime() <= at.getTime()) return "EXPIRED";
  if (new Date(row.starts_at).getTime() > at.getTime()) return "SCHEDULED";
  return row.workflow_revision === 2 ? "ACTIVE_CONFIRMED" : "ACTIVE_PENDING_REVIEW";
}

function mapClosure(row: ClosureRow, at: Date): RouteClosureReceipt {
  return {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    networkRevisionId: row.network_revision_id,
    edgeId: row.edge_id,
    edgeCode: row.edge_code,
    status: row.status,
    incidentType: row.incident_type,
    operatorNote: row.operator_note,
    sourceReference: row.source_reference,
    reasonEvidenceReference: row.reason_reference,
    startsAt: toIso(row.starts_at),
    expiresAt: toIso(row.expires_at),
    expectedSnapshotRevision: row.expected_revision,
    workflowRevision: row.workflow_revision,
    reviewDecision: row.review_decision,
    activatedBySubject: row.preauthorized_by_subject,
    activatedAt: toIso(row.created_at),
    reviewedBySubject: row.reviewed_by_subject,
    reviewedAt: nullableIso(row.reviewed_at),
    reviewEvidenceReference: row.review_evidence_reference,
    withdrawnAt: nullableIso(row.withdrawn_at),
    effectiveState: effectiveState(row, at),
  };
}

function mapSnapshot(row: SnapshotRow): RouteOperationsSnapshot {
  return {
    snapshotRevision: row.snapshot_revision,
    networkRevisionId: row.network_revision_id,
    networkRevision: row.network_revision,
    operationalVersion: row.operational_version,
    validUntil: toIso(row.valid_until),
  };
}

function mapEdge(row: EdgeRow): RouteOperationsEdge {
  const distanceMeters = Number(row.distance_meters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error("invalid_route_edge_distance");
  return {
    id: row.id,
    edgeCode: row.edge_code,
    fromNodeCode: row.from_node_code,
    toNodeCode: row.to_node_code,
    distanceMeters,
    safetyState: row.safety_state,
    operationalStatus: row.operational_status,
  };
}

export const postgresRouteOperationsRepository: RouteOperationsRepository = {
  async readOverview(command) {
    const sql = getDatabase();
    const at = new Date(command.at);
    const snapshots = await sql<SnapshotRow[]>`
      SELECT snapshot.snapshot_revision, snapshot.network_revision_id, network.revision AS network_revision,
             operational.operational_version,
             LEAST(snapshot.expires_at, publication.valid_until, network.valid_until, operational.expires_at) AS valid_until
      FROM scenic_published_snapshots AS snapshot
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id AND publication.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN route_network_revisions AS network
        ON network.id = snapshot.network_revision_id AND network.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN data_sources AS source
        ON source.id = network.source_id AND source.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN route_operational_versions AS operational
        ON operational.id = snapshot.operational_version_id
       AND operational.scenic_area_id = snapshot.scenic_area_id
       AND operational.network_revision_id = snapshot.network_revision_id
      WHERE snapshot.scenic_area_id = ${command.actor.scenicAreaId}
        AND snapshot.lifecycle_state = 'PUBLISHED' AND snapshot.published_at IS NOT NULL
        AND snapshot.published_by_subject IS NOT NULL AND snapshot.withdrawn_at IS NULL AND snapshot.expires_at > ${command.at}
        AND publication.lifecycle_state = 'PUBLISHED' AND publication.published_at IS NOT NULL
        AND publication.published_by_subject IS NOT NULL AND publication.withdrawn_at IS NULL AND publication.valid_until > ${command.at}
        AND network.lifecycle_state = 'PUBLISHED' AND network.verification_state = 'FIELD_VERIFIED'
        AND network.coordinate_system = 'WGS84' AND network.valid_until > ${command.at}
        AND source.license_state = 'CLEARED' AND source.verified_at IS NOT NULL
        AND source.verified_by_subject IS NOT NULL AND source.valid_until > ${command.at}
        AND operational.lifecycle_state = 'PUBLISHED' AND operational.published_by_subject IS NOT NULL
        AND operational.issued_at <= ${command.at} AND operational.expires_at > ${command.at}
      ORDER BY snapshot.snapshot_revision DESC
      LIMIT 1
    `;
    const snapshot = snapshots[0] ? mapSnapshot(snapshots[0]) : null;
    const edges = snapshot
      ? await sql<EdgeRow[]>`
          SELECT edge.id, edge.edge_code, from_node.node_code AS from_node_code, to_node.node_code AS to_node_code,
                 edge.distance_meters, edge.safety_state, state.status AS operational_status
          FROM route_edges AS edge
          INNER JOIN route_nodes AS from_node ON from_node.network_revision_id = edge.network_revision_id AND from_node.id = edge.from_node_id
          INNER JOIN route_nodes AS to_node ON to_node.network_revision_id = edge.network_revision_id AND to_node.id = edge.to_node_id
          INNER JOIN route_edge_operational_states AS state
            ON state.network_revision_id = edge.network_revision_id AND state.edge_id = edge.id
          INNER JOIN scenic_published_snapshots AS snapshot
            ON snapshot.operational_version_id = state.operational_version_id
           AND snapshot.network_revision_id = edge.network_revision_id
           AND snapshot.scenic_area_id = ${command.actor.scenicAreaId}
           AND snapshot.snapshot_revision = ${snapshot.snapshotRevision}
          WHERE edge.network_revision_id = ${snapshot.networkRevisionId}
          ORDER BY edge.edge_code ASC
        `
      : [];
    const events = snapshot
      ? await sql<ClosureRow[]>`
          SELECT closure.id, closure.scenic_area_id, closure.network_revision_id, closure.edge_id, edge.edge_code,
                 closure.status, closure.incident_type, closure.operator_note, closure.source_reference,
                 closure.reason_reference, closure.starts_at, closure.expires_at, closure.expected_revision,
                 closure.workflow_revision, closure.review_decision, closure.preauthorized_by_subject,
                 closure.created_at, closure.reviewed_by_subject, closure.reviewed_at,
                 closure.review_evidence_reference, closure.withdrawn_at
          FROM closure_events AS closure
          INNER JOIN route_edges AS edge ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
          WHERE closure.scenic_area_id = ${command.actor.scenicAreaId}
            AND closure.network_revision_id = ${snapshot.networkRevisionId}
          ORDER BY closure.created_at DESC
          LIMIT 100
        `
      : [];
    return {
      schemaVersion: 1,
      scenicAreaId: command.actor.scenicAreaId,
      actorRole: command.actor.role,
      serverTime: at.toISOString(),
      snapshot,
      edges: edges.map(mapEdge),
      events: events.map((row) => mapClosure(row, at)),
    } satisfies RouteOperationsOverview;
  },

  async activate(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`${command.actor.scenicAreaId}:${command.idempotencyKeyHash}`}))`;
      const replayRows = await transaction<ActionReplayRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               closure.id, closure.scenic_area_id, closure.network_revision_id, closure.edge_id, edge.edge_code,
               closure.status, closure.incident_type, closure.operator_note, closure.source_reference,
               closure.reason_reference, closure.starts_at, closure.expires_at, closure.expected_revision,
               closure.workflow_revision, closure.review_decision, closure.preauthorized_by_subject,
               closure.created_at, closure.reviewed_by_subject, closure.reviewed_at,
               closure.review_evidence_reference, closure.withdrawn_at
        FROM route_closure_event_actions AS action
        INNER JOIN closure_events AS closure ON closure.id = action.closure_event_id AND closure.scenic_area_id = action.scenic_area_id
        INNER JOIN route_edges AS edge ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      if (replay) {
        if (
          replay.action !== "ACTIVATE" || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== 0 || replay.action_evidence_reference !== command.sourceReference
          || replay.edge_id !== command.edgeId || replay.status !== command.status || replay.incident_type !== command.incidentType
          || replay.operator_note !== command.operatorNote || replay.reason_reference !== command.reasonEvidenceReference
          || toIso(replay.starts_at) !== command.startsAt || toIso(replay.expires_at) !== command.expiresAt
          || replay.expected_revision !== command.expectedSnapshotRevision
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapClosure(replay, new Date(command.occurredAt)) };
      }

      const snapshots = await transaction<SnapshotRow[]>`
        SELECT snapshot.snapshot_revision, snapshot.network_revision_id, network.revision AS network_revision,
               operational.operational_version,
               LEAST(snapshot.expires_at, publication.valid_until, network.valid_until, operational.expires_at) AS valid_until
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
        WHERE snapshot.scenic_area_id = ${command.actor.scenicAreaId}
          AND snapshot.lifecycle_state = 'PUBLISHED' AND snapshot.published_at IS NOT NULL
          AND snapshot.published_by_subject IS NOT NULL AND snapshot.withdrawn_at IS NULL AND snapshot.expires_at > ${command.occurredAt}
          AND publication.lifecycle_state = 'PUBLISHED' AND publication.published_at IS NOT NULL
          AND publication.published_by_subject IS NOT NULL AND publication.withdrawn_at IS NULL AND publication.valid_until > ${command.occurredAt}
          AND network.lifecycle_state = 'PUBLISHED' AND network.verification_state = 'FIELD_VERIFIED'
          AND network.coordinate_system = 'WGS84' AND network.valid_until > ${command.occurredAt}
          AND source.license_state = 'CLEARED' AND source.verified_at IS NOT NULL
          AND source.verified_by_subject IS NOT NULL AND source.valid_until > ${command.occurredAt}
          AND operational.lifecycle_state = 'PUBLISHED' AND operational.published_by_subject IS NOT NULL
          AND operational.issued_at <= ${command.occurredAt} AND operational.expires_at > ${command.occurredAt}
        ORDER BY snapshot.snapshot_revision DESC
        LIMIT 1
      `;
      const snapshot = snapshots[0];
      if (!snapshot) return { state: "NO_CURRENT_NETWORK" as const };
      if (snapshot.snapshot_revision !== command.expectedSnapshotRevision) return { state: "EDGE_NOT_CURRENT_OR_STALE" as const };

      const edgeRows = await transaction<EdgeRow[]>`
        SELECT edge.id, edge.edge_code, from_node.node_code AS from_node_code, to_node.node_code AS to_node_code,
               edge.distance_meters, edge.safety_state, state.status AS operational_status
        FROM route_edges AS edge
        INNER JOIN route_nodes AS from_node ON from_node.network_revision_id = edge.network_revision_id AND from_node.id = edge.from_node_id
        INNER JOIN route_nodes AS to_node ON to_node.network_revision_id = edge.network_revision_id AND to_node.id = edge.to_node_id
        INNER JOIN route_edge_operational_states AS state
          ON state.network_revision_id = edge.network_revision_id AND state.edge_id = edge.id
        INNER JOIN scenic_published_snapshots AS published
          ON published.operational_version_id = state.operational_version_id
         AND published.network_revision_id = edge.network_revision_id
         AND published.scenic_area_id = ${command.actor.scenicAreaId}
         AND published.snapshot_revision = ${command.expectedSnapshotRevision}
        WHERE edge.network_revision_id = ${snapshot.network_revision_id}
          AND edge.id = ${command.edgeId}
          AND edge.safety_state = 'OPEN' AND state.status = 'OPEN'
        FOR UPDATE OF edge
      `;
      const edge = edgeRows[0];
      if (!edge) return { state: "EDGE_NOT_CURRENT_OR_STALE" as const };
      const overlaps = await transaction<{ id: string }[]>`
        SELECT id FROM closure_events
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND network_revision_id = ${snapshot.network_revision_id}
          AND edge_id = ${command.edgeId}
          AND withdrawn_at IS NULL
          AND starts_at < ${command.expiresAt}
          AND expires_at > ${command.startsAt}
        LIMIT 1
      `;
      if (overlaps[0]) return { state: "ACTIVE_EVENT_EXISTS" as const };

      const createdRows = await transaction<ClosureRow[]>`
        WITH inserted AS (
          INSERT INTO closure_events (
            scenic_area_id, network_revision_id, edge_id, status, incident_type, operator_note,
            source_reference, reason_reference, starts_at, expires_at, expected_revision,
            idempotency_key_hash, preauthorized_by_subject, workflow_revision, created_at, updated_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${snapshot.network_revision_id}, ${command.edgeId}, ${command.status},
            ${command.incidentType}, ${command.operatorNote}, ${command.sourceReference}, ${command.reasonEvidenceReference},
            ${command.startsAt}, ${command.expiresAt}, ${command.expectedSnapshotRevision}, ${command.idempotencyKeyHash},
            ${command.actor.oidcSubject}, 1, ${command.occurredAt}, ${command.occurredAt}
          )
          RETURNING *
        )
        SELECT inserted.id, inserted.scenic_area_id, inserted.network_revision_id, inserted.edge_id, edge.edge_code,
               inserted.status, inserted.incident_type, inserted.operator_note, inserted.source_reference,
               inserted.reason_reference, inserted.starts_at, inserted.expires_at, inserted.expected_revision,
               inserted.workflow_revision, inserted.review_decision, inserted.preauthorized_by_subject,
               inserted.created_at, inserted.reviewed_by_subject, inserted.reviewed_at,
               inserted.review_evidence_reference, inserted.withdrawn_at
        FROM inserted
        INNER JOIN route_edges AS edge ON edge.network_revision_id = inserted.network_revision_id AND edge.id = inserted.edge_id
      `;
      const created = createdRows[0];
      if (!created) throw new Error("closure_insert_failed");
      await transaction`
        INSERT INTO route_closure_event_actions (
          scenic_area_id, closure_event_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${created.id}, 'ACTIVATE', ${command.actor.oidcSubject}, 'OPERATIONS_EMERGENCY',
          0, 1, ${command.idempotencyKeyHash}, ${command.sourceReference},
          ${transaction.json({ edgeId: command.edgeId, status: command.status, incidentType: command.incidentType, expectedSnapshotRevision: command.expectedSnapshotRevision })},
          ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'OPERATIONS_EMERGENCY', 'ROUTE_CLOSURE_ACTIVATED',
          'CLOSURE_EVENT', ${created.id}, ${command.expectedSnapshotRevision}, ${command.idempotencyKeyHash},
          ${command.sourceReference},
          ${transaction.json({ edgeId: command.edgeId, edgeCode: edge.edge_code, status: command.status, incidentType: command.incidentType, startsAt: command.startsAt, expiresAt: command.expiresAt })},
          ${command.occurredAt}
        )
      `;
      return { state: "CREATED" as const, receipt: mapClosure(created, new Date(command.occurredAt)) };
    });
  },

  async review(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`${command.actor.scenicAreaId}:${command.idempotencyKeyHash}`}))`;
      const replayRows = await transaction<ActionReplayRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               closure.id, closure.scenic_area_id, closure.network_revision_id, closure.edge_id, edge.edge_code,
               closure.status, closure.incident_type, closure.operator_note, closure.source_reference,
               closure.reason_reference, closure.starts_at, closure.expires_at, closure.expected_revision,
               closure.workflow_revision, closure.review_decision, closure.preauthorized_by_subject,
               closure.created_at, closure.reviewed_by_subject, closure.reviewed_at,
               closure.review_evidence_reference, closure.withdrawn_at
        FROM route_closure_event_actions AS action
        INNER JOIN closure_events AS closure ON closure.id = action.closure_event_id AND closure.scenic_area_id = action.scenic_area_id
        INNER JOIN route_edges AS edge ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      const action = command.decision === "CONFIRMED" ? "CONFIRM" : "WITHDRAW";
      if (replay) {
        if (
          replay.action !== action || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== command.expectedWorkflowRevision
          || replay.action_evidence_reference !== command.reviewEvidenceReference
          || replay.id !== command.closureEventId
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapClosure(replay, new Date(command.occurredAt)) };
      }

      const rows = await transaction<ClosureRow[]>`
        SELECT closure.id, closure.scenic_area_id, closure.network_revision_id, closure.edge_id, edge.edge_code,
               closure.status, closure.incident_type, closure.operator_note, closure.source_reference,
               closure.reason_reference, closure.starts_at, closure.expires_at, closure.expected_revision,
               closure.workflow_revision, closure.review_decision, closure.preauthorized_by_subject,
               closure.created_at, closure.reviewed_by_subject, closure.reviewed_at,
               closure.review_evidence_reference, closure.withdrawn_at
        FROM closure_events AS closure
        INNER JOIN route_edges AS edge ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
        WHERE closure.scenic_area_id = ${command.actor.scenicAreaId} AND closure.id = ${command.closureEventId}
        FOR UPDATE OF closure
      `;
      const current = rows[0];
      if (!current) return { state: "NOT_FOUND" as const };
      if (current.preauthorized_by_subject === command.actor.oidcSubject) return { state: "ACTIVATOR_CANNOT_REVIEW" as const };
      if (current.workflow_revision !== command.expectedWorkflowRevision || current.review_decision !== null) return { state: "REVISION_CONFLICT" as const };

      const updatedRows = await transaction<ClosureRow[]>`
        WITH updated AS (
          UPDATE closure_events
          SET workflow_revision = 2, review_decision = ${command.decision},
              reviewed_by_subject = ${command.actor.oidcSubject}, reviewed_at = ${command.occurredAt},
              review_evidence_reference = ${command.reviewEvidenceReference},
              withdrawn_at = ${command.decision === "WITHDRAWN" ? command.occurredAt : null},
              withdrawn_by_subject = ${command.decision === "WITHDRAWN" ? command.actor.oidcSubject : null},
              updated_at = ${command.occurredAt}
          WHERE scenic_area_id = ${command.actor.scenicAreaId} AND id = ${command.closureEventId}
            AND workflow_revision = 1 AND review_decision IS NULL
          RETURNING *
        )
        SELECT updated.id, updated.scenic_area_id, updated.network_revision_id, updated.edge_id, edge.edge_code,
               updated.status, updated.incident_type, updated.operator_note, updated.source_reference,
               updated.reason_reference, updated.starts_at, updated.expires_at, updated.expected_revision,
               updated.workflow_revision, updated.review_decision, updated.preauthorized_by_subject,
               updated.created_at, updated.reviewed_by_subject, updated.reviewed_at,
               updated.review_evidence_reference, updated.withdrawn_at
        FROM updated
        INNER JOIN route_edges AS edge ON edge.network_revision_id = updated.network_revision_id AND edge.id = updated.edge_id
      `;
      const updated = updatedRows[0];
      if (!updated) return { state: "REVISION_CONFLICT" as const };
      await transaction`
        INSERT INTO route_closure_event_actions (
          scenic_area_id, closure_event_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.closureEventId}, ${action}, ${command.actor.oidcSubject}, 'RELEASE_ADMIN',
          1, 2, ${command.idempotencyKeyHash}, ${command.reviewEvidenceReference},
          ${transaction.json({ decision: command.decision, withdrawalDoesNotAssertOpen: command.decision === "WITHDRAWN" })},
          ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'RELEASE_ADMIN', ${command.decision === "CONFIRMED" ? "ROUTE_CLOSURE_CONFIRMED" : "ROUTE_CLOSURE_WITHDRAWN"},
          'CLOSURE_EVENT', ${command.closureEventId}, 1, ${command.idempotencyKeyHash},
          ${command.reviewEvidenceReference}, ${transaction.json({ resultingWorkflowRevision: 2, decision: command.decision })},
          ${command.occurredAt}
        )
      `;
      return { state: "UPDATED" as const, receipt: mapClosure(updated, new Date(command.occurredAt)) };
    });
  },
};
