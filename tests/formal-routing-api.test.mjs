import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  handleFormalRoutePlanRequest,
  handleFormalScenicSnapshotRequest,
} from "../src/lib/server/formal-routing-http.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

async function repository(withRecommendation = false) {
  const [routeNetwork, operationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  const record = {
    scenicAreaId: "fictional-park",
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    snapshotJson: { schemaVersion: 1, routeNetwork, operationalState },
  };
  if (withRecommendation) {
    routeNetwork.recommendedRoutes = [{
      id: "recommended-main-walk",
      name: "Fictional reviewed main walk",
      originNodeId: "internal-entry",
      destinationNodeId: "destination",
      segments: [{ edgeId: "edge-main-start", traversalDirection: "FORWARD" }, { edgeId: "edge-main-finish", traversalDirection: "FORWARD" }],
      traversalModes: ["BOARDWALK"],
      distanceMeters: 200,
      estimatedMinutes: 4,
      sourceReference: "https://evidence.example.test/routes/main-walk",
    }];
  }
  return {
    async readCurrentPublishedSnapshot(scenicAreaId) {
      return scenicAreaId === record.scenicAreaId ? structuredClone(record) : null;
    },
  };
}

function routeRequest(body, headers = {}) {
  return new Request("https://example.test/api/v1/route-plans", {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function validRouteBody(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    fromNodeId: "public-origin",
    toNodeId: "destination",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    optimization: "FASTEST",
    preference: {
      pace: "BALANCED",
      maximumDifficulty: "HARD",
      allowedTraversalModes: ["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"],
    },
    ...overrides,
  };
}

test("snapshot API handler returns no-store, request-scoped published data only", async () => {
  const response = await handleFormalScenicSnapshotRequest(
    new Request("https://example.test/api/v1/scenic-areas/fictional-park/snapshot"),
    await repository(),
    "fictional-park",
    now,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  const body = await response.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(body.snapshot.networkRevision, "fictional-network-v1");
});

test("route-plan API handler accepts exact-node JSON and returns a pure directed plan", async () => {
  const response = await handleFormalRoutePlanRequest(routeRequest(validRouteBody()), await repository(), now);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(body.routePlan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
  assert.equal(body.routePlan.optimization, "FASTEST");
  assert.equal(body.routePlan.dynamicFactorsApplied, true);
});

test("route-plan API exposes reviewed scenic routing without accepting caller-supplied weights", async () => {
  const response = await handleFormalRoutePlanRequest(routeRequest(validRouteBody({ optimization: "SCENIC" })), await repository(), now);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.routePlan.edgeIds, ["edge-public-access", "edge-main-start", "edge-main-finish"]);

  const injectedWeight = await handleFormalRoutePlanRequest(routeRequest({
    ...validRouteBody(),
    edgeWeights: { "edge-stairs-shortcut": 0 },
  }), await repository(), now);
  assert.equal(injectedWeight.status, 400);
  assert.equal((await injectedWeight.json()).error.code, "INVALID_ROUTE_REQUEST");
});

test("route-plan API accepts only a current published recommendation identifier", async () => {
  const response = await handleFormalRoutePlanRequest(routeRequest(validRouteBody({
    fromNodeId: "internal-entry",
    recommendedRouteId: "recommended-main-walk",
    optimization: "SCENIC",
  })), await repository(true), now);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.routePlan.recommendedRouteId, "recommended-main-walk");
  assert.deepEqual(body.routePlan.edgeIds, ["edge-main-start", "edge-main-finish"]);

  const unknown = await handleFormalRoutePlanRequest(routeRequest(validRouteBody({
    fromNodeId: "internal-entry",
    recommendedRouteId: "recommended-unknown",
  })), await repository(true), now);
  assert.equal(unknown.status, 422);
  assert.equal((await unknown.json()).error.code, "ROUTE_UNAVAILABLE");
});

test("route-plan API handler rejects cross-origin, oversized and coordinate-style requests before routing", async () => {
  const repo = await repository();
  const crossOrigin = await handleFormalRoutePlanRequest(new Request("https://example.test/api/v1/route-plans", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify(validRouteBody()),
  }), repo, now);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "REQUEST_REJECTED");

  const coordinateStyle = await handleFormalRoutePlanRequest(routeRequest({
    ...validRouteBody(),
    originCoordinate: [100, 20],
  }), repo, now);
  assert.equal(coordinateStyle.status, 400);
  assert.equal((await coordinateStyle.json()).error.code, "INVALID_ROUTE_REQUEST");

  const oversized = await handleFormalRoutePlanRequest(new Request("https://example.test/api/v1/route-plans", {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json", "content-length": "4097" },
    body: "{}",
  }), repo, now);
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");
});

test("both API handlers expose the same stable formal-network 503 when no published snapshot exists", async () => {
  const unavailable = { async readCurrentPublishedSnapshot() { return null; } };
  const snapshot = await handleFormalScenicSnapshotRequest(
    new Request("https://example.test/api/v1/scenic-areas/fictional-park/snapshot"),
    unavailable,
    "fictional-park",
    now,
  );
  const plan = await handleFormalRoutePlanRequest(routeRequest(validRouteBody()), unavailable, now);
  assert.equal(snapshot.status, 503);
  assert.equal(plan.status, 503);
  assert.equal((await snapshot.json()).error.code, "FORMAL_NETWORK_UNAVAILABLE");
  assert.equal((await plan.json()).error.code, "FORMAL_NETWORK_UNAVAILABLE");
});
