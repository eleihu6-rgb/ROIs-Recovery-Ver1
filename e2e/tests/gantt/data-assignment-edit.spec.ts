/**
 * Data Tab — Assignment page: display + editable round-trip.
 *
 * Covers the newly-populated `basic.assignment` page (Assignment /
 * Assignment Group / Assignment Group Map sections):
 *   1. All three sections render with real column headers + concrete row data
 *      (§No-Illusion: assert specific text/counts, never bare visibility).
 *   2. A reusable round-trip editor proves a field can be edited, saved to the
 *      DB, read back after a full page reload, reverted, and saved again.
 *
 * NON-DESTRUCTIVE: the round-trip captures the original value, and a try/finally
 * restores it via the save API even if an assertion fails mid-way. Net effect on
 * business data is zero (audit columns updated_at/updated_by do change — that is
 * unavoidable for any real save).
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl } from '../../utils/gantt-hook'
import type { DataEntityId } from '../../../gantt/src/types/data-maintenance'

const openAssignmentPage = async (page: Page) => {
  await page.goto('/altair/')
  await page.getByTestId('module-nav-data').click()
  await page.getByTestId('data-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('data-tree-item-basic.assignment').click()
  await page.getByTestId('data-section-assignment').waitFor({ state: 'visible', timeout: 10_000 })
  await expect(page.getByTestId('data-section-assignment')).toContainText('Double-click a cell to edit.')
  await expect(page.getByTestId('data-grid-assignment').locator('thead tr')).toBeVisible({ timeout: 10_000 })
}

/** Restore a field on a row directly through the save API (best-effort safety net). */
const apiRestore = async (
  request: APIRequestContext,
  token: string,
  entityId: DataEntityId,
  rowId: number,
  field: string,
  value: string,
) => {
  try {
    await request.post(`${ganttApiUrl}/api/data/save`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        changes: [
          { clientChangeId: `restore-${entityId}-${rowId}`, entityId, action: 'update', rowId, after: { [field]: value } },
        ],
      },
    })
  } catch {
    // best-effort; the in-test revert is the primary restoration path
  }
}

/**
 * Reusable round-trip editor for any editable Data-tab entity.
 *
 * Edits `field` of the first row → saves → reloads the page → asserts the new
 * value persisted → reverts to the original → reloads → asserts restored.
 */
const roundTripEditFirstRow = async (
  page: Page,
  request: APIRequestContext,
  token: string,
  entityId: DataEntityId,
  field: string,
  nextValueFor: (original: string) => string = (original) => `${original} [E2E]`.slice(0, 100),
) => {
  const grid = page.getByTestId(`data-grid-${entityId}`)
  const firstRow = grid.locator('tbody tr').first()
  const firstCopyBtn = grid.locator('[data-testid^="data-copy-row-"]').first()
  await expect(firstCopyBtn).toBeVisible({ timeout: 10_000 })
  const testidAttr = (await firstCopyBtn.getAttribute('data-testid')) ?? ''
  const rowId = Number(testidAttr.replace('data-copy-row-', ''))
  expect(Number.isInteger(rowId), `could not parse rowId from "${testidAttr}"`).toBeTruthy()

  const fieldCell = () =>
    firstRow.getByTestId(`data-cell-${entityId}-${field}`)

  const originalText = (await fieldCell().textContent())?.trim() ?? ''
  const original = originalText === '—' ? '' : originalText
  const edited = nextValueFor(original)

  await expect(fieldCell().getByTestId(`data-cell-editable-${entityId}-${field}`)).toHaveAttribute(
    'title',
    'Double-click to edit',
  )

  let restored = false
  try {
    // 1) Double-click cell → edit → immediate save.
    await fieldCell().dblclick()
    const editor = page.getByTestId(`data-cell-editor-${entityId}-${field}`)
    await expect(editor).toBeVisible()
    await editor.fill(edited)
    await page.getByTestId(`data-cell-save-${entityId}-${field}`).click()
    await expect(editor).toBeHidden({ timeout: 10_000 })

    // 2) Full reload proves the value reached the DB (fresh fetch, no cache).
    await openAssignmentPage(page)
    const reloadedGrid = page.getByTestId(`data-grid-${entityId}`)
    const reloadedRow = reloadedGrid.locator(`[data-testid="data-copy-row-${rowId}"]`).locator('xpath=ancestor::tr[1]')
    await expect(reloadedRow.getByTestId(`data-cell-${entityId}-${field}`)).toHaveText(edited, { timeout: 10_000 })

    // 3) Revert via inline edit.
    await reloadedRow.getByTestId(`data-cell-${entityId}-${field}`).dblclick()
    const revertEditor = page.getByTestId(`data-cell-editor-${entityId}-${field}`)
    await expect(revertEditor).toBeVisible()
    await revertEditor.fill(original)
    await page.getByTestId(`data-cell-save-${entityId}-${field}`).click()
    await expect(revertEditor).toBeHidden({ timeout: 10_000 })

    // 4) Reload again proves the original value is back in the DB.
    await openAssignmentPage(page)
    const restoredRow = page.getByTestId(`data-grid-${entityId}`).locator(`[data-testid="data-copy-row-${rowId}"]`).locator('xpath=ancestor::tr[1]')
    await expect(restoredRow.getByTestId(`data-cell-${entityId}-${field}`)).toHaveText(original || '—', { timeout: 10_000 })
    restored = true
  } finally {
    if (!restored) await apiRestore(request, token, entityId, rowId, field, original)
  }
}

