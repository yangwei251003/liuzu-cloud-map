import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { VERIFIED_ADMIN_OIDC_IDENTITY } from "../src/lib/server/admin-oidc-rbac-domain.ts";
import { resolveVerifiedAdminIdentityAssertion } from "../src/lib/server/admin-identity-assertion.server.ts";
import {
  handleCreateGisDraftSubmission,
  handleListPendingGisDraftSubmissions,
  handleReadGisDraftSubmissionForReview,
  handleReviewGisDraftSubmission,
} from "../src/lib/server/gis-draft-submission-http.ts";
import {
  contentHashForGisDraftCollection,
  listPendingGisDraftSubmissions,
  parseGisDraftReviewInput,
  parseGisDraftReviewQueuePage,
  parseGisDraftSubmissionDetail,
  parseGisDraftSubmissionInput,
  parseGisDraftSubmissionReceipt,
  readGisDraftSubmissionForReview,
  reviewGisDraftSubmission,
  submitGisDraftCollection,
} from "../src/lib/server/gis-draft-submission-service.ts";
import {
  createEmptyMapEditorDraftCollection,
  createMapEditorDraft,
} from "../src/lib/map-editor-draft.ts";

const now = new Date("2026-08-16T10:00:00.000Z");
const submissionId = "123e4567-e89b-42d3-a456-426614174111";

function collection() {
  const draft = createMapEditorDraft({
    id: "candidate-path-1",
    title: "虚构测试步道",
    objectType: "PATH",
    geometry: { type: "LineString", coordinates: [[100, 20], [100.001, 20.001]] },
    sourceLabel: "虚构自动化测试来源",
    sourceUrl: "https://evidence.example.test/gis/path-1",
    capturedAt: new Date("2026-08-16T09:00:00.000Z"),
    routingAttributes: {
      traversalMode: "WALKWAY",
      difficulty: "EASY",
      scenicScore: 60,
      accessibility: "UNKNOWN",
      walkingTimeMultiplier: 1,
    },
    now,
  });
  assert.ok(draft);
  return { ...createEmptyMapEditorDraftCollection(), drafts: [draft] };
}

function receipt(command, overrides = {}) {
  return {
    schemaVersion: 1,
    submissionId,
    scenicAreaId: command.actor.scenicAreaId,
    submissionRevision: 1,
    workflowRevision: 1,
    state: "SUBMITTED",
    objectCount: command.collection?.drafts.length ?? 1,
    contentSha256: command.contentSha256 ?? "a".repeat(64),
    submittedAt: command.occurredAt ?? now.toISOString(),
    reviewedAt: null,
    decision: null,
    reviewEvidenceReference: null,
    ...overrides,
  };
}

function repository() {
  let created = null;
  return {
    async create(command) {
      if (created) {
        return created.command.idempotencyKeyHash === command.idempotencyKeyHash
          && created.command.contentSha256 === command.contentSha256
          ? { state: "REPLAYED", receipt: created.receipt }
          : { state: "IDEMPOTENCY_CONFLICT" };
      }
      created = { command, receipt: receipt(command) };
      return { state: "CREATED", receipt: created.receipt };
    },
    async review(command) {
      if (!created) return { state: "NOT_FOUND" };
      if (created.command.actor.oidcSubject === command.actor.oidcSubject) return { state: "SUBMITTER_CANNOT_REVIEW" };
      if (created.receipt.workflowRevision !== command.expectedWorkflowRevision) return { state: "REVISION_CONFLICT" };
      created.receipt = receipt(created.command, {
        workflowRevision: 2,
        state: command.decision === "APPROVE_FOR_FORMALIZATION" ? "APPROVED_FOR_FORMALIZATION" : "REJECTED",
        reviewedAt: command.occurredAt,
        decision: command.decision,
        reviewEvidenceReference: command.evidenceReference,
      });
      return { state: "UPDATED", receipt: created.receipt };
    },
    async listPending(command) {
      if (!created || created.receipt.state !== "SUBMITTED") return { schemaVersion: 1, items: [], nextBeforeRevision: null };
      return {
        schemaVersion: 1,
        items: [{
          receipt: created.receipt,
          reviewEligibility: created.command.actor.oidcSubject === command.actor.oidcSubject
            ? "SUBMITTER_CANNOT_REVIEW"
            : "ELIGIBLE",
        }],
        nextBeforeRevision: null,
      };
    },
    async readForReview(command) {
      if (!created || command.submissionId !== created.receipt.submissionId) return null;
      return {
        schemaVersion: 1,
        receipt: created.receipt,
        reviewEligibility: created.command.actor.oidcSubject === command.actor.oidcSubject
          ? "SUBMITTER_CANNOT_REVIEW"
          : "ELIGIBLE",
        collection: created.command.collection,
      };
    },
  };
}

