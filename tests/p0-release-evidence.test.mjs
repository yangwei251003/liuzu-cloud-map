import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { summarizeP0Evidence, validateP0Evidence } from "../scripts/p0-release-evidence.mjs";

const fixtureUrl = new URL("./fixtures/p0-release-evidence.v1.json", import.meta.url);

test("P0 release evidence has exactly twelve release rules and thirty-eight scenarios", async () => {
  const ledger = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const errors = await validateP0Evidence(ledger);
  assert.deepEqual(errors, []);
  const summary = summarizeP0Evidence(ledger);
  assert.equal(summary.totalRules, 12);
  assert.equal(summary.totalScenarios, 38);
  assert.equal(summary.productionReady, false);
  assert.equal(summary.conclusion, "NO_GO");
  assert.ok(summary.openExternalBlockerIds.includes("EXT-GIS-OFFICIAL"));
});

test("release evidence fails closed for a missing scenario or an unrecorded blocker", async () => {
  const ledger = JSON.parse(await readFile(fixtureUrl, "utf8"));
  ledger.scenarios.pop();
  ledger.externalBlockers = [];
  const errors = await validateP0Evidence(ledger);
  assert.ok(errors.some((error) => error.includes("SC-38")));
  assert.ok(errors.some((error) => error.includes("externalBlockers")));
});
