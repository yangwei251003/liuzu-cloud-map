/**
 * Provider-neutral authorization contract for production control-plane writes.
 *
 * This module deliberately does not parse bearer tokens or call an identity
 * provider. A trusted OIDC adapter must verify the token signature and its
 * standard claims before it constructs the narrow `VerifiedAdminOidcIdentity`
 * value consumed here. Keeping that boundary explicit prevents a route from
 * mistaking decoded, but unverified, JWT JSON for an authenticated identity.
 */

const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const OPAQUE_CLAIM_PATTERN = /^[^\u0000-\u001f\u007f\s]{1,255}$/;
const MFA_EVIDENCE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const ADMIN_ROLES = [
  "CONTENT_EDITOR",
  "CONTENT_REVIEWER",
  "GIS_EDITOR",
  "GIS_REVIEWER",
  "OPERATIONS_EDITOR",
  "OPERATIONS_REVIEWER",
  "OPERATIONS_EMERGENCY",
  "RELEASE_ADMIN",
  "AUDITOR",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const VERIFIED_ADMIN_OIDC_IDENTITY = "OIDC_SIGNATURE_AND_CLAIMS_VERIFIED" as const;

/**
 * This is intentionally a post-verification contract, not a decoded JWT.
 * `verification` means the adapter has validated signature, issuer discovery,
 * audience and expiry against its configured OIDC provider before invoking
 * the guard. The guard repeats issuer, audience and expiry checks against the
 * local production configuration as defence in depth.
 */
export type VerifiedAdminOidcIdentity = {
  verification: typeof VERIFIED_ADMIN_OIDC_IDENTITY;
  issuer: string;
  audience: readonly string[];
  subject: string;
  expiresAt: string;
  amr: readonly string[];
  acr: string | null;
};

export type AdminOidcConfigurationEnvironment = {
  ADMIN_OIDC_ISSUER?: string;
  ADMIN_OIDC_AUDIENCE?: string;
  ADMIN_OIDC_MFA_AMR_VALUES?: string;
  ADMIN_OIDC_MFA_ACR_VALUES?: string;
};

export type AdminOidcConfiguration =
  | {
      state: "ENABLED";
      issuer: string;
      audience: string;
      acceptedMfaAmrValues: readonly string[];
      acceptedMfaAcrValues: readonly string[];
    }
  | {
      state: "DISABLED";
      reason:
        | "OIDC_ISSUER_MISSING_OR_INVALID"
        | "OIDC_AUDIENCE_MISSING_OR_INVALID"
        | "OIDC_MFA_EVIDENCE_MISSING_OR_INVALID";
    };

export type AdminRoleBinding = {
  scenicAreaId: string;
  oidcSubject: string;
  role: AdminRole;
  mfaRequired: boolean;
  lifecycleState: "ACTIVE" | "REVOKED" | "EXPIRED";
  grantedAt: string;
  expiresAt: string | null;
};

export type AdminRoleBindingRepository = {
  listRoleBindings(input: { scenicAreaId: string; oidcSubject: string }): Promise<readonly AdminRoleBinding[]>;
};

export type AdminWriteAuthorizationInput = {
  scenicAreaId: unknown;
  requiredRoles: readonly AdminRole[];
  /** Must originate from a signature-validating OIDC adapter, never raw headers. */
  verifiedIdentity: unknown;
};

export type AdminWriteAuthorization =
  | {
      state: "AUTHORIZED";
      actor: {
        scenicAreaId: string;
        oidcSubject: string;
        role: AdminRole;
        authorizationExpiresAt: string | null;
      };
    }
  | {
      state: "DENIED";
      reason:
        | "AUTHORIZATION_UNAVAILABLE"
        | "ADMIN_AUTH_NOT_CONFIGURED"
        | "INVALID_ADMIN_WRITE_REQUEST"
        | "IDENTITY_NOT_VERIFIED"
        | "OIDC_CLAIMS_UNTRUSTED"
        | "MFA_REQUIRED"
        | "ACTIVE_ROLE_REQUIRED"
        | "ROLE_INSUFFICIENT";
    };

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);

