-- P0 control plane. This migration deliberately creates no published GIS or content data.
-- A row is publishable only after the application verifies source, rights, review,
-- validity and field verification together in one transaction.

CREATE TABLE IF NOT EXISTS data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  source_reference text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('OFFICIAL', 'FIELD_SURVEY', 'LICENSED_VENDOR', 'RESEARCH', 'DEMO_FIXTURE')),
  license_state text NOT NULL CHECK (license_state IN ('CLEARED', 'PENDING', 'RESTRICTED', 'UNKNOWN')),
  collected_at timestamptz NOT NULL,
  verified_at timestamptz,
  verified_by_subject text,
  valid_until timestamptz NOT NULL,
  notes_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, source_reference),
  CHECK (valid_until > collected_at),
  CHECK ((verified_at IS NULL) = (verified_by_subject IS NULL))
);

CREATE TABLE IF NOT EXISTS scenic_area_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN')),
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_by_subject text NOT NULL,
  reviewed_by_subject text,
  published_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  valid_until timestamptz NOT NULL,
  reason_reference text,
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, revision),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  CHECK ((reviewed_at IS NULL) = (reviewed_by_subject IS NULL)),
  CHECK ((published_at IS NULL) = (published_by_subject IS NULL)),
  CHECK (withdrawn_at IS NULL OR published_at IS NOT NULL),
  CHECK (valid_until > created_at)
);

CREATE TABLE IF NOT EXISTS published_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  geometry_wgs84 geometry(MultiPolygon, 4326) NOT NULL,
  original_coordinate_system text NOT NULL,
  transform_method text NOT NULL,
  transform_version text NOT NULL,
  geometry_sha256 char(64) NOT NULL CHECK (geometry_sha256 ~ '^[0-9a-f]{64}$'),
  field_verified_by_subject text,
  field_verified_at timestamptz,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, publication_id),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK ((field_verified_at IS NULL) = (field_verified_by_subject IS NULL))
);

CREATE INDEX IF NOT EXISTS published_boundaries_geometry_gix ON published_boundaries USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS published_entrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  entrance_code text NOT NULL,
  label text NOT NULL,
  entrance_kind text NOT NULL CHECK (entrance_kind IN ('ENTRY', 'EXIT', 'ENTRY_EXIT', 'SERVICE', 'MEDICAL')),
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  original_coordinate_system text NOT NULL,
  transform_method text NOT NULL,
  transform_version text NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  field_verified_by_subject text,
  field_verified_at timestamptz,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, publication_id, entrance_code),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (entrance_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  CHECK ((field_verified_at IS NULL) = (field_verified_by_subject IS NULL))
);

CREATE INDEX IF NOT EXISTS published_entrances_geometry_gix ON published_entrances USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS published_opening_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  rule_code text NOT NULL,
  rule_json jsonb NOT NULL CHECK (jsonb_typeof(rule_json) = 'object'),
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, publication_id, rule_code),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (valid_until > valid_from)
);

CREATE TABLE IF NOT EXISTS published_pois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  canonical_code text NOT NULL,
  label text NOT NULL,
  poi_kind text NOT NULL,
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  original_coordinate_system text NOT NULL,
  transform_method text NOT NULL,
  transform_version text NOT NULL,
  opening_rule_id uuid,
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, publication_id, canonical_code),
  UNIQUE (scenic_area_id, publication_id, id),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (opening_rule_id) REFERENCES published_opening_rules(id) ON DELETE RESTRICT,
  CHECK (canonical_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$')
);

