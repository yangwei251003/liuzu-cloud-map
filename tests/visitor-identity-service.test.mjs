import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisitorIdentityForSession,
  loginVisitor,
  logoutVisitorSession,
  registerVisitor,
} from "../src/lib/server/visitor-identity-service.ts";

const pepper = "rate-limit-test-pepper-value-0001";
const passphrase = "visitor-passphrase-2026";
const baseNow = new Date("2026-08-15T00:00:00.000Z");

function memoryIdentityRepository() {
  const accounts = new Map();
  const sessions = new Map();
  const throttles = new Map();
  const audit = [];

  const accountKey = (scenicAreaId, handle) => `${scenicAreaId}:${handle}`;
  const throttleKey = (scenicAreaId, operation, hash) => `${scenicAreaId}:${operation}:${hash}`;

  return {
    inspect: () => ({
      accounts: [...accounts.values()],
      sessions: [...sessions.values()],
      throttles: [...throttles.values()],
      audit,
    }),
    async createAccountWithSession(input) {
      const key = accountKey(input.identity.scenicAreaId, input.identity.handle);
      if (accounts.has(key)) return "CONFLICT";
      accounts.set(key, {
        ...structuredClone(input.identity),
        ...structuredClone(input.password),
        lockedUntil: null,
        createdAt: input.session.createdAt,
      });
      sessions.set(input.session.tokenHash, {
        ...structuredClone(input.session),
        identity: structuredClone(input.identity),
        revokedAt: null,
      });
      for (const hash of input.throttleDimensionHashes) throttles.delete(throttleKey(input.identity.scenicAreaId, "REGISTER", hash));
      audit.push({ type: "REGISTERED", subject: input.identity.subject });
      return "CREATED";
    },
    async findAccountByHandle(scenicAreaId, handle) {
      return structuredClone(accounts.get(accountKey(scenicAreaId, handle)) ?? null);
    },
    async readThrottle(input) {
      const active = input.dimensionHashes
        .map((hash) => throttles.get(throttleKey(input.scenicAreaId, input.operation, hash))?.lockedUntil ?? null)
        .filter((value) => value && new Date(value).getTime() > new Date(input.now).getTime())
        .sort()
        .at(-1);
      return { lockedUntil: active ?? null };
    },
    async recordAuthFailure(input) {
      const nowMs = new Date(input.occurredAt).getTime();
      let latestLock = null;
      for (const hash of input.dimensionHashes) {
        const key = throttleKey(input.scenicAreaId, input.operation, hash);
        const previous = throttles.get(key);
        const withinWindow = previous && nowMs - new Date(previous.windowStartedAt).getTime() < input.windowMs;
        const failureCount = withinWindow ? previous.failureCount + 1 : 1;
        const lockedUntil = failureCount >= input.threshold
          ? new Date(nowMs + input.lockMs).toISOString()
          : previous?.lockedUntil ?? null;
        throttles.set(key, {
          scenicAreaId: input.scenicAreaId,
          operation: input.operation,
          dimensionHash: hash,
          windowStartedAt: withinWindow ? previous.windowStartedAt : input.occurredAt,
          failureCount,
          lockedUntil,
        });
        if (lockedUntil && (!latestLock || lockedUntil > latestLock)) latestLock = lockedUntil;
      }
      if (input.accountId && input.operation === "LOGIN") {
        for (const account of accounts.values()) {
          if (account.accountId === input.accountId && account.scenicAreaId === input.scenicAreaId) account.lockedUntil = latestLock;
        }
      }
      audit.push({ type: `${input.operation}_FAILED`, dimensionHash: input.dimensionHashes[0] });
      return { lockedUntil: latestLock };
    },
    async createSessionAfterLogin(input) {
      const key = accountKey(input.identity.scenicAreaId, input.identity.handle);
      const account = accounts.get(key);
      if (!account || account.accountId !== input.identity.accountId) throw new Error("missing account");
      account.lockedUntil = null;
      sessions.set(input.session.tokenHash, {
        ...structuredClone(input.session),
        identity: structuredClone(input.identity),
        revokedAt: null,
      });
      for (const hash of input.throttleDimensionHashes) throttles.delete(throttleKey(input.identity.scenicAreaId, "LOGIN", hash));
      audit.push({ type: "LOGIN_SUCCEEDED", subject: input.identity.subject });
    },
    async findIdentityBySessionTokenHash(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= new Date(now).getTime()) return null;
      return structuredClone(session.identity);
    },
    async revokeSessionByTokenHash(tokenHash, revokedAt) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt) return "NOT_FOUND";
      session.revokedAt = revokedAt;
      audit.push({ type: "SESSION_REVOKED", subject: session.identity.subject });
      return "REVOKED";
    },
  };
}

