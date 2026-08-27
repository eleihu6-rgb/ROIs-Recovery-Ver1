/**
 * Scenario Recheck — stuck-button recovery + settle notification (Scen-535 follow-up).
 *
 * Root cause of the original bug: scenario.legality_status can get pinned at COMPUTING
 * forever if the detached compute child dies without going through the code's own
 * exit/error handlers (see chat log for 2026-07-07). The Recheck button was permanently
 * disabled in that state with no way for the user to force a retry, and no notification
 * ever told them a recheck (manual or passively observed) had finished.
 *
 * This spec proves the frontend recovery: after 90s of continuous COMPUTING, the button
 * re-enables and the status indicator shows a "taking longer than usual" hint; clicking
 * it re-POSTs the recheck, and once the (mocked) backend settles to READY, a success
 * toast appears.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, findScenario } from '../../utils/gantt-hook'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

const buildMockGanttData = (scenarioId: number, scenarioName: string) => ({
  scenarioId,
  scenarioName,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00',
  scenarioEndDt: '2026-03-31T00:00:00',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: [],
  pairings: [],
  assignments: [],
  pairingSegments: [],
  flights: [],
  groundItems: [],
  crewStats: {},
})

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

test.describe('Scenario Recheck — stuck-button recovery', () => {
  test('button re-enables after 90s stuck, notifies success on settle', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id, name } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    // Fake clock BEFORE navigation so every timer the app sets (the 2s stuck-timer tick,
    // the 2.5s legality poll) is deterministically fast-forwardable.
    await page.clock.install({ time: new Date('2026-07-07T00:00:00Z') })

    await page.route(`**/api/scenario/${id}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(id, name))))
    await page.route(`**/api/scenario/${id}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))

    let legalityStatus: 'COMPUTING' | 'READY' = 'COMPUTING'
    await page.route(`**/api/scenario/${id}/legality`, (route) => route.fulfill(json(
      legalityStatus === 'COMPUTING'
        ? { status: 'COMPUTING', violations: [], computedAt: null, errorText: null }
        : { status: 'READY', violations: [], computedAt: '2026-07-07T00:02:00.000Z', errorText: null },
    )))
    await page.route(`**/api/scenario/${id}/legality/recheck`, (route) => route.fulfill(json({ status: 'COMPUTING' })))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(id, name)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    const recheckBtn = page.getByTestId('scenario-legality-recheck')
    await expect(recheckBtn).toBeVisible()
    await expect(recheckBtn).toBeDisabled() // freshly COMPUTING — not yet "stuck"

    // Fast-forward past the 90s stuck threshold (and past several 2.5s polls + 2s stuck-ticks).
    await page.clock.fastForward(95_000)

    await expect(recheckBtn).toBeEnabled()

    // Open the alert dialog to confirm the status indicator shows the "taking longer" hint.
    await page.getByTestId('violations-button').click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('scenario-recheck-label')).toContainText('taking longer than usual')
    // Two elements match the accessible name "Close" (the header X icon-button's
    // aria-label, and the footer text button) — filter by visible TEXT content
    // (hasText), which only the footer button has (the X button is icon-only).
    await dialog.getByRole('button').filter({ hasText: 'Close' }).click()

    // Click Recheck while "stuck" → re-POSTs. The mock still returns COMPUTING at this
    // point — legalityStatus only flips to 'READY' AFTER we confirm at least one poll
    // tick observed COMPUTING. pollScenarioLegality only notifies on a COMPUTING→settled
    // transition it actually witnessed (see Step 1's `wasComputing` guard); flipping to
    // READY before that first observation would silently skip the notify and defeat
    // this assertion.
    await recheckBtn.click()
    await page.clock.fastForward(3_000) // one 2.5s poll tick fires, observes COMPUTING

    legalityStatus = 'READY'
    await page.clock.fastForward(3_000) // next poll tick observes READY → notify fires
    // Two independent poll chains are alive here (the view's own mount-time poll — which
    // also started with status already COMPUTING and so also witnesses this same
    // COMPUTING→READY settle — and the one started by our recheckBtn click above), so the
    // identical toast can legitimately render twice. `.first()` proves at least one fired
    // (the real assertion this test cares about) without over-constraining on count.
    await expect(page.getByText('Legality recheck complete').first()).toBeVisible({ timeout: 5_000 })
  })

  test('polling failure after manual recheck restores the button and shows failed status', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    const { id, name } = await findScenario(request, token, { fileType: 'RO', status: 'DONE' })

    await page.clock.install({ time: new Date('2026-07-07T00:00:00Z') })

    await page.route(`**/api/scenario/${id}/gantt-data`, (route) => route.fulfill(json(buildMockGanttData(id, name))))
    await page.route(`**/api/scenario/${id}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))

    let failLegalityReads = false
    await page.route(`**/api/scenario/${id}/legality`, (route) => {
      if (failLegalityReads) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 500, data: null, message: 'database read failed' }),
        })
      }
      return route.fulfill(json({
        status: 'READY',
        violations: [],
        computedAt: '2026-07-07T00:00:00.000Z',
        errorText: null,
      }))
    })
    await page.route(`**/api/scenario/${id}/legality/recheck`, (route) => {
      failLegalityReads = true
      return route.fulfill(json({ status: 'COMPUTING' }))
    })

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(id, name)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })

    const recheckBtn = page.getByTestId('scenario-legality-recheck')
    await expect(recheckBtn).toBeVisible()
    await expect(recheckBtn).toBeEnabled()

    await recheckBtn.click()
    await expect(recheckBtn).toBeDisabled()

    for (let i = 0; i < 12; i++) {
      await page.clock.fastForward(3_000)
    }

    await expect(recheckBtn).toBeEnabled()
    await page.getByTestId('violations-button').click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('scenario-recheck-label')).toContainText('Recheck failed')
  })
})
