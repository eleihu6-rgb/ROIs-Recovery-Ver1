/**
 * Rule Manager — CALC rules are now editable (regression).
 *
 * Bug: rule rows whose checkType === 'CALC' (e.g. "Local Night Definition – F8",
 * instanceCode local_night_f8_p) were NON-editable — the Config cell showed a
 * dash "—", the Edit button was hidden, and the row was greyed (opacity-60).
 * But these CALC rules carry real, user-tunable parameters
 * (local_night_start 22:00 / local_night_end 08:00 / min_interval_hours 8).
 *
 * Fix (rule-group-row.tsx + override-editor.tsx):
 *   - CALC rows show a `params` link in Config (not "—") and an Edit/Close button.
 *   - The OverrideEditor for a CALC rule shows ONLY the Parameters section,
 *     hiding "Filter Conditions", "Alert Message Template", and "Reset conditions".
 *
 * Regression intent (§No-Illusion): this asserts CONCRETE row + editor content,
 * not mere visibility. Against the OLD behaviour it FAILS because:
 *   - the Edit button was not rendered for CALC rows, and
 *   - the Config cell was the literal "—".
 * Against the fixed behaviour it PASSES.
 *
 * Data: the Local Night CALC rule lives in the "Flair Gantt Rule" set
 * (groupCode flair_gantt_rule), NOT the auto-selected first set, so the test
 * selects that set first.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const RULE_CODE = 'local_night_f8_p'
const RULE_NAME = 'Local Night Definition'   // partial — avoids the en-dash + "F8" suffix
const SCALAR_PARAMS = ['local_night_start', 'local_night_end', 'min_interval_hours'] as const

test.describe('Rule Manager — CALC rules editable', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-rule').click()
    await page.getByRole('button', { name: 'Rule Manager' }).click()
    // Rule Manager ready once at least one rule row's category badge is present.
    await expect(page.getByTestId('rule-cat-badge').first()).toBeVisible({ timeout: 15_000 })

    // The Local Night CALC rule is only in the "Flair Gantt Rule" set; select it.
    await page.getByRole('button', { name: /Flair Gantt Rule/ }).click()
    // Narrow the table to the target rule for unambiguous, stable assertions.
    await page.getByPlaceholder('Search rules…').fill('local night')
    await expect(page.getByText(RULE_CODE).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Live-1226 — CALC rule (Local Night) is editable: Config not a dash, Edit opens params-only editor', async ({ page }) => {
    // The rule row: a <tr> whose mono cell shows the instanceCode.
    const row = page.locator('tr', { hasText: RULE_CODE }).first()
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(RULE_NAME)

    // ── Config cell is NO LONGER the "—" placeholder ────────────────
    // (the fix replaced the dash with a clickable `params` link).
    await expect(row.getByRole('button', { name: 'params' })).toBeVisible()
    await expect(row).not.toContainText('—')

    // ── Edit button is now present for the CALC row (was hidden) ─────
    const editBtn = row.getByRole('button', { name: 'Edit', exact: true })
    await expect(editBtn).toBeVisible()

    // ── Open the editor ─────────────────────────────────────────────
    await editBtn.click()
    // Button flips to Close once expanded — proves the row toggled open.
    await expect(row.getByRole('button', { name: 'Close', exact: true })).toBeVisible()

    // The OverrideEditor heading identifies the rule under configuration.
    const editor = page.getByText(/^Configure rule — Local Night Definition/)
    await expect(editor).toBeVisible()

    // ── Parameters section present with all three scalar fields ─────
    // The param <label> renders the key text node followed by a nested
    // description span, so match the key as a substring (not exact).
    await expect(page.getByText('Parameters', { exact: true })).toBeVisible()
    for (const key of SCALAR_PARAMS) {
      await expect(page.getByText(key).first()).toBeVisible()
    }
    // The current values are surfaced ("Current: 22:00" etc.).
    await expect(page.getByText('Current: 22:00')).toBeVisible()
    await expect(page.getByText('Current: 08:00')).toBeVisible()

    // ── CHECK-only sections are HIDDEN for a CALC rule ──────────────
    await expect(page.getByText('Filter Conditions')).toHaveCount(0)
    await expect(page.getByText('Alert Message Template')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Reset conditions/ })).toHaveCount(0)
  })
})
