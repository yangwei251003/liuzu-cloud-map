import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createRouteOperationalMonitorInitialState,
  evaluateDeterministicRouteOperationalReplan,
  evaluateRouteOperationalMonitor,
  isRouteOperationalMonitorCheckDue,
  parseRouteOperationalMonitorRoute,
  parseVerifiedRouteOperationalSnapshot,
  ROUTE_OPERATION_MONITOR_INTERVAL_MS,
} from "../src/lib/route-operation-monitor.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

function route(overrides = {}) {
  return {
    schemaVersion: 1,
    routeId: "drp1-fictional-route-7",
    scenicAreaId: "fictional-park",
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    expiresAt: "2026-12-10T00:00:00.000Z",
    ...overrides,
  };
}

async function formalSnapshot(overrides = {}) {
  const [routeNetwork, operationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  return {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    routeNetwork,
    operationalState,
    ...overrides,
  };
}

const online = (snapshot) => ({ kind: "FORMAL_SNAPSHOT", transport: "ONLINE", snapshot });
const offline = (snapshot) => ({ kind: "FORMAL_SNAPSHOT", transport: "OFFLINE", snapshot });

test("the monitor starts fail-closed and models the 15-second plus resume checks", () => {
  const initial = createRouteOperationalMonitorInitialState(now);
  assert.equal(initial.decision.status, "STOP_AND_ASK_STAFF");
  assert.equal(initial.decision.instructionState, "STOPPED");
  assert.equal(initial.decision.reason, "MONITOR_NOT_STARTED");

  const last = new Date(now.getTime());
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "START", now, lastCheckedAt: last }), true);
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "PAGE_VISIBLE", now, lastCheckedAt: last }), true);
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "NETWORK_ONLINE", now, lastCheckedAt: last }), true);
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "NETWORK_OFFLINE", now, lastCheckedAt: last }), true);
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "INTERVAL", now: new Date(now.getTime() + ROUTE_OPERATION_MONITOR_INTERVAL_MS - 1), lastCheckedAt: last }), false);
  assert.equal(isRouteOperationalMonitorCheckDue({ trigger: "INTERVAL", now: new Date(now.getTime() + ROUTE_OPERATION_MONITOR_INTERVAL_MS), lastCheckedAt: last }), true);
});

test("a fully validated formal snapshot keeps only an exact matching route active", async () => {
  const snapshot = await formalSnapshot();
  const parsed = parseVerifiedRouteOperationalSnapshot(snapshot, now);
  assert.deepEqual(parsed, {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
  });

  const decision = evaluateRouteOperationalMonitor({ route: route(), source: online(snapshot) }, now);
  assert.equal(decision.status, "CONTINUE");
  assert.equal(decision.instructionState, "ACTIVE");
  assert.equal(decision.reason, "CURRENT");
  assert.equal(decision.replanRequest, null);

  const envelopeDecision = evaluateRouteOperationalMonitor({
    route: route(),
    source: online({ schemaVersion: 1, requestId: "test-request-1", snapshot }),
  }, now);
  assert.equal(envelopeDecision.status, "CONTINUE");
});

test("new operating or network versions immediately pause old instructions and request only deterministic replan", async () => {
  const operationalChange = await formalSnapshot();
  operationalChange.operationalVersion = 8;
  operationalChange.operationalState.operationalVersion = 8;
  const operational = evaluateRouteOperationalMonitor({ route: route(), source: online(operationalChange) }, now);
  assert.equal(operational.status, "PAUSE_FOR_DETERMINISTIC_REPLAN");
  assert.equal(operational.instructionState, "PAUSED");
  assert.equal(operational.reason, "OPERATIONAL_VERSION_CHANGED");
  assert.deepEqual(operational.replanRequest, {
    mode: "DETERMINISTIC_FORMAL_ROUTE",
    scenicAreaId: "fictional-park",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 8,
    supersedesRouteId: "drp1-fictional-route-7",
    reason: "OPERATIONAL_VERSION_CHANGED",
  });
  assert.match(operational.message, /旧导航指令已暂停/);
  assert.doesNotMatch(operational.message, /高德|AI|候选/);

  const networkChange = await formalSnapshot();
  networkChange.networkRevision = "fictional-network-v2";
  networkChange.routeNetwork.revision = "fictional-network-v2";
  networkChange.routeNetwork.review.reviewedRevision = "fictional-network-v2";
  networkChange.operationalState.networkRevision = "fictional-network-v2";
  const network = evaluateRouteOperationalMonitor({ route: route(), source: online(networkChange) }, now);
  assert.equal(network.status, "PAUSE_FOR_DETERMINISTIC_REPLAN");
  assert.equal(network.instructionState, "PAUSED");
  assert.equal(network.reason, "NETWORK_REVISION_CHANGED");
  assert.equal(network.replanRequest?.expectedNetworkRevision, "fictional-network-v2");
});

