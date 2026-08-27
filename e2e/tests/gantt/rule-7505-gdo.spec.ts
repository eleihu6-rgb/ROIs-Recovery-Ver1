/**
 * Rule 7505/001 (MIN # GDOs IN A RP) — C++→Rust→Gantt migration, rule #9.
 *
 * 7505/001 requires each crew to have at least MIN DO "days off" in the rostering period.
 * A day off = a calendar day that is blank (Count Blank Day=Y), or covered only by DO-group
 * assignments (live roster code 'DO') or a LAYOVER. The applicable band row is chosen by RP
 * length (June = 30 days → 30-30 rows) AND the crew's leave (VAC) day-count — more leave ⇒
 * fewer required days off. Violation ⇔ daysOff < MIN DO (strict), severity Soft (sev 1).
 *
 * UNLIKE every prior migrated rule, 7505 needed NO artificial param bump — the real F8 band
 * already flags ~191 of 812 crew in live June. Its 27 band rows were first RESTORED from the
 * legacy 433 ruleset (the GUI had shown only 1 of 27 — see Legal-6010); then 7505/001 was
 * mapped into workset 103 (`2026-06-15-rule-7505-001-add-to-103.sql`).
 *
 *   Rule-3028 — the LIVE param (Legality API the gantt consumes) carries 7505/001 in workset
 *               103 with the full band: 27 rows, Period=1, Unit=RP, a 30-30 / VAC 0-1 / MIN DO
 *               12 row, and the band sliding MIN DO down as leave rises.
 *   Rule-3029 — drive the proven Rust 7505 engine over live June; assert the band fires
 *               honestly (>100 crew, multiple distinct required MIN DO via leave-band
 *               selection) AND is param-sensitive: raising MIN DO (+1) fires STRICTLY MORE.
 *   Rule-3030 — THE END GOAL: 7505 "number of days off" warnings reach the planner's gantt
 *               (bell data + Alert Center, sev 1), AND the 8002 alarms are STILL there.
 *
 * §No-Illusion: every assertion checks concrete numbers/text computed against live data.
 * Engine harness: live-server/scripts/check-7505-gdo.mjs (the persisted pipeline).
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7505-gdo.mjs')
const WORKSET_PBS_SOLVER = 103

interface GdoResult {
  rpDays: number
  bandRows: number
  minDoBump: number
  crewEvaluated: number
  crewViolating: number
  byRequiredMinDo: Record<string, number>
  worst: Array<{ crewId: string; daysOff: number; minDo: number }>
}

/** Run the Rust 7505 engine over live June data for a given in-memory MIN-DO bump. */
const runGdo = (bump: number): GdoResult => {
  const out = execFileSync(
    'node',
    [HARNESS, '--from', '2026-06-01', '--to', '2026-07-01', '--bump', String(bump)],
    {
      cwd: path.join(REPO, 'live-server'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    },
  )
  return JSON.parse(out) as GdoResult
}

test.describe('Rule 7505/001 — Min # GDOs in a RP (added to workset 103)', () => {
  test('Rule-3028 — live param_json carries 7505/001 in workset 103 with the full 27-row band', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    const rule = body.data.rules.find((r) => Number(r.function) === 7505 && r.instance === '001')
    expect(rule, '7505/001 must now be in PBS Solver Ruleset (workset 103)').toBeTruthy()

    const pj = rule!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    const col = (name: string) => t.header.indexOf(name)
    // The full band was restored: 27 rows (14 RP 31-31 + 13 RP 30-30).
    expect(t.rows).toHaveLength(27)
    expect(t.rows.filter((r) => r[col('RP Days Range')] === '30-30')).toHaveLength(13)

    // Every row is Period=1, Unit=RP (a single rostering period).
    expect(t.rows.every((r) => r[col('Period')] === '1' && r[col('Unit')] === 'RP')).toBe(true)

    // The June-relevant row: 30-30, VAC 0-1, requires MIN DO 12.
    const row = t.rows.find(
      (r) => r[col('RP Days Range')] === '30-30' && r[col('Leave Days Range')] === '0-1',
    )
    expect(row, 'the 30-30 / VAC 0-1 row exists').toBeTruthy()
    expect(row![col('Min DO')]).toBe('12')
    expect(row![col('Count Blank Day')]).toBe('Y')
    // The band slides: a high-leave 30-30 row requires fewer days off than the 0-1 row.
    const highLeave = t.rows.find(
      (r) => r[col('RP Days Range')] === '30-30' && r[col('Leave Days Range')] === '29-30',
    )
    expect(Number(highLeave![col('Min DO')])).toBeLessThan(Number(row![col('Min DO')]))
  })

  test('Rule-3029 — Rust 7505 fires honestly on the real band AND raising MIN DO fires strictly more', async () => {
    const real = runGdo(0)
    const bumped = runGdo(1)

    // June RP = 30 days; the full 27-row band drove the engine.
    expect(real.rpDays).toBe(30)
    expect(real.bandRows).toBe(27)
    expect(real.minDoBump).toBe(0)

    // The real F8 band flags a substantial, honest population (no artificial bump needed).
    expect(real.crewEvaluated).toBeGreaterThan(600)
    expect(real.crewViolating).toBeGreaterThan(100)

    // The leave-band SELECTION works: crew fire against MORE THAN ONE required MIN DO
    // (most against 12 / VAC 0-1, but VAC crew against lower floors like 6/9/10/11).
    const distinctMins = Object.keys(real.byRequiredMinDo).length
    expect(distinctMins).toBeGreaterThan(1)
    expect(Math.min(...Object.keys(real.byRequiredMinDo).map(Number))).toBeLessThan(12)

    // A concrete worst crew: positive days off, below its required MIN DO.
    expect(real.worst.length).toBeGreaterThan(0)
    expect(real.worst[0].daysOff).toBeLessThan(real.worst[0].minDo)
    expect(real.worst[0].daysOff).toBeGreaterThanOrEqual(0)

    // PARAM-SENSITIVITY: the param drives the engine — raising the floor (+1) fires STRICTLY
    // MORE (same crew population, identical band shape, only MIN DO raised).
    expect(bumped.crewEvaluated).toBe(real.crewEvaluated)
    expect(bumped.crewViolating).toBeGreaterThan(real.crewViolating)
  })

  test('Rule-3030 — 7505 days-off warnings reach the gantt AND 8002 is still there', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page) // default no-filter apply → full bootstrap load

    // ── BELL data source carries the 7505 rule code (loaded async after first paint) ──
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as unknown as { __ganttTest?: { liveViolations?: () => Array<{ ruleCode: string }> } }).__ganttTest
            const v = t?.liveViolations?.() ?? []
            return v.filter((x) => x.ruleCode === '7505').length
          }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const bells = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => Array<{ ruleCode: string; severity: number; message: string; pairingId: number }> } }).__ganttTest
      return t.liveViolations()
    })
    const b7505 = bells.filter((v) => v.ruleCode === '7505')
    const b8002 = bells.filter((v) => v.ruleCode === '8002')
    // END GOAL part 1: 7505 days-off warnings present, Soft (sev 1), on real pairings,
    // with the verbatim C++ "number of days off … must be at least … in 1 RP" message.
    expect(b7505.length).toBeGreaterThan(0)
    expect(b7505.every((v) => v.severity === 1)).toBe(true)
    expect(b7505.every((v) => v.pairingId > 0)).toBe(true)
    expect(b7505.some((v) => /number of days off\(\d+\) must be at least \d+ in 1 RP/.test(v.message))).toBe(true)
    // END GOAL part 2: 8002 alarms are STILL there (both rules coexist).
    expect(b8002.length).toBeGreaterThan(0)

    // 7505 is crew-bell / Alert Center only — no roster puck “!” for 7505-only (crew,pairing).
    const noPuck = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { live7505HasNoPuckBadge: () => boolean } }).__ganttTest
      return t.live7505HasNoPuckBadge()
    })
    expect(noPuck, '7505-only findings must not paint roster puck badges').toBe(true)

    // ── Alert Center dialog shows the 7505 instance ───────────────────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()

    const rows7505 = dialog.locator('[data-testid="violation-list-row"][data-rule-id="7505/001"]')
    await expect.poll(() => rows7505.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    const first7505 = rows7505.first()
    await expect(first7505).toContainText('7505/001')
    await expect(first7505).toContainText('days off')
    const crew7505 = await first7505.getAttribute('data-crew-id')
    expect(crew7505 && crew7505.length > 0).toBeTruthy()

    // 8002 rows are STILL present in the same Alert Center.
    const rows8002 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]')
    await expect.poll(() => rows8002.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)

    // Group by RULE → distinct sidebar groups for BOTH coexist.
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '7505/001' })).toHaveCount(1)
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '8002/001' })).toHaveCount(1)
  })
})
