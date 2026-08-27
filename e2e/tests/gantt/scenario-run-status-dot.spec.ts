import { test, expect } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { seedGanttAuth } from '../../utils/gantt-hook'

/**
 * Scen-2045 — the sidebar status dot must track the optimization lifecycle LIVE.
 *
 * Bug: clicking "Run" flipped the detail-panel button to "Kill" but the left
 * Scenario-list dot stayed on its old colour (DRAFT grey) for the whole run — it
 * only caught up on the next full fetchList, i.e. AFTER the run had already
 * finished. The dot therefore never showed the blue RUNNING state.
 *
 * Root cause: the store updated `detail`/`draftDetail` optimistically but never
 * patched the list `items[]` row that the dot reads from. Fix: patchListItemStatus
 * keeps items[] in sync on run-start and on every poll tick.
 *
 * This test drives the REAL UI (clicks the actual Run button + pre-run dialog) and
 * lets the store fire its own calls; only the backend responses are mocked so the
 * test is deterministic without a live engine-server. The user action under test
 * (the Run click) goes through the product UI per §Simulate-User.
 */

const SC_ID = 9001
const NAME = 'RUN-DOT-9001'
const NOW = '2026-06-23T00:00:00.000Z'

const listItem = (status: string) => ({
  id: SC_ID,
  name: NAME,
  fileType: 'RO',
  status,
  strDtLoc: '2026-05-01',
  endDtLoc: '2026-05-31',
  optimizedCount: 0,
  leadinLive: 1,
  updatedBy: 'e2e',
  updatedAt: NOW,
})

const detail = (status: string) => ({
  ...listItem(status),
  worksetId: 1,
  version: 1,
  rulesetId: 103,
  pairingScenarioId: 0, // 0 = Live pairings → valid, no blocker
  filterParams: null, // null → a warning (not a blocker), so the pre-run dialog is dismissible
  comments: null,
  createdBy: 'e2e',
  createdAt: NOW,
})

const wrap = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'ok', data }),
})

test.describe('Scenario run — sidebar status dot tracks the lifecycle', () => {
  test('Scen-2045 — dot goes DRAFT → RUNNING on Run click, then DONE when the poll completes', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // `runStarted` flips once the UI POSTs /run. Both the list and the detail
    // endpoint key off it so the mocked backend mirrors the real DRAFT→DONE
    // transition (engine writes DONE → list cache invalidated → fetchList sees DONE).
    let runStarted = false

    // List — one RO scenario. DRAFT before the run, DONE after (the poll-exit fetchList).
    await page.route(/\/api\/scenario(\?|$)/, (route) =>
      route.fulfill(
        wrap({
          items: [listItem(runStarted ? 'DONE' : 'DRAFT')],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
      ),
    )

    // Run — accept the kick-off, mark the run started.
    await page.route(/\/api\/scenario\/\d+\/run$/, (route) => {
      runStarted = true
      return route.fulfill(wrap({ taskId: 'task-9001' }))
    })

    // Detail — DRAFT for the initial selection, DONE once the run has started
    // (so the very first 3 s poll observes completion).
    await page.route(/\/api\/scenario\/\d+(\?|$)/, (route) =>
      route.fulfill(wrap(detail(runStarted ? 'DONE' : 'DRAFT'))),
    )

    await page.goto('/altair/')
    await gotoScenarioList(page)

    // The single list row renders with a DRAFT (grey) dot.
    const row = page.getByTestId('scenario-list-item')
    await expect(row).toContainText(NAME)
    const dot = page.getByTestId('scenario-item-status-dot')
    await expect(dot).toHaveAttribute('data-status', 'DRAFT')

    // Select it → detail panel opens with the Run button.
    await row.click()
    const runBtn = page.getByTestId('scenario-run-btn')
    await expect(runBtn).toBeVisible()

    // Click Run → pre-run check dialog (warnings only) → Proceed Anyway.
    await runBtn.click()
    const dialog = page.getByTestId('run-check-dialog')
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Proceed Anyway' }).click()

    // REGRESSION CORE: the sidebar dot turns RUNNING the instant the run starts —
    // it no longer waits for the run to finish. (Pre-fix it stayed DRAFT here.)
    await expect(dot).toHaveAttribute('data-status', 'RUNNING')

    // After the first poll observes DONE, the dot follows to DONE (green).
    await expect(dot).toHaveAttribute('data-status', 'DONE', { timeout: 15_000 })
  })
})
