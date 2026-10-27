import {
  createAuthThrottleDimension,
  createVisitorAccountIdentity,
  createVisitorSessionMaterial,
  hashVisitorPassphrase,
  hashVisitorSessionToken,
  isVisitorSessionToken,
  parseVisitorCredentials,
  verifyVisitorPassphrase,
  type VisitorCredentials,
  type VisitorIdentity,
  type VisitorPasswordSecret,
  type VisitorSessionMaterial,
} from "./visitor-identity-domain";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const FAILURE_THRESHOLD = 5;

const DUMMY_PASSWORD_SECRET: VisitorPasswordSecret = {
  passwordVersion: 1,
  passwordSalt: "AAAAAAAAAAAAAAAAAAAAAA",
  passwordHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

export type VisitorAccountRecord = VisitorIdentity &
  VisitorPasswordSecret & {
    lockedUntil: string | null;
    createdAt: string;
  };

export type VisitorAccountSessionWrite = {
  identity: VisitorIdentity;
  password: VisitorPasswordSecret;
  session: Omit<VisitorSessionMaterial, "sessionToken">;
  throttleDimensionHashes: string[];
};

export type VisitorLoginSessionWrite = {
  identity: VisitorIdentity;
  session: Omit<VisitorSessionMaterial, "sessionToken">;
  throttleDimensionHashes: string[];
};

export type VisitorAuthOperation = "LOGIN" | "REGISTER";

export type VisitorIdentityRepository = {
  createAccountWithSession(input: VisitorAccountSessionWrite): Promise<"CREATED" | "CONFLICT">;
  findAccountByHandle(scenicAreaId: string, handle: string): Promise<VisitorAccountRecord | null>;
  readThrottle(input: {
    scenicAreaId: string;
    operation: VisitorAuthOperation;
    dimensionHashes: string[];
    now: string;
  }): Promise<{ lockedUntil: string | null }>;
  recordAuthFailure(input: {
    scenicAreaId: string;
    operation: VisitorAuthOperation;
    dimensionHashes: string[];
    accountId: string | null;
    actorSubject: string | null;
    occurredAt: string;
    windowMs: number;
    threshold: number;
    lockMs: number;
  }): Promise<{ lockedUntil: string | null }>;
  createSessionAfterLogin(input: VisitorLoginSessionWrite): Promise<void>;
  findIdentityBySessionTokenHash(tokenHash: string, now: string): Promise<VisitorIdentity | null>;
  revokeSessionByTokenHash(tokenHash: string, revokedAt: string): Promise<"REVOKED" | "NOT_FOUND">;
};

export type VisitorAuthSuccess = {
  state: "AUTHENTICATED";
  identity: VisitorIdentity;
  sessionToken: string;
  expiresAt: string;
};

export type VisitorAuthResult =
  | VisitorAuthSuccess
  | { state: "INVALID_INPUT" | "REJECTED" | "RATE_LIMITED" };

type VisitorAuthServiceOptions = {
  pepper: string;
  clientNetworkAddress?: string | null;
  now?: Date;
};

function toPersistedSession(session: VisitorSessionMaterial) {
  return {
    sessionId: session.sessionId,
    tokenHash: session.tokenHash,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function authDimensions(
  credentials: VisitorCredentials,
  operation: VisitorAuthOperation,
  pepper: string,
  clientNetworkAddress?: string | null,
) {
  const dimensions = [
    createAuthThrottleDimension(pepper, credentials.scenicAreaId, operation, "HANDLE", credentials.handle),
  ];
  const network = clientNetworkAddress?.trim().toLowerCase();
  if (network && network.length <= 512) {
    dimensions.push(createAuthThrottleDimension(pepper, credentials.scenicAreaId, operation, "NETWORK", network));
  }
  return dimensions;
}

function isFutureTimestamp(timestamp: string | null, now: Date) {
  if (!timestamp) return false;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) && value > now.getTime();
}

async function isThrottled(
  repository: VisitorIdentityRepository,
  credentials: VisitorCredentials,
  operation: VisitorAuthOperation,
  dimensionHashes: string[],
  now: Date,
) {
  const state = await repository.readThrottle({
    scenicAreaId: credentials.scenicAreaId,
    operation,
    dimensionHashes,
    now: now.toISOString(),
  });
  return isFutureTimestamp(state.lockedUntil, now);
}

async function recordFailure(
  repository: VisitorIdentityRepository,
  credentials: VisitorCredentials,
  operation: VisitorAuthOperation,
  dimensionHashes: string[],
  account: VisitorAccountRecord | null,
  now: Date,
) {
  const result = await repository.recordAuthFailure({
    scenicAreaId: credentials.scenicAreaId,
    operation,
    dimensionHashes,
    accountId: account?.accountId ?? null,
    actorSubject: account?.subject ?? null,
    occurredAt: now.toISOString(),
    windowMs: FAILURE_WINDOW_MS,
    threshold: FAILURE_THRESHOLD,
    lockMs: LOCK_DURATION_MS,
  });
  return isFutureTimestamp(result.lockedUntil, now) ? "RATE_LIMITED" as const : "REJECTED" as const;
}

export async function registerVisitor(
  repository: VisitorIdentityRepository,
  value: unknown,
  options: VisitorAuthServiceOptions,
): Promise<VisitorAuthResult> {
  const credentials = parseVisitorCredentials(value);
  const now = options.now ?? new Date();
  if (!credentials || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" };
  const dimensionHashes = authDimensions(credentials, "REGISTER", options.pepper, options.clientNetworkAddress);
  if (await isThrottled(repository, credentials, "REGISTER", dimensionHashes, now)) return { state: "RATE_LIMITED" };

  const identity = createVisitorAccountIdentity(credentials.scenicAreaId, credentials.handle);
  const [password, session] = await Promise.all([
    hashVisitorPassphrase(credentials.passphrase),
    Promise.resolve(createVisitorSessionMaterial(now)),
  ]);
  const persisted = await repository.createAccountWithSession({
    identity,
    password,
    session: toPersistedSession(session),
    throttleDimensionHashes: dimensionHashes,
  });
  if (persisted === "CONFLICT") {
    const state = await recordFailure(repository, credentials, "REGISTER", dimensionHashes, null, now);
    return { state };
  }
  return { state: "AUTHENTICATED", identity, sessionToken: session.sessionToken, expiresAt: session.expiresAt };
}

export async function loginVisitor(
  repository: VisitorIdentityRepository,
  value: unknown,
  options: VisitorAuthServiceOptions,
): Promise<VisitorAuthResult> {
  const credentials = parseVisitorCredentials(value);
  const now = options.now ?? new Date();
  if (!credentials || Number.isNaN(now.getTime())) return { state: "INVALID_INPUT" };
  const dimensionHashes = authDimensions(credentials, "LOGIN", options.pepper, options.clientNetworkAddress);
  if (await isThrottled(repository, credentials, "LOGIN", dimensionHashes, now)) return { state: "RATE_LIMITED" };

  const account = await repository.findAccountByHandle(credentials.scenicAreaId, credentials.handle);
  if (account && isFutureTimestamp(account.lockedUntil, now)) return { state: "RATE_LIMITED" };
  const passwordMatches = await verifyVisitorPassphrase(
    credentials.passphrase,
    account ?? DUMMY_PASSWORD_SECRET,
  );
  if (!account || !passwordMatches) {
    const state = await recordFailure(repository, credentials, "LOGIN", dimensionHashes, account, now);
    return { state };
  }

  const session = createVisitorSessionMaterial(now);
  await repository.createSessionAfterLogin({
    identity: {
      accountId: account.accountId,
      scenicAreaId: account.scenicAreaId,
      subject: account.subject,
      handle: account.handle,
    },
    session: toPersistedSession(session),
    throttleDimensionHashes: dimensionHashes,
  });
  return {
    state: "AUTHENTICATED",
    identity: {
      accountId: account.accountId,
      scenicAreaId: account.scenicAreaId,
      subject: account.subject,
      handle: account.handle,
    },
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  };
}

export async function getVisitorIdentityForSession(
  repository: VisitorIdentityRepository,
  sessionToken: unknown,
  now = new Date(),
) {
  if (!isVisitorSessionToken(sessionToken) || Number.isNaN(now.getTime())) return null;
  return repository.findIdentityBySessionTokenHash(hashVisitorSessionToken(sessionToken), now.toISOString());
}

export async function logoutVisitorSession(
  repository: VisitorIdentityRepository,
  sessionToken: unknown,
  now = new Date(),
) {
  if (!isVisitorSessionToken(sessionToken) || Number.isNaN(now.getTime())) return "NOT_FOUND" as const;
  return repository.revokeSessionByTokenHash(hashVisitorSessionToken(sessionToken), now.toISOString());
}
