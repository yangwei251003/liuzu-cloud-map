-- Reviewed visit metadata is optional on legacy route nodes. The complete
-- block must be present before a node may participate in a formal scenic
-- itinerary. This migration assigns no inferred labels, dwell times or facts.

ALTER TABLE route_nodes
  ADD COLUMN IF NOT EXISTS visit_interest_tags text[],
  ADD COLUMN IF NOT EXISTS visit_dwell_minutes integer,
  ADD COLUMN IF NOT EXISTS visit_editorial_priority smallint,
  ADD COLUMN IF NOT EXISTS visit_family_friendly boolean,
  ADD COLUMN IF NOT EXISTS visit_rest_area boolean,
  ADD COLUMN IF NOT EXISTS visit_photo_spot boolean,
  ADD COLUMN IF NOT EXISTS visit_evidence_reference text;

ALTER TABLE route_nodes
  ADD CONSTRAINT route_nodes_visit_metadata_complete_ck CHECK (
    (
      visit_interest_tags IS NULL
      AND visit_dwell_minutes IS NULL
      AND visit_editorial_priority IS NULL
      AND visit_family_friendly IS NULL
      AND visit_rest_area IS NULL
      AND visit_photo_spot IS NULL
      AND visit_evidence_reference IS NULL
    )
    OR
    (
      visit_interest_tags IS NOT NULL
      AND cardinality(visit_interest_tags) BETWEEN 1 AND 6
      AND visit_interest_tags <@ ARRAY['HISTORY', 'CULTURE', 'NATURE', 'PHOTOGRAPHY', 'FAMILY', 'REST']::text[]
      AND visit_dwell_minutes BETWEEN 5 AND 180
      AND visit_editorial_priority BETWEEN 0 AND 100
      AND visit_family_friendly IS NOT NULL
      AND visit_rest_area IS NOT NULL
      AND visit_photo_spot IS NOT NULL
      AND length(trim(visit_evidence_reference)) BETWEEN 1 AND 1000
    )
  );

-- These immutable snapshots contain only confirmed structured constraints and
-- the resulting formal route. Raw natural-language prompts, visitor age and
-- precise coordinates are deliberately absent.
CREATE UNIQUE INDEX IF NOT EXISTS route_operational_versions_network_id_idx
  ON route_operational_versions (scenic_area_id, network_revision_id, id);

CREATE TABLE IF NOT EXISTS formal_scenic_itinerary_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  itinerary_fingerprint text NOT NULL CHECK (itinerary_fingerprint ~ '^sip1-[0-9a-f]{8}$'),
  network_revision_id uuid NOT NULL,
  operational_version_id uuid NOT NULL,
  origin_node_code text NOT NULL CHECK (origin_node_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  exit_node_code text NOT NULL CHECK (exit_node_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  budget_minutes integer NOT NULL CHECK (budget_minutes BETWEEN 60 AND 480),
  interest_tags text[] NOT NULL CHECK (
    cardinality(interest_tags) BETWEEN 1 AND 6
    AND interest_tags <@ ARRAY['HISTORY', 'CULTURE', 'NATURE', 'PHOTOGRAPHY', 'FAMILY', 'REST']::text[]
  ),
  companion_kind text NOT NULL CHECK (companion_kind IN ('SOLO', 'FRIENDS', 'FAMILY', 'SENIOR')),
  profile_json jsonb NOT NULL CHECK (jsonb_typeof(profile_json) = 'object'),
  preference_json jsonb NOT NULL CHECK (jsonb_typeof(preference_json) = 'object'),
  structured_constraints_sha256 char(64) NOT NULL CHECK (structured_constraints_sha256 ~ '^[0-9a-f]{64}$'),
  itinerary_json jsonb NOT NULL CHECK (jsonb_typeof(itinerary_json) = 'object'),
  total_distance_meters numeric(10,2) NOT NULL CHECK (total_distance_meters >= 0),
  total_walking_minutes numeric(8,2) NOT NULL CHECK (total_walking_minutes >= 0),
  total_dwell_minutes integer NOT NULL CHECK (total_dwell_minutes >= 0),
  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, itinerary_fingerprint),
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, network_revision_id, operational_version_id) REFERENCES route_operational_versions(scenic_area_id, network_revision_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > generated_at),
  CHECK (expires_at <= generated_at + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS formal_scenic_itinerary_expiry_idx
  ON formal_scenic_itinerary_snapshots (scenic_area_id, expires_at);

COMMENT ON TABLE formal_scenic_itinerary_snapshots IS
  'Short-lived deterministic scenic itineraries. Never store raw prompts, visitor age, latitude, longitude, GPS samples or tracks.';
