import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseRouteClosureReceipt,
  parseRouteOperationsOverview,
} from "../src/lib/route-operations-contract.ts";
import {
  handleActivateRouteClosure,
  handleReadRouteOperations,
  handleReviewRouteClosure,
} from "../src/lib/server/route-operations-http.ts";
import {
  activateRouteClosure,
  parseActivateRouteClosureInput,
  parseReviewRouteClosureInput,
  readRouteOperationsOverview,
  reviewRouteClosure,
} from "../src/lib/server/route-operations-service.ts";

const now = new Date("2026-08-16T10:00:00.000Z");
const edgeId = "123e4567-e89b-42d3-a456-426614174501";
const eventId = "123e4567-e89b-42d3-a456-426614174502";
const networkRevisionId = "123e4567-e89b-42d3-a456-426614174503";
const emergency = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:emergency-operator", role: "OPERATIONS_EMERGENCY" };
const reviewer = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:release-reviewer", role: "RELEASE_ADMIN" };

function activationInput(overrides = {}) {
  return {
    schemaVersion: 1,
    edgeId,
    status: "CLOSED",
    incidentType: "SAFETY_OBSERVATION",
    operatorNote: "自动化测试确认的现场安全观察，仅用于验证软件管制链路。",
    sourceReference: "https://evidence.example.test/operations/source-1",
    reasonEvidenceReference: "https://evidence.example.test/operations/reason-1",
    startsAt: "2026-08-16T10:00:00.000Z",
    expiresAt: "2026-08-16T12:00:00.000Z",
    expectedSnapshotRevision: 7,
    acknowledgeImmediateRouteStop: true,
    ...overrides,
  };
}

function overview(actorRole, events = []) {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    actorRole,
    serverTime: now.toISOString(),
    snapshot: {
      snapshotRevision: 7,
      networkRevisionId,
      networkRevision: "field-release-7",
      operationalVersion: 12,
      validUntil: "2026-08-17T10:00:00.000Z",
    },
    edges: [{
      id: edgeId,
      edgeCode: "edge-test-1",
      fromNodeCode: "node-a",
      toNodeCode: "node-b",
      distanceMeters: 125.5,
      safetyState: "OPEN",
      operationalStatus: "OPEN",
    }],
    events,
  };
}

function memoryRepository() {
  let current = null;
  let activateCommand = null;
  let reviewCommand = null;
  return {
    get activateCommand() { return activateCommand; },
    get reviewCommand() { return reviewCommand; },
    async readOverview(command) {
      return overview(command.actor.role, current ? [current] : []);
    },
    async activate(command) {
      if (activateCommand) {
        return activateCommand.idempotencyKeyHash === command.idempotencyKeyHash
          && activateCommand.edgeId === command.edgeId
          ? { state: "REPLAYED", receipt: current }
          : { state: "IDEMPOTENCY_CONFLICT" };
      }
      activateCommand = command;
      current = {
        id: eventId,
        scenicAreaId: command.actor.scenicAreaId,
        networkRevisionId,
        edgeId: command.edgeId,
        edgeCode: "edge-test-1",
        status: command.status,
        incidentType: command.incidentType,
        operatorNote: command.operatorNote,
        sourceReference: command.sourceReference,
        reasonEvidenceReference: command.reasonEvidenceReference,
        startsAt: command.startsAt,
        expiresAt: command.expiresAt,
        expectedSnapshotRevision: command.expectedSnapshotRevision,
        workflowRevision: 1,
        reviewDecision: null,
        activatedBySubject: command.actor.oidcSubject,
        activatedAt: command.occurredAt,
        reviewedBySubject: null,
        reviewedAt: null,
        reviewEvidenceReference: null,
        withdrawnAt: null,
        effectiveState: "ACTIVE_PENDING_REVIEW",
      };
      return { state: "CREATED", receipt: current };
    },
    async review(command) {
      if (!current || command.closureEventId !== current.id) return { state: "NOT_FOUND" };
      if (current.activatedBySubject === command.actor.oidcSubject) return { state: "ACTIVATOR_CANNOT_REVIEW" };
      if (reviewCommand) return reviewCommand.idempotencyKeyHash === command.idempotencyKeyHash ? { state: "REPLAYED", receipt: current } : { state: "IDEMPOTENCY_CONFLICT" };
      if (current.workflowRevision !== command.expectedWorkflowRevision) return { state: "REVISION_CONFLICT" };
      reviewCommand = command;
      current = {
        ...current,
        workflowRevision: 2,
        reviewDecision: command.decision,
        reviewedBySubject: command.actor.oidcSubject,
        reviewedAt: command.occurredAt,
        reviewEvidenceReference: command.reviewEvidenceReference,
        withdrawnAt: command.decision === "WITHDRAWN" ? command.occurredAt : null,
        effectiveState: command.decision === "WITHDRAWN" ? "WITHDRAWN" : "ACTIVE_CONFIRMED",
      };
      return { state: "UPDATED", receipt: current };
    },
  };
}

