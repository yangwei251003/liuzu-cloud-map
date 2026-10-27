ALTER TABLE route_edges
  DROP CONSTRAINT IF EXISTS route_edges_transport_service_semantics_ck,
  DROP COLUMN IF EXISTS transport_schedule_evidence_reference,
  DROP COLUMN IF EXISTS transport_in_vehicle_seconds,
  DROP COLUMN IF EXISTS transport_expected_wait_seconds,
  DROP COLUMN IF EXISTS transport_boarding_seconds,
  DROP COLUMN IF EXISTS transport_service_name;
