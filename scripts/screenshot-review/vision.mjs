#!/usr/bin/env node
/**
 * vision.mjs — give a text-only agent session real image-reading capability.
 *
 * Why this exists
 * ---------------
 * `view_image` is gated on the *session model* declaring image input. Sessions routed to a
 * text-only model (e.g. `deepseek-flash` via the local "headroom" gateway) get:
 *     view_image is not allowed because you do not support image inputs
 * Sessions on a multimodal model (GPT-5.x, Claude) can read the PNG directly.
 *
 * The difference is the model, not the tool — so the fix is to route the *reading* step to a
 * model that has a vision encoder. This machine already has both halves: the Codex CLI can
 * attach images (`codex exec -i`), and the same local gateway serves multimodal models. So a
 * text-only session can borrow their eyes:
 *
 *     node scripts/screenshot-review/vision.mjs <png> "what does the alert badge say?"
 *
 * The model is auto-selected from the active Codex model catalog (the first entry declaring
 * `input_modalities: ["image"]`), so this keeps working when catalog/capability names change.
 *
 * The request runs in a throwaway temp directory with a read-only sandbox and an ephemeral
 * session, so the vision model cannot read or mutate this repo.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');

/** Cheap-but-capable first; the list is only a preference order, availability wins. */
const PREFERRED_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-5.5'];

/** Locate the model catalog the running Codex config actually uses. */
export function catalogPath() {
  const cfg = join(CODEX_HOME, 'config.toml');
  if (existsSync(cfg)) {
    const m = /^\s*model_catalog_json\s*=\s*"([^"]+)"/m.exec(readFileSync(cfg, 'utf8'));
    if (m && existsSync(m[1])) return m[1];
  }
  const fallback = join(CODEX_HOME, 'headroom-models.json');
  return existsSync(fallback) ? fallback : null;
}

/** Slugs of every catalog model that accepts image input. */
export function visionModels() {
  const path = catalogPath();
  if (!path) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.models || [];
    return list
      .filter((m) => Array.isArray(m.input_modalities) && m.input_modalities.includes('image'))
      .map((m) => m.slug)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Resolve which vision model to use: explicit > env > catalog preference > catalog first. */
export function pickModel(override) {
  if (override) return override;
  if (process.env.SCREENSHOT_REVIEW_VISION_MODEL) return process.env.SCREENSHOT_REVIEW_VISION_MODEL;
  const available = visionModels();
  for (const slug of PREFERRED_MODELS) if (available.includes(slug)) return slug;
  return available[0] || 'gpt-5.6-terra';
}

export function codexAvailable() {
  return spawnSync('codex', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Ask a vision model what it sees in `imagePath`.
 * Returns { ok, model, answer, error?, durationMs }.
 */
export function describe(imagePath, prompt, opts = {}) {
  const started = Date.now();
  const model = pickModel(opts.model);
  const effort = opts.effort || 'low';
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const image = resolve(imagePath);

  if (!existsSync(image)) return { ok: false, model, error: `image not found: ${image}` };
  if (!codexAvailable()) {
    return {
      ok: false,
      model,
      error: 'codex CLI not found on PATH — cannot delegate a vision read',
      durationMs: Date.now() - started,
    };
  }

  // Throwaway working dir + read-only sandbox: the vision model cannot touch this repo.
  const cwd = mkdtempSync(join(tmpdir(), 'shot-vision-'));
  const answerFile = join(cwd, 'answer.txt');

  const args = [
    'exec',
    '-m', model,
    '-s', 'read-only',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color', 'never',
    '-C', cwd,
    '-c', `model_reasoning_effort="${effort}"`,
    '--output-last-message', answerFile,
    '-i', image,
  ];

  const res = spawnSync('codex', args, {
    input: prompt, // codex reads the prompt from stdin when stdin is a pipe
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });

  const durationMs = Date.now() - started;
  const answer = existsSync(answerFile) ? readFileSync(answerFile, 'utf8').trim() : '';

  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { ok: false, model, error: `vision read timed out after ${timeoutMs} ms`, durationMs };
  }
  if (answer) return { ok: true, model, answer, durationMs };

  const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(-4).join('\n');
  return { ok: false, model, error: `no answer returned (exit ${res.status})\n${detail}`, durationMs };
}

/** Default question used when the caller just wants "look at this and report". */
export const DEFAULT_PROMPT = [
  'You are inspecting a UI screenshot for a QA report. Answer from the IMAGE ONLY; do not run tools.',
  'Report, tersely:',
  '1. What screen/dialog this is and the state it is in.',
  '2. The exact text of any status badges, counts, or error/rule identifiers visible.',
  '3. Anything that looks broken: clipped or overlapped text, empty panes, misalignment, missing data.',
  'Do not speculate about code. If something is unreadable, say so.',
].join('\n');

// ---------- CLI ----------

function main() {
  const argv = process.argv.slice(2);
  const opts = { model: null, effort: 'low', timeoutMs: 240_000, json: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') opts.model = argv[++i];
    else if (a === '--effort') opts.effort = argv[++i];
    else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--list-models') {
      console.log(visionModels().join('\n') || '(no image-capable model in catalog)');
      process.exit(0);
    } else if (a === '-h' || a === '--help') {
      const block = /\/\*\*([\s\S]*?)\*\//.exec(readFileSync(fileURLToPath(import.meta.url), 'utf8'));
      console.log((block ? block[1] : '').replace(/^\s*\* ?/gm, '').trim());
      console.log('\nUsage: node scripts/screenshot-review/vision.mjs <png> [question] [--model M] [--effort low]');
      process.exit(0);
    } else if (a.startsWith('--')) {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    } else positional.push(a);
  }

  const image = positional[0];
  if (!image) {
    console.error('usage: node scripts/screenshot-review/vision.mjs <png> [question] [--model M]');
    process.exit(2);
  }
  const prompt = positional.slice(1).join(' ').trim() || DEFAULT_PROMPT;

  const result = describe(image, prompt, opts);

  if (opts.json) {
    console.log(JSON.stringify({ image: resolve(image), prompt, ...result }, null, 2));
  } else if (result.ok) {
    console.log(`vision read: PASS (model=${result.model}, ${(result.durationMs / 1000).toFixed(1)}s)`);
    console.log('');
    console.log(result.answer);
  } else {
    console.error(`vision read: FAIL (model=${result.model})`);
    console.error(result.error);
  }

  if (result.ok) {
    const sidecar = { image: resolve(image), model: result.model, prompt, answer: result.answer, durationMs: result.durationMs, generatedAt: new Date().toISOString() };
    writeFileSync(`${image}.vision.txt`, result.answer + '\n');
    writeFileSync(`${image}.vision.json`, JSON.stringify(sidecar, null, 2) + '\n');
  }

  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
