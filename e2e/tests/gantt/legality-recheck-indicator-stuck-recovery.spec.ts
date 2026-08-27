/**
 * Live's LegalityRecheckIndicator — stuck-button recovery + give-up notification.
 *
 * Same shape of bug as the Scenario recheck button (see
 * scenario-legality-recheck-stuck-recovery.spec.ts): "Recheck now" was permanently
 * disabled while status stayed 'computing', with no way to force a retry and no
 * notification if polling ever gave up. This proves: after 10 min stuck, the button
 * re-enables and the label shows the hint; after the 30-min poll cap with no
 * settlement, a "Still checking" toast appears instead of silent give-up.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

test.describe('Live Legality Recheck — stuck-button recovery', () => {
  test('button re-enables after 10 min stuck; gives up with a toast after the 30 min poll cap', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.clock.install({ time: new Date('2026-07-07T00:00:00Z') })

    await page.route('**/api/legality/recheck-status**', (route) => route.fulfill(json({
      status: 'computing', lastCheckedAt: null, error: null,
    })))

    // Same navigation as legality-auto-recheck.spec.ts's openLegalityDefault helper.
    await page.goto('/altair/')
    await page.getByTestId('module-nav-legality').click()
    await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })
    await expect(page.getByTestId('legality-recheck-indicator')).toBeVisible({ timeout: 10_000 })

    const recheckBtn = page.getByTestId('legality-recheck-now')
    await expect(recheckBtn).toBeDisabled()

    // `fastForward` only fires each due timer at most once, so it never replays a
    // repeating setInterval enough times to accumulate the poll-cap count below —
    // `runFor` actually fires the interval callback once per elapsed 1500ms tick,
    // which is what's needed for both the stuck threshold (elapsed time) and the
    // poll cap (elapsed time / interval period) to be exercised for real.
    await page.clock.runFor(10 * 60_000 + 5_000) // past the 10-min stuck threshold
    await expect(recheckBtn).toBeEnabled()
    await expect(page.getByTestId('legality-recheck-label')).toContainText('taking longer than usual')

    await page.clock.runFor(20 * 60_000) // total ~30 min → exhausts the poll cap
    await expect(page.getByText('Still checking — click Recheck to retry')).toBeVisible({ timeout: 5_000 })
  })
})
