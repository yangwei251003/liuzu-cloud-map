import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCreateItineraryRequest,
  handleEditItineraryRequest,
  handleListItinerariesRequest,
  handleReadItineraryRequest,
} from "../src/lib/server/itinerary-revision-http.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const actor = {
  accountId: "00000000-0000-4000-8000-000000000001",
  scenicAreaId: "fictional-park",
  subject: "visitor:fictional-park:00000000-0000-4000-8000-000000000001",
};
const ids = {
  itinerary: "00000000-0000-4000-8000-000000000010",
  entrance: "00000000-0000-4000-8000-000000000011",
  poiOne: "00000000-0000-4000-8000-000000000012",
  poiTwo: "00000000-0000-4000-8000-000000000013",
};

function receipt(overrides = {}) {
  return {
    id: ids.itinerary,
    scenicAreaId: actor.scenicAreaId,
    revision: 1,
    lifecycleState: "SAVED",
    title: "虚构景区半日游",
    startsAt: "2026-08-15T09:00:00.000Z",
    entranceId: ids.entrance,
    executionState: "REPLAN_REQUIRED",
    stops: [
      { sequence: 1, poiId: ids.poiOne, label: "已发布地点一", dwellMinutes: 30 },
      { sequence: 2, poiId: ids.poiTwo, label: "已发布地点二", dwellMinutes: 45 },
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

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

function writeRequest(method, url, body, headers = {}) {
  return new Request(url, {
    method,
    headers: {
      origin: "https://tour.example",
      "content-type": "application/json",
      "idempotency-key": "itinerary-http-2026-0001",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  const calls = { create: 0, edit: 0 };
  return {
    calls,
    repository: {
      async list() {
        return [receipt()];
      },
      async read(_identity, itineraryId) {
        return itineraryId === ids.itinerary ? receipt() : null;
      },
      async create(command) {
        calls.create += 1;
        return { state: "CREATED", itinerary: receipt({ title: command.input.title }) };
      },
      async edit(command) {
        calls.edit += 1;
        return { state: "UPDATED", itinerary: receipt({ revision: 2, title: command.input.title, updatedAt: now.toISOString() }) };
      },
      async remove() {
        return {
          state: "DELETED",
          itinerary: {
            id: ids.itinerary,
            scenicAreaId: actor.scenicAreaId,
            revision: 2,
            lifecycleState: "DELETED",
            executionState: "INVALIDATED",
            deletedAt: now.toISOString(),
          },
        };
      },
    },
    isAvailable: () => true,
    authenticate: async () => ({ state: "AUTHENTICATED", identity: actor }),
    now: () => now,
    ...overrides,
  };
}

test("itinerary handlers use no-store, request IDs, same-origin, bounded writes and closed input", async () => {
  const deps = dependencies();
  const created = await handleCreateItineraryRequest(
    writeRequest("POST", "https://tour.example/api/v1/itineraries", createInput()),
    deps,
  );
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(created.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(created.headers.get("referrer-policy"), "no-referrer");
  const body = await created.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(created.headers.get("x-request-id"), body.requestId);
  assert.equal(deps.calls.create, 1);

  const coordinateAttempt = await handleCreateItineraryRequest(
    writeRequest("POST", "https://tour.example/api/v1/itineraries", { ...createInput(), coordinates: [112.1, 22.2] }),
    deps,
  );
  assert.equal(coordinateAttempt.status, 400);
  assert.equal((await coordinateAttempt.json()).error.code, "INVALID_ITINERARY");
  assert.equal(deps.calls.create, 1);

  const routeAttempt = await handleCreateItineraryRequest(
    writeRequest("POST", "https://tour.example/api/v1/itineraries", { ...createInput(), routeGeometry: [[112.1, 22.2]] }),
    deps,
  );
  assert.equal(routeAttempt.status, 400);
  assert.equal((await routeAttempt.json()).error.code, "INVALID_ITINERARY");

  const crossOrigin = await handleCreateItineraryRequest(
    writeRequest("POST", "https://tour.example/api/v1/itineraries", createInput(), { origin: "https://attacker.example" }),
    deps,
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "REQUEST_REJECTED");

  const noKey = await handleCreateItineraryRequest(
    writeRequest("POST", "https://tour.example/api/v1/itineraries", createInput(), { "idempotency-key": "" }),
    deps,
  );
  assert.equal(noKey.status, 400);
  assert.equal((await noKey.json()).error.code, "IDEMPOTENCY_REQUIRED");
});

test("itinerary read and edit avoid IDOR and fail closed when persistent capability is unavailable", async () => {
  const deps = dependencies();
  const list = await handleListItinerariesRequest(
    new Request("https://tour.example/api/v1/itineraries"),
    deps,
  );
  assert.equal(list.status, 200);
  assert.equal((await list.json()).itineraries.length, 1);

  const foreignId = await handleReadItineraryRequest(
    new Request("https://tour.example/api/v1/itineraries/00000000-0000-4000-8000-000000000099"),
    deps,
    "00000000-0000-4000-8000-000000000099",
  );
  assert.equal(foreignId.status, 404);
  assert.equal((await foreignId.json()).error.code, "ITINERARY_NOT_FOUND");

  const invalidEdit = await handleEditItineraryRequest(
    writeRequest("PATCH", `https://tour.example/api/v1/itineraries/${ids.itinerary}`, {
      schemaVersion: 1,
      expectedRevision: 1,
      title: "尝试携带导航线",
      startsAt: null,
      entranceId: null,
      stops: [{ poiId: ids.poiOne, dwellMinutes: 10 }],
      aiRoute: { geometry: [[112.1, 22.2]] },
    }, { "idempotency-key": "itinerary-http-2026-0002" }),
    deps,
    ids.itinerary,
  );
  assert.equal(invalidEdit.status, 400);
  assert.equal(deps.calls.edit, 0);

  const unavailable = await handleListItinerariesRequest(
    new Request("https://tour.example/api/v1/itineraries"),
    dependencies({ isAvailable: () => false }),
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "ITINERARY_UNAVAILABLE");
});
