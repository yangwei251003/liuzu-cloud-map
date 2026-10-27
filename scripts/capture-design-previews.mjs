import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:3212";
const outputRoot = path.resolve(process.env.PREVIEW_OUTPUT_DIR ?? "output/design-previews");

const routes = [
  ["home", "/", "首页"],
  ["map", "/map", "游客地图"],
  ["plan", "/plan", "路线规划"],
  ["journey", "/journey", "我的行程"],
  ["knowledge", "/journey/knowledge", "知识收藏"],
  ["cloud-tour", "/cloud-tour", "线上云游"],
  ["arrival", "/arrival", "到达准备"],
  ["guide", "/guide?demo=1&stops=guoen-temple,thousand-year-lychee,longtan-lake", "现场导览"],
  ["guide-ask", "/guide/ask?spot=guoen-temple", "AI问答"],
  ["account", "/account", "账户"],
  ["privacy", "/privacy", "隐私与数据"],
  ["share", "/share", "路线分享"],
  ["admin", "/admin", "运营后台"],
  ["readiness", "/admin/readiness", "准备度"],
  ["map-editor", "/admin/map-editor", "地图编辑器"],
];

const viewports = [
  { id: "desktop", label: "网页端 1440 x 960", width: 1440, height: 960, isMobile: false, hasTouch: false },
  { id: "mobile", label: "App端 390 x 844", width: 390, height: 844, isMobile: true, hasTouch: true },
];

function resolveExecutable() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const candidates = [
    configured,
    chromium.executablePath(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

await mkdir(outputRoot, { recursive: true });

const executablePath = resolveExecutable();
if (!executablePath) {
  throw new Error("No Chromium-compatible browser is available for preview capture.");
}

const browser = await chromium.launch({ executablePath, headless: true });
const summary = {
  capturedAt: new Date().toISOString(),
  baseURL,
  executablePath,
  captures: [],
};

try {
  for (const viewport of viewports) {
    const directory = path.join(outputRoot, viewport.id);
    await mkdir(directory, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
      colorScheme: "light",
      deviceScaleFactor: 1,
    });

    for (const [slug, route, label] of routes) {
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const startedAt = Date.now();
      let status = null;
      let error = null;
      try {
        const response = await page.goto(new URL(route, baseURL).href, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        status = response?.status() ?? null;
        await page.waitForTimeout(1_200);
        if (slug === "home") {
          await page.locator("#map").scrollIntoViewIfNeeded();
          await page.locator(".maplibregl-canvas").waitFor({ state: "visible", timeout: 30_000 });
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.waitForTimeout(300);
        }
        if (slug === "map") {
          await page.locator('[data-map-load-status="ready"]').waitFor({ state: "visible", timeout: 30_000 });
        }
        await page.screenshot({
          path: path.join(directory, `${slug}.png`),
          fullPage: true,
          animations: "disabled",
        });
      } catch (captureError) {
        error = captureError instanceof Error ? captureError.message : String(captureError);
      } finally {
        await page.close();
      }

      summary.captures.push({
        viewport: viewport.id,
        label,
        route,
        file: `${viewport.id}/${slug}.png`,
        status,
        durationMs: Date.now() - startedAt,
        consoleErrors,
        pageErrors,
        error,
      });
    }

    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const groups = viewports
  .map((viewport) => {
    const items = summary.captures
      .filter((capture) => capture.viewport === viewport.id)
      .map(
        (capture) => `<article>
          <a href="${escapeHtml(capture.file)}"><img src="${escapeHtml(capture.file)}" alt="${escapeHtml(capture.label)} ${escapeHtml(viewport.label)}预览"></a>
          <h2>${escapeHtml(capture.label)}</h2>
          <p>${escapeHtml(capture.route)} · HTTP ${capture.status ?? "无响应"}</p>
        </article>`,
      )
      .join("\n");
    return `<section><h1>${escapeHtml(viewport.label)}</h1><div class="grid">${items}</div></section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>六祖云游双端页面预览</title>
<style>
  :root { color-scheme: light; font-family: "Microsoft YaHei UI", system-ui, sans-serif; background: #f2f4f0; color: #143c32; }
  body { margin: 0; padding: 32px; }
  section { max-width: 1500px; margin: 0 auto 64px; }
  h1 { font-size: 28px; margin: 0 0 24px; }
  h2 { font-size: 16px; margin: 12px 0 4px; }
  p { margin: 0; color: #46645c; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; align-items: start; }
  article { min-width: 0; }
  img { display: block; width: 100%; height: 360px; object-fit: cover; object-position: top; background: #dfe7e2; border: 1px solid #c6d3cc; border-radius: 16px; }
  a:focus-visible { outline: 3px solid #9a6d24; outline-offset: 4px; border-radius: 16px; }
</style>
<body>${groups}</body>
</html>`;

await writeFile(path.join(outputRoot, "index.html"), html, "utf8");

const failures = summary.captures.filter(
  (capture) => capture.error || capture.pageErrors.length > 0 || (capture.status !== null && capture.status >= 400),
);

process.stdout.write(
  `${summary.captures.length} previews captured in ${outputRoot}. ${failures.length} blocking capture failure(s).\n`,
);
if (failures.length > 0) process.exitCode = 1;
