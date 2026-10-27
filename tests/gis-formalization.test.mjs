import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileGisFormalizationPlan,
  materializeGisFormalization,
} from "../src/lib/gis-formalization-compiler.ts";
import {
  parseGisFormalizationOverview,
  parseGisFormalizationReceipt,
  parsePrepareGisFormalizationInput,
  parsePublishGisFormalizationInput,
} from "../src/lib/gis-formalization-contract.ts";
import { contentHashForGisDraftCollection } from "../src/lib/server/gis-draft-submission-service.ts";
import {
  handlePrepareGisFormalization,
  handlePublishGisFormalization,
} from "../src/lib/server/gis-formalization-http.ts";
import {
  prepareGisFormalization,
  publishGisFormalization,
  readGisFormalizationOverview,
} from "../src/lib/server/gis-formalization-service.ts";
import { validateRouteNetwork } from "../src/lib/route-network.ts";
import { validateRouteOperationalState } from "../src/lib/route-operational-state.ts";

const now = new Date("2026-08-16T02:00:00.000Z");
const submissionId = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";
const poiId = "33333333-3333-4333-8333-333333333333";

function draft({ id, title, objectType, geometry, routingAttributes = null, visitAttributes = null }) {
  return {
    schemaVersion: 2,
    id,
    scenicAreaId: "liuzu-town",
    title,
    objectType,
    geometry,
    coordinateSystem: "WGS84",
    source: {
      label: `Fictional field evidence for ${title}`,
      url: `https://evidence.example.test/gis/${id}`,
      capturedAt: "2026-08-15T01:00:00.000Z",
    },
    routingAttributes,
    visitAttributes,
    notes: null,
    verificationStatus: "CANDIDATE_DRAFT",
    publicationStatus: "LOCAL_DRAFT_ONLY",
    createdAt: "2026-08-15T01:00:00.000Z",
    updatedAt: "2026-08-15T01:00:00.000Z",
  };
}

function collection(overrides = {}) {
  const routing = {
    traversalMode: "WALKWAY",
    difficulty: "EASY",
    scenicScore: 50,
    accessibility: "VERIFIED_ACCESSIBLE",
    walkingTimeMultiplier: 1,
  };
  const visit = {
    interests: ["NATURE", "PHOTOGRAPHY"],
    dwellMinutes: 20,
    editorialPriority: 70,
    familyFriendly: true,
    restArea: false,
    photoSpot: true,
  };
  return {
    schemaVersion: 2,
    scenicAreaId: "liuzu-town",
    warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
    drafts: [
      draft({ id: "public-access", title: "Fictional public access", objectType: "PATH", geometry: { type: "LineString", coordinates: [[112.999, 22], [113, 22]] }, routingAttributes: routing }),
      draft({ id: "internal-walk", title: "Fictional internal walk", objectType: "PATH", geometry: { type: "LineString", coordinates: [[113, 22], [113.001, 22], [113.002, 22]] }, routingAttributes: { ...routing, scenicScore: 80 } }),
      draft({ id: "main-entry", title: "Fictional entry", objectType: "ENTRANCE", geometry: { type: "Point", coordinates: [113, 22] } }),
      draft({ id: "fictional-poi", title: "Fictional destination", objectType: "POI", geometry: { type: "Point", coordinates: [113.002, 22] }, visitAttributes: visit }),
      draft({ id: "fictional-boundary", title: "Fictional boundary", objectType: "BOUNDARY", geometry: { type: "Polygon", coordinates: [[[112.998, 21.999], [113.003, 21.999], [113.003, 22.001], [112.998, 22.001], [112.998, 21.999]]] } }),
    ],
    ...overrides,
  };
}

function source(value = collection()) {
  return {
    submissionId,
    submissionRevision: 9,
    submissionContentSha256: contentHashForGisDraftCollection(value),
    reviewedBySubject: "oidc:gis-reviewer-a",
    reviewedAt: "2026-08-16T01:00:00.000Z",
    collection: value,
  };
}