CREATE INDEX IF NOT EXISTS published_pois_geometry_gix ON published_pois USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS published_poi_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  poi_id uuid NOT NULL,
  alias text NOT NULL,
  source_id uuid NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_until timestamptz NOT NULL,
  UNIQUE (scenic_area_id, publication_id, alias),
  FOREIGN KEY (scenic_area_id, publication_id, poi_id) REFERENCES published_pois(scenic_area_id, publication_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS published_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  facility_kind text NOT NULL CHECK (facility_kind IN ('SERVICE_CENTER', 'MEDICAL', 'RESTROOM', 'EMERGENCY_ASSEMBLY', 'EXIT', 'OTHER')),
  label text NOT NULL,
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_until timestamptz NOT NULL,
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS published_risk_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  label text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED')),
  geometry_wgs84 geometry(Geometry, 4326) NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS published_risk_zones_geometry_gix ON published_risk_zones USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS route_network_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  source_id uuid NOT NULL,
  revision text NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN')),
  coordinate_system text NOT NULL CHECK (coordinate_system = 'WGS84'),
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'FIELD_VERIFIED', 'EXPIRED', 'REJECTED')),
  geometry_sha256 char(64) NOT NULL CHECK (geometry_sha256 ~ '^[0-9a-f]{64}$'),
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, revision),
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS route_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_revision_id uuid NOT NULL REFERENCES route_network_revisions(id) ON DELETE CASCADE,
  node_code text NOT NULL,
  node_kind text NOT NULL CHECK (node_kind IN ('ROUTE', 'ENTRANCE', 'EXIT', 'TRANSFER', 'FACILITY')),
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_revision_id, node_code),
  UNIQUE (network_revision_id, id),
  CHECK (node_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$')
);

CREATE INDEX IF NOT EXISTS route_nodes_geometry_gix ON route_nodes USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS route_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_revision_id uuid NOT NULL,
  edge_code text NOT NULL,
  from_node_id uuid NOT NULL,
  to_node_id uuid NOT NULL,
  travel_direction text NOT NULL CHECK (travel_direction IN ('FORWARD', 'REVERSE', 'BIDIRECTIONAL')),
  geometry_wgs84 geometry(LineString, 4326) NOT NULL,
  distance_meters numeric(10,2) NOT NULL CHECK (distance_meters > 0),
  estimated_seconds integer NOT NULL CHECK (estimated_seconds > 0),
  has_steps boolean NOT NULL DEFAULT false,
  max_slope_percent numeric(5,2),
  minimum_width_meters numeric(5,2),
  accessibility_state text NOT NULL CHECK (accessibility_state IN ('VERIFIED_ACCESSIBLE', 'NOT_ACCESSIBLE', 'PARTIAL', 'UNKNOWN')),
  safety_state text NOT NULL CHECK (safety_state IN ('OPEN', 'CLOSED', 'RESTRICTED', 'UNKNOWN')),
  source_reference text NOT NULL,
  management_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_revision_id, edge_code),
  UNIQUE (network_revision_id, id),
  FOREIGN KEY (network_revision_id, from_node_id) REFERENCES route_nodes(network_revision_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (network_revision_id, to_node_id) REFERENCES route_nodes(network_revision_id, id) ON DELETE RESTRICT,
  CHECK (edge_code ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  CHECK (from_node_id <> to_node_id),
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK (minimum_width_meters IS NULL OR minimum_width_meters > 0),
  CHECK (max_slope_percent IS NULL OR max_slope_percent >= 0)
);

CREATE INDEX IF NOT EXISTS route_edges_geometry_gix ON route_edges USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS route_operational_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  network_revision_id uuid NOT NULL,
  operational_version integer NOT NULL CHECK (operational_version > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'EXPIRED')),
  source_reference text NOT NULL,
  responsible_party text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  published_by_subject text,
  UNIQUE (scenic_area_id, network_revision_id, operational_version),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS route_edge_operational_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_version_id uuid NOT NULL REFERENCES route_operational_versions(id) ON DELETE CASCADE,
  network_revision_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'RESTRICTED', 'UNKNOWN')),
  checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source_reference text NOT NULL,
  responsible_party text NOT NULL,
  UNIQUE (operational_version_id, edge_id),
  FOREIGN KEY (network_revision_id, edge_id) REFERENCES route_edges(network_revision_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > checked_at)
);

