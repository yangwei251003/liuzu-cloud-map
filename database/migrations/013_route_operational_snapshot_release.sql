-- N8: compile independently confirmed route controls into a complete,
-- immutable operational-state candidate, then atomically replace the current
-- formal snapshot. Static GIS is never copied from client input or modified.

CREATE TABLE IF NOT EXISTS route_operational_snapshot_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  base_snapshot_id uuid NOT NULL REFERENCES scenic_published_snapshots(id) ON DELETE RESTRICT,
  network_revision_id uuid NOT NULL,
  operational_version_id uuid NOT NULL REFERENCES route_operational_versions(id) ON DELETE RESTRICT,
  replacement_snapshot_id uuid REFERENCES scenic_published_snapshots(id) ON DELETE RESTRICT,
  base_snapshot_revision integer NOT NULL CHECK (base_snapshot_revision > 0),
  target_snapshot_revision integer NOT NULL CHECK (target_snapshot_revision > base_snapshot_revision),
  base_operational_version integer NOT NULL CHECK (base_operational_version > 0),
  target_operational_version integer NOT NULL CHECK (target_operational_version > base_operational_version),
  workflow_revision integer NOT NULL CHECK (workflow_revision IN (1, 2)),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('PREPARED', 'PUBLISHED')),
  source_reference text NOT NULL CHECK (source_reference ~ '^https://[^[:space:]]+$'),
  reason_summary text NOT NULL CHECK (char_length(reason_summary) BETWEEN 10 AND 1000),
  snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_event_count integer NOT NULL CHECK (confirmed_event_count > 0),
  affected_edge_count integer NOT NULL CHECK (affected_edge_count > 0 AND affected_edge_count <= confirmed_event_count),
  prepared_by_subject text NOT NULL,
  prepared_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  published_by_subject text,
  published_at timestamptz,
  release_evidence_reference text,
  UNIQUE (scenic_area_id, target_snapshot_revision),
  UNIQUE (operational_version_id),
  UNIQUE (replacement_snapshot_id),
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (prepared_by_subject <> ''),
  CHECK (expires_at > prepared_at),
  CHECK (
    (
      workflow_revision = 1 AND lifecycle_state = 'PREPARED'
      AND replacement_snapshot_id IS NULL AND published_by_subject IS NULL
      AND published_at IS NULL AND release_evidence_reference IS NULL
    )
    OR
    (
      workflow_revision = 2 AND lifecycle_state = 'PUBLISHED'
      AND replacement_snapshot_id IS NOT NULL AND published_by_subject IS NOT NULL
      AND published_at IS NOT NULL AND release_evidence_reference IS NOT NULL
      AND release_evidence_reference ~ '^https://[^[:space:]]+$'
      AND published_by_subject <> prepared_by_subject
      AND published_at >= prepared_at
    )
  )
);

CREATE INDEX IF NOT EXISTS route_operational_snapshot_releases_queue_idx
  ON route_operational_snapshot_releases (scenic_area_id, workflow_revision, prepared_at DESC)
  WHERE workflow_revision = 1;

CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_events (
  release_id uuid NOT NULL REFERENCES route_operational_snapshot_releases(id) ON DELETE RESTRICT,
  closure_event_id uuid NOT NULL REFERENCES closure_events(id) ON DELETE RESTRICT,
  network_revision_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  compiled_status text NOT NULL CHECK (compiled_status IN ('CLOSED', 'RESTRICTED')),
  event_sha256 char(64) NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (release_id, closure_event_id),
  FOREIGN KEY (network_revision_id, edge_id) REFERENCES route_edges(network_revision_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  release_id uuid NOT NULL REFERENCES route_operational_snapshot_releases(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('PREPARE', 'PUBLISH')),
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('OPERATIONS_EMERGENCY', 'RELEASE_ADMIN')),
  expected_workflow_revision integer NOT NULL CHECK (expected_workflow_revision IN (0, 1)),
  resulting_workflow_revision integer NOT NULL CHECK (resulting_workflow_revision IN (1, 2)),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  evidence_reference text NOT NULL CHECK (evidence_reference ~ '^https://[^[:space:]]+$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  UNIQUE (scenic_area_id, idempotency_key_hash),
  UNIQUE (release_id, resulting_workflow_revision),
  CHECK (actor_oidc_subject <> ''),
  CHECK (
    (action = 'PREPARE' AND actor_role = 'OPERATIONS_EMERGENCY' AND expected_workflow_revision = 0 AND resulting_workflow_revision = 1)
    OR
    (action = 'PUBLISH' AND actor_role = 'RELEASE_ADMIN' AND expected_workflow_revision = 1 AND resulting_workflow_revision = 2)
  )
);

CREATE INDEX IF NOT EXISTS route_operational_snapshot_release_actions_release_idx
  ON route_operational_snapshot_release_actions (scenic_area_id, release_id, occurred_at);

CREATE OR REPLACE FUNCTION reject_route_operational_release_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'route operational release evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS route_operational_snapshot_release_events_immutable ON route_operational_snapshot_release_events;
CREATE TRIGGER route_operational_snapshot_release_events_immutable
BEFORE UPDATE OR DELETE ON route_operational_snapshot_release_events
FOR EACH ROW EXECUTE FUNCTION reject_route_operational_release_append_only_mutation();

DROP TRIGGER IF EXISTS route_operational_snapshot_release_actions_immutable ON route_operational_snapshot_release_actions;
CREATE TRIGGER route_operational_snapshot_release_actions_immutable
BEFORE UPDATE OR DELETE ON route_operational_snapshot_release_actions
FOR EACH ROW EXECUTE FUNCTION reject_route_operational_release_append_only_mutation();

CREATE OR REPLACE FUNCTION enforce_route_operational_release_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.scenic_area_id IS DISTINCT FROM OLD.scenic_area_id
     OR NEW.base_snapshot_id IS DISTINCT FROM OLD.base_snapshot_id
     OR NEW.network_revision_id IS DISTINCT FROM OLD.network_revision_id
     OR NEW.operational_version_id IS DISTINCT FROM OLD.operational_version_id
     OR NEW.base_snapshot_revision IS DISTINCT FROM OLD.base_snapshot_revision
     OR NEW.target_snapshot_revision IS DISTINCT FROM OLD.target_snapshot_revision
     OR NEW.base_operational_version IS DISTINCT FROM OLD.base_operational_version
     OR NEW.target_operational_version IS DISTINCT FROM OLD.target_operational_version
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.reason_summary IS DISTINCT FROM OLD.reason_summary
     OR NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json
     OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256
     OR NEW.confirmed_event_count IS DISTINCT FROM OLD.confirmed_event_count
     OR NEW.affected_edge_count IS DISTINCT FROM OLD.affected_edge_count
     OR NEW.prepared_by_subject IS DISTINCT FROM OLD.prepared_by_subject
     OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'route operational release candidate is immutable';
  END IF;
  IF NOT (
    OLD.workflow_revision = 1 AND OLD.lifecycle_state = 'PREPARED'
    AND NEW.workflow_revision = 2 AND NEW.lifecycle_state = 'PUBLISHED'
    AND OLD.replacement_snapshot_id IS NULL AND NEW.replacement_snapshot_id IS NOT NULL
    AND OLD.published_by_subject IS NULL AND NEW.published_by_subject IS NOT NULL
    AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
    AND OLD.release_evidence_reference IS NULL AND NEW.release_evidence_reference IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'invalid route operational release transition';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_operational_snapshot_releases_transition_guard ON route_operational_snapshot_releases;
CREATE TRIGGER route_operational_snapshot_releases_transition_guard
BEFORE UPDATE ON route_operational_snapshot_releases
FOR EACH ROW EXECUTE FUNCTION enforce_route_operational_release_transition();

COMMENT ON TABLE route_operational_snapshot_releases IS
  'Immutable complete operational-state candidates compiled from confirmed closure events; publication atomically supersedes one formal snapshot without changing GIS geometry.';
COMMENT ON TABLE route_operational_snapshot_release_events IS
  'Exact append-only closure-event set compiled into one operational snapshot candidate, including scheduled confirmed controls conservatively blocked from publication time.';
