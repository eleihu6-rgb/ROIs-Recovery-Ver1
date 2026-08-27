/**
 * Legality auto-recheck UI (Tasks 8–10).
 *
 * After param changes invalidate the live default ruleset, the planner must know
 * the legality figures may be stale and be able to recheck. Three surfaces:
 *
 *  1. Legality tab header (DEFAULT ruleset 103 only) shows the
 *     LegalityRecheckIndicator: a last-checked label + a "Recheck now" button.
 *  2. A NON-default ruleset (433) hides the indicator entirely.
 *  3. The Alert Center NO LONGER carries the old "Scan live" button; it shows the
 *     same informational recheck indicator instead.
 *
 * The indicator + button render regardless of role; the recheck POST is admin-only.
 * seedGanttAuth logs in as `admin` (isAdmin=1), so the manual recheck succeeds.
 *
 * §No-Illusion: every assertion checks concrete content (label text, set name,
 * button presence/absence), not bare visibility of an empty container.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const openLegalityDefault = async (page: Page, request: APIRequestContext) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  // The indicator renders only for the DEFAULT ruleset (103 "PBS Solver Ruleset").
  await page.getByTestId('legality-ruleset-card-103').click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })
}

test('Legal-6037 — default ruleset header shows recheck indicator + Recheck now', async ({ page, request }) => {
  await openLegalityDefault(page, request)

  await expect(page.getByTestId('legality-recheck-indicator')).toBeVisible()
  // The label is the concrete status string, not an empty span.
  await expect(page.getByTestId('legality-recheck-label')).toContainText(/Last checked|Checking legality|Recheck failed/)
  await expect(page.getByTestId('legality-recheck-now')).toBeVisible()
  await expect(page.getByTestId('legality-recheck-now')).toContainText('Recheck now')
})

test('Legal-6038 — non-default ruleset hides the indicator', async ({ page, request }) => {
  // Start on the DEFAULT ruleset (103) where the indicator is present, then switch
  // to a non-default ruleset (433) and prove the indicator DISAPPEARS. This is a
  // real before/after transition: the indicator unmounts synchronously when
  // `selectedId` flips off the default, so we don't depend on the lagging
  // worksetName text of 433 (which races the async getRuleset(433) fetch).
  await openLegalityDefault(page, request)
  await expect(page.getByTestId('legality-recheck-indicator')).toBeVisible()

  await page.getByTestId('legality-ruleset-card-433').click()
  await expect(page.getByTestId('legality-recheck-indicator')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('legality-recheck-now')).toHaveCount(0)
})

test('Legal-6039 — manual Recheck now fires the recheck + flips to Checking', async ({ page, request }) => {
  await openLegalityDefault(page, request)
  const label = page.getByTestId('legality-recheck-label')
  const btn = page.getByTestId('legality-recheck-now')

  // Register the request listener BEFORE the click so we never miss the POST.
  // The recheck goes through the shared api client (baseURL '/altair/live'), so the
  // real URL contains '/altair/live/api/legality/recheck'; match on the substring
  // '/api/legality/recheck' + POST so we catch it regardless of baseURL and don't
  // confuse it with the GET status call.
  const post = page.waitForRequest(
    (r) => r.url().includes('/api/legality/recheck') && r.method() === 'POST',
  )
  await btn.click()
  await post // the recheck POST actually fired — proves the click did real work

  // The component sets status='computing' SYNCHRONOUSLY in onRecheck before the
  // await, so the label flips deterministically and the button disables while
  // computing. Prefer the disabled state + POST (deterministic); a fast backend
  // could already report "Last checked …" by the time we assert the label.
  await expect(label).toContainText(/Checking legality|Last checked/, { timeout: 8_000 })
  await expect(btn).toBeDisabled()
  await expect(label).not.toContainText('Recheck failed')
})

test('Viol-8009 — Alert Center drops Scan live and shows the last-check indicator', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  // The Alert Center bell lives in the roster-pane toolbar, which only renders once
  // Live data is loaded — go through the full bootstrap (matches alert-center-8002.spec).
  await gotoGantt(page)

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // The old "Scan live" button is gone.
  await expect(page.getByTestId('alert-center-scan')).toHaveCount(0)

  // The informational recheck indicator replaces it, with a concrete status label.
  const indicator = dialog.getByTestId('legality-recheck-indicator')
  await expect(indicator).toBeVisible()
  await expect(dialog.getByTestId('legality-recheck-label'))
    .toContainText(/Last checked|Checking legality|Recheck failed/)
})
