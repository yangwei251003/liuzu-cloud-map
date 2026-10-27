import "server-only";

import { getDatabase } from "./database";
import {
  parseGisDraftSubmissionDetail,
  parseGisDraftSubmissionReceipt,
  type GisDraftReviewEligibility,
  type GisDraftReviewQueueItem,
  type GisDraftSubmissionReceipt,
  type GisDraftSubmissionRepository,
} from "./gis-draft-submission-service";

type Timestamp = Date | string;
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
  reviewed_at: Timestamp | null;
  review_decision: string | null;
  review_evidence_reference: string | null;
  create_idempotency_key_hash: string;
};

type ReviewEventRow = {
  action: string;
  actor_oidc_subject: string;
  expected_workflow_revision: number;
  idempotency_key_hash: string;
  evidence_reference: string;
};

type SubmissionQueueRow = SubmissionRow & {
  review_eligible: boolean;
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

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_gis_draft_timestamp");
  return date.toISOString();
}

function mapReceipt(row: SubmissionRow): GisDraftSubmissionReceipt {
  const receipt = parseGisDraftSubmissionReceipt({
    schemaVersion: 1,
    submissionId: row.id,
    scenicAreaId: row.scenic_area_id,
    submissionRevision: row.submission_revision,
    workflowRevision: row.workflow_revision,
    state: row.lifecycle_state,
    objectCount: row.object_count,
    contentSha256: row.content_sha256.trim(),
    submittedAt: toIso(row.submitted_at),
    reviewedAt: row.reviewed_at === null ? null : toIso(row.reviewed_at),
    decision: row.review_decision,
    reviewEvidenceReference: row.review_evidence_reference,
  });
  if (!receipt) throw new Error("invalid_gis_draft_submission_row");
  return receipt;
}

function eligibility(row: SubmissionQueueRow): GisDraftReviewEligibility {
  return row.review_eligible ? "ELIGIBLE" : "SUBMITTER_CANNOT_REVIEW";
}

function mapQueueItem(row: SubmissionQueueRow): GisDraftReviewQueueItem {
  return { receipt: mapReceipt(row), reviewEligibility: eligibility(row) };
}