function safeOpaqueClaim(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_CLAIM_PATTERN.test(value);
}

function parseConfiguredIssuer(value: unknown) {
  if (typeof value !== "string") return null;
  const issuer = value.trim();
  if (!issuer || issuer.length > 512) return null;
  try {
    const url = new URL(issuer);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.toString() !== issuer
    ) {
      return null;
    }
    return issuer;
  } catch {
    return null;
  }
}

function parseConfiguredAudience(value: unknown) {
  if (typeof value !== "string") return null;
  const audience = value.trim();
  return safeOpaqueClaim(audience) ? audience : null;
}

function parseMfaEvidenceList(value: unknown): readonly string[] | null {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string" || value.length > 2_048) return null;
  const entries = value.split(",").map((entry) => entry.trim());
  if (!entries.length || entries.some((entry) => !MFA_EVIDENCE_PATTERN.test(entry))) return null;
  if (new Set(entries).size !== entries.length) return null;
  return entries;
}

/**
 * Configuration has no permissive defaults. Production writes remain disabled
 * until an operator deliberately records an exact issuer, audience and at
 * least one provider-specific MFA evidence value (AMR or ACR).
 */
export function evaluateAdminOidcConfiguration(
  environment: AdminOidcConfigurationEnvironment,
): AdminOidcConfiguration {
  const issuer = parseConfiguredIssuer(environment.ADMIN_OIDC_ISSUER);
  if (!issuer) return { state: "DISABLED", reason: "OIDC_ISSUER_MISSING_OR_INVALID" };
  const audience = parseConfiguredAudience(environment.ADMIN_OIDC_AUDIENCE);
  if (!audience) return { state: "DISABLED", reason: "OIDC_AUDIENCE_MISSING_OR_INVALID" };
  const acceptedMfaAmrValues = parseMfaEvidenceList(environment.ADMIN_OIDC_MFA_AMR_VALUES);
  const acceptedMfaAcrValues = parseMfaEvidenceList(environment.ADMIN_OIDC_MFA_ACR_VALUES);
  if (
    !acceptedMfaAmrValues ||
    !acceptedMfaAcrValues ||
    acceptedMfaAmrValues.length + acceptedMfaAcrValues.length === 0
  ) {
    return { state: "DISABLED", reason: "OIDC_MFA_EVIDENCE_MISSING_OR_INVALID" };
  }
  return { state: "ENABLED", issuer, audience, acceptedMfaAmrValues, acceptedMfaAcrValues };
}

