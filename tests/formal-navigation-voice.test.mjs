import assert from "node:assert/strict";
import test from "node:test";
import {
  createFormalNavigationVoiceTracker,
  decideFormalNavigationVoice,
  formalNavigationVoiceLegKey,
  FORMAL_NAVIGATION_VOICE_REPEAT_MIN_INTERVAL_MS,
} from "../src/lib/formal-navigation-voice.ts";

function runtime(overrides = {}) {
  return {
    schemaVersion: 1,
    routeFingerprint: "drp1-voice-route",
    networkRevision: "network-v1",
    operationalVersion: 3,
    planExpiresAt: "2026-12-10T00:00:00.000Z",
    status: "ACTIVE",
    guidanceQuality: "RELIABLE",
    progressRatio: 0.2,
    remainingDistanceMeters: 420,
    remainingMinutes: 8,
    lateralDistanceMeters: 2,
    maneuver: {
      kind: "LEFT",
      instruction: "沿当前路段前行约 140 米后左转。",
      distanceToManeuverMeters: 140,
      headingDegrees: 90,
    },
    lastProcessedAt: "2026-08-16T08:00:00.000Z",
    message: "沿当前路段前行约 140 米后左转。",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    enabled: true,
    globallyMuted: false,
    foreground: true,
    runtime: runtime(),
    routeLegKey: "edge-main",
    nowMs: 10_000,
    ...overrides,
  };
}

test("voice is explicit opt-in and unsafe gates cancel playback only once", () => {
  const initial = createFormalNavigationVoiceTracker();
  const disabled = decideFormalNavigationVoice(initial, input({ enabled: false }));
  assert.equal(disabled.action.type, "NONE");
  const duplicate = decideFormalNavigationVoice(disabled.tracker, input({ enabled: false, nowMs: 11_000 }));
  assert.equal(duplicate.action.type, "NONE");

  const spoken = decideFormalNavigationVoice(disabled.tracker, input({ nowMs: 12_000 }));
  assert.equal(spoken.action.type, "SPEAK");
  const background = decideFormalNavigationVoice(spoken.tracker, input({ foreground: false, nowMs: 13_000 }));
  assert.deepEqual(background.action, { type: "CANCEL", reason: "页面不在前台" });
  assert.equal(background.tracker.maneuverIdentity, null);
  assert.equal(background.tracker.lastAnnouncementKey, null);
});

test("curved shaping points keep one formal leg identity and distance prompts only move closer", () => {
  const plan = {
    geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20.001], [100.002, 20], [100.003, 20]] },
    traversals: [
      {
        kind: "EDGE",
        edgeId: "edge-curved",
        geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20.001], [100.002, 20]] },
      },
      {
        kind: "EDGE",
        edgeId: "edge-finish",
        geometry: { type: "LineString", coordinates: [[100.002, 20], [100.003, 20]] },
      },
    ],
  };
  assert.equal(formalNavigationVoiceLegKey(plan, { segmentIndex: 0, segmentFraction: 0.4 }), "edge-curved");
  assert.equal(formalNavigationVoiceLegKey(plan, { segmentIndex: 1, segmentFraction: 0.4 }), "edge-curved");
  assert.equal(formalNavigationVoiceLegKey(plan, { segmentIndex: 2, segmentFraction: 0.4 }), "edge-finish");

  const first = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), input());
  assert.equal(first.action.type, "SPEAK");
  const sameBand = decideFormalNavigationVoice(first.tracker, input({
    nowMs: 20_000,
    runtime: runtime({
      maneuver: { ...runtime().maneuver, instruction: "沿当前路段前行约 120 米后左转。", distanceToManeuverMeters: 120 },
    }),
  }));
  assert.equal(sameBand.action.type, "NONE");

  const closer = decideFormalNavigationVoice(sameBand.tracker, input({
    nowMs: 20_000 + FORMAL_NAVIGATION_VOICE_REPEAT_MIN_INTERVAL_MS,
    runtime: runtime({
      maneuver: { ...runtime().maneuver, instruction: "沿当前路段前行约 70 米后左转。", distanceToManeuverMeters: 70 },
    }),
  }));
  assert.equal(closer.action.type, "SPEAK");
  assert.match(closer.action.text, /70 米后左转/);

  const jitterBack = decideFormalNavigationVoice(closer.tracker, input({
    nowMs: 40_000,
    runtime: runtime({
      maneuver: { ...runtime().maneuver, instruction: "沿当前路段前行约 130 米后左转。", distanceToManeuverMeters: 130 },
    }),
  }));
  assert.equal(jitterBack.action.type, "NONE");
});

