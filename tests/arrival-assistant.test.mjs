import assert from "node:assert/strict";
import test from "node:test";
import {
  ARRIVAL_EVIDENCE,
  ARRIVAL_MODES,
  ARRIVAL_PLANS,
  ARRIVAL_SCOPE,
  getArrivalEvidence,
  getArrivalPlan,
} from "../src/lib/arrival-assistant.ts";

test("every arrival mode has a complete, evidence-backed plan", () => {
  for (const mode of ARRIVAL_MODES) {
    const plan = ARRIVAL_PLANS[mode];
    assert.equal(plan.mode, mode);
    assert.ok(plan.steps.length >= 3);
    assert.ok(plan.confirmToday.length >= 4);
    assert.ok(getArrivalEvidence(plan).length >= 2);
  }
});

test("arrival sources are unique, dated, linked, and explicitly limited", () => {
  assert.equal(new Set(ARRIVAL_EVIDENCE.map((item) => item.id)).size, ARRIVAL_EVIDENCE.length);
  for (const source of ARRIVAL_EVIDENCE) {
    assert.match(source.id, /^LZ-\d{3}$/);
    assert.match(source.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.statement.length > 20);
    assert.ok(source.limitation.length > 20);
  }
});

test("invalid arrival modes fail closed", () => {
  assert.equal(getArrivalPlan("rail")?.mode, "rail");
  assert.equal(getArrivalPlan("flight"), null);
  assert.equal(getArrivalPlan(""), null);
});

test("core and extended scopes never overlap", () => {
  const core = new Set(ARRIVAL_SCOPE.core.places);
  assert.equal(ARRIVAL_SCOPE.extended.places.some((place) => core.has(place)), false);
  assert.match(ARRIVAL_SCOPE.core.note, /不是.*正式边界/);
  assert.match(ARRIVAL_SCOPE.extended.note, /不能默认连续步行/);
});

test("plans do not make live availability or navigation promises", () => {
  const serialized = JSON.stringify(ARRIVAL_PLANS);
  assert.doesNotMatch(serialized, /实时班次|实时余位|已经开放|正式入口导航/);
  assert.match(serialized, /不能代替入口|不能代替入口|不能代替入口/);
});