function parseVerifiedIdentity(value: unknown, now: Date): VerifiedAdminOidcIdentity | null {
  if (!isRecord(value) || value.verification !== VERIFIED_ADMIN_OIDC_IDENTITY) return null;
  if (!safeOpaqueClaim(value.issuer) || !safeOpaqueClaim(value.subject)) return null;
  if (!Array.isArray(value.audience) || value.audience.length < 1 || value.audience.length > 20) return null;
  if (!value.audience.every(safeOpaqueClaim)) return null;
  if (!Array.isArray(value.amr) || value.amr.length > 20 || !value.amr.every((entry) => typeof entry === "string" && MFA_EVIDENCE_PATTERN.test(entry))) {
    return null;
  }
  if (value.acr !== null && (typeof value.acr !== "string" || !MFA_EVIDENCE_PATTERN.test(value.acr))) return null;
  if (typeof value.expiresAt !== "string") return null;
  const expiresAt = new Date(value.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;
  return {
    verification: VERIFIED_ADMIN_OIDC_IDENTITY,
    issuer: value.issuer,
    audience: [...value.audience],
    subject: value.subject,
    expiresAt: expiresAt.toISOString(),
    amr: [...value.amr],
    acr: value.acr,
  };
}

function hasRequiredMfa(identity: VerifiedAdminOidcIdentity, configuration: Extract<AdminOidcConfiguration, { state: "ENABLED" }>) {
  return (
    identity.amr.some((method) => configuration.acceptedMfaAmrValues.includes(method)) ||
    (identity.acr !== null && configuration.acceptedMfaAcrValues.includes(identity.acr))
  );
}

function parsedRequest(input: AdminWriteAuthorizationInput) {
  const scenicAreaId = typeof input.scenicAreaId === "string" ? input.scenicAreaId : null;
  if (!scenicAreaId || !SCENIC_AREA_PATTERN.test(scenicAreaId)) return null;
  if (
    !Array.isArray(input.requiredRoles) ||
    input.requiredRoles.length < 1 ||
    input.requiredRoles.length > ADMIN_ROLES.length ||
    !input.requiredRoles.every(isAdminRole) ||
    new Set(input.requiredRoles).size !== input.requiredRoles.length
  ) {
    return null;
  }
  return { scenicAreaId, requiredRoles: [...input.requiredRoles] };
}

function bindingIsActiveFor(
  value: unknown,
  scenicAreaId: string,
  subject: string,
  now: Date,
): value is AdminRoleBinding {
  if (!isRecord(value)) return false;
  if (
    value.scenicAreaId !== scenicAreaId ||
    value.oidcSubject !== subject ||
    !isAdminRole(value.role) ||
    value.mfaRequired !== true ||
    value.lifecycleState !== "ACTIVE" ||
    typeof value.grantedAt !== "string"
  ) {
    return false;
  }
  const grantedAt = new Date(value.grantedAt);
  if (!Number.isFinite(grantedAt.getTime()) || grantedAt.getTime() > now.getTime()) return false;
  if (value.expiresAt === null) return true;
  if (typeof value.expiresAt !== "string") return false;
  const expiresAt = new Date(value.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

/**
 * Authorizes an already-verified OIDC identity for a write. The guard is
 * intentionally stricter than a demo: configuration, identity, MFA and an
 * active tenant-scoped database role must all succeed in the same decision.
 */
export async function authorizeAdminWrite(
  configuration: AdminOidcConfiguration,
  repository: AdminRoleBindingRepository,
  input: AdminWriteAuthorizationInput,
  now = new Date(),
): Promise<AdminWriteAuthorization> {
  if (Number.isNaN(now.getTime())) return { state: "DENIED", reason: "AUTHORIZATION_UNAVAILABLE" };
  if (configuration.state !== "ENABLED") return { state: "DENIED", reason: "ADMIN_AUTH_NOT_CONFIGURED" };
  const request = parsedRequest(input);
  if (!request) return { state: "DENIED", reason: "INVALID_ADMIN_WRITE_REQUEST" };
  const identity = parseVerifiedIdentity(input.verifiedIdentity, now);
  if (!identity) return { state: "DENIED", reason: "IDENTITY_NOT_VERIFIED" };
  if (identity.issuer !== configuration.issuer || !identity.audience.includes(configuration.audience)) {
    return { state: "DENIED", reason: "OIDC_CLAIMS_UNTRUSTED" };
  }
  if (!hasRequiredMfa(identity, configuration)) return { state: "DENIED", reason: "MFA_REQUIRED" };

  let bindings: readonly AdminRoleBinding[];
  try {
    bindings = await repository.listRoleBindings({
      scenicAreaId: request.scenicAreaId,
      oidcSubject: identity.subject,
    });
  } catch {
    return { state: "DENIED", reason: "ACTIVE_ROLE_REQUIRED" };
  }
  const activeBindings = bindings.filter((binding) => bindingIsActiveFor(binding, request.scenicAreaId, identity.subject, now));
  if (!activeBindings.length) return { state: "DENIED", reason: "ACTIVE_ROLE_REQUIRED" };
  const selected = request.requiredRoles
    .map((role) => activeBindings.find((binding) => binding.role === role))
    .find((binding): binding is AdminRoleBinding => Boolean(binding));
  if (!selected) return { state: "DENIED", reason: "ROLE_INSUFFICIENT" };
  return {
    state: "AUTHORIZED",
    actor: {
      scenicAreaId: request.scenicAreaId,
      oidcSubject: identity.subject,
      role: selected.role,
      authorizationExpiresAt: selected.expiresAt,
    },
  };
}
