import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseRouteOperationalObservationOverview,
  parseRouteOperationalObservationReceipt,
} from "../src/lib/route-operational-observation-contract.ts";
import {
  handleReviewRouteOperationalObservation,
  handleSubmitRouteOperationalObservation,
} from "../src/lib/server/route-operational-observation-http.ts";
import {
  parseReviewRouteOperationalObservationInput,
  parseSubmitRouteOperationalObservationInput,
  readRouteOperationalObservationOverview,
  reviewRouteOperationalObservation,
  submitRouteOperationalObservation,
} from "../src/lib/server/route-operational-observation-service.ts";

const now = new Date("2026-08-16T08:00:00.000Z");
const observationId = "11111111-1111-4111-8111-111111111111";
const networkRevisionId = "22222222-2222-4222-8222-222222222222";
const edgeId = "33333333-3333-4333-8333-333333333333";

function actor(role = "OPERATIONS_EDITOR", oidcSubject = "oidc:operations-editor") {
  return { scenicAreaId: "fictional-park", oidcSubject, role };
}

function receipt(overrides = {}) {
  return {
    id: observationId,
    scenicAreaId: "fictional-park",
    networkRevisionId,
    edgeId,
    edgeCode: "edge-main-start",
    crowdLevel: "HIGH",
    weatherImpact: "RAIN",
    travelTimeMultiplier: 1.8,
    operatorNote: "Fictional sensor and two staff counts agree at the signed checkpoint.",
    sourceReference: "https://evidence.example.test/observations/source-1",
    observedAt: "2026-08-16T07:50:00.000Z",
    expiresAt: "2026-08-16T10:00:00.000Z",
    expectedSnapshotRevision: 7,
    workflowRevision: 1,
    reviewDecision: null,
    submittedBySubject: "oidc:operations-editor",
    submittedAt: "2026-08-16T08:00:00.000Z",
    reviewedBySubject: null,
    reviewedAt: null,
    reviewEvidenceReference: null,
    effectiveState: "PENDING_REVIEW",
    ...overrides,
  };
}

function overview(overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    actorRole: "OPERATIONS_EDITOR",
    serverTime: now.toISOString(),
    snapshot: {
      snapshotRevision: 7,
      networkRevisionId,
      networkRevision: "fictional-network-v1",
      operationalVersion: 7,
      validUntil: "2026-08-16T12:00:00.000Z",
    },
    edges: [{
      id: edgeId,
      edgeCode: "edge-main-start",
      fromNodeCode: "node-start",
      toNodeCode: "node-finish",
      distanceMeters: 320,
      operationalStatus: "OPEN",
      currentTravelTimeMultiplier: 1,
      currentCrowdLevel: "UNKNOWN",
      currentWeatherImpact: "UNKNOWN",
    }],
    observations: [receipt()],
    ...overrides,
  };
}

function submitInput(overrides = {}) {
  return {
    schemaVersion: 1,
    edgeId,
    crowdLevel: "HIGH",
    weatherImpact: "RAIN",
    travelTimeMultiplier: 1.8,
    operatorNote: "Fictional sensor and two staff counts agree at the signed checkpoint.",
    sourceReference: "https://evidence.example.test/observations/source-1",
    observedAt: "2026-08-16T07:50:00.000Z",
    expiresAt: "2026-08-16T10:00:00.000Z",
    expectedSnapshotRevision: 7,
    acknowledgeSourceBackedObservation: true,
    ...overrides,
  };
}

function reviewInput(overrides = {}) {
  return {
    schemaVersion: 1,
    decision: "CONFIRMED",
    expectedWorkflowRevision: 1,
    reviewEvidenceReference: "https://evidence.example.test/observations/review-1",
    acknowledgeIndependentReview: true,
    ...overrides,
  };
}

test("observation input contract is exact, time-bounded and rejects unsupported neutral combinations", () => {
  assert.ok(parseSubmitRouteOperationalObservationInput(submitInput(), now));
  assert.equal(parseSubmitRouteOperationalObservationInput({ ...submitInput(), extra: true }, now), null);
  assert.equal(parseSubmitRouteOperationalObservationInput(submitInput({ sourceReference: "http://unsafe.example.test" }), now), null);
  assert.equal(parseSubmitRouteOperationalObservationInput(submitInput({ travelTimeMultiplier: 1 }), now), null);
  assert.ok(parseSubmitRouteOperationalObservationInput(submitInput({ crowdLevel: "LOW", weatherImpact: "NONE", travelTimeMultiplier: 1 }), now));
  assert.equal(parseSubmitRouteOperationalObservationInput(submitInput({ expiresAt: "2026-08-16T14:00:01.000Z" }), now), null);
  assert.ok(parseReviewRouteOperationalObservationInput(reviewInput()));
  assert.equal(parseReviewRouteOperationalObservationInput(reviewInput({ acknowledgeIndependentReview: false })), null);
});

