/**
 * Rule 8002 — the Legality Alert Center must list rule messages BOTH for the full
 * unfiltered roster AND after a base filter narrows the loaded crew.
 *
 * Regression for the "Alert Center shows no violations" report: the violation fetch
 * is keyed on selectedCrewIds, so a crew filter must not drop the messages — the
 * filtered set is a subset of the violating crew and must still surface its 8002s.
 * §No-Illusion: asserts real message-row counts in the dialog, not bare visibility.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

type Hook = {
  selectedCrewCount: () => number
  applyCrewFilter: (f: { bases?: string[] }) => Promise<void>
}
const hook = (page: Page, fn: (t: Hook) => unknown) =>
  page.evaluate(`(${fn.toString()})((window).__ganttTest)`)

async function open8002Count(page: Page): Promise<number> {
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]').count(),
      { timeout: 15_000, intervals: [500] })
    .toBeGreaterThan(0)
  const n = await dialog.locator('[data-testid="violation-list-row"][data-rule-code="8002"]').count()
  await expect(dialog.getByTestId('violation-list-empty')).toBeHidden()
  await dialog.getByRole('button', { name: 'Close' }).click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  return n
}

test('Viol-8004 — Alert Center lists 8002 messages unfiltered AND after a base filter', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await waitGanttReady(page)

  // Wait for the initial full load to settle (its background phase would otherwise
  // clobber an applied filter back to the full roster).
  await expect.poll(() => hook(page, (t) => t.selectedCrewCount()) as Promise<number>,
    { timeout: 45_000, intervals: [1000] }).toBeGreaterThan(800)
  await page.waitForTimeout(1500)

  // Unfiltered: the Alert Center lists 8002 messages.
  const unfiltered = await open8002Count(page)
  expect(unfiltered).toBeGreaterThan(0)

  // Apply a YEG base filter → the loaded crew shrinks but 8002 messages remain.
  await hook(page, async (t) => { await t.applyCrewFilter({ bases: ['YEG'] }) })
  await waitGanttReady(page)
  await expect.poll(() => hook(page, (t) => t.selectedCrewCount()) as Promise<number>,
    { timeout: 30_000, intervals: [1000] }).toBeLessThan(800)
  await page.waitForTimeout(2500) // violation hook refetch for the filtered crew

  const filtered = await open8002Count(page)
  expect(filtered).toBeGreaterThan(0)
})
