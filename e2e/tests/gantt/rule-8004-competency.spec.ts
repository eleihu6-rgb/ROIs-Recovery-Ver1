/**
 * Rule 8004/001 (BASIC COMPETENCY — BASE, "Basic Competency-F8") — C++→Rust→Gantt, rule #5.
 *
 * 8004/001 verifies each roster's base is a valid crew_base during the roster span. It has
 * three Type rows; only BASE has Enable Check=Y (RANK/FLEET=N). It was added to workset 103
 * "PBS Solver Ruleset" (the gantt's active group) with no param change — the enabled BASE
 * check already fires on the live roster (crew based elsewhere flying a based pairing) as
 * Overridable (amber, sev 2) warnings — see
 * `sql/migration/2026-06-15-rule-8004-001-add-to-103.sql`.
 *
 *   Rule-3016 — the LIVE param (read through the Legality API the gantt consumes) really
 *               carries 8004/001 in workset 103 with BASE enabled, RANK/FLEET disabled.
 *   Rule-3017 — drive the proven Rust 8004 engine over live June roster data and assert it
 *               produces meaningful base-competency violations (some but not all rosters):
 *               0 < violations ≤ rosters-with-base, on a concrete crew.
 *   Rule-3018 — THE END GOAL: 8004 base warnings reach the planner's gantt (bell data +
 *               Alert Center, "No base (…) assigned in roster"), AND 8002 is STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-8004-competency.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-8004-competency.mjs')

const WORKSET_PBS_SOLVER = 103

interface CompResult {
  graceDays: number
  rostersWithBase: number
  crewEvaluated: number
  crewViolating: number
  violationCount: number
  sample: { crewId: string; pairingId: number; base: string } | null
}

/** Run the Rust 8004 engine over live June data, parse JSON. */
const runComp = (): CompResult => {
  const out = execFileSync('node', [HARNESS, '0', '--from', '2026-06-01', '--to', '2026-07-01'], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return JSON.parse(out) as CompResult
}

test.describe('Rule 8004/001 — basic competency (BASE) added to workset 103', () => {
  test('Rule-3016 — live param_json carries 8004/001 in workset 103 with BASE enabled only', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule8004 = body.data.rules.find((r) => Number(r.function) === 8004 && r.instance === '001')
    expect(rule8004, '8004/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()

    const pj = rule8004!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const table = pj.tables[0]
    const typeIdx = table.header.indexOf('Type')
    const enableIdx = table.header.indexOf('Enable Check')
    expect(typeIdx).toBeGreaterThanOrEqual(0)
    expect(enableIdx).toBeGreaterThanOrEqual(0)

    // BASE row is enabled (Y); RANK and FLEET rows are disabled (N) — the live config.
    const baseRow = table.rows.find((r) => r[typeIdx] === 'BASE')
    const rankRow = table.rows.find((r) => r[typeIdx] === 'RANK')
    const fleetRow = table.rows.find((r) => r[typeIdx] === 'FLEET')
    expect(baseRow, 'a BASE row must exist').toBeTruthy()
    expect(baseRow![enableIdx]).toBe('Y')
    expect(rankRow![enableIdx]).toBe('N')
    expect(fleetRow![enableIdx]).toBe('N')
  })

  test('Rule-3017 — Rust 8004 engine produces meaningful base violations over live June data', async () => {
    const r = runComp()

    // A substantial population is evaluated; some rosters carry a real (non-empty) base.
    expect(r.crewEvaluated).toBeGreaterThan(300)
    expect(r.rostersWithBase).toBeGreaterThan(0)

    // The BASE check fires on SOME but NOT ALL real-base rosters (crew based elsewhere flying
    // a based pairing). On the current data this is ~142 of ~242 rosters-with-base.
    expect(r.violationCount).toBeGreaterThan(0)
    expect(r.violationCount).toBeLessThanOrEqual(r.rostersWithBase)
    expect(r.crewViolating).toBeGreaterThan(0)

    // A concrete violation: a real crew flying a real-base pairing they aren't based for.
    expect(r.sample).not.toBeNull()
    expect(r.sample!.crewId.length).toBeGreaterThan(0)
    expect(r.sample!.pairingId).toBeGreaterThan(0)
    expect(r.sample!.base.length).toBeGreaterThan(0)
  })

  test('Rule-3018 — 8004 base warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page) // default no-filter apply → full bootstrap load

    // ── BELL data source carries the 8004 rule code (loaded async after first paint) ──
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            const v = t?.liveViolations?.() ?? []
            return v.filter((x) => x.ruleCode === '8004').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b8004 = bells.filter((v) => v.ruleCode === '8004')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    // END GOAL part 1: 8004 base warnings present, Overridable (sev 2), on real pairings,
    // with the "No base (…) assigned in roster" message.
    expect(b8004.length).toBeGreaterThan(0)
    expect(b8004.every((v) => v.severity === 2)).toBe(true)
    expect(b8004.every((v) => v.pairingId > 0)).toBe(true)
    expect(b8004.some((v) => /No base \(.*\) assigned in roster/.test(v.message))).toBe(true)
    // END GOAL part 2: 8002 alarms are STILL there (both rules coexist).
    expect(b8002.length).toBeGreaterThan(0)

    // ── Alert Center dialog shows the 8004 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows8004 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8004/001"]')
    await expect.poll(() => rows8004.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first8004 = rows8004.first()
    await expect(first8004).toContainText('8004/001')
    await expect(first8004).toContainText('assigned in roster')
    const crew8004 = await first8004.getAttribute('data-crew-id')
    expect(crew8004 && crew8004.length > 0).toBeTruthy()

    // 8002 rows are STILL present in the same Alert Center.
    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    // Group by RULE → distinct sidebar groups for BOTH instances coexist.
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8004/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
