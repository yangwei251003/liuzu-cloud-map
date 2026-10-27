-- Location-first travel social network. No rows are seeded: application demo
-- fixtures stay client-side and can never be mistaken for real UGC or live crowd data.

CREATE TABLE IF NOT EXISTS social_profiles (
  scenic_area_id text NOT NULL,
  account_id uuid NOT NULL,
  handle text NOT NULL,
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  avatar_asset_id uuid,
  profile_visibility text NOT NULL DEFAULT 'PUBLIC'
    CHECK (profile_visibility IN ('PUBLIC', 'FRIENDS', 'PRIVATE')),
  moderation_state text NOT NULL DEFAULT 'ACTIVE'
    CHECK (moderation_state IN ('ACTIVE', 'LIMITED', 'SUSPENDED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scenic_area_id, account_id),
  UNIQUE (scenic_area_id, handle),
  FOREIGN KEY (scenic_area_id, account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (char_length(display_name) BETWEEN 1 AND 60),
  CHECK (char_length(bio) <= 300)
);

CREATE TABLE IF NOT EXISTS place_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  place_id text NOT NULL,
  display_name text NOT NULL,
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  original_coordinate_system text NOT NULL,
  location_source_reference text NOT NULL,
  verification_state text NOT NULL
    CHECK (verification_state IN ('CANDIDATE', 'VERIFIED', 'EXPIRED', 'REJECTED')),
  collected_at timestamptz NOT NULL,
  verified_at timestamptz,
  valid_until timestamptz,
  lifecycle_state text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_state IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'WITHDRAWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenic_area_id, place_id),
  UNIQUE (scenic_area_id, id),
  CHECK (place_id ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK (verified_at IS NULL OR verification_state = 'VERIFIED'),
  CHECK (valid_until IS NULL OR valid_until > collected_at)
);

CREATE INDEX IF NOT EXISTS place_communities_geometry_gix
  ON place_communities USING gist (geometry_wgs84);

CREATE TABLE IF NOT EXISTS social_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  owner_account_id uuid NOT NULL,
  storage_provider text NOT NULL,
  object_key text NOT NULL,
  cdn_url text,
  media_kind text NOT NULL CHECK (media_kind IN ('IMAGE', 'VIDEO')),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 104857600),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_seconds numeric(8,2) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  processing_state text NOT NULL
    CHECK (processing_state IN ('UPLOADING', 'SCANNING', 'PROCESSING', 'READY', 'REJECTED', 'DELETED')),
  moderation_state text NOT NULL DEFAULT 'PENDING'
    CHECK (moderation_state IN ('PENDING', 'APPROVED', 'REJECTED')),
  rights_declaration text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (storage_provider, object_key),
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, owner_account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (cdn_url IS NULL OR cdn_url ~ '^https://'),
  CHECK (processing_state <> 'READY' OR cdn_url IS NOT NULL)
);

ALTER TABLE social_profiles
  ADD CONSTRAINT social_profiles_avatar_fk
  FOREIGN KEY (scenic_area_id, avatar_asset_id)
  REFERENCES social_media_assets(scenic_area_id, id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  community_id uuid NOT NULL,
  author_account_id uuid NOT NULL,
  post_type text NOT NULL
    CHECK (post_type IN ('TRAVEL_NOTE', 'FOOD', 'SCENERY', 'GUIDE', 'CAUTION', 'LIVE_UPDATE', 'OFFICIAL_NOTICE')),
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'FRIENDS', 'PRIVATE')),
  body text NOT NULL,
  geometry_wgs84 geometry(Point, 4326) NOT NULL,
  location_source text NOT NULL CHECK (location_source IN ('DEVICE_GPS', 'USER_CONFIRMED')),
  location_accuracy_meters numeric(9,2),
  location_captured_at timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL,
  moderation_state text NOT NULL DEFAULT 'PENDING'
    CHECK (moderation_state IN ('PENDING', 'APPROVED', 'LIMITED', 'REJECTED', 'DELETED')),
  expected_revision integer NOT NULL DEFAULT 0 CHECK (expected_revision >= 0),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, author_account_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, community_id)
    REFERENCES place_communities(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, author_account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (char_length(body) BETWEEN 1 AND 1500),
  CHECK (ST_IsValid(geometry_wgs84)),
  CHECK (location_accuracy_meters IS NULL OR location_accuracy_meters >= 0),
  CHECK (occurred_at <= created_at + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS social_posts_community_feed_idx
  ON social_posts (scenic_area_id, community_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND moderation_state = 'APPROVED' AND visibility = 'PUBLIC';
CREATE INDEX IF NOT EXISTS social_posts_geometry_gix
  ON social_posts USING gist (geometry_wgs84)
  WHERE deleted_at IS NULL AND moderation_state = 'APPROVED' AND visibility = 'PUBLIC';
CREATE INDEX IF NOT EXISTS social_posts_author_idx
  ON social_posts (scenic_area_id, author_account_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS social_post_media (
  scenic_area_id text NOT NULL,
  post_id uuid NOT NULL,
  media_asset_id uuid NOT NULL,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 9),
  alt_text text NOT NULL,
  PRIMARY KEY (post_id, media_asset_id),
  UNIQUE (post_id, sequence),
  FOREIGN KEY (scenic_area_id, post_id)
    REFERENCES social_posts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, media_asset_id)
    REFERENCES social_media_assets(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK (char_length(alt_text) BETWEEN 1 AND 300)
);

CREATE TABLE IF NOT EXISTS social_post_tags (
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (post_id, tag),
  CHECK (char_length(tag) BETWEEN 1 AND 30)
);

CREATE TABLE IF NOT EXISTS social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  post_id uuid NOT NULL,
  author_account_id uuid NOT NULL,
  parent_comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  moderation_state text NOT NULL DEFAULT 'PENDING'
    CHECK (moderation_state IN ('PENDING', 'APPROVED', 'LIMITED', 'REJECTED', 'DELETED')),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, author_account_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, post_id)
    REFERENCES social_posts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, author_account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS social_comments_post_idx
  ON social_comments (post_id, created_at ASC)
  WHERE deleted_at IS NULL AND moderation_state = 'APPROVED';

CREATE TABLE IF NOT EXISTS social_reactions (
  scenic_area_id text NOT NULL,
  post_id uuid NOT NULL,
  actor_account_id uuid NOT NULL,
  reaction_type text NOT NULL
    CHECK (reaction_type IN ('LIKE', 'COLLECT', 'WENT', 'WANT_TO_GO', 'ADD_TO_PLAN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, actor_account_id, reaction_type),
  FOREIGN KEY (scenic_area_id, post_id)
    REFERENCES social_posts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, actor_account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS travel_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  community_id uuid NOT NULL,
  account_id uuid NOT NULL,
  visited_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  companion_labels text[] NOT NULL DEFAULT '{}',
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'FRIENDS', 'PRIVATE')),
  precise_geometry_wgs84 geometry(Point, 4326) NOT NULL,
  public_geometry_wgs84 geometry(Point, 4326),
  location_source text NOT NULL CHECK (location_source = 'DEVICE_GPS'),
  location_accuracy_meters numeric(9,2),
  cover_media_asset_id uuid,
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (scenic_area_id, id),
  UNIQUE (scenic_area_id, account_id, idempotency_key_hash),
  FOREIGN KEY (scenic_area_id, community_id)
    REFERENCES place_communities(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, cover_media_asset_id)
    REFERENCES social_media_assets(scenic_area_id, id) ON DELETE SET NULL,
  CHECK (char_length(note) <= 500),
  CHECK (cardinality(companion_labels) <= 12),
  CHECK (ST_IsValid(precise_geometry_wgs84)),
  CHECK (public_geometry_wgs84 IS NULL OR ST_IsValid(public_geometry_wgs84)),
  CHECK (visibility = 'PRIVATE' OR public_geometry_wgs84 IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS travel_check_ins_account_idx
  ON travel_check_ins (scenic_area_id, account_id, visited_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS travel_check_ins_public_geometry_gix
  ON travel_check_ins USING gist (public_geometry_wgs84)
  WHERE deleted_at IS NULL AND visibility = 'PUBLIC';

CREATE TABLE IF NOT EXISTS travel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  account_id uuid NOT NULL,
  title text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'FRIENDS', 'PRIVATE')),
  private_track_wgs84 geometry(LineString, 4326),
  public_track_wgs84 geometry(LineString, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (scenic_area_id, id),
  FOREIGN KEY (scenic_area_id, account_id)
    REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (private_track_wgs84 IS NULL OR ST_IsValid(private_track_wgs84)),
  CHECK (public_track_wgs84 IS NULL OR ST_IsValid(public_track_wgs84)),
  CHECK (visibility = 'PRIVATE' OR private_track_wgs84 IS NULL OR public_track_wgs84 IS NOT NULL)
);

-- Phase 2 relationship, messaging, group and official-account foundations.
CREATE TABLE IF NOT EXISTS social_follows (
  scenic_area_id text NOT NULL,
  follower_account_id uuid NOT NULL,
  followed_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scenic_area_id, follower_account_id, followed_account_id),
  FOREIGN KEY (scenic_area_id, follower_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, followed_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (follower_account_id <> followed_account_id)
);

CREATE TABLE IF NOT EXISTS friend_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  requester_account_id uuid NOT NULL,
  addressee_account_id uuid NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, requester_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, addressee_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (requester_account_id <> addressee_account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_relations_pair_idx
  ON friend_relations (scenic_area_id, LEAST(requester_account_id, addressee_account_id), GREATEST(requester_account_id, addressee_account_id));

CREATE TABLE IF NOT EXISTS travel_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  owner_account_id uuid NOT NULL,
  community_id uuid,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  group_kind text NOT NULL CHECK (group_kind IN ('INTEREST', 'PRIVATE_TRIP', 'TEMPORARY_TEAM')),
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'REQUEST_TO_JOIN', 'PRIVATE')),
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('ACTIVE', 'ARCHIVED', 'SUSPENDED', 'DELETED')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (scenic_area_id, owner_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenic_area_id, community_id) REFERENCES place_communities(scenic_area_id, id) ON DELETE SET NULL,
  CHECK (char_length(name) BETWEEN 1 AND 80),
  CHECK (char_length(description) <= 1000),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS travel_group_members (
  scenic_area_id text NOT NULL,
  group_id uuid NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('INVITED', 'REQUESTED', 'ACTIVE', 'LEFT', 'REMOVED', 'BLOCKED')),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, account_id),
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  conversation_kind text NOT NULL CHECK (conversation_kind IN ('DIRECT', 'GROUP')),
  group_id uuid REFERENCES travel_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((conversation_kind = 'GROUP') = (group_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  scenic_area_id text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (conversation_id, account_id),
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_account_id uuid NOT NULL,
  message_kind text NOT NULL CHECK (message_kind IN ('TEXT', 'IMAGE', 'LOCATION', 'ROUTE', 'SYSTEM')),
  body_json jsonb NOT NULL CHECK (jsonb_typeof(body_json) = 'object'),
  moderation_state text NOT NULL DEFAULT 'PENDING' CHECK (moderation_state IN ('PENDING', 'APPROVED', 'REJECTED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (scenic_area_id, sender_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS social_messages_conversation_idx ON social_messages (conversation_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS official_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  community_id uuid NOT NULL,
  organization_name text NOT NULL,
  verification_evidence_reference text NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('PENDING', 'VERIFIED', 'REVOKED', 'EXPIRED')),
  verified_by_subject text,
  verified_at timestamptz,
  valid_until timestamptz,
  UNIQUE (scenic_area_id, account_id),
  FOREIGN KEY (scenic_area_id, account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (scenic_area_id, community_id) REFERENCES place_communities(scenic_area_id, id) ON DELETE RESTRICT,
  CHECK ((verified_at IS NULL) = (verified_by_subject IS NULL)),
  CHECK (verification_state <> 'VERIFIED' OR (verified_at IS NOT NULL AND valid_until IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS social_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  recipient_account_id uuid NOT NULL,
  notification_kind text NOT NULL CHECK (notification_kind IN ('LIKE', 'COMMENT', 'FOLLOW', 'FRIEND', 'MESSAGE', 'GROUP', 'OFFICIAL_NOTICE', 'SYSTEM')),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  FOREIGN KEY (scenic_area_id, recipient_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS social_notifications_recipient_idx ON social_notifications (scenic_area_id, recipient_account_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS social_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenic_area_id text NOT NULL,
  reporter_account_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('PROFILE', 'POST', 'COMMENT', 'MESSAGE', 'GROUP')),
  target_id uuid NOT NULL,
  reason_code text NOT NULL,
  detail text NOT NULL DEFAULT '',
  lifecycle_state text NOT NULL DEFAULT 'OPEN' CHECK (lifecycle_state IN ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED')),
  resolved_by_subject text,
  resolution_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (scenic_area_id, reporter_account_id) REFERENCES visitor_accounts(scenic_area_id, id) ON DELETE CASCADE,
  CHECK (char_length(detail) <= 1000),
  CHECK ((resolved_at IS NULL) = (resolved_by_subject IS NULL))
);

COMMENT ON COLUMN social_posts.geometry_wgs84 IS 'Author-supplied device location. It is UGC provenance, not official scenic GIS or proof of current conditions.';
COMMENT ON COLUMN travel_check_ins.precise_geometry_wgs84 IS 'Private exact check-in point; never return in public profile or feed APIs.';
COMMENT ON COLUMN travel_check_ins.public_geometry_wgs84 IS 'Privacy-reduced public point generated server-side; never copy precise geometry directly.';
COMMENT ON TABLE social_media_assets IS 'Object storage metadata only. Upload credentials, raw tokens and moderation provider secrets must never be stored.';
