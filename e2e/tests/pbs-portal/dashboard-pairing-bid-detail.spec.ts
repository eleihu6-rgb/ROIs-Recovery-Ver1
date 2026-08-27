import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const mockDashboardApis = async (page: Page) => {
  await page.route('**/api/auth/session', async (route) => {
    await fulfillJson(route, {
      user: {
        id: 'u-1',
        name: 'Alex Crew',
        employeeNo: 'F8001',
      },
      authMode: 'password',
    })
  })

  await page.route('**/api/dashboard/profile', async (route) => {
    await fulfillJson(route, {
      id: 'u-1',
      employeeNo: 'F8001',
      name: 'Alex Crew',
      email: 'alex.crew@example.com',
      base: 'YVR',
      rank: 'FA',
      division: 'C',
      fleet: ['737', '7M8'],
      languages: ['EN 5'],
      seniorityLabel: '646',
      statusLabel: null,
      existingCreditLabel: '75.5',
      trainingMonthLabel: null,
      lastLoginLabel: null,
    })
  })

  await page.route('**/api/dashboard/summary', async (route) => {
    await fulfillJson(route, {
      profile: {
        id: 'u-1',
        employeeNo: 'F8001',
        name: 'Alex Crew',
        email: 'alex.crew@example.com',
        base: 'YVR',
        rank: 'FA',
        division: 'C',
        fleet: ['737', '7M8'],
        languages: ['EN 5'],
        seniorityLabel: '646',
        statusLabel: null,
        existingCreditLabel: '75.5',
        trainingMonthLabel: null,
        lastLoginLabel: null,
      },
      bidPackage: {
        periodCode: 'Apr 2026',
        businessNow: '2026-03-07T12:00:00.000Z',
        timezoneLabel: 'YVR Local Time',
        bidStartAt: '2026-03-06T00:00:00.000Z',
        bidCloseAt: '2026-03-13T23:59:00.000Z',
        bidStartLabel: 'Mar 06, 00:00',
        bidCloseLabel: 'Mar 13, 23:59',
        remainingLabel: '6 DAYS 11 HRS 59 MINS',
        computedStage: 'OPEN',
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
      messageCenter: {
        title: 'MESSAGE CENTER',
        baseLineAverage: null,
        fleetItems: [{ fleet: '737', subFleet: null, pairingCount: 24 }],
        messages: [],
      },
    })
  })

  await page.route('**/api/bidding-calendar/current', async (route) => {
    await fulfillJson(route, {
      periodCode: 'Apr 2026',
      bidContext: 'Current',
      currentPeriod: {
        id: 42,
        rosterPeriodId: 42,
        rosterPeriodKey: '2026RP04',
        periodCode: 'Apr 2026',
        filiale: 'F8',
        division: 'C',
        status: 'OPEN',
        computedStage: 'OPEN',
        bidOpenAt: '2026-03-06T00:00:00.000Z',
        bidCloseAt: '2026-03-13T23:59:00.000Z',
        rpStartLocal: '2026-04-01',
        rpEndLocal: '2026-04-30',
        timezoneLabel: 'YVR Local Time',
        zoneId: 'America/Vancouver',
        canEditBid: true,
        readOnlyReason: null,
      },
      activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      events: [
        {
          id: 'pairing-bid-m4959',
          type: 'pairing_bid',
          tier: 'T1',
          label: 'M4959',
          startDate: '2026-04-06',
          endDate: '2026-04-08',
          tone: 'blue',
          source: 'pbs_bid_group',
          readonly: true,
          metadata: {
            propertyGroupKey: 'group-102',
            pairingNumber: 'M4959',
            pairingId: '4959001',
            originDate: '2026-04-06',
            occurrenceMode: 'specific_date',
          },
        },
      ],
    })
  })

  await page.route('**/api/pairing-search/pairing-details', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({
      rosterPeriodId: 42,
      periodCode: 'Apr 2026',
      targets: [
        {
          pairingId: '4959001',
          originDate: '2026-04-06',
        },
      ],
    })

    await fulfillJson(route, {
      results: [
        {
          id: '4959001',
          pairingId: '4959001',
          pairingNumber: 'M4959',
          base: 'YVR',
          startDateLabel: 'Apr 6, 2026',
          compositionLabel: 'CA(1)',
          reportTime: '0630',
          priorityLabel: 'P0',
          prioritySequence: '00',
          totalBlock: '1214',
          totalCredit: '765',
          totalDp: '9:30',
          totalPay: '765',
          activeDates: ['2026-04-06'],
          legs: [
            {
              id: '4959001-1-1',
              day: 1,
              dutyDate: '0406',
              dutyFdp: '0830',
              dutyFlyingHour: '0531',
              dutyHour: '0930',
              dutyCredit: '0600',
              flightNumber: '2810',
              departureStation: 'YVR',
              arrivalStation: 'CUN',
              departureTime: '0730',
              arrivalTime: '1301',
              blockTime: '0531',
              equipment: '7M8',
              ganttQual: 'FLY',
              ganttAirline: 'F8',
              ganttFlight: '2810',
              ganttFleet: '7M8',
              ganttAcc: 'D',
              ganttRef: '-240',
              ganttDep: 'YVR',
              ganttPickup: '06:15',
              ganttReport: '06:30',
              ganttStd: '07:30',
              ganttAtd: '07:35',
              ganttArr: 'CUN',
              ganttSta: '13:01',
              ganttAta: '13:05',
              ganttDropoff: '13:20',
              ganttGroundTime: '1:02',
              ganttBlockHour: '5:31',
              ganttFlightTime: '5:31',
              ganttMinimumRest: '10:00|10:00',
              ganttDuty: 'LO 1 · FDP 8:30 · DP 9:30',
            },
          ],
        },
      ],
    })
  })
}

