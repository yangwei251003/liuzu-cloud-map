import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("预览函数固定在香港单地域且保持锁文件安装", () => {
  assert.deepEqual(config.regions, ["hkg1"]);
  assert.equal(config.installCommand, "npm ci");
  assert.equal(config.buildCommand, "npm run build");
});

test("公开页面带有最小安全与权限响应头", () => {
  // Header policy lives in Next so the app and all deployment targets share it.
  // Keep this static: importing next.config would load the developer-only env file.
  assert.match(nextConfigSource, /source: "\/\(\.\*\)"/);
  assert.match(nextConfigSource, /X-Content-Type-Options", value: "nosniff/);
  assert.match(nextConfigSource, /Referrer-Policy", value: "strict-origin-when-cross-origin/);
  assert.match(nextConfigSource, /X-Frame-Options", value: "DENY/);
  assert.match(nextConfigSource, /Strict-Transport-Security", value: "max-age=31536000; includeSubDomains/);
  assert.match(nextConfigSource, /X-DNS-Prefetch-Control", value: "off/);
  assert.match(nextConfigSource, /Permissions-Policy", value: "camera=\(\), microphone=\(\), geolocation=\(self\)/);
});
