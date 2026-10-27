import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFormalNavigation,
  createFormalNavigationRuntime,
  prepareFormalNavigationTrackerForResume,
  transitionFormalNavigation,
} from "../src/lib/formal-navigation-runtime.ts";

const start = new Date("2026-08-16T01:00:00.000Z");

function plan(overrides = {}) {
  return {
    schemaVersion: 1,
    routeFingerprint: "drp1-1234abcd",
    scenicAreaId: "fictional-park",
    networkRevision: "network-v1",
    operationalVersion: 2,
    originNodeId: "origin",
    destinationNodeId: "destination",
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    optimization: "FASTEST",
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY"] },
    dynamicFactorsApplied: true,
    traversals: [],
    edgeIds: ["edge-a", "edge-b"],
    distanceMeters: 222,
    estimatedMinutes: 4,
    geometry: { type: "LineString", coordinates: [[112.2, 22.5], [112.2, 22.501], [112.201, 22.501]] },
    notices: [],
    generatedAt: start.toISOString(),
    expiresAt: "2026-08-16T02:00:00.000Z",
    ...overrides,
  };
}

function activeRuntime() {
  const created = createFormalNavigationRuntime(plan(), start);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("fixture_failed");
  return {
    runtime: transitionFormalNavigation(created.runtime, { type: "START" }, start),
    tracker: created.tracker,
  };
}

function sample(latitude, longitude, offsetMs, accuracyMeters = 5) {
  return { latitude, longitude, accuracyMeters, capturedAtMs: start.getTime() + offsetMs };
}

