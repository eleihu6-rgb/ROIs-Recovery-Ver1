/**
 * Rule 7504/001 (SPACING RULE - WOCL) — C++→Rust→Gantt migration, rule #8.
 *
 * 7504/001 requires a minimum rest (Min Period RH) between two consecutive WOCL flight
 * duties — a WOCL duty being one whose FDP overlaps [02:00,05:59] in crew-base-local time
 * (per the 7504 gtest). It was added to workset 103 "PBS Solver Ruleset" (the gantt's active
 * group) and its Min Period raised 55 → 80 RH so more sub-80h gaps between WOCL flight duties
 * surface as Overridable (amber, sev 2) warnings — see
 * `sql/migration/2026-06-15-rule-7504-001-add-to-103-minperiod-80.sql`.
 *
 *   Rule-3025 — the LIVE param (read through the Legality API the gantt consumes) carries
 *               7504/001 in workset 103 with Prev/Next=FLY, Attributes=WOCL, Min Period=80, RH.
 *   Rule-3026 — drive the proven Rust 7504 engine over live June roster data and assert the
 *               invariant: raising Min Period 55 → 80 RH triggers STRICTLY MORE warnings
 *               (~178 vs ~120 crew over the same population) — the user's goal.
 *   Rule-3027 — THE END GOAL: 7504 WOCL-spacing warnings reach the planner's gantt (bell data
 *               + Alert Center, duty_start dates + "less than N RH"), AND 8002 is STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-7504-wocl-spacing.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7504-wocl-spacing.mjs')

const WORKSET_PBS_SOLVER = 103

interface CompareResult {
  params: { minPeriod: number; unit: string; woclStartMin: number; woclEndMin: number }
  at55: { minPeriod: number; crewEvaluated: number; crewViolating: number; violationCount: number; worst: { crewId: string; gapMinutes: number; pairingId: number } | null }
  at80: { minPeriod: number; crewEvaluated: number; crewViolating: number; violationCount: number; worst: { crewId: string; gapMinutes: number; pairingId: number } | null }
}

const runCompare = (): CompareResult => {
  const out = execFileSync('node', [HARNESS, '--compare', '--from', '2026-06-01', '--to', '2026-07-01'], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return JSON.parse(out) as CompareResult
}

test.describe('Rule 7504/001 — WOCL spacing (min 80 RH) added to workset 103', () => {
  test('Rule-3025 — live param_json carries 7504/001 in workset 103 with Min Period=80 RH', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule7504 = body.data.rules.find((r) => Number(r.function) === 7504 && r.instance === '001')
    expect(rule7504, '7504/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()
    const pj = rule7504!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    // The migrated value: Min Period raised 55 → 80, Unit RH; the WOCL spacing pattern preserved.
    expect(t.rows[0][t.header.indexOf('Min Period')]).toBe('80')
    expect(t.rows[0][t.header.indexOf('Unit')]).toBe('RH')
    expect(t.rows[0][t.header.indexOf('Prev Assignments')]).toBe('FLY')
    expect(t.rows[0][t.header.indexOf('Next Assignments')]).toBe('FLY')
    expect(t.rows[0][t.header.indexOf('Prev Attributes')]).toBe('WOCL')
    expect(t.rows[0][t.header.indexOf('Next Attributes')]).toBe('WOCL')
  })

  test('Rule-3026 — Rust 7504 engine fires more at Min 80 than Min 55 over live June data', async () => {
    const r = runCompare()
    expect(r.params.minPeriod).toBe(80) // the LIVE (migrated) param

    // Same population evaluated in both runs (drifts on the shared demo DB → assert identical
    // + substantial, not a brittle headcount).
    expect(r.at80.crewEvaluated).toBe(r.at55.crewEvaluated)
    expect(r.at80.crewEvaluated).toBeGreaterThan(600)

    // THE USER'S GOAL: raising Min Period 55 → 80 RH triggers STRICTLY MORE warnings. On
    // current data this is ~178 vs ~120 crew and ~390 vs ~240 violations.
    expect(r.at80.violationCount).toBeGreaterThan(r.at55.violationCount)
    expect(r.at80.crewViolating).toBeGreaterThan(r.at55.crewViolating)
    expect(r.at55.violationCount).toBeGreaterThan(0) // even Min 55 catches some
    expect(r.at80.crewViolating).toBeGreaterThan(120)

    // A concrete violation: the tightest WOCL spacing is below the 80h limit, on a real pairing.
    expect(r.at80.worst).not.toBeNull()
    expect(r.at80.worst!.gapMinutes).toBeLessThan(80 * 60)
    expect(r.at80.worst!.pairingId).toBeGreaterThan(0)
  })

  test('Rule-3027 — 7504 WOCL-spacing warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter((x) => x.ruleCode === '7504').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b7504 = bells.filter((v) => v.ruleCode === '7504')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    expect(b7504.length).toBeGreaterThan(0)
    expect(b7504.every((v) => v.severity === 2)).toBe(true)
    expect(b7504.every((v) => v.pairingId > 0)).toBe(true)
    expect(b7504.some((v) => /Rest between consecutive WOCL flight duties \(\d{4}-\d{2}-\d{2}, \d{4}-\d{2}-\d{2}\) is -?\d+:\d{2} less than \d+ RH/.test(v.message))).toBe(true)
    expect(b8002.length).toBeGreaterThan(0)

    // ── Alert Center dialog shows the 7504 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows7504 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="7504/001"]')
    await expect.poll(() => rows7504.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first7504 = rows7504.first()
    await expect(first7504).toContainText('7504/001')
    await expect(first7504).toContainText('WOCL flight duties')
    await expect(first7504).toContainText('less than')
    const crew7504 = await first7504.getAttribute('data-crew-id')
    expect(crew7504 && crew7504.length > 0).toBeTruthy()

    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '7504/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
