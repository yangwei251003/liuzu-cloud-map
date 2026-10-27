-- Guarded compensation for N9. Once formal GIS has been published, removing
-- the provenance workflow would orphan production audit evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM gis_formalization_releases
    WHERE lifecycle_state = 'PUBLISHED' OR snapshot_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cannot compensate migration 014 after formal GIS was published';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS gis_formalization_releases_transition_guard ON gis_formalization_releases;
DROP TRIGGER IF EXISTS gis_formalization_release_actions_immutable ON gis_formalization_release_actions;
DROP TABLE IF EXISTS gis_formalization_release_actions;
DROP TABLE IF EXISTS gis_formalization_releases;
DROP TABLE IF EXISTS published_recommended_routes;
DROP FUNCTION IF EXISTS enforce_gis_formalization_release_transition();
DROP FUNCTION IF EXISTS reject_gis_formalization_action_mutation();
