/**
 * Rule 8030/001 (PILOT AGE, "Age Restriction") — C++→Rust→Gantt migration, rule #4.
 *
 * 8030/001 caps how many crew of a DIVISION aged ≥ AGE DEFINE may share a flight
 * (DIVISION=P, AIRPORT=*, MAX NUMBER=1). It was added to workset 103 "PBS Solver Ruleset"
 * (the gantt's active group) and its AGE DEFINE lowered 65 → 35 so the many flights crewed
 * by two pilots over 35 surface as Overridable (amber, sev 2) warnings — see
 * `sql/migration/2026-06-15-rule-8030-001-add-to-103-age35.sql`.
 *
 *   Rule-3013 — the LIVE param (read through the Legality API the gantt consumes) really
 *               carries 8030/001 in workset 103 with Division=P, Age Define=35, Max Number=1.
 *   Rule-3014 — drive the proven Rust 8030 engine over live June roster data and assert the
 *               invariant: lowering AGE DEFINE 65 → 35 triggers STRICTLY MORE warnings
 *               (~541 vs ~2 violations over the same flight population) — the user's goal.
 *   Rule-3015 — THE END GOAL: 8030 age warnings reach the planner's gantt (bell data +
 *               Alert Center, message "older than 35"), AND the 8002 alarms are STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-8030-age.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-8030-age.mjs')

const WORKSET_PBS_SOLVER = 103

interface AgeResult {
  ageLimit: number
  division: string
  maxNumber: number
  flightsEvaluated: number
  flightsFiring: number
  crewViolating: number
  violationCount: number
  oldest: { crewId: string; ageYears: number; pairingId: number; flightId?: number; onFlightCount: number } | null
}

/** Run the Rust 8030 engine over live June data for a given AGE DEFINE, parse JSON. */
const runAge = (ageLimit: number): AgeResult => {
  const out = execFileSync(
    'node',
    [HARNESS, String(ageLimit), '--from', '2026-06-01', '--to', '2026-07-01'],
    {
      cwd: path.join(REPO, 'live-server'),
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    },
  )
  return JSON.parse(out) as AgeResult
}

test.describe('Rule 8030/001 — pilot age (35) added to workset 103', () => {
  test('Rule-3013 — live param_json carries 8030/001 in workset 103 with Age Define=35', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule8030 = body.data.rules.find((r) => Number(r.function) === 8030 && r.instance === '001')
    expect(rule8030, '8030/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()

    const pj = rule8030!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const table = pj.tables[0]
    const ageIdx = table.header.indexOf('Age Define')
    const divIdx = table.header.indexOf('Division')
    const maxIdx = table.header.indexOf('Max Number')
    expect(ageIdx).toBeGreaterThanOrEqual(0)

    // The migrated value: AGE DEFINE lowered 65 → 35, Division=P, Max Number=1.
    expect(table.rows[0][ageIdx]).toBe('35')
    expect(table.rows[0][divIdx]).toBe('P')
    expect(table.rows[0][maxIdx]).toBe('1')
  })

  test('Rule-3014 — Rust 8030 engine fires far more at age 35 than 65 over live June data', async () => {
    const at35 = runAge(35)
    const at65 = runAge(65)

    // Same flight population evaluated in both runs (the June FLY set; its exact size drifts
    // on the shared demo DB, so assert it is IDENTICAL across runs and substantial).
    expect(at35.flightsEvaluated).toBe(at65.flightsEvaluated)
    expect(at35.flightsEvaluated).toBeGreaterThan(1000)

    // THE USER'S GOAL: lowering AGE DEFINE 65 → 35 triggers STRICTLY MORE warnings. On the
    // current data this is ~541 vs ~2 violations and ~263 vs ~1 firing flights.
    expect(at35.violationCount).toBeGreaterThan(at65.violationCount)
    expect(at35.flightsFiring).toBeGreaterThan(at65.flightsFiring)
    expect(at35.violationCount).toBeGreaterThan(at65.violationCount * 10)
    expect(at35.crewViolating).toBeGreaterThan(50)

    // A concrete violation: the oldest flagged pilot is well over 35, on a real pairing,
    // sharing the flight with at least one other over-age pilot (count > MAX=1).
    expect(at35.oldest).not.toBeNull()
    expect(at35.oldest!.ageYears).toBeGreaterThan(35)
    expect(at35.oldest!.pairingId).toBeGreaterThan(0)
    expect(at35.oldest!.onFlightCount).toBeGreaterThan(1)
  })

  test('Rule-3015 — 8030 age warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page) // default no-filter apply → full bootstrap load

    // ── BELL data source carries the 8030 rule code (loaded async after first paint) ──
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            const v = t?.liveViolations?.() ?? []
            return v.filter((x) => x.ruleCode === '8030').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b8030 = bells.filter((v) => v.ruleCode === '8030')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    // END GOAL part 1: 8030 age warnings present, Overridable (sev 2), on real pairings,
    // with the "older than 35" message.
    expect(b8030.length).toBeGreaterThan(0)
    expect(b8030.every((v) => v.severity === 2)).toBe(true)
    expect(b8030.every((v) => v.pairingId > 0)).toBe(true)
    expect(b8030.some((v) => /older than 35/.test(v.message))).toBe(true)
    // END GOAL part 2: 8002 alarms are STILL there (both rules coexist).
    expect(b8002.length).toBeGreaterThan(0)

    // ── Alert Center dialog shows the 8030 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows8030 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8030/001"]')
    await expect.poll(() => rows8030.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first8030 = rows8030.first()
    await expect(first8030).toContainText('8030/001')
    await expect(first8030).toContainText('older than 35')
    const crew8030 = await first8030.getAttribute('data-crew-id')
    expect(crew8030 && crew8030.length > 0).toBeTruthy()

    // 8002 rows are STILL present in the same Alert Center.
    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    // Group by RULE → distinct sidebar groups for BOTH instances coexist.
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8030/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
