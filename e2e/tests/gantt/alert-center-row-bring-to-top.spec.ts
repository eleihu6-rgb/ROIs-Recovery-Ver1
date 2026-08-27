/**
 * Alert Center row click → bring that crew to the TOP of the roster gantt.
 *
 * Regression for the lost gesture: clicking any cell of a Legality Alert Center row
 * used to float the row's crew to the top of the roster pane so the planner could
 * inspect its roster. The shared ViolationListDialog rows had no onClick, so the crew
 * never moved. Fixed by routing the click through RosterPaneSource.bringCrewToTop
 * (Live: pane-store found tier; Scenario: scenario-layout found tier) — one shared path.
 *
 * §No-Illusion: asserts the clicked crew actually becomes the top rendered roster row
 * AND lands in the pane's "found" tier — not bare visibility. §Simulate-User: the float
 * is triggered by clicking the real dialog row, not by calling the API.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1412 — clicking an Alert Center row brings that crew to the top of the roster', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page) // default no-filter apply → full bootstrap load

  // Violations load async after first paint — wait until the bell data is present.
  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { liveViolations?: () => unknown[] } }).__ganttTest
        return (t?.liveViolations?.() ?? []).length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  // Open the Legality Alert Center (roster-pane toolbar bell).
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // Take the first violation row and read the crew it is attributed to.
  const firstRow = dialog.locator('[data-testid="violation-list-row"]').first()
  await expect.poll(() => firstRow.count()).toBeGreaterThan(0)
  const crewId = await firstRow.getAttribute('data-crew-id')
  expect(crewId && crewId.length > 0).toBeTruthy()

  // Sanity: before the click, that crew is NOT necessarily floated to the top.
  // (It may be anywhere in the default rank/seniority order.)

  // Click any cell of the row (click the row element itself).
  await firstRow.click()

  // The crew is now in the roster-main "found" tier …
  await expect
    .poll(() => page.evaluate(() => {
      const t = (window as unknown as { __ganttTest?: { foundIds?: (p: string) => string[] } }).__ganttTest
      return t?.foundIds?.('roster-main') ?? []
    }))
    .toContain(crewId!)

  // … and renders as the TOP roster row (found crew float first, after any frozen rows;
  // this default-load view has no frozen rows, so found == top).
  await expect
    .poll(() => page.evaluate(() => {
      const t = (window as unknown as { __ganttTest?: { rosterPanelOrder?: () => Array<{ crewId: string }> } }).__ganttTest
      return t?.rosterPanelOrder?.()?.[0]?.crewId ?? null
    }))
    .toBe(crewId!)

  // Close the dialog — the float persists so the planner can view the roster.
  await dialog.locator('button', { hasText: 'Close' }).click()
  await expect(dialog).toBeHidden()
  const topAfterClose = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { rosterPanelOrder?: () => Array<{ crewId: string }> } }).__ganttTest
    return t?.rosterPanelOrder?.()?.[0]?.crewId ?? null
  })
  expect(topAfterClose).toBe(crewId!)
})
