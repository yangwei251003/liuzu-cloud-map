import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

import { closeDatabase } from "../src/lib/server/database.ts";
import { postgresGisDraftSubmissionRepository } from "../src/lib/server/gis-draft-submission-repository.ts";
import {
  reviewGisDraftSubmission,
  submitGisDraftCollection,
} from "../src/lib/server/gis-draft-submission-service.ts";
import { postgresGisFormalizationRepository } from "../src/lib/server/gis-formalization-repository.ts";
import {
  prepareGisFormalization,
  publishGisFormalization,
} from "../src/lib/server/gis-formalization-service.ts";
import { postgresRouteOperationalObservationRepository } from "../src/lib/server/route-operational-observation-repository.ts";
import {
  reviewRouteOperationalObservation,
  submitRouteOperationalObservation,
} from "../src/lib/server/route-operational-observation-service.ts";
import { postgresRouteOperationalReleaseRepository } from "../src/lib/server/route-operational-release-repository.ts";
import {
  prepareRouteOperationalRelease,
  publishRouteOperationalRelease,
} from "../src/lib/server/route-operational-release-service.ts";

const testConnection = process.env.DATABASE_TEST_URL?.trim();
if (
  !testConnection
  || process.env.ALLOW_DATABASE_INTEGRATION_TESTS !== "1"
  || process.env.DATABASE_TEST_CONFIRM_DISPOSABLE !== "1"
) {
  process.stderr.write("N6-N12 真库流程未执行：缺少一次性数据库双重确认。\n");
  process.exit(2);
}

const sslMode = process.env.DATABASE_SSL_MODE?.trim() || "verify-full";
const sql = postgres(testConnection, {
  max: 2,
  connect_timeout: 10,
  idle_timeout: 10,
  ssl: sslMode === "disable" ? false : "verify-full",
  onnotice: () => undefined,
});

const scenicAreaId = "liuzu-town";
const base = new Date();
const at = (minutes) => new Date(base.getTime() + minutes * 60_000);
const iso = (minutes) => at(minutes).toISOString();

const routing = {
  traversalMode: "WALKWAY",
  difficulty: "EASY",
  scenicScore: 60,
  accessibility: "VERIFIED_ACCESSIBLE",
  walkingTimeMultiplier: 1,
};
const visit = {
  interests: ["NATURE", "PHOTOGRAPHY"],
  dwellMinutes: 15,
  editorialPriority: 70,
  familyFriendly: true,
  restArea: false,
  photoSpot: true,
};

function draft({ id, title, objectType, geometry, routingAttributes = null, visitAttributes = null }) {
  return {
    schemaVersion: 2,
    id,
    scenicAreaId,
    title,
    objectType,
    geometry,
    coordinateSystem: "WGS84",
    source: {
      label: `Fictional disposable PostGIS evidence for ${title}`,
      url: `https://evidence.example.test/postgis/${id}`,
      capturedAt: iso(-1_440),
    },
    routingAttributes,
    visitAttributes,
    notes: null,
    verificationStatus: "CANDIDATE_DRAFT",
    publicationStatus: "LOCAL_DRAFT_ONLY",
    createdAt: iso(-1_440),
    updatedAt: iso(-1_440),
  };
}

