import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredPath = /(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|\.git|%USERPROFILE%|\.npm-cache|\.playwright-cli)(?:\/|$)/i;
const assignmentPattern = /(?:api[_-]?key|client[_-]?secret|private[_-]?key|password|passphrase|token)\s*[:=]\s*["'`]([A-Za-z0-9_\-/+=]{20,})["'`]/gi;
const pemPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g;

function listFiles() {
  const output = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return output.toString("utf8").split("\0").filter(Boolean).filter((file) => !ignoredPath.test(file.replaceAll("\\", "/")));
}

function isLikelyFixture(value, file) {
  return /(?:test|fixture|example|dummy|placeholder|redacted|^a+$)/i.test(value) || /(^|\/)tests?\//i.test(file);
}

const findings = [];
for (const file of listFiles()) {
  const absolute = path.resolve(root, file);
  let source;
  try {
    source = await readFile(absolute, "utf8");
  } catch {
    continue;
  }
  for (const match of source.matchAll(assignmentPattern)) {
    if (isLikelyFixture(match[1], file)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    findings.push({ file, line, kind: "ASSIGNMENT" });
  }
  for (const match of source.matchAll(pemPattern)) {
    const line = source.slice(0, match.index).split("\n").length;
    findings.push({ file, line, kind: "PRIVATE_KEY" });
  }
}

if (findings.length) {
  for (const finding of findings) process.stderr.write(`Secret-scan candidate: ${finding.file}:${finding.line} (${finding.kind})\n`);
  process.stderr.write("Secret scan failed. Values are deliberately not printed.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Secret scan: no committed or unignored candidate secrets found; .env files were not read.\n");
}
