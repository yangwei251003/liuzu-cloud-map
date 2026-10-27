import "server-only";

import { evaluateVisitorAuthCapability } from "./visitor-identity-capability";
import { visitorIdentityFromRequest } from "./visitor-identity-http";
import { postgresVisitorIdentityRepository } from "./visitor-identity-repository";
import type { ItineraryHttpDependencies } from "./itinerary-revision-http";
import { postgresItineraryRevisionRepository } from "./itinerary-revision-repository";

/**
 * Persisted itineraries deliberately share the existing visitor-account
 * capability gate.  There is no browser-memory or candidate-map fallback:
 * without a configured database and authenticated visitor identity, every
 * write remains unavailable.
 */
export const productionItineraryRevisionDependencies: ItineraryHttpDependencies = {
  repository: postgresItineraryRevisionRepository,
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
