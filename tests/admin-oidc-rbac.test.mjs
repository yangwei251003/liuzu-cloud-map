import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADMIN_ROLES,
  VERIFIED_ADMIN_OIDC_IDENTITY,
  authorizeAdminWrite,
  evaluateAdminOidcConfiguration,
} from "../src/lib/server/admin-oidc-rbac-domain.ts";

const now = new Date("2026-08-15T08:00:00.000Z");
const environment = {
  ADMIN_OIDC_ISSUER: "https://identity.example.test/tenant",
  ADMIN_OIDC_AUDIENCE: "liuzu-admin-control-plane",
  ADMIN_OIDC_MFA_AMR_VALUES: "webauthn,otp",
  ADMIN_OIDC_MFA_ACR_VALUES: "urn:example:aal2",
};

function configuration() {
  const result = evaluateAdminOidcConfiguration(environment);
  assert.equal(result.state, "ENABLED");
  return result;
}

function identity(overrides = {}) {
  return {
    verification: VERIFIED_ADMIN_OIDC_IDENTITY,
    issuer: environment.ADMIN_OIDC_ISSUER,
    audience: [environment.ADMIN_OIDC_AUDIENCE, "unrelated-client"],
    subject: "oidc|admin-operator-42",
    expiresAt: "2026-08-15T09:00:00.000Z",
    amr: ["webauthn"],
    acr: null,
    ...overrides,
  };
}

function binding(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    oidcSubject: "oidc|admin-operator-42",
    role: "RELEASE_ADMIN",
    mfaRequired: true,
    lifecycleState: "ACTIVE",
    grantedAt: "2026-08-15T07:00:00.000Z",
    expiresAt: "2026-08-16T07:00:00.000Z",
    ...overrides,
  };
}

function repository(records = [binding()]) {
  const calls = [];
  return {
    calls,
    async listRoleBindings(input) {
      calls.push(structuredClone(input));
      return structuredClone(records);
    },
  };
}

function request(overrides = {}) {
  return {
    scenicAreaId: "fictional-park",
    requiredRoles: ["RELEASE_ADMIN"],
    verifiedIdentity: identity(),
    ...overrides,
  };
}

test("production admin writes have no permissive OIDC, audience, or MFA configuration defaults", () => {
  assert.deepEqual(evaluateAdminOidcConfiguration({}), {
    state: "DISABLED",
    reason: "OIDC_ISSUER_MISSING_OR_INVALID",
  });
  assert.deepEqual(evaluateAdminOidcConfiguration({ ...environment, ADMIN_OIDC_AUDIENCE: "" }), {
    state: "DISABLED",
    reason: "OIDC_AUDIENCE_MISSING_OR_INVALID",
  });
  assert.deepEqual(evaluateAdminOidcConfiguration({ ...environment, ADMIN_OIDC_MFA_AMR_VALUES: "", ADMIN_OIDC_MFA_ACR_VALUES: "" }), {
    state: "DISABLED",
    reason: "OIDC_MFA_EVIDENCE_MISSING_OR_INVALID",
  });
  assert.deepEqual(evaluateAdminOidcConfiguration({ ...environment, ADMIN_OIDC_ISSUER: "http://identity.example.test/tenant" }), {
    state: "DISABLED",
    reason: "OIDC_ISSUER_MISSING_OR_INVALID",
  });
});

test("only signature-verified trusted claims with configured AMR or ACR MFA and an active role authorize a write", async () => {
  const repo = repository();
  const result = await authorizeAdminWrite(configuration(), repo, request(), now);
  assert.deepEqual(result, {
    state: "AUTHORIZED",
    actor: {
      scenicAreaId: "fictional-park",
      oidcSubject: "oidc|admin-operator-42",
      role: "RELEASE_ADMIN",
      authorizationExpiresAt: "2026-08-16T07:00:00.000Z",
    },
  });
  assert.deepEqual(repo.calls, [{ scenicAreaId: "fictional-park", oidcSubject: "oidc|admin-operator-42" }]);

  const acrOnly = await authorizeAdminWrite(
    configuration(),
    repository(),
    request({ verifiedIdentity: identity({ amr: [], acr: "urn:example:aal2" }) }),
    now,
  );
  assert.equal(acrOnly.state, "AUTHORIZED");
});

