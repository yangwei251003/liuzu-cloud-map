import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCreateVisitSessionRequest,
  handleVisitSessionEventRequest,
} from "../src/lib/server/visit-session-http.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const actor = {
  accountId: "00000000-0000-4000-8000-000000000001",
  scenicAreaId: "fictional-park",
  subject: "visitor:fictional-park:00000000-0000-4000-8000-000000000001",
};
const ids = {
  session: "00000000-0000-4000-8000-000000000002",
  itinerary: "00000000-0000-4000-8000-000000000003",
  route: "00000000-0000-4000-8000-000000000004",
  replacementRoute: "00000000-0000-4000-8000-000000000005",
};

function receipt(overrides = {}) {
  return {
    id: ids.session,
    scenicAreaId: actor.scenicAreaId,
    itineraryId: ids.itinerary,
    itineraryRevision: 1,
    routePlanSnapshotId: ids.route,
    lifecycleState: "READY",
    revision: 1,
    narrationEnabled: true,
    startedAt: null,
    endedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    scenicAreaId: actor.scenicAreaId,
    itineraryId: ids.itinerary,
    itineraryRevision: 1,
    routePlanSnapshotId: ids.route,
    narrationEnabled: true,
    expectedRevision: 0,
    ...overrides,
  };
}

function request(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: "https://tour.example",
      "content-type": "application/json",
      "idempotency-key": "visit-http-2026-0001",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  const calls = { create: 0, event: 0 };
  return {
    calls,
    repository: {
      async create(command) {
        calls.create += 1;
        return { state: "CREATED", session: receipt({ narrationEnabled: command.input.narrationEnabled }) };
      },
      async applyEvent(command) {
        calls.event += 1;
        return {
          state: "APPLIED",
          action: command.input.action,
          session: receipt({
            lifecycleState: command.input.action === "RECOVER" ? "STARTED" : "PAUSED",
            revision: command.input.expectedRevision + 1,
            routePlanSnapshotId: command.input.replacementRoutePlanSnapshotId ?? ids.route,
          }),
        };
      },
    },
    isAvailable: () => true,
    authenticate: async () => ({ state: "AUTHENTICATED", identity: actor }),
    now: () => now,
    ...overrides,
  };
}

test("create handler uses no-store, request IDs, same-origin, authenticated ownership, bounded JSON, and hashed idempotency", async () => {
  const deps = dependencies();
  const response = await handleCreateVisitSessionRequest(
    request("https://tour.example/api/v1/visit-sessions", createInput()),
    deps,
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const body = await response.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(body.session.lifecycleState, "READY");
  assert.equal(deps.calls.create, 1);

  const crossOrigin = await handleCreateVisitSessionRequest(
    request("https://tour.example/api/v1/visit-sessions", createInput(), { origin: "https://attacker.example" }),
    deps,
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "REQUEST_REJECTED");

  const coordinateAttempt = await handleCreateVisitSessionRequest(
    request("https://tour.example/api/v1/visit-sessions", { ...createInput(), position: [112.1, 22.2] }),
    deps,
  );
  assert.equal(coordinateAttempt.status, 400);
  assert.equal((await coordinateAttempt.json()).error.code, "INVALID_SESSION_REQUEST");
  assert.equal(deps.calls.create, 1);

  const noKey = await handleCreateVisitSessionRequest(
    request("https://tour.example/api/v1/visit-sessions", createInput(), { "idempotency-key": "" }),
    deps,
  );
  assert.equal(noKey.status, 400);
  assert.equal((await noKey.json()).error.code, "IDEMPOTENCY_REQUIRED");
});

test("event handler accepts only coarse lifecycle actions and refuses unavailable server persistence", async () => {
  const deps = dependencies();
  const recovered = await handleVisitSessionEventRequest(
    request(
      `https://tour.example/api/v1/visit-sessions/${ids.session}/events`,
      { action: "RECOVER", expectedRevision: 4, routePlanSnapshotId: ids.replacementRoute },
      { "idempotency-key": "visit-http-2026-0002" },
    ),
    deps,
    ids.session,
  );
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).session.routePlanSnapshotId, ids.replacementRoute);
  assert.equal(deps.calls.event, 1);

  const routeAttempt = await handleVisitSessionEventRequest(
    request(
      `https://tour.example/api/v1/visit-sessions/${ids.session}/events`,
      { action: "ARRIVE", expectedRevision: 5, aiRoute: { points: [[112.1, 22.2]] } },
      { "idempotency-key": "visit-http-2026-0003" },
    ),
    deps,
    ids.session,
  );
  assert.equal(routeAttempt.status, 400);
  assert.equal((await routeAttempt.json()).error.code, "INVALID_SESSION_REQUEST");
  assert.equal(deps.calls.event, 1);

  const unavailable = await handleVisitSessionEventRequest(
    request(
      `https://tour.example/api/v1/visit-sessions/${ids.session}/events`,
      { action: "PAUSE", expectedRevision: 2 },
      { "idempotency-key": "visit-http-2026-0004" },
    ),
    dependencies({ isAvailable: () => false }),
    ids.session,
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "VISIT_SESSION_UNAVAILABLE");

  const anonymous = await handleVisitSessionEventRequest(
    request(
      `https://tour.example/api/v1/visit-sessions/${ids.session}/events`,
      { action: "PAUSE", expectedRevision: 2 },
      { "idempotency-key": "visit-http-2026-0005" },
    ),
    dependencies({ authenticate: async () => ({ state: "AUTH_REQUIRED" }) }),
    ids.session,
  );
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "AUTH_REQUIRED");
});
