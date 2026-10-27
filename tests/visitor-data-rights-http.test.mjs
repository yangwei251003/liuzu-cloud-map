import assert from "node:assert/strict";
import test from "node:test";
import {
  hashDataRightsIdempotencyKey,
  parseConsentWriteInput,
  parseDataRightsIdempotencyKey,
  parseDeleteVisitorAccountInput,
} from "../src/lib/server/visitor-data-rights-domain.ts";
import {
  dataRightsIdempotencyFromRequest,
  withDeletedAccountClientStateCleared,
} from "../src/lib/server/visitor-data-rights-http.ts";
import { privateJson } from "../src/lib/server/share-link-http.ts";

test("同意写入与注销只接受严格、有限的请求结构", () => {
  assert.deepEqual(
    parseConsentWriteInput({ purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: 0 }),
    { purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: 0 },
  );
  assert.equal(parseConsentWriteInput({ purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: -1 }), null);
  assert.equal(parseConsentWriteInput({ purpose: "ACCOUNT_STORAGE", granted: true, expectedRevision: 0, extra: true }), null);
  assert.deepEqual(parseDeleteVisitorAccountInput({ currentPassphrase: "visitor-passphrase-2026" }), {
    currentPassphrase: "visitor-passphrase-2026",
  });
  assert.equal(parseDeleteVisitorAccountInput({ currentPassphrase: "short" }), null);
  assert.equal(parseDeleteVisitorAccountInput({ currentPassphrase: "visitor-passphrase-2026", confirmation: true }), null);
});

test("数据权利写入仅向存储层传递幂等键哈希", () => {
  const key = "consent-write-2026-0001";
  assert.equal(parseDataRightsIdempotencyKey(key), key);
  assert.match(hashDataRightsIdempotencyKey(key), /^[0-9a-f]{64}$/);

  const accepted = dataRightsIdempotencyFromRequest(new Request("https://tour.example/api/v1/me/consents", {
    headers: { "idempotency-key": key },
  }));
  assert.equal(accepted.ok, true);
  assert.match(accepted.keyHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(accepted).includes(key), false);

  const rejected = dataRightsIdempotencyFromRequest(new Request("https://tour.example/api/v1/me/consents"));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.response.headers.get("cache-control"), "no-store, max-age=0");
});

test("注销成功同时清理浏览器数据和服务端会话 cookie", () => {
  const response = withDeletedAccountClientStateCleared(privateJson({ schemaVersion: 1, state: "ACCOUNT_DELETED" }));
  assert.equal(response.headers.get("clear-site-data"), '"cache", "cookies", "storage"');
  assert.match(response.headers.get("set-cookie") ?? "", /liuzu_visitor_session=/);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});
