CREATE TABLE IF NOT EXISTS visitor_accounts (
  id uuid PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  subject text NOT NULL UNIQUE,
  handle text NOT NULL,
  password_version smallint NOT NULL DEFAULT 1 CHECK (password_version = 1),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, handle),
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, id, subject),
  CHECK (handle = lower(handle)),
  CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CHECK (password_salt ~ '^[A-Za-z0-9_-]{22}$'),
  CHECK (password_hash ~ '^[A-Za-z0-9_-]{43}$'),
  CHECK (subject = 'visitor:' || scenic_area_id || ':' || id::text),
  CHECK (locked_until IS NULL OR last_failed_login_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS visitor_accounts_scenic_created_idx
  ON visitor_accounts (scenic_area_id, created_at DESC);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id uuid PRIMARY KEY,
  scenic_area_id text NOT NULL,
  account_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (scenic_area_id, account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at = created_at + interval '30 days'),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS visitor_sessions_account_active_idx
  ON visitor_sessions (scenic_area_id, account_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS visitor_sessions_expiry_idx
  ON visitor_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS visitor_auth_throttles (
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('LOGIN', 'REGISTER')),
  dimension_hash char(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  failure_count integer NOT NULL CHECK (failure_count > 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scenic_area_id, operation, dimension_hash),
  CHECK (dimension_hash ~ '^[0-9a-f]{64}$'),
  CHECK (locked_until IS NULL OR locked_until >= window_started_at)
);

CREATE INDEX IF NOT EXISTS visitor_auth_throttles_cleanup_idx
  ON visitor_auth_throttles (updated_at);

CREATE TABLE IF NOT EXISTS visitor_auth_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  account_id uuid,
  actor_subject text,
  event_type text NOT NULL CHECK (event_type IN (
    'REGISTERED', 'REGISTRATION_REJECTED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED',
    'SESSION_REVOKED'
  )),
  dimension_hash char(64),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (scenic_area_id, account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (dimension_hash IS NULL OR dimension_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS visitor_auth_audit_events_scenic_time_idx
  ON visitor_auth_audit_events (scenic_area_id, occurred_at DESC);

ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS created_by_account_id uuid;

ALTER TABLE share_links
  ADD CONSTRAINT share_links_owner_pair_check
  CHECK ((created_by_account_id IS NULL) = (created_by_subject IS NULL));

ALTER TABLE share_links
  ADD CONSTRAINT share_links_visitor_owner_fk
  FOREIGN KEY (scenic_area_id, created_by_account_id, created_by_subject)
  REFERENCES visitor_accounts(scenic_area_id, id, subject) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS share_links_owner_created_idx
  ON share_links (scenic_area_id, created_by_account_id, created_at DESC)
  WHERE created_by_account_id IS NOT NULL;

COMMENT ON COLUMN visitor_accounts.password_salt IS 'Per-account random salt for asynchronous Node.js scrypt; never store a passphrase.';
COMMENT ON COLUMN visitor_accounts.password_hash IS 'Base64url-encoded scrypt output only; never log credentials or derived secret material.';
COMMENT ON COLUMN visitor_sessions.token_hash IS 'SHA-256 digest only; the 30-day bearer session token exists only in the secure cookie response.';
COMMENT ON COLUMN visitor_auth_throttles.dimension_hash IS 'HMAC-SHA-256 pseudonymous dimension; raw IP addresses and submitted handles are never stored here.';
COMMENT ON COLUMN share_links.created_by_account_id IS 'Authenticated visitor owner. Legacy rows may be null; all new application writes require an owner.';
