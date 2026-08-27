#!/usr/bin/env node
/**
 * UI Standard Gate — enforces the project CSS/Typography standard so it cannot drift.
 *
 * Background: 268 magic font sizes (`text-[11px]` …) accumulated across 53 files because
 * nothing gated them. This checker is the gate. It is intentionally dependency-free and
 * server-free so it runs fast in a git pre-push hook, by an AI agent before commit, and
 * inside the Playwright suite (see e2e/tests/perf/ui-standard.spec.ts).
 *
 * Authority: root CLAUDE.md §样式与排版标准 (token-driven, no magic values) and
 * docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md.
 *
 * HARD violations (exit 1 — zero legitimate exceptions, must be a token):
 *   - magic font size      text-[Npx]            → text-3xs/2xs/xs/sm/base
 *   - over-weight font     font-extrabold/black  → font-semibold/bold (cap is bold)
 *   - hardcoded radius px   rounded-[Npx]         → rounded-sm/md/lg/xl
 *   - arbitrary font family font-[...]            → font-sans / font-mono
 *
 * WARN only (reported, does NOT fail — has legitimate precise-pixel exceptions such as
 * 1px border-compensation, chart bar geometry, canvas/ghost rendering):
 *   - arbitrary spacing utilities  gap-[Npx] / p-[Npx] / m-[Npx] …
 *   - inline literal  fontFamily: '…'  in component source
 *
 * Escape hatch: put `ui-standard-ignore` in a comment on the offending line — or
 * `ui-standard-ignore-next-line` on the line above (idiomatic for JSX className strings) —
 * to skip it. Use only for a genuine, documented precise-pixel need.
 *
 * Usage:  node scripts/check-ui-standard.mjs            # scan default dirs
 *         node scripts/check-ui-standard.mjs gantt/src  # scan a subset
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')

/** Directories scanned by default (all UI surfaces that consume the token scale). */
const DEFAULT_TARGETS = ['gantt/src', 'packages/ui/src', 'pbs-portal/src']

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '__snapshots__'])
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$/

const HARD_RULES = [
  { id: 'font-size',   re: /text-\[[\d.]+px\]/g,        fix: 'use text-3xs/2xs/xs/sm/base tokens' },
  { id: 'font-weight', re: /font-(?:extrabold|black)\b/g, fix: 'cap weight at font-bold (use font-semibold/bold)' },
  { id: 'radius-px',   re: /rounded-\[[\d.]+px\]/g,      fix: 'use rounded-sm/md/lg/xl tokens' },
  { id: 'font-family', re: /font-\[(?![\d.]+px\])[^\]]+\]/g, fix: 'use font-sans / font-mono (no arbitrary font-family)' },
]

const WARN_RULES = [
  { id: 'spacing-px',  re: /(?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-[xy])-\[[\d.]+px\]/g, fix: 'prefer the 4px spacing scale (gap-1, p-2 …) unless a precise pixel is required' },
  { id: 'inline-font', re: /fontFamily\s*:\s*['"`](?!var\(--font)/g, fix: "use var(--font-sans) / var(--font-mono) instead of a literal family" },
]

/** @returns {string[]} absolute file paths under dir matching SCAN_EXT. */
const walk = (dir) => {
  let out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out = out.concat(walk(full))
    else if (SCAN_EXT.has(extname(name)) && !SKIP_FILE.test(name)) out.push(full)
  }
  return out
}

/**
 * Scan the given target dirs (relative to repo root) for standard violations.
 * @param {string[]} targets
 * @returns {{ hard: object[], warn: object[] }}
 */
export const scanUiStandard = (targets = DEFAULT_TARGETS) => {
  const hard = []
  const warn = []
  for (const target of targets) {
    const root = join(REPO_ROOT, target)
    let files
    try { files = walk(root) } catch { continue } // target may not exist in a partial checkout
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        const prev = i > 0 ? lines[i - 1] : ''
        if (line.includes('ui-standard-ignore') || prev.includes('ui-standard-ignore-next-line')) return
        const collect = (rules, sink) => {
          for (const rule of rules) {
            rule.re.lastIndex = 0
            let m
            while ((m = rule.re.exec(line)) !== null) {
              sink.push({ rule: rule.id, fix: rule.fix, file: relative(REPO_ROOT, file), line: i + 1, token: m[0] })
            }
          }
        }
        collect(HARD_RULES, hard)
        collect(WARN_RULES, warn)
      })
    }
  }
  return { hard, warn }
}

const groupBy = (rows, key) => rows.reduce((acc, r) => ((acc[r[key]] ??= []).push(r), acc), {})

const printGroup = (title, rows) => {
  console.log(`\n${title} (${rows.length})`)
  const byRule = groupBy(rows, 'rule')
  for (const [ruleId, items] of Object.entries(byRule)) {
    console.log(`  • ${ruleId} — ${items[0].fix}`)
    for (const it of items) console.log(`      ${it.file}:${it.line}  ${it.token}`)
  }
}

// CLI entry — run directly (not when imported by the Playwright spec).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targets = process.argv.slice(2)
  const { hard, warn } = scanUiStandard(targets.length ? targets : DEFAULT_TARGETS)

  if (warn.length) printGroup('⚠️  WARN (precise-pixel exceptions allowed — review)', warn)

  if (hard.length) {
    printGroup('❌ HARD violations (must fix — these are §样式与排版标准 bugs)', hard)
    console.log(`\nUI Standard Gate: FAIL — ${hard.length} hard violation(s). See root CLAUDE.md §样式与排版标准.`)
    console.log('Fix by migrating to tokens, or add `ui-standard-ignore` on the line for a documented precise-pixel need.\n')
    process.exit(1)
  }
  console.log(`\nUI Standard Gate: PASS — 0 hard violations${warn.length ? ` (${warn.length} warnings)` : ''}.\n`)
}
