import { test, expect } from '@playwright/test'
import { gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Live roster bulk delete filters', () => {
  test('Live-1320 — CrewId and Source filters are sent to candidate refresh', async ({ page, request }) => {
    await seedGanttAuth(page, request)

    const candidateUrls: string[] = []
    await page.route('**/api/roster/bulk-delete/candidates**', async (route) => {
      candidateUrls.push(route.request().url())
      await route.fulfill({
        json: {
          code: 0,
          message: 'ok',
          data: {
            groups: [],
            rows: [],
          },
        },
      })
    })

    await gotoGantt(page)
    await page.getByTestId('roster-bulk-delete-button').click()
    await expect(page.getByTestId('roster-bulk-delete-dialog')).toBeVisible()

    await page.locator('[data-testid="roster-bulk-delete-crew-id"] input').fill('C001')
    await page.keyboard.press('Enter')
    await page.getByTestId('roster-bulk-delete-source-trigger').click()
    await page.getByTestId('roster-bulk-delete-source-opt-MA').click()

    const beforeRefreshCount = candidateUrls.length
    await page.getByRole('button', { name: /refresh/i }).click()
    await expect.poll(() => candidateUrls.length).toBeGreaterThan(beforeRefreshCount)

    const refreshed = new URL(candidateUrls[candidateUrls.length - 1])
    expect(refreshed.searchParams.get('crewIds')).toBe('C001')
    expect(refreshed.searchParams.get('sources')).toBe('MA')
  })
})
