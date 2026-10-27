import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMAL_LOCATION_MAX_ACCURACY_METERS,
  FORMAL_LOCATION_MAX_NODE_ENVELOPE_METERS,
  formalLocationDistanceMeters,
  matchLocationToFormalNode,
} from "../src/lib/formal-location-match.ts";

const nodes = [
  { id: "formal-a", coordinate: { latitude: 22.5, longitude: 112.2 } },
  { id: "formal-b", coordinate: { latitude: 22.501, longitude: 112.2 } },
];

test("one reliable ephemeral fix deterministically matches a nearby formal node", () => {
  const result = matchLocationToFormalNode({ latitude: 22.5001, longitude: 112.2, accuracyMeters: 20 }, nodes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.nodeId, "formal-a");
  assert.ok(result.nodeDistanceMeters > 10 && result.nodeDistanceMeters < 12);
  assert.equal(result.accuracyMeters, 20);
});
test("invalid or low-accuracy samples never produce a node", () => {
  assert.deepEqual(
    matchLocationToFormalNode({ latitude: 91, longitude: 112.2, accuracyMeters: 10 }, nodes),
    { ok: false, code: "INVALID_SAMPLE" },
  );
  assert.deepEqual(
    matchLocationToFormalNode({ latitude: 22.5, longitude: 112.2, accuracyMeters: FORMAL_LOCATION_MAX_ACCURACY_METERS + 0.1 }, nodes),
    { ok: false, code: "LOW_ACCURACY" },
  );
});

test("the uncertainty envelope, not point distance alone, controls formal snapping", () => {
  const offset = 45 / 111_320;
  const pointDistance = formalLocationDistanceMeters(
    { latitude: 22.5 + offset, longitude: 112.2 },
    nodes[0].coordinate,
  );
  assert.ok(pointDistance < FORMAL_LOCATION_MAX_NODE_ENVELOPE_METERS);
  assert.deepEqual(
    matchLocationToFormalNode({ latitude: 22.5 + offset, longitude: 112.2, accuracyMeters: 40 }, [nodes[0]]),
    { ok: false, code: "NO_FORMAL_NODE_NEARBY" },
  );
});

test("malformed or empty node collections fail without inventing a fallback", () => {
  assert.deepEqual(
    matchLocationToFormalNode({ latitude: 22.5, longitude: 112.2, accuracyMeters: 10 }, []),
    { ok: false, code: "NO_FORMAL_NODE_NEARBY" },
  );
  assert.deepEqual(
    matchLocationToFormalNode(
      { latitude: 22.5, longitude: 112.2, accuracyMeters: 10 },
      [{ id: "", coordinate: { latitude: Number.NaN, longitude: 112.2 } }],
    ),
    { ok: false, code: "NO_FORMAL_NODE_NEARBY" },
  );
});
