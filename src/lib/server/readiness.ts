import { timingSafeEqual } from "node:crypto";

import { createRequestId, recordOperationalEvent, recordOperationalMetric } from "./observability";

export type ReadinessCoreState = "READY" | "BLOCKED";
export type ReadinessDegradationState = "AVAILABLE" | "DISABLED" | "NOT_CONFIGURED";

export type ReadinessResult = {
  requestId: string;
  status: "READY" | "BLOCKED";
  checkedAt: string;
  core: {
    database: ReadinessCoreState;
    migrations: ReadinessCoreState;
    publishedSnapshot: ReadinessCoreState;
    routeNetwork: ReadinessCoreState;
    operationalState: ReadinessCoreState;
  };
  degradable: {
    ai: ReadinessDegradationState;
    narration: ReadinessDegradationState;
  };
  codes: string[];
};

export type ReadinessRepository = {
  appliedMigrationFilenames(): Promise<string[]>;
  hasCurrentPublishedSnapshot(now: string): Promise<boolean>;
};

const REQUIRED_MIGRATIONS = [
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
] as const;

function aiReadiness(environment: NodeJS.ProcessEnv): ReadinessDegradationState {
  if (environment.AI_GUIDE_DISABLE_REMOTE === "1") return "DISABLED";
  return environment.GEMINI_API_KEY?.trim() ? "AVAILABLE" : "NOT_CONFIGURED";
}

function narrationReadiness(environment: NodeJS.ProcessEnv): ReadinessDegradationState {
  return environment.NARRATION_PROVIDER_ENABLED === "1" ? "AVAILABLE" : "NOT_CONFIGURED";
}

function emptyCore(): ReadinessResult["core"] {
  return {
    database: "BLOCKED",
    migrations: "BLOCKED",
    publishedSnapshot: "BLOCKED",
    routeNetwork: "BLOCKED",
    operationalState: "BLOCKED",
  };
}

export async function databaseReadinessRepository(): Promise<ReadinessRepository> {
  // Keep the database-only module out of pure readiness unit tests. The route
  // calls this only on the server; the imported module itself enforces server use.
  const { getDatabase } = await import("./database");
  return {
    async appliedMigrationFilenames() {
      const sql = getDatabase();
      const rows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
      return rows.map((row) => row.filename);
    },
    async hasCurrentPublishedSnapshot(now) {
      const sql = getDatabase();
      const rows = await sql<{ id: string }[]>`
        SELECT snapshot.id
        FROM scenic_published_snapshots AS snapshot
        JOIN route_network_revisions AS network
          ON network.id = snapshot.network_revision_id AND network.scenic_area_id = snapshot.scenic_area_id
        JOIN route_operational_versions AS operational
          ON operational.id = snapshot.operational_version_id
            AND operational.network_revision_id = snapshot.network_revision_id
            AND operational.scenic_area_id = snapshot.scenic_area_id
        WHERE snapshot.lifecycle_state = 'PUBLISHED'
          AND snapshot.withdrawn_at IS NULL
          AND snapshot.expires_at > ${now}
          AND network.lifecycle_state = 'PUBLISHED'
          AND network.verification_state = 'FIELD_VERIFIED'
          AND network.valid_until > ${now}
          AND operational.lifecycle_state = 'PUBLISHED'
          AND operational.expires_at > ${now}
        LIMIT 1
      `;
      return Boolean(rows[0]);
    },
  };
}

export async function probeReadiness(
  repository: ReadinessRepository | null,
  options: { now?: Date; environment?: NodeJS.ProcessEnv; requestId?: string } = {},
): Promise<ReadinessResult> {
  const now = options.now ?? new Date();
  const environment = options.environment ?? process.env;
  const requestId = options.requestId ?? createRequestId();
  const checkedAt = Number.isNaN(now.getTime()) ? new Date(0).toISOString() : now.toISOString();
  const core = emptyCore();
  const codes: string[] = [];
  const degradable = { ai: aiReadiness(environment), narration: narrationReadiness(environment) };

  if (Number.isNaN(now.getTime()) || !repository) {
    codes.push("READINESS_DATABASE_UNAVAILABLE");
  } else {
    try {
      const migrations = await repository.appliedMigrationFilenames();
      core.database = "READY";
      if (!REQUIRED_MIGRATIONS.every((filename) => migrations.includes(filename))) {
        codes.push("READINESS_MIGRATIONS_INCOMPLETE");
      } else {
        core.migrations = "READY";
        const snapshotAvailable = await repository.hasCurrentPublishedSnapshot(checkedAt);
        if (!snapshotAvailable) {
          codes.push("READINESS_PUBLISHED_SNAPSHOT_UNAVAILABLE");
        } else {
          core.publishedSnapshot = "READY";
          core.routeNetwork = "READY";
          core.operationalState = "READY";
        }
      }
    } catch {
      codes.push("READINESS_STORAGE_UNAVAILABLE");
    }
  }

  const status = codes.length === 0 ? "READY" : "BLOCKED";
  const result: ReadinessResult = { requestId, status, checkedAt, core, degradable, codes };
  recordOperationalMetric("liuzu.readiness.blocked", status === "BLOCKED" ? 1 : 0, { status });
  recordOperationalEvent({
    name: "readiness.probe",
    requestId,
    severity: status === "READY" ? "INFO" : "WARN",
    code: status === "READY" ? "READINESS_READY" : codes[0] ?? "READINESS_BLOCKED",
    attributes: { status, ai: degradable.ai, narration: degradable.narration },
  });
  return result;
}

export function isReadinessAuthorized(request: Request, environment: NodeJS.ProcessEnv = process.env) {
  const expected = environment.READINESS_CHECK_TOKEN;
  const supplied = request.headers.get("x-readiness-token");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function liveReadiness(requestId?: string) {
  const { isDatabaseConfigured } = await import("./database");
  const repository = isDatabaseConfigured() ? await databaseReadinessRepository() : null;
  return probeReadiness(repository, { requestId });
}
