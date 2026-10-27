import assert from "node:assert/strict";
import test from "node:test";
import { privateJson, readJsonBody } from "../src/lib/server/share-link-http.ts";

test("JSON reader accepts a small UTF-8 object", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "六祖镇" }),
  });
  assert.deepEqual(await readJsonBody(request), { ok: true, value: { title: "六祖镇" } });
});

test("JSON reader rejects wrong media type, malformed JSON and declared oversize", async () => {
  const wrongType = await readJsonBody(new Request("https://example.test", { method: "POST", body: "{}" }));
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.response.status, 415);

  const malformed = await readJsonBody(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.response.status, 400);

  const declaredOversize = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "20000" },
    body: "{}",
  }));
  assert.equal(declaredOversize.ok, false);
  assert.equal(declaredOversize.response.status, 413);
});

test("stream reader stops an undeclared oversized body and private responses forbid caching", async () => {
  const oversized = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(20_000) }),
  }));
  assert.equal(oversized.ok, false);
  assert.equal(oversized.response.status, 413);

  const response = privateJson({ ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("JSON reader can enforce the smaller share-resolve body limit", async () => {
  const response = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "a".repeat(600) }),
  }), 512);
  assert.equal(response.ok, false);
  assert.equal(response.response.status, 413);
});