const editor = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:giseditor", role: "GIS_EDITOR" };
const reviewer = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:gisreviewer", role: "GIS_REVIEWER" };
const rawIdempotencyKey = "gis-submit-00000001";

test("GIS candidate intake accepts one strict local collection and produces a stable canonical digest", () => {
  const value = { schemaVersion: 1, collection: collection() };
  const parsed = parseGisDraftSubmissionInput(value);
  assert.ok(parsed);
  assert.match(contentHashForGisDraftCollection(parsed.collection), /^[0-9a-f]{64}$/);
  assert.equal(contentHashForGisDraftCollection(parsed.collection), contentHashForGisDraftCollection(structuredClone(parsed.collection)));
  const secondDraft = createMapEditorDraft({
    id: "candidate-note-2",
    title: "虚构测试备注",
    objectType: "NOTE",
    geometry: { type: "Point", coordinates: [100.002, 20.002] },
    sourceLabel: "虚构自动化测试来源",
    sourceUrl: "https://evidence.example.test/gis/note-2",
    capturedAt: new Date("2026-08-16T09:05:00.000Z"),
    now,
  });
  assert.ok(secondDraft);
  const ordered = { ...parsed.collection, drafts: [...parsed.collection.drafts, secondDraft] };
  const reversed = { ...ordered, drafts: [...ordered.drafts].reverse() };
  assert.equal(contentHashForGisDraftCollection(ordered), contentHashForGisDraftCollection(reversed));
  assert.equal(parseGisDraftSubmissionInput({ ...value, publicationStatus: "PUBLISHED" }), null);
  assert.equal(parseGisDraftSubmissionInput({ schemaVersion: 1, collection: createEmptyMapEditorDraftCollection() }), null);
});

test("review queue and detail are reviewer-only, tenant-bound and revalidate the stored digest", async () => {
  const repo = repository();
  await submitGisDraftCollection(repo, { schemaVersion: 1, collection: collection() }, editor, rawIdempotencyKey, now);
  const queue = await listPendingGisDraftSubmissions(repo, { limit: 25, beforeRevision: null }, reviewer);
  assert.equal(queue.state, "FOUND");
  assert.ok(parseGisDraftReviewQueuePage(queue.page));
  assert.equal(queue.page.items[0].reviewEligibility, "ELIGIBLE");
  const editorDenied = await listPendingGisDraftSubmissions(repo, { limit: 25, beforeRevision: null }, editor);
  assert.equal(editorDenied.state, "INVALID_INPUT");

  const detail = await readGisDraftSubmissionForReview(repo, submissionId, reviewer);
  assert.equal(detail.state, "FOUND");
  assert.ok(parseGisDraftSubmissionDetail(detail.detail));
  const tamperedRepository = {
    ...repo,
    async readForReview(command) {
      const current = await repo.readForReview(command);
      return current && {
        ...current,
        collection: {
          ...current.collection,
          drafts: current.collection.drafts.map((draft) => ({ ...draft, title: `${draft.title}篡改` })),
        },
      };
    },
  };
  const tampered = await readGisDraftSubmissionForReview(tamperedRepository, submissionId, reviewer);
  assert.equal(tampered.state, "STORAGE_UNAVAILABLE");
});

