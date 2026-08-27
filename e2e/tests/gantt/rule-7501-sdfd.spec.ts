/**
 * Rule 7501/001 (SINGLE DAY FREE FROM DUTY) + its dependency 2014/001 (Local Night
 * Definition) — C++→Rust→Gantt migration, rule #6.
 *
 * 7501 requires at least MIN LIMITS "single days free from duty" (SDFD) in every rolling
 * PERIOD-hour window. An SDFD = a True Rest covering TWO CONSECUTIVE local nights. The
 * local-night band comes from rule 2014 (the parameter source 7501 depends on), so both
 * were added to workset 103 and the live row-1 Min Limits was raised 1 → 3 to make the
 * check fire readily ("3 free days per rolling 7 days").
 *
 *   Rule-3019 — the LIVE params (through the Legality API the gantt consumes) carry
 *               7501/001 in workset 103 with row-1 = 168 RH / buffer 00:30 / Min Limits 3,
 *               AND 2014/001 Local Night Definition = 22:00 / 08:00 / 8h.
 *   Rule-3020 — drive the proven Rust 7501 engine over live June data: raising Min Limits
 *               1 → 3 strictly increases the violating-crew count (the point of the change).
 *               Invariants, not brittle headcounts (the shared demo DB drifts).
 *   Rule-3021 — the gantt LEGALITY tab renders 7501/001 + 2014/001 in ruleset 103; AND the
 *               migrated 7501 violations reach the planner via the bell data + Alert Center,
 *               coexisting with the previously-migrated 8002 / 8056 alarms.
 *
 * §No-Illusion: every assertion checks concrete values served/computed from live data.
 * Engine harness: live-server/scripts/check-7501-sdfd.mjs.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const HARNESS = path.join(REPO, 'live-server', 'scripts', 'check-7501-sdfd.mjs')
const WORKSET_PBS_SOLVER = 103

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }

interface Summary {
  minLimits: number
  crewEvaluated: number
  crewViolating: number
  worst: { crewId: string; totalSdfd: number; triggerPairingId: number | null } | null
}
interface CompareResult {
  params: {
    periodHours: number
    unit: string
    bufferMin: number
    minLimits: number
    nightStartMin: number
    nightEndMin: number
    minRestMin: number
  }
  at1: Summary
  atConfigured: Summary
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

test.describe('Rule 7501/001 — Single Day Free from Duty (+2014 Local Night Definition)', () => {
  test('Rule-3019 — live param_json carries 7501/001 (168 RH/MinLimits 3) + 2014/001 in workset 103', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }

    // 7501/001 SDFD — row 0 = 168 RH, buffer 00:30, Min Limits 3 (the param change).
    const rule7501 = body.data.rules.find((r) => Number(r.function) === 7501 && r.instance === '001')
    expect(rule7501, '7501/001 must be in PBS Solver Ruleset (workset 103)').toBeTruthy()
    const pj = rule7501!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const h = pj.tables[0].header
    const row0 = pj.tables[0].rows[0]
    const iPeriod = h.indexOf('Period')
    const iUnit = h.indexOf('Unit')
    const iMin = h.indexOf('Min Limits')
    expect(iPeriod).toBeGreaterThanOrEqual(0)
    expect(row0[iPeriod]).toBe('168')
    expect(row0[iUnit]).toBe('RH')
    expect(row0[iMin]).toBe('3') // raised 1 → 3

    // 2014/001 Local Night Definition — the band 7501 depends on (22:00 / 08:00 / 8h).
    const rule2014 = body.data.rules.find((r) => Number(r.function) === 2014 && r.instance === '001')
    expect(rule2014, '2014/001 Local Night Definition must be in workset 103').toBeTruthy()
    const nightPj = rule2014!.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const nightRow = nightPj.tables[0].rows[0]
    expect(nightRow).toContain('22:00') // Local Night Start
    expect(nightRow).toContain('08:00') // Local Night End / Min Interval
  })

  test('Rule-3020 — Rust 7501 engine: raising Min Limits 1 → 3 strictly increases violations', async () => {
    const r = runCompare()

    // Params sourced from the LIVE param_json (config ↔ engine never drift).
    expect(r.params.periodHours).toBe(168)
    expect(r.params.unit).toBe('RH')
    expect(r.params.minLimits).toBe(3)
    expect(r.params.nightStartMin).toBe(22 * 60) // 22:00
    expect(r.params.nightEndMin).toBe(8 * 60) //   08:00
    expect(r.params.minRestMin).toBe(8 * 60) //    8h

    // A substantial population is evaluated (the June roster has ~700 crew with activity).
    expect(r.at1.crewEvaluated).toBeGreaterThan(600)
    expect(r.atConfigured.crewEvaluated).toBe(r.at1.crewEvaluated)

    // The CORE invariant: 3 SDFD/168h is strictly harder than 1 → more crew fire.
    expect(r.at1.crewViolating).toBeGreaterThan(0)
    expect(r.atConfigured.crewViolating).toBeGreaterThan(r.at1.crewViolating)
    // The worst crew has fewer SDFDs than the limit, attributed to a concrete crew.
    expect(r.atConfigured.worst).not.toBeNull()
    expect(r.atConfigured.worst!.totalSdfd).toBeLessThan(3)
    expect(r.atConfigured.worst!.crewId.length).toBeGreaterThan(0)
  })

  test('Rule-3021 — Legality tab shows 7501/001 + 2014/001, and 7501 fires on the gantt with 8002/8056', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')

    // ── The gantt LEGALITY (config) tab renders 7501/001 + 2014/001 in workset 103 ──
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    await expect(page.getByTestId('legality-rule-name-7501-001'))
      .toHaveText('7501/001 - Single Day Free from Duty in Rolling Hours')
    await expect(page.getByTestId('legality-rule-name-2014-001'))
      .toHaveText('2014/001 - Local Night Definition')

    // 7501 params: the 168 RH row + the raised Min Limits 3 + buffer 00:30.
    await page.getByTestId('legality-rule-edit-7501-001').click()
    const p7501 = page.getByTestId('legality-params-7501-001')
    await expect(p7501).toBeVisible()
    await expect(p7501.getByText('168', { exact: true }).first()).toBeVisible()
    await expect(p7501.getByText('00:30', { exact: true }).first()).toBeVisible()

    // 2014 params: the local-night band values.
    await page.getByTestId('legality-rule-edit-2014-001').click()
    const p2014 = page.getByTestId('legality-params-2014-001')
    await expect(p2014).toBeVisible()
    await expect(p2014.getByText('22:00', { exact: true }).first()).toBeVisible()
    await expect(p2014.getByText('08:00', { exact: true }).first()).toBeVisible()

    // ── 7501 violations reach the gantt (bell data) alongside 8002 + 8056 ───────────
    await gotoGantt(page)
    await expect
      .poll(
        () => page.evaluate(() => {
          const t = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViol[] } }).__ganttTest
          return (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '7501').length
        }),
        { timeout: 30_000, intervals: [500] },
      )
      .toBeGreaterThan(0)

    const byCode = await page.evaluate(() => {
      const t = (window as unknown as { __ganttTest: { liveViolations: () => LiveViol[] } }).__ganttTest
      const v = t.liveViolations()
      return {
        sdfd: v.filter((x) => x.ruleCode === '7501'),
        block: v.filter((x) => x.ruleCode === '8002').length,
        spacing: v.filter((x) => x.ruleCode === '8056').length,
      }
    })
    // 7501 present, attached to real pairings, with the SDFD message + severity 1.
    expect(byCode.sdfd.length).toBeGreaterThan(0)
    expect(byCode.sdfd.every((v) => v.pairingId > 0)).toBe(true)
    expect(byCode.sdfd.some((v) => /single day free from duty/i.test(v.message))).toBe(true)
    expect(byCode.sdfd.some((v) => v.severity === 1)).toBe(true)
    // …coexisting with the previously-migrated rules (none clobbered).
    expect(byCode.block).toBeGreaterThan(0)
    expect(byCode.spacing).toBeGreaterThan(0)

    // ── Alert Center lists the 7501 rows with the SDFD message ──────────────────────
    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    const rows7501 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="7501"]')
    await expect.poll(() => rows7501.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows7501.first()).toContainText('7501')
    const crewId = await rows7501.first().getAttribute('data-crew-id')
    expect(crewId && crewId.length > 0).toBeTruthy()
  })
})
