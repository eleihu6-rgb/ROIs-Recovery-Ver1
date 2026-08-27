/**
 * RuleConfirmDialog — title-bar drag so the Rule Violation Detected / warning
 * window can be moved off the Gantt underlay.
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

test('Live-rule-confirm — Rule Violation Detected dialog moves when title bar is dragged', async ({ page }) => {
  const login = new GanttLoginPage(page)
  await login.goto()
  await login.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)
  await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('module-nav-live').click()
  // RuleConfirmDialog is mounted on AppShell (shared Live + Scenario).
  await expect(page.getByTestId('module-nav-live')).toBeVisible()

  await page.evaluate(async () => {
    const mod = await import('/altair/src/stores/rule-check-store.ts')
    void mod.useRuleCheckStore.getState().showConfirmDialog(
      [
        {
          ruleCode: '8002',
          ruleName: '8002/001',
          message: 'Cumulative block exceeds limit (e2e fixture).',
          severity: 3,
          canOverride: false,
          isNew: true,
          crewId: 'e2e',
          targetId: 'e2e',
          targetType: 'crew',
        },
      ],
      true,
    )
  })

  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog).toContainText('Rule Violation Detected')
  await expect(dialog).not.toContainText('This operation violates mandatory rules')
  await expect(dialog).toContainText('Cumulative block exceeds limit')

  const before = await dialog.boundingBox()
  expect(before).toBeTruthy()

  const handle = dialog.locator('[data-app-dialog-header]')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const sx = box!.x + box!.width / 2
  const sy = box!.y + box!.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 120, sy + 80, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => {
    const after = await dialog.boundingBox()
    return after ? Math.round(after.x - before!.x) : 0
  }).toBeGreaterThanOrEqual(100)
  const after = await dialog.boundingBox()
  expect(after).toBeTruthy()
  expect(Math.round(after!.y - before!.y)).toBeGreaterThanOrEqual(60)
})

test('Live-rule-confirm — Soft severity shows Soft summary badge and row label', async ({ page }) => {
  const login = new GanttLoginPage(page)
  await login.goto()
  await login.login(TEST_ACCOUNTS.admin.userCode, TEST_ACCOUNTS.admin.password)
  await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('module-nav-live').click()

  await page.evaluate(async () => {
    const mod = await import('/altair/src/stores/rule-check-store.ts')
    void mod.useRuleCheckStore.getState().showConfirmDialog(
      [
        {
          ruleCode: '7504',
          ruleName: '7504/001',
          message: 'Min rest soft advisory (e2e fixture).',
          severity: 1,
          canOverride: true,
          isNew: true,
          crewId: 'e2e',
          targetId: 'e2e',
          targetType: 'crew',
        },
      ],
      false,
    )
  })

  const dialog = page.getByTestId('rule-confirm-dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog).toContainText('1 Soft')
  await expect(dialog).toContainText('Soft')
  await expect(dialog).toContainText('Min rest soft advisory')
  await expect(dialog).not.toContainText('Overridable')
})
