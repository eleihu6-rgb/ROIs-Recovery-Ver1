/**
 * Crew Master — multi-crew-ID search and sub-resource auto-load.
 *
 * Covers:
 *   Crew-6001 — single crew ID auto-loads sub-resources without a row click
 *   Crew-6002 — multi crew IDs (comma-separated) shows all crews and sub-resources
 *   Crew-6003 — actions column appears on the RIGHT side of the data grid (not left)
 *
 * §No-Illusion: assertions check specific text/counts, not bare visibility.
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const openCrewMaster = async (page: Page) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-crew.master').click()
  // Wait for Crew Basic section to appear.
  await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })
}

test.describe('Crew Master — multi-ID search', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Crew-6001 — single crew ID auto-loads sub-resource sections after Search', async ({ page }) => {
    await openCrewMaster(page)

    // Type a single crew ID and search.
    await page.getByTestId('data-filter-crew-id').fill('247')
    await page.getByRole('button', { name: /search/i }).click()

    // Crew Basic must show the matching crew.
    const crewGrid = page.getByTestId('data-grid-crew')
    await expect
      .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000 })
      .toBeGreaterThan(0)

    // Sub-resources must load automatically (no row click needed).
    // At least the Crew Base and Crew Rank sections should be visible.
    await expect(page.getByTestId('data-section-crew_base')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('data-section-crew_rank')).toBeVisible({ timeout: 10_000 })
  })

  test('Crew-6002 — comma-separated IDs fetch all matching crews and their sub-resources', async ({ page }) => {
    await openCrewMaster(page)

    // First find two crew IDs that exist: use a broad search, grab first two rows.
    await page.getByRole('button', { name: /search/i }).click()
    const crewGrid = page.getByTestId('data-grid-crew')
    await expect
      .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2)

    // Grab the first two Crew IDs from the grid.
    const crewIdCells = crewGrid.locator('[data-testid="data-cell-crew-crewId"]')
    const id1 = ((await crewIdCells.nth(0).textContent()) ?? '').trim()
    const id2 = ((await crewIdCells.nth(1).textContent()) ?? '').trim()
    expect(id1, 'first crew ID must be non-empty').toBeTruthy()
    expect(id2, 'second crew ID must be non-empty').toBeTruthy()

    // Search for both IDs at once (comma-separated).
    await page.getByTestId('data-filter-crew-id').fill(`${id1},${id2}`)
    await page.getByRole('button', { name: /search/i }).click()

    // Crew Basic should show exactly 2 rows (exact IN match).
    await expect
      .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000, message: 'should show 2 crews' })
      .toBe(2)

    // Sub-resources auto-load (multiple crew IDs merged).
    await expect(page.getByTestId('data-section-crew_rank')).toBeVisible({ timeout: 10_000 })
  })

  test('Crew-6002b — period-separated IDs work the same as comma-separated', async ({ page }) => {
    await openCrewMaster(page)

    // Search broadly to get two IDs.
    await page.getByRole('button', { name: /search/i }).click()
    const crewGrid = page.getByTestId('data-grid-crew')
    await expect
      .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2)

    const cells = crewGrid.locator('[data-testid="data-cell-crew-crewId"]')
    const id1 = ((await cells.nth(0).textContent()) ?? '').trim()
    const id2 = ((await cells.nth(1).textContent()) ?? '').trim()

    // Use period as separator.
    await page.getByTestId('data-filter-crew-id').fill(`${id1}.${id2}`)
    await page.getByRole('button', { name: /search/i }).click()

    await expect
      .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000, message: 'period separator must work' })
      .toBe(2)
  })

  test('Crew-6003 — row actions do not replace inline cell editing', async ({ page }) => {
    await openCrewMaster(page)

    // Load some crew rows.
    await page.getByTestId('data-filter-crew-id').fill('247')
    await page.getByRole('button', { name: /search/i }).click()

    // Go to Roster Period and verify that editable cells are the edit entry point.
    await page.getByTestId('data-tree-item-basic.roster-period').click()
    const grid = page.getByTestId('data-grid-roster_period')
    await expect
      .poll(() => grid.locator('tbody tr').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    // Row-level Edit was removed for immediate-save mode; destructive row actions may still exist.
    const headers = grid.locator('thead th')
    const count = await headers.count()
    expect(count, 'must have at least 2 columns').toBeGreaterThanOrEqual(2)
    await expect(grid.getByRole('button', { name: 'Edit' })).toHaveCount(0)

    const editableCell = grid.locator('[data-testid="data-cell-roster_period-rosterPeriod"]').first()
    await expect(editableCell).toBeVisible()
    await editableCell.dblclick()
    await expect(grid.locator('[data-testid="data-cell-editor-roster_period-rosterPeriod"]').first()).toBeVisible()
  })

  test('Crew-6004 — Crew Team grid shows team code and team name fields', async ({ page }) => {
    await page.route('**/api/data/table', async (route) => {
      const body = route.request().postDataJSON() as { entityId?: string }
      if (body.entityId === 'crew') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              rows: [
                {
                  id: 296,
                  crewId: '296',
                  firstName: 'Mock',
                  lastName: 'Crew',
                },
              ],
              total: 1,
              page: 1,
              pageSize: 200,
            },
            message: 'ok',
          }),
        })
        return
      }
      if (body.entityId === 'crew_team') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              rows: [
                {
                  id: 11,
                  crewId: '296',
                  team: 'EQ737',
                  remarks: 'Equipment 737',
                  effDt: '2021-08-01T00:00:00Z',
                  expDt: null,
                  isValid: 1,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 500,
            },
            message: 'ok',
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: { rows: [], total: 0, page: 1, pageSize: 500 },
          message: 'ok',
        }),
      })
    })

    await openCrewMaster(page)
    await page.getByTestId('data-filter-crew-id').fill('296')
    await page.getByRole('button', { name: /search/i }).click()

    const teamGrid = page.getByTestId('data-grid-crew_team')
    await expect.poll(() => teamGrid.locator('tbody tr').count(), { timeout: 10_000 }).toBe(1)

    await expect(teamGrid.getByTestId('data-grid-header-crew_team-team')).toContainText('Team Code')
    await expect(teamGrid.getByTestId('data-grid-header-crew_team-remarks')).toContainText('Team Name')
    await expect(teamGrid).not.toContainText('teamId')
  })

  test('Crew-6005 — Crew Team inline edit saves only the changed cell', async ({ page }) => {
    let savePayload: unknown = null

    await page.route('**/api/data/table', async (route) => {
      const body = route.request().postDataJSON() as { entityId?: string }
      if (body.entityId === 'crew') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: { rows: [{ id: 296, crewId: '296', firstName: 'Mock', lastName: 'Crew' }], total: 1, page: 1, pageSize: 200 },
            message: 'ok',
          }),
        })
        return
      }
      if (body.entityId === 'crew_team') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              rows: [{ id: 11, crewId: '296', team: 'EQ737', remarks: 'Equipment 737' }],
              total: 1,
              page: 1,
              pageSize: 500,
            },
            message: 'ok',
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { rows: [], total: 0, page: 1, pageSize: 500 }, message: 'ok' }),
      })
    })

    await page.route('**/api/data/save', async (route) => {
      savePayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { revisionId: 1, committed: 1 }, message: 'ok' }),
      })
    })

    await openCrewMaster(page)
    await page.getByTestId('data-filter-crew-id').fill('296')
    await page.getByRole('button', { name: /search/i }).click()

    const teamGrid = page.getByTestId('data-grid-crew_team')
    await expect.poll(() => teamGrid.locator('tbody tr').count(), { timeout: 10_000 }).toBe(1)

    const remarksCell = teamGrid.getByTestId('data-cell-crew_team-remarks').first()
    await remarksCell.dblclick()
    await page.getByTestId('data-cell-editor-crew_team-remarks').fill('Updated Team Name')
    await page.getByTestId('data-cell-save-crew_team-remarks').click()

    await expect(remarksCell).toHaveText('Updated Team Name')
    expect(savePayload).toEqual({
      changes: [
        expect.objectContaining({
          entityId: 'crew_team',
          action: 'update',
          rowId: 11,
          before: { remarks: 'Equipment 737' },
          after: { remarks: 'Updated Team Name' },
        }),
      ],
    })
  })
})
