import "server-only";

import postgres, { type Sql } from "postgres";

export class DatabaseCapabilityDisabledError extends Error {
  readonly code = "DATABASE_CAPABILITY_DISABLED";

  constructor() {
    super("服务端数据库尚未配置；跨设备持久化能力保持关闭。");
    this.name = "DatabaseCapabilityDisabledError";
  }
}

let client: Sql | null = null;

export function resolveDatabaseSsl(mode = process.env.DATABASE_SSL_MODE) {
  const normalized = mode?.trim() || "verify-full";
  if (normalized === "disable") return false as const;
  if (normalized === "verify-full") return "verify-full" as const;
  throw new Error("DATABASE_SSL_MODE 仅允许 verify-full 或 disable；不接受跳过证书校验的 require 模式。");
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabase(): Sql {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new DatabaseCapabilityDisabledError();

  client = postgres(connectionString, {
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    ssl: resolveDatabaseSsl(),
    onnotice: () => undefined,
  });
  return client;
}

export async function closeDatabase() {
  const active = client;
  client = null;
  if (active) await active.end({ timeout: 5 });
}
