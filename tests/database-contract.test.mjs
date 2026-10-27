import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../database/migrations/001_initial.sql", import.meta.url);
const identityMigrationUrl = new URL("../database/migrations/002_visitor_identity.sql", import.meta.url);
const controlPlaneMigrationUrl = new URL("../database/migrations/003_p0_control_plane.sql", import.meta.url);
const socialMigrationUrl = new URL("../database/migrations/004_social_ecosystem.sql", import.meta.url);
const navigationIntelligenceMigrationUrl = new URL("../database/migrations/005_scenic_navigation_intelligence.sql", import.meta.url);
const offlineNavigationMigrationUrl = new URL("../database/migrations/006_formal_offline_navigation_packs.sql", import.meta.url);
const groupLocationMigrationUrl = new URL("../database/migrations/007_travel_group_live_location.sql", import.meta.url);
const formalItineraryMigrationUrl = new URL("../database/migrations/008_formal_scenic_itineraries.sql", import.meta.url);
const formalPlaceCommunitiesMigrationUrl = new URL("../database/migrations/009_formal_place_communities.sql", import.meta.url);
const navigationSessionLifecycleMigrationUrl = new URL("../database/migrations/010_navigation_session_lifecycle.sql", import.meta.url);
const gisDraftReviewMigrationUrl = new URL("../database/migrations/011_gis_draft_review_workflow.sql", import.meta.url);
const routeClosureControlMigrationUrl = new URL("../database/migrations/012_route_closure_control.sql", import.meta.url);
const routeOperationalReleaseMigrationUrl = new URL("../database/migrations/013_route_operational_snapshot_release.sql", import.meta.url);
const gisFormalizationReleaseMigrationUrl = new URL("../database/migrations/014_gis_formalization_release.sql", import.meta.url);
const scenicTransportRoutingMigrationUrl = new URL("../database/migrations/015_scenic_transport_routing.sql", import.meta.url);
const routeOperationalObservationMigrationUrl = new URL("../database/migrations/016_route_operational_observations.sql", import.meta.url);
const databaseSourceUrl = new URL("../src/lib/server/database.ts", import.meta.url);
const migrationRunnerUrl = new URL("../scripts/migrate-database.mjs", import.meta.url);
const rollbackRunnerUrl = new URL("../scripts/rollback-database.mjs", import.meta.url);

test("initial migration is multi-scenic, spatial and seeds only a draft tenant root", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS postgis/i);
  assert.match(sql, /geometry\(MultiPolygon, 4326\)/i);
  assert.match(sql, /scenic_area_id text NOT NULL REFERENCES scenic_areas\(id\)/i);
  assert.match(sql, /VALUES \('liuzu-town', 'liuzu-town', '六祖镇', 'DRAFT'\)/i);
  assert.doesNotMatch(sql, /VALUES \('liuzu-town'[^;]*'PUBLISHED'\)/i);
});

test("share schema stores only token hashes and minimum JSON payload", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /token_hash char\(64\) NOT NULL UNIQUE/i);
  assert.match(sql, /revoke_token_hash char\(64\) NOT NULL UNIQUE/i);
  assert.match(sql, /payload jsonb NOT NULL/i);
  assert.match(sql, /expires_at = created_at \+ interval '7 days'/i);
  assert.doesNotMatch(sql, /\bpublic_token\b/i);
  assert.doesNotMatch(sql, /\brevoke_token\s+(?:text|char|varchar)/i);
  assert.match(sql, /never store source text, precise user position, or private notes/i);
});

