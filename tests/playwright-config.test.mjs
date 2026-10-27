import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("isolated local release candidates can reuse an explicitly started server", async () => {
  const source = await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8");
  assert.match(source, /PLAYWRIGHT_SKIP_WEBSERVER === "1"/);
  assert.match(source, /usesRemotePreview \|\| usesExternallyStartedServer/);
  assert.match(source, /serviceWorkers: "block"/);
});
