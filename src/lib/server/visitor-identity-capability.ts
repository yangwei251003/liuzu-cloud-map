export type VisitorAuthCapability =
  | {
      state: "DISABLED";
      reason: "DATABASE_NOT_CONFIGURED" | "FEATURE_NOT_ENABLED" | "SECURITY_CONFIGURATION_MISSING";
    }
  | { state: "ENABLED" };

type CapabilityEnvironment = {
  DATABASE_URL?: string;
  VISITOR_AUTH_ENABLED?: string;
  VISITOR_AUTH_RATE_LIMIT_PEPPER?: string;
};

export function evaluateVisitorAuthCapability(
  environment: CapabilityEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    VISITOR_AUTH_ENABLED: process.env.VISITOR_AUTH_ENABLED,
    VISITOR_AUTH_RATE_LIMIT_PEPPER: process.env.VISITOR_AUTH_RATE_LIMIT_PEPPER,
  },
): VisitorAuthCapability {
  if (!environment.DATABASE_URL?.trim()) return { state: "DISABLED", reason: "DATABASE_NOT_CONFIGURED" };
  if (environment.VISITOR_AUTH_ENABLED !== "1") return { state: "DISABLED", reason: "FEATURE_NOT_ENABLED" };
  if (Buffer.byteLength(environment.VISITOR_AUTH_RATE_LIMIT_PEPPER ?? "", "utf8") < 32) {
    return { state: "DISABLED", reason: "SECURITY_CONFIGURATION_MISSING" };
  }
  return { state: "ENABLED" };
}

export function getVisitorAuthRateLimitPepper() {
  const capability = evaluateVisitorAuthCapability();
  if (capability.state !== "ENABLED") throw new Error("visitor_auth_capability_disabled");
  return process.env.VISITOR_AUTH_RATE_LIMIT_PEPPER as string;
}
