DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM route_operational_observations LIMIT 1)
     OR EXISTS (SELECT 1 FROM route_operational_snapshot_release_observations LIMIT 1)
     OR EXISTS (SELECT 1 FROM route_operational_snapshot_releases WHERE confirmed_observation_count > 0 LIMIT 1)
     OR EXISTS (SELECT 1 FROM admin_role_bindings WHERE role IN ('OPERATIONS_EDITOR', 'OPERATIONS_REVIEWER') LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing rollback 016: operational observations, release bindings or role bindings retain evidence';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS route_operational_release_observations_immutable ON route_operational_snapshot_release_observations;
DROP TABLE IF EXISTS route_operational_snapshot_release_observations;

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

ALTER TABLE route_operational_snapshot_releases
  DROP CONSTRAINT IF EXISTS route_operational_releases_affected_edge_count_ck,
  DROP CONSTRAINT IF EXISTS route_operational_releases_source_count_ck,
  DROP COLUMN IF EXISTS confirmed_observation_count;

ALTER TABLE route_operational_snapshot_releases
  ADD CONSTRAINT route_operational_snapshot_releases_confirmed_event_count_check CHECK (confirmed_event_count > 0),
  ADD CONSTRAINT route_operational_snapshot_releases_affected_edge_count_check CHECK (
    affected_edge_count > 0 AND affected_edge_count <= confirmed_event_count
  );

DROP TRIGGER IF EXISTS route_operational_observations_transition_guard ON route_operational_observations;
DROP TRIGGER IF EXISTS route_operational_observation_actions_immutable ON route_operational_observation_actions;
DROP FUNCTION IF EXISTS enforce_route_operational_observation_transition();
DROP FUNCTION IF EXISTS reject_route_operational_observation_append_only_mutation();
DROP TABLE IF EXISTS route_operational_observation_actions;
DROP TABLE IF EXISTS route_operational_observations;

ALTER TABLE admin_role_bindings
  DROP CONSTRAINT IF EXISTS admin_role_bindings_role_ck;

ALTER TABLE admin_role_bindings
  ADD CONSTRAINT admin_role_bindings_role_check CHECK (
    role IN (
      'CONTENT_EDITOR', 'CONTENT_REVIEWER', 'GIS_EDITOR', 'GIS_REVIEWER',
      'OPERATIONS_EMERGENCY', 'RELEASE_ADMIN', 'AUDITOR'
    )
  );

COMMENT ON TABLE route_operational_snapshot_releases IS
  'Immutable complete operational-state candidates compiled from confirmed closure events; publication atomically supersedes one formal snapshot without changing GIS geometry.';
