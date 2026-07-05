// Copies the repo-root /data folder into web/public/data so Vite serves
// it as static JSON. This runs automatically before `dev` and `build`
// (see package.json), so the price data GitHub Actions commits to the
// root data/ folder always ends up in the deployed site.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "..", "..", "data");
const dest = path.resolve(here, "..", "public", "data");

if (!existsSync(src)) {
  console.warn(`No data/ folder found at ${src}, skipping sync.`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Synced ${src} -> ${dest}`);
