import assert from "node:assert/strict";
import test from "node:test";

import {
  createSavedItinerary,
  deleteSavedItinerary,
  editSavedItinerary,
  hashItineraryIdempotencyKey,
  listSavedItineraries,
  readSavedItinerary,
} from "../src/lib/server/itinerary-revision-service.ts";

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
  itinerary: "00000000-0000-4000-8000-000000000010",
  entrance: "00000000-0000-4000-8000-000000000011",
  poiOne: "00000000-0000-4000-8000-000000000012",
  poiTwo: "00000000-0000-4000-8000-000000000013",
  poiThree: "00000000-0000-4000-8000-000000000014",
};

function createInput(overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: actor.scenicAreaId,
    expectedRevision: 0,
    title: "虚构景区半日游",
    startsAt: "2026-08-15T09:00:00.000Z",
    entranceId: ids.entrance,
    stops: [
      { poiId: ids.poiOne, dwellMinutes: 30 },
      { poiId: ids.poiTwo, dwellMinutes: 45 },
    ],
    ...overrides,
  };
}

function editInput(overrides = {}) {
  const base = createInput();
  Reflect.deleteProperty(base, "scenicAreaId");
  return {
    ...base,
    expectedRevision: 1,
    title: "虚构景区顺序调整",
    stops: [
      { poiId: ids.poiTwo, dwellMinutes: 50 },
      { poiId: ids.poiThree, dwellMinutes: null },
    ],
    ...overrides,
  };
}

function hash(key) {
  const value = hashItineraryIdempotencyKey(key);
  assert.ok(value);
  return value;
}

class InMemoryItineraryRepository {
  constructor() {
    this.record = null;
    this.operations = new Map();
    this.publishedPoiIds = new Set([ids.poiOne, ids.poiTwo, ids.poiThree]);
    this.createCalls = 0;
    this.executionInvalidations = 0;
  }

  validCatalog(input) {
    return input.stops.every((stop) => this.publishedPoiIds.has(stop.poiId)) && input.entranceId === ids.entrance;
  }