test.describe('Data Tab — Assignment page', () => {
  test.describe.configure({ mode: 'serial' })

  test('Data-5020 — Assignment, Group and Group-Map sections display real data', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    const dataView = page.getByTestId('data-view')

    // All three sections render.
    await expect(dataView.getByTestId('data-section-assignment')).toBeVisible()
    await expect(dataView.getByTestId('data-section-assignment_group')).toBeVisible()
    await expect(dataView.getByTestId('data-section-assignment_group_map')).toBeVisible()

    // Assignment grid: real column headers (not the old single-ID stub).
    const grid = page.getByTestId('data-grid-assignment')
    const headerRow = grid.locator('thead tr')
    await expect(headerRow).toContainText('Code')
    await expect(headerRow).toContainText('Description')
    await expect(headerRow).toContainText('Type')
    await expect(headerRow).toContainText('Color')

    // Concrete row content (seed has 21 assignment rows incl. Annual Leave).
    // Each grid loads via an independent async fetch, so poll the row count to
    // avoid racing a still-loading grid.
    await expect
      .poll(() => grid.locator('tbody tr').count(), { timeout: 10_000, message: 'assignment grid must have rows' })
      .toBeGreaterThan(1)
    await expect(grid).toContainText('Annual Leave')

    // Group grid populated too.
    const groupRows = page.getByTestId('data-grid-assignment_group').locator('tbody tr')
    await expect
      .poll(() => groupRows.count(), { timeout: 10_000, message: 'assignment_group grid must have rows' })
      .toBeGreaterThan(0)

    // Group-map keeps row actions, while normal updates happen by inline cell editing.
    const mapGrid = page.getByTestId('data-grid-assignment_group_map')
    await expect
      .poll(() => mapGrid.locator('tbody tr').count(), { timeout: 10_000, message: 'group_map grid must have rows' })
      .toBeGreaterThan(0)
    await expect(mapGrid.locator('thead tr')).toContainText('Actions')
    await expect(mapGrid.locator('[data-testid^="data-copy-row-"]').first()).toBeVisible()

    // Group-map resolves the raw FK ids to human-readable codes (not numbers).
    const mapHeader = mapGrid.locator('thead tr')
    await expect(mapHeader).toContainText('Group')
    await expect(mapHeader).toContainText('Assignment')
    const firstGroupCode = (
      await mapGrid.locator('[data-testid="data-cell-assignment_group_map-groupCode"]').first().textContent()
    )?.trim() ?? ''
    expect(firstGroupCode, 'group map must show a code, not a raw id').toMatch(/[A-Za-z]/)
  })

  test('Data-5022 — Assignment grid columns are sortable, defaulting to the code column', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    const grid = page.getByTestId('data-grid-assignment')
    const codeCells = () => grid.locator('[data-testid="data-cell-assignment-assignment"]').allTextContents()
    const descCells = () => grid.locator('[data-testid="data-cell-assignment-description"]').allTextContents()

    // Wait for rows, then assert the DEFAULT order is ascending by code.
    await expect.poll(() => grid.locator('tbody tr').count(), { timeout: 10_000 }).toBeGreaterThan(1)
    const asc = await codeCells()
    const sortedAsc = [...asc].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    expect(asc, 'default sort must be ascending by code').toEqual(sortedAsc)

    // Click the code header → toggles to descending.
    await grid.getByTestId('data-grid-header-assignment-assignment').click()
    await expect
      .poll(async () => {
        const visible = await codeCells()
        return visible.join('|')
      })
      .not.toBe(asc.join('|'))
    const desc = await codeCells()
    expect(desc, 'code header toggles visible rows to descending').toEqual(
      [...desc].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    )

    // Sorting by a different column (Description) reorders by that column ascending.
    await grid.getByTestId('data-grid-header-assignment-description').click()
    const byDesc = await descCells()
    expect(byDesc, 'clicking Description sorts ascending by description').toEqual(
      [...byDesc].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    )
  })

  test('Data-5026 — large Assignment table virtualizes rows while scrolling', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.route('**/api/data/table', async (route) => {
      const body = route.request().postDataJSON() as { entityId?: string }
      if (body.entityId !== 'assignment') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, data: { rows: [], total: 0, page: 1, pageSize: 500 }, message: 'ok' }),
        })
        return
      }
      const rows = Array.from({ length: 240 }, (_, index) => ({
        id: index + 1,
        assignment: `ASG${String(index).padStart(3, '0')}`,
        description: `Virtual row ${index}`,
        type: 'T',
        isRest: 0,
        colorHex: '8B7BD8',
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { rows, total: rows.length, page: 1, pageSize: 500 }, message: 'ok' }),
      })
    })

    await openAssignmentPage(page)
    const grid = page.getByTestId('data-grid-assignment')
    await expect(grid.getByTestId('data-cell-assignment-assignment').first()).toContainText('ASG000')

    const renderedRows = grid.locator('tbody tr:not([aria-hidden="true"])')
    await expect.poll(() => renderedRows.count(), { timeout: 10_000 }).toBeLessThan(80)

    await page.getByTestId('data-section-body-assignment').evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight
      el.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect.poll(async () => {
      const values = await grid.getByTestId('data-cell-assignment-assignment').allTextContents()
      return values.includes('ASG239')
    }, { timeout: 10_000, message: 'virtualized grid should render bottom rows after scrolling' }).toBe(true)
  })

  test('Data-5021 — Assignment row edit saves to DB and reverts cleanly (non-destructive)', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    // Editable entity uses inline cells, not the old row edit dialog.
    await expect(page.getByTestId('data-grid-assignment').locator('[data-testid^="data-edit-row-"]')).toHaveCount(0)

    await roundTripEditFirstRow(page, request, token, 'assignment', 'description')
  })

  test('Data-5023 — Assignment Fixed Credit saves to DB and reverts cleanly', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    await roundTripEditFirstRow(
      page,
      request,
      token,
      'assignment',
      'fixedCreditMin',
      (original) => original === '1' ? '2' : '1',
    )
  })

  test('Data-5025 — Assignment percent ratio rejects human percent input before save', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    const grid = page.getByTestId('data-grid-assignment')
    const firstBtCell = grid.locator('[data-testid="data-cell-assignment-btPct"]').first()
    await expect(firstBtCell).toBeVisible({ timeout: 10_000 })

    await firstBtCell.dblclick()
    const editor = page.getByTestId('data-cell-editor-assignment-btPct')
    await expect(editor).toBeVisible()
    await editor.fill('33')
    await page.getByTestId('data-cell-save-assignment-btPct').click()

    await expect(page.getByTestId('data-cell-error-assignment-btPct')).toContainText('Use 0.33 for 33%')
    await expect(editor).toBeVisible()
  })

  test('Data-5024 — Assignment row actions stay pinned while the wide table scrolls', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await openAssignmentPage(page)

    const scrollBody = page.getByTestId('data-section-body-assignment')
    const grid = page.getByTestId('data-grid-assignment')
    const firstCopy = grid.locator('[data-testid^="data-copy-row-"]').first()
    await expect(firstCopy).toBeVisible({ timeout: 10_000 })

    const before = await firstCopy.boundingBox()
    expect(before, 'copy button must have a bounding box before horizontal scroll').not.toBeNull()

    await scrollBody.evaluate((el) => { el.scrollLeft = el.scrollWidth })

    const bodyBox = await scrollBody.boundingBox()
    const actionCell = firstCopy.locator('xpath=ancestor::td[1]')
    const after = await actionCell.boundingBox()
    expect(bodyBox, 'scroll body must have a bounding box').not.toBeNull()
    expect(after, 'action cell must still have a bounding box after horizontal scroll').not.toBeNull()

    const rightGap = Math.abs((bodyBox!.x + bodyBox!.width) - (after!.x + after!.width))
    expect(rightGap, 'sticky action column should remain near the scroll viewport right edge').toBeLessThan(24)
  })
})
