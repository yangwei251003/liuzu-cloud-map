import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";

import {
  compileGisFormalizationPlan,
  hashGisFormalizationPlan,
  materializeGisFormalization,
  type GisFormalizationPlan,
  type GisFormalizationSource,
} from "../gis-formalization-compiler";
import {
  parsePrepareGisFormalizationInput,
  type GisFormalizationOverview,
  type GisFormalizationReceipt,
  type GisFormalizationSubmissionSummary,
  type PrepareGisFormalizationInput,
} from "../gis-formalization-contract";
import { parseMapEditorDraftCollection, type MapEditorDraftCollection } from "../map-editor-draft";
import { contentHashForGisDraftCollection } from "./gis-draft-submission-service";
import { getDatabase } from "./database";
import type { GisFormalizationRepository } from "./gis-formalization-service";

type Timestamp = Date | string;
type ReleaseRow = {
  id: string;
  scenic_area_id: string;
  submission_id: string;
  submission_revision: number;
  submission_content_sha256: string;
  workflow_revision: number;
  lifecycle_state: string;
  formalization_plan_json: unknown;
  plan_sha256: string;
  network_revision: string;
  node_count: number;
  edge_count: number;
  poi_count: number;
  valid_until: Timestamp;
  operational_expires_at: Timestamp;
  prepared_by_subject: string;
  prepared_at: Timestamp;
  published_by_subject: string | null;
  published_at: Timestamp | null;
  management_evidence_reference: string | null;
  snapshot_revision: number | null;
};

type SubmissionRow = {
  id: string;
  scenic_area_id: string;
  submission_revision: number;
  workflow_revision: number;
  lifecycle_state: string;
  object_count: number;
  content_sha256: string;
  submitted_by_subject: string;
  submitted_at: Timestamp;
  reviewed_by_subject: string | null;
  reviewed_at: Timestamp | null;
};

type DraftObjectRow = {
  client_object_id: string;
  object_type: string;
  title: string;
  geometry: unknown;
  source_label: string;
  source_url: string | null;
  source_captured_at: Timestamp;
  routing_attributes: unknown | null;
  visit_attributes: unknown | null;
  notes: string | null;
  draft_created_at: Timestamp;
  draft_updated_at: Timestamp;
};

type CurrentSnapshotRow = {
  id: string;
  publication_id: string;
  network_revision_id: string;
  operational_version_id: string;
};

function toIso(value: Timestamp) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid_gis_formalization_timestamp");
  return parsed.toISOString();
}

function mapReceipt(row: ReleaseRow): GisFormalizationReceipt {
  return {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    submissionId: row.submission_id,
    submissionRevision: Number(row.submission_revision),
    workflowRevision: Number(row.workflow_revision) as 1 | 2,
    lifecycleState: row.lifecycle_state as GisFormalizationReceipt["lifecycleState"],
    planSha256: row.plan_sha256.trim(),
    nodeCount: Number(row.node_count),
    edgeCount: Number(row.edge_count),
    poiCount: Number(row.poi_count),
    preparedBySubject: row.prepared_by_subject,
    preparedAt: toIso(row.prepared_at),
    validUntil: toIso(row.valid_until),
    operationalExpiresAt: toIso(row.operational_expires_at),
    publishedBySubject: row.published_by_subject,
    publishedAt: row.published_at === null ? null : toIso(row.published_at),
    managementEvidenceReference: row.management_evidence_reference,
    snapshotRevision: row.snapshot_revision === null ? null : Number(row.snapshot_revision),
    networkRevision: row.network_revision,
  };
}

function mapSummary(row: SubmissionRow): GisFormalizationSubmissionSummary {
  if (row.reviewed_at === null) throw new Error("approved_submission_without_review_time");
  return {
    submissionId: row.id,
    submissionRevision: Number(row.submission_revision),
    objectCount: Number(row.object_count),
    contentSha256: row.content_sha256.trim(),
    reviewedAt: toIso(row.reviewed_at),
  };
}

