import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = appRoot;
const publicImages = path.join(appRoot, "public", "assets", "images");
const heroPath = path.join(publicImages, "liuzu-journey-hero-ai-v1.png");

test("public assets exclude unresolved legacy brand and character copies", async () => {
  for (const name of ["brand-logo.png", "chanxiaoli-character.png", "icon-192.png", "icon-512.png"]) {
    await assert.rejects(stat(path.join(publicImages, name)), { code: "ENOENT" });
  }
});

test("original generated hero remains traceable and publicly disclosed", async () => {
  const bytes = await readFile(heroPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), "ECF1AA51494DFF9B89FED30A10D3A2AFE430F5CEF1DD84BE5D184B70B766A3AA");
  assert.ok(bytes.byteLength > 0);

  // The visual shell is deliberately split from HomeExperience's route-planning
  // state. Assert disclosure at the component that actually owns the media.
  const home = await readFile(path.join(appRoot, "src", "components", "HomeReferenceExperience.tsx"), "utf8");
  assert.match(home, /liuzu-journey-hero-ai-v1\.png/);
  assert.match(home, /className=\{styles\.heroWash\}/);
  assert.match(home, /aria-hidden="true"/);
  assert.match(home, /景区实景、宣传影像与旅行灵感轮播/);

  const promotionRegistry = await readFile(path.join(appRoot, "src", "lib", "promotion-media.ts"), "utf8");
  assert.doesNotMatch(promotionRegistry, /AI 原创宣传画|\/assets\/promotions\//);

  const registry = await readFile(path.join(workspaceRoot, "project-intelligence", "assets", "资产登记表.md"), "utf8");
  assert.match(registry, /AST-0003/);
  assert.match(registry, /ECF1AA51494DFF9B89FED30A10D3A2AFE430F5CEF1DD84BE5D184B70B766A3AA/);
});
