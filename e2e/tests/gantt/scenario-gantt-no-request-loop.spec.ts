/**
 * Regression: Scenario Gantt must not retry-loop /gantt-data.
 *
 * The mount effect's cleanup destroyed the per-scenario zustand store; with
 * React StrictMode the destroy→recreate cycle gave loadData a new identity on
 * every render, re-firing the effect in an infinite request loop. With the
 * endpoint fast-failing (e.g. 502 when the optimizer task result is gone) the
 * tab flooded live-server with hundreds of requests per second, starving all
 * other requests of the browser's per-origin connection pool (observed as
 * "pairing loads but roster stays empty" in the Live view).
 *
 * This test opens a Scenario Gantt tab directly and asserts the request count
 * stays bounded over an observation window, whatever the endpoint returns.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const SCENARIO_ID = 6

test('Scen-2012 — scenario gantt fires a bounded number of gantt-data requests (no retry loop)', async ({ page, request }) => {
  test.setTimeout(120_000)
  await seedGanttAuth(page, request)
  // Open the scenario-gantt tab directly via persisted shell state.
  await page.addInitScript((id) => {
    window.localStorage.setItem('rois-shell-module', `scenario-gantt:${id}`)
    window.localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['dashboard', `scenario-gantt:${id}`]))
  }, SCENARIO_ID)

  let ganttDataRequests = 0
  page.on('request', (req) => {
    if (req.url().includes(`/api/scenario/${SCENARIO_ID}/gantt-data`)) ganttDataRequests++
  })

  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // The scenario gantt view is mounted (tab restored from storage).
  await expect(
    page.getByTestId('scenario-gantt-view').or(page.getByText(/Loading scenario data|Error:/)),
  ).toBeVisible({ timeout: 15_000 })

  // Observation window: a retry loop produced hundreds of requests per second
  // here. StrictMode legitimately double-mounts (2 requests); allow small
  // headroom for a scenario-list prefetch but nothing loop-like.
  await page.waitForTimeout(8_000)
  expect(ganttDataRequests).toBeLessThanOrEqual(4)

  // The view settled into a real terminal state (data or error — not a churn).
  const settled = await page.evaluate(() => {
    const txt = document.body.innerText
    return /Error:/.test(txt) || document.querySelector('[data-testid="scenario-gantt-view"]') !== null
  })
  expect(settled).toBe(true)
})
