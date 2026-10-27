DROP TABLE IF EXISTS formal_scenic_itinerary_snapshots;
DROP INDEX IF EXISTS route_operational_versions_network_id_idx;

ALTER TABLE route_nodes
  DROP CONSTRAINT IF EXISTS route_nodes_visit_metadata_complete_ck,
  DROP COLUMN IF EXISTS visit_evidence_reference,
  DROP COLUMN IF EXISTS visit_photo_spot,
  DROP COLUMN IF EXISTS visit_rest_area,
  DROP COLUMN IF EXISTS visit_family_friendly,
  DROP COLUMN IF EXISTS visit_editorial_priority,
  DROP COLUMN IF EXISTS visit_dwell_minutes,
  DROP COLUMN IF EXISTS visit_interest_tags;
