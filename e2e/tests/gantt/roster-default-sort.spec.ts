/**
 * Roster default ordering — rank table order, then crewId ascending.
 *
 * With NO user sort criteria the roster must rest in default order:
 *   1. by rank (rank.display_order)
 *   2. same rank -> crewId ascending (small id on top)
 * Verified via window.__ganttTest.rosterPanelOrder() (store/render truth, not pixels).
 *
 * Data-independent assertions (no hardcoded ids):
 *   - each rank forms a single contiguous block (rank never reappears) => rank-primary order
 *   - within each rank block, numeric crewIds are ascending => crewId secondary order
 * Also confirms the default is the resting state: rosterSort() is empty.
 * Anti-illusion: asserts the actual displayed ordering, not visibility.
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const primaryRank = (rank: string): string => (rank.split('|')[0] ?? '').trim()

/** True if equal-rank rows are contiguous (no rank reappears after a different one). */
const ranksAreGrouped = (ranks: string[]): boolean => {
  const seen = new Set<string>()
  let prev = ''
  for (const r of ranks) {
    if (r !== prev) {
      if (seen.has(r)) return false
      seen.add(r)
      prev = r
    }
  }
  return true
}

/** True if numeric crewIds are ascending within every contiguous rank block. */
const crewIdAscendingWithinRank = (rows: Array<{ crewId: string; rank: string }>): boolean => {
  let prevRank = ''
  let prevId = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    const rank = primaryRank(row.rank)
    const id = Number(row.crewId)
    if (Number.isNaN(id)) continue
    if (rank !== prevRank) {
      prevRank = rank
      prevId = id
      continue
    }
    if (id < prevId) return false
    prevId = id
  }
  return true
}

test.describe('Roster default ordering', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanelOrder())).length)
      .toBeGreaterThan(1)
  })

  test('Live-1210 — rests in rank-then-crewId order with no sort criteria @smoke', async ({ page }) => {
    // No user sort applied -> default resting order.
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])

    const rows = await page.evaluate(() => window.__ganttTest!.rosterPanelOrder())
    expect(rows.length, 'roster has rows').toBeGreaterThan(1)

    const ranks = rows.map((r) => primaryRank(r.rank))
    expect(ranksAreGrouped(ranks), `ranks grouped: ${ranks.slice(0, 12)}`).toBe(true)
    expect(
      crewIdAscendingWithinRank(rows),
      `crewId ascending within rank: ${rows.slice(0, 12).map((r) => `${primaryRank(r.rank)}#${r.crewId}`)}`,
    ).toBe(true)
  })

  test('Live-1211 — returns to default order after applying then clearing a sort', async ({ page }) => {
    const before = await page.evaluate(() => window.__ganttTest!.rosterPanelOrder())
    const beforeIds = before.map((r) => r.crewId)

    // Apply a crewId-busting sort (seniority desc) then clear it.
    await page.getByTitle('Sort', { exact: true }).first().click()
    const dialog = page.getByTestId('sort-dialog')
    await dialog.getByTestId('sort-available-seniority').dblclick()
    await dialog.getByTestId('sort-order-desc').check()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([
      { column: 'seniority', direction: 'desc' },
    ])

    // Clear it -> back to default.
    await page.getByTitle('Sort', { exact: true }).first().click()
    await dialog.getByTestId('sort-selected-seniority').dblclick()
    await dialog.getByTestId('sort-apply').click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.__ganttTest!.rosterSort())).toEqual([])

    const after = await page.evaluate(() => window.__ganttTest!.rosterPanelOrder())

    // Assert the default ORDER is restored via the same invariants the resting
    // state must satisfy (rank-grouped, crewId ascending within rank) rather than
    // an exact id-by-id deep-equal against `before`. The live remote dataset can
    // add/drop a single row between the two captures under parallel suite load,
    // which made the strict deep-equal flaky without ever signalling a real
    // ordering bug.
    const afterRanks = after.map((r) => primaryRank(r.rank))
    expect(ranksAreGrouped(afterRanks), `ranks grouped after clear: ${afterRanks.slice(0, 12)}`).toBe(true)
    expect(
      crewIdAscendingWithinRank(after),
      `crewId ascending within rank after clear: ${after.slice(0, 12).map((r) => `${primaryRank(r.rank)}#${r.crewId}`)}`,
    ).toBe(true)

    // And it is the SAME ordering as the pre-sort default for the rows present in
    // both captures (tolerant of one row appearing/disappearing in live data).
    const afterIds = after.map((r) => r.crewId)
    const commonAfter = afterIds.filter((id) => beforeIds.includes(id))
    const commonBefore = beforeIds.filter((id) => afterIds.includes(id))
    expect(commonAfter, 'relative order of rows present in both captures is unchanged').toEqual(commonBefore)
  })
})
