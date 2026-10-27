import "server-only";

import { createHash } from "node:crypto";

import {
  canonicalizeRouteOperationalSnapshot,
  compileRouteOperationalRelease,
  type RouteOperationalClosureEffect,
  type RouteOperationalFactorEffect,
} from "../route-operational-release-compiler";
import {
  type RouteOperationalReleaseOverview,
  type RouteOperationalReleaseReceipt,
  type RouteOperationalReleaseSnapshot,
} from "../route-operational-release-contract";
import { getSafePublishedNetwork } from "../route-network";
import { getSafeRouteOperationalState } from "../route-operational-state";
import { getDatabase } from "./database";
import type { RouteOperationalReleaseRepository } from "./route-operational-release-service";

type Timestamp = Date | string;
type BaseSnapshotRow = {
  id: string;
  publication_id: string;
  network_revision_id: string;
  network_revision: string;
  operational_version_id: string;
  operational_version: number;
  snapshot_revision: number;
  snapshot_json: unknown;
  valid_until: Timestamp;
};

type ReleaseRow = {
  id: string;
  scenic_area_id: string;
  base_snapshot_revision: number;
  target_snapshot_revision: number;
  network_revision_id: string;
  network_revision: string;
  base_operational_version: number;
  target_operational_version: number;
  workflow_revision: 1 | 2;
  lifecycle_state: "PREPARED" | "PUBLISHED";
  source_reference: string;
  reason_summary: string;
  snapshot_sha256: string;
  confirmed_event_count: number;
  confirmed_observation_count: number;
  affected_edge_count: number;
  prepared_by_subject: string;
  prepared_at: Timestamp;
  expires_at: Timestamp;
  published_by_subject: string | null;
  published_at: Timestamp | null;
  release_evidence_reference: string | null;
  base_snapshot_id?: string;
  operational_version_id?: string;
  replacement_snapshot_id?: string | null;
  snapshot_json?: unknown;
};

type ClosureEffectRow = {
  id: string;
  network_revision_id: string;
  edge_id: string;
  edge_code: string;
  status: "CLOSED" | "RESTRICTED";
  starts_at: Timestamp;
  expires_at: Timestamp;
  workflow_revision: number;
  review_decision: string | null;
  reviewed_by_subject: string | null;
  reviewed_at: Timestamp | null;
  review_evidence_reference: string | null;
  withdrawn_at: Timestamp | null;
};

type ObservationEffectRow = {
  id: string;
  network_revision_id: string;
  edge_id: string;
  edge_code: string;
  crowd_level: "LOW" | "MODERATE" | "HIGH";
  weather_impact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE";
  travel_time_multiplier: number | string;
  source_reference: string;
  observed_at: Timestamp;
  expires_at: Timestamp;
  workflow_revision: number;
  review_decision: string | null;
  reviewed_by_subject: string | null;
  reviewed_at: Timestamp | null;
  review_evidence_reference: string | null;
};

type ReleaseActionRow = ReleaseRow & {
  action: "PREPARE" | "PUBLISH";
  actor_oidc_subject: string;
  expected_workflow_revision: number;
  action_evidence_reference: string;
};

type EdgeIdentityRow = { id: string; edge_code: string };
const MINIMUM_RELEASE_VALIDITY_MS = 10 * 60_000;

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_operational_release_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function mapSnapshot(row: BaseSnapshotRow): RouteOperationalReleaseSnapshot {
  return {
    snapshotRevision: Number(row.snapshot_revision),
    networkRevisionId: row.network_revision_id,
    networkRevision: row.network_revision,
    operationalVersion: Number(row.operational_version),
    validUntil: toIso(row.valid_until),
  };
}

function mapRelease(row: ReleaseRow): RouteOperationalReleaseReceipt {
  return {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    baseSnapshotRevision: Number(row.base_snapshot_revision),
    targetSnapshotRevision: Number(row.target_snapshot_revision),
    networkRevisionId: row.network_revision_id,
    networkRevision: row.network_revision,
    baseOperationalVersion: Number(row.base_operational_version),
    targetOperationalVersion: Number(row.target_operational_version),
    workflowRevision: Number(row.workflow_revision) as 1 | 2,
    lifecycleState: row.lifecycle_state,
    sourceReference: row.source_reference,
    reasonSummary: row.reason_summary,
    snapshotSha256: row.snapshot_sha256.trim(),
    confirmedEventCount: Number(row.confirmed_event_count),
    confirmedObservationCount: Number(row.confirmed_observation_count),
    affectedEdgeCount: Number(row.affected_edge_count),
    preparedBySubject: row.prepared_by_subject,
    preparedAt: toIso(row.prepared_at),
    expiresAt: toIso(row.expires_at),
    publishedBySubject: row.published_by_subject,
    publishedAt: nullableIso(row.published_at),
    releaseEvidenceReference: row.release_evidence_reference,
  };
}

function parseEnvelope(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 3 || keys[0] !== "operationalState" || keys[1] !== "routeNetwork" || keys[2] !== "schemaVersion" || record.schemaVersion !== 1) return null;
  return { routeNetwork: structuredClone(record.routeNetwork), operationalState: structuredClone(record.operationalState) };
}

