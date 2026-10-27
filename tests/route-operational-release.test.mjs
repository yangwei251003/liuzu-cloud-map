import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalizeRouteOperationalSnapshot,
  compileRouteOperationalRelease,
} from "../src/lib/route-operational-release-compiler.ts";
import {
  parseRouteOperationalReleaseOverview,
  parseRouteOperationalReleaseReceipt,
} from "../src/lib/route-operational-release-contract.ts";
import {
  handlePrepareRouteOperationalRelease,
  handlePublishRouteOperationalRelease,
} from "../src/lib/server/route-operational-release-http.ts";
import {
  parsePrepareRouteOperationalReleaseInput,
  parsePublishRouteOperationalReleaseInput,
  prepareRouteOperationalRelease,
  publishRouteOperationalRelease,
  readRouteOperationalReleaseOverview,
} from "../src/lib/server/route-operational-release-service.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const releaseId = "11111111-1111-4111-8111-111111111111";
const networkRevisionId = "22222222-2222-4222-8222-222222222222";
const sha256 = "a".repeat(64);

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

function actor(role = "OPERATIONS_EMERGENCY", oidcSubject = "oidc:operations-a") {
  return { scenicAreaId: "fictional-park", oidcSubject, role };
}

function receipt(overrides = {}) {
  return {
    id: releaseId,
    scenicAreaId: "fictional-park",
    baseSnapshotRevision: 7,
    targetSnapshotRevision: 8,
    networkRevisionId,
    networkRevision: "fictional-network-v1",
    baseOperationalVersion: 7,
    targetOperationalVersion: 8,
    workflowRevision: 1,
    lifecycleState: "PREPARED",
    sourceReference: "https://evidence.example.test/releases/source-8",
    reasonSummary: "Compile independently confirmed fictional closure evidence only.",
    snapshotSha256: sha256,
    confirmedEventCount: 1,
    confirmedObservationCount: 0,
    affectedEdgeCount: 1,
    preparedBySubject: "oidc:operations-a",
    preparedAt: "2026-08-15T08:00:00.000Z",
    expiresAt: "2026-08-15T12:00:00.000Z",
    publishedBySubject: null,
    publishedAt: null,
    releaseEvidenceReference: null,
    ...overrides,
  };
}

function overview(overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    actorRole: "OPERATIONS_EMERGENCY",
    serverTime: now.toISOString(),
    currentSnapshot: {
      snapshotRevision: 7,
      networkRevisionId,
      networkRevision: "fictional-network-v1",
      operationalVersion: 7,
      validUntil: "2026-08-16T08:00:00.000Z",
    },
    pendingEventCount: 0,
    confirmedEventCount: 1,
    pendingObservationCount: 0,
    confirmedObservationCount: 0,
    candidate: null,
    ...overrides,
  };
}

function prepareInput(overrides = {}) {
  return {
    schemaVersion: 1,
    expectedSnapshotRevision: 7,
    sourceReference: "https://evidence.example.test/releases/source-8",
    reasonSummary: "Compile independently confirmed fictional closure evidence only.",
    acknowledgeConfirmedEventsOnly: true,
    acknowledgeReviewedFactorsOnly: true,
    ...overrides,
  };
}

function publishInput(overrides = {}) {
  return {
    schemaVersion: 1,
    expectedWorkflowRevision: 1,
    releaseEvidenceReference: "https://evidence.example.test/releases/approval-8",
    acknowledgeAtomicReplacement: true,
    acknowledgeOfflinePacksInvalidated: true,
    ...overrides,
  };
}

