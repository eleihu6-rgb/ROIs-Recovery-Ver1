/**
 * Legality Parameter Table Editor — admin editing features.
 * Legal-6020 through Legal-6031.
 *
 * Uses rule 8002/001 "Maximum Flight Time" (10 cols ≤12 → inline edit mode).
 * Uses rule 8056/001 "Roster Spacing" (24 cols >12 → dialog edit mode).
 *
 * 8002/001 columns: Bases(0) Ranks(1) Fleets(2) Crew Teams(3) Period(4)
 *                   Unit(5) Prorated(6) Max Limits(7) Min Limits(8) Type(9)
 * Max Limits (col 7) has HH:MM format — used for format-validation tests.
 *
 * §No-Illusion: all assertions check concrete content, not just visibility.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, seedGanttAuth } from '../../utils/gantt-hook'

/** Snapshot a rule's param_json via the legality API, returns it for later restore. */
const snapshotParamJson = async (request: APIRequestContext, rulesetId: number, fn: number, inst: string) => {
  const token = await ganttApiLogin(request)
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${rulesetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json()) as { data: { rules: Array<{ function: number; instance: string; id: number; paramJson: unknown }> } }
  const rule = body.data.rules.find((r) => r.function === fn && r.instance === inst)
  return { token, ruleId: rule!.id, paramJson: rule!.paramJson }
}

/** Restore a rule's param_json via PATCH to undo test-induced saves. */
const restoreParamJson = async (request: APIRequestContext, token: string, ruleId: number, paramJson: unknown) => {
  await request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
  })
}

/** Login as admin and seed sessionStorage. */
const seedAdminAuth = async (page: Page, request: APIRequestContext): Promise<void> => {
  await seedGanttAuth(page, request)
}

const openLegalityAsAdmin = async (page: Page, request: APIRequestContext) => {
  await seedAdminAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('legality-ruleset-card-433').click()
  await expect(page.getByTestId('legality-set-name')).toContainText('F8 Full Ruleset', { timeout: 10_000 })
}

/** Expand rule 8002/001 inline params (admin → editor). */
const expand8002 = async (page: Page) => {
  await page.getByTestId('legality-rule-edit-8002-001').click()
  const editorKey = 'legality-params-editor-8002-001'
  await page.getByTestId(editorKey).waitFor({ state: 'visible', timeout: 5_000 })
  return editorKey
}

