-- Compensating rollback for 001. Do not DROP EXTENSION postgis: it may be shared by another schema.
DROP TABLE IF EXISTS share_link_audit_events;
DROP TABLE IF EXISTS share_links;
DROP INDEX IF EXISTS scenic_areas_boundary_gix;
DROP TABLE IF EXISTS scenic_areas;