test("submission is actor-scoped, idempotent and never accepts a reviewer as an editor", async () => {
  const repo = repository();
  const input = { schemaVersion: 1, collection: collection() };
  const first = await submitGisDraftCollection(repo, input, editor, rawIdempotencyKey, now);
  assert.equal(first.state, "CREATED");
  assert.ok(parseGisDraftSubmissionReceipt(first.receipt));
  const replay = await submitGisDraftCollection(repo, input, editor, rawIdempotencyKey, now);
  assert.equal(replay.state, "REPLAYED");
  const denied = await submitGisDraftCollection(repo, input, reviewer, "gis-submit-00000002", now);
  assert.equal(denied.state, "INVALID_INPUT");
});

test("review requires a different GIS reviewer, exact revision and HTTPS evidence", async () => {
  const repo = repository();
  await submitGisDraftCollection(repo, { schemaVersion: 1, collection: collection() }, editor, rawIdempotencyKey, now);
  const reviewInput = {
    schemaVersion: 1,
    expectedWorkflowRevision: 1,
    decision: "APPROVE_FOR_FORMALIZATION",
    evidenceReference: "https://evidence.example.test/reviews/gis-1",
  };
  assert.ok(parseGisDraftReviewInput(reviewInput));
  assert.equal(parseGisDraftReviewInput({ ...reviewInput, evidenceReference: "http://unsafe.test/review" }), null);
  const selfReview = await reviewGisDraftSubmission(repo, submissionId, reviewInput, { ...editor, role: "GIS_REVIEWER" }, "gis-review-00000001", now);
  assert.equal(selfReview.state, "SUBMITTER_CANNOT_REVIEW");
  const approved = await reviewGisDraftSubmission(repo, submissionId, reviewInput, reviewer, "gis-review-00000002", now);
  assert.equal(approved.state, "UPDATED");
  assert.equal(approved.receipt.state, "APPROVED_FOR_FORMALIZATION");
  assert.equal(approved.receipt.workflowRevision, 2);
});

test("admin HTTP endpoints enforce same-origin, bounded JSON, roles and no-store receipts", async () => {
  const repo = repository();
  const dependencies = {
    repository: repo,
    now: () => now,
    async authorize(_request, _scenicAreaId, roles) {
      return { state: "AUTHORIZED", actor: roles.includes("GIS_EDITOR") ? editor : reviewer };
    },
  };
  const request = new Request("https://tour.example/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions", {
    method: "POST",
    headers: { origin: "https://tour.example", "content-type": "application/json", "idempotency-key": rawIdempotencyKey },
    body: JSON.stringify({ schemaVersion: 1, collection: collection() }),
  });
  const response = await handleCreateGisDraftSubmission(request, "liuzu-town", dependencies);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.ok(parseGisDraftSubmissionReceipt((await response.json()).receipt));

  const crossOrigin = await handleCreateGisDraftSubmission(new Request(request.url, {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json", "idempotency-key": rawIdempotencyKey },
    body: JSON.stringify({ schemaVersion: 1, collection: collection() }),
  }), "liuzu-town", dependencies);
  assert.equal(crossOrigin.status, 403);

  const listResponse = await handleListPendingGisDraftSubmissions(new Request(request.url, {
    headers: { "sec-fetch-site": "same-origin" },
  }), "liuzu-town", dependencies);
  assert.equal(listResponse.status, 200);
  assert.ok(parseGisDraftReviewQueuePage((await listResponse.json()).page));

  const detailResponse = await handleReadGisDraftSubmissionForReview(new Request(`${request.url}/${submissionId}`, {
    headers: { "sec-fetch-site": "same-origin" },
  }), "liuzu-town", submissionId, dependencies);
  assert.equal(detailResponse.status, 200);
  assert.ok(parseGisDraftSubmissionDetail((await detailResponse.json()).detail));

  const invalidQuery = await handleListPendingGisDraftSubmissions(new Request(`${request.url}?state=PUBLISHED`, {
    headers: { "sec-fetch-site": "same-origin" },
  }), "liuzu-town", dependencies);
  assert.equal(invalidQuery.status, 400);

  const reviewResponse = await handleReviewGisDraftSubmission(new Request(`${request.url}/${submissionId}/review`, {
    method: "POST",
    headers: { origin: "https://tour.example", "content-type": "application/json", "idempotency-key": "gis-review-00000003" },
    body: JSON.stringify({ schemaVersion: 1, expectedWorkflowRevision: 1, decision: "REJECT", evidenceReference: "https://evidence.example.test/review/reject-1" }),
  }), "liuzu-town", submissionId, dependencies);
  assert.equal(reviewResponse.status, 200);
  assert.equal((await reviewResponse.json()).receipt.state, "REJECTED");
});