test("a new route fingerprint or formal edge can announce immediately", () => {
  const first = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), input());
  const rerouted = decideFormalNavigationVoice(first.tracker, input({
    nowMs: 10_100,
    routeLegKey: "edge-alternative",
    runtime: runtime({ routeFingerprint: "drp1-rerouted" }),
  }));
  assert.equal(rerouted.action.type, "SPEAK");
  assert.match(rerouted.action.key, /drp1-rerouted:edge-alternative/);
});

test("degraded positioning, wrong-way and reroute states replace old maneuver speech with bounded warnings", () => {
  const spoken = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), input());
  const lowAccuracy = decideFormalNavigationVoice(spoken.tracker, input({
    runtime: runtime({ guidanceQuality: "LOW_ACCURACY", maneuver: null }),
    nowMs: 11_000,
  }));
  assert.equal(lowAccuracy.action.type, "SPEAK");
  assert.equal(lowAccuracy.action.category, "SAFETY");
  assert.match(lowAccuracy.action.text, /精度不足.*已暂停/);

  const duplicate = decideFormalNavigationVoice(lowAccuracy.tracker, input({
    runtime: runtime({ guidanceQuality: "LOW_ACCURACY", maneuver: null }),
    nowMs: 12_000,
  }));
  assert.equal(duplicate.action.type, "NONE");

  const wrongWay = decideFormalNavigationVoice(duplicate.tracker, input({
    runtime: runtime({ guidanceQuality: "WRONG_WAY", maneuver: null }),
    nowMs: 13_000,
  }));
  assert.equal(wrongWay.action.type, "SPEAK");
  assert.match(wrongWay.action.text, /安全位置掉头/);

  const reroute = decideFormalNavigationVoice(wrongWay.tracker, input({
    runtime: runtime({ status: "REROUTE_REQUIRED", guidanceQuality: "OFF_ROUTE", maneuver: null }),
    nowMs: 14_000,
  }));
  assert.equal(reroute.action.type, "SPEAK");
  assert.match(reroute.action.text, /旧路线指令已停止/);
});

test("arrival is announced once and global mute clears the announcement identity", () => {
  const arrived = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), input({
    runtime: runtime({ status: "COMPLETED", guidanceQuality: "ARRIVED", maneuver: null }),
  }));
  assert.equal(arrived.action.type, "SPEAK");
  assert.equal(arrived.action.category, "ARRIVAL");
  const duplicate = decideFormalNavigationVoice(arrived.tracker, input({
    runtime: runtime({ status: "COMPLETED", guidanceQuality: "ARRIVED", maneuver: null }),
    nowMs: 20_000,
  }));
  assert.equal(duplicate.action.type, "NONE");
  const muted = decideFormalNavigationVoice(duplicate.tracker, input({ globallyMuted: true, nowMs: 21_000 }));
  assert.deepEqual(muted.action, { type: "CANCEL", reason: "全局静音已开启" });
  assert.equal(muted.tracker.lastAnnouncementKey, null);
});

test("invalid route matches and oversized speech text fail closed", () => {
  assert.equal(formalNavigationVoiceLegKey({ geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] }, traversals: [] }, { segmentIndex: 0, segmentFraction: 0.5 }), null);
  assert.equal(formalNavigationVoiceLegKey({
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0], [2, 0]] },
    traversals: [{ kind: "EDGE", edgeId: "drifted", geometry: { type: "LineString", coordinates: [[0, 0], [2, 0]] } }],
  }, { segmentIndex: 1, segmentFraction: 0.5 }), null);
  const invalidInput = input({
    runtime: runtime({
      maneuver: { ...runtime().maneuver, instruction: "很".repeat(181) },
    }),
  });
  const decision = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), invalidInput);
  assert.equal(decision.action.type, "NONE");
  assert.equal(decision.tracker.gateKey, "INVALID_INSTRUCTION");
  const spoken = decideFormalNavigationVoice(createFormalNavigationVoiceTracker(), input());
  const replacesActiveSpeech = decideFormalNavigationVoice(spoken.tracker, invalidInput);
  assert.equal(replacesActiveSpeech.action.type, "CANCEL");
});
