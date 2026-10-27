-- Compensating rollback for 002. It deliberately leaves the PostGIS extension untouched.
ALTER TABLE IF EXISTS share_links DROP CONSTRAINT IF EXISTS share_links_visitor_owner_fk;
ALTER TABLE IF EXISTS share_links DROP CONSTRAINT IF EXISTS share_links_owner_pair_check;
DROP INDEX IF EXISTS share_links_owner_created_idx;
ALTER TABLE IF EXISTS share_links DROP COLUMN IF EXISTS created_by_account_id;
DROP TABLE IF EXISTS visitor_auth_audit_events;
DROP TABLE IF EXISTS visitor_auth_throttles;
DROP TABLE IF EXISTS visitor_sessions;
DROP TABLE IF EXISTS visitor_accounts;
