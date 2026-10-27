import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const connectionString = process.env.DATABASE_MIGRATION_URL?.trim();
const approved = process.env.ALLOW_DATABASE_ROLLBACK === "1";
const targetValue = process.argv.find((argument) => argument.startsWith("--to="))?.slice("--to=".length);
const target = Number(targetValue);

if (!connectionString || !approved || !Number.isSafeInteger(target) || target < 0) {
  process.stderr.write("回滚未执行：需要 DATABASE_MIGRATION_URL、ALLOW_DATABASE_ROLLBACK=1 和 --to=<非负迁移号>。\n");
  process.exit(2);
}

const sslMode = process.env.DATABASE_SSL_MODE?.trim() || "verify-full";
if (sslMode !== "verify-full" && sslMode !== "disable") {
  process.stderr.write("DATABASE_SSL_MODE 仅允许 verify-full 或 disable。\n");
  process.exit(2);
}

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  ssl: sslMode === "disable" ? false : "verify-full",
  onnotice: () => undefined,
});

const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const rollbacksDirectory = path.join(process.cwd(), "database", "rollbacks");
const numberOf = (filename) => Number(/^([0-9]+)_/.exec(filename)?.[1]);

try {
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort();
  const applied = await sql`SELECT filename FROM schema_migrations ORDER BY filename DESC`;
  const selected = applied
    .map((row) => String(row.filename))
    .filter((filename) => migrations.includes(filename) && numberOf(filename) > target)
    .sort()
    .reverse();

  if (selected.length === 0) {
    process.stdout.write("没有需要回滚的已应用迁移。\n");
  }

  for (const filename of selected) {
    const rollbackPath = path.join(rollbacksDirectory, filename);
    const source = await readFile(rollbackPath, "utf8");
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext('liuzu-cloud-tour:migrations'))`;
      const current = await transaction`SELECT filename FROM schema_migrations WHERE filename = ${filename} FOR UPDATE`;
      if (!current[0]) return;
      await transaction.unsafe(source);
      await transaction`DELETE FROM schema_migrations WHERE filename = ${filename}`;
      process.stdout.write(`已回滚迁移：${filename}\n`);
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`数据库回滚失败：${message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
