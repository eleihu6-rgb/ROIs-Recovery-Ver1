import { expect, test } from '@playwright/test'

import { seedGanttAuth } from '../../utils/gantt-hook'

const JULY_BID_REPORT = process.env.NPBS_BID_REPORT
  ?? new URL('../../fixtures/npbs/default-and-current-crew-19.txt', import.meta.url).pathname

test('PBS import dry run separates Current and Default Standing targets through the real admin UI', async ({ page, request }) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('nav-pbs').click()
  await page.getByTestId('pbs-nav-admin-tools').click()

  const adminTools = page.getByTestId('pbs-admin-tools')
  await expect(adminTools).toBeVisible({ timeout: 10_000 })
  await expect(adminTools).toContainText(
    'Current Bid → Current month · Default Bid → Standing Bid.',
  )

  await page.getByTestId('pbs-import-base').fill('')
  await page.getByTestId('pbs-import-crew-ids').fill('19')
  await page.getByTestId('pbs-import-file').setInputFiles(JULY_BID_REPORT)
  await expect(page.getByTestId('pbs-import-period')).toContainText('Jul 2026')

  const dryRunResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST'
      && response.url().includes('/api/admin/crew-bid-imports/dry-run'),
  )
  await page.getByTestId('pbs-import-dry-run').click()
  const dryRunResponse = await dryRunResponsePromise

  expect(dryRunResponse.status()).toBe(200)
  const body = await dryRunResponse.json() as {
    data: {
      summary: { selectedCrew: number }
      items: Array<{
        bidContext: 'Current' | 'Default'
        targetBidContext: 'Current' | 'StandingLineholder' | 'StandingReserve'
      }>
    }
  }
  expect(body.data.summary.selectedCrew).toBe(1)
  expect(body.data.items.map((item) => `${item.bidContext} → ${item.targetBidContext}`)).toEqual([
    'Current → Current',
    'Default → StandingLineholder',
    'Default → StandingReserve',
  ])

  const result = page.getByTestId('pbs-import-result')
  await expect(result).toBeVisible({ timeout: 60_000 })
  await expect(result).toContainText('Selected Crew')
  await expect(result).toContainText('1')
  await expect(page.getByTestId('pbs-import-failures')).toContainText('Source → Target')
  await expect(page.getByTestId('pbs-import-failures')).toContainText('Default → StandingReserve')
})
