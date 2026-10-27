import assert from "node:assert/strict";
import test from "node:test";

process.env.AI_GUIDE_DISABLE_REMOTE = "1";

const { answerGuideQuestion } = await import("../src/lib/ai-guide/service.server.ts");
const { getGuideSpotStory, isGuideKnowledgeItem } = await import("../src/lib/ai-guide/knowledge.ts");
const { AI_GUIDE_FACT_TYPES, parseAIGuideAnswer, parseAIGuideRequest } = await import("../src/lib/ai-guide/types.ts");
const { evaluateRemoteGuideCapability } = await import("../src/lib/ai-guide/gemini.server.ts");

function citedIds(answer) {
  return [...answer.matchAll(/\[([A-Z0-9-]+)\]/g)].map((match) => match[1]);
}

function assertCitationsResolve(result) {
  const sourceIds = new Set(result.sources.map(({ id }) => id));
  const citations = citedIds(result.answer);
  assert.ok(citations.length > 0, "answer must include at least one source marker");
  for (const id of citations) assert.ok(sourceIds.has(id), `citation ${id} must resolve to a returned source`);
}

function assertClaimsResolve(result) {
  const sourcesById = new Map(result.sources.map((source) => [source.id, source]));
  assert.ok(result.claims.length > 0, "answer must expose at least one source-grounded claim");
  for (const claim of result.claims) {
    assert.ok(claim.sourceIds.length > 0);
    for (const id of claim.sourceIds) {
      assert.ok(sourcesById.has(id), `claim source ${id} must resolve`);
      assert.ok(claim.text.includes(`[${id}]`), `claim source ${id} must be visible in the claim text`);
    }
    const citedFactTypes = new Set(claim.sourceIds.map((id) => sourcesById.get(id)?.factType));
    assert.ok(claim.factTypes.every((factType) => citedFactTypes.has(factType)), "claim fact types must be supported by its cited sources");
  }
}

test("local AI guide returns a source-grounded cultural answer", async () => {
  const result = await answerGuideQuestion("国恩寺是什么文保单位？");
  assert.equal(result.provider, "local-knowledge");
  assert.equal(result.verification, "verified-context");
  assert.equal(result.refused, false);
  assert.deepEqual(result.factTypes, ["historical_record"]);
  assert.ok(result.sources.some(({ id, evidenceLevel }) => id === "LZ-003" && evidenceLevel === "A"));
  assert.ok(result.sources.every(({ reviewStatus, sourceStatus }) => reviewStatus === "PROJECT_SOURCE_CHECKED" && sourceStatus === "OFFICIAL_PRIMARY"));
  assert.match(result.answer, /全国重点文物保护单位/);
  assertCitationsResolve(result);
  assertClaimsResolve(result);
  assert.deepEqual(parseAIGuideAnswer(result), result);
});

test("spot context retrieves local knowledge without inventing live facts", async () => {
  const result = await answerGuideQuestion("请介绍这个景点", "guoen-temple");
  assert.equal(result.refused, false);
  assert.ok(result.sources.some(({ id }) => id === "LZ-003"));
  assertCitationsResolve(result);
  assertClaimsResolve(result);
});

test("dynamic, route and safety questions are explicitly refused", async () => {
  for (const question of ["今天几点开放？", "从入口怎么走？", "现在停车位多吗？", "轮椅路线安全吗？"]) {
    const result = await answerGuideQuestion(question);
    assert.equal(result.provider, "local-knowledge");
    assert.equal(result.verification, "limited");
    assert.equal(result.refused, true);
    assert.deepEqual(result.factTypes, ["realtime_status"]);
    assert.deepEqual(result.sources.map(({ id }) => id), ["BOUNDARY-2026-08-14"]);
    assert.match(result.answer, /目前不能确认/);
    assert.match(result.answer, /现场最新公告或工作人员答复/);
    assertCitationsResolve(result);
    assertClaimsResolve(result);
  }
});

test("unsupported knowledge questions fail closed", async () => {
  const result = await answerGuideQuestion("附近有什么咖啡豆值得购买？");
  assert.equal(result.refused, true);
  assert.equal(result.verification, "limited");
  assert.deepEqual(result.factTypes, []);
  assert.deepEqual(result.sources.map(({ id }) => id), ["BOUNDARY-2026-08-14"]);
  assert.match(result.answer, /不会根据模型记忆补写/);
  assertCitationsResolve(result);
  assertClaimsResolve(result);
});

