import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_STATUSES,
  buildSummary,
  validateLedger,
} from "../scripts/product-readiness-report.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_DIR, "..");
const FIXTURE_PATH = path.join(TEST_DIR, "fixtures", "product-acceptance.v1.json");
const SUMMARY_PATH = path.join(WEB_ROOT, "test-results", "product-readiness-summary.json");

const sequence = (prefix, count) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);

const REQUIRED_IDS = {
  functionalRequirements: [
    ...sequence("FR-T", 12),
    ...sequence("FR-D", 10),
    ...sequence("FR-O", 8),
    ...sequence("FR-C", 6),
  ],
  mustRequirements: [
    ...sequence("MUST-S1-", 10),
    ...sequence("MUST-S2-", 9),
    ...sequence("MUST-SUP-", 7),
  ],
  p0Capabilities: [
    "CAP-V001",
    "CAP-V002",
    "CAP-V003",
    "CAP-V004",
    "CAP-V005",
    "CAP-V101",
    "CAP-V102",
    "CAP-V104",
    "CAP-V105",
    "CAP-V106",
    "CAP-V107",
    "CAP-V108",
    "CAP-V201",
    "CAP-V202",
    "CAP-V203",
    "CAP-V204",
    "CAP-V205",
    "CAP-V301",
    "CAP-V303",
    "CAP-V304",
    "CAP-V305",
    "CAP-V306",
    "CAP-V307",
    "CAP-V308",
    "CAP-V309",
    "CAP-V401",
    "CAP-V402",
    "CAP-V404",
    "CAP-V405",
    "CAP-V502",
    "CAP-V504",
    "CAP-V505",
  ],
  acceptanceScenarios: sequence("AC-", 10),
};

async function loadLedger() {
  return JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

test("product acceptance ledger enumerates the exact approved baseline", async () => {
  const ledger = await loadLedger();
  const allIds = [];

  for (const [groupName, requiredIds] of Object.entries(REQUIRED_IDS)) {
    const actualIds = ledger[groupName].map((item) => item.id);
    assert.equal(actualIds.length, requiredIds.length, `${groupName} count`);
    assert.deepEqual([...actualIds].sort(), [...requiredIds].sort(), `${groupName} exact IDs`);
    allIds.push(...actualIds);
  }

  assert.equal(allIds.length, 104);
  assert.equal(new Set(allIds).size, 104, "requirement IDs must be globally unique");
  assert.deepEqual([...ledger.allowedStatuses].sort(), [...ALLOWED_STATUSES].sort());
  assert.deepEqual(await validateLedger(ledger, { rootDir: WEB_ROOT }), []);
});

test("ledger validation rejects omissions and duplicate requirement IDs", async () => {
  const ledger = await loadLedger();
  const missing = clone(ledger);
  missing.functionalRequirements.pop();
  const missingErrors = await validateLedger(missing, { rootDir: WEB_ROOT });
  assert.match(missingErrors.join("\n"), /expected 36 items/);
  assert.match(missingErrors.join("\n"), /missing required IDs: FR-C06/);

  const duplicate = clone(ledger);
  duplicate.p0Capabilities[1].id = duplicate.p0Capabilities[0].id;
  const duplicateErrors = await validateLedger(duplicate, { rootDir: WEB_ROOT });
  assert.match(duplicateErrors.join("\n"), /duplicate requirement ID CAP-V001/);
});

test("ledger validation rejects unknown statuses and blocker IDs", async () => {
  const ledger = await loadLedger();
  const unknownStatus = clone(ledger);
  unknownStatus.mustRequirements[0].status = "PRODUCTION_READY";
  const statusErrors = await validateLedger(unknownStatus, { rootDir: WEB_ROOT });
  assert.match(statusErrors.join("\n"), /unknown status PRODUCTION_READY/);

  const unknownBlocker = clone(ledger);
  unknownBlocker.acceptanceScenarios[0].blockerIds = ["EXT-NOT-REGISTERED"];
  const blockerErrors = await validateLedger(unknownBlocker, { rootDir: WEB_ROOT });
  assert.match(blockerErrors.join("\n"), /unknown external blocker ID EXT-NOT-REGISTERED/);
});

test("ledger validation rejects missing evidence files and unsupported production claims", async () => {
  const ledger = await loadLedger();
  const missingEvidence = clone(ledger);
  missingEvidence.functionalRequirements[2].evidenceFiles = ["src/does-not-exist.ts"];
  const evidenceErrors = await validateLedger(missingEvidence, { rootDir: WEB_ROOT });
  assert.match(evidenceErrors.join("\n"), /evidence file does not exist: src\/does-not-exist\.ts/);

  const forgedProduction = clone(ledger);
  forgedProduction.functionalRequirements[0].productionSatisfied = true;
  forgedProduction.functionalRequirements[0].productionEvidenceFiles = ["README.md"];
  const productionErrors = await validateLedger(forgedProduction, { rootDir: WEB_ROOT });
  assert.match(productionErrors.join("\n"), /productionSatisfied requires implemented and demonstrated behavior/);
  assert.match(productionErrors.join("\n"), /productionSatisfied cannot retain external blockers/);
});

test("readiness report remains non-blocking while honestly reporting production false", async () => {
  const execution = spawnSync(process.execPath, ["scripts/product-readiness-report.mjs"], {
    cwd: WEB_ROOT,
    encoding: "utf8",
  });

  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const summary = JSON.parse(await readFile(SUMMARY_PATH, "utf8"));
  assert.equal(summary.validation.passed, true);
  assert.equal(summary.totals.items, 104);
  assert.equal(summary.totals.requiredForProduction, 104);
  assert.equal(summary.totals.productionSatisfied, 0);
  assert.equal(summary.productionReady, false);
  assert.equal(summary.conclusion, "DEMO_NOT_PRODUCTION_READY");

  const directSummary = buildSummary(await loadLedger(), { generatedAt: "2026-08-15T00:00:00.000Z" });
  assert.equal(directSummary.productionReady, false);
  assert.equal(directSummary.unresolvedProductionIds.length, 104);
});
