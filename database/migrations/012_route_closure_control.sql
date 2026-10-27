-- N7: production emergency route-control workflow.
-- A closure becomes effective immediately, but only against an already
-- published, field-verified route network. Independent review never turns a
-- candidate geometry into formal GIS and never asserts that a withdrawn event
-- means a road is open.

ALTER TABLE closure_events
  ADD COLUMN IF NOT EXISTS incident_type text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS operator_note text NOT NULL DEFAULT 'Legacy closure event imported before structured incident notes.',
  ADD COLUMN IF NOT EXISTS workflow_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_decision text,
  ADD COLUMN IF NOT EXISTS review_evidence_reference text,
  ADD COLUMN IF NOT EXISTS withdrawn_by_subject text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE closure_events
SET
  workflow_revision = 2,
  review_decision = CASE WHEN withdrawn_at IS NULL THEN 'CONFIRMED' ELSE 'WITHDRAWN' END,
  reviewed_by_subject = COALESCE(reviewed_by_subject, 'system:legacy-closure-migration'),
  reviewed_at = COALESCE(reviewed_at, withdrawn_at, created_at),
  review_evidence_reference = COALESCE(review_evidence_reference, source_reference),
  withdrawn_by_subject = CASE
    WHEN withdrawn_at IS NULL THEN NULL
    ELSE COALESCE(reviewed_by_subject, 'system:legacy-closure-migration')
  END,
  updated_at = COALESCE(reviewed_at, withdrawn_at, created_at)
WHERE reviewed_at IS NOT NULL OR withdrawn_at IS NOT NULL;

ALTER TABLE closure_events
  DROP CONSTRAINT IF EXISTS closure_events_incident_type_check,
  ADD CONSTRAINT closure_events_incident_type_check CHECK (
    incident_type IN ('WEATHER', 'DAMAGE', 'CROWD_CONTROL', 'MAINTENANCE', 'EVENT_CONTROL', 'SAFETY_OBSERVATION', 'OTHER')
  ),
  DROP CONSTRAINT IF EXISTS closure_events_operator_note_check,
  ADD CONSTRAINT closure_events_operator_note_check CHECK (
    char_length(operator_note) BETWEEN 10 AND 1000
  ),
  DROP CONSTRAINT IF EXISTS closure_events_workflow_revision_check,
  ADD CONSTRAINT closure_events_workflow_revision_check CHECK (workflow_revision IN (1, 2)),
  DROP CONSTRAINT IF EXISTS closure_events_review_decision_check,
  ADD CONSTRAINT closure_events_review_decision_check CHECK (
    review_decision IS NULL OR review_decision IN ('CONFIRMED', 'WITHDRAWN')
  ),
  DROP CONSTRAINT IF EXISTS closure_events_review_workflow_check,
  ADD CONSTRAINT closure_events_review_workflow_check CHECK (
    (
      workflow_revision = 1
      AND review_decision IS NULL
      AND reviewed_by_subject IS NULL
      AND reviewed_at IS NULL
      AND review_evidence_reference IS NULL
      AND withdrawn_at IS NULL
      AND withdrawn_by_subject IS NULL
    )
    OR
    (
      workflow_revision = 2
      AND review_decision IS NOT NULL
      AND reviewed_by_subject IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_evidence_reference IS NOT NULL
      AND reviewed_by_subject <> preauthorized_by_subject
      AND (
        (review_decision = 'CONFIRMED' AND withdrawn_at IS NULL AND withdrawn_by_subject IS NULL)
        OR
        (review_decision = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_by_subject = reviewed_by_subject)
      )
    )
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS closure_events_evidence_https_check,
  ADD CONSTRAINT closure_events_evidence_https_check CHECK (
    source_reference ~ '^https://[^[:space:]]+$'
    AND reason_reference ~ '^https://[^[:space:]]+$'
    AND (review_evidence_reference IS NULL OR review_evidence_reference ~ '^https://[^[:space:]]+$')
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS closure_events_review_time_check,
  ADD CONSTRAINT closure_events_review_time_check CHECK (
    reviewed_at IS NULL OR reviewed_at >= created_at
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS route_closure_event_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenic_area_id text NOT NULL REFERENCES scenic_areas(id) ON DELETE RESTRICT,
  closure_event_id uuid NOT NULL REFERENCES closure_events(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('ACTIVATE', 'CONFIRM', 'WITHDRAW')),
  actor_oidc_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('OPERATIONS_EMERGENCY', 'RELEASE_ADMIN')),
  expected_workflow_revision integer NOT NULL CHECK (expected_workflow_revision IN (0, 1)),
  resulting_workflow_revision integer NOT NULL CHECK (resulting_workflow_revision IN (1, 2)),
  idempotency_key_hash char(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  evidence_reference text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  UNIQUE (scenic_area_id, idempotency_key_hash),
  UNIQUE (closure_event_id, resulting_workflow_revision),
  CHECK (actor_oidc_subject <> ''),
  CHECK (evidence_reference ~ '^https://[^[:space:]]+$'),
  CHECK (
    (action = 'ACTIVATE' AND actor_role = 'OPERATIONS_EMERGENCY' AND expected_workflow_revision = 0 AND resulting_workflow_revision = 1)
    OR
    (action IN ('CONFIRM', 'WITHDRAW') AND actor_role = 'RELEASE_ADMIN' AND expected_workflow_revision = 1 AND resulting_workflow_revision = 2)
  )
);

CREATE INDEX IF NOT EXISTS route_closure_event_actions_event_idx
  ON route_closure_event_actions (scenic_area_id, closure_event_id, occurred_at);

CREATE INDEX IF NOT EXISTS closure_events_review_queue_idx
  ON closure_events (scenic_area_id, workflow_revision, created_at DESC)
  WHERE workflow_revision = 1;

CREATE OR REPLACE FUNCTION reject_route_closure_action_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'route_closure_event_actions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS route_closure_event_actions_immutable ON route_closure_event_actions;
CREATE TRIGGER route_closure_event_actions_immutable
BEFORE UPDATE OR DELETE ON route_closure_event_actions
FOR EACH ROW EXECUTE FUNCTION reject_route_closure_action_mutation();

COMMENT ON TABLE route_closure_event_actions IS
  'Append-only emergency route-control audit. ACTIVATE immediately fails closed; RELEASE_ADMIN confirmation or withdrawal must be independent.';
COMMENT ON COLUMN closure_events.review_decision IS
  'WITHDRAWN removes this event as a blocker; it is not evidence that the physical road is open.';
