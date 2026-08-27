/**
 * Roster Seniority (SEN) column.
 *
 * Verifies the new SEN column: (1) is present & visible by default in roster-main
 * column config and listed in the Column Settings dialog; (2) renders real crew
 * seniority data (cross-checked against crew-store, not a placeholder); (3) can be
 * toggled off via the dialog. Assertions use window.__ganttTest store/render truth
 * per docs/test-cases/gantt/anti-illusion-rules.md (no bare toBeVisible on canvas).
 */
import { test, expect } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const stripZeros = (v: string | null): string =>
  v == null || v === '' ? '' : v.replace(/\.0+$/, '')

test.describe('Roster Seniority Column', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__ganttTest!.rosterPanel())).length)
      .toBeGreaterThan(0)
  })

  test('Live-1218 — SEN column is present and visible by default @smoke', async ({ page }) => {
    const cols = await page.evaluate(() => window.__ganttTest!.rosterColumns())
    const sen = cols.find((c) => c.key === 'seniority')
    expect(sen, 'seniority column exists in roster-main config').toBeTruthy()
    expect(sen!.label, 'label is Sen').toBe('Sen')
    expect(sen!.visible, 'visible by default').toBe(true)
  })

  test('Live-1219 — SEN column renders real crew seniority (cross-checked, not placeholder)', async ({ page }) => {
    const [panel, crew] = await page.evaluate(() => [
      window.__ganttTest!.rosterPanel(),
      window.__ganttTest!.crewSeniority(),
    ])
    expect(panel.length, 'panel rows present').toBeGreaterThan(0)

    const crewById = new Map(crew.map((c) => [c.crewId, c.seniorityNum]))
    for (const row of panel) {
      expect(crewById.has(row.crewId), `crew ${row.crewId} known to crew-store`).toBe(true)
      expect(row.seniority).toBe(stripZeros(crewById.get(row.crewId) ?? null))
    }

    const nonEmpty = panel.filter((r) => r.seniority !== '')
    expect(nonEmpty.length, 'at least one crew has a seniority value').toBeGreaterThan(0)
    expect(nonEmpty.every((r) => /^\d+(\.\d+)?$/.test(r.seniority)), 'seniority values are numeric').toBe(true)
  })

  test('Live-1220 — Column Settings dialog lists SEN and can toggle it off', async ({ page }) => {
    await page.getByTitle('Column settings').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Sen', { exact: true }), 'Sen listed in dialog').toBeVisible()

    await dialog.getByText('Sen', { exact: true }).locator('xpath=preceding-sibling::button[1]').click()

    await expect.poll(async () => {
      const cols = await page.evaluate(() => window.__ganttTest!.rosterColumns())
      return cols.find((c) => c.key === 'seniority')?.visible
    }).toBe(false)
  })
})
