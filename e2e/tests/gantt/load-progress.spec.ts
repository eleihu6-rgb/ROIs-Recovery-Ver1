/**
 * Live Gantt 真实加载进度条：Apply 后 roster/pairing 各自的 PaneLoadingBar 从 0 走到 100 再消失；
 * 完成后计数不再变化（单轮加载，无 phase-2 重复全量）。
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const gotoLiveRaw = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
}

test('load progress bar reaches 100 then hides; no reload after', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoLiveRaw(page)

  await page.getByTestId('live-empty-state').click()
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible()

  // Roster progress bar appears and advances (>0%). Batched concurrency finishes
  // in ~0.5s, so sampling a literal 100% frame is flaky — assert it moved instead.
  const rosterBar = page.getByTestId('roster-pane').locator('[data-testid="pane-loading-bar"]')
  await expect(rosterBar).toBeVisible({ timeout: 90_000 })
  const fill = page.getByTestId('roster-pane').locator('[data-testid="pane-loading-bar-fill"]')
  await expect
    .poll(async () => {
      const style = await fill.getAttribute('style').catch(() => null)
      const width = Number((style?.match(/width:\s*(\d+)%/) ?? [])[1] ?? 0)
      return width
    }, { timeout: 90_000, message: 'roster progress never advanced past 0%' })
    .toBeGreaterThan(0)

  // Bar hides after load.
  await expect(rosterBar).toHaveCount(0, { timeout: 90_000 })

  // No reload after: roster count stable.
  const rosterBefore = await page.evaluate(() => window.__ganttTest?.counts?.().roster ?? 0)
  await page.waitForTimeout(3000)
  const rosterAfter = await page.evaluate(() => window.__ganttTest?.counts?.().roster ?? 0)
  expect(rosterBefore).toBeGreaterThan(0)
  expect(rosterAfter).toBe(rosterBefore)
})
