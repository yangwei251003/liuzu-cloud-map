-- Formal offline packs are immutable, signed projections of an already
-- published scenic snapshot. No candidate GIS, private signing key, visitor
-- coordinate, account payload, or community write is stored in these tables.

CREATE UNIQUE INDEX IF NOT EXISTS scenic_published_snapshots_tenant_id_idx
  ON scenic_published_snapshots (scenic_area_id, id);

CREATE TABLE IF NOT EXISTS offline_pack_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  public_key_id text NOT NULL CHECK (public_key_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  algorithm text NOT NULL CHECK (algorithm = 'ECDSA_P256_SHA256'),
  public_jwk jsonb NOT NULL CHECK (jsonb_typeof(public_jwk) = 'object'),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('ACTIVE', 'RETIRED', 'REVOKED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (scenic_area_id, public_key_id),
  UNIQUE (scenic_area_id, id),
  CHECK (valid_until > valid_from),
  CHECK (public_jwk ? 'kty' AND public_jwk ? 'crv' AND public_jwk ? 'x' AND public_jwk ? 'y'),
  CHECK (NOT (public_jwk ? 'd'))
);

CREATE TABLE IF NOT EXISTS formal_offline_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  public_pack_id text NOT NULL CHECK (public_pack_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  pack_revision integer NOT NULL CHECK (pack_revision > 0),
  published_snapshot_id uuid NOT NULL,
  signing_key_id uuid NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  coordinate_system text NOT NULL CHECK (coordinate_system = 'WGS84'),
  manifest_json jsonb NOT NULL CHECK (jsonb_typeof(manifest_json) = 'object'),
  manifest_sha256 char(64) NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  signature_value text NOT NULL CHECK (signature_value ~ '^[A-Za-z0-9_-]{40,200}$'),
  total_bytes bigint NOT NULL CHECK (total_bytes > 0 AND total_bytes <= 1073741824),
  rights_evidence_reference text NOT NULL CHECK (rights_evidence_reference ~ '^https://'),
  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_by_subject text NOT NULL,
  published_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  UNIQUE (scenic_area_id, public_pack_id),
  UNIQUE (scenic_area_id, pack_revision),
  UNIQUE (scenic_area_id, idempotency_key_hash),
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, published_snapshot_id) REFERENCES scenic_published_snapshots(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, signing_key_id) REFERENCES offline_pack_signing_keys(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > generated_at),
  CHECK (expires_at <= generated_at + interval '72 hours'),
  CHECK ((published_at IS NULL) = (published_by_subject IS NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdrawal_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS formal_offline_packs_one_published_idx
  ON formal_offline_packs (scenic_area_id)
  WHERE lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS formal_offline_pack_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  offline_pack_id uuid NOT NULL,
  asset_role text NOT NULL CHECK (asset_role IN ('ROUTE_NETWORK', 'OPERATIONAL_STATE', 'POI_CATALOG', 'MAP_STYLE', 'VECTOR_TILES', 'ICON_SPRITE', 'FONT_GLYPHS')),
  asset_path text NOT NULL CHECK (asset_path ~ '^/offline-packs/[A-Za-z0-9._/-]+$' AND asset_path !~ '\.\.'),
  content_type text NOT NULL CHECK (content_type IN ('application/json', 'application/geo+json', 'application/vnd.pmtiles', 'image/png', 'image/svg+xml', 'application/x-protobuf')),
  byte_length bigint NOT NULL CHECK (byte_length > 0 AND byte_length <= 536870912),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  cache_policy text NOT NULL CHECK (cache_policy = 'IMMUTABLE'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offline_pack_id, asset_path),
  FOREIGN KEY (scenic_area_id, offline_pack_id) REFERENCES formal_offline_packs(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (asset_path NOT LIKE '/data/gis/%' AND asset_path NOT LIKE '/api/%')
);

CREATE INDEX IF NOT EXISTS formal_offline_pack_assets_pack_role_idx
  ON formal_offline_pack_assets (offline_pack_id, asset_role);

CREATE TABLE IF NOT EXISTS formal_offline_pack_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  offline_pack_id uuid NOT NULL,
  review_role text NOT NULL CHECK (review_role IN ('GIS_REVIEWER', 'MANAGEMENT_APPROVER')),
  outcome text NOT NULL CHECK (outcome IN ('APPROVED', 'REJECTED')),
  reviewer_subject text NOT NULL,
  evidence_reference text NOT NULL CHECK (evidence_reference ~ '^https://'),
  reviewed_manifest_sha256 char(64) NOT NULL CHECK (reviewed_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (offline_pack_id, review_role),
  FOREIGN KEY (scenic_area_id, offline_pack_id) REFERENCES formal_offline_packs(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (expires_at > reviewed_at)
);

CREATE TABLE IF NOT EXISTS formal_offline_pack_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL,
  offline_pack_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('CREATED', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  actor_subject text NOT NULL,
  manifest_sha256 char(64) NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, offline_pack_id) REFERENCES formal_offline_packs(scenic_area_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS formal_offline_pack_events_timeline_idx
  ON formal_offline_pack_events (offline_pack_id, occurred_at, id);

COMMENT ON TABLE formal_offline_packs IS
  'Signed, short-lived formal offline navigation packs bound to a published snapshot. Private signing keys and visitor GPS are forbidden.';

COMMENT ON TABLE formal_offline_pack_assets IS
  'Only immutable assets listed in the signed manifest may enter the offline-pack cache; candidate GIS and API responses are prohibited.';