function prepareInput(overrides = {}) {
  return {
    schemaVersion: 1,
    submissionId,
    expectedSubmissionWorkflowRevision: 2,
    providerName: "Fictional survey team",
    sourceReference: "https://evidence.example.test/gis/formal-source",
    fieldEvidenceReference: "https://evidence.example.test/gis/field-review",
    licenseReference: "https://evidence.example.test/gis/license",
    rightsHolder: "Fictional rights holder",
    coordinateAccuracyMeters: 2,
    validUntil: "2026-08-23T02:00:00.000Z",
    operationalSourceReference: "https://evidence.example.test/operations/initial-open",
    operationalResponsibleParty: "Fictional operations desk",
    operationalExpiresAt: "2026-08-17T02:00:00.000Z",
    pathPolicies: [
      { draftId: "public-access", layer: "PUBLIC", walkingDirection: "BIDIRECTIONAL" },
      { draftId: "internal-walk", layer: "INTERNAL", walkingDirection: "BIDIRECTIONAL" },
    ],
    entrancePolicies: [{ draftId: "main-entry", type: "ENTRY" }],
    acknowledgeAllObjectSourcesVerified: true,
    acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true,
    acknowledgeExactTopologyNoImplicitSnapping: true,
    acknowledgeNotesExcludedFromPublication: true,
    ...overrides,
  };
}

function publishInput(overrides = {}) {
  return {
    schemaVersion: 1,
    expectedWorkflowRevision: 1,
    managementEvidenceReference: "https://evidence.example.test/gis/management-release",
    acknowledgeAtomicReplacement: true,
    acknowledgeAllEdgesInitiallyOpen: true,
    acknowledgeOfflinePackRequiresSeparateRelease: true,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    id: releaseId,
    scenicAreaId: "liuzu-town",
    submissionId,
    submissionRevision: 9,
    workflowRevision: 1,
    lifecycleState: "PREPARED",
    planSha256: "a".repeat(64),
    nodeCount: 5,
    edgeCount: 3,
    poiCount: 1,
    preparedBySubject: "oidc:gis-formalizer-b",
    preparedAt: now.toISOString(),
    validUntil: "2026-08-23T02:00:00.000Z",
    operationalExpiresAt: "2026-08-17T02:00:00.000Z",
    publishedBySubject: null,
    publishedAt: null,
    managementEvidenceReference: null,
    snapshotRevision: null,
    networkRevision: "r-9-aaaaaaaaaaaa",
    ...overrides,
  };
}

function overview(role = "GIS_REVIEWER", overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: "liuzu-town",
    actorRole: role,
    serverTime: now.toISOString(),
    approvedSubmissions: [{ submissionId, submissionRevision: 9, objectCount: 5, contentSha256: "b".repeat(64), reviewedAt: "2026-08-16T01:00:00.000Z" }],
    candidates: [],
    ...overrides,
  };
}

