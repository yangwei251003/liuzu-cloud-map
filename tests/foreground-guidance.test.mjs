import assert from "node:assert/strict";
import test from "node:test";
import {
  FOREGROUND_GUIDANCE_APPROACH_RADIUS_METERS,
  buildForegroundDistanceAnnouncement,
  classifyForegroundLocation,
  createForegroundApproachTracker,
  evaluateForegroundGuidance,
  foregroundDistanceMeters,
  foregroundRoughDirection,
  shouldRunForegroundGuidance,
} from "../src/lib/foreground-guidance.ts";

const target = {
  id: "candidate-stop",
  name: "候选点",
  latitude: 22.5,
  longitude: 112.2,
};

const activeGate = {
  userEnabled: true,
  demoMode: true,
  canStartDemo: true,
  sessionStatus: "ACTIVE",
};

function sample(overrides = {}) {
  return {
    latitude: 22.5,
    longitude: 112.2,
    accuracy: 20,
    timestamp: 1_000,
    ...overrides,
  };
}

test("foreground guidance runs only after explicit opt-in in an active validated demo", () => {
  assert.equal(shouldRunForegroundGuidance(activeGate), true);
  for (const blocked of [
    { ...activeGate, userEnabled: false },
    { ...activeGate, demoMode: false },
    { ...activeGate, canStartDemo: false },
    { ...activeGate, sessionStatus: "IDLE" },
    { ...activeGate, sessionStatus: "PAUSED" },
    { ...activeGate, sessionStatus: "COMPLETED" },
  ]) {
    assert.equal(shouldRunForegroundGuidance(blocked), false);
  }
});

test("invalid and low-accuracy fixes fail closed before distance or proximity claims", () => {
  assert.equal(classifyForegroundLocation(sample({ accuracy: 50 })), "reliable");
  assert.equal(classifyForegroundLocation(sample({ accuracy: 50.1 })), "low_accuracy");
  assert.equal(classifyForegroundLocation(sample({ accuracy: 0 })), "invalid");
  assert.equal(classifyForegroundLocation(sample({ latitude: 91 })), "invalid");

  const low = evaluateForegroundGuidance({
    sample: sample({ accuracy: 120 }),
    target,
    gate: activeGate,
    previousTracker: createForegroundApproachTracker(target.id),
  });
  assert.equal(low.quality, "low_accuracy");
  assert.equal(low.distanceMeters, null);
  assert.equal(low.roughDirection, null);
  assert.equal(low.approachStatus, "blocked");
  assert.equal(low.tracker.qualifyingSamples, 0);
});

test("rough distance and cardinal direction are straight-line hints, not route instructions", () => {
  const east = { ...target, longitude: target.longitude + 0.001 };
  const distance = foregroundDistanceMeters(sample(), east);
  assert.ok(distance > 90 && distance < 120);
  assert.equal(foregroundRoughDirection(sample(), east), "东");

  const announcement = buildForegroundDistanceAnnouncement({
    targetName: "国恩寺",
    distanceMeters: distance,
    roughDirection: "东",
  });
  assert.match(announcement, /直线距离约 \d+ 米/);
  assert.match(announcement, /大致位于东侧/);
  assert.match(announcement, /手动确认到达/);
  assert.doesNotMatch(announcement, /左转|右转|预计|分钟|安全|已到达/);
});

test("maybe-near requires conservative radius, three stable samples and dwell time", () => {
  const latitudeOffset = 25 / 111_320;
  const nearSample = (timestamp) => sample({ latitude: target.latitude + latitudeOffset, timestamp });
  assert.ok(foregroundDistanceMeters(nearSample(0), target) + nearSample(0).accuracy < FOREGROUND_GUIDANCE_APPROACH_RADIUS_METERS);

  let tracker = createForegroundApproachTracker(target.id);
  let result = evaluateForegroundGuidance({ sample: nearSample(1_000), target, gate: activeGate, previousTracker: tracker });
  tracker = result.tracker;
  assert.equal(result.approachStatus, "tracking");
  result = evaluateForegroundGuidance({ sample: nearSample(6_000), target, gate: activeGate, previousTracker: tracker });
  tracker = result.tracker;
  assert.equal(result.approachStatus, "tracking");
  result = evaluateForegroundGuidance({ sample: nearSample(11_000), target, gate: activeGate, previousTracker: tracker });
  assert.equal(result.tracker.qualifyingSamples, 3);
  assert.equal(result.approachStatus, "maybe_near");
});

test("unstable, stale, outside-radius or gated samples reset the approach evidence", () => {
  const latitudeOffset = 25 / 111_320;
  const near = sample({ latitude: target.latitude + latitudeOffset, timestamp: 1_000 });
  const seeded = evaluateForegroundGuidance({ sample: near, target, gate: activeGate }).tracker;

  const duplicate = evaluateForegroundGuidance({
    sample: { ...near, timestamp: 1_000 },
    target,
    gate: activeGate,
    previousTracker: seeded,
  });
  assert.equal(duplicate.tracker.qualifyingSamples, 0);

  const stale = evaluateForegroundGuidance({
    sample: { ...near, timestamp: 20_000 },
    target,
    gate: activeGate,
    previousTracker: seeded,
  });
  assert.equal(stale.tracker.qualifyingSamples, 0);

  const far = evaluateForegroundGuidance({
    sample: sample({ latitude: target.latitude + 0.003, timestamp: 6_000 }),
    target,
    gate: activeGate,
    previousTracker: seeded,
  });
  assert.equal(far.tracker.qualifyingSamples, 0);

  const paused = evaluateForegroundGuidance({
    sample: { ...near, timestamp: 6_000 },
    target,
    gate: { ...activeGate, sessionStatus: "PAUSED" },
    previousTracker: seeded,
  });
  assert.equal(paused.approachStatus, "blocked");
  assert.equal(paused.tracker.qualifyingSamples, 0);

  const changedTarget = evaluateForegroundGuidance({
    sample: { ...near, timestamp: 6_000 },
    target: { ...target, id: "another-stop" },
    gate: activeGate,
    previousTracker: seeded,
  });
  assert.equal(changedTarget.tracker.targetId, "another-stop");
  assert.equal(changedTarget.tracker.qualifyingSamples, 1);
});
