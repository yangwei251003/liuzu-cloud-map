import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import manifest from "../src/app/manifest.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pngDimensions(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("PWA manifest has a stable identity, install scope and standard PNG icons", async () => {
  const value = manifest();
  assert.equal(value.id, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.start_url, "/");
  assert.equal(value.display, "standalone");
  assert.equal(value.lang, "zh-CN");
  assert.equal(value.prefer_related_applications, false);

  const requiredIcons = [
    ["/icons/icon-192.png", 192, "any"],
    ["/icons/icon-512.png", 512, "any"],
    ["/icons/maskable-512.png", 512, "maskable"],
  ];
  for (const [src, size, purpose] of requiredIcons) {
    assert.ok(value.icons?.some((icon) => icon.src === src && icon.sizes === `${size}x${size}` && icon.type === "image/png" && icon.purpose === purpose));
    const buffer = await readFile(path.join(projectRoot, "public", src.slice(1)));
    assert.deepEqual(pngDimensions(buffer), { width: size, height: size });
  }
  assert.deepEqual(value.shortcuts?.map(({ url }) => url), ["/map", "/plan", "/privacy"]);
});
test("iOS touch icon is a real 180px PNG and root metadata opts into safe-area standalone display", async () => {
  const icon = await readFile(path.join(projectRoot, "public", "icons", "apple-touch-icon-180.png"));
  assert.deepEqual(pngDimensions(icon), { width: 180, height: 180 });
  const layout = await readFile(path.join(projectRoot, "src", "app", "layout.tsx"), "utf8");
  assert.match(layout, /apple-touch-icon-180\.png/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /viewportFit: "cover"/);
});

test("install prompt supports browser install and iOS instructions without requesting device permissions", async () => {
  const source = await readFile(path.join(projectRoot, "src", "components", "PwaInstallPrompt.tsx"), "utf8");
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /添加到主屏幕/);
  assert.match(source, /正式离线导航仍未开放/);
  assert.match(source, /display-mode: standalone/);
  assert.doesNotMatch(source, /geolocation|getUserMedia|requestPermission/);
  assert.match(source, /pathname\.startsWith\("\/account"\)/);
  assert.match(source, /pathname\.startsWith\("\/share"\)/);
});