test("database capability reads injected environment only and migration logging excludes connection data", async () => {
  const [databaseSource, runnerSource] = await Promise.all([
    readFile(databaseSourceUrl, "utf8"),
    readFile(migrationRunnerUrl, "utf8"),
  ]);
  assert.match(databaseSource, /process\.env\.DATABASE_URL/);
  assert.match(databaseSource, /verify-full/);
  assert.doesNotMatch(databaseSource, /ssl[^\n]*["']require["']/);
  assert.doesNotMatch(databaseSource, /\.env\.local|readFile|console\.log/);
  assert.match(runnerSource, /已应用迁移：\$\{filename\}/);
  assert.match(runnerSource, /createHash\("sha256"\)/);
  assert.match(runnerSource, /历史迁移文件已变化/);
  assert.match(runnerSource, /迁移缺少同名补偿脚本/);
  assert.doesNotMatch(runnerSource, /process\.stdout\.write\([^)]*connectionString/);
  assert.match(runnerSource, /pg_advisory_xact_lock/);
  assert.match(runnerSource, /DATABASE_MIGRATION_URL/);
  assert.doesNotMatch(runnerSource, /const connectionString = process\.env\.DATABASE_URL/);
  assert.match(runnerSource, /verify-full/);
});

test("visitor identity migration keeps credentials, sessions, throttles and share owners tenant-scoped", async () => {
  const sql = await readFile(identityMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS visitor_accounts/i);
  assert.match(sql, /UNIQUE \(scenic_area_id, handle\)/i);
  assert.match(sql, /password_salt text NOT NULL/i);
  assert.match(sql, /password_hash text NOT NULL/i);
  assert.doesNotMatch(sql, /\bpassphrase\s+(?:text|char|varchar)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS visitor_sessions/i);
  assert.match(sql, /token_hash char\(64\) NOT NULL UNIQUE/i);
  assert.match(sql, /expires_at = created_at \+ interval '30 days'/i);
  assert.doesNotMatch(sql, /\bsession_token\s+(?:text|char|varchar)/i);
  assert.match(sql, /visitor_auth_throttles/i);
  assert.match(sql, /raw IP addresses and submitted handles are never stored/i);
  assert.match(sql, /created_by_account_id/i);
  assert.match(sql, /share_links_visitor_owner_fk/i);
});

test("P0 control-plane migration is tenant-scoped, versioned and does not turn candidate GIS into published data", async () => {
  const sql = await readFile(controlPlaneMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS data_sources/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS scenic_area_publications/i);
  assert.match(sql, /geometry\(MultiPolygon, 4326\)/i);
  assert.match(sql, /geometry\(Point, 4326\)/i);
  assert.match(sql, /geometry\(LineString, 4326\)/i);
  assert.match(sql, /coordinate_system text NOT NULL CHECK \(coordinate_system = 'WGS84'\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_versions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS closure_events/i);
  assert.match(sql, /expected_revision integer NOT NULL/i);
  assert.match(sql, /idempotency_key_hash char\(64\) NOT NULL/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS visitor_consents/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS data_subject_requests/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS visit_session_events/i);
  assert.match(sql, /Never store continuous precise location/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS admin_role_bindings/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS admin_audit_events/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:data_sources|route_network_revisions|scenic_published_snapshots)/i);
});

test("route closure control is immediate, independently reviewed and append-only", async () => {
  const sql = await readFile(routeClosureControlMigrationUrl, "utf8");
  assert.match(sql, /incident_type IN \('WEATHER'.*'SAFETY_OBSERVATION'.*'OTHER'\)/s);
  assert.match(sql, /reviewed_by_subject <> preauthorized_by_subject/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_closure_event_actions/i);
  assert.match(sql, /ACTIVATE.*OPERATIONS_EMERGENCY.*CONFIRM.*WITHDRAW.*RELEASE_ADMIN/is);
  assert.match(sql, /route_closure_event_actions are append-only/i);
  assert.match(sql, /WITHDRAWN removes this event as a blocker; it is not evidence that the physical road is open/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois)/i);
});

test("operational snapshot replacement is immutable, role-separated and atomically supersedes versions", async () => {
  const sql = await readFile(routeOperationalReleaseMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_snapshot_releases/i);
  assert.match(sql, /target_snapshot_revision integer NOT NULL CHECK \(target_snapshot_revision > base_snapshot_revision\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_events/i);
  assert.match(sql, /event_sha256 char\(64\) NOT NULL/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_actions/i);
  assert.match(sql, /PREPARE.*OPERATIONS_EMERGENCY.*PUBLISH.*RELEASE_ADMIN/is);
  assert.match(sql, /published_by_subject <> prepared_by_subject/i);
  assert.match(sql, /route operational release evidence is append-only/i);
  assert.match(sql, /route operational release candidate is immutable/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois)/i);
});

test("GIS formalization release is immutable, role-separated and guarded before formal publication", async () => {
  const sql = await readFile(gisFormalizationReleaseMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gis_formalization_releases/i);
  assert.match(sql, /formalization_plan_json jsonb NOT NULL/i);
  assert.match(sql, /plan_sha256 char\(64\) NOT NULL/i);
  assert.match(sql, /published_by_subject <> prepared_by_subject/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gis_formalization_release_actions/i);
  assert.match(sql, /PREPARE.*GIS_REVIEWER.*PUBLISH.*RELEASE_ADMIN/is);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS published_recommended_routes/i);
  assert.match(sql, /immutable GIS formalization plan fields cannot change/i);
  assert.match(sql, /GIS formalization release actions are append-only/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois|scenic_published_snapshots)/i);
});

