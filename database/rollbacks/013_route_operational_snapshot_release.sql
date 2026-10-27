-- Guarded compensation for N8. A published replacement may already be used by
-- navigation and offline invalidation, so automatic rollback is refused.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM route_operational_snapshot_releases
    WHERE lifecycle_state = 'PUBLISHED' OR replacement_snapshot_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot compensate migration 013 after an operational replacement snapshot was published';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS route_operational_snapshot_releases_transition_guard ON route_operational_snapshot_releases;
DROP TRIGGER IF EXISTS route_operational_snapshot_release_actions_immutable ON route_operational_snapshot_release_actions;
DROP TRIGGER IF EXISTS route_operational_snapshot_release_events_immutable ON route_operational_snapshot_release_events;

CREATE TEMP TABLE rollback_013_operational_version_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO rollback_013_operational_version_ids (id)
SELECT operational_version_id FROM route_operational_snapshot_releases;

DROP TABLE IF EXISTS route_operational_snapshot_release_actions;
DROP TABLE IF EXISTS route_operational_snapshot_release_events;
DROP TABLE IF EXISTS route_operational_snapshot_releases;

DELETE FROM route_operational_versions
WHERE id IN (SELECT id FROM rollback_013_operational_version_ids)
  AND lifecycle_state = 'DRAFT';

DROP FUNCTION IF EXISTS enforce_route_operational_release_transition();
DROP FUNCTION IF EXISTS reject_route_operational_release_append_only_mutation();
