import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const connectionString = process.env.DATABASE_MIGRATION_URL?.trim();
if (!connectionString) {
  process.stderr.write("DATABASE_MIGRATION_URL 未配置，数据库迁移未执行；迁移账号必须与运行账号分离。\n");
  process.exit(2);
}

const sslMode = process.env.DATABASE_SSL_MODE?.trim() || "verify-full";
if (sslMode !== "verify-full" && sslMode !== "disable") {
  process.stderr.write("DATABASE_SSL_MODE 仅允许 verify-full 或 disable；不接受跳过证书校验的 require 模式。\n");
  process.exit(2);
}
const ssl = sslMode === "disable" ? false : "verify-full";
const sql = postgres(connectionString, { max: 1, connect_timeout: 10, idle_timeout: 10, ssl, onnotice: () => undefined });
const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const rollbacksDirectory = path.join(process.cwd(), "database", "rollbacks");

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const filenames = (await readdir(migrationsDirectory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
  if (filenames.length === 0) throw new Error("没有找到数据库迁移文件。");
  const rollbackNames = new Set((await readdir(rollbacksDirectory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)));
  const missingRollback = filenames.find((filename) => !rollbackNames.has(filename));
  if (missingRollback) throw new Error(`迁移缺少同名补偿脚本：${missingRollback}`);

  for (const filename of filenames) {
    const source = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(source, "utf8").digest("hex");
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext('liuzu-cloud-tour:migrations'))`;
      const applied = await transaction`SELECT checksum FROM schema_migrations WHERE filename = ${filename}`;
      if (applied.length > 0) {
        if (applied[0].checksum !== checksum) throw new Error(`历史迁移文件已变化：${filename}`);
        return;
      }
      await transaction.unsafe(source);
      await transaction`INSERT INTO schema_migrations (filename, checksum) VALUES (${filename}, ${checksum})`;
      process.stdout.write(`已应用迁移：${filename}\n`);
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`数据库迁移失败：${message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
