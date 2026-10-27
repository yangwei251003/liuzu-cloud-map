-- N12: source-backed, independently reviewed crowd/weather observations that
-- can be compiled into the next complete operational snapshot. This migration
-- never invents observations or modifies an already published snapshot.

ALTER TABLE admin_role_bindings
  DROP CONSTRAINT IF EXISTS admin_role_bindings_role_check,
  DROP CONSTRAINT IF EXISTS admin_role_bindings_role_ck;

ALTER TABLE admin_role_bindings
  ADD CONSTRAINT admin_role_bindings_role_ck CHECK (
    role IN (
      'CONTENT_EDITOR', 'CONTENT_REVIEWER', 'GIS_EDITOR', 'GIS_REVIEWER',
      'OPERATIONS_EDITOR', 'OPERATIONS_REVIEWER', 'OPERATIONS_EMERGENCY',
      'RELEASE_ADMIN', 'AUDITOR'
    )
  );

CREATE TABLE IF NOT EXISTS route_operational_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  network_revision_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  crowd_level text NOT NULL CHECK (crowd_level IN ('LOW', 'MODERATE', 'HIGH')),
  weather_impact text NOT NULL CHECK (weather_impact IN ('NONE', 'RAIN', 'HEAT', 'WIND', 'MULTIPLE')),
  travel_time_multiplier numeric(4,2) NOT NULL CHECK (travel_time_multiplier BETWEEN 1.00 AND 3.00),
  operator_note text NOT NULL CHECK (char_length(operator_note) BETWEEN 10 AND 1000),
  source_reference text NOT NULL CHECK (source_reference ~ '^https://[^[:space:]]+$'),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expected_snapshot_revision integer NOT NULL CHECK (expected_snapshot_revision > 0),
  workflow_revision integer NOT NULL CHECK (workflow_revision IN (1, 2)),
  review_decision text CHECK (review_decision IS NULL OR review_decision IN ('CONFIRMED', 'REJECTED')),
  submitted_by_subject text NOT NULL,
  submitted_at timestamptz NOT NULL,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  review_evidence_reference text,
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, network_revision_id)
    REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (network_revision_id, edge_id)
    REFERENCES route_edges(network_revision_id, id) ON DELETE RESTRICT,
  CHECK (submitted_by_subject <> ''),
  CHECK (expires_at > observed_at AND expires_at > submitted_at),
  CHECK (
    (travel_time_multiplier = 1.00 AND crowd_level = 'LOW' AND weather_impact = 'NONE')
    OR travel_time_multiplier > 1.00
  ),
  CHECK (
    (
      workflow_revision = 1 AND review_decision IS NULL
      AND reviewed_by_subject IS NULL AND reviewed_at IS NULL AND review_evidence_reference IS NULL
    )
    OR
    (
      workflow_revision = 2 AND review_decision IS NOT NULL
      AND reviewed_by_subject IS NOT NULL AND reviewed_by_subject <> submitted_by_subject
      AND reviewed_at IS NOT NULL AND reviewed_at >= submitted_at
      AND review_evidence_reference IS NOT NULL
      AND review_evidence_reference ~ '^https://[^[:space:]]+$'
    )
  )
);

CREATE INDEX IF NOT EXISTS route_operational_observations_review_queue_idx
  ON route_operational_observations (scenic_area_id, network_revision_id, workflow_revision, submitted_at DESC)
  WHERE workflow_revision = 1;

CREATE INDEX IF NOT EXISTS route_operational_observations_active_idx
  ON route_operational_observations (scenic_area_id, network_revision_id, edge_id, observed_at DESC)
  WHERE workflow_revision = 2 AND review_decision = 'CONFIRMED';

