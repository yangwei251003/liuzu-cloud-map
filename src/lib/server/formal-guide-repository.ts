import "server-only";

import { getDatabase } from "./database";
import type {
  FormalGuideKnowledgeEntry,
  FormalGuideKnowledgeRepository,
  PublishedFormalGuideKnowledgeSnapshot,
} from "./formal-guide-domain";

type Timestamp = Date | string;

type SnapshotRow = {
  scenic_area_id: string;
  snapshot_revision: number;
  lifecycle_state: "PUBLISHED";
  published_at: Timestamp;
  expires_at: Timestamp;
};

type KnowledgeRow = {
  knowledge_id: string;
  content_version_id: string;
  content_revision: number;
  knowledge_key: string;
  fact_type: FormalGuideKnowledgeEntry["factType"];
  source_reference: string;
  body_json: unknown;
  knowledge_lifecycle_state: FormalGuideKnowledgeEntry["knowledgeLifecycleState"];
  knowledge_valid_until: Timestamp;
  knowledge_withdrawn_at: Timestamp | null;
  content_lifecycle_state: FormalGuideKnowledgeEntry["contentLifecycleState"];
  content_valid_until: Timestamp;
  rights_state: FormalGuideKnowledgeEntry["rightsState"];
  source_license_state: FormalGuideKnowledgeEntry["sourceLicenseState"];
  source_verified_at: Timestamp | null;
  source_valid_until: Timestamp;
};

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_formal_guide_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function mapKnowledgeRow(row: KnowledgeRow): FormalGuideKnowledgeEntry {
  return {
    knowledgeId: row.knowledge_id,
    contentVersionId: row.content_version_id,
    contentRevision: row.content_revision,
    knowledgeKey: row.knowledge_key,
    factType: row.fact_type,
    sourceReference: row.source_reference,
    bodyJson: structuredClone(row.body_json),
    knowledgeLifecycleState: row.knowledge_lifecycle_state,
    knowledgeValidUntil: toIso(row.knowledge_valid_until),
    knowledgeWithdrawnAt: nullableIso(row.knowledge_withdrawn_at),
    contentLifecycleState: row.content_lifecycle_state,
    contentValidUntil: toIso(row.content_valid_until),
    rightsState: row.rights_state,
    sourceLicenseState: row.source_license_state,
    sourceVerifiedAt: nullableIso(row.source_verified_at),
    sourceValidUntil: toIso(row.source_valid_until),
  };
}

/**
 * Reads one active scenic snapshot before reading knowledge. No prototype,
 * candidate-map, hard-coded knowledge, or remote AI result can satisfy this
 * boundary. All eligibility predicates are repeated by the service.
 */
export const postgresFormalGuideKnowledgeRepository: FormalGuideKnowledgeRepository = {
  async readCurrentPublishedKnowledge(scenicAreaId, expectedSnapshotRevision) {
    const sql = getDatabase();
    const snapshots = await sql<SnapshotRow[]>`
      SELECT snapshot.scenic_area_id, snapshot.snapshot_revision, snapshot.lifecycle_state,
             snapshot.published_at, snapshot.expires_at
      FROM scenic_published_snapshots AS snapshot
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = snapshot.scenic_area_id
      WHERE snapshot.scenic_area_id = ${scenicAreaId}
        AND snapshot.snapshot_revision = ${expectedSnapshotRevision}
        AND snapshot.lifecycle_state = 'PUBLISHED'
        AND snapshot.published_at IS NOT NULL
        AND snapshot.published_by_subject IS NOT NULL
        AND snapshot.withdrawn_at IS NULL
        AND snapshot.expires_at > CURRENT_TIMESTAMP
        AND publication.lifecycle_state = 'PUBLISHED'
        AND publication.published_at IS NOT NULL
        AND publication.published_by_subject IS NOT NULL
        AND publication.withdrawn_at IS NULL
        AND publication.valid_until > CURRENT_TIMESTAMP
      LIMIT 1
    `;
    const snapshot = snapshots[0];
    if (!snapshot) return null;

    const rows = await sql<KnowledgeRow[]>`
      SELECT
        knowledge.id AS knowledge_id,
        content.id AS content_version_id,
        content.revision AS content_revision,
        knowledge.knowledge_key,
        knowledge.fact_type,
        knowledge.source_reference,
        content.body_json,
        knowledge.lifecycle_state AS knowledge_lifecycle_state,
        knowledge.valid_until AS knowledge_valid_until,
        knowledge.withdrawn_at AS knowledge_withdrawn_at,
        content.lifecycle_state AS content_lifecycle_state,
        content.valid_until AS content_valid_until,
        content.rights_state,
        source.license_state AS source_license_state,
        source.verified_at AS source_verified_at,
        source.valid_until AS source_valid_until
      FROM knowledge_entries AS knowledge
      INNER JOIN content_versions AS content
        ON content.id = knowledge.content_version_id
       AND content.scenic_area_id = knowledge.scenic_area_id
      INNER JOIN scenic_published_snapshots AS snapshot
        ON snapshot.scenic_area_id = knowledge.scenic_area_id
       AND snapshot.snapshot_revision = ${expectedSnapshotRevision}
       AND snapshot.lifecycle_state = 'PUBLISHED'
       AND snapshot.published_at IS NOT NULL
       AND snapshot.published_by_subject IS NOT NULL
       AND snapshot.withdrawn_at IS NULL
       AND snapshot.expires_at > CURRENT_TIMESTAMP
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = snapshot.scenic_area_id
       AND publication.lifecycle_state = 'PUBLISHED'
       AND publication.published_at IS NOT NULL
       AND publication.published_by_subject IS NOT NULL
       AND publication.withdrawn_at IS NULL
       AND publication.valid_until > CURRENT_TIMESTAMP
      INNER JOIN data_sources AS source
        ON source.id = content.source_id
       AND source.scenic_area_id = content.scenic_area_id
      WHERE knowledge.scenic_area_id = ${scenicAreaId}
        AND content.content_kind = 'KNOWLEDGE'
        AND knowledge.lifecycle_state IN ('APPROVED', 'PUBLISHED')
        AND knowledge.withdrawn_at IS NULL
        AND knowledge.valid_until > CURRENT_TIMESTAMP
        AND content.lifecycle_state IN ('APPROVED', 'PUBLISHED')
        AND content.reviewed_by_subject IS NOT NULL
        AND content.rights_state = 'CLEARED'
        AND content.valid_until > CURRENT_TIMESTAMP
        AND source.license_state = 'CLEARED'
        AND source.verified_at IS NOT NULL
        AND source.verified_by_subject IS NOT NULL
        AND source.valid_until > CURRENT_TIMESTAMP
        AND knowledge.fact_type IN ('HISTORICAL', 'CULTURAL', 'VISITOR_SERVICE', 'SAFETY')
      ORDER BY knowledge.knowledge_key ASC, knowledge.id ASC
    `;

    const result: PublishedFormalGuideKnowledgeSnapshot = {
      schemaVersion: 1,
      scenicAreaId: snapshot.scenic_area_id,
      snapshotRevision: snapshot.snapshot_revision,
      lifecycleState: snapshot.lifecycle_state,
      publishedAt: toIso(snapshot.published_at),
      expiresAt: toIso(snapshot.expires_at),
      entries: rows.map(mapKnowledgeRow),
    };
    return result;
  },
};
