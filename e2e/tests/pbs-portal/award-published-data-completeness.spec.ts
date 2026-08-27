import { expect, test, type Page } from '@playwright/test'

const mockAuthenticatedAwardPage = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pbs-portal.auth.token', 'award-completeness-token')
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          user: {
            id: '19',
            name: 'Award Completeness Tester',
            employeeNo: '19',
          },
          authMode: 'password',
        },
        message: 'OK',
      },
    })
  })

  await page.route('**/api/award/current', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          periodCode: 'Jun 2026',
          published: true,
          availability: 'AVAILABLE',
          rpStart: '2026-06-01T00:00:00.000Z',
          rpEnd: '2026-06-30T00:00:00.000Z',
          awardPublishAt: '2026-05-20T00:00:00.000Z',
          firstPublishedAt: '2026-05-20T00:05:00.000Z',
          latestPublishedAt: '2026-05-20T00:05:00.000Z',
          timeZone: {
            base: 'YYZ',
            zoneId: 'America/Toronto',
            timezoneLabel: 'YYZ Local Time',
            fallback: false,
          },
          summary: {
            tier: null,
            offDays: 20,
            creditMinutes: 4629,
            premiumMinutes: null,
            pairingCount: 8,
            activityCount: 2,
            warnings: [],
          },
          calendar: {
            monthLabel: 'JUN 2026',
            weekdayLabels: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
            events: [{
              id: 'pairing-10924',
              type: 'pairing',
              label: 'T4528',
              startDate: '2026-06-04',
              endDate: '2026-06-04',
              startTime: '1403',
              endTime: '2249',
              tone: 'blue',
              readonly: true,
            }],
          },
          items: [{
            id: 'pairing-10924',
            type: 'pairing',
            label: 'T4528',
            pairingId: '10924',
            pairingCode: 'T4528',
            assignment: 'FLY',
            assignmentGroup: 'FLY',
            startDate: '2026-06-04',
            endDate: '2026-06-04',
            startTime: '1403',
            endTime: '2249',
            base: 'YYZ',
            fleet: '737',
            position: 'IFD',
            matchedTier: null,
            awardPriority: null,
            explanation: 'Matched your Tier 3 pairing preferences.',
            creditMinutes: 485,
            creditMissingReason: null,
            blockMinutes: 469,
            tafbDays: 1,
            legEquipmentMissingReason: null,
            legs: [
              {
                id: '10924-1',
                dutySeq: 1,
                segmentSeq: 1,
                day: '04',
                flightNumber: 'F8633',
                deadhead: false,
                depAirport: 'YYZ',
                arrAirport: 'YEG',
                depTime: '1403',
                arrTime: '1804',
                blockMinutes: 241,
                creditMinutes: 485,
                equipment: '7M8',
                equipmentMissing: false,
              },
              {
                id: '10924-2',
                dutySeq: 1,
                segmentSeq: 2,
                day: '04',
                flightNumber: 'F8632',
                deadhead: false,
                depAirport: 'YEG',
                arrAirport: 'YYZ',
                depTime: '1901',
                arrTime: '2249',
                blockMinutes: 228,
                creditMinutes: 485,
                equipment: '7M8',
                equipmentMissing: false,
              },
            ],
          }, {
            id: 'day-off-2026-06-05',
            type: 'day_off',
            label: 'Day Off',
            pairingId: null,
            pairingCode: null,
            assignment: 'DO',
            assignmentGroup: 'DO',
            startDate: '2026-06-05',
            endDate: '2026-06-06',
            startTime: '0001',
            endTime: '0000',
            base: 'YYZ',
            fleet: null,
            position: null,
            matchedTier: null,
            awardPriority: null,
            explanation: null,
            creditMinutes: null,
            creditMissingReason: null,
            blockMinutes: null,
            tafbDays: null,
            legEquipmentMissingReason: null,
            legs: [],
          }],
          reasonReport: {
            available: true,
            items: [
              {
                id: 'pairing-10924',
                kind: 'awarded_pairing',
                pairingId: '10924',
                pairingCode: 'T4528',
                startDate: '2026-06-04',
                endDate: '2026-06-04',
                explanation: 'Matched your Tier 1 pairing preferences.',
              },
              {
                id: 'pairing-10925',
                kind: 'awarded_pairing',
                pairingId: '10925',
                pairingCode: 'T4529',
                startDate: '2026-06-08',
                endDate: '2026-06-08',
                explanation: 'Matched your Tier 2 pairing preferences.',
              },
              {
                id: 'pairing-10926',
                kind: 'awarded_pairing',
                pairingId: '10926',
                pairingCode: 'T4530',
                startDate: '2026-06-12',
                endDate: '2026-06-13',
                explanation: 'Matched your Tier 3 pairing preferences.',
              },
              {
                id: 'pairing-10927',
                kind: 'awarded_pairing',
                pairingId: '10927',
                pairingCode: 'T4531',
                startDate: '2026-06-16',
                endDate: '2026-06-16',
                explanation: 'Matched your Tier 4 pairing preferences.',
              },
            ],
          },
        },
        message: 'OK',
      },
    })
  })
}

