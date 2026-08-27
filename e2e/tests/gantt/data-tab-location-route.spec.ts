/**
 * Data Tab — Location & Route: real-data regression.
 *
 * Regression for: `dataRoutes` was never registered in live-server/src/index.ts,
 * so every POST /api/data/* call returned 404. The Data tab swallows the error
 * (`.catch(() => setLoadedRows(entityId, []))`) and renders "No records" for
 * EVERY entity — exactly the symptom reported (Airport section empty despite the
 * airport table holding 4500+ rows).
 *
 * These tests would have been RED before the fix:
 *  - API: POST /api/data/table for `airport` 404'd (no body.code) instead of 200.
 *  - UI:  the Airport grid showed "No records" instead of table rows.
 *
 * §No-Illusion: assert concrete rows + the literal "No records" is absent, not
 * just that the section is visible (a section is visible while showing "No records").
 */
import { test, expect } from '@playwright/test'
import { ganttApiLogin, seedGanttAuth } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

test.describe('Data Tab — Location & Route (real-data regression)', () => {
  test('Live-1020 — POST /api/data/table returns 200 with airport rows — route IS registered', async ({ request }) => {
    const authToken = await ganttApiLogin(request)

    const res = await request.post(`${GANTT_API}/api/data/table`, {
      data: { pageId: 'basic.location-route', entityId: 'airport', page: 1, pageSize: 0 },
      headers: { Authorization: `Bearer ${authToken}` },
    })

    // Before the fix this was HTTP 404 (route not found). Now it must be the
    // standard envelope with code 200.
    expect(res.status(), 'route must be registered (not 404)').toBe(200)
    const body = await res.json()
    expect(body.code, 'envelope code must be 200, not a 404 body').toBe(200)
    expect(Array.isArray(body.data.rows), 'data.rows must be an array').toBeTruthy()
    expect(body.data.total, 'airport table must report > 0 total rows').toBeGreaterThan(0)
    expect(body.data.rows.length, 'pageSize 0 must return all rows').toBe(body.data.total)
  })

  test('Live-1264 — Airport section shows real records — not "No records"', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')

    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })

    // Basic root defaults to expanded — click the Location & Route page directly.
    await page.getByTestId('data-tree-item-basic.location-route').click()

    const section = page.getByTestId('data-section-airport')
    await section.waitFor({ state: 'visible', timeout: 10_000 })

    const grid = page.getByTestId('data-grid-airport')

    // Concrete data assertions (§No-Illusion):
    // 1. The "No records" empty state must NOT be present.
    await expect(grid).not.toContainText('No records', { timeout: 10_000 })
    // 2. The grid must render an actual <table> with data rows.
    const rows = grid.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    expect(await rows.count(), 'airport grid must render at least one data row').toBeGreaterThan(0)
    // 3. The section header row-count badge (rendered only when rowCount > 0) is present.
    await expect(section.locator('span.font-mono')).toBeVisible()
    // 4. Basic Data pages now rely on virtual rows instead of paging controls.
    await expect(section.getByTestId('data-pagination')).toHaveCount(0)
  })
})
