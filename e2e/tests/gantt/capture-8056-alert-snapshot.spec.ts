import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { gotoGantt, seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../../../image/RUST/8056')
const DATE_TIME_14H_RE =
  /Rest between \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) and \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) is -?\d+:\d{2}, which is below the required 14 RH\./

test('capture 8056 alert-center snapshot', async ({ page, request }) => {
  test.setTimeout(180_000)

  await fs.mkdir(OUT_DIR, { recursive: true })

  await seedGanttAuth(page, request)
  await gotoGantt(page)

  await setDateRange(page, '2026-06-01', '2026-07-01')

  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await dialog.getByTestId('alert-groupby-rule').click()

  const row = dialog.locator('[data-testid="violation-list-row"][data-rule-id="8056/001"]').first()
  await expect.poll(() => row.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
  await expect(row).toContainText(DATE_TIME_14H_RE)
  const rowText = (await row.textContent())?.trim() ?? ''

  await row.click()
  await page.waitForTimeout(1_000)

  await dialog.screenshot({ path: path.join(OUT_DIR, '8056-alert-center-rule-8056-dialog.png') })
  await row.screenshot({ path: path.join(OUT_DIR, '8056-alert-center-rule-8056-row.png') })
  await fs.writeFile(path.join(OUT_DIR, '8056-alert-center-rule-8056-proof.txt'), `${rowText}\n`)
})
