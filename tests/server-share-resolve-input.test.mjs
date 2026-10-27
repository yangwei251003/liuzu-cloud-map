import assert from "node:assert/strict";
import test from "node:test";
import { parseShareResolveInput } from "../src/lib/server/share-link-resolve.ts";

const token = "a".repeat(43);

test("server-share resolve input accepts exactly one bounded opaque token field", () => {
  assert.deepEqual(parseShareResolveInput({ token }), { token });
  assert.equal(parseShareResolveInput({ token, extra: true }), null);
  assert.equal(parseShareResolveInput({ token: "short" }), null);
  assert.equal(parseShareResolveInput({}), null);
  assert.equal(parseShareResolveInput([token]), null);
});
