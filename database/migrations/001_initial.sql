CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS scenic_areas (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN')),
  boundary geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$')
);

CREATE INDEX IF NOT EXISTS scenic_areas_boundary_gix
  ON scenic_areas USING gist (boundary)
  WHERE boundary IS NOT NULL;

INSERT INTO scenic_areas (id, slug, name, lifecycle_state)
VALUES ('liuzu-town', 'liuzu-town', '六祖镇', 'DRAFT')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  token_hash char(64) NOT NULL UNIQUE,
  revoke_token_hash char(64) NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CHECK (revoke_token_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (expires_at = created_at + interval '7 days'),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS share_links_active_lookup_idx
  ON share_links (scenic_area_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS share_links_expiry_idx
  ON share_links (expires_at);

CREATE TABLE IF NOT EXISTS share_link_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  share_link_id uuid NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED', 'REVOKED', 'EXPIRED')),
  actor_subject text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS share_link_audit_events_link_time_idx
  ON share_link_audit_events (share_link_id, occurred_at DESC);

COMMENT ON COLUMN share_links.token_hash IS 'SHA-256 hex digest only; the public bearer token must never be stored.';
COMMENT ON COLUMN share_links.revoke_token_hash IS 'SHA-256 hex digest only; the private revoke token must never be stored.';
COMMENT ON COLUMN share_links.payload IS 'Versioned minimal read-only route payload; never store source text, precise user position, or private notes.';
