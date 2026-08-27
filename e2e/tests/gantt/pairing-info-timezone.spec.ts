/**
 * Pairing Info — timezone selector accuracy (Local / Airport / UTC / By DEP).
 *
 * The dialog prints each sector's DEP and ARR airports with their UTC offsets,
 * e.g. "YEG(-6:00)" … "YVR(-7:00)". For every timezone mode we capture the UTC
 * ground-truth times, switch mode, and assert the rendered times equal UTC shifted
 * by the offset the dialog itself prints — departure times against the DEP offset,
 * arrival times against the ARR offset. Agreement proves each airport's IANA-zone
 * conversion matches its declared offset.
 *
 * The two per-airport modes differ deliberately:
 *  - Local : each event in ITS OWN airport's wall-clock — STD at the dep airport,
 *            STA at the arr airport.
 *  - By DEP: the whole leg pinned to the DEPARTURE airport — STD and STA both at
 *            the dep airport (one standard for dep & arr).
 *
 * Reusable building blocks live in e2e/utils/pairing-info.ts.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts } from '../../utils/gantt-hook'
import {
  SEG, openByScan, readSegmentCells, parseAirport, parseOffsetMin, parseMD, applyOffset, validateTzCells,
} from '../../utils/pairing-info'

const TARGETS = ['YVR', 'YYZ', 'YEG', 'YXX'] as const

type TzMode = 'local' | 'airport' | 'utc' | 'dep'

/** Click a tz mode button and wait until it is the active (highlighted) one. */
const setTzMode = async (dialog: Locator, mode: TzMode): Promise<void> => {
  const btn = dialog.getByTestId(`pairing-info-tz-${mode}`)
  await btn.click()
  await expect(btn).toHaveClass(/bg-primary/)
}

/** Capture the segment table cells in a given tz mode. */
const cellsInMode = async (dialog: Locator, mode: TzMode): Promise<string[][]> => {
  await setTzMode(dialog, mode)
  return readSegmentCells(dialog)
}

