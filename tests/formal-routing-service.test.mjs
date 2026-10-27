import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createFormalRoutePlan,
  readFormalRoutingSnapshot,
} from "../src/lib/server/formal-routing-service.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

function planInput(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    fromNodeId: "public-origin",
    toNodeId: "destination",
    expectedNetworkRevision: "fictional-network-v1",
    expectedOperationalVersion: 7,
    profile: { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
    ...overrides,
  };
}

function memoryRepository(record = null) {
  return {
    async readCurrentPublishedSnapshot(scenicAreaId) {
      return record?.scenicAreaId === scenicAreaId ? structuredClone(record) : null;
    },
  };
}

async function publishedRecord() {
  const [routeNetwork, operationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  return {
    scenicAreaId: "fictional-park",
    snapshotRevision: 1,
    networkRevision: "fictional-network-v1",
    operationalVersion: 7,
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    snapshotJson: { schemaVersion: 1, routeNetwork, operationalState },
  };
}

test("formal routing only exposes a fully published fictional snapshot", async () => {
  const record = await publishedRecord();
  const result = await readFormalRoutingSnapshot(memoryRepository(record), "fictional-park", now);
  assert.equal(result.state, "AVAILABLE");
  if (result.state !== "AVAILABLE") return;
  assert.equal(result.snapshot.snapshotRevision, 1);
  assert.equal(result.snapshot.networkRevision, "fictional-network-v1");
  assert.equal(result.snapshot.operationalVersion, 7);
  assert.equal(result.snapshot.routeNetwork.scenicAreaId, "fictional-park");
  assert.equal(result.snapshot.operationalState.edgeStates.length, 8);
});

test("missing, malformed, stale or mismatched snapshots always remain formally unavailable", async () => {
  assert.deepEqual(
    await readFormalRoutingSnapshot(memoryRepository(), "fictional-park", now),
    { state: "FORMAL_NETWORK_UNAVAILABLE" },
  );

  const malformed = await publishedRecord();
  malformed.snapshotJson = { schemaVersion: 1, routeNetwork: {}, operationalState: {} };
  assert.deepEqual(
    await readFormalRoutingSnapshot(memoryRepository(malformed), "fictional-park", now),
    { state: "FORMAL_NETWORK_UNAVAILABLE" },
  );

  const mismatched = await publishedRecord();
  mismatched.operationalVersion = 8;
  assert.deepEqual(
    await createFormalRoutePlan(memoryRepository(mismatched), planInput(), now),
    { state: "FORMAL_NETWORK_UNAVAILABLE" },
  );

  const expired = await publishedRecord();
  expired.expiresAt = "2026-08-15T07:59:59.000Z";
  assert.deepEqual(
    await readFormalRoutingSnapshot(memoryRepository(expired), "fictional-park", now),
    { state: "FORMAL_NETWORK_UNAVAILABLE" },
  );
});

test("service calls the pure directed engine only after validation and preserves revision safety", async () => {
  const repository = memoryRepository(await publishedRecord());
  const available = await createFormalRoutePlan(repository, planInput(), now);
  assert.equal(available.state, "AVAILABLE");
  if (available.state === "AVAILABLE") {
    assert.deepEqual(available.plan.edgeIds, ["edge-public-access", "edge-stairs-shortcut"]);
    assert.equal(available.plan.operationalVersion, 7);
  }

  assert.deepEqual(
    await createFormalRoutePlan(repository, planInput({ expectedOperationalVersion: 6 }), now),
    { state: "ROUTE_VERSION_CHANGED" },
  );
  assert.deepEqual(
    await createFormalRoutePlan(repository, planInput({ toNodeId: "one-way-start", fromNodeId: "one-way-end" }), now),
    { state: "ROUTE_UNAVAILABLE" },
  );
});