CREATE TABLE IF NOT EXISTS closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  network_revision_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('CLOSED', 'RESTRICTED')),
  source_reference text NOT NULL,
  reason_reference text NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  preauthorized_by_subject text NOT NULL,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (network_revision_id, edge_id) REFERENCES route_edges(network_revision_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > starts_at),
  CHECK ((reviewed_at IS NULL) = (reviewed_by_subject IS NULL))
);

CREATE INDEX IF NOT EXISTS closure_events_active_idx ON closure_events (scenic_area_id, network_revision_id, starts_at, expires_at) WHERE withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS scenic_published_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  publication_id uuid NOT NULL,
  network_revision_id uuid NOT NULL,
  operational_version_id uuid NOT NULL,
  snapshot_revision integer NOT NULL CHECK (snapshot_revision > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  snapshot_json jsonb NOT NULL CHECK (jsonb_typeof(snapshot_json) = 'object'),
  snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  published_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  withdrawn_at timestamptz,
  UNIQUE (scenic_area_id, snapshot_revision),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, publication_id) REFERENCES scenic_area_publications(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (operational_version_id) REFERENCES route_operational_versions(id) ON DELETE RESTRICT,
  CHECK ((published_at IS NULL) = (published_by_subject IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS scenic_published_snapshots_one_active_idx ON scenic_published_snapshots (scenic_area_id) WHERE lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  owner_account_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'SAVED', 'EXECUTING', 'COMPLETED', 'DELETED')),
  title text NOT NULL,
  starts_at timestamptz,
  entrance_id uuid,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, owner_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (entrance_id) REFERENCES published_entrances(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS itinerary_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  itinerary_revision integer NOT NULL CHECK (itinerary_revision > 0),
  sequence integer NOT NULL CHECK (sequence > 0),
  original_place_name text NOT NULL,
  matched_poi_id uuid REFERENCES published_pois(id) ON DELETE RESTRICT,
  match_confidence numeric(4,3) CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  arrival_at timestamptz,
  departure_at timestamptz,
  dwell_minutes integer CHECK (dwell_minutes IS NULL OR dwell_minutes >= 0),
  rationale text,
  travel_mode text CHECK (travel_mode IN ('WALK', 'TRANSIT', 'OTHER')),
  meal_note text,
  rest_note text,
  caution_note text,
  unresolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itinerary_id, itinerary_revision, sequence),
  CHECK ((matched_poi_id IS NULL) = unresolved),
  CHECK (departure_at IS NULL OR arrival_at IS NULL OR departure_at >= arrival_at)
);

CREATE TABLE IF NOT EXISTS route_plan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  itinerary_revision integer NOT NULL CHECK (itinerary_revision > 0),
  scenic_area_id text NOT NULL,
  network_revision_id uuid NOT NULL,
  operational_version_id uuid NOT NULL,
  plan_json jsonb NOT NULL CHECK (jsonb_typeof(plan_json) = 'object'),
  route_geometry_wgs84 geometry(LineString, 4326),
  distance_meters numeric(10,2) NOT NULL CHECK (distance_meters >= 0),
  estimated_seconds integer NOT NULL CHECK (estimated_seconds >= 0),
  expected_end_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, network_revision_id) REFERENCES route_network_revisions(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (operational_version_id) REFERENCES route_operational_versions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS visit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  owner_account_id uuid,
  itinerary_id uuid REFERENCES itineraries(id) ON DELETE SET NULL,
  itinerary_revision integer,
  route_plan_snapshot_id uuid REFERENCES route_plan_snapshots(id) ON DELETE SET NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('READY', 'STARTED', 'PAUSED', 'REPLANNING', 'ARRIVED', 'SKIPPED', 'COMPLETED', 'ENDED', 'INVALIDATED', 'DELETED')),
  narration_enabled boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  ended_at timestamptz,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, owner_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visit_session_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_session_id uuid NOT NULL REFERENCES visit_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('STARTED', 'PAUSED', 'RESUMED', 'RECOVERED', 'SKIPPED', 'REPLANNED', 'ARRIVED', 'ENDED', 'INVALIDATED', 'NARRATION_ENABLED', 'NARRATION_DISABLED')),
  coarse_context text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  UNIQUE (visit_session_id, idempotency_key_hash)
);

