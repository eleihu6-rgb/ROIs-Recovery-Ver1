import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

const definitionData = {
  rows: [
    {
      code: 'redeye',
      name: 'Redeye',
      displayValue: '03:30–05:30 local time',
      description: 'Local operating window used to identify Redeye legs.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: { available: true, startTime: '03:30', endTime: '05:30', crossesMidnight: false, version: '03:30|05:30' },
    },
    {
      code: 'weekend',
      name: 'Weekend',
      displayValue: 'Saturday 00:00 – Sunday 24:00',
      description: 'Recurring local interval used by Weekend preferences.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: {
        available: true,
        startDayCode: 'SAT',
        startDayName: 'Saturday',
        startTime: '00:00',
        endDayCode: 'SUN',
        endDayName: 'Sunday',
        endTime: '24:00',
        durationMinutes: 2880,
        version: 'SAT|00:00|SUN|24:00',
      },
    },
    {
      code: 'credit-window',
      name: 'Credit Window',
      displayValue: '±5 hours from period credit target',
      description: 'Hours added to or subtracted from the period credit target.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: { available: true, deltaHours: 5, version: '5' },
    },
    {
      code: 'minimum-base-layover',
      name: 'Minimum Base Layover',
      displayValue: '13:00 minimum',
      description: 'Minimum home-base spacing allowed for Line bids.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: { available: true, minDuration: '013:00' },
    },
    {
      code: 'efficient-flying-percentile',
      name: 'Efficient Flying Percentile',
      displayValue: '20%',
      description: 'Top and bottom average-daily-credit cohort used by Efficient Flying bids.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: { available: true, percentile: 20 },
    },
    {
      code: 'minimum-time-between-flights',
      name: 'Minimum Time Between Flights',
      displayValue: '00:45 minimum',
      description: 'Minimum spacing allowed between flights in Time Between Flights bids.',
      updatedBy: 'admin',
      updatedAt: '2026-08-03T00:00:00.000Z',
      value: { available: true, minimumMinutes: 45 },
    },
  ],
  weekdays: [
    { code: 'MON', name: 'Monday', isoDay: 1 },
    { code: 'TUE', name: 'Tuesday', isoDay: 2 },
    { code: 'WED', name: 'Wednesday', isoDay: 3 },
    { code: 'THU', name: 'Thursday', isoDay: 4 },
    { code: 'FRI', name: 'Friday', isoDay: 5 },
    { code: 'SAT', name: 'Saturday', isoDay: 6 },
    { code: 'SUN', name: 'Sunday', isoDay: 7 },
  ],
}

const seedSession = async (page: Page, isAdmin: number) => {
  await page.route('**/altair/live/api/**', async (route) => {
    await route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
  })
  await page.route('**/altair/live/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        data: { user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin } },
        message: 'ok',
      },
    })
  })
  await page.route('**/altair/live/api/pbs/bid-definitions?*', async (route) => {
    await route.fulfill({ json: { code: 200, data: definitionData, message: 'ok' } })
  })
  await page.addInitScript((admin) => {
    sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: admin },
      token: 'pbs-bid-definitions-test-token',
    }))
    localStorage.setItem('rois-shell-module', 'pbs')
    localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['pbs']))
    localStorage.setItem('rois-shell-pbs-item', 'period')
  }, isAdmin)
}

