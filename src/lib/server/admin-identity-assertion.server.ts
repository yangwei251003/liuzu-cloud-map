import { createHmac, timingSafeEqual } from "node:crypto";

import {
  VERIFIED_ADMIN_OIDC_IDENTITY,
  type VerifiedAdminOidcIdentity,
} from "./admin-oidc-rbac-domain";

const ASSERTION_HEADER = "x-liuzu-admin-identity";
const SIGNATURE_HEADER = "x-liuzu-admin-signature";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{40,6000}$/;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_ASSERTION_AGE_MS = 60_000;
const FUTURE_SKEW_MS = 5_000;

type UnknownRecord = Record<string, unknown>;

export type AdminIdentityAssertionResult =
  | { state: "VERIFIED"; identity: VerifiedAdminOidcIdentity }
  | { state: "NOT_CONFIGURED" | "REJECTED" };

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseIdentity(value: unknown): VerifiedAdminOidcIdentity | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["verification", "issuer", "audience", "subject", "expiresAt", "amr", "acr"])
    || value.verification !== VERIFIED_ADMIN_OIDC_IDENTITY
    || typeof value.issuer !== "string"
    || typeof value.subject !== "string"
    || typeof value.expiresAt !== "string"
    || !Array.isArray(value.audience)
    || !Array.isArray(value.amr)
    || !(value.acr === null || typeof value.acr === "string")
  ) return null;
  return {
    verification: VERIFIED_ADMIN_OIDC_IDENTITY,
    issuer: value.issuer,
    audience: value.audience as string[],
    subject: value.subject,
    expiresAt: value.expiresAt,
    amr: value.amr as string[],
    acr: value.acr,
  };
}

function configuredSecret(environment: NodeJS.ProcessEnv) {
  const secret = environment.ADMIN_IDENTITY_ASSERTION_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32 && Buffer.byteLength(secret, "utf8") <= 1024
    ? secret
    : null;
}

/**
 * Accepts only a short-lived HMAC assertion injected by the trusted OIDC edge.
 * Browser-provided bearer JSON and unsigned proxy headers are never identities.
 */
export function resolveVerifiedAdminIdentityAssertion(
  request: Request,
  options: { environment?: NodeJS.ProcessEnv; now?: Date } = {},
): AdminIdentityAssertionResult {
  const environment = options.environment ?? process.env;
  const now = options.now ?? new Date();
  const secret = configuredSecret(environment);
  if (!secret) return { state: "NOT_CONFIGURED" };
  if (Number.isNaN(now.getTime())) return { state: "REJECTED" };
  const encoded = request.headers.get(ASSERTION_HEADER);
  const signature = request.headers.get(SIGNATURE_HEADER)?.toLowerCase();
  if (!encoded || !BASE64URL_PATTERN.test(encoded) || !signature || !HEX_SHA256_PATTERN.test(signature)) return { state: "REJECTED" };
  const expected = createHmac("sha256", secret).update(encoded, "utf8").digest();
  const supplied = Buffer.from(signature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { state: "REJECTED" };
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  } catch {
    return { state: "REJECTED" };
  }
  if (
    !isRecord(payload)
    || !exactKeys(payload, ["schemaVersion", "issuedAt", "method", "path", "identity"])
    || payload.schemaVersion !== 1
    || typeof payload.issuedAt !== "string"
    || payload.method !== request.method
    || typeof payload.path !== "string"
  ) return { state: "REJECTED" };
  let requestPath: string;
  try {
    requestPath = new URL(request.url).pathname;
  } catch {
    return { state: "REJECTED" };
  }
  if (payload.path !== requestPath) return { state: "REJECTED" };
  const issuedAt = new Date(payload.issuedAt);
  const age = now.getTime() - issuedAt.getTime();
  if (!Number.isFinite(issuedAt.getTime()) || age < -FUTURE_SKEW_MS || age > MAX_ASSERTION_AGE_MS) return { state: "REJECTED" };
  const identity = parseIdentity(payload.identity);
  return identity ? { state: "VERIFIED", identity } : { state: "REJECTED" };
}
