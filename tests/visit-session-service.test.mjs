import assert from "node:assert/strict";
import test from "node:test";

import { transitionVisitSession } from "../src/lib/server/visit-session-domain.ts";
import {
  applyVisitSessionEvent,
  createVisitSession,
  hashVisitSessionIdempotencyKey,
} from "../src/lib/server/visit-session-service.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const actor = {
  accountId: "00000000-0000-4000-8000-000000000001",
  scenicAreaId: "fictional-park",
  subject: "visitor:fictional-park:00000000-0000-4000-8000-000000000001",
};
const otherActor = {
  accountId: "00000000-0000-4000-8000-000000000099",
  scenicAreaId: "fictional-park",
  subject: "visitor:fictional-park:00000000-0000-4000-8000-000000000099",
};
const ids = {
  session: "00000000-0000-4000-8000-000000000002",
  itinerary: "00000000-0000-4000-8000-000000000003",
  routeA: "00000000-0000-4000-8000-000000000004",
  routeB: "00000000-0000-4000-8000-000000000005",
};

function createInput(overrides = {}) {
  return {
    scenicAreaId: actor.scenicAreaId,
    itineraryId: ids.itinerary,
    itineraryRevision: 1,
    routePlanSnapshotId: ids.routeA,
    narrationEnabled: true,
    expectedRevision: 0,
    ...overrides,
  };
}

function event(action, expectedRevision, extra = {}) {
  return { action, expectedRevision, ...extra };
}

function hash(key) {
  const value = hashVisitSessionIdempotencyKey(key);
  assert.ok(value);
  return value;
}

class InMemoryVisitSessionRepository {
  constructor() {
    this.session = null;
    this.createKeys = new Map();
    this.eventKeys = new Map();
    this.routeAvailable = true;
    this.createCalls = 0;
  }

  async create(command) {
    this.createCalls += 1;
    const replay = this.createKeys.get(command.idempotencyKeyHash);
    if (replay) {
      const same = JSON.stringify(replay.input) === JSON.stringify(command.input);
      return same ? { state: "REPLAYED", session: structuredClone(replay.session) } : { state: "IDEMPOTENCY_CONFLICT" };
    }
    if (!this.routeAvailable) return { state: "FORMAL_ROUTE_UNAVAILABLE" };
    const session = {
      id: ids.session,
      scenicAreaId: command.input.scenicAreaId,
      itineraryId: command.input.itineraryId,
      itineraryRevision: command.input.itineraryRevision,
      routePlanSnapshotId: command.input.routePlanSnapshotId,
      lifecycleState: "READY",
      revision: 1,
      narrationEnabled: command.input.narrationEnabled,
      startedAt: null,
      endedAt: null,
      createdAt: command.occurredAt,
      updatedAt: command.occurredAt,
      owner: command.identity.accountId,
    };
    this.session = session;
    this.createKeys.set(command.idempotencyKeyHash, { input: structuredClone(command.input), session: { ...session, owner: undefined } });
    return { state: "CREATED", session: this.receipt(session) };
  }

  async applyEvent(command) {
    if (!this.session || this.session.id !== command.sessionId || this.session.owner !== command.identity.accountId) {
      return { state: "NOT_FOUND" };
    }
    const replay = this.eventKeys.get(command.idempotencyKeyHash);
    if (replay) {
      const same = replay.action === command.input.action
        && replay.expectedRevision === command.input.expectedRevision
        && replay.routePlanSnapshotId === command.input.replacementRoutePlanSnapshotId;
      return same ? { state: "REPLAYED", action: replay.action, session: structuredClone(replay.session) } : { state: "IDEMPOTENCY_CONFLICT" };
    }
    if (this.session.revision !== command.input.expectedRevision) {
      return { state: "REVISION_CONFLICT", currentRevision: this.session.revision };
    }
    const transition = transitionVisitSession(this.session.lifecycleState, command.input.action);
    if (!transition) return { state: "INVALID_TRANSITION" };
    if ((transition.requiresCurrentFormalRoute || transition.requiresReplacementFormalRoute) && !this.routeAvailable) {
      return { state: "FORMAL_ROUTE_UNAVAILABLE" };
    }
    if (transition.requiresReplacementFormalRoute) {
      this.session.routePlanSnapshotId = command.input.replacementRoutePlanSnapshotId;
    }
    this.session.lifecycleState = transition.lifecycleState;
    this.session.revision += 1;
    this.session.startedAt = this.session.startedAt ?? (transition.lifecycleState === "STARTED" ? command.occurredAt : null);
    this.session.endedAt = this.session.endedAt ?? (
      transition.lifecycleState === "COMPLETED" || transition.lifecycleState === "ENDED" ? command.occurredAt : null
    );
    this.session.updatedAt = command.occurredAt;
    const receipt = this.receipt(this.session);
    this.eventKeys.set(command.idempotencyKeyHash, {
      action: command.input.action,
      expectedRevision: command.input.expectedRevision,
      routePlanSnapshotId: command.input.replacementRoutePlanSnapshotId,
      session: receipt,
    });
    return { state: "APPLIED", action: command.input.action, session: receipt };
  }

