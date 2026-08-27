/**
 * RES Pairing Planner — Define workspace acceptance tests.
 *
 * Live-1402: focusing YVR filters the entry matrix to YVR only
 * Live-1403: Apply fills selected days with assignment plan values
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test.describe('RES Define workspace', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await page.getByTestId('res-pairing-button').click()
    await expect(page.getByTestId('res-planner-dialog')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('res-tab-define')).toBeVisible()
  })

  test('Live-1402: focusing YVR filters the entry matrix to YVR only', async ({ page }) => {
    await page.getByTestId('res-base-YVR').click()

    // Ensure PRAM is selected so its plan panel is visible
    const pram = page.getByTestId('res-assignment-PRAM')
    if ((await pram.getAttribute('data-active')) !== 'true') await pram.click()

    await expect(page.getByTestId('res-plan-PRAM-YVR-CA')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('res-plan-PRAM-YEG-CA')).toHaveCount(0)
  })

  test('Live-1403: Apply fills selected days with assignment values', async ({ page }) => {
    await page.getByTestId('res-base-YVR').click()
    await page.getByTestId('res-mode-dow').click()

    const mondayChip = page.getByTestId('res-dow-1')
    if ((await mondayChip.getAttribute('data-active')) !== 'true') await mondayChip.click()
    await expect(mondayChip).toHaveAttribute('data-active', 'true')

    // Multi-select: keep PRAM only for a clear calendar badge
    for (const code of ['PRAM', 'PRMM', 'PRPM'] as const) {
      const chip = page.getByTestId(`res-assignment-${code}`)
      if (!(await chip.count())) continue
      const active = (await chip.getAttribute('data-active')) === 'true'
      const want = code === 'PRAM'
      if (active !== want) await chip.click()
    }

    await expect(page.getByTestId('res-plan-PRAM-YVR-CA')).toBeVisible()
    await page.getByTestId('res-plan-PRAM-YVR-CA').fill('5')
    await page.getByTestId('res-plan-PRAM-YVR-FO').fill('5')

    await page.getByTestId('res-apply').click()

    // Calendar defaults to the current month — find the first Monday cell in view.
    const firstMonday = (() => {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth()
      for (let d = 1; d <= 7; d++) {
        if (new Date(y, m, d).getDay() === 1) {
          return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        }
      }
      return null
    })()
    expect(firstMonday).not.toBeNull()
    const cell = page.getByTestId(`res-cell-${firstMonday}`)
    await expect(cell).toBeVisible({ timeout: 5_000 })
    await expect(cell).toContainText('PRAM')
  })
})