test("compiler replaces only confirmed edge state and preserves the immutable route network", async () => {
  const [routeNetwork, baseOperationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  const compiled = compileRouteOperationalRelease({
    scenicAreaId: "fictional-park",
    targetOperationalVersion: 8,
    issuedAt: now.toISOString(),
    expiresAt: "2026-08-20T00:00:00.000Z",
    sourceReference: "https://evidence.example.test/releases/source-8",
    responsibleParty: "oidc:operations-a",
    routeNetwork,
    baseOperationalState,
    effects: [{
      closureEventId: releaseId,
      edgeId: "edge-stairs-shortcut",
      status: "CLOSED",
      checkedAt: "2026-08-15T07:55:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
      sourceReference: "https://evidence.example.test/closures/confirmed-1",
      responsibleParty: "oidc:release-reviewer",
    }],
  }, now);
  assert.ok(compiled);
  assert.deepEqual(compiled.affectedEdgeIds, ["edge-stairs-shortcut"]);
  assert.deepEqual(compiled.snapshotJson.routeNetwork, routeNetwork);
  assert.equal(compiled.snapshotJson.operationalState.operationalVersion, 8);
  assert.equal(compiled.snapshotJson.operationalState.edgeStates.find((edge) => edge.edgeId === "edge-stairs-shortcut")?.status, "CLOSED");
  assert.equal(compiled.snapshotJson.operationalState.edgeStates.find((edge) => edge.edgeId === "edge-main-start")?.status, "OPEN");
  const first = canonicalizeRouteOperationalSnapshot(compiled.snapshotJson);
  const second = canonicalizeRouteOperationalSnapshot(JSON.parse(JSON.stringify(compiled.snapshotJson)));
  assert.equal(first, second);
  assert.match(createHash("sha256").update(first).digest("hex"), /^[0-9a-f]{64}$/);
});

test("compiler fails closed for unknown edges, expired evidence or incomplete effect coverage", async () => {
  const [routeNetwork, baseOperationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  const base = {
    scenicAreaId: "fictional-park",
    targetOperationalVersion: 8,
    issuedAt: now.toISOString(),
    expiresAt: "2026-08-20T00:00:00.000Z",
    sourceReference: "https://evidence.example.test/releases/source-8",
    responsibleParty: "oidc:operations-a",
    routeNetwork,
    baseOperationalState,
  };
  assert.equal(compileRouteOperationalRelease({ ...base, effects: [] }, now), null);
  assert.equal(compileRouteOperationalRelease({ ...base, effects: [{ closureEventId: releaseId, edgeId: "unknown-edge", status: "CLOSED", checkedAt: now.toISOString(), expiresAt: "2026-08-20T00:00:00.000Z", sourceReference: "https://evidence.example.test/closures/1", responsibleParty: "oidc:reviewer" }] }, now), null);
  assert.equal(compileRouteOperationalRelease({ ...base, effects: [{ closureEventId: releaseId, edgeId: "edge-main-start", status: "CLOSED", checkedAt: now.toISOString(), expiresAt: "2026-08-19T23:59:59.000Z", sourceReference: "https://evidence.example.test/closures/1", responsibleParty: "oidc:reviewer" }] }, now), null);
});

test("compiler applies a reviewed crowd/weather factor without changing geometry or edge status", async () => {
  const [routeNetwork, baseOperationalState] = await Promise.all([
    fixture("fictional-directed-route-network.v1.json"),
    fixture("fictional-route-operational-state.v1.json"),
  ]);
  const compiled = compileRouteOperationalRelease({
    scenicAreaId: "fictional-park",
    targetOperationalVersion: 8,
    issuedAt: now.toISOString(),
    expiresAt: "2026-08-15T10:00:00.000Z",
    sourceReference: "https://evidence.example.test/releases/factor-source-8",
    responsibleParty: "oidc:operations-a",
    routeNetwork,
    baseOperationalState,
    factors: [{
      observationId: "33333333-3333-4333-8333-333333333333",
      edgeId: "edge-main-start",
      crowdLevel: "HIGH",
      weatherImpact: "RAIN",
      travelTimeMultiplier: 1.8,
      observedAt: "2026-08-15T07:55:00.000Z",
      expiresAt: "2026-08-15T10:00:00.000Z",
      sourceReference: "https://evidence.example.test/observations/reviewed-1",
      responsibleParty: "oidc:operations-reviewer",
    }],
  }, now);
  assert.ok(compiled);
  assert.deepEqual(compiled.affectedEdgeIds, ["edge-main-start"]);
  assert.deepEqual(compiled.snapshotJson.routeNetwork, routeNetwork);
  const state = compiled.snapshotJson.operationalState.edgeStates.find((edge) => edge.edgeId === "edge-main-start");
  assert.equal(state?.status, baseOperationalState.edgeStates.find((edge) => edge.edgeId === "edge-main-start")?.status);
  assert.deepEqual(state?.routing, { travelTimeMultiplier: 1.8, crowdLevel: "HIGH", weatherImpact: "RAIN" });
  assert.equal(compileRouteOperationalRelease({
    scenicAreaId: "fictional-park", targetOperationalVersion: 8, issuedAt: now.toISOString(), expiresAt: "2026-08-15T10:00:00.000Z",
    sourceReference: "https://evidence.example.test/releases/factor-source-8", responsibleParty: "oidc:operations-a", routeNetwork, baseOperationalState,
    factors: [
      { observationId: "33333333-3333-4333-8333-333333333333", edgeId: "edge-main-start", crowdLevel: "HIGH", weatherImpact: "RAIN", travelTimeMultiplier: 1.8, observedAt: "2026-08-15T07:55:00.000Z", expiresAt: "2026-08-15T10:00:00.000Z", sourceReference: "https://evidence.example.test/observations/reviewed-1", responsibleParty: "oidc:reviewer" },
      { observationId: "44444444-4444-4444-8444-444444444444", edgeId: "edge-main-start", crowdLevel: "MODERATE", weatherImpact: "NONE", travelTimeMultiplier: 1.2, observedAt: "2026-08-15T07:56:00.000Z", expiresAt: "2026-08-15T10:00:00.000Z", sourceReference: "https://evidence.example.test/observations/reviewed-2", responsibleParty: "oidc:reviewer" },
    ],
  }, now), null);
});

test("release contracts are exact and enforce role separation on published receipts", () => {
  assert.ok(parseRouteOperationalReleaseReceipt(receipt()));
  assert.ok(parseRouteOperationalReleaseOverview(overview({ candidate: receipt() })));
  assert.equal(parseRouteOperationalReleaseReceipt({ ...receipt(), extra: true }), null);
  assert.equal(parseRouteOperationalReleaseReceipt(receipt({ workflowRevision: 2, lifecycleState: "PUBLISHED", publishedBySubject: "oidc:operations-a", publishedAt: now.toISOString(), releaseEvidenceReference: "https://evidence.example.test/releases/approval-8" })), null);
  assert.equal(parseRouteOperationalReleaseOverview({ ...overview(), pendingEventCount: -1 }), null);
});

test("prepare and publish input parsers reject unknown fields and missing acknowledgements", () => {
  assert.ok(parsePrepareRouteOperationalReleaseInput(prepareInput()));
  assert.equal(parsePrepareRouteOperationalReleaseInput(prepareInput({ acknowledgeConfirmedEventsOnly: false })), null);
  assert.equal(parsePrepareRouteOperationalReleaseInput(prepareInput({ acknowledgeReviewedFactorsOnly: false })), null);
  assert.equal(parsePrepareRouteOperationalReleaseInput({ ...prepareInput(), routeNetwork: {} }), null);
  assert.ok(parsePublishRouteOperationalReleaseInput(publishInput()));
  assert.equal(parsePublishRouteOperationalReleaseInput(publishInput({ acknowledgeOfflinePacksInvalidated: false })), null);
});

test("service validates repository overviews and role-bound write receipts", async () => {
  const prepared = receipt();
  const published = receipt({
    workflowRevision: 2,
    lifecycleState: "PUBLISHED",
    publishedBySubject: "oidc:release-b",
    publishedAt: "2026-08-15T08:05:00.000Z",
    releaseEvidenceReference: "https://evidence.example.test/releases/approval-8",
  });
  const repository = {
    async readOverview() { return overview(); },
    async prepare() { return { state: "CREATED", receipt: prepared }; },
    async publish() { return { state: "PUBLISHED", receipt: published }; },
  };
  assert.equal((await readRouteOperationalReleaseOverview(repository, actor(), now)).state, "FOUND");
  assert.equal((await prepareRouteOperationalRelease(repository, prepareInput(), actor(), "route-operational-release-key-0001", now)).state, "CREATED");
  assert.equal((await prepareRouteOperationalRelease(repository, prepareInput(), actor("RELEASE_ADMIN"), "route-operational-release-key-0002", now)).state, "INVALID_INPUT");
  assert.equal((await publishRouteOperationalRelease(repository, releaseId, publishInput(), actor("RELEASE_ADMIN", "oidc:release-b"), "route-operational-publish-key-0001", now)).state, "PUBLISHED");
  assert.equal((await publishRouteOperationalRelease(repository, releaseId, publishInput(), actor(), "route-operational-publish-key-0002", now)).state, "INVALID_INPUT");
});

function httpDependencies(role, repository) {
  return {
    repository,
    now: () => now,
    async authorize(_request, scenicAreaId, roles) {
      if (!roles.includes(role)) return { state: "DENIED" };
      return { state: "AUTHORIZED", actor: { scenicAreaId, oidcSubject: role === "RELEASE_ADMIN" ? "oidc:release-b" : "oidc:operations-a", role } };
    },
  };
}

test("HTTP preparation requires same origin, bounded JSON and emergency role", async () => {
  const repository = {
    async readOverview() { return overview(); },
    async prepare() { return { state: "CREATED", receipt: receipt() }; },
    async publish() { throw new Error("unexpected"); },
  };
  const request = new Request("https://app.example.test/api/v1/admin/scenic-areas/fictional-park/route-operational-releases", {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "route-operational-release-key-0003" },
    body: JSON.stringify(prepareInput()),
  });
  const response = await handlePrepareRouteOperationalRelease(request, "fictional-park", httpDependencies("OPERATIONS_EMERGENCY", repository));
  assert.equal(response.status, 201);
  assert.ok(parseRouteOperationalReleaseReceipt((await response.json()).receipt));

  const crossOrigin = new Request(request.url, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
  assert.equal((await handlePrepareRouteOperationalRelease(crossOrigin, "fictional-park", httpDependencies("OPERATIONS_EMERGENCY", repository))).status, 403);
});

test("HTTP publication exposes deterministic conflict and independent-role responses", async () => {
  const repository = {
    async readOverview() { return overview(); },
    async prepare() { throw new Error("unexpected"); },
    async publish() { return { state: "PREPARER_CANNOT_PUBLISH" }; },
  };
  const request = new Request(`https://app.example.test/api/v1/admin/scenic-areas/fictional-park/route-operational-releases/${releaseId}/publish`, {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "route-operational-publish-key-0003" },
    body: JSON.stringify(publishInput()),
  });
  const response = await handlePublishRouteOperationalRelease(request, "fictional-park", releaseId, httpDependencies("RELEASE_ADMIN", repository));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "PREPARER_CANNOT_PUBLISH");
});

test("repository implementation compiles server-side and atomically supersedes the formal snapshot", async () => {
  const source = await readFile(new URL("../src/lib/server/route-operational-release-repository.ts", import.meta.url), "utf8");
  assert.match(source, /compileRouteOperationalRelease/);
  assert.match(source, /canonicalizeRouteOperationalSnapshot/);
  assert.match(source, /workflow_revision !== 2/);
  assert.match(source, /CLOSURE_SET_CHANGED/);
  assert.match(source, /OBSERVATION_SET_CHANGED/);
  assert.match(source, /closureEventSha256/);
  assert.match(source, /operationalObservationSha256/);
  assert.match(source, /route_operational_snapshot_release_observations/);
  assert.match(source, /SET lifecycle_state = 'WITHDRAWN', withdrawn_at/);
  assert.match(source, /SET lifecycle_state = 'SUPERSEDED'/);
  assert.match(source, /INSERT INTO scenic_published_snapshots/);
  assert.doesNotMatch(source, /(?:INSERT INTO|UPDATE)\s+(?:route_nodes|route_edges|route_network_revisions)/i);
});
