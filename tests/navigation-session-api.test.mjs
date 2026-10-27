import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  handleCreateNavigationSession,
  handleNavigationSessionEvent,
  handleNavigationSessionHistory,
} from "../src/lib/server/navigation-session-http.ts";

const now = new Date("2026-08-16T08:00:00.000Z");
const identity = { accountId: "00000000-0000-4000-8000-000000000001", scenicAreaId: "fictional-park", subject: "visitor:fictional" };
const sessionId = "00000000-0000-4000-8000-000000000002";

function binding(overrides = {}) {
  return {
    scenicAreaId: identity.scenicAreaId,
    fromNodeId: "entry-node",
    toNodeId: "waterfall-node",
    expectedNetworkRevision: "network-v1",
    expectedOperationalVersion: 3,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    optimization: "FASTEST",
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY"] },
    routeFingerprint: "drp1-1234abcd",
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    schemaVersion: 1,
    routeFingerprint: "drp1-1234abcd",
    scenicAreaId: identity.scenicAreaId,
    networkRevision: "network-v1",
    operationalVersion: 3,
    originNodeId: "entry-node",
    destinationNodeId: "waterfall-node",
    profile: binding().profile,
    optimization: "FASTEST",
    preference: binding().preference,
    dynamicFactorsApplied: true,
    traversals: [],
    edgeIds: [],
    distanceMeters: 842.4,
    estimatedMinutes: 12.4,
    geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20]] },
    notices: [],
    generatedAt: now.toISOString(),
    expiresAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    id: sessionId,
    scenicAreaId: identity.scenicAreaId,
    routeFingerprint: "drp1-1234abcd",
    optimization: "FASTEST",
    originNodeId: "entry-node",
    destinationNodeId: "waterfall-node",
    networkRevision: "network-v1",
    operationalVersion: 3,
    status: "READY",
    revision: 0,
    distanceMeters: 842.4,
    estimatedMinutes: 12.4,
    remainingDistanceBucketMeters: 850,
    startedAt: null,
    endedAt: null,
    expiresAt: "2026-08-16T10:00:00.000Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const calls = { create: 0, event: 0, history: 0, plan: 0 };
  return {
    calls,
    repository: {
      async create() { calls.create += 1; return { state: "CREATED", session: receipt() }; },
      async applyEvent(command) { calls.event += 1; return { state: "APPLIED", action: command.input.action, session: receipt({ status: "PAUSED", revision: 2, remainingDistanceBucketMeters: command.remainingDistanceBucketMeters }) }; },
      async listHistory() { calls.history += 1; return { sessions: [receipt()], nextCursor: null }; },
    },
    async resolvePlan() { calls.plan += 1; return { state: "AVAILABLE", plan: plan() }; },
    isAvailable: () => true,
    authenticate: async () => ({ state: "AUTHENTICATED", identity }),
    now: () => now,
    ...overrides,
  };
}

function post(url, body, key = "navigation-http-2026-0001") {
  return new Request(url, { method: "POST", headers: { origin: "https://tour.example", "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
}

test("create navigation session replays the route server-side and never accepts coordinates", async () => {
  const deps = dependencies();
  const response = await handleCreateNavigationSession(post("https://tour.example/api/v1/navigation-sessions", binding()), deps);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.session.status, "READY");
  assert.equal(deps.calls.plan, 1);
  assert.equal(deps.calls.create, 1);
  assert.doesNotMatch(JSON.stringify(body), /latitude|longitude|geometry/i);

  const injected = await handleCreateNavigationSession(post("https://tour.example/api/v1/navigation-sessions", { ...binding(), latitude: 20 }, "navigation-http-2026-0002"), deps);
  assert.equal(injected.status, 400);
  assert.equal((await injected.json()).error.code, "INVALID_NAVIGATION_REQUEST");
  assert.equal(deps.calls.plan, 1);

  const mismatchDeps = dependencies({ resolvePlan: async () => ({ state: "AVAILABLE", plan: plan({ routeFingerprint: "drp1-deadbeef" }) }) });
  const mismatch = await handleCreateNavigationSession(post("https://tour.example/api/v1/navigation-sessions", binding(), "navigation-http-2026-0003"), mismatchDeps);
  assert.equal(mismatch.status, 503);
  assert.equal((await mismatch.json()).error.code, "FORMAL_ROUTE_UNAVAILABLE");
  assert.equal(mismatchDeps.calls.create, 0);
});

test("event API stores only revisioned coarse lifecycle and bucketed remaining distance", async () => {
  const deps = dependencies();
  const response = await handleNavigationSessionEvent(post(`https://tour.example/api/v1/navigation-sessions/${sessionId}/events`, {
    action: "PAUSE", expectedRevision: 1, remainingDistanceMeters: 801, reasonCode: "USER_PAUSED",
  }, "navigation-http-2026-0010"), deps, sessionId);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.remainingDistanceBucketMeters, 850);
  assert.equal(deps.calls.event, 1);

  const coordinate = await handleNavigationSessionEvent(post(`https://tour.example/api/v1/navigation-sessions/${sessionId}/events`, {
    action: "CANCEL", expectedRevision: 2, remainingDistanceMeters: 700, reasonCode: "USER_EXIT", position: [100, 20],
  }, "navigation-http-2026-0011"), deps, sessionId);
  assert.equal(coordinate.status, 400);
  assert.equal(deps.calls.event, 1);
});

test("private history is authenticated, paginated and fails closed when capability is disabled", async () => {
  const deps = dependencies();
  const response = await handleNavigationSessionHistory(new Request("https://tour.example/api/v1/navigation-sessions?limit=10"), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 1);
  assert.doesNotMatch(JSON.stringify(body), /latitude|longitude|heading|track/i);
  assert.equal(deps.calls.history, 1);

  const anonymous = await handleNavigationSessionHistory(new Request("https://tour.example/api/v1/navigation-sessions"), dependencies({ authenticate: async () => ({ state: "AUTH_REQUIRED" }) }));
  assert.equal(anonymous.status, 401);
  const unavailable = await handleNavigationSessionHistory(new Request("https://tour.example/api/v1/navigation-sessions"), dependencies({ isAvailable: () => false }));
  assert.equal(unavailable.status, 503);
});

test("PostgreSQL event replay is scoped to the authenticated scenic account", async () => {
  const source = await readFile(new URL("../src/lib/server/navigation-session-repository.ts", import.meta.url), "utf8");
  const replayQuery = source.slice(source.indexOf("const replayRows"), source.indexOf("const replay ="));
  assert.match(replayQuery, /INNER JOIN navigation_sessions AS session/);
  assert.match(replayQuery, /event\.scenic_area_id = \$\{command\.identity\.scenicAreaId\}/);
  assert.match(replayQuery, /session\.account_id = \$\{command\.identity\.accountId\}/);
  assert.match(replayQuery, /session\.create_idempotency_key_hash IS NOT NULL/);
});