test("route operations contracts reject extra fields, unsafe evidence and invalid event windows", () => {
  assert.ok(parseActivateRouteClosureInput(activationInput(), now));
  assert.equal(parseActivateRouteClosureInput({ ...activationInput(), publish: true }, now), null);
  assert.equal(parseActivateRouteClosureInput(activationInput({ sourceReference: "http://unsafe.test/source" }), now), null);
  assert.equal(parseActivateRouteClosureInput(activationInput({ expiresAt: "2026-08-25T12:00:00.000Z" }), now), null);
  assert.ok(parseReviewRouteClosureInput({
    schemaVersion: 1,
    decision: "WITHDRAWN",
    expectedWorkflowRevision: 1,
    reviewEvidenceReference: "https://evidence.example.test/review/withdraw-1",
    acknowledgeWithdrawalIsNotProofOfOpen: true,
  }));
  assert.equal(parseReviewRouteClosureInput({
    schemaVersion: 1,
    decision: "WITHDRAWN",
    expectedWorkflowRevision: 1,
    reviewEvidenceReference: "https://evidence.example.test/review/withdraw-1",
    acknowledgeWithdrawalIsNotProofOfOpen: false,
  }), null);
  assert.equal(parseRouteOperationsOverview({ ...overview("OPERATIONS_EMERGENCY"), untrusted: true }), null);
});

test("an emergency activation is version-bound and only an independent release admin can review it", async () => {
  const repository = memoryRepository();
  const currentOverview = await readRouteOperationsOverview(repository, emergency, now);
  assert.equal(currentOverview.state, "FOUND");
  assert.equal(currentOverview.overview.actorRole, "OPERATIONS_EMERGENCY");
  const deniedRole = await activateRouteClosure(repository, activationInput(), reviewer, "route-closure-test-0001", now);
  assert.equal(deniedRole.state, "INVALID_INPUT");
  const activated = await activateRouteClosure(repository, activationInput(), emergency, "route-closure-test-0001", now);
  assert.equal(activated.state, "CREATED");
  assert.ok(parseRouteClosureReceipt(activated.receipt));
  assert.equal(activated.receipt.effectiveState, "ACTIVE_PENDING_REVIEW");
  assert.equal(repository.activateCommand.expectedSnapshotRevision, 7);
  const replay = await activateRouteClosure(repository, activationInput(), emergency, "route-closure-test-0001", now);
  assert.equal(replay.state, "REPLAYED");

  const reviewInput = {
    schemaVersion: 1,
    decision: "CONFIRMED",
    expectedWorkflowRevision: 1,
    reviewEvidenceReference: "https://evidence.example.test/review/confirm-1",
    acknowledgeWithdrawalIsNotProofOfOpen: true,
  };
  const selfReview = await reviewRouteClosure(repository, eventId, reviewInput, { ...emergency, role: "RELEASE_ADMIN" }, "route-review-test-0001", now);
  assert.equal(selfReview.state, "ACTIVATOR_CANNOT_REVIEW");
  const confirmed = await reviewRouteClosure(repository, eventId, reviewInput, reviewer, "route-review-test-0002", now);
  assert.equal(confirmed.state, "UPDATED");
  assert.equal(confirmed.receipt.reviewDecision, "CONFIRMED");
  assert.equal(confirmed.receipt.workflowRevision, 2);
});

