import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3212";
const usesRemotePreview = /^https?:\/\//.test(baseURL) && !baseURL.includes("127.0.0.1") && !baseURL.includes("localhost");
const localWebServerPort = new URL(baseURL).port || "3212";
// A release-candidate build may run on an isolated local port while an
// interactive preview owns the default one. The caller is responsible for
// starting that exact candidate server before opting out of webServer.
const usesExternallyStartedServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/playwright-results.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results/playwright-artifacts",
  use: {
    baseURL,
    // Service-worker behavior is covered separately. Blocking it here keeps
    // browser API mocks deterministic and prevents a prior candidate's worker
    // from bypassing Playwright route handlers.
    serviceWorkers: "block",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : { channel: "chrome" },
  },
  webServer: usesRemotePreview || usesExternallyStartedServer
    ? undefined
    : {
        // Keep the managed server on the same isolated local port as baseURL.
        // This prevents a developer preview on the default port from being
        // mistaken for the release candidate under browser test.
        command: `npm run start -- --hostname 127.0.0.1 --port ${localWebServerPort}`,
        url: `http://127.0.0.1:${localWebServerPort}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
