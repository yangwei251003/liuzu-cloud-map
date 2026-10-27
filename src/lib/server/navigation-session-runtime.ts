import "server-only";

import { createFormalRoutePlan } from "./formal-routing-service";
import { postgresFormalRoutingRepository } from "./formal-routing-repository";
import type { NavigationSessionHttpDependencies } from "./navigation-session-http";
import { postgresNavigationSessionRepository } from "./navigation-session-repository";
import { evaluateVisitorAuthCapability } from "./visitor-identity-capability";
import { visitorIdentityFromRequest } from "./visitor-identity-http";
import { postgresVisitorIdentityRepository } from "./visitor-identity-repository";

export const productionNavigationSessionDependencies: NavigationSessionHttpDependencies = {
  repository: postgresNavigationSessionRepository,
  isAvailable() {
    return evaluateVisitorAuthCapability().state === "ENABLED" && process.env.NAVIGATION_HISTORY_ENABLED === "1";
  },
  async authenticate(request) {
    if (evaluateVisitorAuthCapability().state !== "ENABLED") return { state: "AUTH_UNAVAILABLE" };
    try {
      const identity = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
      return identity ? { state: "AUTHENTICATED", identity } : { state: "AUTH_REQUIRED" };
    } catch { return { state: "AUTH_UNAVAILABLE" }; }
  },
  resolvePlan(binding, now) {
    return createFormalRoutePlan(postgresFormalRoutingRepository, binding, now);
  },
};
