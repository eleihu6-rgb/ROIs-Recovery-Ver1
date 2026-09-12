// Generate the ROIs Altair crew-app launcher icons from the Ver11 logo mark
// (white paper plane + golden guiding star on the Altair sage ground).
//
// Run from the repo root:   node crew-app/scripts/genAppIcons.mjs
//
// Writes:
//   ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset/*.png   (iOS, full-bleed, no alpha)
//   android/app/src/main/res/mipmap-*/ic_launcher{,_round}.png         (Android legacy launcher)
//
// Icon rules applied:
//   • full-bleed, opaque, square — iOS applies its own corner mask, so the PNG must NOT
//     carry rounded corners or an alpha channel (App Store validation rejects alpha).
//   • the round variant gets a circular ground and a smaller mark so the star tip
//     survives the circular crop.

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const repoRoot = join(appDir, '..');
const requireRoot = createRequire(join(repoRoot, 'package.json'));
const { chromium } = requireRoot('playwright');

// ── Icon artwork ─────────────────────────────────────────────────────────────
// The mark is authored in the same 32-box as docs/design/altair-crew-app-mark.svg;
// here it is inset and scaled into a 1024 box.
const MARK = `
  <g transform="translate(0.9 10.5) scale(0.86)">
    <path fill="#fff" d="M22 2 2.5 9.8l9 2.9z"/>
    <path fill="#fff" fill-opacity=".84" d="M22 2 11.5 12.7l3.2 8.8z"/>
    <path fill="#fff" fill-opacity=".66" d="M11.5 12.7v5.6l2.4-3z"/>
  </g>
  <path transform="translate(24.4 7) scale(1.05)" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z" fill="#e0b24c"/>`;

const GROUND = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.72" y2="1">
      <stop offset="0" stop-color="#2c5a52"/>
      <stop offset="1" stop-color="#173430"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.16" r="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

const art = (round, inset) => {
  const scale = (1024 * inset) / 32;
  const offset = (1024 - 1024 * inset) / 2;
  // The round variant is clipped to a circle so everything outside it stays transparent
  // (Android's round launcher mask crops what the art does not already cover).
  const ground = round
    ? `<defs><clipPath id="rclip"><circle cx="512" cy="512" r="512"/></clipPath></defs>
  <g clip-path="url(#rclip)"><circle cx="512" cy="512" r="512" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#glow)"/></g>`
    : `<rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#glow)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${GROUND}
  ${ground}
  <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
</svg>`;
};

// ── Targets ──────────────────────────────────────────────────────────────────
const iosDir = join(appDir, 'ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset');
const iosIcons = [
  ['AppIcon-20@2x.png', 40],
  ['AppIcon-20@3x.png', 60],
  ['AppIcon-29@2x.png', 58],
  ['AppIcon-29@3x.png', 87],
  ['AppIcon-40@2x.png', 80],
  ['AppIcon-40@3x.png', 120],
  ['AppIcon-60@2x.png', 120],
  ['AppIcon-60@3x.png', 180],
  ['AppIcon-1024.png', 1024],
];
const androidDensities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

// ── Chromium lookup (Playwright's pinned build may not be downloaded) ─────────
function chromeExecutable() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  const candidates = readdirSync(cache, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('chromium-'))
    .map(d => join(cache, d.name, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
    .sort();
  return candidates.at(-1);
}

// ── PNG alpha strip (iOS rejects icons that carry an alpha channel) ───────────
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA (colour type 6) screenshot → opaque RGB (colour type 2). */
function dropAlpha(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[25] !== 6) {
    return png; // already has no alpha channel
  }
  const idat = [];
  for (let p = 8; p < png.length; ) {
    const len = png.readUInt32BE(p);
    const type = png.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') {
      idat.push(png.subarray(p + 8, p + 8 + len));
    }
    p += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const out = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const src = y * stride;
    const dst = y * (width * 3 + 1);
    out[dst] = raw[src]; // filter byte
    for (let x = 0; x < width; x += 1) {
      out[dst + 1 + x * 3] = raw[src + 1 + x * 4];
      out[dst + 2 + x * 3] = raw[src + 2 + x * 4];
      out[dst + 3 + x * 3] = raw[src + 3 + x * 4];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Render ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: chromeExecutable() });

async function render(svg, size, { transparent = false, stripAlpha = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0${transparent ? ';background:transparent' : ''}">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  const png = await page.screenshot({ type: 'png', omitBackground: transparent });
  await page.close();
  return stripAlpha ? dropAlpha(png) : png;
}

mkdirSync(iosDir, { recursive: true });
for (const [name, size] of iosIcons) {
  const png = await render(art(false, 0.8), size, { stripAlpha: true });
  writeFileSync(join(iosDir, name), png);
  console.log(`ios     ${name.padEnd(20)} ${size}px  ${png.length.toLocaleString()} bytes`);
}

for (const [density, size] of androidDensities) {
  const dir = join(appDir, 'android/app/src/main/res', `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const square = await render(art(false, 0.78), size);
  const round = await render(art(true, 0.58), size, { transparent: true });
  writeFileSync(join(dir, 'ic_launcher.png'), square);
  writeFileSync(join(dir, 'ic_launcher_round.png'), round);
  console.log(`android ${density.padEnd(8)} ${String(size).padStart(3)}px  square + round`);
}

await browser.close();
console.log('\nApp icons written.');
