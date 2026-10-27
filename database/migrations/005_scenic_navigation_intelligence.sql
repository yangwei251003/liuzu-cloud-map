-- Navigation intelligence is nullable on legacy rows. A route strategy that
-- depends on these fields must reject an incomplete published revision; this
-- migration never assigns invented defaults to existing GIS or operations.

ALTER TABLE route_nodes
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS published_poi_id uuid;

ALTER TABLE route_edges
  ADD COLUMN IF NOT EXISTS traversal_mode text CHECK (traversal_mode IN ('WALKWAY', 'BOARDWALK', 'MOUNTAIN_TRAIL', 'STAIRS', 'CABLEWAY', 'SHUTTLE')),
  ADD COLUMN IF NOT EXISTS difficulty_level text CHECK (difficulty_level IN ('EASY', 'MODERATE', 'HARD')),
  ADD COLUMN IF NOT EXISTS scenic_score smallint CHECK (scenic_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS routing_evidence_reference text;

ALTER TABLE route_edges
  ADD CONSTRAINT route_edges_routing_attributes_complete_ck CHECK (
    (traversal_mode IS NULL AND difficulty_level IS NULL AND scenic_score IS NULL AND routing_evidence_reference IS NULL)
    OR
    (traversal_mode IS NOT NULL AND difficulty_level IS NOT NULL AND scenic_score IS NOT NULL AND routing_evidence_reference IS NOT NULL)
  );

ALTER TABLE route_edge_operational_states
  ADD COLUMN IF NOT EXISTS travel_time_multiplier numeric(4,2) CHECK (travel_time_multiplier BETWEEN 0.50 AND 5.00),
  ADD COLUMN IF NOT EXISTS crowd_level text CHECK (crowd_level IN ('LOW', 'MODERATE', 'HIGH', 'UNKNOWN')),
  ADD COLUMN IF NOT EXISTS weather_impact text CHECK (weather_impact IN ('NONE', 'RAIN', 'HEAT', 'WIND', 'MULTIPLE', 'UNKNOWN'));

ALTER TABLE route_edge_operational_states
  ADD CONSTRAINT route_edge_operational_routing_complete_ck CHECK (
    (travel_time_multiplier IS NULL AND crowd_level IS NULL AND weather_impact IS NULL)
    OR
    (travel_time_multiplier IS NOT NULL AND crowd_level IS NOT NULL AND weather_impact IS NOT NULL)
  );

ALTER TABLE route_plan_snapshots
  ADD COLUMN IF NOT EXISTS optimization_strategy text CHECK (optimization_strategy IN ('FASTEST', 'SHORTEST', 'SCENIC')),
  ADD COLUMN IF NOT EXISTS traveler_preference_json jsonb CHECK (traveler_preference_json IS NULL OR jsonb_typeof(traveler_preference_json) = 'object'),
  ADD COLUMN IF NOT EXISTS dynamic_factors_applied boolean;

-- Server-backed navigation history stores route/session state, never a stream
-- of precise user coordinates. Live positioning stays ephemeral in the client.
CREATE TABLE IF NOT EXISTS navigation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  network_revision_id uuid NOT NULL,
  operational_version_id uuid NOT NULL REFERENCES route_operational_versions(id) ON DELETE RESTRICT,
  route_fingerprint text NOT NULL CHECK (route_fingerprint ~ '^drp1-[0-9a-f]{8}$'),
  optimization_strategy text NOT NULL CHECK (optimization_strategy IN ('FASTEST', 'SHORTEST', 'SCENIC')),
  origin_node_code text NOT NULL CHECK (origin_node_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  destination_node_code text NOT NULL CHECK (destination_node_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  session_status text NOT NULL CHECK (session_status IN ('READY', 'ACTIVE', 'PAUSED', 'REROUTE_REQUIRED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  last_remaining_distance_meters numeric(10,2) CHECK (last_remaining_distance_meters IS NULL OR last_remaining_distance_meters >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (origin_node_code <> destination_node_code),
  CHECK (expires_at > created_at),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS navigation_sessions_account_history_idx
  ON navigation_sessions (scenic_area_id, account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS navigation_session_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL,
  navigation_session_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('STARTED', 'PAUSED', 'RESUMED', 'REROUTE_REQUIRED', 'REROUTED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  network_revision text NOT NULL,
  operational_version integer NOT NULL CHECK (operational_version > 0),
  remaining_distance_bucket_meters integer CHECK (remaining_distance_bucket_meters IS NULL OR remaining_distance_bucket_meters >= 0),
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, navigation_session_id) REFERENCES navigation_sessions(scenic_area_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS navigation_session_events_timeline_idx
  ON navigation_session_events (navigation_session_id, occurred_at, id);

COMMENT ON TABLE navigation_session_events IS
  'Navigation audit timeline. Never store latitude, longitude, raw GPS samples, headings, or continuous precise trajectories.';
