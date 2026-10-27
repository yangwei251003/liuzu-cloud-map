import assert from "node:assert/strict";
import test from "node:test";
import {
  createShareLinkMaterial,
  evaluateShareLinkRecord,
  hashShareToken,
  isShareId,
  isShareToken,
  parseCreateServerShareInput,
  parseServerSharePayload,
  verifyShareToken,
} from "../src/lib/server/share-link-domain.ts";

const input = {
  scenicAreaId: "liuzu-town",
  title: "寻源半日线",
  duration: "3 小时",
  pace: "舒缓",
  stops: [
    { id: "guoen-temple", name: "国恩寺", verification: "候选点位" },
    { id: "huineng-residence", name: "六祖惠能故居", verification: "候选点位" },
  ],
};
const now = new Date("2026-08-15T00:00:00.000Z");
const owner = {
  accountId: "018f71c2-26d4-7f10-8f32-8fa0cf983222",
  scenicAreaId: "liuzu-town",
  subject: "visitor:liuzu-town:018f71c2-26d4-7f10-8f32-8fa0cf983222",
};

function deterministicRandom() {
  let call = 0;
  return (length) => Buffer.alloc(length, ++call);
}

test("server share material stores only token hashes and a strict minimum payload", () => {
  const result = createShareLinkMaterial(input, owner, new Date("2026-08-15T00:00:00.000Z"), deterministicRandom());
  assert.equal(isShareToken(result.publicToken), true);
  assert.equal(isShareToken(result.revokeToken), true);
  assert.notEqual(result.publicToken, result.revokeToken);
  assert.equal(result.record.tokenHash, hashShareToken(result.publicToken));
  assert.equal(result.record.revokeTokenHash, hashShareToken(result.revokeToken));
  assert.equal(result.record.createdByAccountId, owner.accountId);
  assert.equal(result.record.createdBySubject, owner.subject);
  assert.equal(JSON.stringify(result.record).includes(result.publicToken), false);
  assert.equal(JSON.stringify(result.record).includes(result.revokeToken), false);
  assert.deepEqual(Object.keys(result.record.payload).sort(), ["duration", "pace", "stops", "title", "version"]);
  assert.equal("sourceText" in result.record.payload, false);
  assert.equal("plannedDate" in result.record.payload, false);
  assert.equal(result.record.expiresAt, "2026-08-22T00:00:00.000Z");
});

test("creation input rejects extra fields, duplicate stops and oversized content", () => {
  assert.deepEqual(parseCreateServerShareInput(input), input);
  assert.equal(parseCreateServerShareInput({ ...input, privateNote: "不要公开" }), null);
  assert.equal(parseCreateServerShareInput({ ...input, scenicAreaId: "../../other" }), null);
  assert.equal(parseCreateServerShareInput({ ...input, title: "x".repeat(101) }), null);
  assert.equal(parseCreateServerShareInput({ ...input, scenicAreaId: "another-scenic-area" }), null);
  assert.equal(parseCreateServerShareInput({ ...input, stops: [input.stops[0], input.stops[0]] }), null);
  assert.equal(parseCreateServerShareInput({ ...input, stops: [{ ...input.stops[0], coordinates: [112, 22] }] }), null);
  assert.equal(parseCreateServerShareInput({ ...input, stops: [{ ...input.stops[0], name: "已核验正式入口" }] }), null);
  assert.equal(parseCreateServerShareInput({ ...input, stops: [{ ...input.stops[0], verification: "官方已核验" }] }), null);
  assert.equal(parseCreateServerShareInput({ ...input, stops: [{ id: "unknown-place", name: "未知地点", verification: "候选点位" }] }), null);
});

test("share creation rejects a missing, forged or cross-tenant visitor owner", () => {
  assert.throws(
    () => createShareLinkMaterial(input, { ...owner, scenicAreaId: "another-scenic" }, now, deterministicRandom()),
    /invalid_share_link_input/,
  );
  assert.throws(
    () => createShareLinkMaterial(input, { ...owner, subject: "operator:admin" }, now, deterministicRandom()),
    /invalid_share_link_input/,
  );
});

test("stored payload and public identifiers are parsed with closed schemas", () => {
  const { record } = createShareLinkMaterial(input, owner, now, deterministicRandom());
  assert.deepEqual(parseServerSharePayload(structuredClone(record.payload)), record.payload);
  assert.equal(parseServerSharePayload({ ...record.payload, sourceText: "private" }), null);
  assert.equal(isShareId("018f71c2-26d4-7f10-8f32-8fa0cf983111"), true);
  assert.equal(isShareId("../../share"), false);
});

test("token proof uses fixed hash contracts and rejects malformed values", () => {
  const result = createShareLinkMaterial(input, owner, new Date("2026-08-15T00:00:00.000Z"), deterministicRandom());
  assert.equal(verifyShareToken(result.publicToken, result.record.tokenHash), true);
  assert.equal(verifyShareToken(result.revokeToken, result.record.tokenHash), false);
  assert.equal(verifyShareToken("short", result.record.tokenHash), false);
  assert.equal(verifyShareToken(result.publicToken, "not-a-hash"), false);
});

test("access state distinguishes active, expired, revoked and impossible records", () => {
  const { record } = createShareLinkMaterial(input, owner, new Date("2026-08-15T00:00:00.000Z"), deterministicRandom());
  assert.equal(evaluateShareLinkRecord(record, new Date("2026-08-16T00:00:00.000Z")), "ACTIVE");
  assert.equal(evaluateShareLinkRecord(record, new Date("2026-08-22T00:00:00.000Z")), "EXPIRED");
  assert.equal(evaluateShareLinkRecord({ ...record, revokedAt: "2026-08-16T00:00:00.000Z" }, new Date("2026-08-17T00:00:00.000Z")), "REVOKED");
  assert.equal(evaluateShareLinkRecord({ ...record, expiresAt: record.createdAt }, new Date("2026-08-16T00:00:00.000Z")), "INVALID");
  assert.equal(evaluateShareLinkRecord({ ...record, expiresAt: "2026-08-23T00:00:00.000Z" }, new Date("2026-08-16T00:00:00.000Z")), "INVALID");
  assert.equal(evaluateShareLinkRecord({ ...record, revokedAt: "2026-08-18T00:00:00.000Z" }, new Date("2026-08-17T00:00:00.000Z")), "INVALID");
  assert.equal(evaluateShareLinkRecord(record, new Date("2026-08-14T00:00:00.000Z")), "INVALID");
});
