import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const verifierUrl = new URL("../scripts/verify-project.mjs", import.meta.url);

test("demo verification records reproducibility and release verification adds true DB plus strict evidence", async () => {
  const source = await readFile(verifierUrl, "utf8");
  assert.match(source, /"security:secrets", "lint", "typecheck", "test", "build"/);
  assert.match(source, /gitCommit/);
  assert.match(source, /packageLockSha256/);
  assert.match(source, /runNpmScript\("test:db"\)/);
  assert.match(source, /runNpmScript\("product:readiness"\)/);
  assert.match(source, /runNpmScript\("p0:release-evidence"\)/);
});
