import assert from "node:assert/strict";
import test from "node:test";

const { analyzeItineraryText, extractItineraryCandidates, extractKnownStops } = await import("../src/lib/itinerary-extract/local.ts");
const { extractWithGemini, validateModelStops } = await import("../src/lib/itinerary-extract/gemini.server.ts");
const { extractItinerary } = await import("../src/lib/itinerary-extract/service.server.ts");

test("itinerary extraction preserves source order and exact evidence", () => {
  const text = "上午先到六祖故居停留35分钟，之后去国恩寺待一小时，午后到龙山温泉休息。";
  const stops = extractKnownStops(text);

  assert.deepEqual(stops.map(({ id }) => id), ["huineng-residence", "guoen-temple", "longshan-spring"]);
  assert.equal(stops[0].confidence, "ALIAS");
  assert.equal(stops[0].dwellMinutes, 35);
  assert.equal(stops[1].dwellMinutes, 60);
  assert.equal(stops[2].dwellMinutes, null);
  for (const stop of stops) {
    assert.equal(text.slice(stop.start, stop.end), stop.evidence, `${stop.id} evidence offsets must be exact`);
  }
});

test("unknown place names are never invented", () => {
  const stops = extractKnownStops("上午去一个没有登记的神秘景点，再吃午饭。 ");
  assert.deepEqual(stops, []);
});

test("fuzzy place language returns every grounded candidate and never silently selects one", () => {
  const text = "上午想去六祖故里看看。";
  const result = extractItineraryCandidates(text);

  assert.deepEqual(result.stops, []);
  assert.equal(result.ambiguities.length, 1);
  assert.deepEqual(result.ambiguities[0].candidates.map(({ id }) => id), ["guoen-temple", "huineng-residence"]);
  assert.equal(result.ambiguities[0].status, "UNRESOLVED");
  assert.equal(text.slice(result.ambiguities[0].start, result.ambiguities[0].end), result.ambiguities[0].evidence);

  const analysis = analyzeItineraryText(text, result.stops, result.ambiguities);
  assert.deepEqual(analysis.unrecognizedFragments, [], "a known ambiguity must not also be mislabeled as an unknown place");
});

test("unverified Zangfo valley candidate is blocked from route execution", () => {
  const stop = extractKnownStops("六祖故居停留35分钟，再去藏佛坑看看。 ").find(({ id }) => id === "zangfo-valley");
  assert.ok(stop);
  assert.equal(stop.id, "zangfo-valley");
  assert.equal(stop.eligibleForRoute, false);
  assert.equal(stop.dwellMinutes, null, "a duration from the prior stop must not leak or fall back to a guessed default");
  assert.match(stop.reviewNote, /不能进入自动执行路线/);
});

test("time windows, action constraints and unknown activities remain unresolved", () => {
  const text = "上午到国恩寺停留一小时，之后去神秘花园吃午饭。带着长辈，希望少走路。";
  const stops = extractKnownStops(text);
  const analysis = analyzeItineraryText(text, stops);

  assert.equal(stops.length, 1);
  assert.equal(stops[0].dwellMinutes, 60);
  assert.deepEqual(analysis.unrecognizedFragments.map(({ text: fragment }) => fragment), ["之后去神秘花园吃午饭"]);
  assert.ok(analysis.unresolved.some(({ type, evidence }) => type === "TIME_WINDOW" && evidence === "上午"));
  assert.ok(analysis.unresolved.some(({ type, evidence }) => type === "ACTION_CONSTRAINT" && evidence.includes("长辈")));
  assert.ok(analysis.unresolved.some(({ type }) => type === "UNKNOWN_FRAGMENT"));
  for (const issue of analysis.unresolved) {
    assert.equal(text.slice(issue.start, issue.end), issue.evidence);
    assert.equal(issue.blocking, true);
    assert.equal(issue.status, "UNRESOLVED");
    assert.equal(issue.resolution, null);
  }
});

test("grounded model selection cannot replace exact evidence offsets or invent dwell time", () => {
  const text = "下午到龙山温泉休息。";
  const stops = validateModelStops(text, [{ id: "longshan-spring", evidence: "龙山温泉", dwellMinutes: 180 }]);
  assert.ok(stops);
  assert.equal(stops[0].dwellMinutes, null);
  assert.equal(text.slice(stops[0].start, stops[0].end), stops[0].evidence);
  assert.equal(stops[0].evidence, "下午到龙山温泉休息");
});

test("an alias that is part of a longer canonical name is not duplicated", () => {
  const stops = extractKnownStops("下午去龙山温泉休息。 ");
  assert.deepEqual(stops.map(({ id }) => id), ["longshan-spring"]);
});

test("full travel notes never leave the device unless remote extraction is explicitly enabled", async () => {
  const previousEnabled = process.env.ITINERARY_EXTRACT_REMOTE_ENABLED;
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.ITINERARY_EXTRACT_REMOTE_ENABLED;
  process.env.GEMINI_API_KEY = "test-key-that-must-not-be-used";
  try {
    assert.equal(await extractWithGemini("上午去国恩寺。"), undefined);
  } finally {
    if (previousEnabled === undefined) delete process.env.ITINERARY_EXTRACT_REMOTE_ENABLED;
    else process.env.ITINERARY_EXTRACT_REMOTE_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("server environment switch alone cannot send a travel note without per-request consent", async () => {
  const previousEnabled = process.env.ITINERARY_EXTRACT_REMOTE_ENABLED;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.ITINERARY_EXTRACT_REMOTE_ENABLED = "1";
  process.env.GEMINI_API_KEY = "test-key-that-must-not-be-used";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("remote_fetch_must_not_run");
  };
  try {
    const result = await extractItinerary("上午去国恩寺停留一小时。", "request-no-consent", false);
    assert.equal(fetchCalls, 0);
    assert.equal(result.mode, "LOCAL_RULES");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.ITINERARY_EXTRACT_REMOTE_ENABLED;
    else process.env.ITINERARY_EXTRACT_REMOTE_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
