import "server-only";

import { getDatabase } from "./database";
import {
  authorizeAdminWrite,
  evaluateAdminOidcConfiguration,
  type AdminOidcConfiguration,
  type AdminRoleBinding,
  type AdminRoleBindingRepository,
  type AdminWriteAuthorizationInput,
} from "./admin-oidc-rbac-domain";

type AdminRoleBindingRow = {
  scenic_area_id: string;
  oidc_subject: string;
  role: string;
  mfa_required: boolean;
  lifecycle_state: string;
  granted_at: Date | string;
  expires_at: Date | string | null;
};

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_admin_role_binding_timestamp");
  return date.toISOString();
}

function mapRoleBinding(row: AdminRoleBindingRow): AdminRoleBinding {
  return {
    scenicAreaId: row.scenic_area_id,
    oidcSubject: row.oidc_subject,
    // The domain validates the database role against the closed allow-list
    // before authorizing it; keep this mapping deliberately data-preserving.
    role: row.role as AdminRoleBinding["role"],
    mfaRequired: row.mfa_required,
    lifecycleState: row.lifecycle_state as AdminRoleBinding["lifecycleState"],
    grantedAt: toIso(row.granted_at),
    expiresAt: row.expires_at === null ? null : toIso(row.expires_at),
  };
}

/**
 * Reads tenant-scoped role grants from the P0 control-plane schema. It does
 * not create users, emulate an identity provider or trust client-selected
 * roles. The domain repeats all active-window checks after this query.
 */
export const postgresAdminRoleBindingRepository: AdminRoleBindingRepository = {
  async listRoleBindings({ scenicAreaId, oidcSubject }) {
    const sql = getDatabase();
    const rows = await sql<AdminRoleBindingRow[]>`
      SELECT scenic_area_id, oidc_subject, role, mfa_required, lifecycle_state, granted_at, expires_at
      FROM admin_role_bindings
      WHERE scenic_area_id = ${scenicAreaId}
        AND oidc_subject = ${oidcSubject}
        AND lifecycle_state = 'ACTIVE'
        AND granted_at <= CURRENT_TIMESTAMP
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY granted_at ASC, id ASC
    `;
    return rows.map(mapRoleBinding);
  },
};

/**
 * Reads only names of required environment variables. There are no fallback
 * issuer, audience or MFA values, so an unconfigured production runtime has
 * no path to an admin write.
 */
export function evaluateProductionAdminOidcConfiguration(): AdminOidcConfiguration {
  return evaluateAdminOidcConfiguration({
    ADMIN_OIDC_ISSUER: process.env.ADMIN_OIDC_ISSUER,
    ADMIN_OIDC_AUDIENCE: process.env.ADMIN_OIDC_AUDIENCE,
    ADMIN_OIDC_MFA_AMR_VALUES: process.env.ADMIN_OIDC_MFA_AMR_VALUES,
    ADMIN_OIDC_MFA_ACR_VALUES: process.env.ADMIN_OIDC_MFA_ACR_VALUES,
  });
}

/**
 * Server-only integration point for future admin API routes. The caller must
 * pass claims produced by its signature-validating OIDC adapter; this helper
 * never reads a bearer token, authorization header or client-chosen role.
 */
export async function authorizeProductionAdminWrite(
  input: AdminWriteAuthorizationInput,
  now = new Date(),
) {
  return authorizeAdminWrite(
    evaluateProductionAdminOidcConfiguration(),
    postgresAdminRoleBindingRepository,
    input,
    now,
  );
}
