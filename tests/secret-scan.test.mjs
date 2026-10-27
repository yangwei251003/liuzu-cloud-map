import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scannerUrl = new URL("../scripts/secret-scan.mjs", import.meta.url);

test("secret scanner excludes .env contents and never prints matched values", async () => {
  const source = await readFile(scannerUrl, "utf8");
  assert.match(source, /\.env/);
  assert.match(source, /Values are deliberately not printed/);
  assert.match(source, /git", \["ls-files", "-co", "--exclude-standard", "-z"\]/);
  assert.doesNotMatch(source, /console\.log\(match\[1\]/);
});