function buildCollection(scenicAreaId: string, objects: DraftObjectRow[]): MapEditorDraftCollection {
  const collection = parseMapEditorDraftCollection({
    schemaVersion: 2,
    scenicAreaId,
    warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
    drafts: objects.map((object) => ({
      schemaVersion: 2,
      id: object.client_object_id,
      scenicAreaId,
      title: object.title,
      objectType: object.object_type,
      geometry: object.geometry,
      coordinateSystem: "WGS84",
      source: { label: object.source_label, url: object.source_url, capturedAt: toIso(object.source_captured_at) },
      routingAttributes: object.routing_attributes,
      visitAttributes: object.visit_attributes,
      notes: object.notes,
      verificationStatus: "CANDIDATE_DRAFT",
      publicationStatus: "LOCAL_DRAFT_ONLY",
      createdAt: toIso(object.draft_created_at),
      updatedAt: toIso(object.draft_updated_at),
    })),
  });
  if (!collection) throw new Error("invalid_gis_formalization_collection");
  return collection;
}

async function loadSource(transaction: postgres.TransactionSql, scenicAreaId: string, submissionId: string, lock: boolean): Promise<{ row: SubmissionRow; source: GisFormalizationSource } | null> {
  const lockSql = lock ? transaction`FOR UPDATE` : transaction``;
  const rows = await transaction<SubmissionRow[]>`
    SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
           object_count, content_sha256, submitted_by_subject, submitted_at,
           reviewed_by_subject, reviewed_at
    FROM gis_draft_submissions
    WHERE scenic_area_id = ${scenicAreaId} AND id = ${submissionId}
    ${lockSql}
  `;
  const row = rows[0];
  if (!row) return null;
  const objects = await transaction<DraftObjectRow[]>`
    SELECT client_object_id, object_type, title, ST_AsGeoJSON(geometry_wgs84)::jsonb AS geometry,
           source_label, source_url, source_captured_at, routing_attributes, visit_attributes,
           notes, draft_created_at, draft_updated_at
    FROM gis_draft_objects
    WHERE scenic_area_id = ${scenicAreaId} AND submission_id = ${submissionId}
    ORDER BY client_object_id ASC
  `;
  const collection = buildCollection(scenicAreaId, objects);
  if (collection.drafts.length !== Number(row.object_count) || contentHashForGisDraftCollection(collection) !== row.content_sha256.trim()) throw new Error("gis_submission_content_drift");
  if (row.reviewed_by_subject === null || row.reviewed_at === null) throw new Error("gis_submission_review_missing");
  return {
    row,
    source: {
      submissionId: row.id,
      submissionRevision: Number(row.submission_revision),
      submissionContentSha256: row.content_sha256.trim(),
      reviewedBySubject: row.reviewed_by_subject,
      reviewedAt: toIso(row.reviewed_at),
      collection,
    },
  };
}

function inputFromPlan(value: unknown): { input: PrepareGisFormalizationInput; preparedAt: Date; preparedBySubject: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const plan = value as Partial<GisFormalizationPlan>;
  if (typeof plan.preparedAt !== "string" || typeof plan.preparedBySubject !== "string" || typeof plan.submissionId !== "string") return null;
  const preparedAt = new Date(plan.preparedAt);
  if (Number.isNaN(preparedAt.getTime()) || preparedAt.toISOString() !== plan.preparedAt) return null;
  const input = parsePrepareGisFormalizationInput({
    schemaVersion: 1,
    submissionId: plan.submissionId,
    expectedSubmissionWorkflowRevision: 2,
    providerName: plan.providerName,
    sourceReference: plan.sourceReference,
    fieldEvidenceReference: plan.fieldEvidenceReference,
    licenseReference: plan.licenseReference,
    rightsHolder: plan.rightsHolder,
    coordinateAccuracyMeters: plan.coordinateAccuracyMeters,
    validUntil: plan.validUntil,
    operationalSourceReference: plan.operationalSourceReference,
    operationalResponsibleParty: plan.operationalResponsibleParty,
    operationalExpiresAt: plan.operationalExpiresAt,
    pathPolicies: plan.pathPolicies,
    entrancePolicies: plan.entrancePolicies,
    acknowledgeAllObjectSourcesVerified: true,
    acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true,
    acknowledgeExactTopologyNoImplicitSnapping: true,
    acknowledgeNotesExcludedFromPublication: true,
  });
  return input ? { input, preparedAt, preparedBySubject: plan.preparedBySubject } : null;
}

function stableCode(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12)}`;
}

const releaseSelect = `
  id, scenic_area_id, submission_id, submission_revision, submission_content_sha256, workflow_revision, lifecycle_state,
  formalization_plan_json, plan_sha256, network_revision, node_count, edge_count, poi_count,
  valid_until, operational_expires_at, prepared_by_subject, prepared_at,
  published_by_subject, published_at, management_evidence_reference, snapshot_revision
