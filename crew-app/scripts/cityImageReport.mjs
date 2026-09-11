#!/usr/bin/env node
// City-image asset guardrail (enhance-Ver5 #22).
//
// Reports the total size, count, and largest files under the bundled city-image
// folder so growth is visible in review. Exits non-zero only when a generous
// budget is exceeded (so it can gate CI without being noisy day-to-day).
//
// Usage:  node scripts/cityImageReport.mjs [--max-mb 14] [--max-file-kb 400]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(__dir, '..', 'src', 'features', 'home', 'cityImages');

const argv = process.argv.slice(2);
const argVal = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] != null ? Number(argv[i + 1]) : def;
};
const MAX_MB = argVal('--max-mb', 14);
const MAX_FILE_KB = argVal('--max-file-kb', 450);

if (!fs.existsSync(IMG_DIR)) {
  console.error(`No city image folder at ${IMG_DIR}`);
  process.exit(2);
}

const files = fs
  .readdirSync(IMG_DIR)
  .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
  .map(f => ({ name: f, bytes: fs.statSync(path.join(IMG_DIR, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
const totalMb = totalBytes / (1024 * 1024);
const kb = b => (b / 1024).toFixed(0);

console.log(`City images: ${files.length} files, ${totalMb.toFixed(2)} MB total`);
console.log(`Largest 10:`);
for (const f of files.slice(0, 10)) {
  console.log(`  ${kb(f.bytes).padStart(5)} KB  ${f.name}`);
}

const overBudget = totalMb > MAX_MB;
const tooBig = files.filter(f => f.bytes / 1024 > MAX_FILE_KB);
if (tooBig.length) {
  console.warn(`\n${tooBig.length} file(s) over ${MAX_FILE_KB} KB:`);
  tooBig.forEach(f => console.warn(`  ${kb(f.bytes)} KB  ${f.name}`));
}
if (overBudget) {
  console.error(`\nFAIL: total ${totalMb.toFixed(2)} MB exceeds budget ${MAX_MB} MB.`);
}
process.exit(overBudget ? 1 : 0);