test("trusted edge identity assertion is signed, request-bound and short-lived", () => {
  const secret = "test-only-admin-identity-assertion-secret-123456";
  const path = "/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions";
  const payload = {
    schemaVersion: 1,
    issuedAt: now.toISOString(),
    method: "POST",
    path,
    identity: {
      verification: VERIFIED_ADMIN_OIDC_IDENTITY,
      issuer: "https://identity.example.test",
      audience: ["liuzu-admin"],
      subject: "oidc:giseditor",
      expiresAt: "2026-08-16T11:00:00.000Z",
      amr: ["mfa"],
      acr: null,
    },
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "utf8").digest("hex");
  const request = new Request(`https://tour.example${path}`, {
    method: "POST",
    headers: { "x-liuzu-admin-identity": encoded, "x-liuzu-admin-signature": signature },
  });
  const verified = resolveVerifiedAdminIdentityAssertion(request, { environment: { ADMIN_IDENTITY_ASSERTION_SECRET: secret }, now });
  assert.equal(verified.state, "VERIFIED");
  const wrongPath = resolveVerifiedAdminIdentityAssertion(new Request(`https://tour.example${path}/other`, { method: "POST", headers: request.headers }), { environment: { ADMIN_IDENTITY_ASSERTION_SECRET: secret }, now });
  assert.equal(wrongPath.state, "REJECTED");
  const stale = resolveVerifiedAdminIdentityAssertion(request, { environment: { ADMIN_IDENTITY_ASSERTION_SECRET: secret }, now: new Date("2026-08-16T10:02:00.001Z") });
  assert.equal(stale.state, "REJECTED");
});

test("GIS workflow ships tenant routes, editor/reviewer workspaces and an immutable non-publishing SQL quarantine", async () => {
  const [migration, createRoute, detailRoute, reviewRoute, runtime, repositorySource, editorSource, reviewerSource] = await Promise.all([
    readFile(new URL("../database/migrations/011_gis_draft_review_workflow.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/v1/admin/scenic-areas/[id]/gis-draft-submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/v1/admin/scenic-areas/[id]/gis-draft-submissions/[submissionId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/v1/admin/scenic-areas/[id]/gis-draft-submissions/[submissionId]/review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/gis-draft-submission-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/gis-draft-submission-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/MapDraftEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/GisDraftReviewWorkbench.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /APPROVED_FOR_FORMALIZATION/);
  assert.match(migration, /submitted_by_subject <>/);
  assert.match(migration, /reviewed_by_subject <> submitted_by_subject/);
  assert.match(migration, /reject_gis_draft_immutable_mutation/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+(?:route_network_revisions|route_nodes|route_edges|published_pois)/i);
  assert.match(createRoute, /handleCreateGisDraftSubmission/);
  assert.match(createRoute, /handleListPendingGisDraftSubmissions/);
  assert.match(detailRoute, /handleReadGisDraftSubmissionForReview/);
  assert.match(reviewRoute, /handleReviewGisDraftSubmission/);
  assert.match(runtime, /ADMIN_GIS_WORKFLOW_ENABLED/);
  assert.match(runtime, /resolveVerifiedAdminIdentityAssertion/);
  assert.match(repositorySource, /WHERE scenic_area_id = \$\{command\.actor\.scenicAreaId\}[\s\S]{0,160}submission_id = \$\{command\.submissionId\}/);
  assert.match(editorSource, /提交专业审核/);
  assert.match(editorSource, /\/api\/v1\/admin\/scenic-areas\/liuzu-town\/gis-draft-submissions/);
  assert.match(editorSource, /不会直接写入正式路网/);
  assert.match(reviewerSource, /通过并进入待正式化/);
  assert.match(reviewerSource, /不会生成正式路网/);
  assert.match(reviewerSource, /当前身份是提交人，不能自审/);
});
