import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { IncrementalSha256, sha256ReadableStream } from "../src/lib/incremental-sha256.ts";

function expected(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("incremental SHA-256 matches standard vectors across arbitrary chunk boundaries", () => {
  for (const value of [
    new Uint8Array(),
    new TextEncoder().encode("abc"),
    randomBytes(55),
    randomBytes(56),
    randomBytes(63),
    randomBytes(64),
    randomBytes(65),
    randomBytes(1024 * 1024 + 17),
  ]) {
    const hasher = new IncrementalSha256();
    let offset = 0;
    let chunk = 1;
    while (offset < value.byteLength) {
      const end = Math.min(value.byteLength, offset + chunk);
      hasher.update(value.subarray(offset, end));
      offset = end;
      chunk = (chunk * 7) % 131 || 1;
    }
    assert.equal(hasher.digestHex(), expected(value));
    assert.equal(hasher.digestHex(), expected(value));
    assert.throws(() => hasher.update(new Uint8Array([1])), /finalized/);
  }
});

test("streaming SHA-256 counts chunks and rejects bytes beyond the signed limit", async () => {
  const bytes = randomBytes(1001);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 3));
      controller.enqueue(bytes.subarray(3, 777));
      controller.enqueue(bytes.subarray(777));
      controller.close();
    },
  });
  const result = await sha256ReadableStream(stream, bytes.byteLength);
  assert.deepEqual(result, { bytes: bytes.byteLength, sha256: expected(bytes) });

  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(11));
      controller.close();
    },
  });
  await assert.rejects(sha256ReadableStream(oversized, 10), /too_large/);
});