export const postgresGisDraftSubmissionRepository: GisDraftSubmissionRepository = {
  async create(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`gis-draft:${command.actor.scenicAreaId}`}))`;
      const existingRows = await transaction<SubmissionRow[]>`
        SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
               object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
               review_decision, review_evidence_reference, create_idempotency_key_hash
        FROM gis_draft_submissions
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND submitted_by_subject = ${command.actor.oidcSubject}
          AND create_idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const existing = existingRows[0];
      if (existing) {
        return existing.content_sha256.trim() === command.contentSha256
          && existing.object_count === command.collection.drafts.length
          ? { state: "REPLAYED" as const, receipt: mapReceipt(existing) }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }

      const revisions = await transaction<{ next_revision: number }[]>`
        SELECT COALESCE(MAX(submission_revision), 0) + 1 AS next_revision
        FROM gis_draft_submissions
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
      `;
      const nextRevision = Number(revisions[0]?.next_revision);
      if (!Number.isSafeInteger(nextRevision) || nextRevision < 1) throw new Error("invalid_gis_draft_revision");

      const rows = await transaction<SubmissionRow[]>`
        INSERT INTO gis_draft_submissions (
          scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
          source_schema_version, object_count, content_sha256, submitted_by_subject,
          submitted_by_role, submitted_at, create_idempotency_key_hash, created_at, updated_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${nextRevision}, 1, 'SUBMITTED', 2,
          ${command.collection.drafts.length}, ${command.contentSha256}, ${command.actor.oidcSubject},
          'GIS_EDITOR', ${command.occurredAt}, ${command.idempotencyKeyHash}, ${command.occurredAt}, ${command.occurredAt}
        )
        RETURNING id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
                  object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
                  review_decision, review_evidence_reference, create_idempotency_key_hash
      `;
      const created = rows[0];
      if (!created) throw new Error("gis_draft_submission_insert_failed");

      for (const draft of command.collection.drafts) {
        const routingAttributes = draft.routingAttributes === null ? null : transaction.json(draft.routingAttributes);
        const visitAttributes = draft.visitAttributes === null ? null : transaction.json(draft.visitAttributes);
        await transaction`
          INSERT INTO gis_draft_objects (
            scenic_area_id, submission_id, client_object_id, object_type, title, geometry_wgs84,
            source_label, source_url, source_captured_at, routing_attributes, visit_attributes,
            notes, draft_created_at, draft_updated_at, ingested_at
          ) VALUES (
            ${command.actor.scenicAreaId}, ${created.id}, ${draft.id}, ${draft.objectType}, ${draft.title},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(draft.geometry)}), 4326),
            ${draft.source.label}, ${draft.source.url}, ${draft.source.capturedAt},
            ${routingAttributes}, ${visitAttributes}, ${draft.notes}, ${draft.createdAt}, ${draft.updatedAt}, ${command.occurredAt}
          )
        `;
      }

      const evidenceReference = `urn:sha256:${command.contentSha256}`;
      await transaction`
        INSERT INTO gis_draft_submission_events (
          scenic_area_id, submission_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${created.id}, 'SUBMITTED', ${command.actor.oidcSubject}, 'GIS_EDITOR',
          0, 1, ${command.idempotencyKeyHash}, ${evidenceReference}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'GIS_EDITOR', 'GIS_DRAFT_SUBMITTED',
          'GIS_DRAFT_SUBMISSION', ${created.id}, 0, ${command.idempotencyKeyHash}, ${evidenceReference},
          ${transaction.json({ objectCount: command.collection.drafts.length, contentSha256: command.contentSha256 })},
          ${command.occurredAt}
        )
      `;
      return { state: "CREATED" as const, receipt: mapReceipt(created) };
    });
  },

  async review(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const replayRows = await transaction<ReviewEventRow[]>`
        SELECT action, actor_oidc_subject, expected_workflow_revision, idempotency_key_hash, evidence_reference
        FROM gis_draft_submission_events
        WHERE scenic_area_id = ${command.actor.scenicAreaId}
          AND submission_id = ${command.submissionId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const replay = replayRows[0];
      if (replay) {
        if (
          replay.action !== command.decision
          || replay.actor_oidc_subject !== command.actor.oidcSubject
          || replay.expected_workflow_revision !== command.expectedWorkflowRevision
          || replay.evidence_reference !== command.evidenceReference
        ) return { state: "IDEMPOTENCY_CONFLICT" as const };
        const rows = await transaction<SubmissionRow[]>`
          SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
                 object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
                 review_decision, review_evidence_reference, create_idempotency_key_hash
          FROM gis_draft_submissions
          WHERE id = ${command.submissionId} AND scenic_area_id = ${command.actor.scenicAreaId}
        `;
        return rows[0]
          ? { state: "REPLAYED" as const, receipt: mapReceipt(rows[0]) }
          : { state: "NOT_FOUND" as const };
      }

      const rows = await transaction<SubmissionRow[]>`
        SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
               object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
               review_decision, review_evidence_reference, create_idempotency_key_hash
        FROM gis_draft_submissions
        WHERE id = ${command.submissionId} AND scenic_area_id = ${command.actor.scenicAreaId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) return { state: "NOT_FOUND" as const };
      if (current.submitted_by_subject === command.actor.oidcSubject) return { state: "SUBMITTER_CANNOT_REVIEW" as const };
      if (current.lifecycle_state !== "SUBMITTED" || current.workflow_revision !== command.expectedWorkflowRevision) {
        return { state: "REVISION_CONFLICT" as const };
      }
      const nextState = command.decision === "APPROVE_FOR_FORMALIZATION" ? "APPROVED_FOR_FORMALIZATION" : "REJECTED";
      const updatedRows = await transaction<SubmissionRow[]>`
        UPDATE gis_draft_submissions
        SET lifecycle_state = ${nextState}, workflow_revision = 2,
            reviewed_by_subject = ${command.actor.oidcSubject}, reviewed_by_role = 'GIS_REVIEWER',
            reviewed_at = ${command.occurredAt}, review_decision = ${command.decision},
            review_evidence_reference = ${command.evidenceReference}, updated_at = ${command.occurredAt}
        WHERE id = ${command.submissionId}
          AND scenic_area_id = ${command.actor.scenicAreaId}
          AND lifecycle_state = 'SUBMITTED'
          AND workflow_revision = ${command.expectedWorkflowRevision}
        RETURNING id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
                  object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
                  review_decision, review_evidence_reference, create_idempotency_key_hash
      `;
      const updated = updatedRows[0];
      if (!updated) return { state: "REVISION_CONFLICT" as const };

      await transaction`
        INSERT INTO gis_draft_submission_events (
          scenic_area_id, submission_id, action, actor_oidc_subject, actor_role,
          expected_workflow_revision, resulting_workflow_revision, idempotency_key_hash,
          evidence_reference, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.submissionId}, ${command.decision},
          ${command.actor.oidcSubject}, 'GIS_REVIEWER', ${command.expectedWorkflowRevision}, 2,
          ${command.idempotencyKeyHash}, ${command.evidenceReference}, ${command.occurredAt}
        )
      `;
      await transaction`
        INSERT INTO admin_audit_events (
          scenic_area_id, actor_oidc_subject, actor_role, action, target_type, target_id,
          expected_revision, idempotency_key_hash, evidence_reference, metadata, occurred_at
        ) VALUES (
          ${command.actor.scenicAreaId}, ${command.actor.oidcSubject}, 'GIS_REVIEWER',
          ${command.decision}, 'GIS_DRAFT_SUBMISSION', ${command.submissionId},
          ${command.expectedWorkflowRevision}, ${command.idempotencyKeyHash}, ${command.evidenceReference},
          ${transaction.json({ resultingWorkflowRevision: 2, state: nextState })}, ${command.occurredAt}
        )
      `;
      return { state: "UPDATED" as const, receipt: mapReceipt(updated) };
    });
  },

  async listPending(command) {
    const sql = getDatabase();
    const rows = await sql<SubmissionQueueRow[]>`
      SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
             object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
             review_decision, review_evidence_reference, create_idempotency_key_hash,
             (submitted_by_subject <> ${command.actor.oidcSubject}) AS review_eligible
      FROM gis_draft_submissions
      WHERE scenic_area_id = ${command.actor.scenicAreaId}
        AND lifecycle_state = 'SUBMITTED'
        AND workflow_revision = 1
        AND (${command.beforeRevision}::integer IS NULL OR submission_revision < ${command.beforeRevision})
      ORDER BY submission_revision DESC
      LIMIT ${command.limit + 1}
    `;
    const visible = rows.slice(0, command.limit);
    return {
      schemaVersion: 1,
      items: visible.map(mapQueueItem),
      nextBeforeRevision: rows.length > command.limit && visible.length > 0
        ? visible[visible.length - 1].submission_revision
        : null,
    };
  },

  async readForReview(command) {
    const sql = getDatabase();
    const rows = await sql<SubmissionQueueRow[]>`
      SELECT id, scenic_area_id, submission_revision, workflow_revision, lifecycle_state,
             object_count, content_sha256, submitted_by_subject, submitted_at, reviewed_at,
             review_decision, review_evidence_reference, create_idempotency_key_hash,
             (submitted_by_subject <> ${command.actor.oidcSubject}) AS review_eligible
      FROM gis_draft_submissions
      WHERE scenic_area_id = ${command.actor.scenicAreaId}
        AND id = ${command.submissionId}
      LIMIT 1
    `;
    const submission = rows[0];
    if (!submission) return null;
    const objects = await sql<DraftObjectRow[]>`
      SELECT client_object_id, object_type, title,
             ST_AsGeoJSON(geometry_wgs84)::jsonb AS geometry,
             source_label, source_url, source_captured_at, routing_attributes,
             visit_attributes, notes, draft_created_at, draft_updated_at
      FROM gis_draft_objects
      WHERE scenic_area_id = ${command.actor.scenicAreaId}
        AND submission_id = ${command.submissionId}
      ORDER BY client_object_id ASC
    `;
    const detail = parseGisDraftSubmissionDetail({
      schemaVersion: 1,
      receipt: mapReceipt(submission),
      reviewEligibility: eligibility(submission),
      collection: {
        schemaVersion: 2,
        scenicAreaId: submission.scenic_area_id,
        warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
        drafts: objects.map((object) => ({
          schemaVersion: 2,
          id: object.client_object_id,
          scenicAreaId: submission.scenic_area_id,
          title: object.title,
          objectType: object.object_type,
          geometry: object.geometry,
          coordinateSystem: "WGS84",
          source: {
            label: object.source_label,
            url: object.source_url,
            capturedAt: toIso(object.source_captured_at),
          },
          routingAttributes: object.routing_attributes,
          visitAttributes: object.visit_attributes,
          notes: object.notes,
          verificationStatus: "CANDIDATE_DRAFT",
          publicationStatus: "LOCAL_DRAFT_ONLY",
          createdAt: toIso(object.draft_created_at),
          updatedAt: toIso(object.draft_updated_at),
        })),
      },
    });
    if (!detail) throw new Error("invalid_gis_draft_detail_rows");
    return detail;
  },
};
