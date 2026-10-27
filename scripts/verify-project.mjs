import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const npmCli = process.env.npm_execpath;
const releaseMode = process.argv.includes("--release");
const checks = ["security:secrets", "lint", "typecheck", "test", "build"];
const startedAt = new Date().toISOString();
const summaryPath = path.join(process.cwd(), "test-results", "release-gate-summary.json");
const summary = {
  schemaVersion: 1,
  mode: releaseMode ? "release" : "demo",
  startedAt,
  finishedAt: null,
  outcome: "running",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    npm: commandOutput(process.execPath, [npmCli ?? "", "--version"]),
    gitCommit: commandOutput("git", ["rev-parse", "HEAD"]),
    packageLockSha256: fileSha256(path.join(process.cwd(), "package-lock.json")),
    ci: Boolean(process.env.CI),
  },
  browser: null,
  checks: [],
};

function commandOutput(command, argumentsList) {
  try {
    return execFileSync(command, argumentsList, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function fileSha256(filePath) {
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

if (!npmCli) {
  throw new Error("Run this verifier through `npm run verify` or `npm run verify:release` so npm can expose its CLI path.");
}

function writeSummary(outcome) {
  summary.finishedAt = new Date().toISOString();
  summary.outcome = outcome;
  mkdirSync(path.dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function fail(message, status = 1) {
  process.stderr.write(`\n[verify${releaseMode ? ":release" : ""}] ${message}\n`);
  writeSummary("failed");
  process.exit(status);
}

function runNpmScript(name, env = process.env) {
  process.stdout.write(`\n[verify${releaseMode ? ":release" : ""}] npm run ${name}\n`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [npmCli, "run", name], {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });
  const record = {
    name,
    status: result.status === 0 && !result.error ? "passed" : "failed",
    durationMs: Date.now() - started,
  };
  summary.checks.push(record);
  if (result.error) fail(`${name} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${name} failed with exit code ${result.status ?? "unknown"}.`, result.status ?? 1);
}

async function bundledChromiumPath() {
  try {
    const { chromium } = await import("@playwright/test");
    return chromium.executablePath();
  } catch {
    return null;
  }
}

async function ensureChromium() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) {
    const resolved = path.resolve(configured);
    if (existsSync(resolved)) return { source: "configured", executablePath: resolved };
    process.stderr.write(`[verify:release] configured browser does not exist: ${resolved}\n`);
  }

  const bundledBefore = await bundledChromiumPath();
  if (bundledBefore && existsSync(bundledBefore)) return { source: "playwright", executablePath: bundledBefore };

  process.stdout.write("\n[verify:release] Chromium is missing; installing the Playwright Chromium runtime.\n");
  const installArgs = ["exec", "--", "playwright", "install"];
  if (process.platform === "linux" && process.env.CI) installArgs.push("--with-deps");
  installArgs.push("chromium");
  const install = spawnSync(process.execPath, [npmCli, ...installArgs], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (install.error || install.status !== 0) {
    const reason = install.error?.message ?? `exit code ${install.status ?? "unknown"}`;
    throw new Error(
      `Playwright Chromium bootstrap failed (${reason}). Run \`npm exec -- playwright install chromium\` ` +
      "(Linux CI: add `--with-deps`) or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an existing absolute path.",
    );
  }

  const bundledAfter = await bundledChromiumPath();
  if (!bundledAfter || !existsSync(bundledAfter)) {
    throw new Error(
      "Playwright reported a successful Chromium install but its executable is still missing. " +
      "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a verified browser path and rerun.",
    );
  }
  return { source: "playwright-installed", executablePath: bundledAfter };
}

for (const check of checks) runNpmScript(check);

if (releaseMode) {
  runNpmScript("test:db");
  let browser;
  try {
    browser = await ensureChromium();
  } catch (error) {
    summary.checks.push({
      name: "browser-bootstrap",
      status: "failed",
      durationMs: 0,
      message: error instanceof Error ? error.message : String(error),
    });
    fail(error instanceof Error ? error.message : String(error));
  }
  summary.browser = { source: browser.source, executablePath: browser.executablePath };
  summary.checks.push({ name: "browser-bootstrap", status: "passed", durationMs: 0 });
  runNpmScript("test:e2e", {
    ...process.env,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: browser.executablePath,
  });
  runNpmScript("product:readiness");
  // This must be last: it writes the complete evidence summary and fails closed
  // for any non-PASS P0 item or still-open external release blocker.
  runNpmScript("p0:release-evidence");
}

writeSummary("passed");
process.stdout.write(`\n[verify${releaseMode ? ":release" : ""}] all checks passed\n`);
process.stdout.write(`[verify${releaseMode ? ":release" : ""}] summary: ${summaryPath}\n`);
