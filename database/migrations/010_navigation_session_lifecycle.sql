-- Turns the navigation_sessions tables from a storage placeholder into an
-- idempotent, revision-checked lifecycle. Existing rows are not reclassified;
-- the new API writes the complete receipt fields atomically.

ALTER TABLE navigation_sessions
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN IF NOT EXISTS initial_distance_meters numeric(10,2) CHECK (initial_distance_meters IS NULL OR initial_distance_meters >= 0),
  ADD COLUMN IF NOT EXISTS estimated_minutes numeric(10,2) CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  ADD COLUMN IF NOT EXISTS create_idempotency_key_hash char(64) CHECK (create_idempotency_key_hash IS NULL OR create_idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS create_receipt_json jsonb CHECK (create_receipt_json IS NULL OR jsonb_typeof(create_receipt_json) = 'object');

ALTER TABLE navigation_sessions
  ADD CONSTRAINT navigation_sessions_persistent_receipt_complete_ck CHECK (
    create_idempotency_key_hash IS NULL
    OR (
      initial_distance_meters IS NOT NULL
      AND estimated_minutes IS NOT NULL
      AND create_receipt_json IS NOT NULL
    )
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS navigation_sessions_create_idempotency_uq
  ON navigation_sessions (scenic_area_id, account_id, create_idempotency_key_hash)
  WHERE create_idempotency_key_hash IS NOT NULL;

ALTER TABLE navigation_session_events
  ADD COLUMN IF NOT EXISTS expected_revision integer CHECK (expected_revision IS NULL OR expected_revision >= 0),
  ADD COLUMN IF NOT EXISTS resulting_revision integer CHECK (resulting_revision IS NULL OR resulting_revision > 0),
  ADD COLUMN IF NOT EXISTS idempotency_key_hash char(64) CHECK (idempotency_key_hash IS NULL OR idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS route_fingerprint text CHECK (route_fingerprint IS NULL OR route_fingerprint ~ '^drp1-[0-9a-f]{8}$'),
  ADD COLUMN IF NOT EXISTS receipt_json jsonb CHECK (receipt_json IS NULL OR jsonb_typeof(receipt_json) = 'object');

ALTER TABLE navigation_session_events
  ADD CONSTRAINT navigation_session_events_persistent_receipt_complete_ck CHECK (
    idempotency_key_hash IS NULL
    OR (
      expected_revision IS NOT NULL
      AND resulting_revision = expected_revision + 1
      AND route_fingerprint IS NOT NULL
      AND receipt_json IS NOT NULL
      AND (remaining_distance_bucket_meters IS NULL OR remaining_distance_bucket_meters % 50 = 0)
      AND (
        reason_code IS NULL
        OR reason_code IN (
          'USER_PAUSED', 'PAGE_HIDDEN', 'SENSOR_UNAVAILABLE', 'OFF_ROUTE',
          'NETWORK_VERSION_CHANGED', 'OPERATIONAL_STATE_UNAVAILABLE',
          'ROUTE_REPLACED', 'ARRIVAL_CONFIRMED', 'USER_EXIT'
        )
      )
    )
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS navigation_session_events_idempotency_uq
  ON navigation_session_events (scenic_area_id, navigation_session_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

COMMENT ON COLUMN navigation_session_events.receipt_json IS
  'Idempotent coarse lifecycle receipt. Coordinates, headings, GPS samples, geometry, raw prompts and tracks are forbidden.';
