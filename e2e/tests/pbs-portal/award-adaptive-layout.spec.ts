import { expect, test, type Page } from '@playwright/test'

const mockSession = {
  user: {
    id: 'pbs-layout-user',
    name: 'Layout Tester',
    employeeNo: '762',
  },
  authMode: 'password',
}

const mockAwardCurrent = {
  rosterPeriodId: 75,
  periodCode: 'Jun 2026',
  published: true,
  availability: 'AVAILABLE',
  lifecycleStage: 'PUBLISHED',
  rpStart: '2026-06-01',
  rpEnd: '2026-06-30',
  awardPublishAt: '2026-05-20T00:00:00.000Z',
  awardFinalAt: '2026-05-22T00:00:00.000Z',
  misAwardDeadlineAt: '2026-05-26T00:00:00.000Z',
  timeZone: {
    base: 'YEG',
    zoneId: 'America/Edmonton',
    timezoneLabel: 'YEG Local Time',
    fallback: false,
  },
  summary: {
    tier: null,
    offDays: 1,
    creditMinutes: 398,
    premiumMinutes: null,
    pairingCount: 2,
    activityCount: 0,
    warnings: [],
  },
  calendar: {
    monthLabel: 'JUN 2026',
    weekdayLabels: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    events: [
      {
        id: 'pairing-e4203',
        type: 'pairing',
        label: 'E4203',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        startTime: '0825',
        endTime: '1839',
        tone: 'blue',
        readonly: true,
      },
      {
        id: 'pairing-e4106',
        type: 'pairing',
        label: 'E4106',
        startDate: '2026-06-02',
        endDate: '2026-06-02',
        startTime: '1315',
        endTime: '2251',
        tone: 'blue',
        readonly: true,
      },
      {
        id: 'day-off-2026-06-03',
        type: 'day_off',
        label: 'DO',
        startDate: '2026-06-03',
        endDate: '2026-06-04',
        startTime: '0001',
        endTime: '0000',
        tone: 'green',
        readonly: true,
      },
    ],
  },
  items: [
    {
      id: 'pairing-e4203',
      type: 'pairing',
      label: 'E4203',
      pairingId: '4203',
      pairingCode: 'E4203',
      assignment: 'FLY',
      assignmentGroup: 'FLY',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      startTime: '0825',
      endTime: '1839',
      base: 'YEG',
      fleet: '73H',
      position: 'FA',
      matchedTier: null,
      awardPriority: null,
      creditMinutes: 370,
      creditMissingReason: null,
      blockMinutes: 346,
      tafbDays: 1,
      legEquipmentMissingReason: 'Leg equipment is missing from the published roster snapshot.',
      legs: [
        {
          id: 'leg-701',
          dutySeq: 1,
          segmentSeq: 1,
          day: '01',
          flightNumber: '701',
          deadhead: false,
          depAirport: 'YEG',
          arrAirport: 'YXX',
          depTime: '0915',
          arrTime: '1044',
          blockMinutes: 89,
          creditMinutes: 370,
          equipment: null,
          equipmentMissing: true,
        },
        {
          id: 'leg-704',
          dutySeq: 1,
          segmentSeq: 2,
          day: '01',
          flightNumber: '704',
          deadhead: false,
          depAirport: 'YXX',
          arrAirport: 'YEG',
          depTime: '1712',
          arrTime: '1839',
          blockMinutes: 87,
          creditMinutes: 370,
          equipment: null,
          equipmentMissing: true,
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          id: `leg-extra-${index + 1}`,
          dutySeq: 1,
          segmentSeq: index + 3,
          day: '01',
          flightNumber: `${810 + index}`,
          deadhead: false,
          depAirport: index % 2 === 0 ? 'YEG' : 'YYC',
          arrAirport: index % 2 === 0 ? 'YYC' : 'YEG',
          depTime: `${1100 + index * 20}`,
          arrTime: `${1130 + index * 20}`,
          blockMinutes: 30,
          creditMinutes: 370,
          equipment: null,
          equipmentMissing: true,
        })),
      ],
    },
    {
      id: 'pairing-e4106',
      type: 'pairing',
      label: 'E4106',
      pairingId: '4106',
      pairingCode: 'E4106',
      assignment: 'FLY',
      assignmentGroup: 'FLY',
      startDate: '2026-06-02',
      endDate: '2026-06-02',
      startTime: '1315',
      endTime: '2251',
      base: 'YEG',
      fleet: '78M',
      position: 'FA',
      matchedTier: null,
      awardPriority: null,
      creditMinutes: 390,
      creditMissingReason: null,
      blockMinutes: 364,
      tafbDays: 1,
      legEquipmentMissingReason: 'Leg equipment is missing from the published roster snapshot.',
      legs: [
        {
          id: 'leg-727',
          dutySeq: 2,
          segmentSeq: 1,
          day: '02',
          flightNumber: '727',
          deadhead: false,
          depAirport: 'YEG',
          arrAirport: 'YYJ',
          depTime: '1409',
          arrTime: '1546',
          blockMinutes: 97,
          creditMinutes: 390,
          equipment: null,
          equipmentMissing: true,
        },
        {
          id: 'leg-702',
          dutySeq: 2,
          segmentSeq: 2,
          day: '02',
          flightNumber: '702',
          deadhead: false,
          depAirport: 'YXX',
          arrAirport: 'YEG',
          depTime: '2128',
          arrTime: '2251',
          blockMinutes: 83,
          creditMinutes: 390,
          equipment: null,
          equipmentMissing: true,
        },
      ],
    },
    {
      id: 'day-off-2026-06-03',
      type: 'day_off',
      label: 'Day Off',
      pairingId: null,
      pairingCode: null,
      assignment: 'DO',
      assignmentGroup: 'DO',
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      startTime: '0001',
      endTime: '0000',
      base: 'YEG',
      fleet: null,
      position: null,
      matchedTier: null,
      awardPriority: null,
      creditMinutes: null,
      creditMissingReason: null,
      blockMinutes: null,
      tafbDays: null,
      legEquipmentMissingReason: null,
      legs: [],
    },
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `training-${index + 1}`,
      type: 'activity',
      label: `TRN${String(index + 1).padStart(2, '0')}`,
      pairingId: null,
      pairingCode: null,
      assignment: 'TRN',
      assignmentGroup: 'TRN',
      startDate: `2026-06-${String(index + 4).padStart(2, '0')}`,
      endDate: `2026-06-${String(index + 4).padStart(2, '0')}`,
      startTime: '0900',
      endTime: '1300',
      base: 'YEG',
      fleet: null,
      position: null,
      matchedTier: null,
      awardPriority: null,
      creditMinutes: 240,
      creditMissingReason: null,
      blockMinutes: null,
      tafbDays: null,
      legEquipmentMissingReason: null,
      legs: [],
    })),
  ],
  reasonReport: {
    available: true,
    items: [
      {
        id: 'reason-e4203',
        kind: 'awarded_pairing',
        pairingId: '4203',
        pairingCode: 'E4203',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        explanation: 'Awarded from Tier 1 after satisfying the requested departure window and pairing preference.',
      },
      {
        id: 'reason-e4106',
        kind: 'awarded_pairing',
        pairingId: '4106',
        pairingCode: 'E4106',
        startDate: '2026-06-02',
        endDate: '2026-06-02',
        explanation: 'Awarded from Tier 2 because the higher-priority option was unavailable while this pairing remained legal.',
      },
      {
        id: 'reason-e4307',
        kind: 'awarded_pairing',
        pairingId: '4307',
        pairingCode: 'E4307',
        startDate: '2026-06-03',
        endDate: '2026-06-03',
        explanation: 'Awarded after monthly credit and work-block constraints were satisfied without creating a roster conflict.',
      },
    ],
  },
}

