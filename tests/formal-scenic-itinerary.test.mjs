import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  interpretScenicItineraryPrompt,
  planFormalScenicItinerary,
} from "../src/lib/formal-scenic-itinerary.ts";

const networkFixture = JSON.parse(await readFile(new URL("./fixtures/fictional-directed-route-network.v1.json", import.meta.url), "utf8"));
const stateFixture = JSON.parse(await readFile(new URL("./fixtures/fictional-route-operational-state.v1.json", import.meta.url), "utf8"));
const now = new Date("2026-08-16T01:00:00.000Z");

function networkWithVisit(overrides = {}) {
  const network = structuredClone(networkFixture);
  const destination = network.nodes.find((node) => node.id === "destination");
  Object.assign(destination, {
    displayName: "虚构历史观景点",
    poiId: "fictional-history-view",
    visit: {
      interestTags: ["HISTORY", "CULTURE", "PHOTOGRAPHY", "REST"],
      dwellMinutes: 30,
      editorialPriority: 80,
      familyFriendly: true,
      restArea: true,
      photoSpot: true,
      evidenceReference: "TEST-EVIDENCE://fictional/visit/destination",
    },
  });
  return Object.assign(network, overrides);
}

function input(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    originNodeId: "public-origin",
    exitNodeId: "one-way-end",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    budgetMinutes: 120,
    interests: ["HISTORY", "PHOTOGRAPHY"],
    companion: "SOLO",
    maxStops: 4,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"] },
    ...overrides,
  };
}

test("formal itinerary selects only reviewed visit nodes and returns deterministic route segments to the exit", () => {
  const first = planFormalScenicItinerary(networkWithVisit(), stateFixture, input(), now);
  const second = planFormalScenicItinerary(networkWithVisit(), stateFixture, input(), now);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  if (!first.ok) return;
  assert.equal(first.itinerary.stops.length, 1);
  assert.equal(first.itinerary.stops[0].nodeId, "destination");
  assert.deepEqual(first.itinerary.stops[0].matchedInterests, ["HISTORY", "PHOTOGRAPHY"]);
  assert.equal(first.itinerary.segments.length, 2);
  assert.equal(first.itinerary.segments[0].originNodeId, "public-origin");
  assert.equal(first.itinerary.segments[1].destinationNodeId, "one-way-end");
  assert.ok(first.itinerary.totalMinutes <= first.itinerary.budgetMinutes);
  assert.match(first.itinerary.itineraryFingerprint, /^sip1-[0-9a-f]{8}$/);
});

test("missing visit evidence, family incompatibility and inadequate budgets fail closed", () => {
  const missing = planFormalScenicItinerary(networkFixture, stateFixture, input(), now);
  assert.deepEqual(missing.ok ? null : missing.code, "ITINERARY_ATTRIBUTES_UNAVAILABLE");

  const incompatible = networkWithVisit();
  incompatible.nodes.find((node) => node.id === "destination").visit.familyFriendly = false;
  const family = planFormalScenicItinerary(incompatible, stateFixture, input({ companion: "FAMILY" }), now);
  assert.deepEqual(family.ok ? null : family.code, "ITINERARY_ATTRIBUTES_UNAVAILABLE");

  const short = planFormalScenicItinerary(networkWithVisit(), stateFixture, input({ budgetMinutes: 60, preference: { ...input().preference, pace: "RELAXED" } }), now);
  assert.ok(short.ok || short.code === "NO_FEASIBLE_ITINERARY");
  if (short.ok) assert.ok(short.itinerary.totalMinutes <= 60);
});

test("natural-language intent extraction makes duration, pace, interests and companion explicit for confirmation", () => {
  assert.deepEqual(interpretScenicItineraryPrompt("我只有3小时，希望和父母轻松游玩，喜欢历史和摄影"), {
    budgetMinutes: 180,
    pace: "RELAXED",
    interests: ["HISTORY", "PHOTOGRAPHY", "REST"],
    companion: "SENIOR",
    needsConfirmation: [],
  });
  assert.deepEqual(interpretScenicItineraryPrompt("随便逛逛"), {
    budgetMinutes: null,
    pace: "BALANCED",
    interests: [],
    companion: "SOLO",
    needsConfirmation: ["DURATION", "INTERESTS"],
  });
  assert.equal(interpretScenicItineraryPrompt(" "), null);
});

test("client cannot inject arbitrary scores, dwell values or route geometry through the itinerary input", () => {
  const malicious = input({ edgeWeights: { "edge-main-start": -999 }, dwellMinutes: 0, geometry: [[0, 0], [1, 1]] });
  const result = planFormalScenicItinerary(networkWithVisit(), stateFixture, malicious, now);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.itinerary.stops[0].dwellMinutes, 30);
  assert.notDeepEqual(result.itinerary.segments[0].geometry.coordinates, malicious.geometry);
});
