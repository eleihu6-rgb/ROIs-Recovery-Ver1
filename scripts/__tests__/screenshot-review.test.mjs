import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { matches, matcher, normalize } from '../screenshot-review/assertions.mjs';
import { catalogPath, describe, pickModel, visionModels } from '../screenshot-review/vision.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REVIEW = join(HERE, '..', 'screenshot-review', 'review.mjs');
const REPO = join(HERE, '..', '..');

// ---------- pure helpers ----------

test('normalize collapses OCR whitespace runs', () => {
  assert.equal(normalize('  Alert\n\tCenter  '), 'Alert Center');
  assert.equal(normalize(undefined), '');
});

test('matcher treats plain specs as case-insensitive substrings', () => {
  const m = matcher('Alert Center');
  assert.equal(m.kind, 'substring');
  assert.equal(matches('Alert Center', 'legality alert center 3007/001'), true);
  assert.equal(matches('Alert Center', 'no alert here'), false);
});

test('matcher supports /regex/flags', () => {
  assert.equal(matcher('/^K10\\d\\d$/').kind, 'regex');
  assert.equal(matches('/^K10\\d\\d$/', 'K1003'), true);
  assert.equal(matches('/^K10\\d\\d$/', 'crew K1003 base'), false);
  // case-insensitive by default even without the flag
  assert.equal(matches('/alert/', 'ALERT'), true);
});

test('matcher escapes nothing: literal specs with regex chars are literal', () => {
  assert.equal(matches('3007/001', 'row with 3007/001 and others'), true);
});

// ---------- minimal PNG encoder (no dependencies) ----------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
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

/** Solid-colour RGB PNG of the given size (a stand-in for a blank capture). */
function solidPng(width, height, [r, g, b] = [255, 255, 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function runReview(args, opts = {}) {
  return spawnSync(process.execPath, [REVIEW, ...args], { encoding: 'utf8', ...opts });
}

const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
const toolAvailable = process.platform === 'darwin' && hasSwift;

// ---------- native pipeline ----------

test('blank capture is rejected by the blank guard, and --allow-blank overrides it', { skip: !toolAvailable && 'macOS + swiftc required' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'shot-review-'));
  try {
    const png = join(dir, 'blank.png');
    writeFileSync(png, solidPng(64, 64, [255, 255, 255]));

    const guarded = runReview([png, '--quiet']);
    assert.equal(guarded.status, 1, 'blank image should fail the guard');
    assert.ok(existsSync(`${png}.review.json`), 'sidecar should be written even on failure');
    const sidecar = JSON.parse(readFileSync(`${png}.review.json`, 'utf8'));
    assert.equal(sidecar.status, 'FAIL');
    assert.match(sidecar.failures.join(' '), /blank|ink/i);

    const allowed = runReview([png, '--quiet', '--allow-blank']);
    assert.equal(allowed.status, 0, `--allow-blank should pass: ${allowed.stdout}${allowed.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing expected text exits non-zero', { skip: !toolAvailable && 'macOS + swiftc required' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'shot-review-'));
  try {
    const png = join(dir, 'blank.png');
    writeFileSync(png, solidPng(32, 32, [255, 255, 255]));
    const res = runReview([png, '--quiet', '--allow-blank', '--expect', 'text-that-is-not-there']);
    assert.equal(res.status, 1);
    const sidecar = JSON.parse(readFileSync(`${png}.review.json`, 'utf8'));
    assert.match(sidecar.failures.join(' '), /missing expected text/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a real captured screenshot decodes and OCRs', { skip: !toolAvailable && 'macOS + swiftc required' }, () => {
  const sample = join(
    REPO,
    'docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png'
  );
  if (!existsSync(sample)) return; // sample pruned; nothing to assert
  const res = runReview([sample, '--quiet', '--expect', 'Alert Center']);
  assert.equal(res.status, 0, `expected PASS: ${res.stdout}${res.stderr}`);
});

// ---------- vision delegation ----------

test('vision model picker honours an explicit override', () => {
  assert.equal(pickModel('some-chosen-model'), 'some-chosen-model');
});

test('vision model list matches the catalog and never offers a text-only model', () => {
  const models = visionModels();
  assert.ok(Array.isArray(models));

  const catalog = catalogPath();
  if (!catalog) return; // no catalog on this machine: nothing to cross-check

  const parsed = JSON.parse(readFileSync(catalog, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.models || [];
  const expected = list
    .filter((m) => Array.isArray(m.input_modalities) && m.input_modalities.includes('image'))
    .map((m) => m.slug);

  assert.deepEqual(models, expected);
  // Guard the intent, not a model name: never offer a model that cannot take images.
  // `deepseek-flash` is legitimately offered now — the Headroom vision bridge
  // (~/.headroom/extensions/codex-deepseek) declares it image-capable and transcribes
  // images to text upstream. A genuinely text-only catalog entry must still be excluded.
  const textOnly = list
    .filter((m) => !(m.input_modalities || []).includes('image'))
    .map((m) => m.slug);
  for (const slug of textOnly) {
    assert.ok(!models.includes(slug), `${slug} is text-only and must not be offered for vision`);
  }
});

test('vision model picker always resolves to something runnable', () => {
  const picked = pickModel();
  assert.ok(typeof picked === 'string' && picked.length > 0);
  const available = visionModels();
  if (available.length > 0) assert.ok(available.includes(picked), `${picked} not in catalog`);
});

test('describe() reports a clear error for a missing image instead of throwing', () => {
  const result = describe(join(tmpdir(), 'definitely-not-here.png'), 'hello');
  assert.equal(result.ok, false);
  assert.match(result.error, /not found/i);
});

// Opt-in: hits the local gateway and costs a model call. Enable with SCREENSHOT_REVIEW_E2E_VISION=1.
test('delegated vision read returns an answer about a real screenshot', {
  skip: process.env.SCREENSHOT_REVIEW_E2E_VISION !== '1' && 'set SCREENSHOT_REVIEW_E2E_VISION=1 to run',
}, () => {
  const sample = join(
    REPO,
    'docs/assets/screenshots/gantt/rule-3007-dxb-delay-alert-center-Ver1.png'
  );
  if (!existsSync(sample)) return;
  const result = describe(sample, 'Reply with the count shown next to rule 3007/001. Terse.', { effort: 'low' });
  assert.equal(result.ok, true, result.error);
  assert.match(result.answer, /\b4\b/);
});
