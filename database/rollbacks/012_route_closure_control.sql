DROP TRIGGER IF EXISTS route_closure_event_actions_immutable ON route_closure_event_actions;
DROP FUNCTION IF EXISTS reject_route_closure_action_mutation();
DROP INDEX IF EXISTS closure_events_review_queue_idx;
DROP INDEX IF EXISTS route_closure_event_actions_event_idx;
DROP TABLE IF EXISTS route_closure_event_actions;

ALTER TABLE closure_events
  DROP CONSTRAINT IF EXISTS closure_events_review_time_check,
  DROP CONSTRAINT IF EXISTS closure_events_evidence_https_check,
  DROP CONSTRAINT IF EXISTS closure_events_review_workflow_check,
  DROP CONSTRAINT IF EXISTS closure_events_review_decision_check,
  DROP CONSTRAINT IF EXISTS closure_events_workflow_revision_check,
  DROP CONSTRAINT IF EXISTS closure_events_operator_note_check,
  DROP CONSTRAINT IF EXISTS closure_events_incident_type_check,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS withdrawn_by_subject,
  DROP COLUMN IF EXISTS review_evidence_reference,
  DROP COLUMN IF EXISTS review_decision,
  DROP COLUMN IF EXISTS workflow_revision,
  DROP COLUMN IF EXISTS operator_note,
  DROP COLUMN IF EXISTS incident_type;
