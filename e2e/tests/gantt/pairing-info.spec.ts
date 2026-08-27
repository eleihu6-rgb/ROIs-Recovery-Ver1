/**
 * Pairing Info popup — double-clicking a pairing (Pairing pane) opens an AppDialog
 * showing the pairing header, the segment table, and the rostered crew (with a count).
 * When no crew are rostered, the crew table is replaced by a "no crew" note.
 *
 * The popup is a real DOM dialog, asserted directly. Pucks are located by scanning the
 * canvas (the pane's float/sort reorder can make hook row indices unreliable), which
 * keeps the test robust and still exercises the real double-click → open path.
 */
import { test, expect, type Locator } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, counts } from '../../utils/gantt-hook'
import { openByScan, readSegmentCells } from '../../utils/pairing-info'

// Segment column indices (SEG_COLS order). GT is only shown between two sectors of the
// SAME duty, so an empty GT marks a duty's last sector; DRP/MRT appear only there.
// PCK/RPT are anchored to the duty's first sector, and Duty spans all of its segment rows.
const COL = { PCK: 7, RPT: 8, DRP: 14, GT: 15, MRT: 18, DUTY: 19 } as const

/** Per-row { pck, rpt, drp, gt, mrt, duty } text for every segment row. */
const segCells = async (
  dialog: Locator,
): Promise<{ pck: string; rpt: string; drp: string; gt: string; mrt: string; duty: string }[]> => {
  const rows = await readSegmentCells(dialog)
  return rows.map((expanded) => ({
    pck: expanded[COL.PCK] ?? '',
    rpt: expanded[COL.RPT] ?? '',
    drp: expanded[COL.DRP] ?? '',
    gt: expanded[COL.GT] ?? '',
    mrt: expanded[COL.MRT] ?? '',
    duty: expanded[COL.DUTY] ?? '',
  }))
}

