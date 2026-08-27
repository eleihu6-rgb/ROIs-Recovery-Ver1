/**
 * Rule 8002/001 (MAX_CUM_BLOCK, "Maximum Flight Time") — multi-window validation.
 *
 * Rule 8002/001 defines THREE rolling cumulative-block windows in rule.param_json
 * (legacy workset 103 "PBS Solver Ruleset"). After migration
 * `sql/migration/2026-06-15-rule-8002-001-cumulative-windows-100-200.sql` the windows are:
 *     row 0 :  28-day window, Max 40:00   (40h)
 *     row 1 : 100-day window, Max 300:00  (300h)   ← was 90-day
 *     row 2 : 200-day window, Max 1000:00 (1000h)  ← was 365-day
 *
 * These three specs prove the 8002 check fires CORRECTLY and DISTINCTLY in each window:
 *
 *   Rule-3001 — the LIVE param (read through the Legality API the gantt consumes) really
 *               carries the migrated windows 28 / 100 / 200 with limits 40 / 300 / 1000.
 *   Rule-3002 — drive the proven Rust 8002 engine over the SAME live roster block data for
 *               each window and assert SPECIFIC, distinct results: 28d@40h → 308 violating
 *               (worst crew 2744 @ 504.3h), 100d@300h → 15 (worst crew 2744 @ 541.0h),
 *               200d@1000h → 0; plus the structural invariants (wider window → ≥ hours but
 *               with its own limit; counts strictly differ; no false positives at 200d).
 *   Rule-3003 — the 28-day @ 40h window's violations actually reach the planner's gantt:
 *               the Legality Alert Center lists 8002/001 rows whose message names the
 *               "28-day window" and "40h" limit from param row 0 (not bare visibility).
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * The engine-layer harness lives at live-server/scripts/check-8002-windows.mjs.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// e2e/tests/gantt → repo root is three up.
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-8002-windows.mjs')

const WORKSET_PBS_SOLVER = 103

interface WindowResult {
  windowDays: number
  limitHours: number
  crewEvaluated: number
  crewViolating: number
  worst: { crewId: string; hours: number } | null
  violatingCrew: string[]
}

/** Run the Rust 8002 engine over live data for each `days:limit` window, parse JSON. */
const runEngineWindows = (spec: string): WindowResult[] => {
  const out = execFileSync('node', [HARNESS, spec], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return (JSON.parse(out) as { windows: WindowResult[] }).windows
}

test.describe('Rule 8002/001 — cumulative-block windows (28 / 100 / 200 day)', () => {
  test('Rule-3001 — live param_json carries migrated windows 28/100/200 (limits 40/300/1000)', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule8002 = body.data.rules.find((r) => Number(r.function) === 8002 && r.instance === '001')
    expect(rule8002, '8002/001 must be in PBS Solver Ruleset').toBeTruthy()

    const pj = rule8002!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const table = pj.tables[0]
    const periodIdx = table.header.indexOf('Period')
    const maxIdx = table.header.indexOf('Max Limits')
    expect(periodIdx).toBe(4)
    expect(maxIdx).toBe(7)

    // The three BH cumulative-block windows, in row order, with the migrated periods +
    // limits. (8002/001 also carries a 4th row — the Type=CH monthly band — which is
    // asserted by rule-8002-credit.spec.ts; filter to the BH windows here.)
    const typeIdx = table.header.indexOf('Type')
    const windows = table.rows
      .filter((row) => row[typeIdx] === 'BH')
      .map((row) => ({ period: row[periodIdx], max: row[maxIdx] }))
    expect(windows).toEqual([
      { period: '28', max: '40:00' },
      { period: '100', max: '300:00' },
      { period: '200', max: '1000:00' },
    ])
  })

  test('Rule-3002 — Rust 8002 engine fires distinctly per window over live roster data', async () => {
    // Param windows: 28d→40h, 100d→300h, 200d→1000h (Max Limits from rule 8002/001).
    const [w28, w100, w200] = runEngineWindows('28:40,100:300,200:1000')

    // Same population evaluated in every window.
    expect(w28.crewEvaluated).toBe(673)
    expect(w100.crewEvaluated).toBe(673)
    expect(w200.crewEvaluated).toBe(673)
    expect(w28.windowDays).toBe(28)
    expect(w100.windowDays).toBe(100)
    expect(w200.windowDays).toBe(200)

    // Distinct, specific violation counts per window (computed live).
    expect(w28.crewViolating).toBe(308)
    expect(w100.crewViolating).toBe(15)
    expect(w200.crewViolating).toBe(0)

    // The three windows genuinely disagree — not the same set re-reported.
    expect(w28.crewViolating).not.toBe(w100.crewViolating)
    expect(w100.crewViolating).not.toBe(w200.crewViolating)

    // Worst crew is the same heavy flyer (2744) in both non-empty windows, and its worst
    // 100-day window accumulates MORE block hours than its worst 28-day window (a wider
    // window can only sum ≥ a narrower one for the same crew).
    expect(w28.worst?.crewId).toBe('2744')
    expect(w100.worst?.crewId).toBe('2744')
    expect(w28.worst!.hours).toBeCloseTo(504.3, 1)
    expect(w100.worst!.hours).toBeCloseTo(541.0, 1)
    expect(w100.worst!.hours).toBeGreaterThan(w28.worst!.hours)

    // Every 100-day violator is also a 28-day violator here (300h/100d is the tighter gate
    // for this data, so it flags a strict subset). Proves no spurious wide-window hits.
    const set28 = new Set(w28.violatingCrew)
    for (const crew of w100.violatingCrew) {
      expect(set28.has(crew), `100d violator ${crew} should also breach 28d`).toBeTruthy()
    }

    // 200d @ 1000h: zero violations — a real "no false positive" result, not an error.
    expect(w200.worst).toBeNull()
    expect(w200.violatingCrew).toHaveLength(0)
  })

  test('Rule-3003 — 28-day @ 40h 8002/001 violations reach the gantt Alert Center', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page) // default no-filter apply → full bootstrap load

    // BELL data source must carry 8002 (loaded async after first paint).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8002').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    // Open the Legality Alert Center.
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    // 8002/001 instance rows are listed (the migrated rule), with concrete content.
    const rows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8002/001"]')
    await expect.poll(() => rows.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    const first = rows.first()
    await expect(first).toContainText('8002/001')
    // The message ties the alarm to the 28-day window and the 40h limit (param row 0):
    //   "Cumulative block N.Nh in a 28-day window exceeds 40h limit (rule 8002; worst window …)"
    await expect(first).toContainText('28-day window')
    await expect(first).toContainText('40h')

    // Attributed to a real crew (non-empty crew id cell).
    const crewId = await first.getAttribute('data-crew-id')
    expect(crewId && crewId.length > 0).toBeTruthy()

    // At least a couple of crew breached the 28-day window — matches the live engine count
    // being large (308). Distinct crew ids across the loaded 8002/001 rows.
    const crewIds = await rows.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-crew-id')).filter(Boolean),
    )
    expect(new Set(crewIds).size).toBeGreaterThan(1)
  })
})
