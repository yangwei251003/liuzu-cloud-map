import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(process.cwd());
const actionNames = ["greeting", "answering", "walking", "reading", "resting"];

async function dataUrl(filePath: string, mimeType: string) {
  const bytes = await readFile(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

test("绿幕派生动作在白色、深松绿和地图背景上保持干净边缘", async ({ page }) => {
  const actions = await Promise.all(actionNames.map(async (name) => ({
    name,
    src: await dataUrl(path.join(appRoot, "public", "assets", "chanxiaoli", "v1", `${name}.webp`), "image/webp"),
  })));
  const actionMarkup = (background: "white" | "pine" | "map") => actions.map((action) => `
    <figure class="tile ${background}">
      <img src="${action.src}" alt="${action.name}" />
      <figcaption>${action.name}</figcaption>
    </figure>
  `).join("");

  await page.setViewportSize({ width: 1500, height: 1180 });
  await page.setContent(`<!doctype html>
    <html lang="zh-CN"><head><meta charset="utf-8" /><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; color: #173f35; background: #eee7da; font-family: sans-serif; }
      h1 { margin: 0 0 22px; font-size: 24px; }
      h2 { margin: 22px 0 10px; font-size: 15px; letter-spacing: .08em; }
      .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
      .tile { position: relative; height: 300px; margin: 0; overflow: hidden; border: 1px solid rgba(23,63,53,.18); }
      .tile.white { background: #fff; }
      .tile.pine { background: #123c32; }
      .tile.map {
        background-color: #d8e2cf;
        background-image:
          radial-gradient(circle at 18% 24%, rgba(91, 127, 89, .56) 0 7%, transparent 7.5%),
          radial-gradient(circle at 76% 72%, rgba(91, 127, 89, .48) 0 10%, transparent 10.5%),
          linear-gradient(28deg, transparent 0 42%, rgba(250, 245, 226, .96) 42.5% 47%, rgba(139, 114, 78, .5) 47.5% 48.5%, transparent 49% 100%),
          linear-gradient(-17deg, transparent 0 57%, rgba(250, 245, 226, .92) 57.5% 63%, rgba(139, 114, 78, .42) 63.5% 64%, transparent 64.5% 100%),
          repeating-linear-gradient(112deg, rgba(31, 80, 67, .08) 0 1px, transparent 1px 18px);
      }
      img { display: block; width: 100%; height: 270px; object-fit: contain; filter: drop-shadow(0 12px 12px rgba(12,30,24,.22)); }
      figcaption { position: absolute; inset: auto 8px 7px; padding: 3px 6px; background: rgba(255,250,240,.88); font-size: 11px; }
    </style></head><body>
      <h1>禅小荔绿幕派生动作三背景边缘复核</h1>
      <h2>WHITE</h2><div class="grid">${actionMarkup("white")}</div>
      <h2>DEEP PINE</h2><div class="grid">${actionMarkup("pine")}</div>
      <h2>MAP TEXTURE · SYNTHETIC CSS FIXTURE</h2><div class="grid">${actionMarkup("map")}</div>
    </body></html>`);

  await expect(page.getByRole("img")).toHaveCount(15);
  await expect.poll(() => page.getByRole("img").evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
  )).toBe(true);
  await expect(page.locator(".tile.map").first()).not.toHaveCSS("background-image", "none");
  await page.screenshot({ path: "test-results/chanxiaoli-transparent-backgrounds.png", fullPage: true });
});
