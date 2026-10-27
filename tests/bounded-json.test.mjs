import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJson } from "../src/lib/server/bounded-json.ts";

test("bounded JSON accepts small UTF-8 and rejects wrong media type", async () => {
  const valid = await readBoundedJson(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ question: "国恩寺" }),
  }), 1_024);
  assert.deepEqual(valid, { ok: true, value: { question: "国恩寺" } });
  assert.deepEqual(await readBoundedJson(new Request("https://example.test", { method: "POST", body: "{}" }), 1_024), { ok: false, code: "INVALID_CONTENT_TYPE" });
});

test("bounded JSON stops declared and streamed oversized requests", async () => {
  const declared = await readBoundedJson(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "999" },
    body: "{}",
  }), 32);
  assert.deepEqual(declared, { ok: false, code: "PAYLOAD_TOO_LARGE" });
  const streamed = await readBoundedJson(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(2_000) }),
  }), 64);
  assert.deepEqual(streamed, { ok: false, code: "PAYLOAD_TOO_LARGE" });
});

test("bounded JSON rejects malformed input and invalid limits", async () => {
  assert.deepEqual(await readBoundedJson(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), 64), { ok: false, code: "INVALID_JSON" });
  await assert.rejects(() => readBoundedJson(new Request("https://example.test"), 0), /invalid_json_body_limit/);
});
