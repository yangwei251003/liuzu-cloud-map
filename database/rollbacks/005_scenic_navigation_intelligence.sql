DROP TABLE IF EXISTS navigation_session_events;
DROP TABLE IF EXISTS navigation_sessions;

ALTER TABLE route_plan_snapshots
  DROP COLUMN IF EXISTS dynamic_factors_applied,
  DROP COLUMN IF EXISTS traveler_preference_json,
  DROP COLUMN IF EXISTS optimization_strategy;

ALTER TABLE route_edge_operational_states
  DROP CONSTRAINT IF EXISTS route_edge_operational_routing_complete_ck,
  DROP COLUMN IF EXISTS weather_impact,
  DROP COLUMN IF EXISTS crowd_level,
  DROP COLUMN IF EXISTS travel_time_multiplier;

ALTER TABLE route_edges
  DROP CONSTRAINT IF EXISTS route_edges_routing_attributes_complete_ck,
  DROP COLUMN IF EXISTS routing_evidence_reference,
  DROP COLUMN IF EXISTS scenic_score,
  DROP COLUMN IF EXISTS difficulty_level,
  DROP COLUMN IF EXISTS traversal_mode;

ALTER TABLE route_nodes
  DROP COLUMN IF EXISTS published_poi_id,
  DROP COLUMN IF EXISTS display_name;
