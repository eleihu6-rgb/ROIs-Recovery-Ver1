/**
 * Mixed recovery — best-per-alert workflow.
 *
 * Acceptance for the user's request:
 *   "新增混合恢复模式：该模式下，入口为alert center,用户选择多个告警条件下，为每个
 *    告警挑选成本最小的恢复方式。右键菜单recovery，无需该混合模式，因为只有一个待恢复
 *    roster。"
 *
 * Steps:
 *   1. Login, open Live, filter to Pilot (P) division
 *   2. Wait for gantt + Legality recheck
 *   3. Open Alert Center
 *   4. Verify the new "Mixed recovery" button is DISABLED when < 2 rows selected
 *   5. Select ≥ 2 8004 recoverable rows
 *   6. Click "Mixed recovery" — RecoveryViolationDialog opens
 *   7. Verify the LEFT TREE shows the "Mixed recovery (best per alert)" leaf
 *      AND that the leaf is only present when alerts.length > 1 (single-row
 *      right-click flow must NOT show it — covered separately by the
 *      recovery-context-menu spec).
 *   8. Click the mixed leaf — PlanGroup renders a single combined option
 *      with subOptions listing per-alert decisions (different methods OK)
 *   9. Screenshot proof
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test('Mixed recovery — Alert Center picks best-per-alert combined option', async ({ page, request }) => {
  test.setTimeout(600_000)
  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })

  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 5_000 })
  await emptyState.click()
  const filterDialog = page.getByTestId('filter-dialog')
  await expect(filterDialog).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-tab-pairing').click()
  await page.getByTestId('filter-tab-flight').click()
  await page.getByTestId('filter-apply').click()
  await expect(filterDialog).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })
  await page.waitForTimeout(60_000)

  await page.getByTestId('module-nav-legality').click()
  await page.getByRole('button', { name: /recheck/i }).first().click()
  await page.waitForTimeout(60_000)

  await page.getByTestId('module-nav-live').click()

  // Open Alert Center. The toolbar bell button is the canonical entry; the
  // list-dialog data-testid confirms it opened.
  await page.getByTestId('violations-button').first().click()
  const alertDialog = page.getByTestId('violation-list-dialog')
  await expect(alertDialog).toBeVisible({ timeout: 15_000 })

  // Mixed button must be present but disabled with 0 rows selected.
  const mixedBtn = alertDialog.getByTestId('alert-recovery-mixed')
  await expect(mixedBtn).toBeVisible()
  await expect(mixedBtn).toBeDisabled()

  // Select all recoverable 8004 rows that the Alert Center shows. We use the
  // built-in "select all visible" header checkbox rather than picking rows
  // one by one — this guarantees ≥ 2 (otherwise the test was meaningless).
  const selectAll = alertDialog.getByTestId('alert-recovery-select-all')
  await expect(selectAll).toBeEnabled({ timeout: 10_000 })
  await selectAll.check()
  // Sanity: count selected rows so we can assert ≥ 2 below.
  const selectedCount = await alertDialog
    .locator('[data-testid^="alert-recovery-checkbox-"]:checked')
    .count()
  expect(selectedCount, 'Alert Center must have at least 2 recoverable rows for mixed mode').toBeGreaterThanOrEqual(2)

  // Screenshot the Alert Center header so the user can see the new "Mixed
  // recovery" button right next to "Recovery selected".
  await page.screenshot({
    path: 'output/mixed-recovery/alert-center-mixed-button.png',
    fullPage: false,
  })

  // Mixed button now must be enabled.
  await expect(mixedBtn).toBeEnabled()
  await mixedBtn.click({ force: true })

  // RecoveryViolationDialog opens.
  const recoveryDialog = page.getByTestId('recovery-violation-dialog')
  await expect(recoveryDialog).toBeVisible({ timeout: 30_000 })
  await expect(recoveryDialog.getByText('Generating recovery options...')).toHaveCount(0, { timeout: 180_000 })

  // The left tree must surface the mixed leaf with testid
  // recovery-plan-filter-mixed.
  const mixedLeaf = recoveryDialog.getByTestId('recovery-plan-filter-mixed')
  await expect(mixedLeaf).toBeVisible({ timeout: 5_000 })
  await mixedLeaf.click({ force: true })

  // PlanGroup renders a single combined option card with subOptions
  // listing per-alert decisions (different recovery methods per alert).
  const mixedGroup = recoveryDialog.getByTestId('recovery-options-mixed')
  await expect(mixedGroup).toBeVisible({ timeout: 10_000 })
  // Combined option id starts with `mixed-`; subOptions container is
  // `recovery-suboptions-{option.id}`.
  await expect(
    mixedGroup.locator('[data-testid^="recovery-suboptions-"]').first(),
  ).toBeVisible({ timeout: 10_000 })

  // The mixed group must have a non-trivial height (≥ 100px) so users can
  // see the per-alert sub-options.
  const box = await mixedGroup.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.height).toBeGreaterThan(100)

  // Screenshot proof — file lands in e2e/output/mixed-recovery/ regardless
  // of where Playwright was invoked from.
  await page.screenshot({
    path: 'output/mixed-recovery/mixed-plan-group.png',
    fullPage: false,
  })
})