CREATE TABLE IF NOT EXISTS route_operational_observation_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  observation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('SUBMIT', 'CONFIRM', 'REJECT')),
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('OPERATIONS_EDITOR', 'OPERATIONS_REVIEWER')),
  expected_workflow_revision integer NOT NULL CHECK (expected_workflow_revision IN (0, 1)),
  resulting_workflow_revision integer NOT NULL CHECK (resulting_workflow_revision IN (1, 2)),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  evidence_reference text NOT NULL CHECK (evidence_reference ~ '^https://[^[:space:]]+$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  UNIQUE (scenic_area_id, idempotency_key_hash),
  UNIQUE (observation_id, resulting_workflow_revision),
  FOREIGN KEY (scenic_area_id, observation_id)
    REFERENCES route_operational_observations(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (actor_oidc_subject <> ''),
  CHECK (
    (action = 'SUBMIT' AND actor_role = 'OPERATIONS_EDITOR' AND expected_workflow_revision = 0 AND resulting_workflow_revision = 1)
    OR
    (action IN ('CONFIRM', 'REJECT') AND actor_role = 'OPERATIONS_REVIEWER' AND expected_workflow_revision = 1 AND resulting_workflow_revision = 2)
  )
);

CREATE INDEX IF NOT EXISTS route_operational_observation_actions_observation_idx
  ON route_operational_observation_actions (scenic_area_id, observation_id, occurred_at);

CREATE OR REPLACE FUNCTION reject_route_operational_observation_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'route operational observation evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS route_operational_observation_actions_immutable ON route_operational_observation_actions;
CREATE TRIGGER route_operational_observation_actions_immutable
BEFORE UPDATE OR DELETE ON route_operational_observation_actions
FOR EACH ROW EXECUTE FUNCTION reject_route_operational_observation_append_only_mutation();

CREATE OR REPLACE FUNCTION enforce_route_operational_observation_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.scenic_area_id IS DISTINCT FROM OLD.scenic_area_id
     OR NEW.network_revision_id IS DISTINCT FROM OLD.network_revision_id
     OR NEW.edge_id IS DISTINCT FROM OLD.edge_id
     OR NEW.crowd_level IS DISTINCT FROM OLD.crowd_level
     OR NEW.weather_impact IS DISTINCT FROM OLD.weather_impact
     OR NEW.travel_time_multiplier IS DISTINCT FROM OLD.travel_time_multiplier
     OR NEW.operator_note IS DISTINCT FROM OLD.operator_note
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.expected_snapshot_revision IS DISTINCT FROM OLD.expected_snapshot_revision
     OR NEW.submitted_by_subject IS DISTINCT FROM OLD.submitted_by_subject
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'route operational observation is immutable';
  END IF;
  IF NOT (
    OLD.workflow_revision = 1 AND NEW.workflow_revision = 2
    AND OLD.review_decision IS NULL AND NEW.review_decision IN ('CONFIRMED', 'REJECTED')
    AND OLD.reviewed_by_subject IS NULL AND NEW.reviewed_by_subject IS NOT NULL
    AND OLD.reviewed_at IS NULL AND NEW.reviewed_at IS NOT NULL
    AND OLD.review_evidence_reference IS NULL AND NEW.review_evidence_reference IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'invalid route operational observation transition';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_operational_observations_transition_guard ON route_operational_observations;
CREATE TRIGGER route_operational_observations_transition_guard
BEFORE UPDATE ON route_operational_observations
FOR EACH ROW EXECUTE FUNCTION enforce_route_operational_observation_transition();

ALTER TABLE route_operational_snapshot_releases
  DROP CONSTRAINT IF EXISTS route_operational_snapshot_releases_confirmed_event_count_check,
  DROP CONSTRAINT IF EXISTS route_operational_snapshot_releases_affected_edge_count_check;

ALTER TABLE route_operational_snapshot_releases
  ADD COLUMN IF NOT EXISTS confirmed_observation_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT route_operational_releases_source_count_ck CHECK (
    confirmed_event_count >= 0 AND confirmed_observation_count >= 0
    AND confirmed_event_count + confirmed_observation_count > 0
  ),
  ADD CONSTRAINT route_operational_releases_affected_edge_count_ck CHECK (
    affected_edge_count > 0
    AND affected_edge_count <= confirmed_event_count + confirmed_observation_count
  );

CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_observations (
  release_id uuid NOT NULL REFERENCES route_operational_snapshot_releases(id) ON DELETE RESTRICT,
  observation_id uuid NOT NULL REFERENCES route_operational_observations(id) ON DELETE RESTRICT,
  network_revision_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  observation_sha256 char(64) NOT NULL CHECK (observation_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (release_id, observation_id),
  FOREIGN KEY (network_revision_id, edge_id)
    REFERENCES route_edges(network_revision_id, id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS route_operational_release_observations_immutable ON route_operational_snapshot_release_observations;
CREATE TRIGGER route_operational_release_observations_immutable
BEFORE UPDATE OR DELETE ON route_operational_snapshot_release_observations
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
     OR NEW.confirmed_observation_count IS DISTINCT FROM OLD.confirmed_observation_count
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

COMMENT ON TABLE route_operational_observations IS
  'Short-lived source-backed crowd/weather travel-time observations. Submission and independent review do not publish a route; a later complete snapshot release must bind the exact confirmed observation hash.';
COMMENT ON TABLE route_operational_snapshot_release_observations IS
  'Exact confirmed operational observations compiled into one immutable complete snapshot candidate.';
COMMENT ON TABLE route_operational_snapshot_releases IS
  'Immutable complete operational-state candidates compiled from confirmed closure events and independently reviewed crowd/weather observations; publication atomically supersedes one formal snapshot without changing GIS geometry.';