COMMENT ON TABLE visit_session_events IS 'Coarse lifecycle events only. Never store continuous precise location, coordinates, tracks, source text, passwords or tokens.';

CREATE TABLE IF NOT EXISTS visitor_consents (
  scenic_area_id text NOT NULL,
  account_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('LOCATION_FOREGROUND', 'PRIVATE_SHARE', 'ACCOUNT_STORAGE', 'NARRATION')),
  granted boolean NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (scenic_area_id, account_id, purpose),
  UNIQUE (scenic_area_id, account_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  account_id uuid,
  request_type text NOT NULL CHECK (request_type IN ('EXPORT', 'DELETE_ACCOUNT', 'DELETE_HISTORY')),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  request_reference text NOT NULL,
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (scenic_area_id, account_id, idempotency_key_hash),
  -- Account deletion first de-identifies this nullable reference in its transaction;
  -- RESTRICT prevents an accidental partial deletion when that step is omitted.
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  content_kind text NOT NULL CHECK (content_kind IN ('POI_TEXT', 'NARRATION_TEXT', 'NARRATION_AUDIO', 'KNOWLEDGE', 'NOTICE', 'RECOMMENDED_ITINERARY')),
  external_key text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN')),
  source_id uuid NOT NULL,
  rights_state text NOT NULL CHECK (rights_state IN ('CLEARED', 'PENDING', 'RESTRICTED', 'UNKNOWN')),
  body_json jsonb NOT NULL CHECK (jsonb_typeof(body_json) = 'object'),
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_by_subject text NOT NULL,
  reviewed_by_subject text,
  published_by_subject text,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, content_kind, external_key, revision),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, source_id) REFERENCES data_sources(scenic_area_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  content_version_id uuid NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  knowledge_key text NOT NULL,
  fact_type text NOT NULL CHECK (fact_type IN ('HISTORICAL', 'CULTURAL', 'VISITOR_SERVICE', 'SAFETY', 'OTHER')),
  source_reference text NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('APPROVED', 'PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  valid_until timestamptz NOT NULL,
  withdrawn_at timestamptz,
  UNIQUE (scenic_area_id, knowledge_key, content_version_id)
);

CREATE TABLE IF NOT EXISTS admin_role_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  oidc_subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('CONTENT_EDITOR', 'CONTENT_REVIEWER', 'GIS_EDITOR', 'GIS_REVIEWER', 'OPERATIONS_EMERGENCY', 'RELEASE_ADMIN', 'AUDITOR')),
  mfa_required boolean NOT NULL DEFAULT true,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  granted_by_subject text NOT NULL,
  granted_at timestamptz NOT NULL,
  expires_at timestamptz,
  UNIQUE (scenic_area_id, oidc_subject, role)
);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  expected_revision integer,
  idempotency_key_hash char(64),
  evidence_reference text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (idempotency_key_hash IS NULL OR idempotency_key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS admin_audit_events_scenic_time_idx ON admin_audit_events (scenic_area_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS operational_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  notice_kind text NOT NULL CHECK (notice_kind IN ('EMERGENCY', 'CLOSURE', 'SERVICE', 'RISK')),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  body_json jsonb NOT NULL CHECK (jsonb_typeof(body_json) = 'object'),
  source_reference text NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  preauthorized_by_subject text NOT NULL,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  CHECK (expires_at > starts_at),
  CHECK ((reviewed_at IS NULL) = (reviewed_by_subject IS NULL))
);

COMMENT ON TABLE data_subject_requests IS 'Request metadata only. Do not store export bodies, passwords, session tokens, precise locations or tracks.';
COMMENT ON TABLE scenic_published_snapshots IS 'A snapshot may be published only by application-level validation of approved, rights-cleared, field-verified and unexpired dependent records.';
