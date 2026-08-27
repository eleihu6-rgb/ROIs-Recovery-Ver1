/**
 * Rule 7506/001 (ONE CHECKIN PER DAY) — C++→Rust→Gantt migration, rule #10.
 *
 * 7506/001 (source: rule/rule7506/SingleDailyCheckinForCARSRule.cpp `CheckRuleForCrew`;
 * oracle: RuleTest/rule7506_gtest.cpp) — a crew may CHECK IN at most once per crew-LOCAL
 * calendar day for the checked assignment groups (F8 = "FLY"). Two FLY pairings (check-ins)
 * whose START local-days are equal → violation (severity 1, ROSTER). Message:
 * "Multiple check-ins per day (YYYY-MM-DD)." (crew-base local date).
 *
 * Like 7505, NO param bump was needed — the real F8 config already flags honest live cases
 * (79 violations / 74 crew in June 2026: crew given two separate FLY pairings the same local
 * day). 7506/001 was mapped into workset 103 (`2026-06-15-rule-7506-001-add-to-103.sql`).
 *
 *   Rule-3031 — the LIVE param (Legality API the gantt consumes) carries 7506/001 in workset
 *               103 with the FLY checked-group param (Bases/Ranks/Fleets/Teams unrestricted,
 *               Assignments = FLY).
 *   Rule-3032 — drive the proven Rust 7506 engine over live June; assert it fires honestly
 *               (>0 violations, <total check-ins, every breach attachable to a pairing).
 *   Rule-3033 — THE END GOAL: 7506 "one local day" warnings reach the planner's gantt (bell
 *               data + Alert Center, sev 1), AND the 8002 alarms are STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-7506-checkin.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7506-checkin.mjs')
const WORKSET_PBS_SOLVER = 103

interface CheckinResult {
  checkedRaw: string
  flyCheckins: number
  crewEvaluated: number
  violations: number
  crewViolating: number
  attachable: number
  unattached: number
}

/** Run the Rust 7506 engine over live June data (report-only, JSON). */
const runCheckin = (): CheckinResult => {
  const out = execFileSync(
    'node',
    [HARNESS, '--from', '2026-06-01', '--to', '2026-07-01', '--json'],
    {
      cwd: path.join(REPO, 'live-server'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    },
  )
  return JSON.parse(out) as CheckinResult
}

test.describe('Rule 7506/001 — One Checkin Per Day (added to workset 103)', () => {
  test('Rule-3031 — live param_json carries 7506/001 in workset 103 with the FLY checked group', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule = body.data.rules.find((r) => Number(r.function) === 7506 && r.instance === '001')
    expect(rule, '7506/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()

    const pj = rule!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    const col = (name: string) => t.header.indexOf(name)
    expect(t.rows.length).toBeGreaterThanOrEqual(1)
    // The checked assignment group is FLY (the rule fires on FLY check-ins).
    expect(t.rows[0][col('Assignments')]).toBe('FLY')
    // Applicability is unrestricted (*/*/*/*).
    for (const c of ['Bases', 'Ranks', 'Fleets', 'Teams']) {
      expect(t.rows[0][col(c)]).toBe('*')
    }
  })

  test('Rule-3032 — Rust 7506 fires honestly on live June, every breach attached to a pairing', async () => {
    const r = runCheckin()
    expect(r.checkedRaw).toBe('FLY')

    // The whole live crew was evaluated over many FLY check-ins.
    expect(r.crewEvaluated).toBeGreaterThan(600)
    expect(r.flyCheckins).toBeGreaterThan(1000)

    // Fires honestly: SOME crew double-book a local day, but far from all check-ins.
    expect(r.violations).toBeGreaterThan(0)
    expect(r.crewViolating).toBeGreaterThan(0)
    expect(r.violations).toBeLessThan(r.flyCheckins)

    // Every breach is attachable to a triggering pairing (the gantt drops pairing_id NULL),
    // so nothing is silently lost.
    expect(r.attachable).toBe(r.violations)
    expect(r.unattached).toBe(0)
  })

  test('Rule-3033 — 7506 one-local-day warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page) // default no-filter apply → full bootstrap load

    // ── BELL data source carries the 7506 rule code (loaded async after first paint) ──
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            const v = t?.liveViolations?.() ?? []
            return v.filter((x) => x.ruleCode === '7506').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b7506 = bells.filter((v) => v.ruleCode === '7506')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    // END GOAL part 1: 7506 warnings present, Soft (sev 1), on real pairings, with
    // crew-base local date in the message.
    expect(b7506.length).toBeGreaterThan(0)
    expect(b7506.every((v) => v.severity === 1)).toBe(true)
    expect(b7506.every((v) => v.pairingId > 0)).toBe(true)
    expect(b7506.some((v) => /Multiple check-ins per day \(\d{4}-\d{2}-\d{2}\)\./.test(v.message))).toBe(true)
    // END GOAL part 2: 8002 alarms are STILL there (both rules coexist).
    expect(b8002.length).toBeGreaterThan(0)

    // ── Alert Center dialog shows the 7506 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows7506 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="7506/001"]')
    await expect.poll(() => rows7506.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first7506 = rows7506.first()
    await expect(first7506).toContainText('7506/001')
    await expect(first7506).toContainText('Multiple check-ins per day')
    const crew7506 = await first7506.getAttribute('data-crew-id')
    expect(crew7506 && crew7506.length > 0).toBeTruthy()

    // 8002 rows are STILL present in the same Alert Center.
    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    // Group by RULE → distinct sidebar groups for BOTH coexist.
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '7506/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
