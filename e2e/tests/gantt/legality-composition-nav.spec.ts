/**
 * Phase 1 — Composition + Composition Load are reachable under the Legality tab.
 * Asserts the Legality sidebar exposes the two composition sections and that each
 * renders real data (not just "visible"): the Composition Load table row count
 * matches the API, and the Composition view shows a real composition name.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl } from '../../utils/gantt-hook'

test.describe('Legality — Composition migration (Phase 1)', () => {
  let token: string

  test.beforeEach(async ({ page, request }) => {
    token = await seedGanttAuth(page, request)
    await page.goto('/')
  })

  test('Legality sidebar shows Composition + Composition Load with real data', async ({ page, request }) => {
    // Open the Legality tab (top-nav button testid defaults to module-nav-<module>).
    await page.getByTestId('module-nav-legality').click()

    // The new Legality sidebar menu exposes both composition sections.
    await expect(page.getByTestId('legality-nav-composition')).toBeVisible()
    await expect(page.getByTestId('legality-nav-comp-load')).toBeVisible()

    // Rule Sets is the default landing: nav item exists and the view is visible.
    await expect(page.getByTestId('legality-nav-rule-sets')).toBeVisible()
    await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()

    // Composition Load: row count must match the API (correct data, not just rendered).
    const loadsRes = await request.get(`${ganttApiUrl}/api/composition/load`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(loadsRes.ok(), 'composition load list fetch').toBeTruthy()
    const loadsBody = await loadsRes.json()
    const loads = (loadsBody.data ?? loadsBody) as Array<{ id: number }>
    const n = loads.length

    await page.getByTestId('legality-nav-comp-load').click()
    await expect(page.getByTestId('composition-load-view')).toBeVisible()
    await expect(page.getByTestId('composition-load-row')).toHaveCount(n)

    // Composition: a known composition name from the API is shown in the tree.
    const compsRes = await request.get(`${ganttApiUrl}/api/composition`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(compsRes.ok(), 'composition list fetch').toBeTruthy()
    const compsBody = await compsRes.json()
    const comps = (compsBody.data ?? compsBody) as Array<{ id: number; name: string }>
    const firstName = comps[0]?.name
    expect(firstName, 'at least one composition exists').toBeTruthy()

    await page.getByTestId('legality-nav-composition').click()
    await expect(page.getByTestId('composition-view')).toContainText(firstName)
  })
})
