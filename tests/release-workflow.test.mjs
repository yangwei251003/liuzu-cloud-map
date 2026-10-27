import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/release-gate.yml", import.meta.url);

test("release workflow provides an ephemeral PostGIS database and never supplies production credentials", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(source, /image: postgis\/postgis:/);
  assert.match(source, /DATABASE_TEST_URL:/);
  assert.match(source, /ALLOW_DATABASE_INTEGRATION_TESTS: "1"/);
  assert.match(source, /DATABASE_TEST_CONFIRM_DISPOSABLE: "1"/);
  assert.match(source, /node-version: 24/);
  assert.match(source, /npm run verify:release/);
  assert.doesNotMatch(source, /DATABASE_URL:/);
});
