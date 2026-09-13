#!/usr/bin/env node
/**
 * screenshot-review — deterministic screenshot inspection for runtimes without image input.
 *
 * CLAUDE.md §PW-Snapshot requires the agent to inspect the captured PNG. When the agent
 * runtime refuses image input (`view_image` is hard-blocked), this is the substitute:
 * it OCRs the screenshot, measures it, optionally diffs it against a prior `-Ver<N>`
 * capture, and asserts on expected strings — producing a text sidecar a human can read
 * and an exit code CI/agents can gate on.
 *
 * Usage:
 *   node scripts/screenshot-review/review.mjs <png> \
 *     [--expect "text" | --expect "/regex/"]  (repeatable)
 *     [--expect-not "text"]                   (repeatable)
 *     [--diff path/to/previous.png]
 *     [--min-ink 0.005]
 *     [--vision]                              (delegate a real visual read; see vision.mjs)
 *     [--ask "question for the vision model"]
 *     [--vision-model gpt-5.6-luna]
 *     [--allow-blank]
 *     [--quiet]
 *
 * Exit codes: 0 ok, 1 assertion failed, 2 tool/build error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { matches as test, normalize } from './assertions.mjs';
import { DEFAULT_PROMPT, describe as visionDescribe } from './vision.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'ocr.swift');
const BIN_DIR = join(HERE, '.bin');
const BIN = join(BIN_DIR, 'rois-ocr');

// ---------- arg parsing ----------

const argv = process.argv.slice(2);
const opts = {
  expect: [],
  expectNot: [],
  diff: null,
  minInk: 0.005,
  allowBlank: false,
  quiet: false,
  vision: false,
  ask: null,
  visionModel: null,
};
const positional = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--expect') opts.expect.push(argv[++i]);
  else if (a === '--expect-not') opts.expectNot.push(argv[++i]);
  else if (a === '--diff') opts.diff = argv[++i];
  else if (a === '--min-ink') opts.minInk = Number(argv[++i]);
  else if (a === '--allow-blank') opts.allowBlank = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '--vision') opts.vision = true;
  else if (a === '--ask') opts.ask = argv[++i];
  else if (a === '--vision-model') opts.visionModel = argv[++i];
  else if (a === '-h' || a === '--help') {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const block = /\/\*\*([\s\S]*?)\*\//.exec(src);
    console.log(block ? block[1].replace(/^\s*\* ?/gm, '').trim() : 'screenshot-review');
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`unknown option: ${a}`);
    process.exit(2);
  } else positional.push(a);
}

const target = positional[0];
if (!target) {
  console.error('usage: node scripts/screenshot-review/review.mjs <png> [--expect "text"] [--diff prev.png]');
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`screenshot not found: ${target}`);
  process.exit(2);
}

// ---------- native tool bootstrap (cached) ----------

function ensureBinary() {
  if (!existsSync(BIN) || statSync(SOURCE).mtimeMs > statSync(BIN).mtimeMs) {
    mkdirSync(BIN_DIR, { recursive: true });
    try {
      execFileSync('swiftc', ['-O', '-o', BIN, SOURCE], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      console.error('failed to build scripts/screenshot-review/ocr.swift');
      console.error(String(err.stderr || err.message));
      console.error('Needs macOS with Xcode command line tools (`xcode-select --install`).');
      process.exit(2);
    }
  }
  return BIN;
}

function runTool(args) {
  const res = spawnSync(ensureBinary(), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (res.stdout || '').trim();
  if (!out) {
    console.error(`rois-ocr ${args.join(' ')} produced no output`);
    console.error(res.stderr || '');
    process.exit(2);
  }
  try {
    return JSON.parse(out);
  } catch {
    console.error(`rois-ocr ${args.join(' ')} returned invalid JSON:`);
    console.error(out.slice(0, 500));
    process.exit(2);
  }
}

// ---------- main ----------

const targetAbs = resolve(target);
const ocr = runTool(['ocr', targetAbs]);
const stats = runTool(['stats', targetAbs]);
if (!ocr.ok) {
  console.error('OCR failed:', ocr.error);
  process.exit(2);
}

const text = normalize(ocr.text || '');
const failures = [];

for (const spec of opts.expect) {
  if (!test(spec, text)) failures.push(`missing expected text: ${spec}`);
}
for (const spec of opts.expectNot) {
  if (test(spec, text)) failures.push(`found forbidden text: ${spec}`);
}

if (!opts.allowBlank && stats.blank) {
  failures.push(`image looks blank (inkRatio=${stats.inkRatio}, uniqueColors=${stats.uniqueColors})`);
}
if (!opts.allowBlank && stats.inkRatio < opts.minInk) {
  failures.push(`ink coverage ${stats.inkRatio} below --min-ink ${opts.minInk}`);
}

let diff = null;
if (opts.diff) {
  if (!existsSync(opts.diff)) {
    failures.push(`--diff target not found: ${opts.diff}`);
  } else {
    diff = runTool(['diff', resolve(opts.diff), targetAbs]);
    if (!diff.ok) failures.push(`diff failed: ${diff.error}`);
  }
}

// Optional delegated visual read: borrow the eyes of a multimodal model when this
// session's own model cannot accept image input (see vision.mjs).
let vision = null;
if (opts.vision) {
  vision = visionDescribe(targetAbs, opts.ask || DEFAULT_PROMPT, {
    model: opts.visionModel,
    timeoutMs: Number(process.env.SCREENSHOT_REVIEW_VISION_TIMEOUT_MS || 240_000),
  });
  if (!vision.ok) failures.push(`vision read failed: ${vision.error}`);
}

// ---------- report ----------

const status = failures.length === 0 ? 'PASS' : 'FAIL';
const lines = [];
lines.push(`screenshot-review: ${status}`);
lines.push(`  image:  ${targetAbs}`);
lines.push(`  size:   ${ocr.image.width}x${ocr.image.height}`);
lines.push(`  pixels: meanLuminance=${stats.meanLuminance} uniqueColors=${stats.uniqueColors} inkRatio=${stats.inkRatio} blank=${stats.blank}`);
lines.push(`  ocr:    ${ocr.blockCount} text blocks`);
if (opts.expect.length) lines.push(`  asserted present: ${opts.expect.map((s) => JSON.stringify(s)).join(', ')}`);
if (opts.expectNot.length) lines.push(`  asserted absent:  ${opts.expectNot.map((s) => JSON.stringify(s)).join(', ')}`);
if (diff) {
  lines.push(
    `  diff vs ${opts.diff}: ${(diff.changedRatio * 100).toFixed(2)}% pixels changed` +
      ` (identical=${diff.identical})` +
      (diff.changedBBox ? ` bbox=${JSON.stringify(diff.changedBBox)}` : '')
  );
}
if (vision) {
  lines.push(
    vision.ok
      ? `  vision: PASS (model=${vision.model}, ${(vision.durationMs / 1000).toFixed(1)}s)`
      : `  vision: FAIL (model=${vision.model}) ${vision.error}`
  );
}
if (failures.length) {
  lines.push('  failures:');
  for (const f of failures) lines.push(`    - ${f}`);
}
lines.push('');
lines.push('--- OCR text (reading order, top to bottom) ---');
lines.push(ocr.text || '(no text recognised)');

if (vision && vision.ok) {
  lines.push('');
  lines.push('--- model visual read (multimodal model, asked about this exact PNG) ---');
  lines.push(vision.answer);
}

const report = lines.join('\n');
if (!opts.quiet) console.log(report);

const sidecarJson = {
  status,
  image: targetAbs,
  size: { width: ocr.image.width, height: ocr.image.height },
  stats,
  ocr: { blockCount: ocr.blockCount, text: ocr.text, blocks: ocr.blocks },
  expectations: { present: opts.expect, absent: opts.expectNot },
  diff,
  vision: vision ? { ok: vision.ok, model: vision.model, answer: vision.answer, error: vision.error, durationMs: vision.durationMs } : null,
  failures,
  generatedAt: new Date().toISOString(),
};
writeFileSync(`${target}.review.txt`, report + '\n');
writeFileSync(`${target}.review.json`, JSON.stringify(sidecarJson, null, 2) + '\n');
if (vision && vision.ok) writeFileSync(`${target}.vision.txt`, vision.answer + '\n');

process.exit(failures.length === 0 ? 0 : 1);