test.describe('Pairing Info — timezone selector accuracy', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await expect.poll(async () => (await counts(page)).pairing, {
      message: 'pairing objects loaded', timeout: 30_000,
    }).toBeGreaterThan(1)
  })

  test('Live-1124 — By DEP pins each sector (dep & arr) to its departure-airport time (YVR/YYZ/YEG/YXX…)', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    const covered = new Set<string>()
    const seenTitles = new Set<string>()
    let totalCells = 0
    let pairingsValidated = 0

    // A single multi-sector pairing already visits several airports, so a handful of
    // pucks usually covers the targets; rows past the rendered pucks return false.
    for (let row = 0; row < 8; row++) {
      if (TARGETS.every((a) => covered.has(a))) break
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue
      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

      const title = ((await dialog.getByText(/#\d+/).first().textContent()) ?? '').trim()
      if (seenTitles.has(title)) { await closeDialog(page, dialog); continue }
      seenTitles.add(title)

      const utcCells = await cellsInMode(dialog, 'utc')
      const depCells = await cellsInMode(dialog, 'dep')

      // By DEP: both STD and STA use the sector's DEPARTURE offset (tz-independent DEP cell).
      const depOff = (r: number) => parseOffsetMin(utcCells[r][SEG.DEP])
      const result = validateTzCells(
        utcCells, depCells,
        [{ col: SEG.STD, offset: depOff }, { col: SEG.STA, offset: depOff }],
        `By DEP / ${title}`,
      )
      expect(result.cellsChecked, `${title}: validated at least one sector time`).toBeGreaterThan(0)
      totalCells += result.cellsChecked
      pairingsValidated++
      for (const a of result.airports) covered.add(a)

      await closeDialog(page, dialog)
    }

    // eslint-disable-next-line no-console
    console.log(`[tz] validated ${totalCells} time cells across ${pairingsValidated} pairings; ` +
      `airports covered: ${[...covered].sort().join(', ')}`)

    expect(pairingsValidated, 'opened and validated at least one pairing').toBeGreaterThan(0)
    expect(totalCells, 'cross-checked many sector times').toBeGreaterThan(1)

    const coveredTargets = TARGETS.filter((a) => covered.has(a))
    expect(coveredTargets.length, `validated at least one of ${TARGETS.join('/')} (covered: ${[...covered].join(',')})`)
      .toBeGreaterThan(0)
    expect(covered.size, 'exercised more than one airport timezone').toBeGreaterThan(1)
  })

  test('Live-1125 — all four selectors render correct times; Local uses arr-airport, By DEP uses dep-airport', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')

    // A sector crosses timezones when its DEP and ARR offsets differ — only then can
    // Local (arr-airport STA) and By DEP (dep-airport STA) be told apart. Scan distinct
    // pairings until we find one with such a sector, then validate on it.
    const hasCrossTzSector = (cells: string[][]): boolean => cells.some((_, r) => {
      const d = parseOffsetMin(cells[r][SEG.DEP]), a = parseOffsetMin(cells[r][SEG.ARR])
      return d != null && a != null && d !== a && parseMD(cells[r][SEG.STA]) != null
    })

    let utcCells: string[][] | null = null
    const seen = new Set<string>()
    for (let row = 0; row < 8 && !utcCells; row++) {
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue
      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
      const title = ((await dialog.getByText(/#\d+/).first().textContent()) ?? '').trim()
      if (seen.has(title)) { await closeDialog(page, dialog); continue }
      seen.add(title)
      const cells = await cellsInMode(dialog, 'utc')
      if (hasCrossTzSector(cells)) { utcCells = cells; break }
      await closeDialog(page, dialog)
    }
    expect(utcCells, 'found a pairing with a cross-timezone sector to compare Local vs By DEP').not.toBeNull()
    const utc = utcCells as string[][]
    const depOff = (r: number) => parseOffsetMin(utc[r][SEG.DEP])
    const arrOff = (r: number) => parseOffsetMin(utc[r][SEG.ARR])

    // Local: STD at the departure airport, STA at the ARRIVAL airport.
    const localCells = await cellsInMode(dialog, 'local')
    const rLocal = validateTzCells(
      utc, localCells,
      [{ col: SEG.STD, offset: depOff }, { col: SEG.STA, offset: arrOff }],
      'Local',
    )
    expect(rLocal.cellsChecked, 'Local validated dep & arr times against their own airports').toBeGreaterThan(0)

    // By DEP: STD and STA both at the departure airport.
    const depCells = await cellsInMode(dialog, 'dep')
    const rDep = validateTzCells(
      utc, depCells,
      [{ col: SEG.STD, offset: depOff }, { col: SEG.STA, offset: depOff }],
      'By DEP',
    )
    expect(rDep.cellsChecked, 'By DEP validated dep & arr times against the departure airport').toBeGreaterThan(0)

    // The modes must genuinely differ: on a sector whose dep/arr offsets differ, the
    // arrival time (STA) reads differently under Local vs By DEP. This locks the design.
    let distinguished = false
    for (let r = 0; r < utc.length; r++) {
      const d = depOff(r), a = arrOff(r)
      if (d == null || a == null || d === a) continue
      if (!parseMD(utc[r][SEG.STA])) continue
      expect(localCells[r][SEG.STA].trim(),
        `row ${r}: Local STA (arr-airport) must differ from By DEP STA (dep-airport)`)
        .not.toBe(depCells[r][SEG.STA].trim())
      distinguished = true
    }
    expect(distinguished, 'pairing had a sector with differing dep/arr offsets to compare Local vs By DEP').toBe(true)

    // Airport: with no airport chosen in the global switcher it falls back to UTC,
    // so the rendered times must match the UTC capture exactly.
    const airportCells = await cellsInMode(dialog, 'airport')
    for (let i = 0; i < utc.length; i++) {
      for (const col of [SEG.STD, SEG.STA]) {
        expect(airportCells[i][col], `Airport(default→UTC) row ${i} col ${col}`).toBe(utc[i][col])
      }
    }

    // The first selector is now the general "Local" (no base-airport suffix).
    await expect(dialog.getByTestId('pairing-info-tz-local')).toHaveText('Local')
    for (const mode of ['local', 'airport', 'utc', 'dep'] as const) await setTzMode(dialog, mode)
  })

  // Regression: non-base airports (not returned by /timezone-options) used to fall back
  // to UTC because the dialog only knew base-airport zones. They now resolve via the full
  // airport→zone map. June 2026 offsets: YXX America/Vancouver = -7:00, MEX
  // America/Mexico_City = -6:00 (no DST). Before the fix, Local time == UTC time (FAIL).
  test('Live-1126 — non-base airports YXX & MEX localize (no longer fall back to UTC)', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    const KNOWN: Record<string, number> = { YXX: -7 * 60, MEX: -6 * 60 }
    const validated = new Set<string>()
    const seen = new Set<string>()

    for (let row = 0; row < 8 && validated.size < 2; row++) {
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue
      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
      const title = ((await dialog.getByText(/#\d+/).first().textContent()) ?? '').trim()
      if (seen.has(title)) { await closeDialog(page, dialog); continue }
      seen.add(title)

      const utc = await cellsInMode(dialog, 'utc')
      const local = await cellsInMode(dialog, 'local')

      for (let r = 0; r < utc.length; r++) {
        const dep = parseAirport(utc[r][SEG.DEP]), arr = parseAirport(utc[r][SEG.ARR])
        // Departure side: STD must localize to the dep airport.
        if (KNOWN[dep] != null) {
          const u = parseMD(utc[r][SEG.STD])
          if (u) {
            const exp = applyOffset(u, KNOWN[dep])
            expect(local[r][SEG.STD], `${dep} STD localized (≠ UTC ${utc[r][SEG.STD]})`).toBe(exp)
            expect(local[r][SEG.STD], `${dep} STD must differ from UTC`).not.toBe(utc[r][SEG.STD])
            // DEP cell now shows the offset for the non-base airport too.
            expect(utc[r][SEG.DEP]).toBe(`${dep}(${dep === 'YXX' ? '-7:00' : '-6:00'})`)
            validated.add(dep)
          }
        }
        // Arrival side: STA must localize to the arr airport.
        if (KNOWN[arr] != null) {
          const u = parseMD(utc[r][SEG.STA])
          if (u) {
            const exp = applyOffset(u, KNOWN[arr])
            expect(local[r][SEG.STA], `${arr} STA localized (≠ UTC ${utc[r][SEG.STA]})`).toBe(exp)
            expect(local[r][SEG.STA], `${arr} STA must differ from UTC`).not.toBe(utc[r][SEG.STA])
            expect(utc[r][SEG.ARR]).toBe(`${arr}(${arr === 'YXX' ? '-7:00' : '-6:00'})`)
            validated.add(arr)
          }
        }
      }
      await closeDialog(page, dialog)
    }

    // eslint-disable-next-line no-console
    console.log(`[tz] non-base airports validated: ${[...validated].join(', ')}`)
    expect([...validated].sort(), 'both YXX and MEX localized correctly').toEqual(['MEX', 'YXX'])
  })
})

/** Close the dialog and wait for it to disappear (re-querying the close button each call). */
async function closeDialog(page: Page, dialog: Locator): Promise<void> {
  await page.getByTestId('pairing-info-dialog-close').click()
  await expect(dialog).toBeHidden()
}
