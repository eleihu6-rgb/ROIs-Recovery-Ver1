/**
 * Scen — RuleConfirmDialog must be visible on Scenario without Live AppLayout.
 *
 * Regression for shell hoist: dialog lived only under Live AppLayout. Scenario
 * never mounts AppLayout; inactive Live keep-alive is invisible. Assign legality
 * confirm then hung or showed nothing.
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

test('Scenario — Rule Violation dialog visible without opening Live', async ({ page }) => {
  const login = new GanttLoginPage(page)
  await login.goto()
  await login.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)
  await expect(page.getByTestId('module-nav-scenario')).toBeVisible({ timeout: 15_000 })
  // Do NOT open Live — AppLayout must stay unmounted for this regression.
  await page.getByTestId('module-nav-scenario').click()
  await expect(page.getByTestId('module-nav-scenario')).toBeVisible()

  await page.evaluate(async () => {
    const mod = await import('/altair/src/stores/rule-check-store.ts')
    void mod.useRuleCheckStore.getState().showConfirmDialog(
      [
        {
          ruleCode: '1001',
          ruleName: '1001/001',
          message: 'Assignment overlap (scenario e2e fixture).',
          severity: 2,
          canOverride: true,
          isNew: true,
          crewId: '1808',
          targetId: '15354',
          targetType: 'pairing',
        },
      ],
      false,
    )
  })

  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog).toContainText('Assignment overlap (scenario e2e fixture).')
  await expect(dialog).toContainText('1001')
  await expect(page.getByTestId('rule-confirm-proceed')).toBeVisible()

  // Use the standard AppDialog close control; an open Scenario dropdown may consume
  // the first Escape before the dialog receives it.
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden({ timeout: 5_000 })
})