test("runtime starts, pauses, resumes and cancels without storing a precise location", () => {
  const created = createFormalNavigationRuntime(plan(), start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const active = transitionFormalNavigation(created.runtime, { type: "START" }, start);
  const paused = transitionFormalNavigation(active, { type: "PAUSE" }, start);
  const resumed = transitionFormalNavigation(paused, { type: "RESUME" }, start);
  const cancelled = transitionFormalNavigation(resumed, { type: "CANCEL" }, start);
  assert.equal(active.status, "ACTIVE");
  assert.equal(paused.status, "PAUSED");
  assert.equal(resumed.status, "ACTIVE");
  assert.equal(cancelled.status, "CANCELLED");
  assert.doesNotMatch(JSON.stringify(cancelled), /latitude|longitude|previousAcceptedSample/);
});

test("a reliable projection reports remaining distance, ETA and a right turn", () => {
  const current = activeRuntime();
  const result = advanceFormalNavigation(plan(), current.runtime, current.tracker, sample(22.5005, 112.2, 1_000), start.getTime() + 1_000);
  assert.equal(result.runtime.guidanceQuality, "RELIABLE");
  assert.equal(result.runtime.maneuver?.kind, "RIGHT");
  assert.match(result.runtime.maneuver?.instruction ?? "", /右转/);
  assert.ok(result.runtime.remainingDistanceMeters > 150 && result.runtime.remainingDistanceMeters < 175);
  assert.ok(result.runtime.remainingMinutes > 2.7 && result.runtime.remainingMinutes < 3.2);
  assert.equal(result.tracker.routeMatch?.segmentIndex, 0);
  assert.ok(Math.abs((result.tracker.routeMatch?.segmentFraction ?? 0) - 0.5) < 1e-9);
});

test("resume clears short-lived evidence but preserves the last confirmed route match and progress", () => {
  const current = activeRuntime();
  const advanced = advanceFormalNavigation(plan(), current.runtime, current.tracker, sample(22.5005, 112.2, 1_000), start.getTime() + 1_000);
  const prepared = prepareFormalNavigationTrackerForResume({
    ...advanced.tracker,
    outsideSamples: 2,
    arrivalSamples: 2,
    arrivalFirstSampleAtMs: start.getTime(),
    progressJumpSamples: 2,
    wrongWaySamples: 2,
  });

  assert.equal(prepared.previousAcceptedSample, null);
  assert.deepEqual(prepared.routeMatch, advanced.tracker.routeMatch);
  assert.equal(prepared.routeProgressMeters, advanced.tracker.routeProgressMeters);
  assert.equal(prepared.furthestRouteProgressMeters, advanced.tracker.furthestRouteProgressMeters);
  assert.equal(prepared.outsideSamples, 0);
  assert.equal(prepared.arrivalSamples, 0);
  assert.equal(prepared.arrivalFirstSampleAtMs, null);
  assert.equal(prepared.progressJumpSamples, 0);
  assert.equal(prepared.wrongWaySamples, 0);
});

test("shape points inside one reviewed edge never become false turn instructions", () => {
  const edgeSemanticPlan = plan({
    traversals: [
      {
        kind: "EDGE",
        edgeId: "curved-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "origin",
        toNodeId: "junction",
        distanceMeters: 100,
        estimatedMinutes: 2,
        traversalMode: "WALKWAY",
        transportService: null,
        operationalFactors: null,
        geometry: {
          type: "LineString",
          coordinates: [[112.2, 22.5], [112.2, 22.5003], [112.2003, 22.5003], [112.2003, 22.5006]],
        },
      },
      {
        kind: "EDGE",
        edgeId: "west-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "junction",
        toNodeId: "destination",
        distanceMeters: 31,
        estimatedMinutes: 1,
        traversalMode: "WALKWAY",
        transportService: null,
        operationalFactors: null,
        geometry: {
          type: "LineString",
          coordinates: [[112.2003, 22.5006], [112.2, 22.5006]],
        },
      },
    ],
    edgeIds: ["curved-edge", "west-edge"],
    distanceMeters: 131,
    estimatedMinutes: 3,
    geometry: {
      type: "LineString",
      coordinates: [[112.2, 22.5], [112.2, 22.5003], [112.2003, 22.5003], [112.2003, 22.5006], [112.2, 22.5006]],
    },
  });
  const created = createFormalNavigationRuntime(edgeSemanticPlan, start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = advanceFormalNavigation(
    edgeSemanticPlan,
    transitionFormalNavigation(created.runtime, { type: "START" }, start),
    created.tracker,
    sample(22.5001, 112.2, 1_000),
    start.getTime() + 1_000,
  );
  assert.equal(result.runtime.maneuver?.kind, "LEFT");
  assert.match(result.runtime.maneuver?.instruction ?? "", /当前路段.*左转/);
  assert.ok((result.runtime.maneuver?.distanceToManeuverMeters ?? 0) > 80);
});

test("remaining distance and progress use reviewed edge distances instead of whole-geometry proportion", () => {
  const firstEndLatitude = 22.5009;
  const distanceSemanticPlan = plan({
    traversals: [
      {
        kind: "EDGE",
        edgeId: "short-published-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "origin",
        toNodeId: "junction",
        distanceMeters: 40,
        estimatedMinutes: 2,
        traversalMode: "WALKWAY",
        transportService: null,
        operationalFactors: null,
        geometry: { type: "LineString", coordinates: [[112.2, 22.5], [112.2, firstEndLatitude]] },
      },
      {
        kind: "EDGE",
        edgeId: "long-published-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "junction",
        toNodeId: "destination",
        distanceMeters: 400,
        estimatedMinutes: 8,
        traversalMode: "WALKWAY",
        transportService: null,
        operationalFactors: null,
        geometry: { type: "LineString", coordinates: [[112.2, firstEndLatitude], [112.201, firstEndLatitude]] },
      },
    ],
    edgeIds: ["short-published-edge", "long-published-edge"],
    distanceMeters: 440,
    estimatedMinutes: 10,
    geometry: {
      type: "LineString",
      coordinates: [[112.2, 22.5], [112.2, firstEndLatitude], [112.201, firstEndLatitude]],
    },
  });
  const created = createFormalNavigationRuntime(distanceSemanticPlan, start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = advanceFormalNavigation(
    distanceSemanticPlan,
    transitionFormalNavigation(created.runtime, { type: "START" }, start),
    created.tracker,
    sample((22.5 + firstEndLatitude) / 2, 112.2, 1_000),
    start.getTime() + 1_000,
  );
  assert.ok(result.runtime.remainingDistanceMeters > 419 && result.runtime.remainingDistanceMeters < 421);
  assert.ok(result.runtime.progressRatio > 0.044 && result.runtime.progressRatio < 0.047);
  assert.ok(result.runtime.remainingMinutes > 8.9 && result.runtime.remainingMinutes < 9.1);
});

test("low accuracy, stale samples and impossible jumps pause instructions without changing route status", () => {
  const current = activeRuntime();
  const low = advanceFormalNavigation(plan(), current.runtime, current.tracker, sample(22.5005, 112.2, 1_000, 80), start.getTime() + 1_000);
  assert.equal(low.runtime.status, "ACTIVE");
  assert.equal(low.runtime.guidanceQuality, "LOW_ACCURACY");
  assert.equal(low.runtime.maneuver, null);

  const stale = advanceFormalNavigation(plan(), current.runtime, current.tracker, sample(22.5005, 112.2, 1_000), start.getTime() + 20_000);
  assert.equal(stale.runtime.guidanceQuality, "STALE");

  const first = advanceFormalNavigation(plan(), current.runtime, current.tracker, sample(22.5, 112.2, 1_000), start.getTime() + 1_000);
  const jump = advanceFormalNavigation(plan(), first.runtime, first.tracker, sample(22.501, 112.201, 2_000), start.getTime() + 2_000);
  assert.equal(jump.runtime.guidanceQuality, "JUMP");
  assert.equal(jump.runtime.maneuver, null);
});

test("an initial fix on overlapping geometry chooses the earliest safe route progress", () => {
  const overlappingPlan = plan({
    edgeIds: ["overlap-a", "overlap-b", "overlap-c"],
    distanceMeters: 334,
    estimatedMinutes: 6,
    geometry: {
      type: "LineString",
      coordinates: [
        [112.2, 22.5],
        [112.2, 22.501],
        [112.2, 22.5],
        [112.2, 22.501],
      ],
    },
  });
  const created = createFormalNavigationRuntime(overlappingPlan, start);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = advanceFormalNavigation(
    overlappingPlan,
    transitionFormalNavigation(created.runtime, { type: "START" }, start),
    created.tracker,
    sample(22.5005, 112.2, 1_000, 3),
    start.getTime() + 1_000,
  );

  assert.equal(result.runtime.guidanceQuality, "RELIABLE");
  assert.ok(result.runtime.progressRatio > 0.14 && result.runtime.progressRatio < 0.19);
  assert.ok(result.tracker.routeProgressMeters > 50 && result.tracker.routeProgressMeters < 60);
});

test("three progress-discontinuous branch matches stop old guidance and require reroute", () => {
  const foldedPlan = plan({
    edgeIds: ["north", "east", "south", "return"],
    distanceMeters: 620,
    estimatedMinutes: 12,
    geometry: {
      type: "LineString",
      coordinates: [
        [112.2, 22.5],
        [112.2, 22.501],
        [112.202, 22.501],
        [112.202, 22.5],
        [112.2001, 22.5],
      ],
    },
  });
  const created = createFormalNavigationRuntime(foldedPlan, start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  let current = advanceFormalNavigation(
    foldedPlan,
    transitionFormalNavigation(created.runtime, { type: "START" }, start),
    created.tracker,
    sample(22.5, 112.2, 1_000, 2),
    start.getTime() + 1_000,
  );

  for (const [index, offset] of [3_000, 5_000, 7_000].entries()) {
    current = advanceFormalNavigation(
      foldedPlan,
      current.runtime,
      current.tracker,
      sample(22.5, 112.2001, offset, 2),
      start.getTime() + offset,
    );
    if (index < 2) {
      assert.equal(current.runtime.status, "ACTIVE");
      assert.equal(current.runtime.guidanceQuality, "JUMP");
      assert.equal(current.runtime.maneuver, null);
    }
  }

  assert.equal(current.runtime.status, "REROUTE_REQUIRED");
  assert.equal(current.runtime.guidanceQuality, "OFF_ROUTE");
  assert.equal(current.runtime.maneuver, null);
  assert.equal(current.tracker.progressJumpSamples, 3);
  assert.equal(current.tracker.previousAcceptedSample?.longitude, 112.2001);
  assert.equal(current.tracker.routeProgressMeters, 0);
});

test("three reliable backward-progress samples produce a recoverable wrong-way U-turn warning", () => {
  const straightPlan = plan({
    edgeIds: ["straight-edge"],
    distanceMeters: 334,
    estimatedMinutes: 6,
    geometry: { type: "LineString", coordinates: [[112.2, 22.5], [112.2, 22.503]] },
  });
  const created = createFormalNavigationRuntime(straightPlan, start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  let current = advanceFormalNavigation(
    straightPlan,
    transitionFormalNavigation(created.runtime, { type: "START" }, start),
    created.tracker,
    sample(22.5004, 112.2, 1_000, 3),
    start.getTime() + 1_000,
  );
  current = advanceFormalNavigation(
    straightPlan,
    current.runtime,
    current.tracker,
    sample(22.5015, 112.2, 15_000, 3),
    start.getTime() + 15_000,
  );
  for (const [latitude, offset] of [[22.5012, 20_000], [22.5009, 25_000], [22.5006, 30_000]]) {
    current = advanceFormalNavigation(
      straightPlan,
      current.runtime,
      current.tracker,
      sample(latitude, 112.2, offset, 3),
      start.getTime() + offset,
    );
  }

  assert.equal(current.runtime.status, "ACTIVE");
  assert.equal(current.runtime.guidanceQuality, "WRONG_WAY");
  assert.equal(current.runtime.maneuver?.kind, "U_TURN");
  assert.match(current.runtime.message, /反向行走|掉头/);
  assert.equal(current.tracker.wrongWaySamples, 3);

  const recovered = advanceFormalNavigation(
    straightPlan,
    current.runtime,
    current.tracker,
    sample(22.5015, 112.2, 45_000, 3),
    start.getTime() + 45_000,
  );
  assert.equal(recovered.runtime.guidanceQuality, "RELIABLE");
  assert.equal(recovered.tracker.wrongWaySamples, 0);
});

test("three definitely outside samples stop old instructions and require reroute", () => {
  let current = activeRuntime();
  for (const [index, offset] of [1_000, 3_000, 5_000].entries()) {
    current = advanceFormalNavigation(
      plan(),
      current.runtime,
      current.tracker,
      sample(22.5005, 112.2006, offset, 5),
      start.getTime() + offset,
    );
    if (index < 2) assert.equal(current.runtime.status, "ACTIVE");
  }
  assert.equal(current.runtime.status, "REROUTE_REQUIRED");
  assert.equal(current.runtime.guidanceQuality, "OFF_ROUTE");
  assert.equal(current.runtime.maneuver, null);
});

test("arrival needs three reliable samples and ten seconds of dwell", () => {
  let current = activeRuntime();
  for (const offset of [1_000, 6_000, 11_000]) {
    current = advanceFormalNavigation(
      plan(),
      current.runtime,
      current.tracker,
      sample(22.501, 112.20099, offset, 5),
      start.getTime() + offset,
    );
  }
  assert.equal(current.runtime.status, "COMPLETED");
  assert.equal(current.runtime.guidanceQuality, "ARRIVED");
  assert.equal(current.runtime.maneuver?.kind, "ARRIVE");
});

test("expired plans and changed route versions stop navigation before another instruction", () => {
  const expired = createFormalNavigationRuntime(plan({ expiresAt: start.toISOString() }), start);
  assert.deepEqual(expired, { ok: false, code: "PLAN_EXPIRED", message: "正式路线已过期，必须刷新运营状态后重新规划。" });

  const current = activeRuntime();
  const changed = transitionFormalNavigation(current.runtime, {
    type: "ROUTE_VERSION_CHANGED",
    networkRevision: "network-v1",
    operationalVersion: 3,
  }, start);
  assert.equal(changed.status, "REROUTE_REQUIRED");
  assert.equal(changed.maneuver, null);
});

test("sensor and operating-state failures stop guidance without preserving an unsafe instruction", () => {
  const created = createFormalNavigationRuntime(plan(), start);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const active = transitionFormalNavigation(created.runtime, { type: "START" }, new Date(start.getTime() + 1_000));
  const sensorStopped = transitionFormalNavigation(active, {
    type: "SENSOR_UNAVAILABLE",
    message: "定位权限已拒绝，导航已暂停。",
  }, new Date(start.getTime() + 2_000));
  assert.equal(sensorStopped.status, "PAUSED");
  assert.equal(sensorStopped.guidanceQuality, "INVALID");
  assert.equal(sensorStopped.maneuver, null);

  const operatingStopped = transitionFormalNavigation(sensorStopped, {
    type: "OPERATIONAL_STATE_UNAVAILABLE",
    message: "正式运营状态不可用，旧指令已停止。",
  }, new Date(start.getTime() + 3_000));
  assert.equal(operatingStopped.status, "REROUTE_REQUIRED");
  assert.equal(operatingStopped.guidanceQuality, "STALE");
  assert.equal(operatingStopped.maneuver, null);
});

test("multimodal guidance gives board and ride instructions while keeping transport wait in leg-aware ETA", () => {
  const service = {
    serviceName: "虚构测试索道",
    boardingMinutes: 2,
    expectedWaitMinutes: 5,
    inVehicleMinutes: 10,
    scheduleEvidenceReference: "https://evidence.example.test/fictional-cableway",
  };
  const multimodal = plan({
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY", "CABLEWAY"] },
    traversals: [
      {
        kind: "EDGE",
        edgeId: "cableway-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "origin",
        toNodeId: "upper-station",
        distanceMeters: 111,
        estimatedMinutes: 17,
        traversalMode: "CABLEWAY",
        transportService: service,
        geometry: { type: "LineString", coordinates: [[112.2, 22.5], [112.2, 22.501]] },
      },
      {
        kind: "EDGE",
        edgeId: "walk-edge",
        traversalDirection: "FORWARD",
        fromNodeId: "upper-station",
        toNodeId: "destination",
        distanceMeters: 103,
        estimatedMinutes: 2,
        traversalMode: "WALKWAY",
        transportService: null,
        geometry: { type: "LineString", coordinates: [[112.2, 22.501], [112.201, 22.501]] },
      },
    ],
    edgeIds: ["cableway-edge", "walk-edge"],
    distanceMeters: 214,
    estimatedMinutes: 19,
    geometry: { type: "LineString", coordinates: [[112.2, 22.5], [112.2, 22.501], [112.201, 22.501]] },
  });

  const createdAtBoarding = createFormalNavigationRuntime(multimodal, start);
  assert.equal(createdAtBoarding.ok, true);
  if (!createdAtBoarding.ok) return;
  const atBoarding = advanceFormalNavigation(
    multimodal,
    transitionFormalNavigation(createdAtBoarding.runtime, { type: "START" }, start),
    createdAtBoarding.tracker,
    sample(22.50001, 112.2, 1_000),
    start.getTime() + 1_000,
  );
  assert.equal(atBoarding.runtime.maneuver?.kind, "BOARD_CABLEWAY");
  assert.match(atBoarding.runtime.maneuver?.instruction ?? "", /候乘 7 分钟/);

  const createdInRide = createFormalNavigationRuntime(multimodal, start);
  assert.equal(createdInRide.ok, true);
  if (!createdInRide.ok) return;
  const inRide = advanceFormalNavigation(
    multimodal,
    transitionFormalNavigation(createdInRide.runtime, { type: "START" }, start),
    createdInRide.tracker,
    sample(22.5005, 112.2, 1_000),
    start.getTime() + 1_000,
  );
  assert.equal(inRide.runtime.maneuver?.kind, "RIDE_CABLEWAY");
  assert.ok(inRide.runtime.remainingMinutes > 10 && inRide.runtime.remainingMinutes < 11);
});
