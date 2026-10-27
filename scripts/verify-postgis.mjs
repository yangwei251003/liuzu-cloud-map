import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const testConnection = process.env.DATABASE_TEST_URL?.trim();
const integrationApproved = process.env.ALLOW_DATABASE_INTEGRATION_TESTS === "1";
const disposableConfirmed = process.env.DATABASE_TEST_CONFIRM_DISPOSABLE === "1";

if (!testConnection || !integrationApproved || !disposableConfirmed) {
  process.stderr.write(
    "真库集成未执行：需要一次性 DATABASE_TEST_URL、ALLOW_DATABASE_INTEGRATION_TESTS=1 与 DATABASE_TEST_CONFIRM_DISPOSABLE=1。\n",
  );
  process.exit(2);
}

let parsedConnection;
try {
  parsedConnection = new URL(testConnection);
  if (!["postgres:", "postgresql:"].includes(parsedConnection.protocol)) throw new Error("not_postgres");
  const databaseName = decodeURIComponent(parsedConnection.pathname.replace(/^\//, ""));
  if (!/(^|[_-])(test|ci)([_-]|$)/i.test(databaseName)) throw new Error("not_disposable_name");
} catch {
  process.stderr.write("真库集成未执行：DATABASE_TEST_URL 必须指向名称明确含 test/ci 的一次性 PostgreSQL 数据库。\n");
  process.exit(2);
}

const sslMode = process.env.DATABASE_SSL_MODE?.trim() || "verify-full";
if (sslMode !== "verify-full" && sslMode !== "disable") {
  process.stderr.write("真库集成未执行：DATABASE_SSL_MODE 仅允许 verify-full 或 disable。\n");
  process.exit(2);
}
const ssl = sslMode === "disable" ? false : "verify-full";

const runner = (name, environment, argumentsList = []) => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", name), ...argumentsList], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: environment,
  });
  if (result.error || result.status !== 0) throw new Error(`${name} failed`);
};

const runWorkflowProbe = (environment) => {
  const result = spawnSync(process.execPath, [
    "--no-warnings",
    "--import",
    path.join(process.cwd(), "tests", "register-typescript.mjs"),
    path.join(process.cwd(), "scripts", "verify-postgis-workflows.mjs"),
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: environment,
  });
  if (result.error || result.status !== 0) throw new Error("verify-postgis-workflows.mjs failed");
};

const migrationEnvironment = {
  ...process.env,
  DATABASE_MIGRATION_URL: testConnection,
  DATABASE_SSL_MODE: sslMode,
};
const workflowEnvironment = {
  ...process.env,
  DATABASE_URL: testConnection,
  DATABASE_TEST_URL: testConnection,
  DATABASE_SSL_MODE: sslMode,
  ALLOW_DATABASE_INTEGRATION_TESTS: "1",
  DATABASE_TEST_CONFIRM_DISPOSABLE: "1",
};

const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const rollbacksDirectory = path.join(process.cwd(), "database", "rollbacks");
const expectedMigrations = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
  .sort();
const rollbackNames = new Set((await readdir(rollbacksDirectory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)));
const missingRollback = expectedMigrations.find((name) => !rollbackNames.has(name));
if (expectedMigrations.length === 0 || missingRollback) {
  process.stderr.write(`PostGIS 集成验证失败：迁移清单为空或缺少补偿脚本${missingRollback ? `（${missingRollback}）` : ""}。\n`);
  process.exit(1);
}

let sql;
try {
  // Refuse a reused or populated database before any schema mutation. The
  // PostGIS image may pre-create spatial_ref_sys, so that extension catalog is
  // the only tolerated public table.
  sql = postgres(testConnection, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl,
    onnotice: () => undefined,
  });
  const preexisting = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'
    ORDER BY tablename
  `;
  if (preexisting.length > 0) throw new Error("disposable test database is not pristine");
  await sql.end({ timeout: 5 });
  sql = null;

  runner("migrate-database.mjs", migrationEnvironment);
  sql = postgres(testConnection, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl,
    onnotice: () => undefined,
  });
  const [extension] = await sql`SELECT extname FROM pg_extension WHERE extname = 'postgis'`;
  if (!extension) throw new Error("postgis extension is unavailable after migration");
  const applied = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  if (applied.map((row) => row.filename).join(",") !== expectedMigrations.join(",")) {
    throw new Error("migration replay did not produce the complete applied set");
  }
  const requiredRelations = [
    "scenic_published_snapshots",
    "gis_draft_submissions",
    "closure_events",
    "route_operational_snapshot_releases",
    "route_operational_observations",
    "route_operational_snapshot_release_observations",
    "gis_formalization_releases",
  ];
  const relations = await sql`
    SELECT name, to_regclass('public.' || name) AS relation
    FROM unnest(${requiredRelations}::text[]) AS name
    ORDER BY name
  `;
  if (relations.some((row) => row.relation === null)) throw new Error("N6-N12 control-plane schema is incomplete after migration");
  await sql.end({ timeout: 5 });
  sql = null;

  // Compensation is exercised before any protected publication data exists.
  runner("rollback-database.mjs", {
    ...migrationEnvironment,
    ALLOW_DATABASE_ROLLBACK: "1",
  }, ["--to=0"]);
  sql = postgres(testConnection, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl,
    onnotice: () => undefined,
  });
  const replayBaseline = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  if (replayBaseline.length !== 0) throw new Error("compensation did not clear the migration ledger");
  const [removed] = await sql`
    SELECT to_regclass('public.gis_formalization_releases') AS formalization,
           to_regclass('public.scenic_published_snapshots') AS snapshots
  `;
  if (removed?.formalization !== null || removed?.snapshots !== null) throw new Error("compensation left control-plane relations behind");
  await sql.end({ timeout: 5 });
  sql = null;

  runner("migrate-database.mjs", migrationEnvironment);
  sql = postgres(testConnection, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl,
    onnotice: () => undefined,
  });
  const replayed = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
  if (replayed.map((row) => row.filename).join(",") !== expectedMigrations.join(",")) {
    throw new Error("rollback and replay did not restore the complete migration set");
  }
  await sql.end({ timeout: 5 });
  sql = null;

  runWorkflowProbe(workflowEnvironment);
  process.stdout.write(
    `PostGIS integration: ${expectedMigrations.length} migrations, full compensation replay, N6-N12 duty separation, N9 atomic fault recovery and N12 factor publication passed.\n`,
  );
} catch (error) {
  if (sql) await sql.end({ timeout: 5 });
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PostGIS 集成验证失败：${message}\n`);
  process.exitCode = 1;
}
