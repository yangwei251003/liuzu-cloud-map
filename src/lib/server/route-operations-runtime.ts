import "server-only";

import { resolveVerifiedAdminIdentityAssertion } from "./admin-identity-assertion.server";
import { authorizeProductionAdminWrite } from "./admin-oidc-rbac.server";
import { isDatabaseConfigured } from "./database";
import type { RouteOperationsHttpDependencies } from "./route-operations-http";
import { postgresRouteOperationsRepository } from "./route-operations-repository";

export const productionRouteOperationsDependencies: RouteOperationsHttpDependencies = {
  repository: postgresRouteOperationsRepository,
  async authorize(request, scenicAreaId, roles) {
    if (process.env.ROUTE_OPERATIONS_ENABLED !== "1" || !isDatabaseConfigured()) return { state: "UNAVAILABLE" };
    const assertion = resolveVerifiedAdminIdentityAssertion(request);
    if (assertion.state === "NOT_CONFIGURED") return { state: "UNAVAILABLE" };
    if (assertion.state !== "VERIFIED") return { state: "DENIED" };
    const authorization = await authorizeProductionAdminWrite({
      scenicAreaId,
      requiredRoles: roles,
      verifiedIdentity: assertion.identity,
    });
    if (authorization.state !== "AUTHORIZED") {
      return authorization.reason === "ADMIN_AUTH_NOT_CONFIGURED" || authorization.reason === "AUTHORIZATION_UNAVAILABLE"
        ? { state: "UNAVAILABLE" }
        : { state: "DENIED" };
    }
    if (authorization.actor.role !== "OPERATIONS_EMERGENCY" && authorization.actor.role !== "RELEASE_ADMIN") return { state: "DENIED" };
    return {
      state: "AUTHORIZED",
      actor: {
        scenicAreaId: authorization.actor.scenicAreaId,
        oidcSubject: authorization.actor.oidcSubject,
        role: authorization.actor.role,
      },
    };
  },
};
