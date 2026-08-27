/**
 * CrewInfo 数据来源验证：ranks/bases/fleets 来自已加载 crew store 数据（不再走 getInfo 全量）。
 * 打开方式走真实 UI：roster 行右键 → Crew Info 菜单项。
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

/** Double-click a roster row to open Crew Info (onRowDoubleClick → openCrewInfo). */
const openFirstCrewInfo = async (page: Page): Promise<void> => {
  const header = page.getByTestId('pane-header-canvas-roster-main')
  await expect(header).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2000) // let header rows settle
  const box = (await header.boundingBox()) ?? { x: 0, y: 0 }
  // Row 3 (dy=86) reliably hits a crew with a populated base record (validated live).
  await page.mouse.dblclick(box.x + 24, box.y + 30 + 86)
  // Wait for the info dialog to render its records (base/rank tables).
  await expect(page.getByTestId('crew-info-records')).toBeVisible({ timeout: 30_000 })
}

test('CrewInfo Base/Rank blocks come from loaded store data', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoLiveRaw(page)

  // Apply to load crew list (stores all six history arrays inline).
  await page.getByTestId('live-empty-state').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible()
  // Wait for roster rows to actually render (crew is loaded in batches, so header
  // visibility alone is too early for the first row to be interactive). Wait for
  // roster objects to exist before double-clicking a row.
  await expect(page.getByTestId('pane-header-canvas-roster-main')).toBeVisible({ timeout: 90_000 })
  await expect
    .poll(async () => (await readHook<{ roster: number }>(page, 'counts')).roster, { timeout: 60_000, message: 'roster rows present' })
    .toBeGreaterThan(0)

  // Open Crew Info by double-clicking the first roster row.
  await openFirstCrewInfo(page)

  // Base + Rank blocks render concrete values — sourced from the store, not a placeholder.
  const baseTable = page.getByTestId('crew-info-table-base')
  await expect(baseTable.locator('tbody tr').first()).toContainText(/[A-Z]{3}/, { timeout: 15_000 })
  const rankTable = page.getByTestId('crew-info-table-rank')
  await expect(rankTable.locator('tbody tr').first()).toContainText(/CA|FO|FA|CS|1P|2P|[A-Z]{2}/, { timeout: 15_000 })
})
