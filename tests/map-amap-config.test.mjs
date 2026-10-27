import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AMAP_OFFICIAL_DOCS,
  parseAmapBrowserConfig,
  readAmapBrowserConfig,
} from "../src/lib/amap-config.ts";

const fakeKey = "test_js_key_123456";
const fakeSecurityCode = "test_security_code_123456";

test("高德浏览器能力只读取并返回官方 JS API 所需的两个变量", () => {
  const reads = [];
  const environment = new Proxy({
    AMAP_JS_KEY: fakeKey,
    AMAP_SECURITY_JS_CODE: fakeSecurityCode,
    AMAP_WEB_SERVICE_KEY: "must-not-be-read",
    DATABASE_URL: "must-not-be-read",
  }, {
    get(target, property, receiver) {
      reads.push(String(property));
      return Reflect.get(target, property, receiver);
    },
  });
  const config = readAmapBrowserConfig(environment);
  assert.equal(config.enabled, true);
  assert.deepEqual(reads, ["AMAP_JS_KEY", "AMAP_SECURITY_JS_CODE"]);
  assert.deepEqual(Object.keys(config).sort(), ["coordinateSystem", "enabled", "key", "productionProxyRequired", "provider", "securityJsCode", "securityMode", "version"].sort());
  assert.equal("AMAP_WEB_SERVICE_KEY" in config, false);
});

test("高德配置缺失或格式异常时失败关闭且不返回半份凭据", () => {
  assert.deepEqual(readAmapBrowserConfig({ AMAP_JS_KEY: undefined, AMAP_SECURITY_JS_CODE: undefined }), {
    provider: "amap-jsapi-v2",
    enabled: false,
    reason: "NOT_CONFIGURED",
  });
  assert.deepEqual(readAmapBrowserConfig({ AMAP_JS_KEY: fakeKey, AMAP_SECURITY_JS_CODE: undefined }), {
    provider: "amap-jsapi-v2",
    enabled: false,
    reason: "INVALID_CONFIGURATION",
  });
  assert.equal(parseAmapBrowserConfig({ provider: "amap-jsapi-v2", enabled: true, key: fakeKey, securityJsCode: fakeSecurityCode }), null);
  assert.equal(parseAmapBrowserConfig({ ...readAmapBrowserConfig({ AMAP_JS_KEY: fakeKey, AMAP_SECURITY_JS_CODE: fakeSecurityCode }), extraSecret: "reject" }), null);
});

test("地图配置端点代码具备 no-store 安全头且未引用 Web 服务密钥", async () => {
  const source = await readFile(new URL("../src/app/api/map-config/route.ts", import.meta.url), "utf8");
  assert.match(source, /Cache-Control[\s\S]*no-store/);
  assert.match(source, /X-Content-Type-Options[\s\S]*nosniff/);
  assert.match(source, /AMAP_JS_KEY/);
  assert.match(source, /AMAP_SECURITY_JS_CODE/);
  assert.doesNotMatch(source, /AMAP_WEB_SERVICE_KEY|DATABASE_URL|process\.env\s*\[/);
  assert.ok(Object.values(AMAP_OFFICIAL_DOCS).every((url) => new URL(url).hostname === "lbs.amap.com"));
});
