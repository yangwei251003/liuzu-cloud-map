import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
export const WEB_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "..");
const WORKSPACE_ROOT = WEB_ROOT;

export const ALLOWED_STATUSES = Object.freeze([
  "IMPLEMENTED_DEMO",
  "SAFE_DEGRADED",
  "EXTERNAL_BLOCKED",
  "MISSING",
]);

const sequence = (prefix, count) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);

export const EXPECTED_IDS = Object.freeze({
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
});

export const EXPECTED_COUNTS = Object.freeze({
  functionalRequirements: 36,
  mustRequirements: 26,
  p0Capabilities: 32,
  acceptanceScenarios: 10,
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);

function pathIsInsideWorkspace(candidate) {
  const relative = path.relative(WORKSPACE_ROOT, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function validateEvidencePath(relativePath, label, errors, rootDir) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    errors.push(`${label}: evidence path must be a non-empty string`);
    return;
  }

  const absolutePath = path.resolve(rootDir, relativePath);
  if (!pathIsInsideWorkspace(absolutePath)) {
    errors.push(`${label}: evidence path escapes the workspace: ${relativePath}`);
    return;
  }

  try {
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      errors.push(`${label}: evidence path is not a file: ${relativePath}`);
    }
  } catch {
    errors.push(`${label}: evidence file does not exist: ${relativePath}`);
  }
}

function compareExactIds(groupName, items, errors) {
  const expected = EXPECTED_IDS[groupName];
  const actual = items.map((item) => item?.id);
  const actualSet = new Set(actual);
  const missing = expected.filter((id) => !actualSet.has(id));
  const unknown = actual.filter((id) => !expected.includes(id));

  if (items.length !== EXPECTED_COUNTS[groupName]) {
    errors.push(
      `${groupName}: expected ${EXPECTED_COUNTS[groupName]} items, received ${items.length}`,
    );
  }
  if (missing.length > 0) {
    errors.push(`${groupName}: missing required IDs: ${missing.join(", ")}`);
  }
  if (unknown.length > 0) {
    errors.push(`${groupName}: unknown IDs: ${unknown.join(", ")}`);
  }
}

export async function validateLedger(ledger, { rootDir = WEB_ROOT } = {}) {
  const errors = [];

  if (!isObject(ledger)) {
    return ["ledger must be a JSON object"];
  }
  if (ledger.schemaVersion !== "product-acceptance.v1") {
    errors.push("schemaVersion must be product-acceptance.v1");
  }

  const declaredStatuses = asArray(ledger.allowedStatuses);
  if (
    declaredStatuses.length !== ALLOWED_STATUSES.length ||
    ALLOWED_STATUSES.some((status) => !declaredStatuses.includes(status))
  ) {
    errors.push(`allowedStatuses must exactly match: ${ALLOWED_STATUSES.join(", ")}`);
  }

  for (const sourceFile of asArray(ledger.baseline?.sourceFiles)) {
    await validateEvidencePath(sourceFile, "baseline", errors, rootDir);
  }

  const blockerRows = asArray(ledger.externalBlockers);
  const blockerIds = new Set();
  for (const [index, blocker] of blockerRows.entries()) {
    const label = `externalBlockers[${index}]`;
    if (!isObject(blocker) || typeof blocker.id !== "string" || !blocker.id.startsWith("EXT-")) {
      errors.push(`${label}: invalid external blocker ID`);
      continue;
    }
    if (blockerIds.has(blocker.id)) {
      errors.push(`${label}: duplicate external blocker ID ${blocker.id}`);
    }
    blockerIds.add(blocker.id);
    if (typeof blocker.title !== "string" || blocker.title.trim() === "") {
      errors.push(`${label}: title is required`);
    }
    if (asArray(blocker.evidenceFiles).length === 0) {
      errors.push(`${label}: at least one local blocker evidence file is required`);
    }
    for (const evidenceFile of asArray(blocker.evidenceFiles)) {
      await validateEvidencePath(evidenceFile, label, errors, rootDir);
    }
  }

  const seenIds = new Set();
  for (const groupName of Object.keys(EXPECTED_IDS)) {
    const items = asArray(ledger[groupName]);
    compareExactIds(groupName, items, errors);

    for (const [index, item] of items.entries()) {
      const label = `${groupName}[${index}]`;
      if (!isObject(item)) {
        errors.push(`${label}: item must be an object`);
        continue;
      }
      if (typeof item.id !== "string" || item.id.trim() === "") {
        errors.push(`${label}: ID is required`);
      } else if (seenIds.has(item.id)) {
        errors.push(`${label}: duplicate requirement ID ${item.id}`);
      } else {
        seenIds.add(item.id);
      }
      if (typeof item.title !== "string" || item.title.trim() === "") {
        errors.push(`${label}: title is required`);
      }
      if (!ALLOWED_STATUSES.includes(item.status)) {
        errors.push(`${label}: unknown status ${String(item.status)}`);
      }

      const evidenceFiles = asArray(item.evidenceFiles);
      const referencedBlockers = asArray(item.blockerIds);
      if (evidenceFiles.length === 0 && referencedBlockers.length === 0) {
        errors.push(`${label}: requires at least one local evidence file or external blocker ID`);
      }
      for (const evidenceFile of evidenceFiles) {
        await validateEvidencePath(evidenceFile, label, errors, rootDir);
      }
      for (const blockerId of referencedBlockers) {
        if (!blockerIds.has(blockerId)) {
          errors.push(`${label}: unknown external blocker ID ${String(blockerId)}`);
        }
      }

      if (item.status === "EXTERNAL_BLOCKED" && referencedBlockers.length === 0) {
        errors.push(`${label}: EXTERNAL_BLOCKED requires an external blocker ID`);
      }
      if (item.status === "IMPLEMENTED_DEMO" && evidenceFiles.length === 0) {
        errors.push(`${label}: IMPLEMENTED_DEMO requires local implementation evidence`);
      }
      if (item.status === "SAFE_DEGRADED" && evidenceFiles.length === 0) {
        errors.push(`${label}: SAFE_DEGRADED requires local fallback evidence`);
      }
      if (item.requiredForProduction !== true) {
        errors.push(`${label}: every v1 ledger item is required for production acceptance`);
      }
      if (typeof item.productionSatisfied !== "boolean") {
        errors.push(`${label}: productionSatisfied must be boolean`);
      }

      const productionEvidenceFiles = asArray(item.productionEvidenceFiles);
      for (const evidenceFile of productionEvidenceFiles) {
        await validateEvidencePath(evidenceFile, `${label}.productionEvidenceFiles`, errors, rootDir);
      }
      if (item.productionSatisfied === true) {
        if (item.status !== "IMPLEMENTED_DEMO") {
          errors.push(`${label}: productionSatisfied requires implemented and demonstrated behavior`);
        }
        if (referencedBlockers.length > 0) {
          errors.push(`${label}: productionSatisfied cannot retain external blockers`);
        }
        if (productionEvidenceFiles.length === 0) {
          errors.push(`${label}: productionSatisfied requires explicit production evidence files`);
        }
      }
    }
  }

  return errors;
}

