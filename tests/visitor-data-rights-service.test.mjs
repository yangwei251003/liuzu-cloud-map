import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hashVisitorPassphrase } from "../src/lib/server/visitor-identity-domain.ts";
import {
  deleteVisitorAccount,
  exportVisitorData,
  getVisitorConsents,
  writeVisitorConsent,
} from "../src/lib/server/visitor-data-rights-service.ts";

const identity = {
  accountId: "018f71c2-26d4-7f10-8f32-8fa0cf983222",
  scenicAreaId: "liuzu-town",
  subject: "visitor:liuzu-town:018f71c2-26d4-7f10-8f32-8fa0cf983222",
  handle: "cloud_guest",
};
const passphrase = "visitor-passphrase-2026";
const now = new Date("2026-08-15T06:00:00.000Z");

async function memoryDataRightsRepository() {
  const consents = new Map();
  const idempotency = new Map();
  const calls = { exports: [], deletions: [] };

  return {
    inspect: () => ({ consents: [...consents.values()], calls: structuredClone(calls) }),
    async listConsents() {
      return [...consents.values()]
        .map((item) => structuredClone(item))
        .sort((left, right) => left.purpose.localeCompare(right.purpose));
    },
    async writeConsent(input) {
      const replay = idempotency.get(input.idempotencyKeyHash);
      if (replay) {
        if (replay.purpose !== input.consent.purpose || replay.granted !== input.consent.granted) {
          return { state: "IDEMPOTENCY_CONFLICT" };
        }
        return { state: "REPLAYED", consent: structuredClone(replay) };
      }
      const current = consents.get(input.consent.purpose);
      if (!current && input.consent.expectedRevision !== 0) {
        return { state: "REVISION_CONFLICT", currentRevision: null };
      }
      if (current && current.revision !== input.consent.expectedRevision) {
        return { state: "REVISION_CONFLICT", currentRevision: current.revision };
      }
      const consent = {
        purpose: input.consent.purpose,
        granted: input.consent.granted,
        revision: (current?.revision ?? 0) + 1,
        recordedAt: input.recordedAt,
      };
      consents.set(consent.purpose, consent);
      idempotency.set(input.idempotencyKeyHash, consent);
      return { state: "APPLIED", consent: structuredClone(consent) };
    },
    async exportData(input) {
      calls.exports.push(structuredClone(input));
      return {
        state: "COMPLETED",
        data: {
          schemaVersion: 1,
          exportedAt: input.exportedAt,
          receipt: { reference: input.requestReference, completedAt: input.exportedAt },
          visitor: { ...identity, createdAt: "2026-08-14T00:00:00.000Z" },
          consents: [...consents.values()],
          itineraries: [],
          visitSessions: [],
          navigationSessions: [],
          shareLinks: [],
        },
      };
    },
    async deleteAccount(input) {
      calls.deletions.push(structuredClone(input));
      return {
        state: "DELETED",
        receipt: { reference: input.requestReference, completedAt: input.deletedAt },
      };
    },
  };
}

test("同意记录采用 revision 和幂等键，且只在对应景区账号范围内工作", async () => {
  const repository = await memoryDataRightsRepository();
  const first = await writeVisitorConsent(
    repository,
    identity,
    { purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: 0 },
    "a".repeat(64),
    now,
  );
  assert.deepEqual(first, {
    state: "APPLIED",
    consent: { purpose: "ACCOUNT_STORAGE", granted: true, revision: 1, recordedAt: now.toISOString() },
  });
  const replay = await writeVisitorConsent(
    repository,
    identity,
    { purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: 0 },
    "a".repeat(64),
    now,
  );
  assert.equal(replay.state, "REPLAYED");
  const conflict = await writeVisitorConsent(
    repository,
    identity,
    { purpose: "ACCOUNT_STORAGE", granted: false, expectedRevision: 0 },
    "b".repeat(64),
    now,
  );
  assert.deepEqual(conflict, { state: "REVISION_CONFLICT", currentRevision: 1 });
  assert.deepEqual(await getVisitorConsents(repository, identity), [first.consent]);
});

test("导出不将密码、会话 bearer 或位置数据传入持久化接口或返回包", async () => {
  const repository = await memoryDataRightsRepository();
  const result = await exportVisitorData(repository, identity, "c".repeat(64), now);
  assert.equal(result.state, "COMPLETED");
  const serialized = JSON.stringify({ result, repository: repository.inspect() });
  assert.equal(serialized.includes(passphrase), false);
  assert.equal(serialized.includes("sessionToken"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(repository.inspect().calls.exports[0].idempotencyKeyHash, "c".repeat(64));
});

test("注销先验证当前密码，随后只把身份与散列传递给事务性删除接口", async () => {
  const secret = await hashVisitorPassphrase(passphrase, () => Buffer.alloc(16, 7));
  const account = { ...identity, ...secret, lockedUntil: null, createdAt: "2026-08-14T00:00:00.000Z" };
  const identityRepository = {
    async findAccountByHandle(scenicAreaId, handle) {
      return scenicAreaId === identity.scenicAreaId && handle === identity.handle ? structuredClone(account) : null;
    },
  };
  const repository = await memoryDataRightsRepository();

  const rejected = await deleteVisitorAccount(identityRepository, repository, identity, "wrong-password-2026", "d".repeat(64), now);
  assert.deepEqual(rejected, { state: "REAUTH_FAILED" });
  assert.equal(repository.inspect().calls.deletions.length, 0);

  const deleted = await deleteVisitorAccount(identityRepository, repository, identity, passphrase, "e".repeat(64), now);
  assert.equal(deleted.state, "DELETED");
  const deletionInput = repository.inspect().calls.deletions[0];
  assert.deepEqual(Object.keys(deletionInput).sort(), ["deletedAt", "idempotencyKeyHash", "identity", "requestReference"]);
  assert.equal(JSON.stringify(deletionInput).includes(passphrase), false);
  assert.equal(JSON.stringify(deleted.receipt).includes(identity.accountId), false);
  assert.equal(JSON.stringify(deleted.receipt).includes(identity.subject), false);
});

test("PostgreSQL 删除事务撤销会话、撤销并移除分享，并保留去标识化请求收据", async () => {
  const source = await readFile(new URL("../src/lib/server/visitor-data-rights-repository.ts", import.meta.url), "utf8");
  assert.match(source, /UPDATE visitor_sessions[\s\S]*?SET revoked_at/);
  assert.match(source, /UPDATE share_links[\s\S]*?SET revoked_at/);
  assert.match(source, /DELETE FROM share_links/);
  assert.match(source, /UPDATE data_subject_requests[\s\S]*?SET account_id = NULL/);
  assert.match(source, /DELETE FROM visitor_accounts/);
  const exportSection = source.slice(source.indexOf("async exportData"), source.indexOf("async deleteAccount"));
  assert.match(exportSection, /FROM navigation_sessions AS session/);
  assert.match(exportSection, /FROM navigation_session_events AS event/);
  assert.match(exportSection, /remainingDistanceBucketMeters/);
  assert.doesNotMatch(exportSection, /password_hash|password_salt|token_hash|geometry_wgs84|route_geometry_wgs84|coarse_context|metadata/);
  assert.doesNotMatch(exportSection, /latitude|longitude|heading|gps_sample|track_points/);
});
