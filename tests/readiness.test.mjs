import assert from "node:assert/strict";
import test from "node:test";

import { isReadinessAuthorized, probeReadiness } from "../src/lib/server/readiness.ts";

const allMigrations = [
  "001_initial.sql",
  "002_visitor_identity.sql",
  "003_p0_control_plane.sql",
  "004_social_ecosystem.sql",
  "005_scenic_navigation_intelligence.sql",
  "006_formal_offline_navigation_packs.sql",
  "007_travel_group_live_location.sql",
  "008_formal_scenic_itineraries.sql",
  "009_formal_place_communities.sql",
  "010_navigation_session_lifecycle.sql",
  "011_gis_draft_review_workflow.sql",
];

test("readiness fails closed when core storage or its current snapshot is unavailable", async () => {
  const unavailable = await probeReadiness(null, {
    now: new Date("2026-08-15T00:00:00.000Z"),
    environment: { AI_GUIDE_DISABLE_REMOTE: "1" },
    requestId: "req-unavailable",
  });
  assert.equal(unavailable.status, "BLOCKED");
  assert.equal(unavailable.core.database, "BLOCKED");
  assert.deepEqual(unavailable.codes, ["READINESS_DATABASE_UNAVAILABLE"]);

  const noSnapshot = await probeReadiness({
    async appliedMigrationFilenames() { return allMigrations; },
    async hasCurrentPublishedSnapshot() { return false; },
  }, {
    now: new Date("2026-08-15T00:00:00.000Z"),
    environment: {},
    requestId: "req-no-snapshot",
  });
  assert.equal(noSnapshot.status, "BLOCKED");
  assert.equal(noSnapshot.core.migrations, "READY");
  assert.equal(noSnapshot.core.routeNetwork, "BLOCKED");
  assert.deepEqual(noSnapshot.codes, ["READINESS_PUBLISHED_SNAPSHOT_UNAVAILABLE"]);
});

test("readiness distinguishes a core-ready route snapshot from degradable AI and narration", async () => {
  const result = await probeReadiness({
    async appliedMigrationFilenames() { return allMigrations; },
    async hasCurrentPublishedSnapshot() { return true; },
  }, {
    now: new Date("2026-08-15T00:00:00.000Z"),
    environment: { AI_GUIDE_DISABLE_REMOTE: "1" },
    requestId: "req-ready",
  });
  assert.equal(result.status, "READY");
  assert.equal(result.core.operationalState, "READY");
  assert.equal(result.degradable.ai, "DISABLED");
  assert.equal(result.degradable.narration, "NOT_CONFIGURED");
});

test("readiness requires an exact header token without echoing it", () => {
  const environment = { READINESS_CHECK_TOKEN: "test-readiness-token-which-is-long-enough" };
  assert.equal(isReadinessAuthorized(new Request("https://example.test/api/readiness"), environment), false);
  assert.equal(isReadinessAuthorized(new Request("https://example.test/api/readiness", { headers: { "x-readiness-token": "wrong" } }), environment), false);
  assert.equal(isReadinessAuthorized(new Request("https://example.test/api/readiness", { headers: { "x-readiness-token": environment.READINESS_CHECK_TOKEN } }), environment), true);
});
