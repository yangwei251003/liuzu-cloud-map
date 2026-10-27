import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const verifierUrl = new URL("../scripts/verify-postgis.mjs", import.meta.url);
const workflowProbeUrl = new URL("../scripts/verify-postgis-workflows.mjs", import.meta.url);

test("PostGIS verifier is opt-in, discovers every migration and tests complete compensation replay", async () => {
  const source = await readFile(verifierUrl, "utf8");
  assert.match(source, /DATABASE_TEST_URL/);
  assert.match(source, /ALLOW_DATABASE_INTEGRATION_TESTS/);
  assert.match(source, /DATABASE_TEST_CONFIRM_DISPOSABLE/);
  assert.match(source, /disposable test database is not pristine/);
  assert.match(source, /readdir\(migrationsDirectory\)/);
  assert.match(source, /rollback-database\.mjs/);
  assert.match(source, /--to=0/);
  assert.match(source, /migrate-database\.mjs/);
  assert.match(source, /verify-postgis-workflows\.mjs/);
  assert.match(source, /gis_formalization_releases/);
  assert.match(source, /route_operational_observations/);
  assert.match(source, /postgis/);
  assert.doesNotMatch(source, /const expectedMigrations = \["001_initial\.sql"/);
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL/);
});

test("PostGIS workflow probe exercises N6-N12 separation, a late atomic fault and dynamic factor publication", async () => {
  const source = await readFile(workflowProbeUrl, "utf8");
  assert.match(source, /submitGisDraftCollection/);
  assert.match(source, /reviewGisDraftSubmission/);
  assert.match(source, /prepareGisFormalization/);
  assert.match(source, /publishGisFormalization/);
  assert.match(source, /SUBMITTER_CANNOT_REVIEW/);
  assert.match(source, /REVIEWER_CANNOT_PREPARE/);
  assert.match(source, /PREPARER_CANNOT_PUBLISH/);
  assert.match(source, /DUTY_SEPARATION_FAILED/);
  assert.match(source, /integration_fail_n9_snapshot_insert/);
  assert.match(source, /fault injection must reach the final snapshot insert/);
  assert.match(source, /a late snapshot fault must roll back every formal publication write/);
  assert.match(source, /published_recommended_routes/);
  assert.match(source, /formalization actions must remain append-only/);
  assert.match(source, /submitRouteOperationalObservation/);
  assert.match(source, /reviewRouteOperationalObservation/);
  assert.match(source, /prepareRouteOperationalRelease/);
  assert.match(source, /publishRouteOperationalRelease/);
  assert.match(source, /confirmedObservationCount/);
  assert.match(source, /operational observation actions must remain append-only/);
});

test("PostGIS verifier rejects a production-named database before attempting a connection", () => {
  const secret = "must-not-appear-in-output";
  const result = spawnSync(process.execPath, [fileURLToPath(verifierUrl)], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_TEST_URL: `postgresql://ci-user:${secret}@127.0.0.1:1/production`,
      ALLOW_DATABASE_INTEGRATION_TESTS: "1",
      DATABASE_TEST_CONFIRM_DISPOSABLE: "1",
      DATABASE_SSL_MODE: "disable",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /名称明确含 test\/ci/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
});