test("navigation intelligence keeps reviewed weights nullable and never persists continuous GPS tracks", async () => {
  const sql = await readFile(navigationIntelligenceMigrationUrl, "utf8");
  assert.match(sql, /traversal_mode text CHECK/i);
  assert.match(sql, /difficulty_level text CHECK/i);
  assert.match(sql, /scenic_score smallint CHECK/i);
  assert.match(sql, /travel_time_multiplier numeric/i);
  assert.match(sql, /crowd_level text CHECK/i);
  assert.match(sql, /weather_impact text CHECK/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS navigation_sessions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS navigation_session_events/i);
  assert.match(sql, /Never store latitude, longitude, raw GPS samples/i);
  assert.doesNotMatch(sql, /\b(?:latitude|longitude)\s+(?:numeric|double precision|real|geometry)/i);
  assert.doesNotMatch(sql, /UPDATE\s+route_edges\s+SET\s+(?:traversal_mode|difficulty_level|scenic_score)/i);
});

test("scenic transport routing requires service phases and HTTPS evidence without backfilling legacy edges", async () => {
  const sql = await readFile(scenicTransportRoutingMigrationUrl, "utf8");
  assert.match(sql, /transport_service_name text/i);
  assert.match(sql, /transport_boarding_seconds integer/i);
  assert.match(sql, /transport_expected_wait_seconds integer/i);
  assert.match(sql, /transport_in_vehicle_seconds integer/i);
  assert.match(sql, /transport_schedule_evidence_reference text/i);
  assert.match(sql, /traversal_mode IN \('CABLEWAY', 'SHUTTLE'\)/i);
  assert.match(sql, /transport_schedule_evidence_reference ~ '\^https:\/\/'/i);
  assert.match(sql, /NOT VALID/i);
  assert.doesNotMatch(sql, /UPDATE\s+route_edges/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+route_edges/i);
});

test("dynamic route observations are short-lived, independently reviewed and hash-bound to complete releases", async () => {
  const sql = await readFile(routeOperationalObservationMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_observations/i);
  assert.match(sql, /crowd_level.*LOW.*MODERATE.*HIGH/is);
  assert.match(sql, /weather_impact.*NONE.*RAIN.*HEAT.*WIND.*MULTIPLE/is);
  assert.match(sql, /travel_time_multiplier BETWEEN 1\.00 AND 3\.00/i);
  assert.match(sql, /reviewed_by_subject IS NOT NULL AND reviewed_by_subject <> submitted_by_subject/i);
  assert.match(sql, /OPERATIONS_EDITOR.*OPERATIONS_REVIEWER/is);
  assert.match(sql, /route operational observation evidence is append-only/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_observations/i);
  assert.match(sql, /observation_sha256 char\(64\) NOT NULL/i);
  assert.match(sql, /confirmed_event_count \+ confirmed_observation_count > 0/i);
  assert.match(sql, /NEW\.confirmed_observation_count IS DISTINCT FROM OLD\.confirmed_observation_count/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:route_edges|route_operational_observations|route_operational_snapshot_releases)/i);
});

