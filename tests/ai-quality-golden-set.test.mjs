import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.AI_GUIDE_DISABLE_REMOTE = "1";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "tests", "fixtures", "ai-guide-golden-set.v1.json");
const summaryPath = path.join(projectRoot, "test-results", "ai-quality-summary.json");
const fixtureRaw = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(fixtureRaw);
const { answerGuideQuestion } = await import("../src/lib/ai-guide/service.server.ts");

function evaluateCase(definition, answer) {
  const failures = [];
  const sourceIds = answer.sources.map((source) => source.id);
  const sourceFactTypes = answer.sources.map((source) => source.factType);
  const citedIds = [...answer.answer.matchAll(/\[([A-Z0-9-]+)\]/g)].map((match) => match[1]);

  if (answer.provider !== "local-knowledge") failures.push(`provider=${answer.provider}`);
  if (answer.refused !== definition.expected.refused) failures.push(`refused=${answer.refused}`);
  if (answer.verification !== definition.expected.verification) failures.push(`verification=${answer.verification}`);
  for (const sourceId of definition.expected.requiredSourceIds) {
    if (!sourceIds.includes(sourceId)) failures.push(`missing_source=${sourceId}`);
  }
  for (const factType of definition.expected.requiredAnswerFactTypes) {
    if (!answer.factTypes.includes(factType)) failures.push(`missing_answer_fact_type=${factType}`);
  }
  for (const factType of definition.expected.requiredSourceFactTypes) {
    if (!sourceFactTypes.includes(factType)) failures.push(`missing_source_fact_type=${factType}`);
  }
  for (const factType of definition.expected.forbiddenAnswerFactTypes ?? []) {
    if (answer.factTypes.includes(factType)) failures.push(`forbidden_answer_fact_type=${factType}`);
  }
  for (const phrase of definition.expected.answerIncludes) {
    if (!answer.answer.includes(phrase)) failures.push(`missing_phrase=${phrase}`);
  }
  if (citedIds.length === 0) failures.push("missing_citation_marker");
  for (const citedId of citedIds) {
    if (!sourceIds.includes(citedId)) failures.push(`unresolved_citation=${citedId}`);
  }

  return {
    id: definition.id,
    category: definition.category,
    passed: failures.length === 0,
    failures,
    refused: answer.refused,
    verification: answer.verification,
    provider: answer.provider,
    sourceIds,
    answerFactTypes: answer.factTypes,
    sourceFactTypes,
  };
}

test("versioned AI GoldenSet passes every groundedness and refusal case", async () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.remoteModelAllowed, false);
  assert.match(fixture.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 6);
  assert.equal(new Set(fixture.cases.map((item) => item.id)).size, fixture.cases.length);

  const results = [];
  for (const definition of fixture.cases) {
    const answer = await answerGuideQuestion(definition.question);
    results.push(evaluateCase(definition, answer));
  }

  const failed = results.filter((result) => !result.passed);
  const summary = {
    schemaVersion: 1,
    goldenSetId: fixture.goldenSetId,
    goldenSetVersion: fixture.version,
    fixtureSha256: createHash("sha256").update(fixtureRaw).digest("hex"),
    generatedAt: new Date().toISOString(),
    remoteModelUsed: false,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    outcome: failed.length === 0 ? "PASS" : "BLOCK",
    cases: results,
  };
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`AI_GOLDEN_SET_SUMMARY=${JSON.stringify({
    version: summary.goldenSetVersion,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    outcome: summary.outcome,
  })}\n`);

  assert.deepEqual(failed, [], `GoldenSet blocked release; see ${summaryPath}`);
});