const mockAuthenticatedAwardPage = async (
  page: Page,
  awardCurrent: unknown = mockAwardCurrent,
): Promise<void> => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pbs-portal.auth.token', 'layout-test-token')
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: mockSession,
        message: 'OK',
      },
    })
  })

  await page.route('**/api/award/current', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: awardCurrent,
        message: 'OK',
      },
    })
  })

  await page.route('**/api/award/periods', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          periods: [{
            rosterPeriodId: 75,
            periodCode: 'Jun 2026',
            rpStart: '2026-06-01',
            rpEnd: '2026-06-30',
            lifecycleStage: 'PUBLISHED',
            awardPublishAt: '2026-05-20T00:00:00.000Z',
            awardFinalAt: '2026-05-22T00:00:00.000Z',
            misAwardDeadlineAt: '2026-05-26T00:00:00.000Z',
            firstPublishedAt: '2026-05-20T00:05:00.000Z',
            latestPublishedAt: '2026-05-20T00:05:00.000Z',
          }, {
            rosterPeriodId: 74,
            periodCode: 'May 2026',
            rpStart: '2026-05-01',
            rpEnd: '2026-05-31',
            lifecycleStage: 'FINAL',
            awardPublishAt: '2026-04-20T00:00:00.000Z',
            awardFinalAt: '2026-04-22T00:00:00.000Z',
            misAwardDeadlineAt: '2026-04-26T00:00:00.000Z',
            firstPublishedAt: '2026-04-20T00:05:00.000Z',
            latestPublishedAt: '2026-04-20T00:05:00.000Z',
          }],
        },
        message: 'OK',
      },
    })
  })

  await page.route('**/api/award/periods/74', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          ...mockAwardCurrent,
          rosterPeriodId: 74,
          periodCode: 'May 2026',
          lifecycleStage: 'FINAL',
          rpStart: '2026-05-01',
          rpEnd: '2026-05-31',
          calendar: { ...mockAwardCurrent.calendar, monthLabel: 'MAY 2026' },
        },
        message: 'OK',
      },
    })
  })
}

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Award adaptive layout', () => {
  test('PBS-7106 — switching Award history clears stale details and loads the selected Period', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockAuthenticatedAwardPage(page)
    await page.goto('award')

    const selector = page.getByTestId('award-period-select')
    await expect(selector).toHaveValue('75')
    await selector.selectOption('74')
    await expect(page.getByTestId('award-page-loading')).toBeVisible()
    await expect(page.getByText('Final · May 2026')).toBeVisible()
    await expect(page.getByText('MAY 2026 Award Calendar')).toBeVisible()
  })

  test('PBS-7101 — award calendar stays inside the left card and does not overlap roster details', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockAuthenticatedAwardPage(page)
    await page.goto('award')

    const awardPage = page.getByTestId('award-results-page')
    const awardViewport = page.getByTestId('award-page-viewport')
    const awardCanvas = page.getByTestId('award-page-canvas')
    const detailGrid = page.getByTestId('award-detail-grid')
    const awardCalendar = page.getByTestId('award-month-calendar')
    const sidePanel = page.getByTestId('award-side-panel')
    const rosterDetails = page.getByTestId('award-roster-details-panel')

    await expect(awardViewport).toBeVisible()
    await expect(awardCanvas).toBeVisible()
    await expect(awardPage).toBeVisible()
    await expect(awardCalendar).toBeVisible()
    await expect(rosterDetails).toBeVisible()
    await expect(page.getByText('JUN 2026 Award Calendar')).toBeVisible()
    await expect(page.getByText('YEG Local Time')).toBeVisible()
    await expect(page.getByTestId('award-period-select')).toHaveValue('75')
    await expect(rosterDetails.getByText('YEG-YXX-YEG')).toBeVisible()

    const selectedDutyDetails = page.getByTestId('award-selected-duty-details')
    await expect(selectedDutyDetails.getByText('E4203 #4203')).toBeVisible()
    await expect(selectedDutyDetails.getByText('PAIRING FLEET:')).toBeVisible()
    await expect(selectedDutyDetails.getByText('POSITION:')).toBeVisible()
    await expect(selectedDutyDetails.getByText('TAFB:')).toBeVisible()
    await expect(selectedDutyDetails.getByText('1 day')).toBeVisible()
    await expect(selectedDutyDetails.getByRole('columnheader', { name: 'Flight' })).toBeVisible()
    await expect(selectedDutyDetails.getByRole('columnheader', { name: 'Fleet' })).toBeVisible()
    await expect(selectedDutyDetails.getByText('Leg equipment is missing from the published roster snapshot.')).toBeVisible()
    await expect(selectedDutyDetails.getByText('Missing').first()).toBeVisible()
    const selectedDutyRows = selectedDutyDetails.locator('tbody tr')
    await expect(selectedDutyRows).toHaveCount(14)
    await expect(selectedDutyRows.nth(0).locator('td').nth(8)).toHaveText('6:10')
    await expect(selectedDutyRows.nth(1).locator('td').nth(8)).toHaveText('--')
    await expect(selectedDutyDetails.getByText('Duty', { exact: true })).toHaveCount(0)

    await expect(page.getByTestId('award-month-calendar-scroll')).toHaveCount(0)
    const calendarSegments = page.getByTestId('award-calendar-time-segment')
    await expect(calendarSegments).toHaveCount(3)
    await expect(calendarSegments.filter({ hasText: 'E4203' })).toBeVisible()
    await expect(calendarSegments.filter({ hasText: 'E4106' })).toBeVisible()
    await expect(calendarSegments.filter({ hasText: 'DO' })).toBeVisible()

    const firstSegment = calendarSegments.first()
    const firstSegmentConflictState = await firstSegment.getAttribute('data-conflict')
    const firstSegmentBackground = await firstSegment.evaluate((node) => window.getComputedStyle(node).backgroundColor)
    const firstSegmentTextColor = await firstSegment.evaluate((node) => window.getComputedStyle(node).color)

    expect(firstSegmentConflictState).toBe('false')
    expect(await firstSegment.getAttribute('data-start-offset')).toBe('1.351')
    expect(await firstSegment.getAttribute('data-end-offset')).toBe('1.777')
    expect(firstSegmentBackground).toBe('rgb(79, 207, 237)')
    expect(firstSegmentTextColor).toBe('rgb(255, 255, 255)')

    const canvasScale = await awardCanvas.evaluate((node) => window.getComputedStyle(node).transform)
    expect(canvasScale).not.toBe('none')

    const [calendarBox, sidePanelBox, gridBox] = await Promise.all([
      awardCalendar.boundingBox(),
      sidePanel.boundingBox(),
      detailGrid.boundingBox(),
    ])

    expect(calendarBox, 'award calendar must have a layout box').not.toBeNull()
    expect(sidePanelBox, 'award side panel must have a layout box').not.toBeNull()
    expect(gridBox, 'award detail grid must have a layout box').not.toBeNull()

    expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(sidePanelBox!.x)
    expect(sidePanelBox!.x + sidePanelBox!.width).toBeLessThanOrEqual(gridBox!.x + gridBox!.width + 1)

    const viewportHasHorizontalOverflow = await awardViewport.evaluate((node) => node.scrollWidth > node.clientWidth + 1)

    expect(viewportHasHorizontalOverflow).toBe(false)
  })

  test('PBS-7102 — short viewport keeps selected duty above reason report with independent scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await mockAuthenticatedAwardPage(page)
    await page.goto('award')

    const awardPage = page.getByTestId('award-results-page')
    const awardCanvas = page.getByTestId('award-page-canvas')
    const sidePanel = page.getByTestId('award-side-panel')
    const rosterDetails = page.getByTestId('award-roster-details-panel')
    const rosterScroll = page.getByTestId('award-roster-details-scroll')
    const selectedDuty = page.getByTestId('award-selected-duty-details')
    const selectedDutyScroll = page.getByTestId('award-selected-duty-scroll')
    const reasonPreview = page.getByRole('region', { name: 'Reason report preview' })

    await expect(awardPage).toBeVisible()
    await expect(rosterDetails).toBeVisible()
    await expect(selectedDuty).toBeVisible()
    await expect(reasonPreview).toBeVisible()
    await expect(reasonPreview.getByText('E4203')).toBeVisible()
    await expect(reasonPreview.getByText(/Awarded from Tier 1/)).toBeVisible()

    const [awardPageBox, sidePanelBox, selectedDutyBox, reasonPreviewBox] = await Promise.all([
      awardPage.boundingBox(),
      sidePanel.boundingBox(),
      selectedDuty.boundingBox(),
      reasonPreview.boundingBox(),
    ])

    expect(awardPageBox, 'award page must have a layout box').not.toBeNull()
    expect(sidePanelBox, 'award side panel must have a layout box').not.toBeNull()
    expect(selectedDutyBox, 'selected duty must have a layout box').not.toBeNull()
    expect(reasonPreviewBox, 'reason preview must have a layout box').not.toBeNull()

    expect(selectedDutyBox!.width).toBeGreaterThan(0)
    expect(selectedDutyBox!.height).toBeGreaterThan(0)
    expect(reasonPreviewBox!.width).toBeGreaterThan(0)
    expect(reasonPreviewBox!.height).toBeGreaterThan(0)
    expect(selectedDutyBox!.y + selectedDutyBox!.height).toBeLessThanOrEqual(reasonPreviewBox!.y + 1)

    for (const childBox of [selectedDutyBox!, reasonPreviewBox!]) {
      expect(childBox.x).toBeGreaterThanOrEqual(sidePanelBox!.x - 1)
      expect(childBox.y).toBeGreaterThanOrEqual(sidePanelBox!.y - 1)
      expect(childBox.x + childBox.width).toBeLessThanOrEqual(sidePanelBox!.x + sidePanelBox!.width + 1)
      expect(childBox.y + childBox.height).toBeLessThanOrEqual(sidePanelBox!.y + sidePanelBox!.height + 1)
      expect(childBox.x).toBeGreaterThanOrEqual(awardPageBox!.x - 1)
      expect(childBox.y).toBeGreaterThanOrEqual(awardPageBox!.y - 1)
      expect(childBox.x + childBox.width).toBeLessThanOrEqual(awardPageBox!.x + awardPageBox!.width + 1)
      expect(childBox.y + childBox.height).toBeLessThanOrEqual(awardPageBox!.y + awardPageBox!.height + 1)
    }

    const overflow = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>('[data-testid="award-page-canvas"]')
      const side = document.querySelector<HTMLElement>('[data-testid="award-side-panel"]')
      return {
        documentHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        canvasHorizontal: canvas ? canvas.scrollWidth - canvas.clientWidth : 0,
        sideHorizontal: side ? side.scrollWidth - side.clientWidth : 0,
        sideVertical: side ? side.scrollHeight - side.clientHeight : 0,
      }
    })

    expect(overflow.documentHorizontal).toBeLessThanOrEqual(1)
    expect(overflow.canvasHorizontal).toBeLessThanOrEqual(1)
    expect(overflow.sideHorizontal).toBeLessThanOrEqual(1)
    expect(overflow.sideVertical).toBeLessThanOrEqual(1)

    const rosterMetrics = await rosterScroll.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }))
    const selectedMetrics = await selectedDutyScroll.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }))

    expect(rosterMetrics.scrollHeight).toBeGreaterThan(rosterMetrics.clientHeight)
    expect(selectedMetrics.scrollHeight).toBeGreaterThan(selectedMetrics.clientHeight)

    await rosterScroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await expect(page.getByRole('row', { name: /TRN18/ })).toBeVisible()

    const afterRosterScroll = await Promise.all([
      rosterScroll.evaluate((node) => node.scrollTop),
      selectedDutyScroll.evaluate((node) => node.scrollTop),
    ])
    expect(afterRosterScroll[0]).toBeGreaterThan(0)
    expect(afterRosterScroll[1]).toBe(selectedMetrics.scrollTop)

    await selectedDutyScroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await expect(selectedDuty.getByText('821', { exact: true })).toBeVisible()

    const afterSelectedScroll = await Promise.all([
      rosterScroll.evaluate((node) => node.scrollTop),
      selectedDutyScroll.evaluate((node) => node.scrollTop),
    ])
    expect(afterSelectedScroll[0]).toBe(afterRosterScroll[0])
    expect(afterSelectedScroll[1]).toBeGreaterThan(0)
  })

  test('PBS-7103 — 1920 baseline keeps all award regions visible and separated', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await mockAuthenticatedAwardPage(page)
    await page.goto('award')

    const awardPage = page.getByTestId('award-results-page')
    const sidePanel = page.getByTestId('award-side-panel')
    const selectedDuty = page.getByTestId('award-selected-duty-details')
    const reasonPreview = page.getByRole('region', { name: 'Reason report preview' })

    await expect(page.getByRole('heading', { name: 'Award', exact: true })).toBeVisible()
    await expect(page.getByLabel('Award summary')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Award month calendar' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Roster details' })).toBeVisible()
    await expect(selectedDuty).toBeVisible()
    await expect(reasonPreview).toBeVisible()

    const [awardPageBox, sidePanelBox, selectedDutyBox, reasonPreviewBox] = await Promise.all([
      awardPage.boundingBox(),
      sidePanel.boundingBox(),
      selectedDuty.boundingBox(),
      reasonPreview.boundingBox(),
    ])

    expect(awardPageBox).not.toBeNull()
    expect(sidePanelBox).not.toBeNull()
    expect(selectedDutyBox).not.toBeNull()
    expect(reasonPreviewBox).not.toBeNull()
    expect(selectedDutyBox!.y + selectedDutyBox!.height).toBeLessThanOrEqual(reasonPreviewBox!.y + 1)
    expect(selectedDutyBox!.x).toBeGreaterThanOrEqual(sidePanelBox!.x - 1)
    expect(reasonPreviewBox!.x + reasonPreviewBox!.width).toBeLessThanOrEqual(
      sidePanelBox!.x + sidePanelBox!.width + 1,
    )
    expect(reasonPreviewBox!.y + reasonPreviewBox!.height).toBeLessThanOrEqual(
      awardPageBox!.y + awardPageBox!.height + 1,
    )
  })

  test('PBS-7104 — short viewport keeps the empty reason report state separated', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await mockAuthenticatedAwardPage(page, {
      ...mockAwardCurrent,
      reasonReport: {
        available: false,
        disabledReason: 'No award explanations are available for this period.',
        items: [],
      },
    })
    await page.goto('award')

    const selectedDuty = page.getByTestId('award-selected-duty-details')
    const reasonPreview = page.getByRole('region', { name: 'Reason report preview' })

    await expect(page.getByRole('button', { name: 'View Reason Report' })).toBeDisabled()
    await expect(reasonPreview.getByText('No award explanations are available for this period.')).toBeVisible()

    const [selectedDutyBox, reasonPreviewBox] = await Promise.all([
      selectedDuty.boundingBox(),
      reasonPreview.boundingBox(),
    ])
    expect(selectedDutyBox).not.toBeNull()
    expect(reasonPreviewBox).not.toBeNull()
    expect(selectedDutyBox!.y + selectedDutyBox!.height).toBeLessThanOrEqual(reasonPreviewBox!.y + 1)
  })

  test('PBS-7105 — continuous task events render as single time-proportional bars', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const vacItems = Array.from({ length: 5 }, (_, index) => {
      const startDay = 22 + index
      const endDay = startDay + 1
      const startDate = `2026-06-${String(startDay).padStart(2, '0')}`

      return {
        id: `activity-${startDate}-VAC`,
        type: 'activity',
        label: 'VAC',
        pairingId: null,
        pairingCode: null,
        assignment: 'VAC',
        assignmentGroup: 'LEAVE',
        startDate,
        endDate: `2026-06-${String(endDay).padStart(2, '0')}`,
        startTime: '0000',
        endTime: '0000',
        base: 'YEG',
        fleet: null,
        position: null,
        matchedTier: null,
        awardPriority: null,
        explanation: null,
        creditMinutes: 240,
        creditMissingReason: null,
        blockMinutes: null,
        tafbDays: null,
        legEquipmentMissingReason: null,
        legs: [],
      }
    })
    await mockAuthenticatedAwardPage(page, {
      ...mockAwardCurrent,
      calendar: {
        ...mockAwardCurrent.calendar,
        events: [
          {
            id: 'pairing-4510',
            type: 'pairing',
            label: 'T4510',
            startDate: '2026-06-10',
            endDate: '2026-06-12',
            startTime: '1200',
            endTime: '1300',
            tone: 'blue',
            readonly: true,
          },
          {
            id: 'pairing-4501',
            type: 'pairing',
            label: 'T4501',
            startDate: '2026-06-16',
            endDate: '2026-06-17',
            startTime: '0800',
            endTime: '0800',
            tone: 'blue',
            readonly: true,
          },
          {
            id: 'pairing-4502',
            type: 'pairing',
            label: 'T4502',
            startDate: '2026-06-17',
            endDate: '2026-06-18',
            startTime: '0800',
            endTime: '0800',
            tone: 'blue',
            readonly: true,
          },
          {
            id: 'calendar-activity-VAC-2026-06-22T0000-2026-06-27T0000-501',
            type: 'activity',
            label: 'VAC',
            startDate: '2026-06-22',
            endDate: '2026-06-27',
            startTime: '0000',
            endTime: '0000',
            tone: 'yellow',
            readonly: true,
            sourceItemIds: vacItems.map((item) => item.id),
          },
        ],
      },
      items: [...mockAwardCurrent.items, ...vacItems],
    })
    await page.goto('award')

    const calendarSegments = page.getByTestId('award-calendar-time-segment')
    const continuousPairing = calendarSegments.filter({ hasText: 'T4510' })
    const firstPairing = calendarSegments.filter({ hasText: 'T4501' })
    const secondPairing = calendarSegments.filter({ hasText: 'T4502' })
    const vacation = calendarSegments.filter({ hasText: 'VAC' })

    await expect(calendarSegments).toHaveCount(4)
    await expect(continuousPairing).toHaveCount(1)
    await expect(continuousPairing).toHaveAttribute('data-start-offset', '3.5')
    await expect(continuousPairing).toHaveAttribute('data-end-offset', '5.542')
    await expect(firstPairing).toHaveCount(1)
    await expect(secondPairing).toHaveCount(1)
    await expect(vacation).toHaveCount(1)
    await expect(vacation).toHaveAttribute('data-start-offset', '1')
    await expect(vacation).toHaveAttribute('data-end-offset', '6')

    const [calendarBox, pairingBox, vacationBox] = await Promise.all([
      page.getByTestId('award-month-calendar').boundingBox(),
      continuousPairing.boundingBox(),
      vacation.boundingBox(),
    ])

    expect(calendarBox).not.toBeNull()
    expect(pairingBox).not.toBeNull()
    expect(vacationBox).not.toBeNull()
    expect(pairingBox!.width).toBeGreaterThan(calendarBox!.width / 7)
    expect(vacationBox!.width).toBeGreaterThan(calendarBox!.width / 2)

    const rosterDetails = page.getByRole('region', { name: 'Roster details' })
    const vacationButton = vacation.getByRole('button', {
      name: 'VAC from Jun 22 00:00 to Jun 27 00:00',
    })

    await expect(rosterDetails.getByText('26 duties · 22 rows')).toBeVisible()
    await expect(rosterDetails.getByText('Jun 22 00:00')).toHaveCount(1)
    await expect(rosterDetails.getByText('Jun 23 00:00')).toHaveCount(0)

    await vacationButton.click()

    await expect(vacationButton).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('award-selected-duty-details')).toContainText('Jun 22 - Jun 27')
    await expect(page.getByTestId('award-selected-duty-details')).toContainText('20:00')
  })
})
