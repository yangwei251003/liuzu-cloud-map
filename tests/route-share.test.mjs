import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUTE_SHARE_LIFETIME_MS,
  addRouteShareRecord,
  buildRouteShareUrl,
  createEmptyRouteShareRegistry,
  createRouteSharePayload,
  decodeRouteShareToken,
  encodeRouteShareToken,
  getRouteShareRecordStatus,
  parseRouteSharePayload,
  parseRouteShareRegistry,
  revokeRouteShareRecord,
} from "../src/lib/route-share.ts";

const now = new Date("2026-08-15T01:20:00.000Z");
const route = {
  id: "route-private-1",
  title: "寻源半日线",
  plannedDate: "2026-08-18",
  duration: "3 小时",
  pace: "均衡",
  note: "与家人同行，需要多休息。",
  transport: "步行",
  sourceText: "这是不应进入分享链接的原始游记。",
  status: "prototype",
  stops: [
    {
      id: "guoen-temple",
      name: "国恩寺",
      verification: "候选点位",
      dwellMinutes: 60,
      evidence: "不应进入分享链接的证据片段",
    },
    {
      id: "huineng-residence",
      name: "六祖惠能故居",
      verification: "候选点位",
      dwellMinutes: 35,
      evidence: "LZ-003",
    },
  ],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

function createArtifacts() {
  const payload = createRouteSharePayload(route, { now, shareId: "share-test-route-0001" });
  const token = encodeRouteShareToken(payload);
  const record = {
    shareId: payload.shareId,
    routeId: route.id,
    routeTitle: payload.route.title,
    token,
    createdAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    revokedAt: null,
  };
  return { payload, token, record };
}

test("share payload contains only the approved minimum route fields", () => {
  const { payload } = createArtifacts();
  assert.deepEqual(Object.keys(payload.route).sort(), ["duration", "pace", "stops", "title"]);
  assert.deepEqual(payload.route.stops, [
    { id: "guoen-temple", name: "国恩寺" },
    { id: "huineng-residence", name: "六祖惠能故居" },
  ]);

  const serialized = JSON.stringify(payload);
  for (const privateValue of [route.note, route.sourceText, route.plannedDate, route.transport, "dwellMinutes", "evidence"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(new Date(payload.expiresAt).getTime() - new Date(payload.issuedAt).getTime(), ROUTE_SHARE_LIFETIME_MS);
});

test("valid token round-trips and becomes blocked at its seven-day expiry", () => {
  const { payload, token } = createArtifacts();
  assert.deepEqual(decodeRouteShareToken(token, now), { status: "valid", payload });
  assert.deepEqual(decodeRouteShareToken(token, new Date(payload.expiresAt)), { status: "expired", payload });
});

test("corrupted, oversized and malformed tokens fail closed", () => {
  const { token } = createArtifacts();
  const replacement = token.endsWith("A") ? "B" : "A";
  assert.equal(decodeRouteShareToken(`${token.slice(0, -1)}${replacement}`, now).status, "invalid");
  assert.equal(decodeRouteShareToken("not+a+base64url", now).status, "invalid");
  assert.equal(decodeRouteShareToken("a".repeat(5_001), now).status, "invalid");
});

test("payload parser rejects extra fields, unknown spots, duplicate spots and non-seven-day lifetimes", () => {
  const { payload } = createArtifacts();
  assert.equal(parseRouteSharePayload({ ...payload, plannedDate: "2026-08-18" }), null);
  assert.equal(
    parseRouteSharePayload({
      ...payload,
      route: { ...payload.route, stops: [{ id: "unknown-place", name: "未知地点" }] },
    }),
    null,
  );
  assert.equal(parseRouteSharePayload({ ...payload, route: { ...payload.route, stops: [payload.route.stops[0], payload.route.stops[0]] } }), null);
  assert.equal(
    parseRouteSharePayload({ ...payload, expiresAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1_000).toISOString() }),
    null,
  );
});

test("route share URL keeps the self-contained token in the fragment", () => {
  const { token } = createArtifacts();
  const url = new URL(buildRouteShareUrl(token, "https://preview.example.test/base"));
  assert.equal(url.pathname, "/share");
  assert.equal(url.search, "");
  assert.equal(url.hash.slice(1), token);
});

test("creator registry is strict and local revocation changes only the local record", () => {
  const { record } = createArtifacts();
  const registry = addRouteShareRecord(createEmptyRouteShareRegistry(), record);
  assert.deepEqual(parseRouteShareRegistry(structuredClone(registry)), registry);
  assert.equal(getRouteShareRecordStatus(record, now), "active");

  const revokedAt = new Date(now.getTime() + 60_000);
  const revoked = revokeRouteShareRecord(registry, record.shareId, revokedAt);
  assert.equal(revoked.records[0].revokedAt, revokedAt.toISOString());
  assert.equal(getRouteShareRecordStatus(revoked.records[0], revokedAt), "revoked");

  assert.equal(parseRouteShareRegistry({ ...registry, unexpected: true }), null);
  assert.equal(parseRouteShareRegistry({ ...registry, records: [record, record] }), null);
  assert.throws(() => revokeRouteShareRecord(registry, "share-missing-record-0001", revokedAt), /share_not_found/);
});