test.use({ storageState: { cookies: [], origins: [] } })

test('PBS Award published Credit and Fleet render without Missing values', async ({ page }) => {
  await mockAuthenticatedAwardPage(page)
  await page.goto('award')

  await expect(page.getByTestId('award-results-page')).toBeVisible()
  await expect(page.getByText('77:09')).toBeVisible()

  const selectedDuty = page.getByTestId('award-selected-duty-details')
  await expect(selectedDuty.getByText('T4528 #10924')).toBeVisible()
  await expect(selectedDuty.getByText('CREDIT:').locator('..')).toContainText('8:05')
  await expect(selectedDuty.getByText('7M8')).toHaveCount(2)
  await expect(page.getByText(/Missing/)).toHaveCount(0)
  await expect(selectedDuty.getByLabel('Award Explanation')).toContainText(
    'Matched your Tier 3 pairing preferences.',
  )
  const reportPreview = page.getByLabel('Reason report preview')
  await expect(reportPreview.getByText('Matched your Tier 1 pairing preferences.')).toBeVisible()
  await expect(reportPreview.getByText('Matched your Tier 2 pairing preferences.')).toBeVisible()
  await expect(reportPreview.getByText('Matched your Tier 3 pairing preferences.')).toBeVisible()
  await expect(reportPreview.getByText('Matched your Tier 4 pairing preferences.')).toHaveCount(0)
  await expect(reportPreview.getByText('+ 1 more explanation')).toBeVisible()

  const reportButton = page.getByRole('button', { name: 'View Reason Report' })
  await reportButton.click()
  const reportDialog = page.getByRole('dialog', { name: 'Award Reason Report' })
  await expect(reportDialog).toBeVisible()
  await expect(reportDialog.getByText('Matched your Tier 4 pairing preferences.')).toBeVisible()
  await reportDialog.getByRole('button', { name: 'Close' }).click()
  await expect(reportDialog).toBeHidden()
  await expect(reportButton).toBeFocused()
  await reportButton.click()
  await expect(reportDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(reportDialog).toBeHidden()
  await expect(reportButton).toBeFocused()

  await page.getByTestId('award-roster-details-scroll').getByText('Jun 05 00:01').click()
  await expect(selectedDuty.getByLabel('Award Explanation')).toHaveCount(0)
})

test('PBS Award distinguishes a scheduled result from a published roster', async ({ page }) => {
  await mockAuthenticatedAwardPage(page)
  await page.route('**/api/award/current', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          periodCode: 'Feb 2026',
          published: false,
          availability: 'SCHEDULED',
          rpStart: '2026-01-31T00:00:00.000Z',
          rpEnd: '2026-03-01T00:00:00.000Z',
          awardPublishAt: '2026-01-20T09:00:00.000Z',
          firstPublishedAt: null,
          latestPublishedAt: null,
          timeZone: {
            base: 'YYZ',
            zoneId: 'America/Toronto',
            timezoneLabel: 'YYZ Local Time',
            fallback: false,
          },
          summary: {
            tier: null,
            offDays: 0,
            creditMinutes: null,
            premiumMinutes: null,
            pairingCount: 0,
            activityCount: 0,
            warnings: [],
          },
          calendar: {
            monthLabel: 'FEB 2026',
            weekdayLabels: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
            events: [],
          },
          items: [],
          reasonReport: {
            available: false,
            disabledReason: 'No award explanations are available for this period.',
            items: [],
          },
        },
        message: 'OK',
      },
    })
  })

  await page.goto('award')

  await expect(page.getByText('Scheduled · Feb 2026')).toBeVisible()
  await expect(page.getByTestId('award-empty-state')).toContainText(
    'Award results are scheduled to become available on',
  )
  await expect(page.getByText('Jan 31 ~ Mar 01')).toBeVisible()
  await expect(page.getByText('Published · Feb 2026')).toHaveCount(0)
})
