import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getSafeRouteOperationalState,
  parseRouteOperationalState,
  validateRouteOperationalState,
} from "../src/lib/route-operational-state.ts";
import { validateRouteNetwork } from "../src/lib/route-network.ts";

const checkedAt = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

test("fictional operational snapshot exactly covers its fictional published network", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  assert.equal(validateRouteNetwork(network, checkedAt, "fictional-park").status, "PUBLISHABLE");
  const result = validateRouteOperationalState(state, network, checkedAt, "fictional-park");
  assert.equal(result.status, "VALID");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(getSafeRouteOperationalState(state, network, checkedAt, "fictional-park"), parseRouteOperationalState(state));
});

test("operational state parser rejects unknown fields and validator rejects incomplete or foreign coverage", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  assert.equal(parseRouteOperationalState({ ...state, unexpected: true }), null);

  const duplicate = structuredClone(state);
  duplicate.edgeStates.push(structuredClone(duplicate.edgeStates[0]));
  assert.ok(validateRouteOperationalState(duplicate, network, checkedAt, "fictional-park").issues.some(({ code }) => code === "EDGE_STATE_DUPLICATE"));

  const missing = structuredClone(state);
  missing.edgeStates = missing.edgeStates.slice(1);
  assert.ok(validateRouteOperationalState(missing, network, checkedAt, "fictional-park").issues.some(({ code }) => code === "EDGE_STATE_MISSING"));

  const foreign = structuredClone(state);
  foreign.edgeStates[0].edgeId = "not-in-network";
  const foreignIssues = validateRouteOperationalState(foreign, network, checkedAt, "fictional-park").issues.map(({ code }) => code);
  assert.ok(foreignIssues.includes("EDGE_STATE_UNKNOWN"));
  assert.ok(foreignIssues.includes("EDGE_STATE_MISSING"));
});

test("revision, clock and expiry mismatches fail closed before a route can consume state", async () => {
  const [network, state] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);

  const wrongRevision = structuredClone(state);
  wrongRevision.networkRevision = "fictional-network-old";
  assert.ok(validateRouteOperationalState(wrongRevision, network, checkedAt, "fictional-park").issues.some(({ code }) => code === "NETWORK_REVISION_MISMATCH"));

  const shortEdgeState = structuredClone(state);
  shortEdgeState.edgeStates[0].expiresAt = "2026-11-01T00:00:00.000Z";
  assert.ok(validateRouteOperationalState(shortEdgeState, network, checkedAt, "fictional-park").issues.some(({ code }) => code === "EDGE_STATE_EXPIRED"));

  const expired = structuredClone(state);
  expired.expiresAt = "2026-08-15T07:59:59.000Z";
  expired.edgeStates.forEach((edgeState) => { edgeState.expiresAt = expired.expiresAt; });
  assert.ok(validateRouteOperationalState(expired, network, checkedAt, "fictional-park").issues.some(({ code }) => code === "STATE_EXPIRED"));
  assert.equal(getSafeRouteOperationalState(expired, network, checkedAt, "fictional-park"), null);
});
