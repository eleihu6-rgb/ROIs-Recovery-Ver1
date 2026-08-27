/**
 * Scenario Gantt — Zoom In / Out (Issue 2 regression).
 *
 * The scenario toolbar must use the SAME shared zoom control as Live
 * (ZoomControlView, testids zoom-in / zoom-out) and actually change the canvas
 * geometry. Asserts the real zoom state (scenarioZoom().pxPerHour) — not just
 * button enable/disable — so it proves the buttons drive the canvas, and that the
 * shared control replaced the old forked inline buttons (sg-zoom-in/out are gone).
 *
 * Uses the stable demo scenario #6 (deterministic) instead of creating throwaway
 * scenarios, whose names collided in the shared demo DB and made the old test flaky.
 *
 * Requires: live-server (SCENARIO_GANTT_SOURCE=db) + scenario #6 (26 crew).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'
const SCENARIO_ID = 6

interface Auth { token: string; userCode: string; userName: string; schema: string }

const login = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, { data: { userCode: GANTT_USER, password: GANTT_PASS } })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

async function openScenario6(page: Page) {
  await page.goto('/altair/')
  await page.waitForLoadState('networkidle')
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()
  await page.getByPlaceholder('Search scenarios…').fill('RO-2026-06 YEG Test---')
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${SCENARIO_ID}`, { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 10_000 })
  await item.click()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  const ganttView = page.getByTestId('scenario-gantt-view')
  await expect(ganttView).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 15_000 })
  return ganttView
}

const pph = (page: Page): Promise<number> =>
  page.evaluate((sid) => window.__ganttTest!.scenarioZoom!(sid).pxPerHour, SCENARIO_ID)

test.describe('Scenario Gantt — zoom controls', () => {
  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }))
    }, auth)
  })

  test('Scen-2014 — shared zoom control changes pxPerHour and disables at boundaries', async ({ page }) => {
    const ganttView = await openScenario6(page)
    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')

    // The old forked buttons are gone; the shared control (zoom-in/zoom-out) is used.
    await expect(toolbar.getByTestId('sg-zoom-in')).toHaveCount(0)
    await expect(toolbar.getByTestId('sg-zoom-out')).toHaveCount(0)
    const zoomInBtn = toolbar.getByTestId('zoom-in')
    const zoomOutBtn = toolbar.getByTestId('zoom-out')
    await expect(zoomInBtn).toBeVisible()
    await expect(zoomOutBtn).toBeVisible()

    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    // Zoom IN once → pxPerHour strictly increases (the control drives the canvas geometry).
    const before = await pph(page)
    await zoomInBtn.click()
    await expect.poll(() => pph(page), { message: 'zoom-in should increase pxPerHour' }).toBeGreaterThan(before)

    // Zoom OUT twice → pxPerHour strictly decreases below the zoomed-in value.
    const afterIn = await pph(page)
    await zoomOutBtn.click()
    await zoomOutBtn.click()
    await expect.poll(() => pph(page), { message: 'zoom-out should decrease pxPerHour' }).toBeLessThan(afterIn)

    // Zoom IN to the max bound → button disables and pxPerHour sits at zoomMax.
    for (let i = 0; i < 20 && (await zoomInBtn.getAttribute('disabled')) === null; i++) {
      await zoomInBtn.click()
      await page.waitForTimeout(60)
    }
    await expect(zoomInBtn).toBeDisabled()
    const { pxPerHour: atMaxPph, zoomMax } = await page.evaluate((sid) => window.__ganttTest!.scenarioZoom!(sid), SCENARIO_ID)
    expect(atMaxPph).toBeGreaterThanOrEqual(zoomMax * 0.99)

    // Zoom OUT to the min bound → button disables and pxPerHour sits at zoomMin.
    for (let i = 0; i < 20 && (await zoomOutBtn.getAttribute('disabled')) === null; i++) {
      await zoomOutBtn.click()
      await page.waitForTimeout(60)
    }
    await expect(zoomOutBtn).toBeDisabled()
    const { pxPerHour: atMinPph, zoomMin } = await page.evaluate((sid) => window.__ganttTest!.scenarioZoom!(sid), SCENARIO_ID)
    expect(atMinPph).toBeLessThanOrEqual(zoomMin * 1.01)

    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
    await expect(ganttView).toBeVisible()
  })

  test('Scen-2015 — canvas survives zoom in/out without data loss', async ({ page }) => {
    const ganttView = await openScenario6(page)
    const toolbar = ganttView.getByTestId('scenario-gantt-toolbar')
    const canvases = ganttView.locator('canvas')
    const canvasCount = await canvases.count()
    expect(canvasCount, 'gantt should have at least one canvas').toBeGreaterThan(0)

    await toolbar.getByTestId('zoom-in').click()
    await page.waitForTimeout(200)
    await toolbar.getByTestId('zoom-out').click()
    await page.waitForTimeout(200)

    expect(await canvases.count(), 'canvases should still exist after zoom').toBe(canvasCount)
    // Crew data is intact after zoom (still 26 crew in the store).
    await expect
      .poll(() => page.evaluate((sid) => window.__ganttTest?.scenarioRoster(sid)?.crew.length ?? 0, SCENARIO_ID))
      .toBe(26)
  })
})
