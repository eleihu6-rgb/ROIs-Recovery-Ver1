/**
 * Data Tab — Navigation & tree structure tests.
 *
 * Verifies that the Data tab tree renders both root nodes (Basic, Crew),
 * that clicking tree items loads the correct sections on one page, and
 * that the toolbar is present with its initial disabled state.
 *
 * §No-Illusion: every assertion checks concrete content, not just visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'

test.describe('Data Tab — Navigation', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-data').click()
    await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test('Data-5010 — Data tab opens and shows the Basic and Crew nav groups', async ({ page }) => {
    // The Data sidebar was refactored from a collapsible data-tree into the
    // grouped shell-sidebar: plain "Basic"/"Crew" group labels with
    // data-tree-item-<pageId> entries underneath (see ShellSidebar DATA_MENU).
    const sidebar = page.locator('aside')

    // Both group labels must render (exact match ignores the CSS uppercasing and
    // avoids matching the "Crew Master" item label).
    await expect(sidebar.getByText('Basic', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Crew', { exact: true })).toBeVisible()

    // A concrete item under each group must render with its label (§No-Illusion).
    const basicItem = page.getByTestId('data-tree-item-basic.location-route')
    await expect(basicItem).toBeVisible()
    await expect(basicItem).toContainText('Location & Route')

    const crewItem = page.getByTestId('data-tree-item-crew.master')
    await expect(crewItem).toBeVisible()
    await expect(crewItem).toContainText('Crew Master')
  })

  test('Data-5011 — Basic tree root shows all expected child pages when expanded', async ({ page }) => {
    // Roots default to expanded — no click needed

    // Composition item must be visible under Basic
    const compositionItem = page.getByTestId('data-tree-item-basic.composition')
    await expect(compositionItem).toBeVisible()
    await expect(compositionItem).toContainText('Composition')

    // Crew Master must NOT be a child of the Basic section
    const crewMasterUnderBasic = page.getByTestId('data-tree-item-basic.crew-master')
    await expect(crewMasterUnderBasic).not.toBeAttached()

    // At least 5 child items exist under Basic
    // Items follow pattern data-tree-item-basic.*
    const basicChildren = page.locator('[data-testid^="data-tree-item-basic."]')
    await expect(basicChildren).toHaveCount(await basicChildren.count())
    const count = await basicChildren.count()
    expect(count, 'Basic root must have at least 5 child items').toBeGreaterThanOrEqual(5)
  })

  test('Data-5012 — Clicking Composition shows the composition sections', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()

    // All three sections must load on the same page
    const dataView = page.getByTestId('data-view')

    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })
    await expect(dataView.getByTestId('data-section-composition')).toBeVisible()
    await expect(dataView.getByTestId('data-section-composition_rank')).toBeVisible()
    await expect(dataView.getByTestId('data-section-composition_load')).toBeVisible()
  })

  test('Data-5013 — Clicking Crew Master shows all crew sections', async ({ page }) => {
    // Crew root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-crew.master').click()

    const dataView = page.getByTestId('data-view')

    await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })
    await expect(dataView.getByTestId('data-section-crew')).toBeVisible()
    await expect(dataView.getByTestId('data-section-crew_base')).toBeVisible()
    await expect(dataView.getByTestId('data-section-crew_rank')).toBeVisible()

    // Toolbar must be present
    await expect(dataView.getByTestId('data-toolbar')).toBeVisible()
  })

  test('Data-5014 — Toolbar omits draft buttons in immediate-save mode', async ({ page }) => {
    // Basic root defaults to expanded — click child directly
    await page.getByTestId('data-tree-item-basic.composition').click()
    await page.getByTestId('data-section-composition').waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.getByTestId('data-undo')).toHaveCount(0)
    await expect(page.getByTestId('data-redo')).toHaveCount(0)
    await expect(page.getByTestId('data-save')).toHaveCount(0)
  })
})