  receipt(record = this.record) {
    const revision = record.revisions.at(-1);
    return {
      id: ids.itinerary,
      scenicAreaId: actor.scenicAreaId,
      revision: record.revision,
      lifecycleState: "SAVED",
      title: revision.title,
      startsAt: revision.startsAt,
      entranceId: revision.entranceId,
      executionState: "REPLAN_REQUIRED",
      stops: revision.stops.map((stop, index) => ({
        sequence: index + 1,
        poiId: stop.poiId,
        label: `已发布地点-${index + 1}`,
        dwellMinutes: stop.dwellMinutes,
      })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  same(recipient, input) {
    return recipient.title === input.title
      && recipient.startsAt === input.startsAt
      && recipient.entranceId === input.entranceId
      && recipient.stops.length === input.stops.length
      && recipient.stops.every((stop, index) => stop.poiId === input.stops[index].poiId && stop.dwellMinutes === input.stops[index].dwellMinutes);
  }

  async list(identity) {
    return this.record && !this.record.deleted && this.record.owner === identity.accountId ? [this.receipt()] : [];
  }

  async read(identity, itineraryId) {
    if (!this.record || this.record.deleted || itineraryId !== ids.itinerary || identity.accountId !== this.record.owner) return null;
    return this.receipt();
  }

  async create(command) {
    this.createCalls += 1;
    const prior = this.operations.get(command.idempotencyKeyHash);
    if (prior) return prior.kind === "CREATE" && this.same(prior.itinerary, command.input)
      ? { state: "REPLAYED", itinerary: structuredClone(prior.itinerary) }
      : { state: "IDEMPOTENCY_CONFLICT" };
    if (!this.validCatalog(command.input)) return { state: "PUBLISHED_CATALOG_UNAVAILABLE" };
    this.record = {
      owner: command.identity.accountId,
      revision: 1,
      revisions: [structuredClone(command.input)],
      createdAt: command.occurredAt,
      updatedAt: command.occurredAt,
      deleted: false,
    };
    const itinerary = this.receipt();
    this.operations.set(command.idempotencyKeyHash, { kind: "CREATE", itinerary: structuredClone(itinerary) });
    return { state: "CREATED", itinerary };
  }

  async edit(command) {
    if (!this.record || this.record.deleted || command.itineraryId !== ids.itinerary || command.identity.accountId !== this.record.owner) {
      return { state: "NOT_FOUND" };
    }
    const prior = this.operations.get(command.idempotencyKeyHash);
    if (prior) return prior.kind === "EDIT" && this.same(prior.itinerary, command.input)
      ? { state: "REPLAYED", itinerary: structuredClone(prior.itinerary) }
      : { state: "IDEMPOTENCY_CONFLICT" };
    if (command.input.expectedRevision !== this.record.revision) {
      return { state: "REVISION_CONFLICT", currentRevision: this.record.revision };
    }
    if (!this.validCatalog(command.input)) return { state: "PUBLISHED_CATALOG_UNAVAILABLE" };
    // The old revision is intentionally retained unchanged; route/session
    // execution has to be regenerated from the new revision.
    this.record.revisions.push(structuredClone(command.input));
    this.record.revision += 1;
    this.record.updatedAt = command.occurredAt;
    this.executionInvalidations += 1;
    const itinerary = this.receipt();
    this.operations.set(command.idempotencyKeyHash, { kind: "EDIT", itinerary: structuredClone(itinerary) });
    return { state: "UPDATED", itinerary };
  }

  async remove(command) {
    if (!this.record || command.itineraryId !== ids.itinerary || command.identity.accountId !== this.record.owner) return { state: "NOT_FOUND" };
    const prior = this.operations.get(command.idempotencyKeyHash);
    if (this.record.deleted) {
      return prior?.kind === "DELETE"
        ? { state: "REPLAYED", itinerary: structuredClone(prior.itinerary) }
        : { state: "NOT_FOUND" };
    }
    if (prior) return { state: "IDEMPOTENCY_CONFLICT" };
    if (command.input.expectedRevision !== this.record.revision) {
      return { state: "REVISION_CONFLICT", currentRevision: this.record.revision };
    }
    this.record.revision += 1;
    this.record.deleted = true;
    this.record.updatedAt = command.occurredAt;
    this.executionInvalidations += 1;
    const itinerary = {
      id: ids.itinerary,
      scenicAreaId: actor.scenicAreaId,
      revision: this.record.revision,
      lifecycleState: "DELETED",
      executionState: "INVALIDATED",
      deletedAt: command.occurredAt,
    };
    this.operations.set(command.idempotencyKeyHash, { kind: "DELETE", itinerary: structuredClone(itinerary) });
    return { state: "DELETED", itinerary };
  }
}

test("saved itinerary lifecycle is owner-only, immutable by revision, and invalidates old execution", async () => {
  const repository = new InMemoryItineraryRepository();
  const created = await createSavedItinerary(repository, createInput(), actor, hash("itinerary-create-2026-0001"), now);
  assert.equal(created.state, "CREATED");
  assert.equal(created.itinerary.revision, 1);
  assert.equal(created.itinerary.executionState, "REPLAN_REQUIRED");
  assert.equal(repository.record.revisions.length, 1);

  const foreignRead = await readSavedItinerary(repository, otherActor, ids.itinerary);
  assert.deepEqual(foreignRead, { state: "NOT_FOUND" });

  const foreignEdit = await editSavedItinerary(
    repository,
    ids.itinerary,
    editInput(),
    otherActor,
    hash("itinerary-edit-2026-foreign"),
    now,
  );
  assert.deepEqual(foreignEdit, { state: "NOT_FOUND" });

  const originalStops = structuredClone(repository.record.revisions[0].stops);
  const updated = await editSavedItinerary(repository, ids.itinerary, editInput(), actor, hash("itinerary-edit-2026-0001"), now);
  assert.equal(updated.state, "UPDATED");
  assert.equal(updated.itinerary.revision, 2);
  assert.equal(updated.itinerary.stops[0].poiId, ids.poiTwo);
  assert.equal(repository.record.revisions.length, 2);
  assert.deepEqual(repository.record.revisions[0].stops, originalStops);
  assert.equal(repository.executionInvalidations, 1);

  const stale = await editSavedItinerary(
    repository,
    ids.itinerary,
    editInput({ title: "过期编辑", expectedRevision: 1 }),
    actor,
    hash("itinerary-edit-2026-0002"),
    now,
  );
  assert.deepEqual(stale, { state: "REVISION_CONFLICT", currentRevision: 2 });

  const replayed = await editSavedItinerary(repository, ids.itinerary, editInput(), actor, hash("itinerary-edit-2026-0001"), now);
  assert.equal(replayed.state, "REPLAYED");
  assert.equal(replayed.itinerary.revision, 2);

  const list = await listSavedItineraries(repository, actor);
  assert.equal(list.state, "AVAILABLE");
  assert.equal(list.itineraries.length, 1);
});

test("write contract rejects coordinates, AI routes, unpublished POIs, and keeps delete revisioned", async () => {
  const repository = new InMemoryItineraryRepository();
  const invalidCoordinates = await createSavedItinerary(
    repository,
    { ...createInput(), coordinates: [112.1, 22.2] },
    actor,
    hash("itinerary-create-2026-coordinates"),
    now,
  );
  assert.deepEqual(invalidCoordinates, { state: "INVALID_INPUT" });
  assert.equal(repository.createCalls, 0);

  const invalidRoute = await createSavedItinerary(
    repository,
    { ...createInput(), aiRoute: { geometry: [[112.1, 22.2], [112.2, 22.3]] } },
    actor,
    hash("itinerary-create-2026-ai-route"),
    now,
  );
  assert.deepEqual(invalidRoute, { state: "INVALID_INPUT" });

  const unavailableCatalog = await createSavedItinerary(
    repository,
    createInput({ stops: [{ poiId: "00000000-0000-4000-8000-000000000088", dwellMinutes: 10 }] }),
    actor,
    hash("itinerary-create-2026-unpublished"),
    now,
  );
  assert.deepEqual(unavailableCatalog, { state: "PUBLISHED_CATALOG_UNAVAILABLE" });

  const created = await createSavedItinerary(repository, createInput(), actor, hash("itinerary-create-2026-0002"), now);
  assert.equal(created.state, "CREATED");
  const deleted = await deleteSavedItinerary(
    repository,
    ids.itinerary,
    { schemaVersion: 1, expectedRevision: 1 },
    actor,
    hash("itinerary-delete-2026-0001"),
    now,
  );
  assert.equal(deleted.state, "DELETED");
  assert.equal(deleted.itinerary.revision, 2);
  assert.equal(deleted.itinerary.executionState, "INVALIDATED");
  assert.equal(repository.executionInvalidations, 1);
  const replayedDelete = await deleteSavedItinerary(
    repository,
    ids.itinerary,
    { schemaVersion: 1, expectedRevision: 1 },
    actor,
    hash("itinerary-delete-2026-0001"),
    now,
  );
  assert.equal(replayedDelete.state, "REPLAYED");
});
