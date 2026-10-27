import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALL_ROUTE_TRAVERSAL_MODES,
  STANDARD_WALK_PROFILE,
  STEP_FREE_ROUTE_PROFILE,
  planDirectedRoute,
} from "../src/lib/directed-route-engine.ts";

const checkedAt = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

function request(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    fromNodeId: "public-origin",
    toNodeId: "destination",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    profile: STANDARD_WALK_PROFILE,
    ...overrides,
  };
}

test("the deterministic engine uses only directed approved edges and the verified virtual entrance transfer", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const result = planDirectedRoute(network, state, request(), checkedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
  assert.deepEqual(result.plan.traversals.map(({ kind }) => kind), ["EDGE", "ENTRANCE_TRANSFER", "EDGE"]);
  assert.deepEqual(result.plan.geometry.coordinates, [[100, 20], [100.001, 20], [100.003, 20]]);
  assert.equal(result.plan.estimatedMinutes, 3.2);
  assert.equal(result.plan.optimization, "FASTEST");
  assert.equal(result.plan.dynamicFactorsApplied, true);
  assert.deepEqual(result.plan.traversals.filter((traversal) => traversal.kind === "EDGE").map((traversal) => traversal.operationalFactors), [
    { travelTimeMultiplier: 1, crowdLevel: "LOW", weatherImpact: "NONE" },
    { travelTimeMultiplier: 1.2, crowdLevel: "HIGH", weatherImpact: "RAIN" },
  ]);
  assert.equal(result.plan.expiresAt, "2026-12-10T00:00:00.000Z");
  assert.ok(result.plan.notices.includes("STAIRS_PRESENT"));
  assert.ok(result.plan.notices.includes("ACCESSIBILITY_UNVERIFIED"));
  assert.ok(result.plan.notices.includes("DYNAMIC_TRAVEL_TIME_APPLIED"));
  assert.ok(result.plan.notices.includes("CROWD_FACTOR_APPLIED"));
  assert.ok(result.plan.notices.includes("WEATHER_FACTOR_APPLIED"));
});

test("fastest, shortest and scenic strategies remain deterministic and use reviewed edge weights", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const fastest = planDirectedRoute(network, state, request({ optimization: "FASTEST" }), checkedAt);
  const shortest = planDirectedRoute(network, state, request({ optimization: "SHORTEST" }), checkedAt);
  const scenic = planDirectedRoute(network, state, request({ optimization: "SCENIC" }), checkedAt);
  assert.equal(fastest.ok, true);
  assert.equal(shortest.ok, true);
  assert.equal(scenic.ok, true);
  if (!fastest.ok || !shortest.ok || !scenic.ok) return;
  assert.deepEqual(fastest.plan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
  assert.deepEqual(shortest.plan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
  assert.deepEqual(scenic.plan.edgeIds, ["edge-public-access", "edge-main-start", "edge-main-finish"]);
  assert.notEqual(scenic.plan.routeFingerprint, fastest.plan.routeFingerprint);
});

test("a published administrator recommendation follows its exact reviewed edge sequence and still honors closures", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  network.recommendedRoutes = [{
    id: "recommended-main-walk",
    name: "Fictional reviewed main walk",
    originNodeId: "internal-entry",
    destinationNodeId: "destination",
    segments: [
      { edgeId: "edge-main-start", traversalDirection: "FORWARD" },
      { edgeId: "edge-main-finish", traversalDirection: "FORWARD" },
    ],
    traversalModes: ["BOARDWALK"],
    distanceMeters: 200,
    estimatedMinutes: 4,
    sourceReference: "https://evidence.example.test/routes/main-walk",
  }];
  const recommendedRequest = request({
    fromNodeId: "internal-entry",
    recommendedRouteId: "recommended-main-walk",
    optimization: "SCENIC",
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ALL_ROUTE_TRAVERSAL_MODES },
  });
  const result = planDirectedRoute(network, state, recommendedRequest, checkedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.recommendedRouteId, "recommended-main-walk");
  assert.deepEqual(result.plan.edgeIds, ["edge-main-start", "edge-main-finish"]);
  assert.equal(result.plan.distanceMeters, 200);
  assert.equal(result.plan.estimatedMinutes, 4);

  const closed = structuredClone(state);
  closed.operationalVersion = 8;
  closed.edgeStates.find(({ edgeId }) => edgeId === "edge-main-start").status = "CLOSED";
  const rejected = planDirectedRoute(network, closed, { ...recommendedRequest, expectedOperationalVersion: 8 }, checkedAt);
  assert.deepEqual(rejected, {
    ok: false,
    code: "NO_SAFE_PATH",
    message: "管理员推荐路线包含当前关闭或不符合游客约束的路段。",
  });
});