function closureEventSha256(row: ClosureEffectRow) {
  return createHash("sha256").update(canonicalizeRouteOperationalSnapshot({
    closureEventId: row.id,
    networkRevisionId: row.network_revision_id,
    edgeId: row.edge_id,
    edgeCode: row.edge_code,
    status: row.status,
    startsAt: toIso(row.starts_at),
    expiresAt: toIso(row.expires_at),
    reviewedBySubject: row.reviewed_by_subject,
    reviewedAt: row.reviewed_at === null ? null : toIso(row.reviewed_at),
    reviewEvidenceReference: row.review_evidence_reference,
  }), "utf8").digest("hex");
}

function operationalObservationSha256(row: ObservationEffectRow) {
  return createHash("sha256").update(canonicalizeRouteOperationalSnapshot({
    observationId: row.id,
    networkRevisionId: row.network_revision_id,
    edgeId: row.edge_id,
    edgeCode: row.edge_code,
    crowdLevel: row.crowd_level,
    weatherImpact: row.weather_impact,
    travelTimeMultiplier: Number(row.travel_time_multiplier),
    sourceReference: row.source_reference,
    observedAt: toIso(row.observed_at),
    expiresAt: toIso(row.expires_at),
    reviewedBySubject: row.reviewed_by_subject,
    reviewedAt: row.reviewed_at === null ? null : toIso(row.reviewed_at),
    reviewEvidenceReference: row.review_evidence_reference,
  }), "utf8").digest("hex");
}

async function readCurrentSnapshot(sql: ReturnType<typeof getDatabase>, scenicAreaId: string, at: string) {
  const rows = await sql<BaseSnapshotRow[]>`
    SELECT snapshot.id, snapshot.publication_id, snapshot.network_revision_id, network.revision AS network_revision,
           snapshot.operational_version_id, operational.operational_version, snapshot.snapshot_revision,
           snapshot.snapshot_json,
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
  `;
  return rows[0] ?? null;
}

