-- Temporary同行 location sharing. Only the latest short-TTL point is kept;
-- there is deliberately no route, track, replay, public-feed, or analytics
-- table for precise group locations.

CREATE UNIQUE INDEX IF NOT EXISTS travel_groups_tenant_id_idx
  ON travel_groups (scenic_area_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS travel_group_members_tenant_member_idx
  ON travel_group_members (scenic_area_id, group_id, account_id);

ALTER TABLE travel_groups
  ADD COLUMN IF NOT EXISTS idempotency_key_hash char(64)
  CHECK (idempotency_key_hash IS NULL OR idempotency_key_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS travel_groups_owner_idempotency_idx
  ON travel_groups (scenic_area_id, owner_account_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

ALTER TABLE travel_group_members
  ADD CONSTRAINT travel_group_members_group_tenant_fk
  FOREIGN KEY (scenic_area_id, group_id)
  REFERENCES travel_groups(scenic_area_id, id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS travel_group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  group_id uuid NOT NULL,
  created_by_account_id uuid NOT NULL,
  invite_token_hash char(64) NOT NULL UNIQUE CHECK (invite_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  max_uses smallint NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 20),
  used_count smallint NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (scenic_area_id, group_id) REFERENCES travel_groups(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, group_id, created_by_account_id) REFERENCES travel_group_members(scenic_area_id, group_id, account_id) ON DELETE CASCADE,
  UNIQUE (scenic_area_id, group_id, created_by_account_id, idempotency_key_hash),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS travel_group_invites_active_idx
  ON travel_group_invites (scenic_area_id, group_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS group_location_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  group_id uuid NOT NULL,
  account_id uuid NOT NULL,
  consent_revision integer NOT NULL CHECK (consent_revision > 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  sharing_precision text NOT NULL CHECK (sharing_precision = 'EXACT_TO_ACTIVE_MEMBERS'),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('ACTIVE', 'STOPPED', 'EXPIRED', 'REVOKED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  stopped_at timestamptz,
  stop_reason text,
  FOREIGN KEY (scenic_area_id, group_id, account_id) REFERENCES travel_group_members(scenic_area_id, group_id, account_id) ON DELETE CASCADE,
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, account_id, idempotency_key_hash),
  CHECK (expires_at > started_at AND expires_at <= started_at + interval '8 hours'),
  CHECK ((stopped_at IS NULL) = (stop_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS group_location_share_one_active_member_idx
  ON group_location_share_sessions (scenic_area_id, group_id, account_id)
  WHERE lifecycle_state = 'ACTIVE' AND stopped_at IS NULL;

CREATE TABLE IF NOT EXISTS group_member_location_snapshots (
  scenic_area_id text NOT NULL,
  share_session_id uuid NOT NULL,
  group_id uuid NOT NULL,
  account_id uuid NOT NULL,
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  accuracy_meters numeric(7,2) NOT NULL CHECK (accuracy_meters > 0 AND accuracy_meters <= 50),
  captured_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (share_session_id),
  UNIQUE (scenic_area_id, group_id, account_id),
  FOREIGN KEY (scenic_area_id, share_session_id) REFERENCES group_location_share_sessions(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, group_id, account_id) REFERENCES travel_group_members(scenic_area_id, group_id, account_id) ON DELETE CASCADE,
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK (expires_at > captured_at AND expires_at <= captured_at + interval '2 minutes')
);

CREATE INDEX IF NOT EXISTS group_member_location_snapshots_geometry_gix
  ON group_member_location_snapshots USING gist (geometry_wgs84);

CREATE INDEX IF NOT EXISTS group_member_location_snapshots_active_idx
  ON group_member_location_snapshots (scenic_area_id, group_id, expires_at);

CREATE TABLE IF NOT EXISTS group_location_share_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL,
  share_session_id uuid NOT NULL,
  group_id uuid NOT NULL,
  account_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('STARTED', 'STOPPED', 'EXPIRED', 'REVOKED')),
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, share_session_id) REFERENCES group_location_share_sessions(scenic_area_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS group_location_share_events_timeline_idx
  ON group_location_share_events (share_session_id, occurred_at, id);

COMMENT ON TABLE group_member_location_snapshots IS
  'One overwrite-only point per active member, visible only to active group members and automatically invalid after at most two minutes.';

COMMENT ON TABLE group_location_share_events IS
  'Coarse lifecycle audit only. Never store latitude, longitude, geometry, accuracy, heading, speed, or a replayable track in events.';