test("legend answers remain visibly typed as legend rather than history", async () => {
  const result = await answerGuideQuestion("六祖传说为什么是民间文学？");
  assert.equal(result.refused, false);
  assert.deepEqual(result.factTypes, ["local_legend"]);
  assert.ok(result.sources.every(({ factType }) => factType === "local_legend"));
  assert.match(result.answer, /不能写成已经由史料证实的事件/);
});

test("unknown fact types fail closed at knowledge and response boundaries", async () => {
  const valid = await answerGuideQuestion("国恩寺是什么文保单位？");
  assert.equal(parseAIGuideAnswer({ ...valid, factTypes: ["invented_history"] }), null);
  assert.equal(parseAIGuideAnswer({ ...valid, claims: [] }), null);
  assert.equal(parseAIGuideAnswer({ ...valid, claims: [{ ...valid.claims[0], sourceIds: ["UNREGISTERED"] }] }), null);
  assert.equal(parseAIGuideAnswer({
    ...valid,
    claims: [{ ...valid.claims[0], text: "来源标记不可见的声明。" }],
  }), null);
  assert.equal(parseAIGuideAnswer({
    ...valid,
    claims: [{ ...valid.claims[0], factTypes: ["local_legend"] }],
  }), null);
  assert.equal(parseAIGuideAnswer({
    ...valid,
    sources: valid.sources.map((source) => ({ ...source, factType: "creative_fiction" })),
  }), null);
  assert.equal(isGuideKnowledgeItem({
    id: "invalid-item",
    factType: "creative_fiction",
    keywords: ["测试"],
    safeAnswer: "无效",
    context: "无效",
    sources: valid.sources,
  }), false);
  assert.deepEqual(AI_GUIDE_FACT_TYPES, [
    "official_current",
    "historical_record",
    "religious_tradition",
    "local_legend",
    "interpretation",
    "marketing_claim",
    "ugc_experience",
    "realtime_status",
  ]);
});

test("remote Gemini adapter remains disabled without every supplier, quality and persistent-limit gate", () => {
  assert.deepEqual(evaluateRemoteGuideCapability({ GEMINI_API_KEY: "development-key-not-used" }), {
    state: "DISABLED",
    reason: "REMOTE_DISABLED",
  });
  assert.deepEqual(evaluateRemoteGuideCapability({
    AI_GUIDE_REMOTE_ENABLED: "1",
    GEMINI_API_KEY: "development-key-not-used",
  }), { state: "DISABLED", reason: "QUALITY_GATE_MISSING" });
  assert.deepEqual(evaluateRemoteGuideCapability({
    AI_GUIDE_REMOTE_ENABLED: "1",
    AI_GUIDE_REMOTE_QUALITY_GATE: "PASS",
    AI_GUIDE_REMOTE_DPA_APPROVED: "1",
    AI_GUIDE_REMOTE_PERSISTENT_RATE_LIMIT: "1",
    GEMINI_API_KEY: "development-key-not-used",
  }), { state: "ENABLED", apiKey: "development-key-not-used" });
});

test("every visitor spot story exposes a valid fact type and review/source status", () => {
  for (const spotId of ["guoen-temple", "huineng-residence", "zangfo-valley", "longshan-spring", "chanyu-town"]) {
    const story = getGuideSpotStory(spotId);
    assert.ok(story, `${spotId} must have a governed story disclosure`);
    assert.ok(story.factTypes.length > 0);
    assert.ok(story.sources.length > 0);
    assert.ok(story.sources.every(({ factType, reviewStatus, sourceStatus }) =>
      AI_GUIDE_FACT_TYPES.includes(factType) &&
      ["PROJECT_SOURCE_CHECKED", "PROJECT_BOUNDARY_ONLY"].includes(reviewStatus) &&
      ["OFFICIAL_PRIMARY", "PROJECT_INTERNAL"].includes(sourceStatus)));
  }
  assert.equal(getGuideSpotStory("unknown-spot"), null);
});

test("remote assistance is explicit, one-request data and unknown fields fail closed", () => {
  assert.deepEqual(parseAIGuideRequest({ question: "  国恩寺是什么？  " }), { question: "国恩寺是什么？", allowRemote: false });
  assert.deepEqual(parseAIGuideRequest({ question: "国恩寺是什么？", spotId: "guoen-temple", allowRemote: true }), {
    question: "国恩寺是什么？",
    spotId: "guoen-temple",
    allowRemote: true,
  });
  assert.equal(parseAIGuideRequest({ question: "国恩寺是什么？", allowRemote: "yes" }), null);
  assert.equal(parseAIGuideRequest({ question: "国恩寺是什么？", allowRemote: false, privateJourney: "x" }), null);
});
