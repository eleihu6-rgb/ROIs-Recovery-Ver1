/**
 * Crew Memo DataGrid — stable ID / Crew ID / Memo column geometry.
 *
 * Data-5020 — locked width classes ship on Crew Memo headers/cells
 * Data-5021 — shortening memo cell text in the DOM must not grow ID / Crew ID
 *             columns or shift Memo's left edge (regression for leftover
 *             `w-full` redistribution under table-layout:auto).
 */
import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const openCrewMemoFor = async (page: Page, crewId: string) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-crew.master').click()
  await page.getByTestId('data-section-crew').waitFor({ state: 'visible', timeout: 10_000 })

  await page.getByTestId('data-filter-crew-id').fill(crewId)
  await page.getByRole('button', { name: /search/i }).click()

  const crewGrid = page.getByTestId('data-grid-crew')
  await expect
    .poll(() => crewGrid.locator('tbody tr').count(), { timeout: 15_000 })
    .toBeGreaterThan(0)

  const memoSection = page.getByTestId('data-section-crew_memo')
  await expect(memoSection).toBeVisible({ timeout: 15_000 })
  await memoSection.scrollIntoViewIfNeeded()

  // Secondary Crew Master sections (incl. Crew Memo) start collapsed.
  const memoBody = page.getByTestId('data-section-body-crew_memo')
  if ((await memoBody.count()) === 0) {
    await memoSection.getByRole('button').first().click()
  }
  await expect(memoBody).toBeVisible({ timeout: 10_000 })

  const memoGrid = page.getByTestId('data-grid-crew_memo')
  await expect(memoGrid).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(() => memoGrid.locator('tbody tr').count(), { timeout: 30_000 })
    .toBeGreaterThan(0)

  return memoGrid
}

type MemoGeometry = {
  idWidth: number
  crewWidth: number
  memoLeft: number
  gapIdCrew: number
  gapCrewMemo: number
}

const measureMemoGeometry = async (page: Page): Promise<MemoGeometry> =>
  page.evaluate(() => {
    const idH = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-id"]')
    const crewH = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-crewId"]')
    const memoH = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-memo"]')
    if (!idH || !crewH || !memoH) {
      throw new Error('Crew Memo headers not found')
    }
    const id = idH.getBoundingClientRect()
    const crew = crewH.getBoundingClientRect()
    const memo = memoH.getBoundingClientRect()
    return {
      idWidth: id.width,
      crewWidth: crew.width,
      memoLeft: memo.left,
      gapIdCrew: crew.left - id.right,
      gapCrewMemo: memo.left - crew.right,
    }
  })

test.describe('Crew Memo — stable column spacing', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Data-5020 — Crew Memo locks ID (w-20) and Crew ID (w-24) column widths', async ({ page }) => {
    const memoGrid = await openCrewMemoFor(page, '113')

    const idHeader = memoGrid.getByTestId('data-grid-header-crew_memo-id')
    const crewHeader = memoGrid.getByTestId('data-grid-header-crew_memo-crewId')
    await expect(idHeader).toHaveClass(/w-20/)
    await expect(crewHeader).toHaveClass(/w-24/)

    const idCell = memoGrid.getByTestId('data-cell-crew_memo-id').first()
    const crewCell = memoGrid.getByTestId('data-cell-crew_memo-crewId').first()
    await expect(idCell).toHaveClass(/w-20/)
    await expect(crewCell).toHaveClass(/w-24/)
  })

  test('Data-5021 — shortening Memo text does not shift ID / Crew ID / Memo geometry', async ({ page }) => {
    await openCrewMemoFor(page, '113')

    const before = await measureMemoGeometry(page)
    expect(before.idWidth, 'ID column must have a real width').toBeGreaterThan(20)
    expect(before.crewWidth, 'Crew ID column must have a real width').toBeGreaterThan(20)

    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="data-cell-crew_memo-memo"]').forEach((td) => {
        const chip = td.querySelector('span.inline-flex span') ?? td
        chip.textContent = 'DO'
      })
    })

    // Force table layout recalculation after DOM text mutation.
    await page.evaluate(() => {
      const table = document.querySelector('[data-testid="data-grid-crew_memo"] table')
      if (table) void (table as HTMLElement).offsetWidth
    })

    const after = await measureMemoGeometry(page)
    const tol = 2
    expect(Math.abs(after.idWidth - before.idWidth), `idWidth before=${before.idWidth} after=${after.idWidth}`).toBeLessThanOrEqual(tol)
    expect(Math.abs(after.crewWidth - before.crewWidth), `crewWidth before=${before.crewWidth} after=${after.crewWidth}`).toBeLessThanOrEqual(tol)
    expect(Math.abs(after.memoLeft - before.memoLeft), `memoLeft before=${before.memoLeft} after=${after.memoLeft}`).toBeLessThanOrEqual(tol)
    expect(Math.abs(after.gapIdCrew - before.gapIdCrew)).toBeLessThanOrEqual(tol)
    expect(Math.abs(after.gapCrewMemo - before.gapCrewMemo)).toBeLessThanOrEqual(tol)
  })
})
