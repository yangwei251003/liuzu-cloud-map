import assert from "node:assert/strict";
import test from "node:test";
import { evaluateServerShareCapability } from "../src/lib/server/share-link-capability.ts";
import { createServerShare, readServerShare, revokeServerShare } from "../src/lib/server/share-link-service.ts";

const now = new Date("2026-08-15T04:00:00.000Z");
const shareId = "018f71c2-26d4-7f10-8f32-8fa0cf983111";
const owner = {
  accountId: "018f71c2-26d4-7f10-8f32-8fa0cf983222",
  scenicAreaId: "liuzu-town",
  subject: "visitor:liuzu-town:018f71c2-26d4-7f10-8f32-8fa0cf983222",
};
const otherOwner = {
  accountId: "018f71c2-26d4-7f10-8f32-8fa0cf983333",
  scenicAreaId: "liuzu-town",
  subject: "visitor:liuzu-town:018f71c2-26d4-7f10-8f32-8fa0cf983333",
};
const input = {
  scenicAreaId: "liuzu-town",
  title: "六祖文化半日演示线",
  duration: "3 小时",
  pace: "均衡",
  stops: [
    { id: "guoen-temple", name: "国恩寺", verification: "候选点位" },
    { id: "huineng-residence", name: "六祖惠能故居", verification: "候选点位" },
  ],
};

function memoryRepository() {
  let stored = null;
  return {
    inspect: () => stored,
    async create(record) {
      stored = { id: shareId, ...structuredClone(record) };
      return { id: shareId };
    },
    async findByPublicTokenHash(tokenHash) {
      return stored?.tokenHash === tokenHash ? structuredClone(stored) : null;
    },
    async revokeOwned(request) {
      if (
        !stored ||
        stored.id !== request.shareId ||
        stored.scenicAreaId !== request.scenicAreaId ||
        stored.createdByAccountId !== request.accountId ||
        stored.createdBySubject !== request.actorSubject ||
        (request.revokeTokenHash !== null && stored.revokeTokenHash !== request.revokeTokenHash)
      ) return "NOT_FOUND";
      if (stored.revokedAt !== null) return "ALREADY_REVOKED";
      stored.revokedAt = request.revokedAt;
      return "REVOKED";
    },
  };
}

test("server share remains disabled until database, feature switch and trusted login are all present", () => {
  assert.deepEqual(evaluateServerShareCapability({}), { state: "DISABLED", reason: "DATABASE_NOT_CONFIGURED" });
  assert.deepEqual(evaluateServerShareCapability({ DATABASE_URL: "postgres://example" }), { state: "DISABLED", reason: "FEATURE_NOT_ENABLED" });
  assert.deepEqual(evaluateServerShareCapability({ DATABASE_URL: "postgres://example", SERVER_SHARE_ENABLED: "1" }), { state: "AUTH_REQUIRED" });
  assert.deepEqual(
    evaluateServerShareCapability({ DATABASE_URL: "postgres://example", SERVER_SHARE_ENABLED: "1", SERVER_SHARE_ALLOW_ANONYMOUS_DEMO: "1" }),
    { state: "AUTH_REQUIRED" },
  );
});

test("service persists only hashes and can resolve an active public bearer token", async () => {
  const repository = memoryRepository();
  const created = await createServerShare(repository, input, owner, now);
  const serialized = JSON.stringify(repository.inspect());
  assert.equal(serialized.includes(created.publicToken), false);
  assert.equal(serialized.includes(created.revokeToken), false);
  assert.match(repository.inspect().tokenHash, /^[0-9a-f]{64}$/);
  assert.match(repository.inspect().revokeTokenHash, /^[0-9a-f]{64}$/);
  assert.equal(repository.inspect().createdBySubject, owner.subject);

  const read = await readServerShare(repository, created.publicToken, now);
  assert.equal(read.state, "ACTIVE");
  assert.equal(read.id, shareId);
  assert.deepEqual(read.payload.stops, input.stops);
});

test("revocation always requires the owner session; an optional proof can add protection", async () => {
  const repository = memoryRepository();
  const created = await createServerShare(repository, input, owner, now);
  assert.equal(await revokeServerShare(repository, shareId, otherOwner, created.revokeToken, now), "NOT_FOUND");
  assert.equal(await revokeServerShare(repository, shareId, owner, "x".repeat(43), now), "NOT_FOUND");
  assert.equal((await readServerShare(repository, created.publicToken, now)).state, "ACTIVE");
  assert.equal(await revokeServerShare(repository, shareId, owner, created.revokeToken, now), "REVOKED");
  assert.equal(await revokeServerShare(repository, shareId, owner, created.revokeToken, now), "ALREADY_REVOKED");
  assert.equal((await readServerShare(repository, created.publicToken, now)).state, "REVOKED");
});

test("the authenticated owner may revoke without sending the optional proof", async () => {
  const repository = memoryRepository();
  await createServerShare(repository, input, owner, now);
  assert.equal(await revokeServerShare(repository, shareId, owner, null, now), "REVOKED");
});

test("expired, malformed and unknown public links never return route content", async () => {
  const repository = memoryRepository();
  const created = await createServerShare(repository, input, owner, now);
  assert.deepEqual(await readServerShare(repository, "not-a-token", now), { state: "INVALID" });
  assert.deepEqual(await readServerShare(repository, "A".repeat(43), now), { state: "NOT_FOUND" });
  assert.deepEqual(await readServerShare(repository, created.publicToken, new Date("2026-08-22T04:00:00.000Z")), { state: "EXPIRED" });
});