test("explicit comfort and traversal preferences filter difficult or disallowed road types", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const relaxed = planDirectedRoute(network, state, request({
    optimization: "FASTEST",
    preference: {
      pace: "RELAXED",
      maximumDifficulty: "EASY",
      allowedTraversalModes: ALL_ROUTE_TRAVERSAL_MODES,
    },
  }), checkedAt);
  assert.equal(relaxed.ok, true);
  if (relaxed.ok) assert.deepEqual(relaxed.plan.edgeIds, ["edge-public-access", "edge-main-start", "edge-main-finish"]);

  const walkwayOnly = planDirectedRoute(network, state, request({
    preference: {
      pace: "BALANCED",
      maximumDifficulty: "HARD",
      allowedTraversalModes: ["WALKWAY"],
    },
  }), checkedAt);
  assert.equal(walkwayOnly.ok, true);
  if (walkwayOnly.ok) assert.deepEqual(walkwayOnly.plan.edgeIds, ["edge-public-access", "edge-accessible-alt-start", "edge-accessible-alt-finish"]);
});

test("scenic or personalized routing fails closed when reviewed routing attributes are incomplete", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  delete network.edges.find(({ id }) => id === "edge-main-start").routing;

  const result = planDirectedRoute(network, state, request({ optimization: "SCENIC" }), checkedAt);
  assert.deepEqual(result, {
    ok: false,
    code: "ROUTING_ATTRIBUTES_UNAVAILABLE",
    message: "当前正式路网未完整发布道路类型、难度与观光评分，不能使用所选策略。",
  });
});

test("step-free routing excludes stairs and partial accessibility instead of silently presenting a shortcut", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const result = planDirectedRoute(network, state, request({ profile: STEP_FREE_ROUTE_PROFILE }), checkedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.edgeIds, ["edge-public-access", "edge-accessible-alt-start", "edge-accessible-alt-finish"]);
  assert.equal(result.plan.notices.includes("STAIRS_PRESENT"), false);
  assert.equal(result.plan.notices.includes("ACCESSIBILITY_UNVERIFIED"), false);
  assert.ok(result.plan.notices.includes("DYNAMIC_TRAVEL_TIME_APPLIED"));
  assert.ok(result.plan.notices.includes("CROWD_FACTOR_APPLIED"));
});

test("one-way direction is honored and never inferred from undirected topology", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const forward = planDirectedRoute(network, state, request({ fromNodeId: "one-way-start", toNodeId: "one-way-end" }), checkedAt);
  assert.equal(forward.ok, true);
  if (forward.ok) assert.deepEqual(forward.plan.edgeIds, ["edge-one-way-terminal"]);

  const reverse = planDirectedRoute(network, state, request({ fromNodeId: "one-way-end", toNodeId: "one-way-start" }), checkedAt);
  assert.deepEqual(reverse, {
    ok: false,
    code: "NO_SAFE_PATH",
    message: "当前开放、已核验且符合约束的有向路网中不存在安全路径。",
  });
});

test("a bidirectional edge emits reverse geometry only for its permitted reverse traversal", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const result = planDirectedRoute(network, state, request({
    fromNodeId: "destination",
    toNodeId: "junction-alt",
  }), checkedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.edgeIds, ["edge-accessible-alt-finish"]);
  assert.deepEqual(result.plan.traversals[0].geometry.coordinates, [[100.003, 20], [100.001, 20.001]]);
});

test("closed, restricted and unknown operation states are all excluded before routing", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const closedShortcut = structuredClone(state);
  closedShortcut.operationalVersion = 8;
  closedShortcut.edgeStates.find(({ edgeId }) => edgeId === "edge-stairs-shortcut").status = "CLOSED";
  const alternate = planDirectedRoute(network, closedShortcut, request({ expectedOperationalVersion: 8 }), checkedAt);
  assert.equal(alternate.ok, true);
  if (alternate.ok) assert.deepEqual(alternate.plan.edgeIds, ["edge-public-access", "edge-main-start", "edge-main-finish"]);

  const noSafePath = structuredClone(closedShortcut);
  noSafePath.edgeStates
    .filter(({ edgeId }) => ["edge-main-start", "edge-main-finish", "edge-accessible-alt-start", "edge-accessible-alt-finish"].includes(edgeId))
    .forEach((edgeState, index) => { edgeState.status = index === 0 ? "RESTRICTED" : "UNKNOWN"; });
  const blocked = planDirectedRoute(network, noSafePath, request({ expectedOperationalVersion: 8 }), checkedAt);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "NO_SAFE_PATH");
});