export function allItems(ledger) {
  return Object.keys(EXPECTED_IDS).flatMap((groupName) => asArray(ledger[groupName]));
}

function itemIsProductionSatisfied(item) {
  return (
    item.requiredForProduction === true &&
    item.productionSatisfied === true &&
    item.status === "IMPLEMENTED_DEMO" &&
    asArray(item.blockerIds).length === 0 &&
    asArray(item.productionEvidenceFiles).length > 0
  );
}

function countStatuses(items) {
  return Object.fromEntries(
    ALLOWED_STATUSES.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  );
}

export function buildSummary(ledger, { generatedAt = new Date().toISOString() } = {}) {
  const items = allItems(ledger);
  const requiredItems = items.filter((item) => item.requiredForProduction === true);
  const productionSatisfiedItems = requiredItems.filter(itemIsProductionSatisfied);
  const referencedBlockerIds = [...new Set(items.flatMap((item) => asArray(item.blockerIds)))].sort();

  return {
    schemaVersion: "product-readiness-summary.v1",
    generatedAt,
    ledgerSchemaVersion: ledger.schemaVersion,
    baseline: ledger.baseline,
    validation: {
      passed: true,
      errorCount: 0,
    },
    totals: {
      items: items.length,
      requiredForProduction: requiredItems.length,
      productionSatisfied: productionSatisfiedItems.length,
      byStatus: countStatuses(items),
    },
    groups: Object.fromEntries(
      Object.keys(EXPECTED_IDS).map((groupName) => {
        const groupItems = asArray(ledger[groupName]);
        return [
          groupName,
          {
            expected: EXPECTED_COUNTS[groupName],
            actual: groupItems.length,
            productionSatisfied: groupItems.filter(itemIsProductionSatisfied).length,
            byStatus: countStatuses(groupItems),
          },
        ];
      }),
    ),
    referencedExternalBlockerIds: referencedBlockerIds,
    unresolvedProductionIds: requiredItems
      .filter((item) => !itemIsProductionSatisfied(item))
      .map((item) => item.id),
    productionReady:
      requiredItems.length === items.length &&
      requiredItems.length > 0 &&
      productionSatisfiedItems.length === requiredItems.length,
    conclusion:
      productionSatisfiedItems.length === requiredItems.length
        ? "PRODUCTION_REQUIREMENTS_SATISFIED"
        : "DEMO_NOT_PRODUCTION_READY",
  };
}

function parseArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }
  return process.argv[index + 1];
}

async function main() {
  const fixturePath = path.resolve(
    WEB_ROOT,
    parseArgument("--fixture", "tests/fixtures/product-acceptance.v1.json"),
  );
  const outputPath = path.resolve(
    WEB_ROOT,
    parseArgument("--output", "test-results/product-readiness-summary.json"),
  );
  const ledger = JSON.parse(await readFile(fixturePath, "utf8"));
  const errors = await validateLedger(ledger, { rootDir: WEB_ROOT });

  if (errors.length > 0) {
    throw new Error(`Product acceptance ledger is invalid:\n- ${errors.join("\n- ")}`);
  }

  const summary = buildSummary(ledger);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(
    `Product readiness: ${summary.totals.items} items checked; ` +
      `${summary.totals.productionSatisfied}/${summary.totals.requiredForProduction} ` +
      `production-satisfied; productionReady=${summary.productionReady}`,
  );
  console.log(`Report: ${path.relative(WEB_ROOT, outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
