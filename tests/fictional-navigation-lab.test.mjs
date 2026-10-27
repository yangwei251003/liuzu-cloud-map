import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FICTIONAL_LAB_CLOCK,
  assessFictionalLocationSample,
  calculateFictionalNavigationProgress,
  getDestinationClosureEdgeIds,
  getFictionalLabTopology,
  getFictionalVisualPosition,
  planFictionalLabRoute,
  updateFictionalDeviationHysteresis,
} from "../src/lib/fictional-navigation-lab.ts";

const defaultRequest = {
  fromNodeId: "internal-gate",
  toNodeId: "observation-deck",
  profileKind: "WALK",
};

function expectPlan(envelope) {
  assert.equal(envelope.classification, "FICTIONAL_SIMULATION");
  assert.equal(envelope.realWorldUseProhibited, true);
  assert.equal(envelope.realWorldCorrespondence, "NONE");
  assert.equal(envelope.result.ok, true);
  return envelope.result.plan;
}

test("simulation result is permanently classified and cannot claim real-world correspondence", () => {
  const plan = expectPlan(planFictionalLabRoute(defaultRequest));
  assert.equal(plan.scenicAreaId, "fictional-navigation-lab");
  const topology = getFictionalLabTopology();
  assert.equal(topology.classification, "FICTIONAL_SIMULATION");
  assert.equal(topology.realWorldUseProhibited, true);
  assert.equal(topology.realWorldCorrespondence, "NONE");
  assert.equal("source" in topology, false);
  assert.equal("review" in topology, false);
});

test("standard walking chooses the fictional one-way stair shortcut", () => {
  const plan = expectPlan(planFictionalLabRoute(defaultRequest));
  assert.deepEqual(plan.edgeIds, ["edge-stairs-shortcut"]);
  assert.ok(plan.notices.includes("STAIRS_PRESENT"));
});

test("step-free mode deterministically excludes the stair shortcut", () => {
  const plan = expectPlan(planFictionalLabRoute({ ...defaultRequest, profileKind: "STEP_FREE" }));
  assert.deepEqual(plan.edgeIds, ["edge-garden-entry", "edge-garden-finish"]);
  assert.equal(plan.notices.includes("STAIRS_PRESENT"), false);
});

test("operational closure increments the bound version and forces an alternate route", () => {
  const plan = expectPlan(planFictionalLabRoute({
    ...defaultRequest,
    closedEdgeIds: ["edge-stairs-shortcut"],
    operationalVersion: 2,
  }));
  assert.equal(plan.operationalVersion, 2);
  assert.deepEqual(plan.edgeIds, ["edge-garden-entry", "edge-garden-finish"]);
});

test("closing every destination access fails closed with no safe path", () => {
  const envelope = planFictionalLabRoute({
    ...defaultRequest,
    closedEdgeIds: getDestinationClosureEdgeIds("observation-deck"),
    operationalVersion: 3,
  });
  assert.equal(envelope.classification, "FICTIONAL_SIMULATION");
  assert.deepEqual(envelope.result, {
    ok: false,
    code: "NO_SAFE_PATH",
    message: "当前开放、已核验且符合约束的有向路网中不存在安全路径。",
  });
});

test("one-way stair shortcut is not used in reverse", () => {
  const plan = expectPlan(planFictionalLabRoute({
    fromNodeId: "observation-deck",
    toNodeId: "internal-gate",
    profileKind: "WALK",
  }));
  assert.equal(plan.edgeIds.includes("edge-stairs-shortcut"), false);
  assert.deepEqual(plan.edgeIds, ["edge-garden-finish", "edge-garden-entry"]);
});

test("progress exposes bounded ETA, heading and a visual point on the curved shortcut", () => {
  const plan = expectPlan(planFictionalLabRoute(defaultRequest));
  const progress = calculateFictionalNavigationProgress(plan, plan.distanceMeters / 2);
  assert.equal(progress.classification, "FICTIONAL_SIMULATION");
  assert.equal(progress.realWorldUseProhibited, true);
  assert.equal(progress.progressRatio, 0.5);
  assert.ok(progress.remainingMinutes > 0);
  assert.ok(progress.headingDegrees >= 0 && progress.headingDegrees < 360);
  const visual = getFictionalVisualPosition(progress);
  assert.ok(visual);
  assert.ok(visual.y > 174, "quadratic shortcut marker must follow the visible curve");
});

test("location samples fail closed on low accuracy, staleness and impossible jumps", () => {
  const nowMs = FICTIONAL_LAB_CLOCK.getTime();
  const base = { longitude: 100, latitude: 20, accuracyMeters: 8, capturedAtMs: nowMs - 1_000 };
  assert.equal(assessFictionalLocationSample(base, null, nowMs).status, "ACCEPT");
  assert.equal(assessFictionalLocationSample({ ...base, accuracyMeters: 36 }, null, nowMs).status, "PAUSE_LOW_ACCURACY");
  assert.equal(assessFictionalLocationSample({ ...base, capturedAtMs: nowMs - 11_000 }, null, nowMs).status, "PAUSE_STALE");
  assert.equal(assessFictionalLocationSample({ ...base, longitude: 100.01, capturedAtMs: nowMs }, base, nowMs).status, "PAUSE_JUMP");
});

test("deviation requires three outside samples and resets only inside the recovery band", () => {
  const first = updateFictionalDeviationHysteresis(0, 40);
  const second = updateFictionalDeviationHysteresis(first.outsideCount, 41);
  const third = updateFictionalDeviationHysteresis(second.outsideCount, 42);
  assert.deepEqual([first.deviated, second.deviated, third.deviated], [false, false, true]);
  assert.deepEqual(updateFictionalDeviationHysteresis(third.outsideCount, 20), { outsideCount: 3, deviated: false });
  assert.deepEqual(updateFictionalDeviationHysteresis(third.outsideCount, 14), { outsideCount: 0, deviated: false });
});

test("UI keeps a disclosure, persistent warning, watermarked schematic and production-off gate", async () => {
  const [component, page, frame] = await Promise.all([
    readFile(new URL("../src/components/NavigationSimulationLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/navigation-lab/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppFrame.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /这是完全虚构的算法演练/);
  assert.match(component, /完全虚构演练 · 非六祖镇 · 禁止现场使用/);
  assert.match(component, /data-simulation-warning/);
  assert.doesNotMatch(component, /navigator\.geolocation/);
  assert.doesNotMatch(component, /fetch\s*\(|XMLHttpRequest|axios\./);
  assert.doesNotMatch(component, /from\s+["'][^"']*amap|https?:\/\/[^"']*amap|\bAMap\b/);
  assert.match(page, /NODE_ENV !== "production"/);
  assert.match(page, /FICTIONAL_NAVIGATION_LAB_ENABLED === "1"/);
  assert.match(page, /notFound\(\)/);
  assert.match(frame, /pathname !== "\/navigation-lab" \? <ChanxiaoliAssistant/);
});
