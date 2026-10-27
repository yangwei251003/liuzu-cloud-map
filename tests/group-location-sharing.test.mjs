import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFreshGroupLocationUpdate,
  parseGroupLocationShareAction,
  relativeGroupMemberLocation,
} from "../src/lib/group-location-sharing.ts";

const now = new Date("2026-08-16T02:00:00.000Z");

function sample(overrides = {}) {
  return {
    longitude: 112.2,
    latitude: 22.5,
    accuracyMeters: 12,
    capturedAt: "2026-08-16T01:59:55.000Z",
    ...overrides,
  };
}

test("share start and stop actions are strict, bounded and require an explicit consent revision", () => {
  assert.deepEqual(parseGroupLocationShareAction({ action: "START", expiresInMinutes: 60, consentRevision: 1 }), {
    action: "START",
    expiresInMinutes: 60,
    consentRevision: 1,
  });
  assert.deepEqual(parseGroupLocationShareAction({ action: "STOP", reason: "USER_STOPPED" }), {
    action: "STOP",
    reason: "USER_STOPPED",
  });
  assert.equal(parseGroupLocationShareAction({ action: "START", expiresInMinutes: 600, consentRevision: 1 }), null);
  assert.equal(parseGroupLocationShareAction({ action: "START", expiresInMinutes: 60, consentRevision: 1, background: true }), null);
  assert.equal(parseGroupLocationShareAction({ action: "STOP", reason: "SILENT" }), null);
});

test("only fresh high-accuracy samples can replace the current group point", () => {
  assert.deepEqual(parseFreshGroupLocationUpdate(sample(), now), sample());
  assert.equal(parseFreshGroupLocationUpdate(sample({ accuracyMeters: 51 }), now), null);
  assert.equal(parseFreshGroupLocationUpdate(sample({ capturedAt: "2026-08-16T01:59:44.000Z" }), now), null);
  assert.equal(parseFreshGroupLocationUpdate(sample({ longitude: 181 }), now), null);
  assert.equal(parseFreshGroupLocationUpdate({ ...sample(), speed: 2 }, now), null);
});

test("authorized fresh points produce deterministic distance and direction without creating a track", () => {
  const viewer = sample();
  const member = {
    ...sample({ longitude: 112.201, latitude: 22.5 }),
    accountId: "member-2",
    displayName: "同行者",
    expiresAt: "2026-08-16T02:01:30.000Z",
  };
  const relative = relativeGroupMemberLocation(viewer, member, now);
  assert.ok(relative);
  assert.equal(relative.direction, "东");
  assert.ok(relative.distanceMeters > 100 && relative.distanceMeters < 110);
  assert.ok(Math.abs(relative.bearingDegrees - 90) < 0.01);
  assert.equal("track" in relative, false);
});

test("expired member points and stale viewer samples never produce distance or direction", () => {
  const expired = {
    ...sample({ longitude: 112.201 }),
    accountId: "member-2",
    displayName: "同行者",
    expiresAt: "2026-08-16T02:00:00.000Z",
  };
  assert.equal(relativeGroupMemberLocation(sample(), expired, now), null);
  assert.equal(relativeGroupMemberLocation(sample({ capturedAt: "2026-08-16T01:59:00.000Z" }), { ...expired, expiresAt: "2026-08-16T02:01:00.000Z" }, now), null);
});
