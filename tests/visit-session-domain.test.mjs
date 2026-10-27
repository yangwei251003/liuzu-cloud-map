import assert from "node:assert/strict";
import test from "node:test";

import {
  parseVisitSessionCreateInput,
  parseVisitSessionEventInput,
  transitionVisitSession,
} from "../src/lib/server/visit-session-domain.ts";

const itineraryId = "11111111-1111-4111-8111-111111111111";
const routePlanSnapshotId = "22222222-2222-4222-8222-222222222222";

function createInput(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    itineraryId,
    itineraryRevision: 1,
    routePlanSnapshotId,
    narrationEnabled: true,
    expectedRevision: 0,
    ...overrides,
  };
}

test("visit-session creation accepts only a published-itinerary reference and explicit narration choice", () => {
  assert.deepEqual(parseVisitSessionCreateInput(createInput()), createInput());
  assert.equal(parseVisitSessionCreateInput(createInput({ expectedRevision: 1 })), null);
  assert.equal(parseVisitSessionCreateInput(createInput({ itineraryRevision: 0 })), null);
  assert.equal(parseVisitSessionCreateInput({ ...createInput(), coordinate: [112.1, 22.2] }), null);
  assert.equal(parseVisitSessionCreateInput({ ...createInput(), route: { generatedBy: "AI" } }), null);
  assert.equal(parseVisitSessionCreateInput({ ...createInput(), narrationEnabled: "yes" }), null);
});

test("lifecycle event input has no route, coordinate, AI, or arbitrary metadata channel", () => {
  assert.deepEqual(parseVisitSessionEventInput({ action: "PAUSE", expectedRevision: 2 }), {
    action: "PAUSE",
    expectedRevision: 2,
    replacementRoutePlanSnapshotId: null,
  });
  assert.deepEqual(parseVisitSessionEventInput({
    action: "RECOVER",
    expectedRevision: 4,
    routePlanSnapshotId,
  }), {
    action: "RECOVER",
    expectedRevision: 4,
    replacementRoutePlanSnapshotId: routePlanSnapshotId,
  });
  assert.equal(parseVisitSessionEventInput({ action: "RECOVER", expectedRevision: 4 }), null);
  assert.equal(parseVisitSessionEventInput({ action: "PAUSE", expectedRevision: 2, latitude: 22.2 }), null);
  assert.equal(parseVisitSessionEventInput({ action: "ARRIVE", expectedRevision: 2, aiResult: "go there" }), null);
  assert.equal(parseVisitSessionEventInput({ action: "UNKNOWN", expectedRevision: 2 }), null);
});

test("strict state machine covers start, pause, resume, replan, recover, skip, arrive, end, and delete", () => {
  assert.deepEqual(transitionVisitSession("READY", "START"), {
    lifecycleState: "STARTED",
    eventType: "STARTED",
    requiresCurrentFormalRoute: true,
    requiresReplacementFormalRoute: false,
  });
  assert.equal(transitionVisitSession("STARTED", "START"), null);
  assert.equal(transitionVisitSession("READY", "RESUME"), null);
  assert.equal(transitionVisitSession("STARTED", "PAUSE")?.lifecycleState, "PAUSED");
  assert.equal(transitionVisitSession("PAUSED", "RESUME")?.lifecycleState, "STARTED");
  assert.equal(transitionVisitSession("STARTED", "REPLAN")?.lifecycleState, "REPLANNING");
  assert.deepEqual(transitionVisitSession("REPLANNING", "RECOVER"), {
    lifecycleState: "STARTED",
    eventType: "RECOVERED",
    requiresCurrentFormalRoute: false,
    requiresReplacementFormalRoute: true,
  });
  assert.equal(transitionVisitSession("STARTED", "SKIP")?.lifecycleState, "SKIPPED");
  assert.equal(transitionVisitSession("SKIPPED", "RESUME")?.lifecycleState, "STARTED");
  assert.equal(transitionVisitSession("STARTED", "ARRIVE")?.lifecycleState, "ARRIVED");
  assert.equal(transitionVisitSession("ARRIVED", "END")?.lifecycleState, "COMPLETED");
  assert.equal(transitionVisitSession("STARTED", "END")?.lifecycleState, "ENDED");
  assert.equal(transitionVisitSession("COMPLETED", "DELETE")?.lifecycleState, "DELETED");
  assert.equal(transitionVisitSession("DELETED", "DELETE"), null);
});