async function readPendingRelease(sql: ReturnType<typeof getDatabase>, scenicAreaId: string, baseSnapshotId: string, at: string) {
  const rows = await sql<ReleaseRow[]>`
    SELECT release.id, release.scenic_area_id, release.base_snapshot_id, release.operational_version_id,
           release.replacement_snapshot_id, release.base_snapshot_revision, release.target_snapshot_revision,
           release.network_revision_id, network.revision AS network_revision,
           release.base_operational_version, release.target_operational_version,
           release.workflow_revision, release.lifecycle_state, release.source_reference, release.reason_summary,
           release.snapshot_json, release.snapshot_sha256, release.confirmed_event_count, release.confirmed_observation_count, release.affected_edge_count,
           release.prepared_by_subject, release.prepared_at, release.expires_at,
           release.published_by_subject, release.published_at, release.release_evidence_reference
    FROM route_operational_snapshot_releases AS release
    INNER JOIN route_network_revisions AS network
      ON network.id = release.network_revision_id AND network.scenic_area_id = release.scenic_area_id
    WHERE release.scenic_area_id = ${scenicAreaId} AND release.base_snapshot_id = ${baseSnapshotId}
      AND release.workflow_revision = 1 AND release.lifecycle_state = 'PREPARED' AND release.expires_at > ${at}
    ORDER BY release.prepared_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const postgresRouteOperationalReleaseRepository: RouteOperationalReleaseRepository = {
  async readOverview(command) {
    const sql = getDatabase();
    const current = await readCurrentSnapshot(sql, command.actor.scenicAreaId, command.at);
    const candidate = current ? await readPendingRelease(sql, command.actor.scenicAreaId, current.id, command.at) : null;
    let pendingEventCount = 0;
    let confirmedEventCount = 0;
    let pendingObservationCount = 0;
    let confirmedObservationCount = 0;
    if (current) {
      const counts = await sql<{ pending_count: number; confirmed_count: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE workflow_revision = 1) AS pending_count,
          COUNT(*) FILTER (WHERE workflow_revision = 2 AND review_decision = 'CONFIRMED') AS confirmed_count
        FROM closure_events
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND network_revision_id = ${current.network_revision_id}
          AND withdrawn_at IS NULL AND expires_at > ${command.at}
      `;
      pendingEventCount = Number(counts[0]?.pending_count ?? 0);
      confirmedEventCount = Number(counts[0]?.confirmed_count ?? 0);
      const observationCounts = await sql<{ pending_count: number; confirmed_count: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE workflow_revision = 1) AS pending_count,
          COUNT(DISTINCT edge_id) FILTER (WHERE workflow_revision = 2 AND review_decision = 'CONFIRMED') AS confirmed_count
        FROM route_operational_observations
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND network_revision_id = ${current.network_revision_id}
          AND expires_at > ${command.at}
      `;
      pendingObservationCount = Number(observationCounts[0]?.pending_count ?? 0);
      confirmedObservationCount = Number(observationCounts[0]?.confirmed_count ?? 0);
    }
    return {
      schemaVersion: 1,
      scenicAreaId: command.actor.scenicAreaId,
      actorRole: command.actor.role,
      serverTime: toIso(command.at),
      currentSnapshot: current ? mapSnapshot(current) : null,
      pendingEventCount,
      confirmedEventCount,
      pendingObservationCount,
      confirmedObservationCount,
      candidate: candidate ? mapRelease(candidate) : null,
    } satisfies RouteOperationalReleaseOverview;
  },

  async prepare(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`route-operational-release:${command.actor.scenicAreaId}`}))`;
      const replayRows = await transaction<ReleaseActionRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               release.id, release.scenic_area_id, release.base_snapshot_id, release.operational_version_id,
               release.replacement_snapshot_id, release.base_snapshot_revision, release.target_snapshot_revision,
               release.network_revision_id, network.revision AS network_revision,
               release.base_operational_version, release.target_operational_version,
               release.workflow_revision, release.lifecycle_state, release.source_reference, release.reason_summary,
               release.snapshot_json, release.snapshot_sha256, release.confirmed_event_count, release.confirmed_observation_count, release.affected_edge_count,
               release.prepared_by_subject, release.prepared_at, release.expires_at,
               release.published_by_subject, release.published_at, release.release_evidence_reference
        FROM route_operational_snapshot_release_actions AS action
        INNER JOIN route_operational_snapshot_releases AS release
          ON release.id = action.release_id AND release.scenic_area_id = action.scenic_area_id
        INNER JOIN route_network_revisions AS network
          ON network.id = release.network_revision_id AND network.scenic_area_id = release.scenic_area_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      if (replay) {
        if (
          replay.action !== "PREPARE" || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== 0 || replay.action_evidence_reference !== command.sourceReference
          || replay.base_snapshot_revision !== command.expectedSnapshotRevision || replay.reason_summary !== command.reasonSummary
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapRelease(replay) };
      }

      const snapshotRows = await transaction<BaseSnapshotRow[]>`
        SELECT snapshot.id, snapshot.publication_id, snapshot.network_revision_id, network.revision AS network_revision,
               snapshot.operational_version_id, operational.operational_version, snapshot.snapshot_revision,
               snapshot.snapshot_json,
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
        FOR UPDATE OF snapshot, operational
      `;
      const snapshot = snapshotRows[0];
      if (!snapshot) return { state: "NO_CURRENT_SNAPSHOT" as const };
      if (snapshot.snapshot_revision !== command.expectedSnapshotRevision) return { state: "SNAPSHOT_CHANGED" as const };

      const existing = await transaction<{ id: string }[]>`
        SELECT id FROM route_operational_snapshot_releases
        WHERE scenic_area_id = ${command.actor.scenicAreaId} AND base_snapshot_id = ${snapshot.id}
          AND workflow_revision = 1 AND lifecycle_state = 'PREPARED' AND expires_at > ${command.occurredAt}
        LIMIT 1
      `;
      if (existing[0]) return { state: "CANDIDATE_EXISTS" as const };

      const closureRows = await transaction<ClosureEffectRow[]>`
        SELECT closure.id, closure.network_revision_id, closure.edge_id, edge.edge_code, closure.status,
               closure.starts_at, closure.expires_at, closure.workflow_revision, closure.review_decision,
               closure.reviewed_by_subject, closure.reviewed_at, closure.review_evidence_reference, closure.withdrawn_at
        FROM closure_events AS closure
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
        WHERE closure.scenic_area_id = ${command.actor.scenicAreaId}
          AND closure.network_revision_id = ${snapshot.network_revision_id}
          AND closure.withdrawn_at IS NULL AND closure.expires_at > ${command.occurredAt}
        ORDER BY closure.created_at, closure.id
        FOR UPDATE OF closure
      `;
      if (closureRows.some((row) => row.workflow_revision !== 2)) return { state: "PENDING_EVENTS" as const };
      const confirmed = closureRows.filter((row) => row.review_decision === "CONFIRMED" && row.reviewed_at !== null && row.reviewed_by_subject !== null && row.review_evidence_reference !== null);
      if (confirmed.length !== closureRows.length) return { state: "SOURCE_SNAPSHOT_INVALID" as const };

      const observationRows = await transaction<ObservationEffectRow[]>`
        SELECT observation.id, observation.network_revision_id, observation.edge_id, edge.edge_code,
               observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
               observation.source_reference, observation.observed_at, observation.expires_at,
               observation.workflow_revision, observation.review_decision, observation.reviewed_by_subject,
               observation.reviewed_at, observation.review_evidence_reference
        FROM route_operational_observations AS observation
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
        WHERE observation.scenic_area_id = ${command.actor.scenicAreaId}
          AND observation.network_revision_id = ${snapshot.network_revision_id}
          AND observation.expires_at > ${command.occurredAt}
        ORDER BY edge.edge_code, observation.observed_at DESC, observation.id DESC
        FOR UPDATE OF observation
      `;
      if (observationRows.some((row) => row.workflow_revision === 1)) return { state: "PENDING_OBSERVATIONS" as const };
      const latestConfirmedByEdge = new Map<string, ObservationEffectRow>();
      for (const row of observationRows) {
        if (row.workflow_revision !== 2 || row.review_decision === "REJECTED") continue;
        if (
          row.review_decision !== "CONFIRMED" || row.reviewed_at === null
          || row.reviewed_by_subject === null || row.review_evidence_reference === null
        ) return { state: "SOURCE_SNAPSHOT_INVALID" as const };
        if (!latestConfirmedByEdge.has(row.edge_id)) latestConfirmedByEdge.set(row.edge_id, row);
      }
      const confirmedObservations = [...latestConfirmedByEdge.values()];
      if (confirmed.length + confirmedObservations.length < 1) return { state: "NO_REVIEWED_SOURCES" as const };

      const envelope = parseEnvelope(snapshot.snapshot_json);
      if (!envelope) return { state: "SOURCE_SNAPSHOT_INVALID" as const };
      const versionRows = await transaction<{ next_operational_version: number; next_snapshot_revision: number }[]>`
        SELECT
          (SELECT COALESCE(MAX(operational_version), 0) + 1 FROM route_operational_versions WHERE scenic_area_id = ${command.actor.scenicAreaId} AND network_revision_id = ${snapshot.network_revision_id}) AS next_operational_version,
          GREATEST(
            (SELECT COALESCE(MAX(snapshot_revision), 0) FROM scenic_published_snapshots WHERE scenic_area_id = ${command.actor.scenicAreaId}),
            (SELECT COALESCE(MAX(target_snapshot_revision), 0) FROM route_operational_snapshot_releases WHERE scenic_area_id = ${command.actor.scenicAreaId})
          ) + 1 AS next_snapshot_revision
      `;
      const targetOperationalVersion = Number(versionRows[0]?.next_operational_version);
      const targetSnapshotRevision = Number(versionRows[0]?.next_snapshot_revision);
      if (!Number.isSafeInteger(targetOperationalVersion) || !Number.isSafeInteger(targetSnapshotRevision)) throw new Error("invalid_operational_release_revision");

      const expiryMs = Math.min(
        new Date(snapshot.valid_until).getTime(),
        ...confirmed.map((row) => new Date(row.expires_at).getTime()),
        ...confirmedObservations.map((row) => new Date(row.expires_at).getTime()),
      );
      if (!Number.isFinite(expiryMs) || expiryMs <= new Date(command.occurredAt).getTime() + MINIMUM_RELEASE_VALIDITY_MS) return { state: "INSUFFICIENT_VALIDITY" as const };
      const expiresAt = new Date(expiryMs).toISOString();
      const effects: RouteOperationalClosureEffect[] = confirmed.map((row) => ({
        closureEventId: row.id,
        edgeId: row.edge_code,
        status: row.status,
        checkedAt: toIso(row.reviewed_at!),
        expiresAt: toIso(row.expires_at),
        sourceReference: row.review_evidence_reference!,
        responsibleParty: row.reviewed_by_subject!,
      }));
      const factors: RouteOperationalFactorEffect[] = confirmedObservations.map((row) => ({
        observationId: row.id,
        edgeId: row.edge_code,
        crowdLevel: row.crowd_level,
        weatherImpact: row.weather_impact,
        travelTimeMultiplier: Number(row.travel_time_multiplier),
        observedAt: toIso(row.observed_at),
        expiresAt: toIso(row.expires_at),
        sourceReference: row.review_evidence_reference!,
        responsibleParty: row.reviewed_by_subject!,
      }));
      const compiled = compileRouteOperationalRelease({
        scenicAreaId: command.actor.scenicAreaId,
        targetOperationalVersion,
        issuedAt: command.occurredAt,
        expiresAt,
        sourceReference: command.sourceReference,
        responsibleParty: command.actor.oidcSubject,
        routeNetwork: envelope.routeNetwork,
        baseOperationalState: envelope.operationalState,
        effects,
        factors,
      }, new Date(command.occurredAt));
      if (!compiled) return { state: "SOURCE_SNAPSHOT_INVALID" as const };

      const edgeRows = await transaction<EdgeIdentityRow[]>`
        SELECT id, edge_code FROM route_edges
        WHERE network_revision_id = ${snapshot.network_revision_id}
        ORDER BY edge_code
      `;
      const edgeIdByCode = new Map(edgeRows.map((row) => [row.edge_code, row.id]));
      if (edgeIdByCode.size !== compiled.snapshotJson.operationalState.edgeStates.length || compiled.snapshotJson.operationalState.edgeStates.some((state) => !edgeIdByCode.has(state.edgeId))) {
        return { state: "SOURCE_SNAPSHOT_INVALID" as const };
      }

      const operationalRows = await transaction<{ id: string }[]>`
        INSERT INTO route_operational_versions (
          scenic_area_id, network_revision_id, operational_version, lifecycle_state,
          source_reference, responsible_party, issued_at, expires_at, expected_revision,
          idempotency_key_hash, published_by_subject
        ) VALUES (
          ${command.actor.scenicAreaId}, ${snapshot.network_revision_id}, ${targetOperationalVersion}, 'DRAFT',
          ${command.sourceReference}, ${command.actor.oidcSubject}, ${command.occurredAt}, ${expiresAt},
          ${snapshot.snapshot_revision}, ${command.idempotencyKeyHash}, NULL
        )
        RETURNING id
      `;
      const operationalVersionId = operationalRows[0]?.id;
      if (!operationalVersionId) throw new Error("operational_release_version_insert_failed");
      for (const state of compiled.snapshotJson.operationalState.edgeStates) {
        const edgeId = edgeIdByCode.get(state.edgeId)!;
        await transaction`
          INSERT INTO route_edge_operational_states (
            operational_version_id, network_revision_id, edge_id, status, checked_at, expires_at,
            source_reference, responsible_party, travel_time_multiplier, crowd_level, weather_impact
          ) VALUES (
            ${operationalVersionId}, ${snapshot.network_revision_id}, ${edgeId}, ${state.status}, ${state.checkedAt}, ${state.expiresAt},
            ${state.sourceReference}, ${state.responsibleParty}, ${state.routing?.travelTimeMultiplier ?? null},
            ${state.routing?.crowdLevel ?? null}, ${state.routing?.weatherImpact ?? null}
          )
        `;
      }

      const snapshotSha256 = createHash("sha256").update(canonicalizeRouteOperationalSnapshot(compiled.snapshotJson), "utf8").digest("hex");
      const releaseRows = await transaction<ReleaseRow[]>`
        WITH inserted AS (
          INSERT INTO route_operational_snapshot_releases (
            scenic_area_id, base_snapshot_id, network_revision_id, operational_version_id,
            base_snapshot_revision, target_snapshot_revision, base_operational_version, target_operational_version,
            workflow_revision, lifecycle_state, source_reference, reason_summary, snapshot_json, snapshot_sha256,
            confirmed_event_count, confirmed_observation_count, affected_edge_count, prepared_by_subject, prepared_at, expires_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${snapshot.id}, ${snapshot.network_revision_id}, ${operationalVersionId},
            ${snapshot.snapshot_revision}, ${targetSnapshotRevision}, ${snapshot.operational_version}, ${targetOperationalVersion},
            1, 'PREPARED', ${command.sourceReference}, ${command.reasonSummary}, ${transaction.json(compiled.snapshotJson)}, ${snapshotSha256},
            ${confirmed.length}, ${confirmedObservations.length}, ${compiled.affectedEdgeIds.length}, ${command.actor.oidcSubject}, ${command.occurredAt}, ${expiresAt}
          )
          RETURNING *
        )
        SELECT inserted.id, inserted.scenic_area_id, inserted.base_snapshot_id, inserted.operational_version_id,
               inserted.replacement_snapshot_id, inserted.base_snapshot_revision, inserted.target_snapshot_revision,
               inserted.network_revision_id, network.revision AS network_revision,
               inserted.base_operational_version, inserted.target_operational_version,
               inserted.workflow_revision, inserted.lifecycle_state, inserted.source_reference, inserted.reason_summary,
               inserted.snapshot_json, inserted.snapshot_sha256, inserted.confirmed_event_count, inserted.confirmed_observation_count, inserted.affected_edge_count,
               inserted.prepared_by_subject, inserted.prepared_at, inserted.expires_at,
               inserted.published_by_subject, inserted.published_at, inserted.release_evidence_reference
        FROM inserted
        INNER JOIN route_network_revisions AS network
          ON network.id = inserted.network_revision_id AND network.scenic_area_id = inserted.scenic_area_id
      `;
      const release = releaseRows[0];
      if (!release) throw new Error("operational_release_insert_failed");
      for (const row of confirmed) {
        await transaction`
          INSERT INTO route_operational_snapshot_release_events (
            release_id, closure_event_id, network_revision_id, edge_id, compiled_status, event_sha256
          ) VALUES (${release.id}, ${row.id}, ${row.network_revision_id}, ${row.edge_id}, ${row.status}, ${closureEventSha256(row)})
        `;
      }
      for (const row of confirmedObservations) {
        await transaction`
          INSERT INTO route_operational_snapshot_release_observations (
            release_id, observation_id, network_revision_id, edge_id, observation_sha256
          ) VALUES (${release.id}, ${row.id}, ${row.network_revision_id}, ${row.edge_id}, ${operationalObservationSha256(row)})
        `;
      }
      await transaction`
        INSERT INTO route_operational_snapshot_release_actions (
          scenic_area_id, release_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${release.id}, 'PREPARE', ${command.actor.oidcSubject}, 'OPERATIONS_EMERGENCY',
          0, 1, ${command.idempotencyKeyHash}, ${command.sourceReference},
          ${transaction.json({ baseSnapshotRevision: snapshot.snapshot_revision, targetSnapshotRevision, targetOperationalVersion, confirmedEventCount: confirmed.length, confirmedObservationCount: confirmedObservations.length, affectedEdgeCount: compiled.affectedEdgeIds.length, snapshotSha256 })},
          ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'OPERATIONS_EMERGENCY',
          'ROUTE_OPERATIONAL_SNAPSHOT_PREPARED', 'ROUTE_OPERATIONAL_SNAPSHOT_RELEASE', ${release.id},
          ${snapshot.snapshot_revision}, ${command.idempotencyKeyHash}, ${command.sourceReference},
          ${transaction.json({ targetSnapshotRevision, targetOperationalVersion, confirmedEventCount: confirmed.length, confirmedObservationCount: confirmedObservations.length, snapshotSha256, geometryChanged: false })},
          ${command.occurredAt}
        )
      `;
      return { state: "CREATED" as const, receipt: mapRelease(release) };
    });
  },

  async publish(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`route-operational-release:${command.actor.scenicAreaId}`}))`;
      const replayRows = await transaction<ReleaseActionRow[]>`
        SELECT action.action, action.actor_oidc_subject, action.expected_workflow_revision,
               action.evidence_reference AS action_evidence_reference,
               release.id, release.scenic_area_id, release.base_snapshot_id, release.operational_version_id,
               release.replacement_snapshot_id, release.base_snapshot_revision, release.target_snapshot_revision,
               release.network_revision_id, network.revision AS network_revision,
               release.base_operational_version, release.target_operational_version,
               release.workflow_revision, release.lifecycle_state, release.source_reference, release.reason_summary,
               release.snapshot_json, release.snapshot_sha256, release.confirmed_event_count, release.confirmed_observation_count, release.affected_edge_count,
               release.prepared_by_subject, release.prepared_at, release.expires_at,
               release.published_by_subject, release.published_at, release.release_evidence_reference
        FROM route_operational_snapshot_release_actions AS action
        INNER JOIN route_operational_snapshot_releases AS release
          ON release.id = action.release_id AND release.scenic_area_id = action.scenic_area_id
        INNER JOIN route_network_revisions AS network
          ON network.id = release.network_revision_id AND network.scenic_area_id = release.scenic_area_id
        WHERE action.scenic_area_id = ${command.actor.scenicAreaId}
          AND action.idempotency_key_hash = ${command.idempotencyKeyHash}
        LIMIT 1
      `;
      const replay = replayRows[0];
      if (replay) {
        if (
          replay.action !== "PUBLISH" || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== 1 || replay.action_evidence_reference !== command.releaseEvidenceReference
          || replay.id !== command.releaseId
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        return { state: "REPLAYED" as const, receipt: mapRelease(replay) };
      }

      const releaseRows = await transaction<ReleaseRow[]>`
        SELECT release.id, release.scenic_area_id, release.base_snapshot_id, release.operational_version_id,
               release.replacement_snapshot_id, release.base_snapshot_revision, release.target_snapshot_revision,
               release.network_revision_id, network.revision AS network_revision,
               release.base_operational_version, release.target_operational_version,
               release.workflow_revision, release.lifecycle_state, release.source_reference, release.reason_summary,
               release.snapshot_json, release.snapshot_sha256, release.confirmed_event_count, release.confirmed_observation_count, release.affected_edge_count,
               release.prepared_by_subject, release.prepared_at, release.expires_at,
               release.published_by_subject, release.published_at, release.release_evidence_reference
        FROM route_operational_snapshot_releases AS release
        INNER JOIN route_network_revisions AS network
          ON network.id = release.network_revision_id AND network.scenic_area_id = release.scenic_area_id
        WHERE release.id = ${command.releaseId} AND release.scenic_area_id = ${command.actor.scenicAreaId}
        FOR UPDATE OF release
      `;
      const release = releaseRows[0];
      if (!release) return { state: "NOT_FOUND" as const };
      if (release.workflow_revision !== command.expectedWorkflowRevision || release.lifecycle_state !== "PREPARED") return { state: "REVISION_CONFLICT" as const };
      if (release.prepared_by_subject === command.actor.oidcSubject) return { state: "PREPARER_CANNOT_PUBLISH" as const };
      if (new Date(release.expires_at).getTime() <= new Date(command.occurredAt).getTime()) return { state: "CANDIDATE_EXPIRED" as const };

      const currentRows = await transaction<BaseSnapshotRow[]>`
        SELECT snapshot.id, snapshot.publication_id, snapshot.network_revision_id, network.revision AS network_revision,
               snapshot.operational_version_id, operational.operational_version, snapshot.snapshot_revision,
               snapshot.snapshot_json,
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
        ORDER BY snapshot.snapshot_revision DESC LIMIT 1
        FOR UPDATE OF snapshot, operational
      `;
      const current = currentRows[0];
      if (!current || current.id !== release.base_snapshot_id || current.snapshot_revision !== release.base_snapshot_revision || current.network_revision_id !== release.network_revision_id) {
        return { state: "BASE_SNAPSHOT_CHANGED" as const };
      }

      const currentEvents = await transaction<ClosureEffectRow[]>`
        SELECT closure.id, closure.network_revision_id, closure.edge_id, edge.edge_code, closure.status,
               closure.starts_at, closure.expires_at, closure.workflow_revision, closure.review_decision,
               closure.reviewed_by_subject, closure.reviewed_at, closure.review_evidence_reference, closure.withdrawn_at
        FROM closure_events AS closure
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = closure.network_revision_id AND edge.id = closure.edge_id
        WHERE closure.scenic_area_id = ${command.actor.scenicAreaId}
          AND closure.network_revision_id = ${release.network_revision_id}
          AND closure.withdrawn_at IS NULL AND closure.expires_at > ${command.occurredAt}
        ORDER BY closure.id
        FOR UPDATE OF closure
      `;
      const boundEvents = await transaction<{ closure_event_id: string; event_sha256: string }[]>`
        SELECT closure_event_id, event_sha256 FROM route_operational_snapshot_release_events
        WHERE release_id = ${release.id}
        ORDER BY closure_event_id
      `;
      if (
        currentEvents.length !== boundEvents.length
        || currentEvents.some((event, index) => (
          event.id !== boundEvents[index]?.closure_event_id
          || closureEventSha256(event) !== boundEvents[index]?.event_sha256.trim()
          || event.workflow_revision !== 2 || event.review_decision !== "CONFIRMED"
        ))
      ) return { state: "CLOSURE_SET_CHANGED" as const };

      const currentObservationRows = await transaction<ObservationEffectRow[]>`
        SELECT observation.id, observation.network_revision_id, observation.edge_id, edge.edge_code,
               observation.crowd_level, observation.weather_impact, observation.travel_time_multiplier,
               observation.source_reference, observation.observed_at, observation.expires_at,
               observation.workflow_revision, observation.review_decision, observation.reviewed_by_subject,
               observation.reviewed_at, observation.review_evidence_reference
        FROM route_operational_observations AS observation
        INNER JOIN route_edges AS edge
          ON edge.network_revision_id = observation.network_revision_id AND edge.id = observation.edge_id
        WHERE observation.scenic_area_id = ${command.actor.scenicAreaId}
          AND observation.network_revision_id = ${release.network_revision_id}
          AND observation.expires_at > ${command.occurredAt}
        ORDER BY edge.edge_code, observation.observed_at DESC, observation.id DESC
        FOR UPDATE OF observation
      `;
      if (currentObservationRows.some((row) => row.workflow_revision === 1)) return { state: "OBSERVATION_SET_CHANGED" as const };
      const latestCurrentObservationByEdge = new Map<string, ObservationEffectRow>();
      for (const row of currentObservationRows) {
        if (row.workflow_revision !== 2 || row.review_decision === "REJECTED") continue;
        if (
          row.review_decision !== "CONFIRMED" || row.reviewed_at === null
          || row.reviewed_by_subject === null || row.review_evidence_reference === null
        ) return { state: "OBSERVATION_SET_CHANGED" as const };
        if (!latestCurrentObservationByEdge.has(row.edge_id)) latestCurrentObservationByEdge.set(row.edge_id, row);
      }
      const currentObservations = [...latestCurrentObservationByEdge.values()].sort((left, right) => left.id.localeCompare(right.id));
      const boundObservations = await transaction<{ observation_id: string; observation_sha256: string }[]>`
        SELECT observation_id, observation_sha256
        FROM route_operational_snapshot_release_observations
        WHERE release_id = ${release.id}
        ORDER BY observation_id
      `;
      if (
        currentObservations.length !== boundObservations.length
        || currentObservations.some((observation, index) => (
          observation.id !== boundObservations[index]?.observation_id
          || operationalObservationSha256(observation) !== boundObservations[index]?.observation_sha256.trim()
        ))
      ) return { state: "OBSERVATION_SET_CHANGED" as const };

      if (release.snapshot_json === undefined || release.operational_version_id === undefined) return { state: "SOURCE_SNAPSHOT_INVALID" as const };
      const candidateSnapshotJson = release.snapshot_json;
      const candidateOperationalVersionId = release.operational_version_id;
      const envelope = parseEnvelope(candidateSnapshotJson);
      const safeNetwork = envelope ? getSafePublishedNetwork(envelope.routeNetwork, new Date(command.occurredAt), command.actor.scenicAreaId) : null;
      const safeState = envelope ? getSafeRouteOperationalState(envelope.operationalState, envelope.routeNetwork, new Date(command.occurredAt), command.actor.scenicAreaId) : null;
      const actualHash = createHash("sha256").update(canonicalizeRouteOperationalSnapshot(candidateSnapshotJson), "utf8").digest("hex");
      if (
        !safeNetwork || !safeState || safeNetwork.revision !== release.network_revision
        || safeState.operationalVersion !== release.target_operational_version
        || safeState.expiresAt !== toIso(release.expires_at) || actualHash !== release.snapshot_sha256.trim()
      ) return { state: "SOURCE_SNAPSHOT_INVALID" as const };

      await transaction`
        UPDATE scenic_published_snapshots
        SET lifecycle_state = 'WITHDRAWN', withdrawn_at = ${command.occurredAt}
        WHERE id = ${current.id} AND scenic_area_id = ${command.actor.scenicAreaId}
          AND lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL
      `;
      await transaction`
        UPDATE route_operational_versions
        SET lifecycle_state = 'SUPERSEDED'
        WHERE id = ${current.operational_version_id} AND scenic_area_id = ${command.actor.scenicAreaId}
          AND lifecycle_state = 'PUBLISHED'
      `;
      await transaction`
        UPDATE route_operational_versions
        SET lifecycle_state = 'PUBLISHED', published_by_subject = ${command.actor.oidcSubject}
        WHERE id = ${candidateOperationalVersionId} AND scenic_area_id = ${command.actor.scenicAreaId}
          AND lifecycle_state = 'DRAFT' AND published_by_subject IS NULL
      `;
      const snapshotRows = await transaction<{ id: string }[]>`
        INSERT INTO scenic_published_snapshots (
          scenic_area_id, publication_id, network_revision_id, operational_version_id,
          snapshot_revision, lifecycle_state, snapshot_json, snapshot_sha256, expires_at,
          expected_revision, idempotency_key_hash, published_by_subject, created_at, published_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${current.publication_id}, ${release.network_revision_id}, ${candidateOperationalVersionId},
          ${release.target_snapshot_revision}, 'PUBLISHED', ${transaction.json(candidateSnapshotJson as Parameters<typeof transaction.json>[0])}, ${release.snapshot_sha256.trim()}, ${toIso(release.expires_at)},
          ${release.base_snapshot_revision}, ${command.idempotencyKeyHash}, ${command.actor.oidcSubject}, ${command.occurredAt}, ${command.occurredAt}
        )
        RETURNING id
      `;
      const replacementSnapshotId = snapshotRows[0]?.id;
      if (!replacementSnapshotId) throw new Error("replacement_snapshot_insert_failed");
      const updatedRows = await transaction<ReleaseRow[]>`
        WITH updated AS (
          UPDATE route_operational_snapshot_releases
          SET workflow_revision = 2, lifecycle_state = 'PUBLISHED', replacement_snapshot_id = ${replacementSnapshotId},
              published_by_subject = ${command.actor.oidcSubject}, published_at = ${command.occurredAt},
              release_evidence_reference = ${command.releaseEvidenceReference}
          WHERE id = ${release.id} AND scenic_area_id = ${command.actor.scenicAreaId}
            AND workflow_revision = 1 AND lifecycle_state = 'PREPARED'
          RETURNING *
        )
        SELECT updated.id, updated.scenic_area_id, updated.base_snapshot_id, updated.operational_version_id,
               updated.replacement_snapshot_id, updated.base_snapshot_revision, updated.target_snapshot_revision,
               updated.network_revision_id, network.revision AS network_revision,
               updated.base_operational_version, updated.target_operational_version,
               updated.workflow_revision, updated.lifecycle_state, updated.source_reference, updated.reason_summary,
               updated.snapshot_json, updated.snapshot_sha256, updated.confirmed_event_count, updated.confirmed_observation_count, updated.affected_edge_count,
               updated.prepared_by_subject, updated.prepared_at, updated.expires_at,
               updated.published_by_subject, updated.published_at, updated.release_evidence_reference
        FROM updated
        INNER JOIN route_network_revisions AS network
          ON network.id = updated.network_revision_id AND network.scenic_area_id = updated.scenic_area_id
      `;
      const updated = updatedRows[0];
      if (!updated) throw new Error("operational_release_publish_update_failed");
      await transaction`
        INSERT INTO route_operational_snapshot_release_actions (
          scenic_area_id, release_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${release.id}, 'PUBLISH', ${command.actor.oidcSubject}, 'RELEASE_ADMIN',
          1, 2, ${command.idempotencyKeyHash}, ${command.releaseEvidenceReference},
          ${transaction.json({ baseSnapshotRevision: release.base_snapshot_revision, targetSnapshotRevision: release.target_snapshot_revision, targetOperationalVersion: release.target_operational_version, snapshotSha256: release.snapshot_sha256.trim(), offlinePacksInvalidated: true })},
          ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'RELEASE_ADMIN',
          'ROUTE_OPERATIONAL_SNAPSHOT_PUBLISHED', 'ROUTE_OPERATIONAL_SNAPSHOT_RELEASE', ${release.id},
          1, ${command.idempotencyKeyHash}, ${command.releaseEvidenceReference},
          ${transaction.json({ replacementSnapshotId, baseSnapshotRevision: release.base_snapshot_revision, targetSnapshotRevision: release.target_snapshot_revision, targetOperationalVersion: release.target_operational_version, snapshotSha256: release.snapshot_sha256.trim(), geometryChanged: false, offlinePacksInvalidated: true })},
          ${command.occurredAt}
        )
      `;
      return { state: "PUBLISHED" as const, receipt: mapRelease(updated) };
    });
  },
};
