import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_SALT_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const PASSWORD_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_MAX_UTF8_BYTES = 512;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;
export const VISITOR_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

type UnknownRecord = Record<string, unknown>;

export type VisitorCredentials = {
  scenicAreaId: string;
  handle: string;
  passphrase: string;
};

export type VisitorIdentity = {
  accountId: string;
  scenicAreaId: string;
  subject: string;
  handle: string;
};

export type VisitorPasswordSecret = {
  passwordVersion: 1;
  passwordSalt: string;
  passwordHash: string;
};

export type VisitorSessionMaterial = {
  sessionId: string;
  sessionToken: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

export function normalizeVisitorHandle(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return HANDLE_PATTERN.test(normalized) ? normalized : null;
}

export function isVisitorPassphrase(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_UTF8_BYTES
  );
}

export function parseVisitorCredentials(value: unknown): VisitorCredentials | null {
  if (!isRecord(value) || !exactKeys(value, ["handle", "passphrase", "scenicAreaId"])) return null;
  const scenicAreaId = typeof value.scenicAreaId === "string" ? value.scenicAreaId.trim() : "";
  const handle = normalizeVisitorHandle(value.handle);
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId) || !handle || !isVisitorPassphrase(value.passphrase)) return null;
  return { scenicAreaId, handle, passphrase: value.passphrase };
}

function deriveScrypt(passphrase: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(passphrase, salt, DERIVED_KEY_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashVisitorPassphrase(
  passphrase: string,
  random: (size: number) => Buffer = randomBytes,
): Promise<VisitorPasswordSecret> {
  if (!isVisitorPassphrase(passphrase)) throw new Error("invalid_visitor_passphrase");
  const passwordSalt = random(SALT_BYTES).toString("base64url");
  if (!PASSWORD_SALT_PATTERN.test(passwordSalt)) throw new Error("invalid_password_salt_material");
  const passwordHash = (await deriveScrypt(passphrase, passwordSalt)).toString("base64url");
  if (!PASSWORD_HASH_PATTERN.test(passwordHash)) throw new Error("invalid_password_hash_material");
  return { passwordVersion: 1, passwordSalt, passwordHash };
}

export async function verifyVisitorPassphrase(
  passphrase: string,
  secret: VisitorPasswordSecret,
) {
  if (
    !isVisitorPassphrase(passphrase) ||
    secret.passwordVersion !== 1 ||
    !PASSWORD_SALT_PATTERN.test(secret.passwordSalt) ||
    !PASSWORD_HASH_PATTERN.test(secret.passwordHash)
  ) {
    return false;
  }
  const actual = await deriveScrypt(passphrase, secret.passwordSalt);
  const expected = Buffer.from(secret.passwordHash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createVisitorAccountIdentity(
  scenicAreaId: string,
  handle: string,
  uuid: () => string = randomUUID,
): VisitorIdentity {
  const accountId = uuid();
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId) || !HANDLE_PATTERN.test(handle) || !UUID_PATTERN.test(accountId)) {
    throw new Error("invalid_visitor_account_material");
  }
  return {
    accountId,
    scenicAreaId,
    subject: `visitor:${scenicAreaId}:${accountId}`,
    handle,
  };
}

export function hashVisitorSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isVisitorSessionToken(value: unknown): value is string {
  return typeof value === "string" && SESSION_TOKEN_PATTERN.test(value);
}

export function createVisitorSessionMaterial(
  now = new Date(),
  random: (size: number) => Buffer = randomBytes,
  uuid: () => string = randomUUID,
): VisitorSessionMaterial {
  const sessionId = uuid();
  const sessionToken = random(SESSION_TOKEN_BYTES).toString("base64url");
  if (Number.isNaN(now.getTime()) || !UUID_PATTERN.test(sessionId) || !isVisitorSessionToken(sessionToken)) {
    throw new Error("invalid_visitor_session_material");
  }
  const createdAt = now.toISOString();
  return {
    sessionId,
    sessionToken,
    tokenHash: hashVisitorSessionToken(sessionToken),
    createdAt,
    expiresAt: new Date(now.getTime() + VISITOR_SESSION_LIFETIME_MS).toISOString(),
  };
}

export function createAuthThrottleDimension(
  pepper: string,
  scenicAreaId: string,
  operation: "LOGIN" | "REGISTER",
  kind: "HANDLE" | "NETWORK",
  value: string,
) {
  if (Buffer.byteLength(pepper, "utf8") < 32) throw new Error("visitor_auth_pepper_too_short");
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId) || !value || value.length > 512) throw new Error("invalid_auth_throttle_dimension");
  return createHmac("sha256", pepper)
    .update(`${scenicAreaId}\u0000${operation}\u0000${kind}\u0000${value}`, "utf8")
    .digest("hex");
}
