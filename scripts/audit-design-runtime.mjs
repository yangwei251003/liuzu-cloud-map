import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

const baseURL = process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:3212";
const outputFile = process.env.DESIGN_AUDIT_OUTPUT ?? "output/design-previews/runtime-audit.json";
const routes = [
  "/", "/account", "/admin", "/admin/readiness", "/admin/map-editor", "/arrival",
  "/cloud-tour", "/guide?demo=1&stops=guoen-temple,thousand-year-lychee,longtan-lake",
  "/guide/ask?spot=guoen-temple", "/journey", "/journey/knowledge", "/map", "/plan",
  "/privacy", "/share",
];
const viewports = [
  { id: "desktop", width: 1440, height: 960 },
  { id: "mobile", width: 390, height: 844 },
];

function resolveExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

const executablePath = resolveExecutable();
if (!executablePath) throw new Error("No Chromium-compatible browser is available.");

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
      colorScheme: "light",
      deviceScaleFactor: 1,
    });
    for (const route of routes) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      const response = await page.goto(new URL(route, baseURL).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(800);
      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        };
        const label = (element) => (
          element.getAttribute("aria-label")
          ?? element.textContent
          ?? element.getAttribute("name")
          ?? element.id
          ?? element.tagName
        ).trim().replace(/\s+/g, " ").slice(0, 120);
        const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"]')]
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, label: label(element), width: Math.round(rect.width), height: Math.round(rect.height) };
          });
        const smallTargets = interactive.filter((item) => item.width < 44 || item.height < 44);
        const tinyText = [...document.querySelectorAll("body *")]
          .filter((element) => visible(element) && element.children.length === 0 && (element.textContent ?? "").trim())
          .map((element) => ({
            tag: element.tagName,
            text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          }))
          .filter((item) => item.fontSize < 12)
          .slice(0, 20);
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          interactiveCount: interactive.length,
          smallTargets: smallTargets.slice(0, 30),
          tinyText,
          h1Count: document.querySelectorAll("h1").length,
          unlabeledImages: [...document.querySelectorAll("img")].filter((image) => !image.hasAttribute("alt")).length,
        };
      });
      results.push({ viewport: viewport.id, route, status: response?.status() ?? null, consoleErrors, ...metrics });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const summary = {
  auditedAt: new Date().toISOString(),
  baseURL,
  executablePath,
  routes: results.length,
  horizontalOverflowCount: results.filter((item) => item.horizontalOverflow).length,
  smallTargetCount: results.reduce((total, item) => total + item.smallTargets.length, 0),
  tinyTextCount: results.reduce((total, item) => total + item.tinyText.length, 0),
  missingH1Count: results.filter((item) => item.h1Count === 0).length,
  unlabeledImageCount: results.reduce((total, item) => total + item.unlabeledImages, 0),
  results,
};

await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  routes: summary.routes,
  horizontalOverflowCount: summary.horizontalOverflowCount,
  smallTargetCount: summary.smallTargetCount,
  tinyTextCount: summary.tinyTextCount,
  missingH1Count: summary.missingH1Count,
  unlabeledImageCount: summary.unlabeledImageCount,
})}\n`);
