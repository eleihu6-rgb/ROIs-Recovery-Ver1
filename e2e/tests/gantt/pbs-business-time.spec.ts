import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

interface BusinessTimeStatus {
  mode: string
  source: 'system' | 'override'
  realNow: string
  businessNow: string
  anchor: string | null
  anchorReal: string | null
  warnings: string[]
}

const seedSession = async (page: Page, isAdmin: number, pbsItem = 'period'): Promise<void> => {
  await page.route('**/altair/live/api/**', async (route) => {
    await route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })
  await page.route('**/altair/live/api/auth/me', async (route) => {
    await route.fulfill({
      json: { code: 200, data: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin }, message: 'ok' },
    })
  })
  await page.route('**/altair/live/api/pbs/period-admin?*', async (route) => {
    await route.fulfill({ json: { code: 200, data: { rows: [], total: 0 }, message: 'ok' } })
  })
  await page.addInitScript(({ admin, item }) => {
    sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: admin },
      token: 'pbs-business-time-test-token',
    }))
    localStorage.setItem('rois-shell-module', 'pbs')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['pbs']))
    localStorage.setItem('rois-shell-pbs-item', item)
  }, { admin: isAdmin, item: pbsItem })
}

test.describe('PBS Business Time admin page', () => {
  test('admin sets and clears Business Time on the dedicated page', async ({ page }) => {
    await seedSession(page, 1)
    let savedPayload: unknown = null
    let status: BusinessTimeStatus = {
      mode: 'ROLLING',
      source: 'system',
      realNow: '2026-08-04T07:00:00.000Z',
      businessNow: '2026-08-04T07:00:00.000Z',
      anchor: null,
      anchorReal: null,
      warnings: [],
    }
    await page.route('**/altair/live/api/admin/pbs-business-time?*', async (route) => {
      await route.fulfill({ json: { code: 200, data: status, message: 'ok' } })
    })
    await page.route('**/altair/live/api/admin/pbs-business-time', async (route) => {
      savedPayload = route.request().postDataJSON()
      const payload = savedPayload as { action: 'SET' | 'CLEAR'; businessTimeLocal?: string }
      status = payload.action === 'SET'
        ? {
            mode: 'ROLLING',
            source: 'override',
            realNow: '2026-08-04T07:00:00.000Z',
            businessNow: '2026-07-03T00:00:00.000Z',
            anchor: '2026-07-03T00:00:00.000Z',
            anchorReal: '2026-08-04T07:00:00.000Z',
            warnings: [],
          }
        : {
            mode: 'ROLLING',
            source: 'system',
            realNow: '2026-08-04T07:00:00.000Z',
            businessNow: '2026-08-04T07:00:00.000Z',
            anchor: null,
            anchorReal: null,
            warnings: [],
          }
      await route.fulfill({ json: { code: 200, data: status, message: 'ok' } })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await expect(page.getByTestId('pbs-period-view')).toBeVisible()
    await expect(page.getByTestId('pbs-business-time-card')).toHaveCount(0)

    await page.getByTestId('pbs-nav-business-time').click()
    const view = page.getByTestId('pbs-business-time-view')
    await expect(view).toBeVisible()
    await expect(view).toContainText('Asia/Shanghai, UTC+8')
    await expect(view).toContainText('Rolling mode keeps the selected PBS Business Time moving forward')
    await expect(view.getByText('SYSTEM TIME', { exact: true })).toBeVisible()

    await page.getByTestId('pbs-business-time-save').click()
    await expect(page.getByText('Business Time is required.', { exact: true })).toBeVisible()

    await page.getByTestId('pbs-business-time-input').fill('2026-07-03T08:00')
    await page.getByTestId('pbs-business-time-save').click()
    await expect.poll(() => savedPayload).toEqual({ action: 'SET', businessTimeLocal: '2026-07-03T08:00' })
    await expect(view.getByText('OVERRIDE', { exact: true })).toBeVisible()
    await expect(view).toContainText('2026/07/03 08:00:00')

    await page.getByTestId('pbs-business-time-clear').click()
    await expect.poll(() => savedPayload).toEqual({ action: 'CLEAR' })
    await expect(view.getByText('SYSTEM TIME', { exact: true })).toBeVisible()
  })

  test('non-admin cannot see or restore the Business Time page', async ({ page }) => {
    await seedSession(page, 0, 'business-time')

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await expect(page.getByTestId('pbs-nav-business-time')).toHaveCount(0)
    await expect(page.getByTestId('pbs-business-time-view')).toHaveCount(0)
    await expect(page.getByTestId('pbs-period-view')).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rois-shell-pbs-item'))).toBe('period')
  })

  test('load failure stays visible and can be retried', async ({ page }) => {
    await seedSession(page, 1, 'business-time')
    let requestCount = 0
    await page.route('**/altair/live/api/admin/pbs-business-time?*', async (route) => {
      requestCount += 1
      if (requestCount === 1) {
        await route.fulfill({
          status: 500,
          json: { code: 500, data: null, message: 'Internal failure details' },
        })
        return
      }
      await route.fulfill({
        json: {
          code: 200,
          data: {
            mode: 'ROLLING',
            source: 'system',
            realNow: '2026-08-04T07:00:00.000Z',
            businessNow: '2026-08-04T07:00:00.000Z',
            anchor: null,
            anchorReal: null,
            warnings: [],
          },
          message: 'ok',
        },
      })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    const error = page.getByRole('alert', { name: 'Business Time loading error' })
    await expect(error).toContainText('PBS Business Time could not be loaded')
    await expect(error).not.toContainText('Internal failure details')
    await page.getByTestId('pbs-business-time-retry').click()
    await expect(error).toHaveCount(0)
    await expect(page.getByText('SYSTEM TIME', { exact: true })).toBeVisible()
  })
})
