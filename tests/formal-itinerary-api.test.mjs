import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleFormalScenicItineraryRequest } from "../src/lib/server/formal-itinerary-http.ts";

const now = new Date("2026-08-16T01:00:00.000Z");
const routeNetworkFixture = JSON.parse(await readFile(new URL("./fixtures/fictional-directed-route-network.v1.json", import.meta.url), "utf8"));
const operationalStateFixture = JSON.parse(await readFile(new URL("./fixtures/fictional-route-operational-state.v1.json", import.meta.url), "utf8"));

function repository() {
  const routeNetwork = structuredClone(routeNetworkFixture);
  Object.assign(routeNetwork.nodes.find((node) => node.id === "destination"), {
    displayName: "虚构历史观景点",
    poiId: "fictional-history-view",
    visit: {
      interestTags: ["HISTORY", "PHOTOGRAPHY", "REST"],
      dwellMinutes: 30,
      editorialPriority: 80,
      familyFriendly: true,
      restArea: true,
      photoSpot: true,
      evidenceReference: "TEST-EVIDENCE://fictional/visit/destination",
    },
  });
  const record = {
    scenicAreaId: "fictional-park",
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    snapshotJson: { schemaVersion: 1, routeNetwork, operationalState: operationalStateFixture },
  };
  return { async readCurrentPublishedSnapshot(id) { return id === record.scenicAreaId ? structuredClone(record) : null; } };
}

function validBody(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    originNodeId: "public-origin",
    exitNodeId: "one-way-end",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    budgetMinutes: 180,
    interests: ["HISTORY", "PHOTOGRAPHY"],
    companion: "SOLO",
    maxStops: 5,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"] },
    ...overrides,
  };
}

function request(body, origin = "https://example.test") {
  return new Request("https://example.test/api/v1/scenic-itineraries", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("formal itinerary API returns a reviewed multi-stop plan with no-store headers", async () => {
  const response = await handleFormalScenicItineraryRequest(request(validBody()), repository(), now);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.json();
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.match(body.itinerary.itineraryFingerprint, /^sip1-[0-9a-f]{8}$/);
  assert.equal(body.itinerary.stops[0].nodeId, "destination");
  assert.equal(body.itinerary.segments.length, 2);
});

test("itinerary API rejects coordinates, arbitrary weights, dwell injection and cross-origin writes", async () => {
  for (const field of [
    { originCoordinate: [100, 20] },
    { edgeWeights: { "edge-main-start": -100 } },
    { dwellMinutes: 0 },
  ]) {
    const response = await handleFormalScenicItineraryRequest(request({ ...validBody(), ...field }), repository(), now);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_ITINERARY_REQUEST");
  }
  const crossOrigin = await handleFormalScenicItineraryRequest(request(validBody(), "https://attacker.test"), repository(), now);
  assert.equal(crossOrigin.status, 403);
});

test("missing formal data and changed route versions fail closed", async () => {
  const missing = await handleFormalScenicItineraryRequest(request(validBody()), { async readCurrentPublishedSnapshot() { return null; } }, now);
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, "FORMAL_NETWORK_UNAVAILABLE");

  const changed = await handleFormalScenicItineraryRequest(request(validBody({ expectedOperationalVersion: 8 })), repository(), now);
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error.code, "ROUTE_VERSION_CHANGED");
});
