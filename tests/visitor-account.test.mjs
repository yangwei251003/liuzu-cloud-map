import assert from "node:assert/strict";
import test from "node:test";
import {
  VISITOR_SCENIC_AREA_ID,
  normalizeVisitorHandle,
  parseVisitorApiError,
  parseVisitorSessionResponse,
  validateVisitorCredentials,
} from "../src/lib/visitor-account.ts";

const visitor = {
  subject: "visitor:liuzu-town:6f7056a0-e415-4d46-92cf-c4e697809154",
  scenicAreaId: VISITOR_SCENIC_AREA_ID,
  handle: "quiet_walker",
};

test("visitor session parser accepts me and login envelopes but rejects extra fields", () => {
  assert.deepEqual(parseVisitorSessionResponse({ schemaVersion: 1, visitor }), {
    schemaVersion: 1,
    visitor,
    expiresAt: null,
  });
  const expiresAt = "2026-09-14T08:00:00.000Z";
  assert.deepEqual(parseVisitorSessionResponse({ schemaVersion: 1, visitor, expiresAt }), {
    schemaVersion: 1,
    visitor,
    expiresAt,
  });
  assert.equal(parseVisitorSessionResponse({ schemaVersion: 1, visitor, unexpected: true }), null);
  assert.equal(parseVisitorSessionResponse({ schemaVersion: 1, visitor: { ...visitor, handle: "Bad Handle" } }), null);
});

test("visitor API errors are strict and do not expose guessed account details", () => {
  assert.deepEqual(
    parseVisitorApiError({ error: { code: "AUTH_REJECTED", message: "无法完成登录。", retryable: false } }),
    { code: "AUTH_REJECTED", message: "无法完成登录。", retryable: false },
  );
  assert.equal(parseVisitorApiError({ error: { code: "AUTH_REJECTED", message: "失败", retryable: false, handleExists: true } }), null);
});

test("credentials normalize the handle and enforce a long passphrase", () => {
  assert.equal(normalizeVisitorHandle(" Quiet_Walker "), "quiet_walker");
  assert.equal(validateVisitorCredentials("quiet_walker", "short").ok, false);
  assert.deepEqual(validateVisitorCredentials(" Quiet_Walker ", "a private phrase with length"), {
    ok: true,
    credentials: {
      scenicAreaId: VISITOR_SCENIC_AREA_ID,
      handle: "quiet_walker",
      passphrase: "a private phrase with length",
    },
  });
});
