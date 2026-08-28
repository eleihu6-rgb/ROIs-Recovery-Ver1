/**
 * ET SSIM schedule reload validation — cr.rois.one-friendly (real UI form login,
 * no API-injection shortcut), also runs against localhost via the default config.
 *
 * Data under test: fixtures/ET-SSIM-01-30SEP26.TXT (Sabre AirFlite export, local
 * times + explicit UTC offsets) loaded by
 * .agents/skills/142-flight-schedule-seed-generator/scripts/load-ssim-flights.mjs:
 * 6812 dated flights 2026-08-31..2026-10-03, ONLY the 787/737-family variant codes
 * 788/789/738/73W/7M8 (A350/777/DH8 legs filtered out), replacing the old synthetic
 * ET seed (which used the coarse fleets 'B787'/'737').
 *
 * Assertions read window.__ganttTest store truth (same data the canvas draws —
 * §No-Illusion); date range + dep-airport filter are test-only preconditions.
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import { openLiveView, addFlightPane, setDateRange, counts, readHook } from '../../utils/gantt-hook'

interface FlightRow {
  registration: string
  fleet: string
  fltNum: string | null
  depArp: string | null
  start: string | null
}

const USER = TEST_ACCOUNTS.admin
const SSIM_FLEETS = ['788', '789', '738', '73W', '7M8']

test.describe('ET SSIM schedule reload (142/load-ssim-flights)', () => {
  test('Live-1709 — reloaded ET flights carry SSIM variant fleet codes and offset-correct UTC times @smoke', async ({ page }) => {
    const login = new GanttLoginPage(page)
    await login.goto()
    await login.login(USER.userCode, USER.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await openLiveView(page)

    await addFlightPane(page)
    // SSIM window: early-September slice — must stay inside the gantt's default
    // roster-period span (ends 2026-09-07 on this DB); SSIM coverage starts 2026-08-31.
    await setDateRange(page, '2026-09-03T00:00:00.000Z', '2026-09-05T00:00:00.000Z')
    await page.evaluate(
      (f) => (window.__ganttTest as unknown as { applyFlightFilter: (x: typeof f) => Promise<void> }).applyFlightFilter(f),
      { depArps: ['ADD'] },
    )
    await expect.poll(async () => (await counts(page)).flightLegs, {
      message: 'ET legs departing ADD loaded', timeout: 30_000,
    }).toBeGreaterThan(0)

    const rows = await readHook<FlightRow[]>(page, 'flights')
    const etRows = rows.filter((r) => r.fltNum?.startsWith('ET'))
    expect(etRows.length, 'reloaded ET legs present in the mid-Sep window').toBeGreaterThan(0)

    // Every ET leg carries a variant code from the SSIM file — never the retired
    // coarse fleets of the old synthetic seed.
    for (const r of etRows) {
      expect(SSIM_FLEETS, `ET leg ${r.fltNum} fleet ${r.fleet} is an SSIM variant code`).toContain(r.fleet)
      // Untailed schedule rows still bin-pack into `{fleet}-{n}` pseudo-tails per variant.
      expect(r.registration, `ET leg ${r.fltNum} fleet-grouped pseudo-tail`).toMatch(new RegExp(`^${r.fleet}-\\d+$`))
    }
    expect(
      etRows.some((r) => r.fleet === 'B787' || r.fleet === '737'),
      'old synthetic coarse fleets B787/737 fully replaced',
    ).toBe(false)

    // Time-mode correctness: the file's carrier record is "2UET" = UTC time mode, so
    // ET100's "ADD03050305+0300" is 03:05 UTC (= 06:05 ADD local, the published local
    // departure). 2026-09-04 is a Friday (day 5), inside the 31AUG-06SEP variation
    // whose days pattern "1 3 567" includes it, equipment 738.
    const et100 = etRows.find((r) => r.fltNum === 'ET100' && r.start?.startsWith('2026-09-04'))
    expect(et100, 'ET100 on 2026-09-04 present in the loaded window').toBeTruthy()
    expect(new Date(et100!.start as string).toISOString()).toBe('2026-09-04T03:05:00.000Z')
    expect(et100!.fleet, 'ET100 flies the 738 variant per the SSIM file').toBe('738')
  })
})
