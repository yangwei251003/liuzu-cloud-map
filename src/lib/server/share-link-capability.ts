export type ServerShareCapability =
  | { state: "DISABLED"; reason: "DATABASE_NOT_CONFIGURED" | "FEATURE_NOT_ENABLED" }
  | { state: "AUTH_REQUIRED" };

type CapabilityEnvironment = {
  DATABASE_URL?: string;
  SERVER_SHARE_ENABLED?: string;
};

export function evaluateServerShareCapability(
  environment: CapabilityEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    SERVER_SHARE_ENABLED: process.env.SERVER_SHARE_ENABLED,
  },
): ServerShareCapability {
  if (!environment.DATABASE_URL?.trim()) return { state: "DISABLED", reason: "DATABASE_NOT_CONFIGURED" };
  if (environment.SERVER_SHARE_ENABLED !== "1") return { state: "DISABLED", reason: "FEATURE_NOT_ENABLED" };
  return { state: "AUTH_REQUIRED" };
}