const collection = {
  schemaVersion: 2,
  scenicAreaId,
  warning: "LOCAL_CANDIDATE_DRAFTS_NOT_FOR_NAVIGATION",
  drafts: [
    draft({
      id: "ci-public-access",
      title: "Fictional CI public access",
      objectType: "PATH",
      geometry: { type: "LineString", coordinates: [[112.999, 22], [113, 22]] },
      routingAttributes: routing,
    }),
    draft({
      id: "ci-internal-walk",
      title: "Fictional CI internal walk",
      objectType: "PATH",
      geometry: { type: "LineString", coordinates: [[113, 22], [113.001, 22], [113.002, 22]] },
      routingAttributes: { ...routing, scenicScore: 80 },
    }),
    draft({
      id: "ci-main-entry",
      title: "Fictional CI entry",
      objectType: "ENTRANCE",
      geometry: { type: "Point", coordinates: [113, 22] },
    }),
    draft({
      id: "ci-destination",
      title: "Fictional CI destination",
      objectType: "POI",
      geometry: { type: "Point", coordinates: [113.002, 22] },
      visitAttributes: visit,
    }),
    draft({
      id: "ci-rest-facility",
      title: "Fictional CI rest facility",
      objectType: "FACILITY",
      geometry: { type: "Point", coordinates: [113.001, 22] },
      visitAttributes: { ...visit, interests: ["NATURE"], restArea: true, photoSpot: false },
    }),
    draft({
      id: "ci-recommended-route",
      title: "Fictional CI recommended route",
      objectType: "RECOMMENDED_ROUTE",
      geometry: { type: "LineString", coordinates: [[113, 22], [113.001, 22], [113.002, 22]] },
      routingAttributes: { ...routing, scenicScore: 80 },
    }),
    draft({
      id: "ci-boundary",
      title: "Fictional CI boundary",
      objectType: "BOUNDARY",
      geometry: {
        type: "Polygon",
        coordinates: [[[112.998, 21.999], [113.003, 21.999], [113.003, 22.001], [112.998, 22.001], [112.998, 21.999]]],
      },
    }),
  ],
};

const editor = { scenicAreaId, oidcSubject: "oidc:ci-gis-editor-a", role: "GIS_EDITOR" };
const originalReviewer = { scenicAreaId, oidcSubject: "oidc:ci-gis-reviewer-b", role: "GIS_REVIEWER" };
const formalizer = { scenicAreaId, oidcSubject: "oidc:ci-gis-formalizer-c", role: "GIS_REVIEWER" };
const releaseAdmin = { scenicAreaId, oidcSubject: "oidc:ci-release-admin-d", role: "RELEASE_ADMIN" };
const operationsEditor = { scenicAreaId, oidcSubject: "oidc:ci-operations-editor-e", role: "OPERATIONS_EDITOR" };
const operationsReviewer = { scenicAreaId, oidcSubject: "oidc:ci-operations-reviewer-f", role: "OPERATIONS_REVIEWER" };
const operationsPreparer = { scenicAreaId, oidcSubject: "oidc:ci-operations-preparer-g", role: "OPERATIONS_EMERGENCY" };

const prepareInput = (submissionId) => ({
  schemaVersion: 1,
  submissionId,
  expectedSubmissionWorkflowRevision: 2,
  providerName: "Fictional disposable CI survey team",
  sourceReference: "https://evidence.example.test/postgis/formal-source",
  fieldEvidenceReference: "https://evidence.example.test/postgis/field-review",
  licenseReference: "https://evidence.example.test/postgis/license",
  rightsHolder: "Fictional disposable CI rights holder",
  coordinateAccuracyMeters: 2,
  validUntil: iso(10_080),
  operationalSourceReference: "https://evidence.example.test/postgis/initial-open",
  operationalResponsibleParty: "Fictional disposable CI operations desk",
  operationalExpiresAt: iso(720),
  pathPolicies: [
    { draftId: "ci-public-access", layer: "PUBLIC", walkingDirection: "BIDIRECTIONAL" },
    { draftId: "ci-internal-walk", layer: "INTERNAL", walkingDirection: "BIDIRECTIONAL" },
  ],
  entrancePolicies: [{ draftId: "ci-main-entry", type: "ENTRY" }],
  acknowledgeAllObjectSourcesVerified: true,
  acknowledgeRightsPermitDisplayRoutingCachingDerivatives: true,
  acknowledgeExactTopologyNoImplicitSnapping: true,
  acknowledgeNotesExcludedFromPublication: true,
});

const publishInput = {
  schemaVersion: 1,
  expectedWorkflowRevision: 1,
  managementEvidenceReference: "https://evidence.example.test/postgis/management-release",
  acknowledgeAtomicReplacement: true,
  acknowledgeAllEdgesInitiallyOpen: true,
  acknowledgeOfflinePackRequiresSeparateRelease: true,
};

async function expectDatabaseRejection(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, label);
}

