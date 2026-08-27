/**
 * Rule 7503/001 (LIMITS OF CONSECUTIVE WOCLs) + its dependency 7500/001 (Acc State) —
 * C++→Rust→Gantt migration. A RELATED PAIR: 7500 is a definition rule (no violations) that
 * supplies the acclimatisation timezone 7503 evaluates the WOCL window in; 7503 also reuses
 * rule 2014's Local Night Definition to reset its consecutive-run counter.
 *
 * Both were added to workset 103 "PBS Solver Ruleset" (the gantt's active group) and 7503's
 * MAX CONSECUTIVE WOCLs lowered 3 → 2 so the many crew with 3 consecutive WOCL-touching
 * duties surface as Overridable (amber, sev 2) warnings — see
 * `sql/migration/2026-06-15-rule-7503-001-and-7500-001-add-to-103-maxwocl-2.sql`.
 *
 *   Rule-3022 — the LIVE params (read through the Legality API the gantt consumes) carry
 *               BOTH 7503/001 (WOCL 02:00–05:59, Max=2) AND its dependency 7500/001 in 103.
 *   Rule-3023 — drive the proven Rust 7503 engine over live June roster data and assert the
 *               invariant: lowering MAX 3 → 2 triggers STRICTLY MORE warnings (~14 vs ~4
 *               crew over the same population) — the user's goal.
 *   Rule-3024 — THE END GOAL: 7503 WOCL warnings reach the planner's gantt (bell data +
 *               Alert Center, "Concecutive WOCL duties(N)…"), AND the 8002 alarms are STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-7503-wocl.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7503-wocl.mjs')

const WORKSET_PBS_SOLVER = 103

interface CompareResult {
  params: { woclStartMin: number; woclEndMin: number; maxConsecutive: number }
  at3: { maxConsecutive: number; crewEvaluated: number; crewViolating: number; violationCount: number; worst: { crewId: string; count: number; pairingId: number } | null }
  at2: { maxConsecutive: number; crewEvaluated: number; crewViolating: number; violationCount: number; worst: { crewId: string; count: number; pairingId: number } | null }
}

/** Run the Rust 7503 engine over live June data in --compare mode (MAX 3 vs 2). */
const runCompare = (): CompareResult => {
  const out = execFileSync('node', [HARNESS, '--compare', '--from', '2026-06-01', '--to', '2026-07-01'], {
    cwd: path.join(REPO, 'live-server'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  })
  return JSON.parse(out) as CompareResult
}

test.describe('Rule 7503/001 — consecutive WOCLs (max 2) + 7500/001 dependency added to 103', () => {
  test('Rule-3022 — live param_json carries 7503/001 (Max=2) AND its 7500/001 dependency in 103', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    // 7503/001 with WOCL window + the migrated Max=2.
    const rule7503 = body.data.rules.find((r) => Number(r.function) === 7503 && r.instance === '001')
    expect(rule7503, '7503/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()
    const pj = rule7503!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    expect(t.rows[0][t.header.indexOf('WOCL Start')]).toBe('02:00')
    expect(t.rows[0][t.header.indexOf('WOCL End')]).toBe('05:59')
    expect(t.rows[0][t.header.indexOf('Max Consecutive WOCLs')]).toBe('2')

    // The DEPENDENCY 7500/001 (Acc State) is also present in 103 (the point of "multiple
    // rules use 7500"): 7503 evaluates the WOCL window in 7500's acclimatisation timezone.
    const rule7500 = body.data.rules.find((r) => Number(r.function) === 7500 && r.instance === '001')
    expect(rule7500, '7500/001 (Acc State) dependency must be in 103 alongside 7503').toBeTruthy()
  })

  test('Rule-3023 — Rust 7503 engine fires more at Max 2 than Max 3 over live June data', async () => {
    const r = runCompare()
    expect(r.params.maxConsecutive).toBe(2) // the LIVE (migrated) param

    // Same population evaluated in both runs (drifts on the shared demo DB → assert identical
    // + substantial, not a brittle headcount).
    expect(r.at2.crewEvaluated).toBe(r.at3.crewEvaluated)
    expect(r.at2.crewEvaluated).toBeGreaterThan(600)

    // THE USER'S GOAL: lowering MAX 3 → 2 triggers STRICTLY MORE warnings. On current data
    // this is ~14 vs ~4 crew (≈3.5×).
    expect(r.at2.violationCount).toBeGreaterThan(r.at3.violationCount)
    expect(r.at2.crewViolating).toBeGreaterThan(r.at3.crewViolating)
    expect(r.at3.violationCount).toBeGreaterThan(0) // even the strict Max=3 catches some
    expect(r.at2.violationCount).toBeGreaterThanOrEqual(r.at3.violationCount * 2)

    // A concrete violation: the worst run exceeds the limit, on a real pairing.
    expect(r.at2.worst).not.toBeNull()
    expect(r.at2.worst!.count).toBeGreaterThan(2)
    expect(r.at2.worst!.pairingId).toBeGreaterThan(0)
  })

  test('Rule-3024 — 7503 WOCL warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            return (t?.liveViolations?.() ?? []).filter((x) => x.ruleCode === '7503').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b7503 = bells.filter((v) => v.ruleCode === '7503')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    expect(b7503.length).toBeGreaterThan(0)
    expect(b7503.every((v) => v.severity === 2)).toBe(true)
    expect(b7503.every((v) => v.pairingId > 0)).toBe(true)
    expect(b7503.some((v) => /Concecutive WOCL duties\(\d+\) is more than the limitation\(2\)/.test(v.message))).toBe(true)
    expect(b8002.length).toBeGreaterThan(0)

    // ── Alert Center dialog shows the 7503 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows7503 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="7503/001"]')
    await expect.poll(() => rows7503.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first7503 = rows7503.first()
    await expect(first7503).toContainText('7503/001')
    await expect(first7503).toContainText('WOCL duties')
    const crew7503 = await first7503.getAttribute('data-crew-id')
    expect(crew7503 && crew7503.length > 0).toBeTruthy()

    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '7503/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
