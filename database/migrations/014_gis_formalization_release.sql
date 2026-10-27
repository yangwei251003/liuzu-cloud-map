-- N9: reviewed GIS candidates enter formal tables only through an immutable
-- formalization plan and an independent management release transaction.
-- This migration creates no GIS rows and assigns no inferred road state.

CREATE TABLE IF NOT EXISTS gis_formalization_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL,
  submission_revision integer NOT NULL CHECK (submission_revision > 0),
  submission_content_sha256 char(64) NOT NULL CHECK (submission_content_sha256 ~ '^[0-9a-f]{64}$'),
  workflow_revision integer NOT NULL DEFAULT 1 CHECK (workflow_revision IN (1, 2)),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('PREPARED', 'PUBLISHED')),
  formalization_plan_json jsonb NOT NULL CHECK (jsonb_typeof(formalization_plan_json) = 'object'),
  plan_sha256 char(64) NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  network_revision text NOT NULL CHECK (network_revision ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  node_count integer NOT NULL CHECK (node_count BETWEEN 2 AND 20000),
  edge_count integer NOT NULL CHECK (edge_count BETWEEN 2 AND 50000),
  poi_count integer NOT NULL CHECK (poi_count BETWEEN 1 AND 10000),
  valid_until timestamptz NOT NULL,
  operational_expires_at timestamptz NOT NULL,
  prepared_by_subject text NOT NULL,
  prepared_at timestamptz NOT NULL,
  prepare_idempotency_key_hash char(64) NOT NULL CHECK (prepare_idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  published_by_subject text,
  published_at timestamptz,
  management_evidence_reference text,
  publication_id uuid,
  network_revision_id uuid,
  operational_version_id uuid,
  snapshot_id uuid,
  snapshot_revision integer CHECK (snapshot_revision IS NULL OR snapshot_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, submission_id),
  UNIQUE (scenic_area_id, prepare_idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, submission_id) REFERENCES gis_draft_submissions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (operational_version_id) REFERENCES route_operational_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES scenic_published_snapshots(id) ON DELETE RESTRICT,
  CHECK (valid_until > prepared_at),
  CHECK (operational_expires_at > prepared_at AND operational_expires_at <= valid_until),
  CHECK (
    (lifecycle_state = 'PREPARED' AND workflow_revision = 1 AND published_by_subject IS NULL AND published_at IS NULL
      AND management_evidence_reference IS NULL AND publication_id IS NULL AND network_revision_id IS NULL
      AND operational_version_id IS NULL AND snapshot_id IS NULL AND snapshot_revision IS NULL)
    OR
    (lifecycle_state = 'PUBLISHED' AND workflow_revision = 2 AND published_by_subject IS NOT NULL AND published_at IS NOT NULL
      AND management_evidence_reference IS NOT NULL AND publication_id IS NOT NULL AND network_revision_id IS NOT NULL
      AND operational_version_id IS NOT NULL AND snapshot_id IS NOT NULL AND snapshot_revision IS NOT NULL)
  ),
  CHECK (published_by_subject IS NULL OR published_by_subject <> prepared_by_subject),
  CHECK (published_at IS NULL OR published_at >= prepared_at)
);

CREATE INDEX IF NOT EXISTS gis_formalization_releases_queue_idx
  ON gis_formalization_releases (scenic_area_id, lifecycle_state, prepared_at DESC);

CREATE TABLE IF NOT EXISTS gis_formalization_release_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL,
  release_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('PREPARE', 'PUBLISH')),
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('GIS_REVIEWER', 'RELEASE_ADMIN')),
  expected_workflow_revision integer NOT NULL CHECK (expected_workflow_revision IN (0, 1)),
  resulting_workflow_revision integer NOT NULL CHECK (resulting_workflow_revision = expected_workflow_revision + 1),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  evidence_reference text NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (release_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, release_id) REFERENCES gis_formalization_releases(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS gis_formalization_release_actions_idx
  ON gis_formalization_release_actions (scenic_area_id, release_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS published_recommended_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  route_code text NOT NULL CHECK (route_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text NOT NULL,
  geometry_wgs84 geometry(LineString, 4326) NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, publication_id, route_code),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (ST_SRID(geometry_wgs84) = 4326 AND NOT ST_IsEmpty(geometry_wgs84) AND ST_IsValid(geometry_wgs84))
);

CREATE INDEX IF NOT EXISTS published_recommended_routes_geometry_gix
  ON published_recommended_routes USING gist (geometry_wgs84);

CREATE OR REPLACE FUNCTION enforce_gis_formalization_release_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.scenic_area_id <> NEW.scenic_area_id
    OR OLD.submission_id <> NEW.submission_id
    OR OLD.submission_revision <> NEW.submission_revision
    OR OLD.submission_content_sha256 <> NEW.submission_content_sha256
    OR OLD.formalization_plan_json <> NEW.formalization_plan_json
    OR OLD.plan_sha256 <> NEW.plan_sha256
    OR OLD.network_revision <> NEW.network_revision
    OR OLD.node_count <> NEW.node_count
    OR OLD.edge_count <> NEW.edge_count
    OR OLD.poi_count <> NEW.poi_count
    OR OLD.valid_until <> NEW.valid_until
    OR OLD.operational_expires_at <> NEW.operational_expires_at
    OR OLD.prepared_by_subject <> NEW.prepared_by_subject
    OR OLD.prepared_at <> NEW.prepared_at
    OR OLD.prepare_idempotency_key_hash <> NEW.prepare_idempotency_key_hash
  THEN
    RAISE EXCEPTION 'immutable GIS formalization plan fields cannot change';
  END IF;
  IF OLD.lifecycle_state <> 'PREPARED' OR OLD.workflow_revision <> 1
    OR NEW.lifecycle_state <> 'PUBLISHED' OR NEW.workflow_revision <> 2
  THEN
    RAISE EXCEPTION 'invalid GIS formalization release transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_gis_formalization_action_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GIS formalization release actions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS gis_formalization_releases_transition_guard ON gis_formalization_releases;
CREATE TRIGGER gis_formalization_releases_transition_guard
BEFORE UPDATE ON gis_formalization_releases
FOR EACH ROW EXECUTE FUNCTION enforce_gis_formalization_release_transition();

DROP TRIGGER IF EXISTS gis_formalization_release_actions_immutable ON gis_formalization_release_actions;
CREATE TRIGGER gis_formalization_release_actions_immutable
BEFORE UPDATE OR DELETE ON gis_formalization_release_actions
FOR EACH ROW EXECUTE FUNCTION reject_gis_formalization_action_mutation();

COMMENT ON TABLE gis_formalization_releases IS
  'Immutable reviewed-GIS formalization plans. Only an independent RELEASE_ADMIN transaction may copy a revalidated plan into formal publication tables.';
COMMENT ON TABLE published_recommended_routes IS
  'Management-published display recommendations only. They never override graph routing, closures or accessibility filters.';
