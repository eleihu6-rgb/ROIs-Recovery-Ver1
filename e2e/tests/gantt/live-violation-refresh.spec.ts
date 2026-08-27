/**
 * Rule Manager — Refresh Live Violations.
 *
 * A live-checking rule set (usage GANTT/ALL) exposes a "Refresh Violations"
 * button that re-runs the violations-init job and shows progress. This proves:
 *  1. usage-gating — the button is absent on a PBS set and present on a GANTT set,
 *  2. confirm dialog → trigger → "Refreshing…" running state → success on done,
 *  3. an admin-gated 403 surfaces an error and the button resets (no stuck spinner).
 *
 * The two admin endpoints are scripted via page.route so the test is
 * deterministic and does not depend on a slow real batch job. Navigation,
 * group selection, and the new UI wiring are exercised for real.
 *
 * §No-Illusion: asserts the gating state change, the running text, the success
 * toast, and the button returning to its idle label — not mere visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const okEnvelope = (data: unknown) =>
  ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data, message: 'ok' }) })

// Select a rule set from the left list by a substring of its row (e.g. its usage badge).
const selectSet = (page: import('@playwright/test').Page, name: RegExp) =>
  page.getByRole('button', { name }).first().click()

test.describe('Rule Manager — refresh live violations', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-rule').click()
    // Wait for the rule-set list to load (the GANTT set row is present).
    await expect(page.getByRole('button', { name: /GANTT/ }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Live-1097 — button is gated to live-checking sets (absent for PBS, present for GANTT)', async ({ page }) => {
    await selectSet(page, /PBS/)
    await expect(page.getByTestId('refresh-violations-btn')).toHaveCount(0)

    await selectSet(page, /GANTT/)
    await expect(page.getByTestId('refresh-violations-btn')).toBeVisible()
  })

  test('Live-1098 — confirm triggers the job, shows progress, then succeeds', async ({ page }) => {
    let statusCalls = 0
    await page.route('**/api/admin/violations-init', (route) =>
      route.fulfill(okEnvelope({ airline: 'F8', ruleGroupCode: 'x', yearsBack: 1 })))
    await page.route('**/api/admin/violations-init/status**', (route) => {
      statusCalls += 1
      const running = statusCalls < 2
      route.fulfill(okEnvelope({
        status: running ? 'running' : 'done',
        doneCount: running ? 40 : 100,
        totalCount: 100,
        progress: running ? 40 : 100,
      }))
    })

    await selectSet(page, /GANTT/)
    const btn = page.getByTestId('refresh-violations-btn')
    await btn.click()

    const dialog = page.getByTestId('refresh-violations-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Recompute live violations')
    await page.getByTestId('refresh-violations-confirm').click()
    await expect(dialog).toBeHidden()

    // Running state: disabled + "Refreshing…".
    await expect(btn).toContainText('Refreshing')
    await expect(btn).toBeDisabled()

    // After the scripted 'done' status, success toast appears and the button resets.
    await expect(page.getByText('Live violations refreshed')).toBeVisible({ timeout: 10_000 })
    await expect(btn).toContainText('Refresh Violations')
    await expect(btn).toBeEnabled()
  })

  test('Live-1099 — an admin-gated 403 surfaces an error and resets the button', async ({ page }) => {
    await page.route('**/api/admin/violations-init', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ code: 403, data: null, message: 'Admin access required' }) }))

    await selectSet(page, /GANTT/)
    const btn = page.getByTestId('refresh-violations-btn')
    await btn.click()
    await page.getByTestId('refresh-violations-confirm').click()

    await expect(page.getByText('Admin access required')).toBeVisible({ timeout: 10_000 })
    await expect(btn).toContainText('Refresh Violations')
    await expect(btn).toBeEnabled()
  })
})