`;

export const postgresGisFormalizationRepository: GisFormalizationRepository = {
  async readOverview(command) {
    const sql = getDatabase();
    const approvedRows = await sql<SubmissionRow[]>`
      SELECT submission.id, submission.scenic_area_id, submission.submission_revision,
             submission.workflow_revision, submission.lifecycle_state, submission.object_count,
             submission.content_sha256, submission.submitted_by_subject, submission.submitted_at,
             submission.reviewed_by_subject, submission.reviewed_at
      FROM gis_draft_submissions AS submission
      WHERE submission.scenic_area_id = ${command.actor.scenicAreaId}
        AND submission.lifecycle_state = 'APPROVED_FOR_FORMALIZATION'
        AND submission.workflow_revision = 2
        AND NOT EXISTS (
          SELECT 1 FROM gis_formalization_releases AS release
          WHERE release.scenic_area_id = submission.scenic_area_id AND release.submission_id = submission.id
        )
      ORDER BY submission.submission_revision DESC
      LIMIT 50
    `;
    const candidateRows = await sql<ReleaseRow[]>`
      SELECT ${sql.unsafe(releaseSelect)}
      FROM gis_formalization_releases
      WHERE scenic_area_id = ${command.actor.scenicAreaId}
        AND ((lifecycle_state = 'PREPARED' AND valid_until > ${command.at}) OR lifecycle_state = 'PUBLISHED')
      ORDER BY prepared_at DESC
      LIMIT 50
    `;
    return {
      schemaVersion: 1,
      scenicAreaId: command.actor.scenicAreaId,
      actorRole: command.actor.role,
      serverTime: command.at,
      approvedSubmissions: approvedRows.map(mapSummary),
      candidates: candidateRows.map(mapReceipt),
    } satisfies GisFormalizationOverview;
  },

  async prepare(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`gis-formalization:${command.actor.scenicAreaId}`}))`;
      const loaded = await loadSource(transaction, command.actor.scenicAreaId, command.input.submissionId, true);
      if (!loaded) return { state: "SUBMISSION_NOT_FOUND" as const };
      if (loaded.row.lifecycle_state !== "APPROVED_FOR_FORMALIZATION" || Number(loaded.row.workflow_revision) !== 2) return { state: "SUBMISSION_NOT_APPROVED" as const };
      if (loaded.row.reviewed_by_subject === command.actor.oidcSubject) return { state: "REVIEWER_CANNOT_PREPARE" as const };
      const compiled = compileGisFormalizationPlan(loaded.source, command.input, command.actor.oidcSubject, new Date(command.occurredAt));
      if (!compiled.ok) return { state: "PLAN_BLOCKED" as const };

      const replayRows = await transaction<ReleaseRow[]>`
        SELECT ${transaction.unsafe(releaseSelect)}
        FROM gis_formalization_releases
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND prepare_idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const replay = replayRows[0];
      if (replay) return replay.submission_id === command.input.submissionId && replay.plan_sha256.trim() === compiled.planSha256
        ? { state: "REPLAYED" as const, receipt: mapReceipt(replay) }
        : { state: "IDEMPOTENCY_CONFLICT" as const };

      const existing = await transaction<{ id: string }[]>`
        SELECT id FROM gis_formalization_releases
        WHERE scenic_area_id = ${command.actor.scenicAreaId} AND submission_id = ${command.input.submissionId}
        FOR UPDATE
      `;
      if (existing[0]) return { state: "CANDIDATE_EXISTS" as const };
      if (loaded.source.submissionContentSha256 !== loaded.row.content_sha256.trim()) return { state: "SOURCE_CHANGED" as const };

      const rows = await transaction<ReleaseRow[]>`
        INSERT INTO gis_formalization_releases (
          scenic_area_id, submission_id, submission_revision, submission_content_sha256,
          workflow_revision, lifecycle_state, formalization_plan_json, plan_sha256, network_revision,
          node_count, edge_count, poi_count, valid_until, operational_expires_at,
          prepared_by_subject, prepared_at, prepare_idempotency_key_hash, created_at, updated_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.input.submissionId}, ${loaded.source.submissionRevision},
          ${loaded.source.submissionContentSha256}, 1, 'PREPARED', ${transaction.json(compiled.plan)},
          ${compiled.planSha256}, ${compiled.plan.networkRevision}, ${compiled.plan.nodes.length},
          ${compiled.plan.edges.length}, ${compiled.plan.poiDraftIds.length}, ${compiled.plan.validUntil},
          ${compiled.plan.operationalExpiresAt}, ${command.actor.oidcSubject}, ${command.occurredAt},
          ${command.idempotencyKeyHash}, ${command.occurredAt}, ${command.occurredAt}
        )
        RETURNING ${transaction.unsafe(releaseSelect)}
      `;
      const created = rows[0];
      if (!created) throw new Error("gis_formalization_insert_failed");
      await transaction`
        INSERT INTO gis_formalization_release_actions (
          scenic_area_id, release_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${created.id}, 'PREPARE', ${command.actor.oidcSubject}, 'GIS_REVIEWER',
          0, 1, ${command.idempotencyKeyHash}, ${command.input.fieldEvidenceReference}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'GIS_REVIEWER', 'GIS_FORMALIZATION_PREPARED',
          'GIS_FORMALIZATION_RELEASE', ${created.id}, 0, ${command.idempotencyKeyHash},
          ${command.input.fieldEvidenceReference},
          ${transaction.json({ submissionId: command.input.submissionId, planSha256: compiled.planSha256, nodeCount: compiled.plan.nodes.length, edgeCount: compiled.plan.edges.length })},
          ${command.occurredAt}
        )
      `;
      return { state: "CREATED" as const, receipt: mapReceipt(created) };
    });
  },

  async publish(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`gis-formalization:${command.actor.scenicAreaId}`}))`;
      const replayActions = await transaction<{ release_id: string; actor_oidc_subject: string; evidence_reference: string }[]>`
        SELECT release_id, actor_oidc_subject, evidence_reference
        FROM gis_formalization_release_actions
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const replayAction = replayActions[0];
      if (replayAction) {
        if (replayAction.release_id !== command.releaseId || replayAction.actor_oidc_subject !== command.actor.oidcSubject || replayAction.evidence_reference !== command.managementEvidenceReference) return { state: "IDEMPOTENCY_CONFLICT" as const };
        const replayRows = await transaction<ReleaseRow[]>`
          SELECT ${transaction.unsafe(releaseSelect)} FROM gis_formalization_releases
          WHERE scenic_area_id = ${command.actor.scenicAreaId} AND id = ${command.releaseId}
        `;
        return replayRows[0] && replayRows[0].lifecycle_state === "PUBLISHED"
          ? { state: "REPLAYED" as const, receipt: mapReceipt(replayRows[0]) }
          : { state: "REVISION_CONFLICT" as const };
      }

      const releaseRows = await transaction<ReleaseRow[]>`
        SELECT ${transaction.unsafe(releaseSelect)} FROM gis_formalization_releases
        WHERE scenic_area_id = ${command.actor.scenicAreaId} AND id = ${command.releaseId}
        FOR UPDATE
      `;
      const release = releaseRows[0];
      if (!release) return { state: "NOT_FOUND" as const };
      if (release.prepared_by_subject === command.actor.oidcSubject) return { state: "PREPARER_CANNOT_PUBLISH" as const };
      if (release.lifecycle_state !== "PREPARED" || Number(release.workflow_revision) !== command.expectedWorkflowRevision) return { state: "REVISION_CONFLICT" as const };
      const nowMs = new Date(command.occurredAt).getTime();
      if (new Date(release.valid_until).getTime() <= nowMs || new Date(release.operational_expires_at).getTime() <= nowMs) return { state: "CANDIDATE_EXPIRED" as const };

      const loaded = await loadSource(transaction, command.actor.scenicAreaId, release.submission_id, true);
      if (!loaded || loaded.row.lifecycle_state !== "APPROVED_FOR_FORMALIZATION" || Number(loaded.row.workflow_revision) !== 2) return { state: "SOURCE_CHANGED" as const };
      if (loaded.row.submitted_by_subject === command.actor.oidcSubject || loaded.row.reviewed_by_subject === command.actor.oidcSubject) return { state: "DUTY_SEPARATION_FAILED" as const };
      if (loaded.source.submissionContentSha256 !== release.submission_content_sha256.trim()) return { state: "SOURCE_CHANGED" as const };
      const stored = inputFromPlan(release.formalization_plan_json);
      if (!stored || stored.preparedBySubject !== release.prepared_by_subject) return { state: "PLAN_INVALID" as const };
      const recompiled = compileGisFormalizationPlan(loaded.source, stored.input, stored.preparedBySubject, stored.preparedAt);
      if (!recompiled.ok || recompiled.planSha256 !== release.plan_sha256.trim() || hashGisFormalizationPlan(release.formalization_plan_json as GisFormalizationPlan) !== release.plan_sha256.trim()) return { state: "PLAN_INVALID" as const };

      const currentRows = await transaction<CurrentSnapshotRow[]>`
        SELECT id, publication_id, network_revision_id, operational_version_id
        FROM scenic_published_snapshots
        WHERE scenic_area_id = ${command.actor.scenicAreaId} AND lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL
        FOR UPDATE
      `;
      const current = currentRows[0] ?? null;
      if (current) {
        const closures = await transaction<{ count: number }[]>`
          SELECT COUNT(*)::integer AS count FROM closure_events
          WHERE scenic_area_id = ${command.actor.scenicAreaId}
            AND network_revision_id = ${current.network_revision_id}
            AND withdrawn_at IS NULL AND expires_at > ${command.occurredAt}
        `;
        if (Number(closures[0]?.count ?? 0) > 0) return { state: "ACTIVE_CLOSURES" as const };
        const pendingOperational = await transaction<{ count: number }[]>`
          SELECT COUNT(*)::integer AS count FROM route_operational_snapshot_releases
          WHERE scenic_area_id = ${command.actor.scenicAreaId}
            AND lifecycle_state = 'PREPARED' AND expires_at > ${command.occurredAt}
        `;
        if (Number(pendingOperational[0]?.count ?? 0) > 0) return { state: "OPERATIONAL_RELEASE_PENDING" as const };
      }

      const poiIdsByDraftId = new Map(recompiled.plan.poiDraftIds.map((draftId) => [draftId, randomUUID()]));
      const materialized = materializeGisFormalization(recompiled.plan, loaded.source.collection, { poiIdsByDraftId }, command.actor.oidcSubject, command.managementEvidenceReference, new Date(command.occurredAt));
      if (!materialized.ok) return { state: "PLAN_INVALID" as const };
      const { routeNetwork, operationalState, snapshotJson, snapshotSha256 } = materialized.value;

      const dataSourceId = randomUUID();
      const publicationId = randomUUID();
      const networkRevisionId = randomUUID();
      const operationalVersionId = randomUUID();
      const snapshotId = randomUUID();
      const revisionRows = await transaction<{ publication_revision: number; snapshot_revision: number }[]>`
        SELECT
          (SELECT COALESCE(MAX(revision), 0) + 1 FROM scenic_area_publications WHERE scenic_area_id = ${command.actor.scenicAreaId})::integer AS publication_revision,
          (SELECT COALESCE(MAX(snapshot_revision), 0) + 1 FROM scenic_published_snapshots WHERE scenic_area_id = ${command.actor.scenicAreaId})::integer AS snapshot_revision
      `;
      const publicationRevision = Number(revisionRows[0]?.publication_revision);
      const snapshotRevision = Number(revisionRows[0]?.snapshot_revision);
      if (!Number.isSafeInteger(publicationRevision) || publicationRevision < 1 || !Number.isSafeInteger(snapshotRevision) || snapshotRevision < 1) throw new Error("invalid_formal_publication_revision");

      if (current) {
        await transaction`
          UPDATE formal_offline_packs
          SET lifecycle_state = 'WITHDRAWN', withdrawn_at = ${command.occurredAt},
              withdrawal_reason = 'SUPERSEDED_BY_FORMAL_GIS_RELEASE'
          WHERE scenic_area_id = ${command.actor.scenicAreaId}
            AND published_snapshot_id = ${current.id}
            AND lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL
        `;
        await transaction`UPDATE scenic_published_snapshots SET lifecycle_state = 'WITHDRAWN', withdrawn_at = ${command.occurredAt} WHERE id = ${current.id} AND lifecycle_state = 'PUBLISHED'`;
        await transaction`UPDATE route_operational_versions SET lifecycle_state = 'SUPERSEDED' WHERE id = ${current.operational_version_id} AND lifecycle_state = 'PUBLISHED'`;
        await transaction`UPDATE route_network_revisions SET lifecycle_state = 'WITHDRAWN' WHERE id = ${current.network_revision_id} AND lifecycle_state = 'PUBLISHED'`;
        await transaction`UPDATE scenic_area_publications SET lifecycle_state = 'WITHDRAWN', withdrawn_at = ${command.occurredAt} WHERE id = ${current.publication_id} AND lifecycle_state = 'PUBLISHED'`;
      }

      await transaction`
        INSERT INTO data_sources (
          id, scenic_area_id, source_reference, source_kind, license_state, collected_at,
          verified_at, verified_by_subject, valid_until, notes_reference, created_at, updated_at
        ) VALUES (
          ${dataSourceId}, ${command.actor.scenicAreaId}, ${`${recompiled.plan.sourceReference}#formalization-${release.id}`},
          'FIELD_SURVEY', 'CLEARED', ${recompiled.plan.preparedAt}, ${command.occurredAt},
          ${command.actor.oidcSubject}, ${recompiled.plan.validUntil}, ${recompiled.plan.licenseReference},
          ${command.occurredAt}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO scenic_area_publications (
          id, scenic_area_id, revision, lifecycle_state, expected_revision, idempotency_key_hash,
          created_by_subject, reviewed_by_subject, published_by_subject, created_at, reviewed_at,
          published_at, valid_until, reason_reference
        ) VALUES (
          ${publicationId}, ${command.actor.scenicAreaId}, ${publicationRevision}, 'PUBLISHED', 1,
          ${command.idempotencyKeyHash}, ${recompiled.plan.preparedBySubject}, ${recompiled.plan.reviewedBySubject},
          ${command.actor.oidcSubject}, ${recompiled.plan.preparedAt}, ${recompiled.plan.reviewedAt},
          ${command.occurredAt}, ${recompiled.plan.validUntil}, ${command.managementEvidenceReference}
        )
      `;
      await transaction`
        INSERT INTO route_network_revisions (
          id, scenic_area_id, publication_id, source_id, revision, lifecycle_state,
          coordinate_system, verification_state, geometry_sha256, valid_until, created_at
        ) VALUES (
          ${networkRevisionId}, ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId},
          ${routeNetwork.revision}, 'PUBLISHED', 'WGS84', 'FIELD_VERIFIED', ${release.plan_sha256.trim()},
          ${recompiled.plan.validUntil}, ${command.occurredAt}
        )
      `;

      const draftById = new Map(loaded.source.collection.drafts.map((draft) => [draft.id, draft]));
      const boundary = draftById.get(recompiled.plan.boundaryDraftId)!;
      await transaction`
        INSERT INTO published_boundaries (
          scenic_area_id, publication_id, source_id, geometry_wgs84, original_coordinate_system,
          transform_method, transform_version, geometry_sha256, field_verified_by_subject,
          field_verified_at, valid_until, created_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId},
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(boundary.geometry)}), 4326)),
          'WGS84', 'NONE', 'native-wgs84-v1',
          ${createHash("sha256").update(JSON.stringify(boundary.geometry), "utf8").digest("hex")},
          ${recompiled.plan.reviewedBySubject}, ${recompiled.plan.reviewedAt}, ${recompiled.plan.validUntil}, ${command.occurredAt}
        )
      `;

      for (const policy of recompiled.plan.entrancePolicies) {
        const draft = draftById.get(policy.draftId)!;
        await transaction`
          INSERT INTO published_entrances (
            scenic_area_id, publication_id, source_id, entrance_code, label, entrance_kind,
            geometry_wgs84, original_coordinate_system, transform_method, transform_version,
            verification_state, field_verified_by_subject, field_verified_at, valid_until, created_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId}, ${stableCode("entrance", draft.id)},
            ${draft.title}, ${policy.type}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(draft.geometry)}), 4326),
            'WGS84', 'NONE', 'native-wgs84-v1', 'FIELD_VERIFIED', ${recompiled.plan.reviewedBySubject},
            ${recompiled.plan.reviewedAt}, ${recompiled.plan.validUntil}, ${command.occurredAt}
          )
        `;
      }
      for (const draftId of recompiled.plan.poiDraftIds) {
        const draft = draftById.get(draftId)!;
        await transaction`
          INSERT INTO published_pois (
            id, scenic_area_id, publication_id, source_id, canonical_code, label, poi_kind,
            geometry_wgs84, original_coordinate_system, transform_method, transform_version,
            verification_state, valid_until, created_at
          ) VALUES (
            ${poiIdsByDraftId.get(draftId)!}, ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId},
            ${stableCode("poi", draft.id)}, ${draft.title}, 'SCENIC_DESTINATION',
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(draft.geometry)}), 4326),
            'WGS84', 'NONE', 'native-wgs84-v1', 'FIELD_VERIFIED', ${recompiled.plan.validUntil}, ${command.occurredAt}
          )
        `;
      }
      for (const draftId of recompiled.plan.facilityDraftIds) {
        const draft = draftById.get(draftId)!;
        await transaction`
          INSERT INTO published_facilities (
            scenic_area_id, publication_id, source_id, facility_kind, label, geometry_wgs84,
            verification_state, valid_until
          ) VALUES (
            ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId}, 'OTHER', ${draft.title},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(draft.geometry)}), 4326),
            'FIELD_VERIFIED', ${recompiled.plan.validUntil}
          )
        `;
      }
      for (const draftId of recompiled.plan.recommendedRouteDraftIds) {
        const draft = draftById.get(draftId)!;
        await transaction`
          INSERT INTO published_recommended_routes (
            scenic_area_id, publication_id, source_id, route_code, label, geometry_wgs84,
            verification_state, valid_until, created_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${publicationId}, ${dataSourceId}, ${stableCode("recommendation", draft.id)},
            ${draft.title}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(draft.geometry)}), 4326),
            'FIELD_VERIFIED', ${recompiled.plan.validUntil}, ${command.occurredAt}
          )
        `;
      }

      const nodeUuidByCode = new Map<string, string>();
      for (const node of recompiled.plan.nodes) {
        const nodeUuid = randomUUID();
        nodeUuidByCode.set(node.code, nodeUuid);
        const point = node.pointDraftId ? draftById.get(node.pointDraftId)! : null;
        const entrancePolicy = node.entranceDraftId ? recompiled.plan.entrancePolicies.find((policy) => policy.draftId === node.entranceDraftId)! : null;
        const nodeKind = entrancePolicy ? (entrancePolicy.type === "EXIT" ? "EXIT" : "ENTRANCE") : node.kind === "FACILITY" ? "FACILITY" : "ROUTE";
        const visit = point?.visitAttributes ?? null;
        await transaction`
          INSERT INTO route_nodes (
            id, network_revision_id, node_code, node_kind, geometry_wgs84, created_at,
            display_name, published_poi_id, visit_interest_tags, visit_dwell_minutes,
            visit_editorial_priority, visit_family_friendly, visit_rest_area, visit_photo_spot,
            visit_evidence_reference
          ) VALUES (
            ${nodeUuid}, ${networkRevisionId}, ${node.code}, ${nodeKind},
            ST_SetSRID(ST_MakePoint(${node.coordinate[0]}, ${node.coordinate[1]}), 4326), ${command.occurredAt},
            ${point?.title ?? null}, ${point?.objectType === "POI" ? poiIdsByDraftId.get(point.id)! : null},
            ${visit?.interests ?? null}, ${visit?.dwellMinutes ?? null}, ${visit?.editorialPriority ?? null},
            ${visit?.familyFriendly ?? null}, ${visit?.restArea ?? null}, ${visit?.photoSpot ?? null},
            ${visit ? point!.source.url! : null}
          )
        `;
      }

      const edgeUuidByCode = new Map<string, string>();
      for (const edge of recompiled.plan.edges) {
        const edgeUuid = randomUUID();
        edgeUuidByCode.set(edge.code, edgeUuid);
        const path = draftById.get(edge.pathDraftId)!;
        const attrs = path.routingAttributes!;
        await transaction`
          INSERT INTO route_edges (
            id, network_revision_id, edge_code, from_node_id, to_node_id, travel_direction,
            geometry_wgs84, distance_meters, estimated_seconds, has_steps, max_slope_percent,
            minimum_width_meters, accessibility_state, safety_state, source_reference,
            management_approved_at, created_at, traversal_mode, difficulty_level, scenic_score,
            routing_evidence_reference, transport_service_name, transport_boarding_seconds,
            transport_expected_wait_seconds, transport_in_vehicle_seconds,
            transport_schedule_evidence_reference
          ) VALUES (
            ${edgeUuid}, ${networkRevisionId}, ${edge.code}, ${nodeUuidByCode.get(edge.fromNodeCode)!},
            ${nodeUuidByCode.get(edge.toNodeCode)!}, ${edge.walkingDirection},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(edge.geometry)}), 4326), ${edge.distanceMeters},
            ${Math.max(1, Math.round(edge.estimatedMinutes * 60))}, ${attrs.traversalMode === "STAIRS"},
            NULL, NULL, ${attrs.accessibility}, 'OPEN', ${path.source.url!}, ${command.occurredAt},
            ${command.occurredAt}, ${attrs.traversalMode}, ${attrs.difficulty}, ${attrs.scenicScore}, ${path.source.url!},
            ${attrs.transportService?.serviceName ?? null},
            ${attrs.transportService ? Math.round(attrs.transportService.boardingMinutes * 60) : null},
            ${attrs.transportService ? Math.round(attrs.transportService.expectedWaitMinutes * 60) : null},
            ${attrs.transportService ? Math.max(1, Math.round(attrs.transportService.inVehicleMinutes * 60)) : null},
            ${attrs.transportService?.scheduleEvidenceReference ?? null}
          )
        `;
      }

      await transaction`
        INSERT INTO route_operational_versions (
          id, scenic_area_id, network_revision_id, operational_version, lifecycle_state,
          source_reference, responsible_party, issued_at, expires_at, expected_revision,
          idempotency_key_hash, published_by_subject
        ) VALUES (
          ${operationalVersionId}, ${command.actor.scenicAreaId}, ${networkRevisionId}, 1, 'PUBLISHED',
          ${operationalState.sourceReference}, ${operationalState.responsibleParty}, ${command.occurredAt},
          ${operationalState.expiresAt}, 1, ${command.idempotencyKeyHash}, ${command.actor.oidcSubject}
        )
      `;
      for (const state of operationalState.edgeStates) {
        await transaction`
          INSERT INTO route_edge_operational_states (
            operational_version_id, network_revision_id, edge_id, status, checked_at, expires_at,
            source_reference, responsible_party, travel_time_multiplier, crowd_level, weather_impact
          ) VALUES (
            ${operationalVersionId}, ${networkRevisionId}, ${edgeUuidByCode.get(state.edgeId)!}, ${state.status},
            ${state.checkedAt}, ${state.expiresAt}, ${state.sourceReference}, ${state.responsibleParty},
            1, 'UNKNOWN', 'UNKNOWN'
          )
        `;
      }
      await transaction`
        INSERT INTO scenic_published_snapshots (
          id, scenic_area_id, publication_id, network_revision_id, operational_version_id,
          snapshot_revision, lifecycle_state, snapshot_json, snapshot_sha256, expires_at,
          expected_revision, idempotency_key_hash, published_by_subject, created_at, published_at
        ) VALUES (
          ${snapshotId}, ${command.actor.scenicAreaId}, ${publicationId}, ${networkRevisionId},
          ${operationalVersionId}, ${snapshotRevision}, 'PUBLISHED', ${transaction.json(snapshotJson)},
          ${snapshotSha256}, ${operationalState.expiresAt}, 1, ${command.idempotencyKeyHash},
          ${command.actor.oidcSubject}, ${command.occurredAt}, ${command.occurredAt}
        )
      `;

      const updatedRows = await transaction<ReleaseRow[]>`
        UPDATE gis_formalization_releases
        SET workflow_revision = 2, lifecycle_state = 'PUBLISHED',
            published_by_subject = ${command.actor.oidcSubject}, published_at = ${command.occurredAt},
            management_evidence_reference = ${command.managementEvidenceReference},
            publication_id = ${publicationId}, network_revision_id = ${networkRevisionId},
            operational_version_id = ${operationalVersionId}, snapshot_id = ${snapshotId},
            snapshot_revision = ${snapshotRevision}, updated_at = ${command.occurredAt}
        WHERE id = ${command.releaseId} AND scenic_area_id = ${command.actor.scenicAreaId}
          AND lifecycle_state = 'PREPARED' AND workflow_revision = 1
        RETURNING ${transaction.unsafe(releaseSelect)}
      `;
      const updated = updatedRows[0];
      if (!updated) throw new Error("gis_formalization_transition_failed");
      await transaction`
        INSERT INTO gis_formalization_release_actions (
          scenic_area_id, release_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.releaseId}, 'PUBLISH', ${command.actor.oidcSubject},
          'RELEASE_ADMIN', 1, 2, ${command.idempotencyKeyHash}, ${command.managementEvidenceReference}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'RELEASE_ADMIN', 'GIS_FORMALIZATION_PUBLISHED',
          'GIS_FORMALIZATION_RELEASE', ${command.releaseId}, 1, ${command.idempotencyKeyHash},
          ${command.managementEvidenceReference},
          ${transaction.json({ snapshotId, snapshotRevision, networkRevision: routeNetwork.revision, snapshotSha256 })},
          ${command.occurredAt}
        )
      `;
      return { state: "PUBLISHED" as const, receipt: mapReceipt(updated) };
    });
  },
};