test.use({
  storageState: { cookies: [], origins: [] },
})

test('PBS-3051 — dashboard pairing bid detail uses live Gantt-aligned fields @smoke', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockDashboardApis(page)

  await page.goto('dashboard')
  await page.getByRole('button', { name: 'View pairing bid M4959' }).click()

  const dialog = page.getByRole('dialog', { name: 'Pairing Bid' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('M4959 #4959001')
  await expect(dialog).toContainText('Start')
  await expect(dialog).toContainText('Apr 6, 2026')
  await expect(dialog).toContainText('Composition')
  await expect(dialog).toContainText('CA(1)')
  await expect(dialog).toContainText('Total Credit')
  await expect(dialog).toContainText('12:45')
  await expect(dialog).toContainText('Total BH')
  await expect(dialog).toContainText('12:14')
  await expect(dialog).toContainText('Total DP')
  await expect(dialog).toContainText('9:30')

  for (const header of ['QUAL', 'ALN', 'Flight', 'Fleet', 'ACC', 'Ref', 'DEP', 'PCK', 'RPT', 'STD', 'ATD', 'ARR', 'STA', 'ATA', 'DRP', 'GT', 'BH', 'FT', 'MRT', 'Duty']) {
    await expect(dialog).toContainText(header)
  }

  for (const value of ['FLY', 'F8', '2810', '-240', '06:15', '06:30', '07:35', '13:20', '1:02', '5:31', '10:00|10:00', 'LO 1 · FDP 8:30 · DP 9:30']) {
    await expect(dialog).toContainText(value)
  }

  await expect(dialog.getByText('TBLK')).toHaveCount(0)
  await expect(dialog.getByText('TCRD')).toHaveCount(0)
  await expect(dialog.getByText('TPAY')).toHaveCount(0)
  await expect(dialog.getByText('DAY')).toHaveCount(0)
  await expect(dialog.getByText('F/H')).toHaveCount(0)
  await expect(dialog.getByText('D/H')).toHaveCount(0)
  await expect(dialog.getByText('CRD')).toHaveCount(0)
  await expect(dialog.getByText('FLTN')).toHaveCount(0)
  await expect(dialog.getByText('DPS')).toHaveCount(0)
  await expect(dialog.getByText('ARS')).toHaveCount(0)
  await expect(dialog.getByText('BLKT')).toHaveCount(0)
  await expect(dialog.getByText('EQP')).toHaveCount(0)
})

test('PBS-3052 — pairing bid detail stays centered inside the scaled workbench', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  await mockDashboardApis(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('dashboard')

  const trigger = page.getByRole('button', { name: 'View pairing bid M4959' })
  const portalRoot = page.getByTestId('scaled-page-dialog-portal-root')
  const scaledCanvas = portalRoot.locator('..')
  const openDialog = async () => {
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Pairing Bid' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    return dialog
  }
  const waitForScaledLayout = async () => {
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    }))
  }

  const dialog = await openDialog()
  const overlay = page.getByTestId('pairing-bid-detail-overlay')
  const calendarContentRegion = page.getByTestId('bidding-calendar-content-region')

  await expect.poll(() => overlay.evaluate((element) => (
    element.parentElement?.dataset.testid === 'scaled-page-dialog-portal-root'
  ))).toBe(true)

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 633, height: 1259 },
    { width: 423, height: 1259 },
  ]) {
    await page.setViewportSize(viewport)
    await waitForScaledLayout()

    await expect(portalRoot).toBeVisible()
    const canvasBox = await scaledCanvas.boundingBox()
    const overlayBox = await overlay.boundingBox()
    const dialogBox = await dialog.boundingBox()

    expect(canvasBox).not.toBeNull()
    expect(overlayBox).not.toBeNull()
    expect(dialogBox).not.toBeNull()
    expect(Math.abs(overlayBox!.x - canvasBox!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(overlayBox!.y - canvasBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(overlayBox!.width - canvasBox!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(overlayBox!.height - canvasBox!.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(
      (dialogBox!.x + dialogBox!.width / 2) - (canvasBox!.x + canvasBox!.width / 2),
    )).toBeLessThanOrEqual(1)
    expect(Math.abs(
      (dialogBox!.y + dialogBox!.height / 2) - (canvasBox!.y + canvasBox!.height / 2),
    )).toBeLessThanOrEqual(1)
    expect(dialogBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 1)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 1)
    expect(dialogBox!.y).toBeGreaterThanOrEqual(canvasBox!.y - 1)
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height + 1)
    const canvasScale = await scaledCanvas.evaluate((element) => (
      new DOMMatrixReadOnly(window.getComputedStyle(element).transform).a
    ))
    await expect(dialog).toHaveCSS('transform', 'none')
    expect(Math.abs(dialogBox!.width - 880 * canvasScale)).toBeLessThanOrEqual(2)
    if (viewport.height === 1259) {
      expect(overlayBox!.y + overlayBox!.height).toBeLessThan(viewport.height - 100)
    }
    const calendarLayout = await calendarContentRegion.evaluate((element) => {
      const htmlElement = element as HTMLElement
      const style = window.getComputedStyle(htmlElement)
      return {
        clientWidth: htmlElement.clientWidth,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        scrollWidth: htmlElement.scrollWidth,
      }
    })
    expect(calendarLayout.overflowX).toBe('visible')
    expect(calendarLayout.overflowY).toBe('visible')
    expect(calendarLayout.scrollWidth).toBeLessThanOrEqual(calendarLayout.clientWidth + 1)
    await expect(scaledCanvas).not.toHaveCSS('transform', 'none')
  }

  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(trigger).toBeFocused()

  await openDialog()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  await openDialog()
  await page.getByTestId('pairing-bid-detail-overlay').click({ position: { x: 2, y: 2 } })
  await expect(trigger).toBeFocused()
})
