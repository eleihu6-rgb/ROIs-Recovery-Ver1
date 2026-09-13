/**
 * Viewer: open the Live gantt headed, filter to the six Auto-assign Duties test
 * crew (ADD J4020–J4022, DXB K1001–K1003) over September 2026, and hold the
 * browser open so the result can be inspected by eye. Read-only; no writes.
 *
 * Run: cd e2e && GANTT_BASE_URL=https://cr.rois.one npx playwright test \
 *   --config=config/playwright.config.ts --project=gantt --headed \
 *   tests/gantt/auto-assign-duties-show-crew.spec.ts
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { applyFilterLight, openFilter, readHook, seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CREW = (process.env.SHOW_CREW ?? 'J4020,J4021,J4022,K1001,K1002,K1003').split(',').map((s) => s.trim()).filter(Boolean)
const HOLD_MS = Number(process.env.SHOW_HOLD_MS ?? 15 * 60_000)

test('show the six Auto-assign Duties crew over September 2026 (headed viewer)', async ({ page, request }) => {
  test.setTimeout(HOLD_MS + 240_000)
  await page.setViewportSize({ width: 1920, height: CREW.length > 6 ? 1700 : 1080 })
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)
  await setDateRange(page, '2026-09-01', '2026-09-30')

  await openFilter(page, 'pairing')
  await page.getByTestId('filter-tab-crew').click()
  const crewIdInput = page.getByTestId('filter-crew-id')
  for (const id of CREW) {
    await crewIdInput.click()
    await crewIdInput.fill(id)
    await crewIdInput.press('Enter')
  }
  await applyFilterLight(page)
  await expect
    .poll(
      () => readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder').then((rows) => rows.slice(0, CREW.length).map((r) => r.crewId).sort()),
      { timeout: 60_000, message: 'six crew at the top of the roster' },
    )
    .toEqual([...CREW].sort())

  await page.screenshot({ path: path.resolve(HERE, '../../../docs/assets/screenshots/gantt', `auto-assign-duties-${CREW.length === 6 ? 'six-crew' : `${CREW.length}-crew`}-Ver1.png`) })
  await page.waitForTimeout(HOLD_MS) // hold the headed browser open for inspection
})
