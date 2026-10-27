import assert from "node:assert/strict";
import test from "node:test";
import {
  addServerRouteShareRecord,
  buildServerRouteShareUrl,
  createEmptyServerRouteShareRegistry,
  createServerRouteShareInput,
  getServerRouteShareStatus,
  markServerRouteShareRevoked,
  parseCreatedServerRouteShare,
  parseReadServerRouteShare,
  parseServerRouteShareRegistry,
  readServerRouteShareRegistry,
} from "../src/lib/server-route-share.ts";

const createdAt = "2026-08-15T08:00:00.000Z";
const expiresAt = "2026-08-22T08:00:00.000Z";
const shareId = "6f7056a0-e415-4d46-92cf-c4e697809154";
const shareToken = "a".repeat(43);

const route = {
  id: "route-1",
  title: "寻源半日线",
  plannedDate: "",
  duration: "3 小时",
  pace: "均衡",
  note: "不应上传",
  status: "prototype",
  createdAt,
  updatedAt: createdAt,
  stops: [{ id: "guoen-temple", name: "国恩寺", verification: "候选点位", dwellMinutes: 45 }],
};

test("server share request includes only the approved fields and registered stop evidence state", () => {
  const input = createServerRouteShareInput(route);
  assert.deepEqual(Object.keys(input).sort(), ["duration", "pace", "scenicAreaId", "stops", "title"]);
  assert.equal(JSON.stringify(input).includes(route.note), false);
  assert.deepEqual(input.stops, [{ id: "guoen-temple", name: "国恩寺", verification: "候选点位" }]);
});

test("create and read envelopes are strict and produce an opaque share URL", () => {
  const created = parseCreatedServerRouteShare({
    schemaVersion: 2,
    mode: "AUTHENTICATED_SERVER",
    shareId,
    shareToken,
    createdAt,
    expiresAt,
    warning: "仅返回一次",
  });
  assert.ok(created);
  const url = new URL(buildServerRouteShareUrl(shareToken, "https://example.test/base"));
  assert.equal(url.pathname, "/share");
  assert.equal(url.search, "");
  assert.equal(url.hash, `#${shareToken}`);
  assert.equal(parseCreatedServerRouteShare({
    schemaVersion: 1,
    mode: "AUTHENTICATED_SERVER",
    shareId,
    publicToken: shareToken,
    revokeToken: "b".repeat(43),
    publicPath: `/api/v1/shared-routes/${shareToken}`,
    createdAt,
    expiresAt,
    warning: "legacy",
  }), null);

  const request = createServerRouteShareInput(route);
  assert.ok(parseReadServerRouteShare({
    schemaVersion: 1,
    state: "ACTIVE",
    shareId,
    scenicAreaId: "liuzu-town",
    route: { version: 1, title: request.title, duration: request.duration, pace: request.pace, stops: request.stops },
    createdAt,
    expiresAt,
  }));
  assert.equal(parseReadServerRouteShare({
    schemaVersion: 1,
    state: "ACTIVE",
    shareId,
    scenicAreaId: "liuzu-town",
    route: { version: 1, title: request.title, duration: request.duration, pace: request.pace, stops: request.stops, note: "private" },
    createdAt,
    expiresAt,
  }), null);
});

test("local server-share management index validates, expires and records confirmed revocation", () => {
  const record = {
    shareId,
    routeId: route.id,
    routeTitle: route.title,
    createdAt,
    expiresAt,
    revokedAt: null,
  };
  const registry = addServerRouteShareRecord(createEmptyServerRouteShareRegistry(), record);
  assert.deepEqual(parseServerRouteShareRegistry(structuredClone(registry)), registry);
  assert.equal(JSON.stringify(registry).includes(shareToken), false);
  assert.equal(getServerRouteShareStatus(record, new Date(createdAt)), "active");
  assert.equal(getServerRouteShareStatus(record, new Date(expiresAt)), "expired");
  const revoked = markServerRouteShareRevoked(registry, shareId, new Date("2026-08-16T08:00:00.000Z"));
  assert.equal(getServerRouteShareStatus(revoked.records[0]), "revoked");
});

test("reading the token-free share index purges the legacy token-bearing key", () => {
  const legacyKey = "liuzu-cloud-tour:server-route-shares:v1";
  const values = new Map([[legacyKey, JSON.stringify({ token: shareToken })]]);
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
    },
  });
  try {
    assert.deepEqual(readServerRouteShareRegistry(), {
      registry: createEmptyServerRouteShareRegistry(),
      error: null,
    });
    assert.equal(values.has(legacyKey), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