test("revision bindings and unavailable state fail closed, while equivalent calls stay deterministic", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const first = planDirectedRoute(network, state, request(), checkedAt);
  const second = planDirectedRoute(network, state, request(), checkedAt);
  assert.deepEqual(second, first);

  const oldNetworkRequest = planDirectedRoute(network, state, request({ expectedNetworkRevision: "fictional-network-old" }), checkedAt);
  assert.equal(oldNetworkRequest.ok, false);
  if (!oldNetworkRequest.ok) assert.equal(oldNetworkRequest.code, "NETWORK_REVISION_CHANGED");

  const oldStateRequest = planDirectedRoute(network, state, request({ expectedOperationalVersion: 6 }), checkedAt);
  assert.equal(oldStateRequest.ok, false);
  if (!oldStateRequest.ok) assert.equal(oldStateRequest.code, "OPERATIONAL_VERSION_CHANGED");

  const expired = structuredClone(state);
  expired.expiresAt = "2026-08-15T07:59:59.000Z";
  expired.edgeStates.forEach((edgeState) => { edgeState.expiresAt = expired.expiresAt; });
  const unavailable = planDirectedRoute(network, expired, request(), checkedAt);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, "OPERATIONAL_STATE_UNAVAILABLE");
});

test("malformed requests and same-node requests never manufacture a route", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const malformed = planDirectedRoute(network, state, request({ profile: { ...STANDARD_WALK_PROFILE, extra: true } }), checkedAt);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "INPUT_INVALID");

  const sameNode = planDirectedRoute(network, state, request({ toNodeId: "public-origin" }), checkedAt);
  assert.equal(sameNode.ok, false);
  if (!sameNode.ok) assert.equal(sameNode.code, "ORIGIN_EQUALS_DESTINATION");
});

test("cableway and shuttle edges require explicit opt-in plus reviewed service timing evidence", async () => {
  const [baseNetwork, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  const network = structuredClone(baseNetwork);
  const cableway = network.edges.find((edge) => edge.id === "edge-stairs-shortcut");
  network.edges.filter((edge) => edge.id.startsWith("edge-accessible-alt-")).forEach((edge) => { edge.estimatedMinutes = 100; });
  cableway.estimatedMinutes = 17;
  cableway.constraints.stairs = "NONE";
  cableway.accessibility.status = "VERIFIED_ACCESSIBLE";
  cableway.routing = {
    traversalMode: "CABLEWAY",
    difficulty: "EASY",
    scenicScore: 80,
    evidenceReference: "TEST-EVIDENCE://fictional/routing/cableway",
    transportService: {
      serviceName: "虚构测试索道",
      boardingMinutes: 2,
      expectedWaitMinutes: 5,
      inVehicleMinutes: 10,
      scheduleEvidenceReference: "https://evidence.example.test/fictional-cableway",
    },
  };

  const defaultWalking = planDirectedRoute(network, state, request(), checkedAt);
  assert.equal(defaultWalking.ok, true);
  if (!defaultWalking.ok) return;
  assert.equal(defaultWalking.plan.edgeIds.includes("edge-stairs-shortcut"), false);

  const optedIn = planDirectedRoute(network, state, request({
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY", "CABLEWAY"] },
  }), checkedAt);
  assert.equal(optedIn.ok, true);
  if (!optedIn.ok) return;
  const transport = optedIn.plan.traversals.find((traversal) => traversal.kind === "EDGE" && traversal.edgeId === "edge-stairs-shortcut");
  assert.equal(transport?.traversalMode, "CABLEWAY");
  assert.equal(transport?.transportService?.expectedWaitMinutes, 5);
  assert.ok(optedIn.plan.notices.includes("CABLEWAY_INCLUDED"));
  assert.ok(optedIn.plan.notices.includes("TRANSPORT_WAIT_INCLUDED"));

  delete cableway.routing.transportService;
  const incomplete = planDirectedRoute(network, state, request({
    preference: { pace: "BALANCED", maximumDifficulty: "HARD", allowedTraversalModes: ["WALKWAY", "CABLEWAY"] },
  }), checkedAt);
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.equal(incomplete.code, "TRANSPORT_SERVICE_UNAVAILABLE");
});
