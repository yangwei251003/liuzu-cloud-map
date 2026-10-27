import "server-only";

import { evaluateVisitorAuthCapability } from "./visitor-identity-capability";
import { visitorIdentityFromRequest } from "./visitor-identity-http";
import { postgresVisitorIdentityRepository } from "./visitor-identity-repository";
import type { VisitSessionHttpDependencies } from "./visit-session-http";
import { postgresVisitSessionRepository } from "./visit-session-repository";

/**
 * Server persistence is deliberately unavailable unless the existing visitor
 * identity capability has a configured database, explicit feature flag, and
 * persistent rate-limit secret. The API never falls back to local memory.
 */
export const productionVisitSessionDependencies: VisitSessionHttpDependencies = {
  repository: postgresVisitSessionRepository,
  isAvailable() {
    return evaluateVisitorAuthCapability().state === "ENABLED";
  },
  async authenticate(request) {
    if (evaluateVisitorAuthCapability().state !== "ENABLED") return { state: "AUTH_UNAVAILABLE" };
    try {
      const identity = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
      return identity ? { state: "AUTHENTICATED", identity } : { state: "AUTH_REQUIRED" };
    } catch {
      return { state: "AUTH_UNAVAILABLE" };
    }
  },
};