test("observation receipt and overview require exact reviewed-role separation", () => {
  assert.ok(parseRouteOperationalObservationReceipt(receipt()));
  assert.ok(parseRouteOperationalObservationOverview(overview()));
  const reviewed = receipt({
    workflowRevision: 2,
    reviewDecision: "CONFIRMED",
    reviewedBySubject: "oidc:operations-reviewer",
    reviewedAt: "2026-08-16T08:05:00.000Z",
    reviewEvidenceReference: "https://evidence.example.test/observations/review-1",
    effectiveState: "CONFIRMED",
  });
  assert.ok(parseRouteOperationalObservationReceipt(reviewed));
  assert.equal(parseRouteOperationalObservationReceipt({ ...reviewed, reviewedBySubject: reviewed.submittedBySubject }), null);
  assert.equal(parseRouteOperationalObservationOverview({ ...overview(), edges: [...overview().edges, overview().edges[0]] }), null);
});

test("service binds submit and review to distinct roles and validates storage receipts", async () => {
  const reviewed = receipt({
    workflowRevision: 2,
    reviewDecision: "CONFIRMED",
    reviewedBySubject: "oidc:operations-reviewer",
    reviewedAt: "2026-08-16T08:05:00.000Z",
    reviewEvidenceReference: "https://evidence.example.test/observations/review-1",
    effectiveState: "CONFIRMED",
  });
  const repository = {
    async readOverview() { return overview(); },
    async submit() { return { state: "CREATED", receipt: receipt() }; },
    async review() { return { state: "UPDATED", receipt: reviewed }; },
  };
  assert.equal((await readRouteOperationalObservationOverview(repository, actor(), now)).state, "FOUND");
  assert.equal((await submitRouteOperationalObservation(repository, submitInput(), actor(), "route-factor-submit-key-0001", now)).state, "CREATED");
  assert.equal((await submitRouteOperationalObservation(repository, submitInput(), actor("OPERATIONS_REVIEWER"), "route-factor-submit-key-0002", now)).state, "INVALID_INPUT");
  assert.equal((await reviewRouteOperationalObservation(repository, observationId, reviewInput(), actor("OPERATIONS_REVIEWER", "oidc:operations-reviewer"), "route-factor-review-key-0001", new Date("2026-08-16T08:05:00.000Z"))).state, "UPDATED");
  assert.equal((await reviewRouteOperationalObservation(repository, observationId, reviewInput(), actor(), "route-factor-review-key-0002", now)).state, "INVALID_INPUT");
});

function httpDependencies(role, repository) {
  return {
    repository,
    now: () => now,
    async authorize(_request, scenicAreaId, roles) {
      if (!roles.includes(role)) return { state: "DENIED" };
      return { state: "AUTHORIZED", actor: { scenicAreaId, oidcSubject: role === "OPERATIONS_EDITOR" ? "oidc:operations-editor" : "oidc:operations-reviewer", role } };
    },
  };
}

test("observation HTTP submission enforces same-origin and role-bound writes", async () => {
  const repository = {
    async readOverview() { return overview(); },
    async submit() { return { state: "CREATED", receipt: receipt() }; },
    async review() { throw new Error("unexpected"); },
  };
  const request = new Request("https://app.example.test/api/v1/admin/scenic-areas/fictional-park/route-operational-observations", {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "route-factor-submit-key-0003" },
    body: JSON.stringify(submitInput()),
  });
  const response = await handleSubmitRouteOperationalObservation(request, "fictional-park", httpDependencies("OPERATIONS_EDITOR", repository));
  assert.equal(response.status, 201);
  assert.ok(parseRouteOperationalObservationReceipt((await response.json()).receipt));
  const crossOrigin = new Request(request.url, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await handleSubmitRouteOperationalObservation(crossOrigin, "fictional-park", httpDependencies("OPERATIONS_EDITOR", repository))).status, 403);
});

test("observation HTTP review exposes independent-review conflicts", async () => {
  const repository = {
    async readOverview() { return overview(); },
    async submit() { throw new Error("unexpected"); },
    async review() { return { state: "SUBMITTER_CANNOT_REVIEW" }; },
  };
  const request = new Request(`https://app.example.test/api/v1/admin/scenic-areas/fictional-park/route-operational-observations/${observationId}/review`, {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "route-factor-review-key-0003" },
    body: JSON.stringify(reviewInput()),
  });
  const response = await handleReviewRouteOperationalObservation(request, "fictional-park", observationId, httpDependencies("OPERATIONS_REVIEWER", repository));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "SUBMITTER_CANNOT_REVIEW");
});

test("observation repository and migration bind immutable evidence to a complete snapshot release", async () => {
  const [repository, migration, rollback] = await Promise.all([
    readFile(new URL("../src/lib/server/route-operational-observation-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../database/migrations/016_route_operational_observations.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/rollbacks/016_route_operational_observations.sql", import.meta.url), "utf8"),
  ]);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /ACTIVE_OBSERVATION_EXISTS/);
  assert.match(repository, /current\.submitted_by_subject === command\.actor\.oidcSubject/);
  assert.match(repository, /ROUTE_OPERATIONAL_OBSERVATION_SUBMITTED/);
  assert.match(migration, /route_operational_observations/);
  assert.match(migration, /OPERATIONS_EDITOR/);
  assert.match(migration, /OPERATIONS_REVIEWER/);
  assert.match(migration, /route_operational_snapshot_release_observations/);
  assert.match(migration, /observation_sha256/);
  assert.match(migration, /append-only/);
  assert.match(migration, /NEW\.confirmed_observation_count IS DISTINCT FROM OLD\.confirmed_observation_count/);
  assert.match(rollback, /Refusing rollback 016/);
});
