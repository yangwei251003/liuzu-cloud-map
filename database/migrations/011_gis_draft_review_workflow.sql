-- Versioned GIS candidate intake. Submitted geometry remains quarantined from
-- route_network_revisions and published_* tables even after GIS review.

CREATE TABLE IF NOT EXISTS gis_draft_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  submission_revision integer NOT NULL CHECK (submission_revision > 0),
  workflow_revision integer NOT NULL DEFAULT 1 CHECK (workflow_revision IN (1, 2)),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('SUBMITTED', 'APPROVED_FOR_FORMALIZATION', 'REJECTED')),
  source_schema_version integer NOT NULL CHECK (source_schema_version = 2),
  object_count integer NOT NULL CHECK (object_count BETWEEN 1 AND 200),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_by_subject text NOT NULL,
  submitted_by_role text NOT NULL CHECK (submitted_by_role = 'GIS_EDITOR'),
  submitted_at timestamptz NOT NULL,
  reviewed_by_subject text,
  reviewed_by_role text CHECK (reviewed_by_role IS NULL OR reviewed_by_role = 'GIS_REVIEWER'),
  reviewed_at timestamptz,
  review_decision text CHECK (review_decision IS NULL OR review_decision IN ('APPROVE_FOR_FORMALIZATION', 'REJECT')),
  review_evidence_reference text,
  create_idempotency_key_hash char(64) NOT NULL CHECK (create_idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, submission_revision),
  UNIQUE (scenic_area_id, submitted_by_subject, create_idempotency_key_hash),
  UNIQUE (scenic_area_id, id),
  CHECK (submitted_by_subject <> ''),
  CHECK (
    (lifecycle_state = 'SUBMITTED' AND workflow_revision = 1 AND reviewed_by_subject IS NULL AND reviewed_by_role IS NULL AND reviewed_at IS NULL AND review_decision IS NULL AND review_evidence_reference IS NULL)
    OR
    (lifecycle_state = 'APPROVED_FOR_FORMALIZATION' AND workflow_revision = 2 AND reviewed_by_subject IS NOT NULL AND reviewed_by_role = 'GIS_REVIEWER' AND reviewed_at IS NOT NULL AND review_decision = 'APPROVE_FOR_FORMALIZATION' AND review_evidence_reference IS NOT NULL)
    OR
    (lifecycle_state = 'REJECTED' AND workflow_revision = 2 AND reviewed_by_subject IS NOT NULL AND reviewed_by_role = 'GIS_REVIEWER' AND reviewed_at IS NOT NULL AND review_decision = 'REJECT' AND review_evidence_reference IS NOT NULL)
  ),
  CHECK (reviewed_by_subject IS NULL OR reviewed_by_subject <> submitted_by_subject),
  CHECK (reviewed_at IS NULL OR reviewed_at >= submitted_at)
);

CREATE INDEX IF NOT EXISTS gis_draft_submissions_scenic_state_idx
  ON gis_draft_submissions (scenic_area_id, lifecycle_state, submission_revision DESC);

CREATE TABLE IF NOT EXISTS gis_draft_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  submission_id uuid NOT NULL,
  client_object_id text NOT NULL CHECK (length(client_object_id) BETWEEN 1 AND 100),
  object_type text NOT NULL CHECK (object_type IN ('ENTRANCE', 'PATH', 'POI', 'FACILITY', 'RECOMMENDED_ROUTE', 'BOUNDARY', 'NOTE')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  geometry_wgs84 geometry(Geometry, 4326) NOT NULL,
  source_label text NOT NULL CHECK (length(source_label) BETWEEN 1 AND 180),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  source_captured_at timestamptz NOT NULL,
  routing_attributes jsonb,
  visit_attributes jsonb,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  draft_created_at timestamptz NOT NULL,
  draft_updated_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, submission_id, client_object_id),
  FOREIGN KEY (scenic_area_id, submission_id) REFERENCES gis_draft_submissions(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (ST_SRID(geometry_wgs84) = 4326 AND NOT ST_IsEmpty(geometry_wgs84) AND ST_IsValid(geometry_wgs84)),
  CHECK (
    (object_type IN ('ENTRANCE', 'POI', 'FACILITY') AND GeometryType(geometry_wgs84) = 'POINT')
    OR (object_type IN ('PATH', 'RECOMMENDED_ROUTE') AND GeometryType(geometry_wgs84) = 'LINESTRING')
    OR (object_type = 'BOUNDARY' AND GeometryType(geometry_wgs84) = 'POLYGON')
    OR (object_type = 'NOTE' AND GeometryType(geometry_wgs84) IN ('POINT', 'LINESTRING', 'POLYGON'))
  ),
  CHECK (
    (object_type IN ('PATH', 'RECOMMENDED_ROUTE') AND jsonb_typeof(routing_attributes) = 'object')
    OR (object_type NOT IN ('PATH', 'RECOMMENDED_ROUTE') AND routing_attributes IS NULL)
  ),
  CHECK (
    (object_type IN ('POI', 'FACILITY') AND jsonb_typeof(visit_attributes) = 'object')
    OR (object_type NOT IN ('POI', 'FACILITY') AND visit_attributes IS NULL)
  ),
  CHECK (draft_updated_at >= draft_created_at)
);

CREATE INDEX IF NOT EXISTS gis_draft_objects_submission_idx
  ON gis_draft_objects (scenic_area_id, submission_id, object_type);
CREATE INDEX IF NOT EXISTS gis_draft_objects_geometry_gix
  ON gis_draft_objects USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS gis_draft_submission_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL,
  submission_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVE_FOR_FORMALIZATION', 'REJECT')),
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('GIS_EDITOR', 'GIS_REVIEWER')),
  expected_workflow_revision integer NOT NULL CHECK (expected_workflow_revision IN (0, 1)),
  resulting_workflow_revision integer NOT NULL CHECK (resulting_workflow_revision = expected_workflow_revision + 1),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  evidence_reference text NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (submission_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, submission_id) REFERENCES gis_draft_submissions(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS gis_draft_submission_events_submission_idx
  ON gis_draft_submission_events (scenic_area_id, submission_id, occurred_at ASC, id ASC);

CREATE OR REPLACE FUNCTION reject_gis_draft_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submitted GIS draft objects and workflow events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS gis_draft_objects_immutable ON gis_draft_objects;
CREATE TRIGGER gis_draft_objects_immutable
BEFORE UPDATE OR DELETE ON gis_draft_objects
FOR EACH ROW EXECUTE FUNCTION reject_gis_draft_immutable_mutation();

DROP TRIGGER IF EXISTS gis_draft_submission_events_immutable ON gis_draft_submission_events;
CREATE TRIGGER gis_draft_submission_events_immutable
BEFORE UPDATE OR DELETE ON gis_draft_submission_events
FOR EACH ROW EXECUTE FUNCTION reject_gis_draft_immutable_mutation();

COMMENT ON TABLE gis_draft_submissions IS 'Quarantined GIS candidate review queue. Approval means eligible for a separate formalization process, never direct publication.';
COMMENT ON TABLE gis_draft_objects IS 'Immutable WGS84 candidate objects. These rows must never be queried as a published route network.';
