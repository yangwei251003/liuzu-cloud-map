import { cpSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
for (const file of ["maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"]) {
  cpSync(resolve(root, "node_modules/maplibre-gl/dist", file), resolve(root, "public", file));
}
console.log("Synchronized vendored MapLibre worker/runtime with the pinned dependency; keep its BSD license.");
