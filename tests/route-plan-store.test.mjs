import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { analyzeItineraryText, extractItineraryCandidates } from "../src/lib/itinerary-extract/local.ts";
import {
  ROUTE_PLAN_STORAGE_KEY,
  createRoutePlanSnapshot,
  parseRoutePlan,
  parseRoutePlanStore,
  readRoutePlan,
  resolveRoutePlanStops,
  saveRoutePlan,
} from "../src/lib/route-plan-store.ts";
import { scenicSpots } from "../src/lib/scenic-data.ts";

const now = "2026-08-15T08:00:00.000Z";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function resolveIssue(issue) {
  if (issue.type === "DWELL_TIME") {
    return {
      ...issue,
      status: "RESOLVED",
      resolution: { method: "VALUE_PROVIDED", value: "45 分钟", reason: "游客明确填写。", resolvedAt: now },
    };
  }
  if (issue.type === "TIME_WINDOW") {
    return {
      ...issue,
      status: "RESOLVED",
      resolution: { method: "VALUE_PROVIDED", value: "09:00–11:00", reason: "游客明确填写。", resolvedAt: now },
    };
  }
  return {
    ...issue,
    status: "IGNORED",
    resolution: { method: "EXPLICITLY_IGNORED", value: "", reason: "游客确认本机演示不处理此项。", resolvedAt: now },
  };
}

function createSnapshot({ resolved = true } = {}) {
  const sourceText = "上午先去国恩寺停留一小时，之后到龙山温泉休息，再去神秘花园吃午饭。我们带着长辈，希望少走路。";
  const candidates = extractItineraryCandidates(sourceText);
  const analysis = analyzeItineraryText(sourceText, candidates.stops, candidates.ambiguities);
  const extractedStops = candidates.stops.map((stop) => stop.id === "longshan-spring" && resolved ? { ...stop, dwellMinutes: 45 } : stop);
  const extraction = {
    requestId: "request-route-plan-test",
    mode: "LOCAL_RULES",
    status: "REVIEW_REQUIRED",
    stops: extractedStops,
    ambiguities: candidates.ambiguities,
    ...analysis,
    unresolved: resolved ? analysis.unresolved.map(resolveIssue) : analysis.unresolved,
    warnings: ["测试警告"],
  };
  const stops = extractedStops.map((stop) => ({
    ...stop,
    verification: scenicSpots.find(({ id }) => id === stop.id).verification,
    includedInDemo: stop.eligibleForRoute,
  }));
  return createRoutePlanSnapshot(
    { title: "有证据的候选行程", transport: "步行优先（需核验）", sourceText, extraction, stops },
    now,
  );
}

function createAmbiguousSnapshot({ resolved = false, excluded = false } = {}) {
  const sourceText = "上午想去六祖故里看看。";
  const candidates = extractItineraryCandidates(sourceText);
  const analysis = analyzeItineraryText(sourceText, candidates.stops, candidates.ambiguities);
  const ambiguity = candidates.ambiguities[0];
  const selected = ambiguity.candidates[0];
  const spot = scenicSpots.find(({ id }) => id === selected.id);
  const stops = excluded || !resolved ? [] : [{
    id: spot.id,
    name: spot.name,
    verification: spot.verification,
    evidence: ambiguity.evidence,
    start: ambiguity.start,
    end: ambiguity.end,
    dwellMinutes: 45,
    confidence: "FUZZY",
    eligibleForRoute: selected.eligibleForRoute,
    includedInDemo: selected.eligibleForRoute,
    reviewNote: selected.reviewNote,
  }];
  const extraction = {
    requestId: "request-ambiguity-test",
    mode: "LOCAL_RULES",
    status: "REVIEW_REQUIRED",
    stops: [],
    ambiguities: candidates.ambiguities,
    ...analysis,
    unresolved: resolved ? analysis.unresolved.map(resolveIssue) : analysis.unresolved,
    warnings: ["测试警告"],
  };
  const ambiguityResolutions = !resolved ? [] : [{
    ambiguityId: ambiguity.id,
    evidence: ambiguity.evidence,
    start: ambiguity.start,
    end: ambiguity.end,
    decision: excluded ? "EXCLUDED" : "SELECTED",
    selectedCandidateId: excluded ? null : selected.id,
    reason: excluded ? "游客确认这只是主题表达。" : "游客明确确认指向国恩寺。",
    resolvedAt: now,
  }];
  return createRoutePlanSnapshot(
    { title: "消歧候选行程", transport: "自驾/网约车", sourceText, extraction, stops, ambiguityResolutions },
    now,
  );
}

