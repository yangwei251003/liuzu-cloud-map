DROP INDEX IF EXISTS navigation_session_events_idempotency_uq;

ALTER TABLE navigation_session_events
  DROP CONSTRAINT IF EXISTS navigation_session_events_persistent_receipt_complete_ck,
  DROP COLUMN IF EXISTS receipt_json,
  DROP COLUMN IF EXISTS route_fingerprint,
  DROP COLUMN IF EXISTS idempotency_key_hash,
  DROP COLUMN IF EXISTS resulting_revision,
  DROP COLUMN IF EXISTS expected_revision;

DROP INDEX IF EXISTS navigation_sessions_create_idempotency_uq;

ALTER TABLE navigation_sessions
  DROP CONSTRAINT IF EXISTS navigation_sessions_persistent_receipt_complete_ck,
  DROP COLUMN IF EXISTS create_receipt_json,
  DROP COLUMN IF EXISTS create_idempotency_key_hash,
  DROP COLUMN IF EXISTS estimated_minutes,
  DROP COLUMN IF EXISTS initial_distance_meters,
  DROP COLUMN IF EXISTS revision;