test("formalization compiler derives deterministic exact topology and materializes a publishable snapshot", () => {
  const compiled = compileGisFormalizationPlan(source(), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(compiled.ok, true);
  assert.equal(compiled.plan.edges.length, 3);
  assert.equal(compiled.plan.nodes.filter((node) => node.layer === "PUBLIC").length, 2);
  assert.equal(compiled.plan.nodes.filter((node) => node.layer === "INTERNAL").length, 3);
  const again = compileGisFormalizationPlan(source(), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(again.ok, true);
  assert.equal(again.planSha256, compiled.planSha256);

  const materialized = materializeGisFormalization(compiled.plan, source().collection, { poiIdsByDraftId: new Map([["fictional-poi", poiId]]) }, "oidc:release-admin-c", publishInput().managementEvidenceReference, now);
  assert.equal(materialized.ok, true, materialized.ok ? "" : materialized.issues.join("\n"));
  assert.equal(validateRouteNetwork(materialized.value.routeNetwork, now, "liuzu-town").status, "PUBLISHABLE");
  assert.equal(validateRouteOperationalState(materialized.value.operationalState, materialized.value.routeNetwork, now, "liuzu-town").status, "VALID");
  assert.equal(materialized.value.routeNetwork.edges.every((edge) => edge.dynamicStatus.status === "OPEN"), true);
});

test("formalization materializes drawn recommendations as exact internal edge sequences", () => {
  const candidate = collection();
  candidate.drafts.push(draft({
    id: "reviewed-main-route",
    title: "Fictional reviewed main route",
    objectType: "RECOMMENDED_ROUTE",
    geometry: { type: "LineString", coordinates: [[113, 22], [113.001, 22], [113.002, 22]] },
    routingAttributes: { traversalMode: "WALKWAY", difficulty: "EASY", scenicScore: 90, accessibility: "VERIFIED_ACCESSIBLE", walkingTimeMultiplier: 1 },
  }));
  const compiled = compileGisFormalizationPlan(source(candidate), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(compiled.ok, true, compiled.ok ? "" : compiled.issues.join("\n"));
  if (!compiled.ok) return;
  assert.equal(compiled.plan.recommendedRoutes.length, 1);
  assert.equal(compiled.plan.recommendedRoutes[0].segments.length, 2);
  const materialized = materializeGisFormalization(compiled.plan, candidate, { poiIdsByDraftId: new Map([["fictional-poi", poiId]]) }, "oidc:release-admin-c", publishInput().managementEvidenceReference, now);
  assert.equal(materialized.ok, true, materialized.ok ? "" : materialized.issues.join("\n"));
  if (!materialized.ok) return;
  assert.equal(materialized.value.routeNetwork.recommendedRoutes?.length, 1);
  assert.deepEqual(materialized.value.routeNetwork.recommendedRoutes?.[0].segments.map(({ traversalDirection }) => traversalDirection), ["FORWARD", "FORWARD"]);
  assert.equal(validateRouteNetwork(materialized.value.routeNetwork, now, "liuzu-town").status, "PUBLISHABLE");

  const skippedVertex = structuredClone(candidate);
  skippedVertex.drafts.find(({ id }) => id === "reviewed-main-route").geometry.coordinates = [[113, 22], [113.002, 22]];
  const rejected = compileGisFormalizationPlan(source(skippedVertex), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(rejected.ok, false);
  assert.match(rejected.issues.join(" "), /RECOMMENDED_ROUTE_SEGMENT_NOT_UNIQUE/);
});

test("formalization derives transport ETA from reviewed service phases and rejects multi-vertex or incomplete transport lines", () => {
  const service = {
    serviceName: "虚构测试观光车",
    boardingMinutes: 2,
    expectedWaitMinutes: 5,
    inVehicleMinutes: 10,
    scheduleEvidenceReference: "https://evidence.example.test/transport/schedule",
  };
  const candidate = collection();
  candidate.drafts = candidate.drafts.map((item) => item.id === "internal-walk" ? {
    ...item,
    title: "Fictional internal shuttle",
    geometry: { type: "LineString", coordinates: [[113, 22], [113.002, 22]] },
    routingAttributes: {
      ...item.routingAttributes,
      traversalMode: "SHUTTLE",
      walkingTimeMultiplier: 1,
      transportService: service,
    },
  } : item);
  const compiled = compileGisFormalizationPlan(source(candidate), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(compiled.ok, true, compiled.ok ? "" : compiled.issues.join("\n"));
  if (!compiled.ok) return;
  const transportEdge = compiled.plan.edges.find((edge) => edge.pathDraftId === "internal-walk");
  assert.equal(transportEdge?.estimatedMinutes, 17);
  const materialized = materializeGisFormalization(compiled.plan, candidate, { poiIdsByDraftId: new Map([["fictional-poi", poiId]]) }, "oidc:release-admin-c", publishInput().managementEvidenceReference, now);
  assert.equal(materialized.ok, true, materialized.ok ? "" : materialized.issues.join("\n"));
  if (!materialized.ok) return;
  const publishedTransport = materialized.value.routeNetwork.edges.find((edge) => edge.routing?.traversalMode === "SHUTTLE");
  assert.equal(publishedTransport?.routing?.transportService?.serviceName, "虚构测试观光车");

  const multiVertex = structuredClone(candidate);
  multiVertex.drafts = multiVertex.drafts.map((item) => item.id === "internal-walk" ? {
    ...item,
    geometry: { type: "LineString", coordinates: [[113, 22], [113.001, 22], [113.002, 22]] },
  } : item);
  const rejectedGeometry = compileGisFormalizationPlan(source(multiVertex), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(rejectedGeometry.ok, false);
  assert.match(rejectedGeometry.issues.join(" "), /TRANSPORT_PATH_MUST_HAVE_TWO_ENDPOINTS/);

  const missingService = structuredClone(candidate);
  missingService.drafts = missingService.drafts.map((item) => item.id === "internal-walk" ? {
    ...item,
    routingAttributes: { ...item.routingAttributes, transportService: undefined },
  } : item);
  delete missingService.drafts.find((item) => item.id === "internal-walk").routingAttributes.transportService;
  const rejectedService = compileGisFormalizationPlan(source(missingService), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(rejectedService.ok, false);
  assert.match(rejectedService.issues.join(" "), /TRANSPORT_SERVICE_REQUIRED/);
});

test("compiler rejects implicit snapping, missing route layers and self-preparation", () => {
  const moved = collection();
  moved.drafts = moved.drafts.map((item) => item.id === "fictional-poi" ? { ...item, geometry: { type: "Point", coordinates: [113.001999, 22] } } : item);
  const offVertex = compileGisFormalizationPlan(source(moved), prepareInput(), "oidc:gis-formalizer-b", now);
  assert.equal(offVertex.ok, false);
  assert.match(offVertex.issues.join(" "), /POINT_NOT_EXACT_INTERNAL_VERTEX/);
  const oneLayer = compileGisFormalizationPlan(source(), prepareInput({ pathPolicies: prepareInput().pathPolicies.map((policy) => ({ ...policy, layer: "INTERNAL" })) }), "oidc:gis-formalizer-b", now);
  assert.equal(oneLayer.ok, false);
  assert.ok(oneLayer.issues.includes("BOTH_LAYERS_REQUIRED"));
  const selfPrepare = compileGisFormalizationPlan(source(), prepareInput(), "oidc:gis-reviewer-a", now);
  assert.equal(selfPrepare.ok, false);
  assert.ok(selfPrepare.issues.includes("REVIEWER_CANNOT_PREPARE"));
});

test("formalization exchange contracts are exact and enforce independent publication receipts", () => {
  assert.ok(parsePrepareGisFormalizationInput(prepareInput()));
  assert.equal(parsePrepareGisFormalizationInput({ ...prepareInput(), routeNetwork: {} }), null);
  assert.equal(parsePrepareGisFormalizationInput(prepareInput({ acknowledgeExactTopologyNoImplicitSnapping: false })), null);
  assert.ok(parsePublishGisFormalizationInput(publishInput()));
  assert.equal(parsePublishGisFormalizationInput(publishInput({ acknowledgeAllEdgesInitiallyOpen: false })), null);
  assert.ok(parseGisFormalizationReceipt(receipt()));
  assert.equal(parseGisFormalizationReceipt({ ...receipt(), unexpected: true }), null);
  assert.equal(parseGisFormalizationReceipt(receipt({ workflowRevision: 2, lifecycleState: "PUBLISHED", publishedBySubject: "oidc:gis-formalizer-b", publishedAt: now.toISOString(), managementEvidenceReference: publishInput().managementEvidenceReference, snapshotRevision: 1 })), null);
  assert.ok(parseGisFormalizationOverview(overview()));
});

test("service binds prepare and publish operations to the correct roles", async () => {
  const published = receipt({ workflowRevision: 2, lifecycleState: "PUBLISHED", publishedBySubject: "oidc:release-admin-c", publishedAt: now.toISOString(), managementEvidenceReference: publishInput().managementEvidenceReference, snapshotRevision: 4 });
  const repository = {
    async readOverview() { return overview(); },
    async prepare() { return { state: "CREATED", receipt: receipt() }; },
    async publish() { return { state: "PUBLISHED", receipt: published }; },
  };
  const reviewer = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:gis-formalizer-b", role: "GIS_REVIEWER" };
  const releaseAdmin = { scenicAreaId: "liuzu-town", oidcSubject: "oidc:release-admin-c", role: "RELEASE_ADMIN" };
  assert.equal((await readGisFormalizationOverview(repository, reviewer, now)).state, "FOUND");
  assert.equal((await prepareGisFormalization(repository, prepareInput(), reviewer, "gis-formalization-prepare-key-0001", now)).state, "CREATED");
  assert.equal((await prepareGisFormalization(repository, prepareInput(), releaseAdmin, "gis-formalization-prepare-key-0002", now)).state, "INVALID_INPUT");
  assert.equal((await publishGisFormalization(repository, releaseId, publishInput(), releaseAdmin, "gis-formalization-publish-key-0001", now)).state, "PUBLISHED");
  assert.equal((await publishGisFormalization(repository, releaseId, publishInput(), reviewer, "gis-formalization-publish-key-0002", now)).state, "INVALID_INPUT");
});

function httpDependencies(role, repository) {
  return {
    repository,
    now: () => now,
    async authorize(_request, scenicAreaId, roles) {
      if (!roles.includes(role)) return { state: "DENIED" };
      return { state: "AUTHORIZED", actor: { scenicAreaId, oidcSubject: role === "RELEASE_ADMIN" ? "oidc:release-admin-c" : "oidc:gis-formalizer-b", role } };
    },
  };
}

test("HTTP formalization writes require same origin, bounded exact JSON and role separation", async () => {
  const prepareRepository = {
    async readOverview() { return overview(); },
    async prepare() { return { state: "CREATED", receipt: receipt() }; },
    async publish() { throw new Error("unexpected"); },
  };
  const prepareRequest = new Request("https://app.example.test/api/v1/admin/scenic-areas/liuzu-town/gis-formalizations", {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "gis-formalization-prepare-key-0003" },
    body: JSON.stringify(prepareInput()),
  });
  assert.equal((await handlePrepareGisFormalization(prepareRequest, "liuzu-town", httpDependencies("GIS_REVIEWER", prepareRepository))).status, 201);
  const crossOrigin = new Request(prepareRequest.url, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify(prepareInput()) });
  assert.equal((await handlePrepareGisFormalization(crossOrigin, "liuzu-town", httpDependencies("GIS_REVIEWER", prepareRepository))).status, 403);

  const publishRepository = {
    async readOverview() { return overview("RELEASE_ADMIN"); },
    async prepare() { throw new Error("unexpected"); },
    async publish() { return { state: "ACTIVE_CLOSURES" }; },
  };
  const publishRequest = new Request(`https://app.example.test/api/v1/admin/scenic-areas/liuzu-town/gis-formalizations/${releaseId}/publish`, {
    method: "POST",
    headers: { Origin: "https://app.example.test", "Content-Type": "application/json", "Idempotency-Key": "gis-formalization-publish-key-0003" },
    body: JSON.stringify(publishInput()),
  });
  const response = await handlePublishGisFormalization(publishRequest, "liuzu-town", releaseId, httpDependencies("RELEASE_ADMIN", publishRepository));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "ACTIVE_CLOSURES");
});

test("repository formalizes only server-reloaded candidates and uses one replacement transaction", async () => {
  const sourceText = await readFile(new URL("../src/lib/server/gis-formalization-repository.ts", import.meta.url), "utf8");
  assert.match(sourceText, /contentHashForGisDraftCollection/);
  assert.match(sourceText, /compileGisFormalizationPlan/);
  assert.match(sourceText, /materializeGisFormalization/);
  assert.match(sourceText, /ACTIVE_CLOSURES/);
  assert.match(sourceText, /OPERATIONAL_RELEASE_PENDING/);
  assert.match(sourceText, /INSERT INTO route_network_revisions/);
  assert.match(sourceText, /INSERT INTO route_nodes/);
  assert.match(sourceText, /INSERT INTO route_edges/);
  assert.match(sourceText, /INSERT INTO published_pois/);
  assert.match(sourceText, /INSERT INTO scenic_published_snapshots/);
  assert.match(sourceText, /UPDATE formal_offline_packs/);
  assert.match(sourceText, /UPDATE scenic_published_snapshots SET lifecycle_state = 'WITHDRAWN'/);
});
