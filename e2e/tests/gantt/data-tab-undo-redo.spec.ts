/**
 * Data Tab — Immediate-save toolbar state tests.
 *
 * The Data tab now saves individual cell edits immediately, so page-level
 * draft buttons are intentionally absent.
 *
 * §No-Illusion: tests assert concrete disabled state, not just presence.
 * Full undo/redo round-trip tests will be added in Phase 2 once cell
 * editing UI is available.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Data Tab — Immediate-save Toolbar State', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test('Live-1026 — Undo and Redo are not shown in immediate-save mode', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-undo')).toHaveCount(0)
    await expect(page.getByTestId('data-redo')).toHaveCount(0)
  })

  test('Live-1027 — Discard button is not shown in immediate-save mode', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-discard')).toHaveCount(0)
  })

  test('Live-1028 — Toolbar stays visible without draft actions on navigation between pages', async ({ page }) => {
    // Step 1: open Composition
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-undo')).toHaveCount(0)

    // Step 2: navigate to Crew Master — undo must still be disabled
    await page.getByTestId('data-tree-item-crew.master').click()
    await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-undo')).toHaveCount(0)

    // Step 3: toolbar itself must remain visible after navigation
    await expect(page.getByTestId('data-toolbar')).toBeVisible()
  })
})