try {
  const existingData = await sql`
    SELECT
      (SELECT COUNT(*)::integer FROM gis_draft_submissions) AS submissions,
      (SELECT COUNT(*)::integer FROM gis_formalization_releases) AS releases,
      (SELECT COUNT(*)::integer FROM scenic_published_snapshots) AS snapshots
  `;
  assert.deepEqual(existingData[0], { submissions: 0, releases: 0, snapshots: 0 }, "workflow probe requires an empty migrated database");

  const submissions = await Promise.all([
    submitGisDraftCollection(
      postgresGisDraftSubmissionRepository,
      { schemaVersion: 1, collection },
      editor,
      "postgis-ci-submit-key-0001",
      at(-180),
    ),
    submitGisDraftCollection(
      postgresGisDraftSubmissionRepository,
      { schemaVersion: 1, collection },
      editor,
      "postgis-ci-submit-key-0001",
      at(-180),
    ),
  ]);
  assert.deepEqual(submissions.map((result) => result.state).sort(), ["CREATED", "REPLAYED"]);
  const createdSubmission = submissions.find((result) => result.state === "CREATED");
  assert.ok(createdSubmission && "receipt" in createdSubmission);
  const submissionId = createdSubmission.receipt.submissionId;

  const selfReview = await reviewGisDraftSubmission(
    postgresGisDraftSubmissionRepository,
    submissionId,
    {
      schemaVersion: 1,
      expectedWorkflowRevision: 1,
      decision: "APPROVE_FOR_FORMALIZATION",
      evidenceReference: "https://evidence.example.test/postgis/review",
    },
    { ...originalReviewer, oidcSubject: editor.oidcSubject },
    "postgis-ci-self-review-key-0001",
    at(-130),
  );
  assert.equal(selfReview.state, "SUBMITTER_CANNOT_REVIEW");

  const review = await reviewGisDraftSubmission(
    postgresGisDraftSubmissionRepository,
    submissionId,
    {
      schemaVersion: 1,
      expectedWorkflowRevision: 1,
      decision: "APPROVE_FOR_FORMALIZATION",
      evidenceReference: "https://evidence.example.test/postgis/review",
    },
    originalReviewer,
    "postgis-ci-review-key-0001",
    at(-120),
  );
  assert.equal(review.state, "UPDATED");

  await expectDatabaseRejection(
    () => sql`UPDATE gis_draft_objects SET title = 'forbidden mutation' WHERE submission_id = ${submissionId}`,
    "submitted GIS objects must be immutable in PostGIS",
  );

  const reviewerCannotPrepare = await prepareGisFormalization(
    postgresGisFormalizationRepository,
    prepareInput(submissionId),
    originalReviewer,
    "postgis-ci-self-prepare-key-0001",
    at(-90),
  );
  assert.equal(reviewerCannotPrepare.state, "REVIEWER_CANNOT_PREPARE");

  const preparations = await Promise.all([
    prepareGisFormalization(
      postgresGisFormalizationRepository,
      prepareInput(submissionId),
      formalizer,
      "postgis-ci-prepare-key-0001",
      at(-60),
    ),
    prepareGisFormalization(
      postgresGisFormalizationRepository,
      prepareInput(submissionId),
      formalizer,
      "postgis-ci-prepare-key-0001",
      at(-60),
    ),
  ]);
  assert.deepEqual(preparations.map((result) => result.state).sort(), ["CREATED", "REPLAYED"]);
  const createdRelease = preparations.find((result) => result.state === "CREATED");
  assert.ok(createdRelease && "receipt" in createdRelease);
  const releaseId = createdRelease.receipt.id;

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION integration_fail_n9_snapshot_insert()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'intentional N9 atomicity fault';
    END;
    $$
  `);
  await sql.unsafe(`
    CREATE TRIGGER integration_fail_n9_snapshot_insert
    BEFORE INSERT ON scenic_published_snapshots
    FOR EACH ROW EXECUTE FUNCTION integration_fail_n9_snapshot_insert()
  `);

  let injectedFailure = "";
  try {
    await postgresGisFormalizationRepository.publish({
      actor: releaseAdmin,
      releaseId,
      expectedWorkflowRevision: 1,
      managementEvidenceReference: publishInput.managementEvidenceReference,
      idempotencyKeyHash: createHash("sha256").update("postgis-ci-failing-publish-key-0001", "utf8").digest("hex"),
      occurredAt: iso(-50),
    });
  } catch (error) {
    injectedFailure = error instanceof Error ? error.message : String(error);
  }
  assert.match(injectedFailure, /intentional N9 atomicity fault/, "fault injection must reach the final snapshot insert");

  const afterFault = await sql`
    SELECT
      (SELECT COUNT(*)::integer FROM data_sources) AS sources,
      (SELECT COUNT(*)::integer FROM scenic_area_publications) AS publications,
      (SELECT COUNT(*)::integer FROM route_network_revisions) AS networks,
      (SELECT COUNT(*)::integer FROM route_nodes) AS nodes,
      (SELECT COUNT(*)::integer FROM route_edges) AS edges,
      (SELECT COUNT(*)::integer FROM route_operational_versions) AS operations,
      (SELECT COUNT(*)::integer FROM scenic_published_snapshots) AS snapshots,
      (SELECT COUNT(*)::integer FROM gis_formalization_release_actions WHERE action = 'PUBLISH') AS publish_actions
  `;
  assert.deepEqual(afterFault[0], {
    sources: 0,
    publications: 0,
    networks: 0,
    nodes: 0,
    edges: 0,
    operations: 0,
    snapshots: 0,
    publish_actions: 0,
  }, "a late snapshot fault must roll back every formal publication write");
  const [releaseAfterFault] = await sql`
    SELECT lifecycle_state, workflow_revision, published_by_subject
    FROM gis_formalization_releases WHERE id = ${releaseId}
  `;
  assert.deepEqual(releaseAfterFault, { lifecycle_state: "PREPARED", workflow_revision: 1, published_by_subject: null });

  await sql.unsafe("DROP TRIGGER integration_fail_n9_snapshot_insert ON scenic_published_snapshots");
  await sql.unsafe("DROP FUNCTION integration_fail_n9_snapshot_insert()");

  const preparerCannotPublish = await publishGisFormalization(
    postgresGisFormalizationRepository,
    releaseId,
    publishInput,
    { ...releaseAdmin, oidcSubject: formalizer.oidcSubject },
    "postgis-ci-preparer-publish-key-0001",
    at(-49),
  );
  assert.equal(preparerCannotPublish.state, "PREPARER_CANNOT_PUBLISH");

  const submitterCannotPublish = await publishGisFormalization(
    postgresGisFormalizationRepository,
    releaseId,
    publishInput,
    { ...releaseAdmin, oidcSubject: editor.oidcSubject },
    "postgis-ci-submitter-publish-key-0001",
    at(-49),
  );
  assert.equal(submitterCannotPublish.state, "DUTY_SEPARATION_FAILED");

  const publication = await publishGisFormalization(
    postgresGisFormalizationRepository,
    releaseId,
    publishInput,
    releaseAdmin,
    "postgis-ci-publish-key-0001",
    at(-48),
  );
  assert.equal(publication.state, "PUBLISHED");
  assert.ok("receipt" in publication);
  assert.equal(publication.receipt.workflowRevision, 2);
  assert.equal(publication.receipt.lifecycleState, "PUBLISHED");

  const replay = await publishGisFormalization(
    postgresGisFormalizationRepository,
    releaseId,
    publishInput,
    releaseAdmin,
    "postgis-ci-publish-key-0001",
    at(-47),
  );
  assert.equal(replay.state, "REPLAYED");

  const [materialized] = await sql`
    SELECT
      (SELECT COUNT(*)::integer FROM scenic_area_publications WHERE lifecycle_state = 'PUBLISHED') AS publications,
      (SELECT COUNT(*)::integer FROM route_network_revisions WHERE lifecycle_state = 'PUBLISHED') AS networks,
      (SELECT COUNT(*)::integer FROM published_boundaries) AS boundaries,
      (SELECT COUNT(*)::integer FROM published_entrances) AS entrances,
      (SELECT COUNT(*)::integer FROM published_pois) AS pois,
      (SELECT COUNT(*)::integer FROM published_facilities) AS facilities,
      (SELECT COUNT(*)::integer FROM published_recommended_routes) AS recommendations,
      (SELECT COUNT(*)::integer FROM route_nodes) AS nodes,
      (SELECT COUNT(*)::integer FROM route_edges) AS edges,
      (SELECT COUNT(*)::integer FROM route_edge_operational_states) AS edge_states,
      (SELECT COUNT(*)::integer FROM scenic_published_snapshots WHERE lifecycle_state = 'PUBLISHED' AND withdrawn_at IS NULL) AS active_snapshots,
      (SELECT COUNT(*)::integer FROM gis_formalization_release_actions WHERE action = 'PUBLISH') AS publish_actions
  `;
  assert.equal(materialized.publications, 1);
  assert.equal(materialized.networks, 1);
  assert.equal(materialized.boundaries, 1);
  assert.equal(materialized.entrances, 1);
  assert.equal(materialized.pois, 1);
  assert.equal(materialized.facilities, 1);
  assert.equal(materialized.recommendations, 1);
  assert.equal(materialized.nodes, publication.receipt.nodeCount);
  assert.equal(materialized.edges, publication.receipt.edgeCount);
  assert.equal(materialized.edge_states, publication.receipt.edgeCount);
  assert.equal(materialized.active_snapshots, 1);
  assert.equal(materialized.publish_actions, 1);

  const [spatialIntegrity] = await sql`
    SELECT bool_and(ST_SRID(geometry_wgs84) = 4326 AND ST_IsValid(geometry_wgs84)) AS nodes_valid
    FROM route_nodes
  `;
  assert.equal(spatialIntegrity.nodes_valid, true);
  const [binding] = await sql`
    SELECT release.lifecycle_state, release.snapshot_revision,
           snapshot.snapshot_revision AS stored_snapshot_revision,
           snapshot.network_revision_id = release.network_revision_id AS network_bound,
           snapshot.operational_version_id = release.operational_version_id AS operation_bound
    FROM gis_formalization_releases AS release
    JOIN scenic_published_snapshots AS snapshot ON snapshot.id = release.snapshot_id
    WHERE release.id = ${releaseId}
  `;
  assert.deepEqual(binding, {
    lifecycle_state: "PUBLISHED",
    snapshot_revision: 1,
    stored_snapshot_revision: 1,
    network_bound: true,
    operation_bound: true,
  });

  const [factorEdge] = await sql`
    SELECT id, edge_code FROM route_edges
    WHERE network_revision_id = ${publication.receipt.networkRevisionId}
    ORDER BY edge_code
    LIMIT 1
  `;
  assert.ok(factorEdge?.id);
  const observation = await submitRouteOperationalObservation(
    postgresRouteOperationalObservationRepository,
    {
      schemaVersion: 1,
      edgeId: factorEdge.id,
      crowdLevel: "HIGH",
      weatherImpact: "RAIN",
      travelTimeMultiplier: 1.8,
      operatorNote: "Fictional disposable CI crowd and rain observation for transaction verification.",
      sourceReference: "https://evidence.example.test/postgis/operational-observation",
      observedAt: iso(-41),
      expiresAt: iso(120),
      expectedSnapshotRevision: publication.receipt.snapshotRevision,
      acknowledgeSourceBackedObservation: true,
    },
    operationsEditor,
    "postgis-ci-observation-submit-key-0001",
    at(-40),
  );
  assert.equal(observation.state, "CREATED");
  assert.ok("receipt" in observation);

  const reviewedObservation = await reviewRouteOperationalObservation(
    postgresRouteOperationalObservationRepository,
    observation.receipt.id,
    {
      schemaVersion: 1,
      decision: "CONFIRMED",
      expectedWorkflowRevision: 1,
      reviewEvidenceReference: "https://evidence.example.test/postgis/operational-observation-review",
      acknowledgeIndependentReview: true,
    },
    operationsReviewer,
    "postgis-ci-observation-review-key-0001",
    at(-39),
  );
  assert.equal(reviewedObservation.state, "UPDATED");

  const operationalRelease = await prepareRouteOperationalRelease(
    postgresRouteOperationalReleaseRepository,
    {
      schemaVersion: 1,
      expectedSnapshotRevision: publication.receipt.snapshotRevision,
      sourceReference: "https://evidence.example.test/postgis/operational-factor-release",
      reasonSummary: "Compile the independently reviewed fictional CI crowd and weather observation.",
      acknowledgeConfirmedEventsOnly: true,
      acknowledgeReviewedFactorsOnly: true,
    },
    operationsPreparer,
    "postgis-ci-operational-release-key-0001",
    at(-38),
  );
  assert.equal(operationalRelease.state, "CREATED");
  assert.ok("receipt" in operationalRelease);
  assert.equal(operationalRelease.receipt.confirmedEventCount, 0);
  assert.equal(operationalRelease.receipt.confirmedObservationCount, 1);

  const publishedOperationalRelease = await publishRouteOperationalRelease(
    postgresRouteOperationalReleaseRepository,
    operationalRelease.receipt.id,
    {
      schemaVersion: 1,
      expectedWorkflowRevision: 1,
      releaseEvidenceReference: "https://evidence.example.test/postgis/operational-factor-release-approval",
      acknowledgeAtomicReplacement: true,
      acknowledgeOfflinePacksInvalidated: true,
    },
    releaseAdmin,
    "postgis-ci-operational-publish-key-0001",
    at(-37),
  );
  assert.equal(publishedOperationalRelease.state, "PUBLISHED");
  assert.ok("receipt" in publishedOperationalRelease);

  const [dynamicPublication] = await sql`
    SELECT snapshot.snapshot_revision, operational.operational_version,
           state.travel_time_multiplier, state.crowd_level, state.weather_impact,
           release.confirmed_event_count, release.confirmed_observation_count,
           (SELECT COUNT(*)::integer FROM route_operational_observation_actions WHERE observation_id = ${observation.receipt.id}) AS observation_actions,
           (SELECT COUNT(*)::integer FROM route_operational_snapshot_release_observations WHERE release_id = ${operationalRelease.receipt.id}) AS observation_bindings
    FROM scenic_published_snapshots AS snapshot
    JOIN route_operational_versions AS operational ON operational.id = snapshot.operational_version_id
    JOIN route_edge_operational_states AS state
      ON state.operational_version_id = operational.id AND state.edge_id = ${factorEdge.id}
    JOIN route_operational_snapshot_releases AS release ON release.replacement_snapshot_id = snapshot.id
    WHERE snapshot.scenic_area_id = ${scenicAreaId}
      AND snapshot.lifecycle_state = 'PUBLISHED' AND snapshot.withdrawn_at IS NULL
  `;
  assert.equal(dynamicPublication.snapshot_revision, 2);
  assert.equal(dynamicPublication.operational_version, 2);
  assert.equal(Number(dynamicPublication.travel_time_multiplier), 1.8);
  assert.equal(dynamicPublication.crowd_level, "HIGH");
  assert.equal(dynamicPublication.weather_impact, "RAIN");
  assert.equal(dynamicPublication.confirmed_event_count, 0);
  assert.equal(dynamicPublication.confirmed_observation_count, 1);
  assert.equal(dynamicPublication.observation_actions, 2);
  assert.equal(dynamicPublication.observation_bindings, 1);

  await expectDatabaseRejection(
    () => sql`UPDATE route_operational_snapshot_releases SET confirmed_observation_count = 2 WHERE id = ${operationalRelease.receipt.id}`,
    "compiled operational observation counts must remain immutable",
  );
  await expectDatabaseRejection(
    () => sql`DELETE FROM route_operational_observation_actions WHERE observation_id = ${observation.receipt.id}`,
    "operational observation actions must remain append-only",
  );

  await expectDatabaseRejection(
    () => sql`UPDATE gis_formalization_releases SET plan_sha256 = ${"f".repeat(64)} WHERE id = ${releaseId}`,
    "published formalization plans must remain immutable",
  );
  await expectDatabaseRejection(
    () => sql`DELETE FROM gis_formalization_release_actions WHERE release_id = ${releaseId}`,
    "formalization actions must remain append-only",
  );

  process.stdout.write("PostGIS N6-N12 workflow probe: immutable GIS intake, atomic formal publication, reviewed dynamic factors and complete snapshot replacement passed.\n");
} finally {
  await closeDatabase();
  await sql.end({ timeout: 5 });
}