test("formal offline packs are signed, tenant-bound, short-lived and exclude candidate GIS and private keys", async () => {
  const sql = await readFile(offlineNavigationMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS offline_pack_signing_keys/i);
  assert.match(sql, /algorithm text NOT NULL CHECK \(algorithm = 'ECDSA_P256_SHA256'\)/i);
  assert.match(sql, /CHECK \(NOT \(public_jwk \? 'd'\)\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS formal_offline_packs/i);
  assert.match(sql, /expires_at <= generated_at \+ interval '72 hours'/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS formal_offline_pack_assets/i);
  assert.match(sql, /ROUTE_NETWORK.*OPERATIONAL_STATE.*POI_CATALOG.*MAP_STYLE.*VECTOR_TILES/is);
  assert.match(sql, /asset_path NOT LIKE '\/data\/gis\/%'/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS formal_offline_pack_reviews/i);
  assert.match(sql, /GIS_REVIEWER.*MANAGEMENT_APPROVER/is);
  assert.match(sql, /Private signing keys and visitor GPS are forbidden/i);
  assert.doesNotMatch(sql, /\b(?:latitude|longitude)\s+(?:numeric|double precision|real|geometry)/i);
});

test("同行 location sharing stores one expiring member snapshot and no replayable track", async () => {
  const sql = await readFile(groupLocationMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS travel_group_invites/i);
  assert.match(sql, /invite_token_hash char\(64\) NOT NULL UNIQUE/i);
  assert.match(sql, /expires_at <= created_at \+ interval '24 hours'/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS group_location_share_sessions/i);
  assert.match(sql, /EXACT_TO_ACTIVE_MEMBERS/i);
  assert.match(sql, /expires_at <= started_at \+ interval '8 hours'/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS group_member_location_snapshots/i);
  assert.match(sql, /PRIMARY KEY \(share_session_id\)/i);
  assert.match(sql, /expires_at <= captured_at \+ interval '2 minutes'/i);
  assert.match(sql, /Never store latitude, longitude, geometry, accuracy, heading, speed, or a replayable track/i);
  assert.doesNotMatch(sql, /geometry\(LineString, 4326\)/i);
});

test("formal scenic itineraries require complete reviewed metadata and exclude raw prompts and GPS", async () => {
  const sql = await readFile(formalItineraryMigrationUrl, "utf8");
  assert.match(sql, /visit_interest_tags text\[\]/i);
  assert.match(sql, /visit_dwell_minutes integer/i);
  assert.match(sql, /visit_editorial_priority smallint/i);
  assert.match(sql, /visit_evidence_reference text/i);
  assert.match(sql, /route_nodes_visit_metadata_complete_ck/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS formal_scenic_itinerary_snapshots/i);
  assert.match(sql, /itinerary_fingerprint.*\^sip1-/i);
  assert.match(sql, /expires_at <= generated_at \+ interval '30 minutes'/i);
  assert.match(sql, /Never store raw prompts, visitor age, latitude, longitude, GPS samples or tracks/i);
  assert.doesNotMatch(sql, /\b(?:raw_prompt|visitor_age|latitude|longitude)\s+(?:text|integer|numeric|double precision|real|geometry)/i);
});

test("published place communities bind one-to-one to a formal POI without backfilling candidate facts", async () => {
  const sql = await readFile(formalPlaceCommunitiesMigrationUrl, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS published_poi_id uuid/i);
  assert.match(sql, /FOREIGN KEY \(scenic_area_id, published_poi_id, place_id\)/i);
  assert.match(sql, /REFERENCES published_pois \(scenic_area_id, id, canonical_code\)/i);
  assert.match(sql, /lifecycle_state <> 'PUBLISHED'/i);
  assert.match(sql, /verification_state = 'VERIFIED'/i);
  assert.match(sql, /place_communities_published_poi_uq/i);
  assert.match(sql, /NOT VALID/i);
  assert.doesNotMatch(sql, /UPDATE\s+place_communities/i);
});

test("navigation history is revisioned and idempotent without storing precise location", async () => {
  const sql = await readFile(navigationSessionLifecycleMigrationUrl, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS revision integer/i);
  assert.match(sql, /create_idempotency_key_hash char\(64\)/i);
  assert.match(sql, /navigation_sessions_create_idempotency_uq/i);
  assert.match(sql, /resulting_revision = expected_revision \+ 1/i);
  assert.match(sql, /remaining_distance_bucket_meters % 50 = 0/i);
  assert.match(sql, /receipt_json jsonb/i);
  assert.match(sql, /Coordinates, headings, GPS samples, geometry, raw prompts and tracks are forbidden/i);
  assert.doesNotMatch(sql, /\b(?:latitude|longitude|heading|geometry_wgs84)\s+(?:numeric|double precision|real|geometry)/i);
});

test("GIS draft review workflow quarantines immutable candidates and separates editor from reviewer", async () => {
  const sql = await readFile(gisDraftReviewMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gis_draft_submissions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gis_draft_objects/i);
  assert.match(sql, /geometry_wgs84 geometry\(Geometry, 4326\)/i);
  assert.match(sql, /APPROVED_FOR_FORMALIZATION/i);
  assert.match(sql, /reviewed_by_subject <> submitted_by_subject/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gis_draft_submission_events/i);
  assert.match(sql, /resulting_workflow_revision = expected_workflow_revision \+ 1/i);
  assert.match(sql, /reject_gis_draft_immutable_mutation/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois)/i);
});