test("overview and HTTP writes are role-scoped, same-origin and no-store", async () => {
  const repository = memoryRepository();
  const dependencies = {
    repository,
    now: () => now,
    async authorize(_request, scenicAreaId, roles) {
      if (scenicAreaId !== "liuzu-town") return { state: "DENIED" };
      return { state: "AUTHORIZED", actor: roles.includes("OPERATIONS_EMERGENCY") ? emergency : reviewer };
    },
  };
  const endpoint = "https://tour.example/api/v1/admin/scenic-areas/liuzu-town/route-operations";
  const readResponse = await handleReadRouteOperations(new Request(endpoint, { headers: { "sec-fetch-site": "same-origin" } }), "liuzu-town", dependencies);
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.headers.get("cache-control"), "no-store, max-age=0");
  const readBody = await readResponse.json();
  assert.ok(parseRouteOperationsOverview(readBody.overview));

  const crossOrigin = await handleActivateRouteClosure(new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json", "idempotency-key": "route-closure-http-0001" },
    body: JSON.stringify(activationInput()),
  }), "liuzu-town", dependencies);
  assert.equal(crossOrigin.status, 403);

  const activated = await handleActivateRouteClosure(new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://tour.example", "content-type": "application/json", "idempotency-key": "route-closure-http-0002" },
    body: JSON.stringify(activationInput()),
  }), "liuzu-town", dependencies);
  assert.equal(activated.status, 201);
  assert.ok(parseRouteClosureReceipt((await activated.json()).receipt));

  const reviewed = await handleReviewRouteClosure(new Request(`${endpoint}/${eventId}/review`, {
    method: "POST",
    headers: { origin: "https://tour.example", "content-type": "application/json", "idempotency-key": "route-review-http-0001" },
    body: JSON.stringify({
      schemaVersion: 1,
      decision: "WITHDRAWN",
      expectedWorkflowRevision: 1,
      reviewEvidenceReference: "https://evidence.example.test/review/withdraw-http",
      acknowledgeWithdrawalIsNotProofOfOpen: true,
    }),
  }), "liuzu-town", eventId, {
    ...dependencies,
    async authorize() { return { state: "AUTHORIZED", actor: reviewer }; },
  });
  assert.equal(reviewed.status, 200);
  const receipt = parseRouteClosureReceipt((await reviewed.json()).receipt);
  assert.equal(receipt.reviewDecision, "WITHDRAWN");
  assert.equal(receipt.effectiveState, "WITHDRAWN");
});

test("N7 ships an append-only, non-GIS emergency control path with trusted admin gating", async () => {
  const [migration, repository, runtime, route, reviewRoute, workbench] = await Promise.all([
    readFile(new URL("../database/migrations/012_route_closure_control.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/route-operations-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/route-operations-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/v1/admin/scenic-areas/[id]/route-operations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/v1/admin/scenic-areas/[id]/route-operations/[eventId]/review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/RouteOperationsWorkbench.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /route_closure_event_actions/);
  assert.match(migration, /append-only/i);
  assert.match(migration, /reviewed_by_subject <> preauthorized_by_subject/);
  assert.match(migration, /WITHDRAWN removes this event as a blocker; it is not evidence that the physical road is open/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois)/i);
  assert.match(repository, /edge\.safety_state = 'OPEN' AND state\.status = 'OPEN'/);
  assert.match(repository, /ROUTE_CLOSURE_ACTIVATED/);
  assert.match(runtime, /ROUTE_OPERATIONS_ENABLED/);
  assert.match(runtime, /resolveVerifiedAdminIdentityAssertion/);
  assert.match(route, /handleActivateRouteClosure/);
  assert.match(reviewRoute, /handleReviewRouteClosure/);
  assert.match(workbench, /撤回事件只移除本事件的阻断，不证明物理道路已开放/);
});
