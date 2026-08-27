/**
 * Alert Center search box → filter the loaded alerts by crew id / rank / base.
 *
 * Feature: the Legality Alert Center now has a search input that narrows the already-
 * loaded violation messages (NOT a server query) by crew id, rank, or base. It scopes
 * the message table, the GROUP BY sidebar counts, and the "all" count together.
 *
 * §No-Illusion: asserts the table actually narrows to rows matching the query and that
 * a non-matching query empties it — not bare visibility. §Simulate-User: typed into the
 * real dialog input; the UI filters its own loaded rows.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1413 — Alert Center search filters loaded alerts by crew id / rank / base', async ({ page, request }) => {
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

  const rows = dialog.locator('[data-testid="violation-list-row"]')
  await expect.poll(() => rows.count()).toBeGreaterThan(0)
  const totalBefore = await rows.count()

  // Read the crew id / rank / base of the first row to use as concrete queries.
  const firstRow = rows.first()
  const crewId = (await firstRow.getAttribute('data-crew-id'))!
  expect(crewId.length).toBeGreaterThan(0)
  const rank = (await firstRow.locator('td').nth(3).innerText()).trim()

  const search = dialog.getByTestId('alert-search-input')

  // --- Search by crew id: every visible row is that crew, and count shrinks (or holds). ---
  await search.fill(crewId)
  await expect.poll(() => rows.count()).toBeGreaterThan(0)
  const afterCrew = await rows.count()
  expect(afterCrew).toBeLessThanOrEqual(totalBefore)
  const crewIdsShown = await rows.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).getAttribute('data-crew-id') ?? ''),
  )
  expect(crewIdsShown.every((c) => c.includes(crewId))).toBeTruthy()

  // --- Search by rank: every visible row carries that rank. ---
  if (rank && rank !== '—') {
    await search.fill(rank)
    await expect.poll(() => rows.count()).toBeGreaterThan(0)
    const ranksShown = await rows.evaluateAll((els) =>
      els.map((e) => (e.querySelectorAll('td')[3] as HTMLElement)?.innerText.trim() ?? ''),
    )
    expect(ranksShown.every((r) => r === rank)).toBeTruthy()
  }

  // --- Non-matching query empties the table (proves it is really filtering). ---
  await search.fill('zzz-no-such-crew-zzz')
  await expect(dialog.getByTestId('violation-list-empty')).toBeVisible()
  await expect(rows).toHaveCount(0)

  // --- Clearing restores the full set. ---
  await search.fill('')
  await expect.poll(() => rows.count()).toBe(totalBefore)
})