test("unverified, expired, mismatched or non-MFA identities are denied before any database role lookup", async () => {
  const cases = [
    ["unverified", identity({ verification: "DECODED_ONLY" }), "IDENTITY_NOT_VERIFIED"],
    ["expired", identity({ expiresAt: "2026-08-15T07:59:59.000Z" }), "IDENTITY_NOT_VERIFIED"],
    ["wrong issuer", identity({ issuer: "https://attacker.example.test" }), "OIDC_CLAIMS_UNTRUSTED"],
    ["wrong audience", identity({ audience: ["other-client"] }), "OIDC_CLAIMS_UNTRUSTED"],
    ["missing MFA", identity({ amr: ["pwd"], acr: null }), "MFA_REQUIRED"],
  ];
  for (const [, verifiedIdentity, reason] of cases) {
    const repo = repository();
    const result = await authorizeAdminWrite(configuration(), repo, request({ verifiedIdentity }), now);
    assert.deepEqual(result, { state: "DENIED", reason });
    assert.equal(repo.calls.length, 0);
  }
});

test("the database role must be tenant-scoped, active, MFA-required, current and sufficient", async () => {
  const rejectedBindings = [
    binding({ lifecycleState: "REVOKED" }),
    binding({ mfaRequired: false }),
    binding({ expiresAt: "2026-08-15T07:59:59.000Z" }),
    binding({ grantedAt: "2026-08-15T08:00:01.000Z" }),
    binding({ oidcSubject: "oidc|someone-else" }),
  ];
  for (const record of rejectedBindings) {
    const result = await authorizeAdminWrite(configuration(), repository([record]), request(), now);
    assert.deepEqual(result, { state: "DENIED", reason: "ACTIVE_ROLE_REQUIRED" });
  }
  const insufficient = await authorizeAdminWrite(
    configuration(),
    repository([binding({ role: "CONTENT_EDITOR" })]),
    request(),
    now,
  );
  assert.deepEqual(insufficient, { state: "DENIED", reason: "ROLE_INSUFFICIENT" });
});

test("invalid requests and repository failures remain closed, and every declared role is an explicit allow-list member", async () => {
  const unavailable = await authorizeAdminWrite(
    configuration(),
    { async listRoleBindings() { throw new Error("database unavailable"); } },
    request(),
    now,
  );
  assert.deepEqual(unavailable, { state: "DENIED", reason: "ACTIVE_ROLE_REQUIRED" });
  const malformed = await authorizeAdminWrite(
    configuration(),
    repository(),
    request({ scenicAreaId: "fictional park", requiredRoles: ["OWNER"] }),
    now,
  );
  assert.deepEqual(malformed, { state: "DENIED", reason: "INVALID_ADMIN_WRITE_REQUEST" });
  assert.deepEqual(ADMIN_ROLES, [
    "CONTENT_EDITOR",
    "CONTENT_REVIEWER",
    "GIS_EDITOR",
    "GIS_REVIEWER",
    "OPERATIONS_EDITOR",
    "OPERATIONS_REVIEWER",
    "OPERATIONS_EMERGENCY",
    "RELEASE_ADMIN",
    "AUDITOR",
  ]);
});

test("server adapter is marked server-only, reads active tenant roles, and never treats a bearer header as an identity", async () => {
  const source = await readFile(new URL("../src/lib/server/admin-oidc-rbac.server.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.match(source, /FROM admin_role_bindings/);
  assert.match(source, /scenic_area_id = \$\{scenicAreaId\}/);
  assert.match(source, /oidc_subject = \$\{oidcSubject\}/);
  assert.match(source, /lifecycle_state = 'ACTIVE'/);
  assert.doesNotMatch(source, /headers\.get\(["']authorization/i);
  assert.doesNotMatch(source, /localStorage|role\s*[:=]\s*request/i);
});
