/**
 * Pairing Info — default timezone follows the Toolbar Base selection (Live).
 *
 * Live-1130 — Toolbar on UTC: opening Pairing Info selects UTC by default and the
 *   "Airport" toggle reads "Airport".
 * Live-1131 — Toolbar on a Base (YVR): opening Pairing Info defaults to "Airport"
 *   (YVR) and every time renders in the Base zone (America/Vancouver). Times are
 *   cross-validated against a UTC capture using America/Vancouver's DST-aware
 *   offset evaluated at each column's own UTC instant.
 *
 * Pairing Info is a modal dialog, so the toolbar cannot be switched while it is
 * open — the follow behavior is: pick the Base on the toolbar first, then open
 * Pairing Info. The dialog is opened like Live-1320 (real roster context-menu
 * item "View pairing detail").
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook, counts } from '../../utils/gantt-hook'
import { SEG, readSegmentCells, parseMD, validateTzCells } from '../../utils/pairing-info'

/** Minutes east of UTC for `zoneId` at instant `d` (DST-aware via the IANA zone). */
const zoneOffsetMin = (zoneId: string, d: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0')
  let h = get('hour'); if (h === 24) h = 0
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return Math.round((asUtc - d.getTime()) / 60000)
}

/** Open the shared Pairing Info dialog via the Live roster context-menu → "View pairing detail". */
const openPairingInfo = async (page: import('@playwright/test').Page): Promise<void> => {
  const pairings = await readHook<Array<{ id: number }>>(page, 'pairings')
  expect(pairings.length, 'at least one pairing loaded').toBeGreaterThan(0)
  const pairingId = pairings[0]!.id

  await page.evaluate((id) => {
    ;(window.__ganttTest as unknown as { openLivePairingContextMenu: (p: number) => void })
      .openLivePairingContextMenu(id)
  }, pairingId)

  const viewDetail = page.getByRole('button', { name: 'View pairing detail', exact: true })
  await expect(viewDetail).toBeVisible({ timeout: 5_000 })
  await viewDetail.click()

  const dialog = page.getByTestId('pairing-info-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })
}

test.describe('Pairing Info — default timezone follows Toolbar Base', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
  })

  const loadLive = async (page: import('@playwright/test').Page): Promise<void> => {
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded', timeout: 30_000,
    }).toBeGreaterThan(0)
  }

  test('Live-1130 — Toolbar UTC → Pairing Info defaults to UTC; Airport button reads "Airport"', async ({ page }) => {
    await loadLive(page)
    const dialog = page.getByTestId('pairing-info-dialog')
    await openPairingInfo(page)

    await expect(dialog.getByTestId('pairing-info-tz-utc')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('Airport')
    await expect(dialog.getByTestId('pairing-info-tz-airport')).not.toHaveClass(/bg-primary/)
  })

  test('Live-1131 — Toolbar on Base (YVR) → Pairing Info defaults to Airport(YVR); times in the Base zone', async ({ page }) => {
    // Precondition: the Toolbar's display timezone is already YVR (America/Vancouver).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'gantt-timezone',
        JSON.stringify({ timezone: 'America/Vancouver', timezoneAirport: 'YVR' }),
      )
    })
    await loadLive(page)
    await expect(page.getByTestId('timezone-switcher')).toContainText('YVR')

    const dialog = page.getByTestId('pairing-info-dialog')
    await openPairingInfo(page)

    // Opening Pairing Info with the Toolbar on a Base defaults to Airport(YVR), not UTC.
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveClass(/bg-primary/)
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveText('YVR')
    await expect(dialog.getByTestId('pairing-info-tz-utc')).not.toHaveClass(/bg-primary/)

    // Capture a UTC baseline, then re-render the Airport(YVR) mode for cross-validation.
    await dialog.getByTestId('pairing-info-tz-utc').click()
    await expect(dialog.getByTestId('pairing-info-tz-utc')).toHaveClass(/bg-primary/)
    const utcCells = await readSegmentCells(dialog)

    await dialog.getByTestId('pairing-info-tz-airport').click()
    await expect(dialog.getByTestId('pairing-info-tz-airport')).toHaveClass(/bg-primary/)
    const airportCells = await readSegmentCells(dialog)

    // Airport mode = Toolbar Base: times == UTC + America/Vancouver's offset at each instant.
    const offsetAt = (col: number) => (r: number): number | null => {
      const utc = parseMD(utcCells[r][col])
      if (!utc) return null
      return zoneOffsetMin('America/Vancouver', new Date(Date.UTC(2026, utc.mo - 1, utc.d, utc.h, utc.m)))
    }
    const result = validateTzCells(
      utcCells, airportCells,
      [{ col: SEG.STD, offset: offsetAt(SEG.STD) }, { col: SEG.STA, offset: offsetAt(SEG.STA) }],
      'airport→YVR',
    )
    expect(result.cellsChecked, 'at least one sector time validated in the YVR Base zone').toBeGreaterThan(0)
  })
})
