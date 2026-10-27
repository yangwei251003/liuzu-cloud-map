-- Cableway and scenic-shuttle edges need service-specific evidence and time
-- components. Existing formal rows are not backfilled or silently promoted.

ALTER TABLE route_edges
  ADD COLUMN IF NOT EXISTS transport_service_name text,
  ADD COLUMN IF NOT EXISTS transport_boarding_seconds integer CHECK (transport_boarding_seconds BETWEEN 0 AND 1800),
  ADD COLUMN IF NOT EXISTS transport_expected_wait_seconds integer CHECK (transport_expected_wait_seconds BETWEEN 0 AND 7200),
  ADD COLUMN IF NOT EXISTS transport_in_vehicle_seconds integer CHECK (transport_in_vehicle_seconds BETWEEN 1 AND 14400),
  ADD COLUMN IF NOT EXISTS transport_schedule_evidence_reference text;

ALTER TABLE route_edges
  ADD CONSTRAINT route_edges_transport_service_semantics_ck CHECK (
    (
      traversal_mode IN ('CABLEWAY', 'SHUTTLE')
      AND transport_service_name IS NOT NULL
      AND length(trim(transport_service_name)) BETWEEN 1 AND 120
      AND transport_boarding_seconds IS NOT NULL
      AND transport_expected_wait_seconds IS NOT NULL
      AND transport_in_vehicle_seconds IS NOT NULL
      AND transport_schedule_evidence_reference IS NOT NULL
      AND transport_schedule_evidence_reference ~ '^https://'
    )
    OR
    (
      traversal_mode NOT IN ('CABLEWAY', 'SHUTTLE')
      AND transport_service_name IS NULL
      AND transport_boarding_seconds IS NULL
      AND transport_expected_wait_seconds IS NULL
      AND transport_in_vehicle_seconds IS NULL
      AND transport_schedule_evidence_reference IS NULL
    )
    OR (
      traversal_mode IS NULL
      AND transport_service_name IS NULL
      AND transport_boarding_seconds IS NULL
      AND transport_expected_wait_seconds IS NULL
      AND transport_in_vehicle_seconds IS NULL
      AND transport_schedule_evidence_reference IS NULL
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT route_edges_transport_service_semantics_ck ON route_edges IS
  'New cableway/shuttle writes require explicit reviewed service timing and HTTPS schedule evidence. NOT VALID preserves legacy rows without treating them as routable transport.';
