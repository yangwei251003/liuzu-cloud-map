import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = path.join(projectRoot, "mobile", "android-web-shell");

const readAndroid = (relative) => readFile(path.join(androidRoot, relative), "utf8");

test("Android preview shell requests internet only and rejects cleartext traffic", async () => {
  const manifest = await readAndroid("app/src/main/AndroidManifest.xml");
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(permissions, ["android.permission.INTERNET"]);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|CAMERA|RECORD_AUDIO/);
  const security = await readAndroid("app/src/main/res/xml/network_security_config.xml");
  assert.match(security, /cleartextTrafficPermitted="false"/);
});

test("Android WebView has no JavaScript bridge and pins top-level navigation to one HTTPS host", async () => {
  const activity = await readAndroid("app/src/main/java/cn/yunyoumap/liuzu/preview/MainActivity.java");
  assert.match(activity, /"https"\.equals\(configuredUri\.getScheme\(\)\)/);
  assert.match(activity, /allowedHost\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(activity, /setAllowFileAccess\(false\)/);
  assert.match(activity, /setAllowContentAccess\(false\)/);
  assert.match(activity, /setGeolocationEnabled\(false\)/);
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /handler\.cancel\(\)/);
  assert.doesNotMatch(activity, /addJavascriptInterface|onGeolocationPermissionsShowPrompt/);
  assert.match(activity, /R\.string\.release_boundary/);
  const strings = await readAndroid("app/src/main/res/values/strings.xml");
  assert.match(strings, /公开测试候选 · 真实景区内部导航未放行/);
});

test("Android package injects a validated HTTPS Preview URL and includes a non-empty icon", async () => {
  const build = await readAndroid("app/build.gradle.kts");
  assert.match(build, /gradleProperty\("webAppUrl"\)/);
  assert.match(build, /webAppUrl is required/);
  assert.doesNotMatch(build, /\.orElse\(|liuzu-cloud-tour-preview\.vercel\.app/);
  assert.match(build, /require\(configuredWebAppUrl\.startsWith\("https:\/\/"\)\)/);
  assert.match(build, /buildConfigField\("String", "WEB_APP_URL"/);
  const icon = await stat(path.join(androidRoot, "app/src/main/res/drawable/app_icon.png"));
  assert.ok(icon.isFile() && icon.size > 1000);
});

test("mobile delivery states that iOS IPA requires macOS signing and keeps PWA as current iPhone package", async () => {
  const [rootReadme, iosReadme] = await Promise.all([
    readFile(path.join(projectRoot, "mobile", "README.md"), "utf8"),
    readFile(path.join(projectRoot, "mobile", "ios", "README.md"), "utf8"),
  ]);
  assert.match(rootReadme, /PWA（Android 与 iPhone）/);
  assert.match(iosReadme, /Windows 不能构建、签名或真机验证 iOS IPA/);
  assert.match(iosReadme, /添加到主屏幕/);
  assert.doesNotMatch(iosReadme, /已经生成.*IPA|IPA 已通过/);
});
