-- Compensating rollback for migration 011. Requires the guarded rollback runner.
DROP TRIGGER IF EXISTS gis_draft_submission_events_immutable ON gis_draft_submission_events;
DROP TRIGGER IF EXISTS gis_draft_objects_immutable ON gis_draft_objects;
DROP FUNCTION IF EXISTS reject_gis_draft_immutable_mutation();
DROP TABLE IF EXISTS gis_draft_submission_events;
DROP TABLE IF EXISTS gis_draft_objects;
DROP TABLE IF EXISTS gis_draft_submissions;
