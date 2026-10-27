DROP TABLE IF EXISTS group_location_share_events;
DROP TABLE IF EXISTS group_member_location_snapshots;
DROP TABLE IF EXISTS group_location_share_sessions;
DROP TABLE IF EXISTS travel_group_invites;

ALTER TABLE travel_group_members
  DROP CONSTRAINT IF EXISTS travel_group_members_group_tenant_fk;

DROP INDEX IF EXISTS travel_group_members_tenant_member_idx;
DROP INDEX IF EXISTS travel_groups_tenant_id_idx;
DROP INDEX IF EXISTS travel_groups_owner_idempotency_idx;

ALTER TABLE travel_groups
  DROP COLUMN IF EXISTS idempotency_key_hash;