  receipt(session) {
    const receipt = { ...session };
    Reflect.deleteProperty(receipt, "owner");
    return structuredClone(receipt);
  }
}

test("service applies an idempotent, revision-checked lifecycle and never substitutes a route", async () => {
  const repository = new InMemoryVisitSessionRepository();
  const created = await createVisitSession(repository, createInput(), actor, hash("visit-create-2026-0001"), now);
  assert.equal(created.state, "CREATED");
  assert.equal(created.session.lifecycleState, "READY");
  assert.equal(created.session.revision, 1);

  const otherVisitor = await applyVisitSessionEvent(
    repository,
    ids.session,
    event("START", 1),
    otherActor,
    hash("visit-event-2026-foreign"),
    now,
  );
  assert.equal(otherVisitor.state, "NOT_FOUND");

  const invalidCreate = await createVisitSession(
    repository,
    { ...createInput(), position: [112.1, 22.2] },
    actor,
    hash("visit-create-2026-0002"),
    now,
  );
  assert.equal(invalidCreate.state, "INVALID_INPUT");
  assert.equal(repository.createCalls, 1);

  const stale = await applyVisitSessionEvent(repository, ids.session, event("START", 0), actor, hash("visit-event-2026-0001"), now);
  assert.deepEqual(stale, { state: "REVISION_CONFLICT", currentRevision: 1 });

  const started = await applyVisitSessionEvent(repository, ids.session, event("START", 1), actor, hash("visit-event-2026-0002"), now);
  assert.equal(started.state, "APPLIED");
  assert.equal(started.session.lifecycleState, "STARTED");
  assert.equal(started.session.revision, 2);

  const replayedStart = await applyVisitSessionEvent(repository, ids.session, event("START", 1), actor, hash("visit-event-2026-0002"), now);
  assert.equal(replayedStart.state, "REPLAYED");
  assert.equal(replayedStart.session.revision, 2);

  const paused = await applyVisitSessionEvent(repository, ids.session, event("PAUSE", 2), actor, hash("visit-event-2026-0003"), now);
  assert.equal(paused.session.lifecycleState, "PAUSED");
  repository.routeAvailable = false;
  const noRouteResume = await applyVisitSessionEvent(repository, ids.session, event("RESUME", 3), actor, hash("visit-event-2026-0004"), now);
  assert.equal(noRouteResume.state, "FORMAL_ROUTE_UNAVAILABLE");
  repository.routeAvailable = true;

  const replanning = await applyVisitSessionEvent(repository, ids.session, event("REPLAN", 3), actor, hash("visit-event-2026-0005"), now);
  assert.equal(replanning.session.lifecycleState, "REPLANNING");
  const recovered = await applyVisitSessionEvent(
    repository,
    ids.session,
    event("RECOVER", 4, { routePlanSnapshotId: ids.routeB }),
    actor,
    hash("visit-event-2026-0006"),
    now,
  );
  assert.equal(recovered.session.lifecycleState, "STARTED");
  assert.equal(recovered.session.routePlanSnapshotId, ids.routeB);

  const skipped = await applyVisitSessionEvent(repository, ids.session, event("SKIP", 5), actor, hash("visit-event-2026-0007"), now);
  assert.equal(skipped.session.lifecycleState, "SKIPPED");
  const resumed = await applyVisitSessionEvent(repository, ids.session, event("RESUME", 6), actor, hash("visit-event-2026-0008"), now);
  assert.equal(resumed.session.lifecycleState, "STARTED");
  const arrived = await applyVisitSessionEvent(repository, ids.session, event("ARRIVE", 7), actor, hash("visit-event-2026-0009"), now);
  assert.equal(arrived.session.lifecycleState, "ARRIVED");
  const completed = await applyVisitSessionEvent(repository, ids.session, event("END", 8), actor, hash("visit-event-2026-0010"), now);
  assert.equal(completed.session.lifecycleState, "COMPLETED");
  const deleted = await applyVisitSessionEvent(repository, ids.session, event("DELETE", 9), actor, hash("visit-event-2026-0011"), now);
  assert.equal(deleted.session.lifecycleState, "DELETED");
});