test.describe('PBS Bid Definitions management', () => {
  test('admin sees the ordered menu and edits the dynamic Redeye definition', async ({ page }) => {
    await seedSession(page, 1)
    let savedPayload: unknown = null
    await page.route('**/altair/live/api/pbs/bid-definitions/redeye', async (route) => {
      savedPayload = route.request().postDataJSON()
      definitionData.rows[0] = {
        ...definitionData.rows[0],
        displayValue: '23:00–05:00 local time · Crosses midnight',
        value: { available: true, startTime: '23:00', endTime: '05:00', crossesMidnight: true, version: '23:00|05:00' },
      }
      await route.fulfill({ json: { code: 200, data: definitionData.rows[0], message: 'ok' } })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()

    const menuItems = page.locator('[data-testid^="pbs-nav-"]')
    const menuLabels = await menuItems.allTextContents()
    expect(menuLabels.map((label) => label.trim())).toEqual([
      'Period',
      'Bid Definitions',
      'Business Time',
      'Admin Tools',
      'Simulated Crew Portal',
    ])
    await expect(menuItems).toHaveCount(5)
    for (let index = 0; index < 5; index += 1) {
      await expect(menuItems.nth(index)).toHaveCSS('text-align', 'left')
    }

    await page.getByTestId('pbs-nav-bid-definitions').click()
    await expect(page.getByTestId('pbs-bid-definitions-view')).toBeVisible()
    await expect(page.getByTestId('pbs-definition-row-redeye')).toContainText('03:30–05:30 local time')

    await page.getByTestId('pbs-definition-edit-redeye').click()
    await page.getByTestId('pbs-definition-startTime').fill('23:00')
    await page.getByTestId('pbs-definition-endTime').fill('05:00')
    await page.getByTestId('pbs-bid-definition-save').click()

    await expect.poll(() => savedPayload).toEqual({ startTime: '23:00', endTime: '05:00' })
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toHaveCount(0)
    await expect(page.getByTestId('pbs-definition-row-redeye')).toContainText('23:00–05:00 local time')
  })

  test('non-admin does not see Bid Definitions', async ({ page }) => {
    await seedSession(page, 0)
    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()

    await expect(page.getByTestId('pbs-nav-period')).toBeVisible()
    await expect(page.getByTestId('pbs-nav-bid-definitions')).toHaveCount(0)
    await expect(page.getByTestId('pbs-nav-business-time')).toHaveCount(0)
    await expect(page.getByTestId('pbs-nav-admin-tools')).toBeVisible()
  })

  test('admin validates and saves the Minimum Base Layover definition', async ({ page }) => {
    await seedSession(page, 1)
    let savedPayload: unknown = null
    await page.route('**/altair/live/api/pbs/bid-definitions/minimum-base-layover', async (route) => {
      savedPayload = route.request().postDataJSON()
      definitionData.rows[3] = {
        ...definitionData.rows[3],
        displayValue: '14:00 minimum',
        value: { available: true, minDuration: '014:00' },
      }
      await route.fulfill({ json: { code: 200, data: definitionData.rows[3], message: 'ok' } })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await page.getByTestId('pbs-nav-bid-definitions').click()
    await page.getByTestId('pbs-definition-edit-minimum-base-layover').click()

    const duration = page.getByTestId('pbs-definition-minimum-duration')
    await duration.fill('0:00')
    await page.getByTestId('pbs-bid-definition-save').click()
    await expect(duration).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Enter a positive duration in HH:MM format.')
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toBeVisible()

    await duration.fill('14:00')
    await page.getByTestId('pbs-bid-definition-save').click()

    await expect.poll(() => savedPayload).toEqual({ minDuration: '14:00' })
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toHaveCount(0)
    await expect(page.getByTestId('pbs-definition-row-minimum-base-layover')).toContainText('14:00 minimum')
  })

  test('admin validates and saves the Efficient Flying Percentile definition', async ({ page }) => {
    await seedSession(page, 1)
    let savedPayload: unknown = null
    let rejectNextSave = true
    await page.route('**/altair/live/api/pbs/bid-definitions/efficient-flying-percentile', async (route) => {
      savedPayload = route.request().postDataJSON()
      if (rejectNextSave) {
        rejectNextSave = false
        await route.fulfill({
          status: 400,
          json: { code: 400, data: null, message: 'Invalid Efficient Flying Percentile definition' },
        })
        return
      }
      definitionData.rows[4] = {
        ...definitionData.rows[4],
        displayValue: '15%',
        value: { available: true, percentile: 15 },
      }
      await route.fulfill({ json: { code: 200, data: definitionData.rows[4], message: 'ok' } })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await page.getByTestId('pbs-nav-bid-definitions').click()
    await expect(page.getByTestId('pbs-definition-row-efficient-flying-percentile')).toContainText('20%')
    await page.getByTestId('pbs-definition-edit-efficient-flying-percentile').click()

    const percentile = page.getByTestId('pbs-definition-efficient-flying-percentile')
    await percentile.fill('51')
    await page.getByTestId('pbs-bid-definition-save').click()
    await expect(percentile).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Enter a whole number from 1 to 50.')
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toBeVisible()

    await percentile.fill('15')
    await page.getByTestId('pbs-bid-definition-save').click()
    await expect(percentile).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Enter a whole number from 1 to 50.')
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toBeVisible()

    await page.getByTestId('pbs-bid-definition-save').click()

    await expect.poll(() => savedPayload).toEqual({ percentile: 15 })
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toHaveCount(0)
    await expect(page.getByTestId('pbs-definition-row-efficient-flying-percentile')).toContainText('15%')
  })

  test('admin validates and saves the Minimum Time Between Flights definition', async ({ page }) => {
    await seedSession(page, 1)
    let savedPayload: unknown = null
    await page.route('**/altair/live/api/pbs/bid-definitions/minimum-time-between-flights', async (route) => {
      savedPayload = route.request().postDataJSON()
      definitionData.rows[5] = {
        ...definitionData.rows[5],
        displayValue: '01:15 minimum',
        value: { available: true, minimumMinutes: 75 },
      }
      await route.fulfill({ json: { code: 200, data: definitionData.rows[5], message: 'ok' } })
    })

    await page.goto(`${BASE}/altair/`)
    await page.getByTestId('nav-pbs').click()
    await page.getByTestId('pbs-nav-bid-definitions').click()
    await expect(page.getByTestId('pbs-definition-row-minimum-time-between-flights')).toContainText('00:45 minimum')
    await page.getByTestId('pbs-definition-edit-minimum-time-between-flights').click()

    const duration = page.getByTestId('pbs-definition-minimum-time-between-flights')
    await duration.fill('00:00')
    await page.getByTestId('pbs-bid-definition-save').click()
    await expect(duration).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Enter a positive duration from 00:01 to 999:59.')

    await duration.fill('01:15')
    await page.getByTestId('pbs-bid-definition-save').click()

    await expect.poll(() => savedPayload).toEqual({ minimumMinutes: 75 })
    await expect(page.getByTestId('pbs-bid-definition-dialog')).toHaveCount(0)
    await expect(page.getByTestId('pbs-definition-row-minimum-time-between-flights')).toContainText('01:15 minimum')
  })
})
