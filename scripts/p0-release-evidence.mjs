import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const WEB_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "..");

export const EVIDENCE_STATUSES = Object.freeze(["PASS", "PARTIAL", "MISSING", "BROKEN", "MOCK", "UNVERIFIED"]);
export const REQUIRED_DOCUMENTS = Object.freeze([
  "RELEASE_READINESS_AUDIT.md",
  "P0_GAP_AND_IMPLEMENTATION_PLAN.md",
  "FEATURE_COVERAGE_MATRIX.md",
  "GIS_DATA_MODEL.md",
  "DATA_SOURCE_REGISTER.md",
  "AI_SAFETY_AND_KNOWLEDGE_POLICY.md",
  "PRIVACY_DATA_MAP.md",
  "FIELD_TEST_CHECKLIST.md",
  "OPERATIONS_RUNBOOK.md",
  "GO_LIVE_CHECKLIST.md",
  "KNOWN_LIMITATIONS.md",
]);

const expectedIds = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);
const EXPECTED_RULE_IDS = expectedIds("RULE-", 12);
const EXPECTED_SCENARIO_IDS = expectedIds("SC-", 38);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => (Array.isArray(value) ? value : []);

function exactIds(rows, expected, label, errors) {
  const ids = rows.map((row) => row?.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missing = expected.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !expected.includes(id));
  if (missing.length) errors.push(`${label}: missing IDs ${missing.join(", ")}`);
  if (unexpected.length) errors.push(`${label}: unexpected IDs ${unexpected.join(", ")}`);
  if (duplicates.length) errors.push(`${label}: duplicate IDs ${[...new Set(duplicates)].join(", ")}`);
}

async function fileExists(relativePath, rootDir) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return false;
  const candidate = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function validateP0Evidence(ledger, { rootDir = WEB_ROOT } = {}) {
  const errors = [];
  if (!isRecord(ledger) || ledger.schemaVersion !== "p0-release-evidence.v1") {
    return ["schemaVersion must be p0-release-evidence.v1"];
  }
  if (typeof ledger.assessedAt !== "string" || Number.isNaN(new Date(ledger.assessedAt).getTime())) {
    errors.push("assessedAt must be an ISO timestamp");
  }
  const rules = safeArray(ledger.releaseRules);
  const scenarios = safeArray(ledger.scenarios);
  exactIds(rules, EXPECTED_RULE_IDS, "releaseRules", errors);
  exactIds(scenarios, EXPECTED_SCENARIO_IDS, "scenarios", errors);
  const allRows = [...rules, ...scenarios];
  for (const [index, row] of allRows.entries()) {
    const label = `row[${index}]`;
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string") {
      errors.push(`${label}: id and title are required`);
      continue;
    }
    if (!EVIDENCE_STATUSES.includes(row.status)) errors.push(`${row.id}: invalid status`);
    const evidencePaths = safeArray(row.evidencePaths);
    if (evidencePaths.length === 0) errors.push(`${row.id}: evidencePaths are required`);
    for (const evidencePath of evidencePaths) {
      if (!(await fileExists(evidencePath, rootDir))) errors.push(`${row.id}: evidence path unavailable: ${String(evidencePath)}`);
    }
  }
  const blockers = safeArray(ledger.externalBlockers);
  if (blockers.length === 0) errors.push("externalBlockers must explicitly record unresolved external conditions");
  for (const blocker of blockers) {
    if (!isRecord(blocker) || typeof blocker.id !== "string" || !blocker.id.startsWith("EXT-") || typeof blocker.title !== "string") {
      errors.push("externalBlockers contains an invalid item");
      continue;
    }
    if (blocker.state !== "OPEN" && blocker.state !== "CLOSED") errors.push(`${blocker.id}: invalid blocker state`);
  }
  return errors;
}

export function summarizeP0Evidence(ledger) {
  const rows = [...safeArray(ledger.releaseRules), ...safeArray(ledger.scenarios)];
  const nonPassing = rows.filter((row) => row?.status !== "PASS").map((row) => row.id);
  const openBlockers = safeArray(ledger.externalBlockers).filter((blocker) => blocker?.state !== "CLOSED").map((blocker) => blocker.id);
  return {
    schemaVersion: "p0-release-evidence-summary.v1",
    assessedAt: ledger.assessedAt,
    totalRules: safeArray(ledger.releaseRules).length,
    totalScenarios: safeArray(ledger.scenarios).length,
    nonPassingIds: nonPassing,
    openExternalBlockerIds: openBlockers,
    productionReady: nonPassing.length === 0 && openBlockers.length === 0,
    conclusion: nonPassing.length === 0 && openBlockers.length === 0 ? "GO_CANDIDATE" : "NO_GO",
  };
}

async function main() {
  const fixturePath = path.join(WEB_ROOT, "tests", "fixtures", "p0-release-evidence.v1.json");
  const outputPath = path.join(WEB_ROOT, "test-results", "p0-release-evidence-summary.json");
  const ledger = JSON.parse(await readFile(fixturePath, "utf8"));
  const errors = await validateP0Evidence(ledger);
  if (errors.length) throw new Error(`P0 release evidence is invalid:\n- ${errors.join("\n- ")}`);
  const summary = summarizeP0Evidence(ledger);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`P0 release evidence: ${summary.totalRules} rules, ${summary.totalScenarios} scenarios, ${summary.nonPassingIds.length} non-passing, ${summary.openExternalBlockerIds.length} open blockers.`);
  console.log(`Report: ${path.relative(WEB_ROOT, outputPath)}`);
  if (!summary.productionReady) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
