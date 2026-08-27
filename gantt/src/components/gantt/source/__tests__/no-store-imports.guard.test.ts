/**
 * Machine-enforced architectural guard (replaces the planned ESLint
 * `no-restricted-imports` rule — see commit d88ef931, now reverted).
 *
 * Purpose: shared presentation components under `gantt/src/components/gantt/`
 * MUST NOT import from `@/stores/` (nor any relative path with a `/stores/`
 * segment). They should read data through `useGanttSource()` instead, so future
 * Live features flow to Scenario automatically.
 *
 * This is a ZERO-DEPENDENCY static scan using only Node built-ins. No ESLint,
 * no extra dev deps.
 *
 * The ALLOWLIST below is a P1/P3 migration backlog: each entry is a file that
 * still couples to a store today and is pending migration to the source
 * abstraction. As migration proceeds the allowlist should shrink. New files
 * are NOT allowed to be added — a new violator fails this test hard.
 *
 * Decisions made (per task spec):
 *  - Type-only imports COUNT as violations (stricter; the guard is about
 *    coupling). In practice no current violator uses `import type` from a
 *    store, so this does not inflate the allowlist.
 *  - Subset check is HARD (a new violator fails the build). Stale-entry check
 *    is SOFT (console.warn only) so that Task 5/6 — which legitimately remove
 *    the pane-canvas / pane-header-canvas store imports — do not turn this test
 *    red before the allowlist is trimmed.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// This test sits in `components/gantt/source/__tests__/`. Resolve `components/gantt/`
// from this file's own location. NOTE: we deliberately avoid
// `new URL('../../', import.meta.url)` — under Vitest's jsdom environment the
// relative URL resolves against jsdom's `http://localhost` base (not the file://
// of the module), which breaks `fileURLToPath`. Anchoring on the dirname of the
// resolved module path is environment-agnostic.
const HERE = path.dirname(fileURLToPath(import.meta.url)) // .../components/gantt/source/__tests__
const GANTT_DIR = path.resolve(HERE, '../../') // .../components/gantt

// Matches `import ... from '@/stores/...'` and `export ... from '.../stores/...'`,
// including `import type`. Relative paths containing a `/stores/` segment also count.
const STORE_IMPORT_RE = /(?:import|export)[\s\S]*?from\s+['"](@\/stores\/|[^'"]*\/stores\/)/

/**
 * Known/accepted violators today (repo-relative to GANTT_DIR, forward-slash
 * normalized). This is the migration backlog; it must only shrink.
 */
const ALLOWLIST = new Set<string>([
  'gantt-canvas.tsx',
  'time-axis.tsx',
  'time-axis-rp-menu.tsx',
  'violation-tooltip.tsx',
  'renderers/flight-renderer.ts',
  'renderers/pairing-renderer.ts',
  'renderers/roster-renderer.ts',
])

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Exclude the source adapters and any __tests__ folder.
      if (entry.name === 'source' || entry.name === '__tests__') continue
      walk(full, acc)
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const toRel = (full: string): string =>
  path.relative(GANTT_DIR, full).split(path.sep).join('/')

const collectViolators = (): string[] => {
  const violators: string[] = []
  for (const full of walk(GANTT_DIR)) {
    const text = readFileSync(full, 'utf8')
    if (STORE_IMPORT_RE.test(text)) violators.push(toRel(full))
  }
  return violators.sort()
}

describe('展示层 store 直连守卫 (no-store-imports guard)', () => {
  it('展示层组件不得直连 store（应通过 useGanttSource() 读取）', () => {
    const violators = collectViolators()
    const offenders = violators.filter((rel) => !ALLOWLIST.has(rel))

    expect(
      offenders,
      `展示层组件禁止直连 store（应通过 useGanttSource() 读取）。新增违规文件：${offenders.join(', ')}。如属共享展示层，请改用 source 抽象；如确需豁免，在 guard 测试 allowlist 中登记并说明。`,
    ).toEqual([])
  })

  it('allowlist 不应有过期条目（软检查，仅警告）', () => {
    const violators = new Set(collectViolators())
    const stale = [...ALLOWLIST].filter((rel) => !violators.has(rel)).sort()
    if (stale.length > 0) {
      // SOFT: Task 5/6 remove pane-canvas/pane-header-canvas store imports; this
      // should not turn the guard red, just remind us to trim the backlog.
      console.warn(
        `[no-store-imports.guard] allowlist 含已迁移的过期条目，可移除：${stale.join(', ')}`,
      )
    }
    // Always passes; this is a soft reminder only.
    expect(true).toBe(true)
  })
})