test("a failed deterministic replan remains stopped with explicit human help", async () => {
  const changed = await formalSnapshot();
  changed.operationalVersion = 8;
  changed.operationalState.operationalVersion = 8;
  const pause = evaluateRouteOperationalMonitor({ route: route(), source: online(changed) }, now);
  assert.equal(pause.status, "PAUSE_FOR_DETERMINISTIC_REPLAN");
  assert.ok(pause.replanRequest);

  const noSafeRoute = evaluateDeterministicRouteOperationalReplan(
    pause.replanRequest,
    { kind: "NO_SAFE_ROUTE", code: "ROUTE_UNAVAILABLE" },
    now,
  );
  assert.equal(noSafeRoute.status, "STOP_AND_ASK_STAFF");
  assert.equal(noSafeRoute.instructionState, "STOPPED");
  assert.equal(noSafeRoute.reason, "NO_SAFE_DETERMINISTIC_ROUTE");
  assert.match(noSafeRoute.message, /工作人员/);

  const resumed = evaluateDeterministicRouteOperationalReplan(
    pause.replanRequest,
    {
      kind: "DETERMINISTIC_ROUTE_AVAILABLE",
      route: route({ routeId: "drp1-fictional-route-8", operationalVersion: 8 }),
      snapshot: changed,
    },
    now,
  );
  assert.equal(resumed.status, "CONTINUE");
  assert.equal(resumed.instructionState, "ACTIVE");
  assert.equal(resumed.snapshot?.operationalVersion, 8);
});

test("unavailable, malformed or mismatched formal state stops navigation and asks for staff", async () => {
  const unavailable = evaluateRouteOperationalMonitor({
    route: route(),
    source: { kind: "UNAVAILABLE", transport: "ONLINE", code: "FORMAL_NETWORK_UNAVAILABLE" },
  }, now);
  assert.equal(unavailable.status, "STOP_AND_ASK_STAFF");
  assert.equal(unavailable.instructionState, "STOPPED");
  assert.equal(unavailable.reason, "FORMAL_SNAPSHOT_UNAVAILABLE");
  assert.match(unavailable.message, /工作人员/);

  const malformed = evaluateRouteOperationalMonitor({ route: route(), source: online({ schemaVersion: 1 }) }, now);
  assert.equal(malformed.status, "STOP_AND_ASK_STAFF");
  assert.equal(malformed.reason, "FORMAL_SNAPSHOT_INVALID");

  const foreign = await formalSnapshot({ scenicAreaId: "another-park" });
  const foreignDecision = evaluateRouteOperationalMonitor({ route: route(), source: online(foreign) }, now);
  assert.equal(foreignDecision.status, "STOP_AND_ASK_STAFF");
  assert.equal(foreignDecision.reason, "FORMAL_SNAPSHOT_INVALID");
});

test("offline routing continues only while the same cached formal state is current, then expires fail-closed", async () => {
  const snapshot = await formalSnapshot();
  snapshot.expiresAt = "2026-08-15T08:01:00.000Z";
  snapshot.operationalState.expiresAt = snapshot.expiresAt;
  snapshot.operationalState.edgeStates.forEach((edge) => { edge.expiresAt = snapshot.expiresAt; });
  const shortRoute = route({ expiresAt: snapshot.expiresAt });

  const current = evaluateRouteOperationalMonitor({ route: shortRoute, source: offline(snapshot) }, now);
  assert.equal(current.status, "CONTINUE");
  assert.equal(current.reason, "OFFLINE_SNAPSHOT_CURRENT");
  assert.match(current.message, /离线/);

  const installedSnapshot = {
    ...snapshot,
    packId: "fictional-pack-1",
    packRevision: 2,
  };
  const installedCurrent = evaluateRouteOperationalMonitor({ route: shortRoute, source: offline(installedSnapshot) }, now);
  assert.equal(installedCurrent.status, "CONTINUE");
  assert.equal(installedCurrent.reason, "OFFLINE_SNAPSHOT_CURRENT");

  const unknownInstalledField = evaluateRouteOperationalMonitor({
    route: shortRoute,
    source: offline({ ...installedSnapshot, unverified: true }),
  }, now);
  assert.equal(unknownInstalledField.status, "STOP_AND_ASK_STAFF");
  assert.equal(unknownInstalledField.reason, "FORMAL_SNAPSHOT_INVALID");

  const expired = evaluateRouteOperationalMonitor(
    { route: shortRoute, source: offline(snapshot) },
    new Date("2026-08-15T08:01:00.000Z"),
  );
  assert.equal(expired.status, "STOP_AND_ASK_STAFF");
  assert.equal(expired.instructionState, "STOPPED");
  assert.equal(expired.reason, "ROUTE_EXPIRED");
});

test("strict route and source contracts reject unknown fields without preserving old instructions", async () => {
  const snapshot = await formalSnapshot();
  assert.equal(parseRouteOperationalMonitorRoute({ ...route(), extra: true }), null);

  const extraRoute = evaluateRouteOperationalMonitor({ route: { ...route(), extra: true }, source: online(snapshot) }, now);
  assert.equal(extraRoute.status, "STOP_AND_ASK_STAFF");
  assert.equal(extraRoute.reason, "ROUTE_BINDING_INVALID");

  const extraSource = evaluateRouteOperationalMonitor({
    route: route(),
    source: { ...online(snapshot), externalCandidate: true },
  }, now);
  assert.equal(extraSource.status, "STOP_AND_ASK_STAFF");
  assert.equal(extraSource.reason, "SOURCE_INVALID");
});
