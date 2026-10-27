import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Isolated QA builds use named Next output directories. They are generated
    // artifacts too and must never be linted as project-authored source.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated browser/test evidence and local tool state are retained for
    // auditability, but they are not project-authored source code.
    "playwright-report/**",
    "test-results/**",
    "output/**",
    ".playwright-cli/**",
    ".vercel/**",
    "%USERPROFILE%/**",
    // Vendored, license-preserving MapLibre worker runtime. It is copied
    // byte-for-byte from the installed package and is not project-authored.
    "public/maplibre-gl-*.mjs",
    "public/vendor/**",
    "preview-dist/**",
  ]),
]);

export default eslintConfig;
