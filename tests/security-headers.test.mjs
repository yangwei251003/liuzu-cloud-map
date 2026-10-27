import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nextConfigUrl = new URL("../next.config.ts", import.meta.url);
const vercelConfigUrl = new URL("../vercel.json", import.meta.url);

test("sensitive pages and APIs use centralized network-only, no-referrer headers", async () => {
  const source = await readFile(nextConfigUrl, "utf8");
  assert.match(source, /async headers\(\)/);
  assert.match(source, /source: "\/share"/);
  assert.match(source, /source: "\/account\/:path\*"/);
  assert.match(source, /source: "\/admin\/:path\*"/);
  assert.match(source, /source: "\/api\/:path\*"/);
  assert.match(source, /private, no-store, no-cache, max-age=0, must-revalidate/);
  assert.match(source, /Referrer-Policy", value: "no-referrer/);
  assert.match(source, /X-Robots-Tag", value: "noindex, nofollow, noarchive/);
  assert.match(source, /base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'/);
});

test("Vercel configuration delegates security headers to Next so they cannot drift", async () => {
  const config = JSON.parse(await readFile(vercelConfigUrl, "utf8"));
  assert.equal("headers" in config, false);
});
