import assert from "node:assert/strict";
import test from "node:test";
import {
  GUIDE_SESSION_STORAGE_KEY,
  classifyLocationAccuracy,
  createGuideSession,
  createGuideSessionPlanBinding,
  createRoutePlanValidationFingerprint,
  matchGuideSessionContext,
  parseGuideSession,
  readGuideSession,
  transitionGuideSession,
  writeGuideSession,
} from "../src/lib/guide-session-store.ts";

const stops = ["guoen-temple", "huineng-residence", "longshan-spring"];
const startTime = new Date("2026-08-15T02:00:00.000Z");
const planSeed = {
  id: "plan-session-binding",
  revision: 3,
  validation: {
    status: "BLOCKED",
    demoEligible: true,
    revision: 3,
    checkedAt: "2026-08-15T01:50:00.000Z",
    issues: [
      { code: "UNPUBLISHED_ENTRY", severity: "BLOCKING", message: "尚无正式入口数据。" },
      { code: "UNVERIFIED_ROUTE", severity: "BLOCKING", message: "候选道路未经现场复走。" },
    ],
  },
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test("guide session starts at revision one and stores only route progress", () => {
  const session = createGuideSession(stops, { now: startTime });
  assert.deepEqual(session, {
    version: 2,
    routeSignature: stops.join(","),
    stopIds: stops,
    routeMode: "LEGACY_STOPS",
    planId: null,
    planRevision: null,
    validationCheckedAt: null,
    validationFingerprint: null,
    status: "ACTIVE",
    currentIndex: 0,
    revision: 1,
    endReason: null,
    updatedAt: startTime.toISOString(),
  });
  const serialized = JSON.stringify(session);
  assert.equal(/longitude|latitude|accuracy|position/i.test(serialized), false);
  assert.deepEqual(parseGuideSession(structuredClone(session)), session);
});

test("pause, resume and arrival advance revision monotonically", () => {
  let session = createGuideSession(stops, { now: startTime });
  session = transitionGuideSession(session, { type: "PAUSE" }, new Date("2026-08-15T02:01:00.000Z"));
  assert.equal(session.status, "PAUSED");
  assert.equal(session.revision, 2);
  session = transitionGuideSession(session, { type: "RESUME" }, new Date("2026-08-15T02:02:00.000Z"));
  session = transitionGuideSession(session, { type: "ARRIVE" }, new Date("2026-08-15T02:03:00.000Z"));
  assert.equal(session.status, "ACTIVE");
  assert.equal(session.currentIndex, 1);
  assert.equal(session.revision, 4);
});

test("route completion and early ending share COMPLETED while preserving distinct end reasons", () => {
  let completed = createGuideSession(["guoen-temple"], { now: startTime });
  completed = transitionGuideSession(completed, { type: "ARRIVE" }, new Date("2026-08-15T02:01:00.000Z"));
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.endReason, "route_completed");
  assert.throws(() => transitionGuideSession(completed, { type: "RESUME" }), /invalid_guide_transition/);

  let ended = createGuideSession(stops, { now: startTime });
  ended = transitionGuideSession(ended, { type: "END_EARLY" }, new Date("2026-08-15T02:01:00.000Z"));
  assert.equal(ended.status, "COMPLETED");
  assert.equal(ended.endReason, "ended_early");
  const restarted = transitionGuideSession(ended, { type: "RESTART" }, new Date("2026-08-15T02:02:00.000Z"));
  assert.equal(restarted.status, "ACTIVE");
  assert.equal(restarted.currentIndex, 0);
  assert.equal(restarted.revision, 3);
});

test("session parser fails closed on impossible states and unknown fields", () => {
  const session = createGuideSession(stops, { now: startTime });
  assert.equal(parseGuideSession({ ...session, extra: true }), null);
  assert.equal(parseGuideSession({ ...session, currentIndex: 99 }), null);
  assert.equal(parseGuideSession({ ...session, status: "COMPLETED", endReason: null }), null);
  assert.equal(parseGuideSession({ ...session, routeSignature: "different" }), null);
  assert.equal(parseGuideSession({ ...session, revision: 0 }), null);
  assert.equal(parseGuideSession({ ...session, routeMode: "ROUTE_PLAN" }), null);
});

test("RoutePlan binding rejects restore when revision or validation changes despite identical stops", () => {
  const binding = createGuideSessionPlanBinding(planSeed);
  assert.match(binding.validationFingerprint, /^rpv1-[a-f0-9]{8}$/);
  const session = createGuideSession(stops, { now: startTime, planBinding: binding });
  assert.equal(session.routeMode, "ROUTE_PLAN");
  assert.deepEqual(matchGuideSessionContext(session, stops, binding), { ok: true });

  const revisedPlan = { ...planSeed, revision: 4, validation: { ...planSeed.validation, revision: 4 } };
  const revisedBinding = createGuideSessionPlanBinding(revisedPlan);
  const mismatch = matchGuideSessionContext(session, stops, revisedBinding);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "PLAN_BINDING_CHANGED");
  assert.match(mismatch.error, /站序相同.*旧会话也不会恢复/);

  const revalidatedPlan = {
    ...planSeed,
    validation: { ...planSeed.validation, checkedAt: "2026-08-15T01:55:00.000Z" },
  };
  assert.notEqual(createRoutePlanValidationFingerprint(revalidatedPlan), binding.validationFingerprint);
  assert.equal(matchGuideSessionContext(session, stops, createGuideSessionPlanBinding(revalidatedPlan)).ok, false);
  assert.equal(matchGuideSessionContext(session, [...stops].reverse(), binding).reason, "ROUTE_CHANGED");
});

test("legacy stops sessions remain compatible only with legacy demos", () => {
  const legacy = createGuideSession(stops, { now: startTime });
  assert.deepEqual(matchGuideSessionContext(legacy, stops, null), { ok: true });
  const mismatch = matchGuideSessionContext(legacy, stops, createGuideSessionPlanBinding(planSeed));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "PLAN_BINDING_CHANGED");
});

test("storage round-trip restores a valid paused session and reports write failures honestly", () => {
  const storage = memoryStorage();
  const paused = transitionGuideSession(createGuideSession(stops, { now: startTime }), { type: "PAUSE" }, new Date("2026-08-15T02:01:00.000Z"));
  assert.deepEqual(writeGuideSession(paused, storage), { ok: true });
  assert.deepEqual(readGuideSession(storage), { record: paused, error: null });
  assert.equal(storage.values.has(GUIDE_SESSION_STORAGE_KEY), true);

  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.match(readGuideSession(throwingStorage).error, /读取.*失败/);
  const failedWrite = writeGuideSession(paused, throwingStorage);
  assert.equal(failedWrite.ok, false);
  assert.match(failedWrite.error, /状态没有推进/);
});

test("location accuracy never promotes low or invalid fixes to reliable distance", () => {
  assert.equal(classifyLocationAccuracy(18), "reliable_for_rough_distance");
  assert.equal(classifyLocationAccuracy(100), "reliable_for_rough_distance");
  assert.equal(classifyLocationAccuracy(100.1), "low_accuracy");
  assert.equal(classifyLocationAccuracy(-1), "invalid");
  assert.equal(classifyLocationAccuracy(Number.NaN), "invalid");
});