function credentials(scenicAreaId = "liuzu-town", handle = "cloud_guest", secret = passphrase) {
  return { scenicAreaId, handle, passphrase: secret };
}

test("registration persists only derived secrets and session hashes, then logout invalidates the session", async () => {
  const repository = memoryIdentityRepository();
  const result = await registerVisitor(repository, credentials(), {
    pepper,
    clientNetworkAddress: "203.0.113.9",
    now: baseNow,
  });
  assert.equal(result.state, "AUTHENTICATED");
  assert.equal("role" in result.identity, false);
  assert.equal("mfa" in result.identity, false);
  const persisted = JSON.stringify(repository.inspect());
  assert.equal(persisted.includes(passphrase), false);
  assert.equal(persisted.includes("203.0.113.9"), false);
  assert.equal(persisted.includes(result.sessionToken), false);
  assert.deepEqual(await getVisitorIdentityForSession(repository, result.sessionToken, baseNow), result.identity);
  assert.equal(await logoutVisitorSession(repository, result.sessionToken, baseNow), "REVOKED");
  assert.equal(await getVisitorIdentityForSession(repository, result.sessionToken, baseNow), null);
});

test("login failures do not enumerate handles and a persisted fifth failure locks the dimensions", async () => {
  const repository = memoryIdentityRepository();
  await registerVisitor(repository, credentials(), { pepper, now: baseNow });
  const wrongKnown = await loginVisitor(repository, credentials("liuzu-town", "cloud_guest", "wrong-password-2026"), { pepper, now: baseNow });
  const wrongUnknown = await loginVisitor(repository, credentials("liuzu-town", "missing_guest", "wrong-password-2026"), { pepper, now: baseNow });
  assert.equal(wrongKnown.state, "REJECTED");
  assert.equal(wrongUnknown.state, "REJECTED");

  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await loginVisitor(repository, credentials("liuzu-town", "cloud_guest", "wrong-password-2026"), { pepper, now: baseNow });
  }
  const locked = await loginVisitor(repository, credentials(), { pepper, now: baseNow });
  assert.equal(locked.state, "RATE_LIMITED");
  assert.equal(repository.inspect().throttles.some((entry) => entry.failureCount >= 5 && entry.lockedUntil), true);
});

test("successful login creates a fresh session and tenant identity never crosses scenic areas", async () => {
  const repository = memoryIdentityRepository();
  const first = await registerVisitor(repository, credentials("liuzu-town"), { pepper, now: baseNow });
  const second = await registerVisitor(repository, credentials("another-scenic", "cloud_guest"), { pepper, now: baseNow });
  assert.equal(first.state, "AUTHENTICATED");
  assert.equal(second.state, "AUTHENTICATED");
  assert.notEqual(first.identity.subject, second.identity.subject);

  const login = await loginVisitor(repository, credentials("liuzu-town"), {
    pepper,
    now: new Date("2026-08-15T01:00:00.000Z"),
  });
  assert.equal(login.state, "AUTHENTICATED");
  assert.equal(login.identity.scenicAreaId, "liuzu-town");
  assert.equal((await getVisitorIdentityForSession(repository, second.sessionToken, baseNow)).scenicAreaId, "another-scenic");
});

test("duplicate registration is generic and participates in persistent registration throttling", async () => {
  const repository = memoryIdentityRepository();
  assert.equal((await registerVisitor(repository, credentials(), { pepper, now: baseNow })).state, "AUTHENTICATED");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal((await registerVisitor(repository, credentials(), { pepper, now: baseNow })).state, "REJECTED");
  }
  assert.equal((await registerVisitor(repository, credentials(), { pepper, now: baseNow })).state, "RATE_LIMITED");
  assert.equal((await registerVisitor(repository, credentials(), { pepper, now: baseNow })).state, "RATE_LIMITED");
});