test.describe('Legality Param Editor', () => {

  test('Legal-6020 — inline edit: change a cell value and confirm', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    // Click edit on row 0 (Bases = col 0, applicability, currently '*')
    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    // Row enters inline-edit mode — cell input for col 0 visible
    await expect(page.getByTestId('legality-param-cell-input-8002-001-0-0-0')).toBeVisible()
    // Change log panel appears
    await expect(page.getByTestId('param-change-log-panel')).toBeVisible()
    // Change Bases (col 0) from '*' to 'YEG'
    await page.getByTestId('legality-param-cell-input-8002-001-0-0-0').fill('YEG')
    // Confirm edit (green ✓ button)
    await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()
    // Row is back to read mode and shows 'YEG'
    await expect(page.getByTestId('legality-param-row-8002-001-0-0')).toContainText('YEG')
    // Change log shows EDIT entry
    await expect(page.getByTestId('param-change-entry-0')).toBeVisible()
    await expect(page.getByTestId('param-change-entry-0')).toContainText('EDIT')
  })

  test('Legal-6021 — format error: HH:MM column rejects non-time value, confirm disabled', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    // Edit row 0
    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    // Max Limits is col 7 — fill with bad format
    const maxLimitsCell = page.getByTestId('legality-param-cell-input-8002-001-0-0-7')
    await maxLimitsCell.clear()
    await maxLimitsCell.fill('not-a-time')
    // Confirm should be disabled (format validation fails)
    await expect(page.getByTestId('legality-param-confirm-edit-8002-001-0-0')).toBeDisabled()
    // Fix the format issue — restore original value
    await maxLimitsCell.fill('40:00')
    // Now confirm enabled
    await expect(page.getByTestId('legality-param-confirm-edit-8002-001-0-0')).toBeEnabled()
    await page.getByTestId('legality-param-cancel-edit-8002-001-0-0').click()
  })

  test('Legal-6022 — add empty row: all cells red, confirm disabled until filled', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    const tableRows = page.locator('[data-testid^="legality-param-row-8002-001-0-"]')
    const initialCount = await tableRows.count()
    // Click Add Row
    await page.getByTestId('legality-param-add-row-8002-001-0').click()
    // One new row added and immediately in edit mode
    await expect(tableRows).toHaveCount(initialCount + 1)
    const newRowIdx = initialCount
    // Confirm disabled — all cells empty = Required errors
    await expect(page.getByTestId(`legality-param-confirm-edit-8002-001-0-${newRowIdx}`)).toBeDisabled()
    // Fill all 10 columns with valid values
    const vals = ['*', '*', '*', '*', '28', 'BH', 'N', '40:00', '00:00', 'BH']
    for (let ci = 0; ci < vals.length; ci++) {
      await page.getByTestId(`legality-param-cell-input-8002-001-0-${newRowIdx}-${ci}`).fill(vals[ci])
    }
    // Confirm now enabled
    await expect(page.getByTestId(`legality-param-confirm-edit-8002-001-0-${newRowIdx}`)).toBeEnabled()
    // Cancel to avoid saving
    await page.getByTestId(`legality-param-cancel-edit-8002-001-0-${newRowIdx}`).click()
  })

  test('Legal-6023 — copy row: new row appears at bottom with same values', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    const tableRows = page.locator('[data-testid^="legality-param-row-8002-001-0-"]')
    const initialCount = await tableRows.count()
    // Copy row 0
    await page.getByTestId('legality-param-copy-8002-001-0-0').click()
    // Count increases
    await expect(tableRows).toHaveCount(initialCount + 1)
    // Change log shows COPY entry
    await expect(page.getByTestId('param-change-entry-0')).toContainText('COPY')
    // New last row has same Bases value as row 0 ('*')
    await expect(page.getByTestId(`legality-param-row-8002-001-0-${initialCount}`)).toContainText('*')
  })

  test('Legal-6024 — delete row: inline confirm → row removed', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    const tableRows = page.locator('[data-testid^="legality-param-row-8002-001-0-"]')
    const initialCount = await tableRows.count()
    // Start delete on row 1
    await page.getByTestId('legality-param-delete-8002-001-0-1').click()
    // Inline confirm buttons appear
    await expect(page.getByTestId('legality-param-delete-confirm-8002-001-0-1')).toBeVisible()
    await expect(page.getByTestId('legality-param-delete-cancel-8002-001-0-1')).toBeVisible()
    // Confirm delete
    await page.getByTestId('legality-param-delete-confirm-8002-001-0-1').click()
    // Row count decreases
    await expect(tableRows).toHaveCount(initialCount - 1)
    // Change log shows DEL
    await expect(page.getByTestId('param-change-entry-0')).toContainText('DEL')
  })

  test('Legal-6025 — delete cancel: row stays after cancelling', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    const tableRows = page.locator('[data-testid^="legality-param-row-8002-001-0-"]')
    const initialCount = await tableRows.count()
    await page.getByTestId('legality-param-delete-8002-001-0-0').click()
    await page.getByTestId('legality-param-delete-cancel-8002-001-0-0').click()
    await expect(tableRows).toHaveCount(initialCount)
  })

  test('Legal-6026 — move up/down: row order changes', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    // Capture full text content of rows 0 and 1 before the move
    const row0Before = ((await page.getByTestId('legality-param-row-8002-001-0-0').textContent()) ?? '').trim()
    const row1Before = ((await page.getByTestId('legality-param-row-8002-001-0-1').textContent()) ?? '').trim()
    expect(row0Before).not.toBe(row1Before)
    // Move row 1 UP — it should become row 0
    await page.getByTestId('legality-param-move-up-8002-001-0-1').click()
    // Change log shows MOVE
    await expect(page.getByTestId('param-change-entry-0')).toContainText('MOVE')
    // Row 0 now has row 1's old content and vice versa
    const row0After = ((await page.getByTestId('legality-param-row-8002-001-0-0').textContent()) ?? '').trim()
    const row1After = ((await page.getByTestId('legality-param-row-8002-001-0-1').textContent()) ?? '').trim()
    expect(row0After).toBe(row1Before)
    expect(row1After).toBe(row0Before)
  })

  test('Legal-6027 — undo edit: cell value reverts after undo', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    // Edit row 0 col 0 (Bases): * → YEG
    await page.getByTestId('legality-param-edit-8002-001-0-0').click()
    await page.getByTestId('legality-param-cell-input-8002-001-0-0-0').fill('YEG')
    await page.getByTestId('legality-param-confirm-edit-8002-001-0-0').click()
    await expect(page.getByTestId('legality-param-row-8002-001-0-0')).toContainText('YEG')
    // Undo
    await page.getByTestId('param-undo-btn').click()
    // Value reverts to original ('*')
    await expect(page.getByTestId('legality-param-row-8002-001-0-0')).toContainText('*')
    // Change log now shows "No changes yet" (all undone)
    await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet')
  })

  test('Legal-6028 — undo delete: row reappears after undo', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    const tableRows = page.locator('[data-testid^="legality-param-row-8002-001-0-"]')
    const initialCount = await tableRows.count()
    // Delete row 1 and confirm
    await page.getByTestId('legality-param-delete-8002-001-0-1').click()
    await page.getByTestId('legality-param-delete-confirm-8002-001-0-1').click()
    await expect(tableRows).toHaveCount(initialCount - 1)
    // Undo — row reappears
    await page.getByTestId('param-undo-btn').click()
    await expect(tableRows).toHaveCount(initialCount)
  })

  test('Legal-6029 — save all: success clears change log', async ({ page, request }) => {
    // Snapshot before — restored after regardless of test outcome
    const { token, ruleId, paramJson: originalParamJson } = await snapshotParamJson(request, 433, 8002, '001')
    try {
      await openLegalityAsAdmin(page, request)
      await expand8002(page)
      // Make a copy (non-destructive change)
      await page.getByTestId('legality-param-copy-8002-001-0-0').click()
      await expect(page.getByTestId('param-change-entry-0')).toContainText('COPY')
      // Save All
      await page.getByTestId('param-save-all-btn').click()
      // Change log clears on success
      await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet', { timeout: 8_000 })
    } finally {
      // Always restore original param_json so subsequent runs start clean
      await restoreParamJson(request, token, ruleId, originalParamJson)
    }
  })

  test('Legal-6030 — column header tooltip visible on hover (Bases col)', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await expand8002(page)
    // Hover the "Bases" column header (col 0, table 0)
    await page.getByTestId('legality-param-col-8002-001-0-0').hover()
    // Tooltip with airport base code description
    await expect(page.getByRole('tooltip')).toContainText('Airport base code', { timeout: 3_000 })
  })

  test('Legal-6031 — wide rule (8056) opens ParamRowDialog on edit click', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    // Expand 8056/001 "Roster Spacing" — 26 columns (>12 → dialog mode; Assignment A/B added)
    await page.getByTestId('legality-rule-edit-8056-001').click()
    await page.getByTestId('legality-params-editor-8056-001').waitFor({ state: 'visible', timeout: 5_000 })
    // Click edit icon on row 0 — should open ParamRowDialog (not inline)
    await page.getByTestId('legality-param-edit-8056-001-0-0').click()
    // Dialog opens
    await expect(page.getByTestId('param-row-dialog')).toBeVisible({ timeout: 3_000 })
    // Dialog contains row number label
    await expect(page.getByTestId('param-row-dialog')).toContainText('Row 1')
    // Cancel the dialog
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('param-row-dialog')).not.toBeVisible()
  })

  test('Legal-6032 — row dialog: wide full-width inputs accept pipe-delimited Assignment B (e.g. SIM|GRD|VAC)', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await page.getByTestId('legality-rule-edit-8056-001').click()
    await page.getByTestId('legality-params-editor-8056-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8056-001-0-0').click()
    const dialog = page.getByTestId('param-row-dialog')
    await expect(dialog).toBeVisible({ timeout: 3_000 })

    // All 26 columns render as cells (Assignment A/B included).
    await expect(dialog.locator('[data-testid^="param-row-dialog-cell-"]')).toHaveCount(26)

    // Assignment B = column 15. Inputs are now full-width (was a 64px w-16) so a pipe list
    // like SIM|GRD|VAC stays readable. Assert the input is materially wider than the old 64px.
    const assignB = page.getByTestId('param-row-dialog-cell-15')
    const box = await assignB.boundingBox()
    expect(box, 'Assignment B input must render').not.toBeNull()
    expect(box!.width, `full-width input should be ≫ the old 64px (got ${box!.width})`).toBeGreaterThan(150)

    // Assignment A/B are free-text → a pipe-delimited value is valid and keeps Save enabled
    // (the recheck + check-8056 split on '|'); no format error blocks it.
    await assignB.fill('SIM|GRD|VAC')
    await expect(assignB).toHaveValue('SIM|GRD|VAC')
    await expect(page.getByTestId('param-row-dialog-confirm')).toBeEnabled()

    // Discard (don't mutate the shared rule).
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Legal-6033 — rule 8071 opens the 17-column roster-property ParamRowDialog', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await page.getByTestId('legality-rule-edit-8071-001').click()
    await page.getByTestId('legality-params-editor-8071-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8071-001-0-0').click()
    const dialog = page.getByTestId('param-row-dialog')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog).toContainText('Row 1')
    await expect(dialog.locator('[data-testid^="param-row-dialog-cell-"]')).toHaveCount(17)
    await expect(page.getByTestId('param-row-dialog-cell-7')).toHaveValue('FLY')
    await expect(page.getByTestId('param-row-dialog-cell-9')).toHaveValue('*')
    await expect(page.getByTestId('param-row-dialog-cell-14')).toHaveValue('11')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Legal-6034 — rule 8072 opens the 13-column flight-qualification ParamRowDialog', async ({ page, request }) => {
    await openLegalityAsAdmin(page, request)
    await page.getByTestId('legality-rule-edit-8072-001').click()
    await page.getByTestId('legality-params-editor-8072-001').waitFor({ state: 'visible', timeout: 5_000 })
    await page.getByTestId('legality-param-edit-8072-001-0-0').click()
    const dialog = page.getByTestId('param-row-dialog')
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog).toContainText('Row 1')
    await expect(dialog.locator('[data-testid^="param-row-dialog-cell-"]')).toHaveCount(13)
    await expect(page.getByTestId('param-row-dialog-cell-1')).toHaveValue('FLY')
    await expect(page.getByTestId('param-row-dialog-cell-7')).toHaveValue('FC-GREEN')
    await expect(page.getByTestId('param-row-dialog-cell-11')).toHaveValue('0')
    await expect(page.getByTestId('param-row-dialog-cell-12')).toHaveValue('1')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

})