test("every shipped forward migration has an explicit guarded compensation path", async () => {
  const [rollbackRunner, first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth, eleventh, twelfth, thirteenth, fourteenth, fifteenth, sixteenth, socialMigration] = await Promise.all([
    readFile(rollbackRunnerUrl, "utf8"),
    readFile(new URL("../database/rollbacks/001_initial.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/002_visitor_identity.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/003_p0_control_plane.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/004_social_ecosystem.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/005_scenic_navigation_intelligence.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/006_formal_offline_navigation_packs.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/007_travel_group_live_location.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/008_formal_scenic_itineraries.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/009_formal_place_communities.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/010_navigation_session_lifecycle.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/011_gis_draft_review_workflow.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/012_route_closure_control.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/013_route_operational_snapshot_release.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/014_gis_formalization_release.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/015_scenic_transport_routing.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/016_route_operational_observations.sql", import.meta.url), "utf8"),
    readFile(socialMigrationUrl, "utf8"),
  ]);
  assert.match(rollbackRunner, /ALLOW_DATABASE_ROLLBACK === "1"/);
  assert.match(rollbackRunner, /--to=<非负迁移号>/);
  assert.match(rollbackRunner, /pg_advisory_xact_lock/);
  assert.match(rollbackRunner, /DELETE FROM schema_migrations/);
  assert.match(first, /Do not DROP EXTENSION postgis/i);
  assert.match(second, /DROP TABLE IF EXISTS visitor_accounts/i);
  assert.match(third, /DROP TABLE IF EXISTS scenic_published_snapshots/i);
  assert.match(socialMigration, /CREATE TABLE IF NOT EXISTS place_communities/i);
  assert.match(fourth, /DROP TABLE IF EXISTS place_communities/i);
  assert.match(fifth, /DROP TABLE IF EXISTS navigation_sessions/i);
  assert.match(sixth, /DROP TABLE IF EXISTS formal_offline_packs/i);
  assert.match(seventh, /DROP TABLE IF EXISTS group_location_share_sessions/i);
  assert.match(eighth, /DROP TABLE IF EXISTS formal_scenic_itinerary_snapshots/i);
  assert.match(ninth, /DROP COLUMN IF EXISTS published_poi_id/i);
  assert.match(tenth, /DROP COLUMN IF EXISTS create_idempotency_key_hash/i);
  assert.match(eleventh, /DROP TABLE IF EXISTS gis_draft_submissions/i);
  assert.match(twelfth, /DROP TABLE IF EXISTS route_closure_event_actions/i);
  assert.match(thirteenth, /cannot compensate migration 013 after an operational replacement snapshot was published/i);
  assert.match(thirteenth, /DROP TABLE IF EXISTS route_operational_snapshot_releases/i);
  assert.match(fourteenth, /cannot compensate migration 014 after formal GIS was published/i);
  assert.match(fourteenth, /DROP TABLE IF EXISTS gis_formalization_releases/i);
  assert.match(fifteenth, /DROP COLUMN IF EXISTS transport_service_name/i);
  assert.match(sixteenth, /Refusing rollback 016/i);
  assert.match(sixteenth, /DROP TABLE IF EXISTS route_operational_observations/i);
});
