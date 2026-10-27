import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthThrottleDimension,
  createVisitorAccountIdentity,
  createVisitorSessionMaterial,
  hashVisitorPassphrase,
  hashVisitorSessionToken,
  parseVisitorCredentials,
  verifyVisitorPassphrase,
  VISITOR_SESSION_LIFETIME_MS,
} from "../src/lib/server/visitor-identity-domain.ts";

const passphrase = "一段足够长的游客口令-2026";

test("visitor credentials use a closed schema, normalized handle and a 12-character minimum", () => {
  assert.deepEqual(
    parseVisitorCredentials({ scenicAreaId: "liuzu-town", handle: "  Cloud_Guest ", passphrase }),
    { scenicAreaId: "liuzu-town", handle: "cloud_guest", passphrase },
  );
  assert.equal(parseVisitorCredentials({ scenicAreaId: "liuzu-town", handle: "ab", passphrase }), null);
  assert.equal(parseVisitorCredentials({ scenicAreaId: "liuzu-town", handle: "guest", passphrase: "short" }), null);
  assert.equal(parseVisitorCredentials({ scenicAreaId: "liuzu-town", handle: "guest", passphrase, role: "operator" }), null);
});

test("asynchronous scrypt uses a per-account random salt and never emits plaintext", async () => {
  const first = await hashVisitorPassphrase(passphrase, (size) => Buffer.alloc(size, 1));
  const second = await hashVisitorPassphrase(passphrase, (size) => Buffer.alloc(size, 2));
  assert.notEqual(first.passwordSalt, second.passwordSalt);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(JSON.stringify(first).includes(passphrase), false);
  assert.equal(await verifyVisitorPassphrase(passphrase, first), true);
  assert.equal(await verifyVisitorPassphrase(`${passphrase}x`, first), false);
});

test("a visitor subject is tenant-scoped and a 30-day session has separate bearer and hash material", () => {
  const accountId = "018f71c2-26d4-7f10-8f32-8fa0cf983444";
  const identity = createVisitorAccountIdentity("liuzu-town", "cloud_guest", () => accountId);
  assert.deepEqual(identity, {
    accountId,
    scenicAreaId: "liuzu-town",
    subject: `visitor:liuzu-town:${accountId}`,
    handle: "cloud_guest",
  });
  const now = new Date("2026-08-15T00:00:00.000Z");
  const session = createVisitorSessionMaterial(now, (size) => Buffer.alloc(size, 7), () => accountId);
  assert.equal(session.tokenHash, hashVisitorSessionToken(session.sessionToken));
  assert.equal(session.tokenHash.includes(session.sessionToken), false);
  assert.equal(new Date(session.expiresAt).getTime() - now.getTime(), VISITOR_SESSION_LIFETIME_MS);
});

test("rate-limit dimensions are peppered and reveal neither handle nor raw network address", () => {
  const pepper = "p".repeat(32);
  const handleHash = createAuthThrottleDimension(pepper, "liuzu-town", "LOGIN", "HANDLE", "cloud_guest");
  const networkHash = createAuthThrottleDimension(pepper, "liuzu-town", "LOGIN", "NETWORK", "203.0.113.9");
  assert.match(handleHash, /^[0-9a-f]{64}$/);
  assert.match(networkHash, /^[0-9a-f]{64}$/);
  assert.notEqual(handleHash, networkHash);
  assert.equal(handleHash.includes("cloud_guest"), false);
  assert.equal(networkHash.includes("203.0.113.9"), false);
  assert.throws(
    () => createAuthThrottleDimension("too-short", "liuzu-town", "LOGIN", "NETWORK", "203.0.113.9"),
    /pepper_too_short/,
  );
});
