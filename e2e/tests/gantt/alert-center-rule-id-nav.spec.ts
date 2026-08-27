/**
 * Alert Center Rule ID → Legality Rule Templates focus.
 *
 * Clicking e.g. 8030/001 closes Alert Center, switches to Legality → Rule Templates,
 * fills search, and expands the matching template row.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Live-1415 — Alert Center Rule ID opens Rule Templates instance', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await gotoGantt(page)

  await expect
    .poll(
      () => page.evaluate(() => {
        const t = (window as unknown as { __ganttTest?: { liveViolations?: () => unknown[] } }).__ganttTest
        return (t?.liveViolations?.() ?? []).length
      }),
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0)

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  // Prefer a known template id when present; otherwise first Rule ID link.
  const preferred = dialog.getByTestId('alert-rule-id-8030/001')
  const ruleBtn = (await preferred.count()) > 0
    ? preferred.first()
    : dialog.locator('[data-testid^="alert-rule-id-"]').first()
  await expect(ruleBtn).toBeVisible({ timeout: 15_000 })
  const ruleId = ((await ruleBtn.getAttribute('data-testid')) ?? '').replace('alert-rule-id-', '')
  expect(ruleId.length).toBeGreaterThan(0)

  await ruleBtn.click()
  await expect(dialog).toHaveCount(0)

  const templates = page.getByTestId('rule-instances-view')
  await expect(templates).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('rule-instances-search')).toHaveValue(ruleId)

  const [fn, inst = ''] = ruleId.split('/')
  const rowKey = `${fn}-${inst}`
  const row = page.getByTestId(`rule-instance-row-${rowKey}`)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(`rule-instance-params-${rowKey}`)).toBeVisible({ timeout: 10_000 })
})