afterEach(() => {
  delete globalThis.window;
});

test("fully resolved RoutePlan preserves evidence, audit decisions and demo eligibility", () => {
  const result = createSnapshot();
  assert.equal(result.ok, true);
  const { plan } = result;

  assert.equal(plan.schemaVersion, 2);
  assert.equal(plan.revision, 1);
  assert.equal(plan.validation.status, "BLOCKED");
  assert.equal(plan.validation.demoEligible, true);
  assert.equal(plan.stops[0].dwellMinutes, 60);
  assert.equal(plan.stops[0].confidence, "EXPLICIT");
  assert.equal(plan.sourceText.slice(plan.stops[0].start, plan.stops[0].end), plan.stops[0].evidence);
  assert.ok(plan.unrecognizedFragments.some(({ text }) => text.includes("神秘花园")));
  assert.ok(plan.unresolved.some(({ type, status }) => type === "TIME_WINDOW" && status === "RESOLVED"));
  assert.ok(plan.unresolved.some(({ type, status }) => type === "DWELL_TIME" && status === "RESOLVED"));
  assert.ok(plan.unresolved.some(({ type, status }) => type === "ACTION_CONSTRAINT" && status === "IGNORED"));
  assert.ok(plan.unresolved.some(({ type, status }) => type === "UNKNOWN_FRAGMENT" && status === "IGNORED"));
  assert.ok(!plan.validation.issues.some(({ code }) => code === "UNRESOLVED_INPUT"));
  assert.ok(plan.validation.issues.some(({ code }) => code === "UNPUBLISHED_ENTRY"));
  assert.ok(plan.validation.issues.some(({ code }) => code === "UNVERIFIED_ROUTE"));
});

test("every unresolved blocking type prevents a demoEligible snapshot and guide start", () => {
  const result = createSnapshot({ resolved: false });
  assert.equal(result.ok, true);
  const { plan } = result;
  assert.equal(plan.validation.demoEligible, false);
  assert.deepEqual(new Set(plan.unresolved.map(({ type }) => type)), new Set(["DWELL_TIME", "TIME_WINDOW", "ACTION_CONSTRAINT", "UNKNOWN_FRAGMENT"]));
  assert.ok(plan.unresolved.every(({ blocking, status, resolution }) => blocking && status === "UNRESOLVED" && resolution === null));
  assert.ok(plan.validation.issues.some(({ code, severity }) => code === "UNRESOLVED_INPUT" && severity === "BLOCKING"));
  const guide = resolveRoutePlanStops(plan, scenicSpots.map(({ id }) => id));
  assert.equal(guide.ok, false);
  assert.match(guide.error, /未解决输入/);
});

test("ambiguous source requires an explicit selected or excluded audit decision", () => {
  const pending = createAmbiguousSnapshot();
  assert.equal(pending.ok, true);
  assert.equal(pending.plan.ambiguities[0].candidates.length, 2);
  assert.equal(pending.plan.ambiguityResolutions.length, 0);
  assert.equal(pending.plan.validation.demoEligible, false);

  const selected = createAmbiguousSnapshot({ resolved: true });
  assert.equal(selected.ok, true);
  assert.equal(selected.plan.validation.demoEligible, true);
  assert.equal(selected.plan.ambiguityResolutions[0].decision, "SELECTED");
  assert.equal(selected.plan.stops[0].confidence, "FUZZY");
  assert.equal(selected.plan.sourceText.slice(selected.plan.ambiguityResolutions[0].start, selected.plan.ambiguityResolutions[0].end), selected.plan.ambiguityResolutions[0].evidence);

  const excluded = createAmbiguousSnapshot({ resolved: true, excluded: true });
  assert.equal(excluded.ok, true);
  assert.equal(excluded.plan.ambiguityResolutions[0].decision, "EXCLUDED");
  assert.equal(excluded.plan.validation.demoEligible, false, "excluding the only candidate resolves the ambiguity but cannot invent a demo stop");
  assert.ok(excluded.plan.validation.issues.some(({ code }) => code === "NO_DEMO_STOPS"));
});

