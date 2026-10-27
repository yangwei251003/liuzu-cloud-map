import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "public", "assets", "images", "neutral-app-icon.svg");
const destination = path.join(projectRoot, "public", "icons");

await mkdir(destination, { recursive: true });

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512],
  ["apple-touch-icon-180.png", 180],
]) {
  await sharp(source, { density: 320 })
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(destination, name));
}

console.log("Generated PWA icons in public/icons from the registered neutral SVG source.");