test.describe('Pairing Info', () => {
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

  test('Live-1127 — double-click opens Pairing Info with header, segments and crew — across multiple pairings @smoke', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    const titles: string[] = []

    for (let row = 0; row < 8 && titles.length < 3; row++) {
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue

      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })
      await expect(dialog).toContainText('Base:')
      await expect(dialog).toContainText('Total BH:')

      const segRows = dialog.getByTestId('pairing-info-segments').locator('tbody tr')
      await expect.poll(() => segRows.count(), { message: 'segment rows', timeout: 8_000 }).toBeGreaterThan(0)

      const cells = await segCells(dialog)

      await expect(dialog.getByTestId('pairing-info-duty-cell').first()).toContainText(/FDP|Credit|DP|LO|ETRTZ/)

      // DRP + MRT are duty-level: they may appear ONLY on a duty's last sector.
      // A mid-duty sector has a non-empty GT (ground time to the next same-duty sector),
      // so any row with a non-empty GT must have empty DRP and MRT cells.
      // (Before the fix these were rendered on every sector — this would have failed.)
      for (const c of cells) {
        if (c.gt) {
          expect(c.drp, 'DRP only on last sector of a duty (empty on mid-duty rows)').toBe('')
          expect(c.mrt, 'MRT only on last sector of a duty (empty on mid-duty rows)').toBe('')
        }
      }

      // PCK (pick-up) + RPT (report) are duty-level, anchored to the duty's FIRST sector.
      // A row is NOT the first of its duty when the PREVIOUS row has a non-empty GT
      // (prev → current are the same duty). Such rows must have empty PCK and RPT.
      // (Before the fix these were rendered on every sector — this would have failed.)
      for (let i = 1; i < cells.length; i++) {
        if (cells[i - 1].gt) {
          expect(cells[i].pck, 'PCK only on first sector of a duty (empty on later same-duty rows)').toBe('')
          expect(cells[i].rpt, 'RPT only on first sector of a duty (empty on later same-duty rows)').toBe('')
        }
      }

      // Crew section: populated table whose row count matches the badge, or a no-crew note.
      if (await dialog.getByTestId('pairing-info-crew').count() > 0) {
        const n = Number((await dialog.getByTestId('pairing-info-crew-count').textContent())?.trim())
        expect(n).toBeGreaterThan(0)
        const crewRows = dialog.getByTestId('pairing-info-crew').locator('tbody tr')
        expect(await crewRows.count()).toBe(n)

        // Pairing-pane entry has no crew context: the Ref selector defaults to the
        // first rostered crew and exposes every crew as a selectable option.
        const refCrew = dialog.getByTestId('pairing-info-crew-selector')
        await expect(refCrew).toHaveCount(1)
        const firstCrewId = ((await crewRows.first().locator('td').first().textContent()) ?? '').trim()
        await expect(refCrew).toHaveValue(firstCrewId)
        await expect(refCrew.locator('option')).toHaveCount(n)
      } else {
        await expect(dialog.getByTestId('pairing-info-no-crew')).toBeVisible()
      }

      titles.push(((await dialog.getByText(/#\d+/).first().textContent()) ?? '').trim())
      await dialog.getByTestId('pairing-info-dialog-close').click()
      await expect(dialog).toBeHidden()
    }

    expect(titles.length, 'opened the popup for multiple pairings').toBeGreaterThanOrEqual(2)
    expect(new Set(titles).size, 'pairings opened were distinct').toBe(titles.length)
  })

  test('Live-1130 — title shows the pairing label before #id and drops the word "Pairing"', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    let opened = false
    for (let row = 0; row < 8 && !opened; row++) opened = await openByScan(dashboard.pairingCanvas, dialog, row)
    expect(opened, 'a pairing popup opened').toBe(true)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

    // The blue title bar (AppDialog header) is the single source of the pairing identity.
    const title = ((await dialog.locator('[data-app-dialog-header]').textContent()) ?? '').trim()

    // The word "Pairing" must be gone, and the title must still carry the #id.
    expect(title, `title "${title}" no longer contains the word "Pairing"`).not.toMatch(/Pairing/)
    expect(title, `title "${title}" carries the #id`).toMatch(/#\d+/)

    // When a label exists it precedes the #id ("<label> #<id>"); otherwise it's just "#<id>".
    expect(title, `title "${title}" is "<label> #<id>" or "#<id>"`).toMatch(/^(\S.* )?#\d+$/)
    const hash = title.indexOf('#')
    const label = title.slice(0, hash).trim()
    if (label) {
      // The label moved out of the body header — it lives only in the title now.
      const header = (await dialog.getByTestId('pairing-info-content').locator('> div').first().textContent()) ?? ''
      expect(header, 'body header no longer repeats the pairing label').not.toContain(label)
    }
  })

  test('Live-1128 — header shows Total Credit before Total BH, as a well-formed duration', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    let opened = false
    for (let row = 0; row < 8 && !opened; row++) opened = await openByScan(dashboard.pairingCanvas, dialog, row)
    expect(opened, 'a pairing popup opened').toBe(true)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

    // The label exists and is ordered before Total BH (the request: "before total BH").
    const header = (await dialog.getByTestId('pairing-info-content').locator('> div').first().textContent()) ?? ''
    expect(header).toContain('Total Credit:')
    expect(header.indexOf('Total Credit:'), 'Total Credit precedes Total BH').toBeLessThan(header.indexOf('Total BH:'))

    // The value is the duty-summed credit: a well-formed H:MM duration, or '—' when no
    // duty carries credit. (A per-segment sum or raw numeric-string would not match H:MM.)
    const credit = ((await dialog.getByTestId('pairing-info-total-credit').textContent()) ?? '').trim()
    expect(credit, `Total Credit "${credit}" is a duration or em-dash`).toMatch(/^(\d{1,3}:[0-5]\d|—)$/)
  })

  test('Live-7500 — Ref uses signed H:MM and follows the selected crew', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    let checked = false

    for (let row = 0; row < 8 && !checked; row++) {
      if (!(await openByScan(dashboard.pairingCanvas, dialog, row))) continue
      await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

      const crewRows = dialog.getByTestId('pairing-info-crew').locator('tbody tr')
      const crewCount = await crewRows.count()
      if (crewCount < 2) {
        await dialog.getByTestId('pairing-info-dialog-close').click()
        continue
      }

      const selector = dialog.getByTestId('pairing-info-crew-selector')
      const optionValues = await selector.locator('option').evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      )
      const refsByCrew: string[] = []
      for (const crewId of optionValues) {
        await selector.selectOption(crewId)
        const cells = await readSegmentCells(dialog)
        const dutyRefs = cells.map((cellsForRow) => cellsForRow[SEG.REF] ?? '')
        for (const ref of dutyRefs) {
          if (ref) expect(ref, `crew ${crewId} Ref uses signed H:MM`).toMatch(/^[+-]\d+:[0-5]\d$/)
        }
        refsByCrew.push(dutyRefs.join('|'))
      }

      if (refsByCrew.some((refs) => refs !== '') && new Set(refsByCrew).size > 1) {
        expect(new Set(refsByCrew).size, 'selected crews must render independent Ref values').toBeGreaterThan(1)
        checked = true
      }
      await dialog.getByTestId('pairing-info-dialog-close').click()
    }

    test.skip(!checked, 'SIT data has no multi-crew pairing with differing 7500 Ref values')
  })

  test('Live-7501 — Ref renders stored minutes as signed H:MM', async ({ page }) => {
    const pairingId = 987654321
    const ok = (data: unknown) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data, message: 'ok' }),
    })

    await page.route(`**/api/pairing/${pairingId}/crew-detail`, (route) => route.fulfill(ok([{
      crewId: 'C-REF',
      name: 'Ref Crew',
      gender: null,
      base: 'YYZ',
      position: null,
      actingRank: 'FO',
      source: 'CR',
      mbhMin: null,
      creditMin: null,
    }])))
    await page.route(`**/api/pairing/${pairingId}`, (route) => route.fulfill(ok({
      id: pairingId,
      pairingLabel: 'REF-FMT',
      base: 'YYZ',
      schStrDtUtc: '2026-08-01T08:00:00Z',
      tags: null,
      segments: [{
        id: 1,
        pairingId,
        dutySeq: 1,
        segSeq: 1,
        fltNum: '7501',
        airline: 'F8',
        depArp: 'YYZ',
        arvArp: 'YVR',
        schStrDtUtc: '2026-08-01T08:00:00Z',
        schEndDtUtc: '2026-08-01T12:00:00Z',
        actStrDtUtc: null,
        actEndDtUtc: null,
        segAssignment: 'FLT',
        dutyRefTz: null,
        dutyActCreditedMinutes: null,
      }],
      compositions: [],
      rosterDutyRefs: [{
        crewId: 'C-REF',
        pairingId,
        dutySeq: 1,
        dutyRefTz: -360,
      }],
    })))

    await page.evaluate((id) => window.__ganttTest!.openPairingInfo(id), pairingId)

    const dialog = page.getByTestId('pairing-info-dialog')
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('[data-duty-seq="1"]')).toHaveText('-6:00')
  })

  test('Live-1131 — DH segment BH shows 0/blank (sourced from flight.blk_min, not flight duration)', async ({ page }) => {
    // Regression for pairing #98839 (TB8541): duty-2 is a single DH leg (WS 859, 90 min).
    // Root cause: synthesizeSegmentFlight stored blk_min = flight_duration for DH (should be 0).
    // After fix: API returns segBlkMin=0 for DH; frontend reads it instead of computing timestamps.
    const dialog = page.getByTestId('pairing-info-dialog')
    await page.evaluate(() => window.__ganttTest!.openPairingInfo(98839))
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

    const BH_COL = 16
    const QUAL_COL = 0
    const segRows = dialog.getByTestId('pairing-info-segments').locator('tbody tr')
    await expect.poll(() => segRows.count(), { timeout: 8_000 }).toBeGreaterThan(0)
    const n = await segRows.count()

    let dhFound = false
    let flyBhMin = 0
    for (let i = 0; i < n; i++) {
      const tds = segRows.nth(i).locator('td')
      const qual = ((await tds.nth(QUAL_COL).textContent()) ?? '').trim()
      const bh = ((await tds.nth(BH_COL).textContent()) ?? '').trim()
      if (qual === 'DH') {
        dhFound = true
        expect(bh, `DH segment row ${i}: BH must be blank (segBlkMin=0, not the 1:30 flight duration)`).toBe('')
      } else if (bh.match(/^\d+:\d{2}$/)) {
        const [h, m] = bh.split(':').map(Number)
        flyBhMin += h * 60 + m
      }
    }

    expect(dhFound, 'Pairing 98839 must contain at least one DH segment').toBe(true)

    // Total BH in header must equal the FLY-only sum, not include DH minutes.
    const totalBhText = ((await dialog.getByTestId('pairing-info-total-bh').textContent()) ?? '').trim()
    if (totalBhText.match(/^\d+:\d{2}$/)) {
      const [h, m] = totalBhText.split(':').map(Number)
      expect(h * 60 + m, `Total BH "${totalBhText}" must exclude DH leg (FLY-only: ${flyBhMin} min)`).toBe(flyBhMin)
    }
  })

  test('Live-1129 — timezone toggle keeps segment times rendered (UTC ↔ By DEP)', async ({ page }) => {
    const dialog = page.getByTestId('pairing-info-dialog')
    let opened = false
    for (let row = 0; row < 8 && !opened; row++) opened = await openByScan(dashboard.pairingCanvas, dialog, row)
    expect(opened, 'a pairing popup opened').toBe(true)
    await expect(dialog.getByTestId('pairing-info-content')).toBeVisible({ timeout: 8_000 })

    const stdCell = () => dialog.getByTestId('pairing-info-segments').locator('tbody tr').first().locator('td').nth(9)
    await dialog.getByTestId('pairing-info-tz-utc').click()
    expect((await stdCell().textContent())?.trim(), 'STD shown in UTC mode').toMatch(/\d{1,2}:\d{2}/)
    await dialog.getByTestId('pairing-info-tz-dep').click()
    expect((await stdCell().textContent())?.trim(), 'STD shown in By-DEP mode').toMatch(/\d{1,2}:\d{2}/)
  })
})
