/**
 * Multi-base pairing filter — Filter dialog › Pairing › Base multiselect with TWO
 * bases (DXB + ADD) must return the UNION (OR match), not just the first base.
 *
 * Ryan's bug (cr.rois.one/altair/live): selecting base DXB + ADD on the Pairing filter
 * showed no Sep pairings. Root cause was a single-valued Phase-1 path end to end:
 *   - frontend pairingFilterToListParams sent only `bases[0]` (→ base=DXB) to GET /api/pairing;
 *   - backend `base` was z.string().max(3) matched with eq(pairing.base, base) — a single code.
 * So a DXB+ADD selection collapsed to DXB-only and every ADD pairing vanished.
 *
 * Fix: frontend sends `bases.join(',')`; backend splits to string[] and matches with
 * inArray(pairing.base, bases) (mirrors the assignments OR filter). This test drives the
 * REAL Filter dialog (open → tick DXB → tick ADD → Apply) — the exact action Ryan performed —
 * and proves via store truth (§No-Illusion), not pixels, that BOTH bases' pairings load.
 *
 * Regression guard: pre-fix this FAILS — only DXB (12) returns and ADD (207) is absent under
 * a DXB+ADD filter. §Simulate-User: the filter is set through the actual dialog controls, and
 * the pane's real filter chips are asserted.
 *
 * Data: the 219 ET/EK 01-Sep single-flight pairings persisted by ek-et-coverage-pairing-build
 * (KEEP_PAIRINGS=1) — DXB (EK, 12) + ADD (ET, 207). beforeEach skips if that reseed is absent
 * from the loaded window (data-gap handling), so the filter logic is never asserted on no data.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  counts,
  pairingObjects,
  openFilter,
  selectDropdownOption,
  applyFilter,
} from '../../utils/gantt-hook'

// ADD is UTC+3, so a flt_dt=01 Sep leg can depart 31 Aug in UTC — span the window a little
// wider than the target day so every 01 Sep pairing segment is inside the loaded range.
const SEP_START = '2026-08-31T00:00:00.000Z'
const SEP_END = '2026-09-02T12:00:00.000Z'

const setDateRange = (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

const basesOf = (rows: Array<Record<string, unknown>>): string[] =>
  rows.map((r) => r.base).filter((v): v is string => typeof v === 'string' && v !== '')

const distinct = (xs: string[]): string[] => [...new Set(xs)]

test.describe('Pairing multi-base filter (OR union)', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect
      .poll(async () => (await counts(page)).pairing, { message: 'pairing pane loaded', timeout: 30_000 })
      .toBeGreaterThan(0)

    // Load the Sep window that holds the reseeded DXB/ADD pairings.
    await setDateRange(page, SEP_START, SEP_END)
    await expect
      .poll(async () => {
        const present = distinct(basesOf(await pairingObjects(page)))
        return present.includes('DXB') && present.includes('ADD')
      }, { message: 'both DXB and ADD pairings present unfiltered in the Sep window', timeout: 30_000 })
      .toBe(true)
  })

  test('Live-1720 — Base = DXB + ADD returns BOTH bases (OR union), not just DXB', async ({ page }) => {
    // Ryan's exact action: Filter dialog › Pairing tab › Base → tick DXB, tick ADD → Apply.
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', 'DXB', 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', 'ADD', 'pairing')
    await applyFilter(page)

    // Store truth: every loaded pairing is DXB or ADD, and BOTH are present (the OR union).
    // Pre-fix the frontend sent base=DXB only, so this poll never sees ADD.
    await expect
      .poll(async () => {
        const present = distinct(basesOf(await pairingObjects(page)))
        return (
          present.length > 0 &&
          present.includes('DXB') &&
          present.includes('ADD') &&
          present.every((b) => b === 'DXB' || b === 'ADD')
        )
      }, { message: 'union of DXB + ADD pairings shown (pre-fix: only DXB, ADD missing)', timeout: 30_000 })
      .toBe(true)

    const present = distinct(basesOf(await pairingObjects(page)))
    expect(present, 'ADD pairings present alongside DXB under a DXB+ADD filter').toContain('ADD')
    expect(present, 'DXB pairings still present under a DXB+ADD filter').toContain('DXB')
    expect(present.filter((b) => b !== 'DXB' && b !== 'ADD'), 'no third base leaks in').toHaveLength(0)

    // Both base chips render on the Pairing pane (one chip per applied value).
    const chips = dashboard.pairingPane.locator('[data-testid="pane-filter-chip"]')
    await expect(chips.filter({ hasText: 'DXB' }), 'DXB base chip on the Pairing pane').toHaveCount(1)
    await expect(chips.filter({ hasText: 'ADD' }), 'ADD base chip on the Pairing pane').toHaveCount(1)
  })

  test('Live-1721 — Base = DXB only still excludes ADD (single-base stays narrow)', async ({ page }) => {
    await openFilter(page, 'pairing')
    await selectDropdownOption(page, 'filter-pairing-base', 'DXB', 'pairing')
    await applyFilter(page)

    await expect
      .poll(async () => {
        const rows = await pairingObjects(page)
        return rows.length > 0 && rows.every((p) => p.base === 'DXB')
      }, { message: 'only DXB pairings under a DXB-only filter', timeout: 30_000 })
      .toBe(true)

    expect(distinct(basesOf(await pairingObjects(page))), 'ADD absent under a DXB-only filter').not.toContain('ADD')
  })
})
