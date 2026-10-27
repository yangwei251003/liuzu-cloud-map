import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LIUZU_BRAND_ASSETS } from "../src/lib/brand-assets.ts";
import {
  SCENIC_IMAGE_ASSETS,
  SCENIC_SPOT_IDS,
  SCENIC_SPOT_MEDIA,
  getScenicSpotImage,
} from "../src/lib/scenic-image-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function publicAssetPath(src) {
  return path.join(projectRoot, "public", src.replace(/^\//, ""));
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

test("未核验品牌仅保留来源记录，不随公开包分发", async () => {
  for (const asset of [LIUZU_BRAND_ASSETS.source, LIUZU_BRAND_ASSETS.symbol, LIUZU_BRAND_ASSETS.lockup]) {
    await assert.rejects(readFile(publicAssetPath(asset.src)), { code: "ENOENT" });
  }
  assert.equal(LIUZU_BRAND_ASSETS.rights.status, "USER_SUPPLIED_PROTOTYPE_ONLY");
});

test("所有可交付景区媒体文件、哈希、来源与开放许可保持闭环", async () => {
  for (const asset of Object.values(SCENIC_IMAGE_ASSETS)) {
    if (!asset.publishable) {
      await assert.rejects(readFile(publicAssetPath(asset.src)), { code: "ENOENT" });
      continue;
    }
    if (asset.license.startsWith("CC BY")) {
      assert.match(asset.sourcePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.match(asset.sourceOriginalUrl, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
    } else {
      assert.equal(asset.license, "用户提供授权素材");
      assert.equal(asset.sourcePage, "/privacy");
      assert.match(asset.sourceOriginalUrl, /^local-user-material:/);
    }
    assert.equal(await sha256(publicAssetPath(asset.src)), asset.sha256);
    if (asset.originalSrc) {
      assert.ok(asset.originalSha256);
      assert.equal(await sha256(publicAssetPath(asset.originalSrc)), asset.originalSha256);
    } else if (asset.license.startsWith("CC BY")) {
      assert.equal(asset.originalSha256, null);
    } else {
      assert.match(asset.originalSha256, /^[a-f0-9]{64}$/);
    }
  }
});

test("景点选择默认只返回精确照片，不把区域语境冒充景点", () => {
  const exact = getScenicSpotImage("guoen-temple");
  assert.equal(exact?.relation, "EXACT_SPOT");
  assert.deepEqual(exact?.asset.exactSpotIds, ["guoen-temple"]);
  assert.equal(exact?.disclosure, null);

  for (const spotId of ["huineng-residence", "longshan-spring", "chanyu-town", "zangfo-valley"]) {
    assert.equal(getScenicSpotImage(spotId), null);
    const selected = getScenicSpotImage(spotId, { allowContextual: true });
    assert.equal(selected?.relation, "CONTEXT_ONLY");
    assert.deepEqual(selected?.asset.exactSpotIds, []);
    assert.match(selected?.disclosure, /非本景点/);
    assert.equal(selected?.asset.publishable, true);
  }

  for (const asset of Object.values(SCENIC_IMAGE_ASSETS).filter(({ subjectLabel }) => subjectLabel.includes("天露山"))) {
    assert.deepEqual(asset.exactSpotIds, []);
    assert.match(asset.restriction, /不得标成六祖镇|never label/i);
  }
});

test("五个 spotId 均有显式覆盖状态，缺图不会静默降级", () => {
  assert.deepEqual(Object.keys(SCENIC_SPOT_MEDIA).sort(), [...SCENIC_SPOT_IDS].sort());
  assert.equal(SCENIC_SPOT_MEDIA["guoen-temple"].status, "EXACT_LICENSED");
  assert.equal(SCENIC_SPOT_MEDIA["huineng-residence"].status, "CONTEXT_ONLY");
  assert.equal(SCENIC_SPOT_MEDIA["zangfo-valley"].status, "CONTEXT_ONLY");
  assert.equal(SCENIC_SPOT_MEDIA["longshan-spring"].status, "CONTEXT_ONLY");
  assert.equal(SCENIC_SPOT_MEDIA["chanyu-town"].status, "CONTEXT_ONLY");
});