test("RoutePlan persists locally and is retrieved only by planId", () => {
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  const result = createSnapshot();
  assert.equal(result.ok, true);

  assert.deepEqual(saveRoutePlan(result.plan), { ok: true });
  assert.equal(JSON.parse(storage.getItem(ROUTE_PLAN_STORAGE_KEY)).version, 2);
  assert.deepEqual(readRoutePlan(result.plan.id), { plan: result.plan, error: null });
  assert.match(readRoutePlan("plan-missing").error, /没有在这台设备上找到/);
});

test("strict parser rejects altered evidence, resolution spans and foreign references", () => {
  const resolved = createSnapshot();
  assert.equal(resolved.ok, true);
  assert.equal(parseRoutePlan({ ...resolved.plan, unexpected: true }), null);
  assert.equal(parseRoutePlan({ ...resolved.plan, stops: [{ ...resolved.plan.stops[0], evidence: "伪造证据" }, ...resolved.plan.stops.slice(1)] }), null);
  assert.equal(parseRoutePlan({ ...resolved.plan, unresolved: [{ ...resolved.plan.unresolved[0], start: resolved.plan.unresolved[0].start + 1 }, ...resolved.plan.unresolved.slice(1)] }), null);
  assert.equal(parseRoutePlan({ ...resolved.plan, unresolved: [{ ...resolved.plan.unresolved[0], stopId: "unknown-stop" }, ...resolved.plan.unresolved.slice(1)] }), null);

  const ambiguous = createAmbiguousSnapshot({ resolved: true });
  assert.equal(ambiguous.ok, true);
  assert.equal(parseRoutePlan({
    ...ambiguous.plan,
    ambiguityResolutions: [{ ...ambiguous.plan.ambiguityResolutions[0], evidence: "伪造证据" }],
  }), null);
  assert.equal(parseRoutePlan({
    ...ambiguous.plan,
    ambiguityResolutions: [{ ...ambiguous.plan.ambiguityResolutions[0], selectedCandidateId: "unknown-stop" }],
  }), null);
  assert.equal(parseRoutePlan({ ...ambiguous.plan, ambiguityResolutions: [] }), null, "a FUZZY stop cannot exist without its explicit selection audit");
});

test("version 1 snapshots migrate in memory and unresolved legacy input is downgraded", () => {
  const result = createSnapshot({ resolved: false });
  assert.equal(result.ok, true);
  const legacy = {
    ...result.plan,
    schemaVersion: 1,
    unresolved: result.plan.unresolved.map((issue) => {
      const legacyIssue = { ...issue };
      delete legacyIssue.blocking;
      delete legacyIssue.resolution;
      return legacyIssue;
    }),
  };
  delete legacy.ambiguities;
  delete legacy.ambiguityResolutions;
  legacy.validation = { ...legacy.validation, demoEligible: true };

  const migrated = parseRoutePlan(legacy);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.validation.demoEligible, false);
  assert.ok(migrated.unresolved.every(({ blocking, resolution }) => blocking && resolution === null));

  const store = parseRoutePlanStore({ version: 1, plans: [legacy], updatedAt: now });
  assert.ok(store);
  assert.equal(store.version, 2);
  assert.equal(store.plans[0].schemaVersion, 2);
});

test("guide stop resolution fails closed for unknown ids and never falls back", () => {
  const result = createSnapshot();
  assert.equal(result.ok, true);
  const known = scenicSpots.map(({ id }) => id);
  const valid = resolveRoutePlanStops(result.plan, known);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.stops.map(({ id }) => id), ["guoen-temple", "longshan-spring"]);

  const foreign = {
    ...result.plan,
    stops: [{ ...result.plan.stops[0], id: "unknown-stop", includedInDemo: true }, ...result.plan.stops.slice(1)],
  };
  const rejected = resolveRoutePlanStops(foreign, known);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /无法识别的站点/);
});
