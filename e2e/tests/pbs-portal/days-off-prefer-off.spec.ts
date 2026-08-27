import { expect, test, type Page, type Route } from '@playwright/test'

const AUTH_TOKEN_KEY = 'pbs-portal.auth.token'

type PreferOffPayload = {
  bid: { type: 'tag-list'; values: string[] }
  tiers: string[]
  allOrNothing: boolean
  minimumN: number | null
  maximumN: number | null
}

type StoredPreferOff = PreferOffPayload & {
  propertyGroupKey: string
  rowSeq: number
  propertyCode: 201
  name: 'Prefer Off'
}

type StoredFavorite = PreferOffPayload & {
  favoriteKey: string
  propertyId: 201
  propertyCode: 201
  name: 'Prefer Off'
}

const currentPeriod = {
  id: 38,
  periodCode: 'Jun 2026',
  filiale: 'F8',
  division: 'C',
  status: 'OPEN',
  computedStage: 'OPEN',
  bidOpenAt: '2026-05-01T00:00:00.000Z',
  bidCloseAt: '2026-05-08T23:59:00.000Z',
  canEditBid: true,
  readOnlyReason: null,
}

const preferOffConfig = {
  weekdays: [
    { code: 'MON', name: 'Monday', order: 1, isoDay: 1 },
    { code: 'TUE', name: 'Tuesday', order: 2, isoDay: 2 },
    { code: 'WED', name: 'Wednesday', order: 3, isoDay: 3 },
    { code: 'THU', name: 'Thursday', order: 4, isoDay: 4 },
    { code: 'FRI', name: 'Friday', order: 5, isoDay: 5 },
    { code: 'SAT', name: 'Saturday', order: 6, isoDay: 6 },
    { code: 'SUN', name: 'Sunday', order: 7, isoDay: 7 },
  ],
  weekend: {
    available: true,
    startDayCode: 'SAT',
    startDayName: 'Saturday',
    startTime: '00:00',
    endDayCode: 'SUN',
    endDayName: 'Sunday',
    endTime: '24:00',
  },
}

const profile = {
  id: 'u-1',
  employeeNo: 'F8030',
  name: 'Casey Crew',
  email: 'casey.crew@example.com',
  base: 'YVR',
  rank: 'FA',
  division: 'C',
  fleet: ['737'],
  languages: ['EN 5'],
  seniorityLabel: '646',
  statusLabel: null,
  existingCreditLabel: '75.5',
  trainingMonthLabel: null,
  lastLoginLabel: null,
}

const biddingCalendar = {
  periodCode: 'Jun 2026',
  bidContext: 'Current',
  currentPeriod,
  activeTierRange: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  events: [],
}

const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installPreferOffApi = async (page: Page) => {
  const state: {
    draftVersion: number
    properties: StoredPreferOff[]
    favorites: StoredFavorite[]
    addPayloads: PreferOffPayload[]
    favoritePayloads: PreferOffPayload[]
    patchPayloads: PreferOffPayload[]
  } = {
    draftVersion: 0,
    properties: [],
    favorites: [],
    addPayloads: [],
    favoritePayloads: [],
    patchPayloads: [],
  }
  const buildLineholderSummary = () => ({
    draftVersion: state.draftVersion,
    periodCode: 'Jun 2026',
    bidContext: 'Current' as const,
    statistics: [],
    summaryItems: state.properties.map((property) => ({
      id: `daysoff-${property.propertyGroupKey}`,
      groupKey: property.propertyGroupKey,
      bidType: 'DaysOff' as const,
      action: 'SetCondition' as const,
      label: property.name,
      bid: property.bid.values.join(', '),
      value: property.bid.values.join(', '),
      readableText: property.bid.values.join(', '),
      tiers: property.tiers,
      source: 'currentDraft' as const,
      editableSource: {
        module: 'DaysOff' as const,
        propertyGroupKey: property.propertyGroupKey,
      },
    })),
    warnings: [],
    diagnostics: [],
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())

    if (pathname.endsWith('/auth/session')) {
      await fulfillJson(route, {
        user: { id: profile.id, name: profile.name, employeeNo: profile.employeeNo },
        authMode: 'password',
      })
      return
    }

    if (pathname.endsWith('/portal/bootstrap')) {
      await fulfillJson(route, {
        profile,
        biddingCalendar,
        lineholderSummary: buildLineholderSummary(),
      })
      return
    }

    if (pathname.endsWith('/dashboard/profile')) {
      await fulfillJson(route, profile)
      return
    }

    if (pathname.endsWith('/bidding-calendar/current')) {
      await fulfillJson(route, biddingCalendar)
      return
    }

    if (pathname.endsWith('/lineholder-bids/current/summary')) {
      await fulfillJson(route, buildLineholderSummary())
      return
    }

    if (pathname.endsWith('/days-off-bids/current/properties') && request.method() === 'POST') {
      const payload = request.postDataJSON() as PreferOffPayload
      const propertyGroupKey = `prefer-off-${state.properties.length + 1}`
      state.addPayloads.push(payload)
      state.properties.push({
        ...payload,
        propertyGroupKey,
        rowSeq: state.properties.length + 1,
        propertyCode: 201,
        name: 'Prefer Off',
      })
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: 38,
        periodCode: 'Jun 2026',
        draftVersion: state.draftVersion,
        propertyGroupKey,
        rowSeq: state.properties.length,
      })
      return
    }

    if (pathname.includes('/days-off-bids/current/properties/') && request.method() === 'PUT') {
      const propertyGroupKey = decodeURIComponent(pathname.split('/').at(-1) ?? '')
      const payload = request.postDataJSON() as PreferOffPayload
      const index = state.properties.findIndex((property) => property.propertyGroupKey === propertyGroupKey)
      state.patchPayloads.push(payload)
      if (index >= 0) {
        state.properties[index] = { ...state.properties[index], ...payload }
      }
      state.draftVersion += 1
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: 38,
        periodCode: 'Jun 2026',
        draftVersion: state.draftVersion,
        propertyGroupKey,
        tiers: payload.tiers,
      })
      return
    }

    if (pathname.endsWith('/days-off-bids/current/favorites') && request.method() === 'POST') {
      const payload = request.postDataJSON() as PreferOffPayload
      const favoriteKey = `prefer-off-favorite-${state.favorites.length + 1}`
      state.favoritePayloads.push(payload)
      const favorite: StoredFavorite = {
        ...payload,
        favoriteKey,
        propertyId: 201,
        propertyCode: 201,
        name: 'Prefer Off',
      }
      state.favorites.push(favorite)
      await fulfillJson(route, {
        saved: true,
        draftKey: '42',
        bidId: 42,
        periodId: 38,
        periodCode: 'Jun 2026',
        draftVersion: state.draftVersion,
        ...favorite,
      })
      return
    }

    if (pathname.endsWith('/days-off-bids/current') && request.method() === 'GET') {
      await fulfillJson(route, {
        currentPeriod,
        preferOffConfig,
        draft: {
          draftKey: '42',
          bidId: 42,
          periodId: 38,
          draftVersion: state.draftVersion,
          periodCode: 'Jun 2026',
          bidContext: 'Current',
          remarks: '',
          properties: state.properties,
        },
        propertyCatalog: [
          {
            propertyCode: 201,
            name: 'Prefer Off',
            defaultBid: { type: 'tag-list', values: [], suggestions: [] },
          },
        ],
        favoriteProperties: state.favorites,
        recommendedPropertyCodes: [201],
      })
      return
    }

    if (
      (pathname.endsWith('/pairing-bids/current') || pathname.endsWith('/line-bids/current'))
      && request.method() === 'GET'
    ) {
      await fulfillJson(route, {
        currentPeriod,
        draft: {
          draftKey: '42',
          bidId: 42,
          periodId: 38,
          draftVersion: 0,
          periodCode: 'Jun 2026',
          bidContext: 'Current',
          remarks: '',
          properties: [],
        },
        propertyCatalog: [],
        favoriteProperties: [],
        recommendedPropertyCodes: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/counts')) {
      await fulfillJson(route, {
        mode: 'current_rules_counts',
        periodCode: 'Jun 2026',
        tier: 'T1',
        computedAt: '2026-06-01T00:00:00.000Z',
        summary: { activePropertyCount: 0, allRules: null },
        rows: [],
      })
      return
    }

    if (pathname.endsWith('/pairing-search/current-rules/tier-pools')) {
      await fulfillJson(route, {
        mode: 'current_rules_tier_pools',
        periodCode: 'Jun 2026',
        computedAt: '2026-06-01T00:00:00.000Z',
        packageTotal: { pairingIdCount: 0, totalItems: 0 },
        rows: [],
      })
      return
    }

    await fulfillJson(route, {})
  })

  return state
}

const showDaysOffProperties = async (page: Page) => {
  const bidPage = page.getByTestId('bid-page')
  await expect(bidPage).toBeVisible()
  const daysOffTab = bidPage.getByRole('tab', { name: 'DAYS OFF' })
  if (await daysOffTab.getAttribute('aria-selected') !== 'true') {
    await daysOffTab.click()
  }
  const workspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(workspace).toBeVisible()
  return workspace
}

const openPreferOffDialog = async (page: Page) => {
  const workspace = await showDaysOffProperties(page)
  await workspace.getByRole('button', { name: 'Add Prefer Off' }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure Prefer Off' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.use({ storageState: { cookies: [], origins: [] } })

test('Prefer Off keeps explicit dates out of Favorites while recurring modes still round-trip', async ({ page }) => {
  await page.addInitScript((authTokenKey) => {
    window.sessionStorage.setItem(authTokenKey, 'jwt-token')
  }, AUTH_TOKEN_KEY)
  const state = await installPreferOffApi(page)

  await page.goto('bid')
  let workspace = await showDaysOffProperties(page)
  await expect(workspace.getByRole('button', { name: 'Add Prefer Off' })).toHaveCount(1)
  await expect(workspace.getByRole('button', { name: 'Add Dates' })).toHaveCount(0)
  await expect(workspace.getByRole('button', { name: 'Add Days of Week' })).toHaveCount(0)
  await expect(workspace.getByRole('button', { name: 'Add Date Range' })).toHaveCount(0)

  let dialog = await openPreferOffDialog(page)
  const tierOne = dialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' })
  await expect(tierOne).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.getByText(/REQUIRED/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeDisabled()
  await tierOne.click()

  await dialog.getByRole('button', { name: 'Open Prefer Off calendar' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-10' }).click()
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await page.getByRole('gridcell', { name: 'Select 2026-06-12' }).click()
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'All selected periods' })).toHaveCount(0)
  await dialog.getByText('PREFER OFF TYPE').click()
  await expect(page.getByTestId('prefer-off-calendar-popover')).toBeHidden()
  await dialog.getByRole('switch', { name: 'Prefer Off time window' }).click()
  await dialog.getByLabel('Prefer Off time from').fill('08:00')
  await dialog.getByLabel('Prefer Off time to').fill('18:00')
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'ADD BID' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  expect(state.favoritePayloads).toHaveLength(0)
  expect(state.addPayloads[0]).toMatchObject({
    bid: { type: 'tag-list', values: ['2026-06-10', '2026-06-12', 'Window 08:00-18:00'] },
    tiers: ['T1'],
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
  })

  dialog = await openPreferOffDialog(page)
  await dialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' }).click()
  await dialog.getByRole('button', { name: 'Days of Week' }).click()
  await dialog.getByRole('button', { name: 'Monday' }).click()
  await dialog.getByRole('button', { name: 'Friday' }).click()
  await expect(dialog.getByRole('button', { name: 'SAVE FAVORITE' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'SAVE FAVORITE' }).click()

  expect(state.favoritePayloads).toHaveLength(1)
  expect(state.favoritePayloads[0]).toMatchObject({
    bid: { type: 'tag-list', values: ['Monday', 'Friday'] },
  })

  const bidPage = page.getByTestId('bid-page')
  await bidPage.getByRole('tab', { name: 'FAVORITED PROPERTIES' }).click()
  workspace = page.getByTestId('rule-bid-add-properties-workspace')
  await expect(workspace.getByLabel('Favorite bid for Prefer Off')).toContainText('Monday, Friday')
  await workspace.getByRole('button', { name: 'Select T1 for favorite Prefer Off' }).click()
  await workspace.getByRole('button', { name: 'Add Prefer Off' }).click()
  await expect.poll(() => state.addPayloads.length).toBe(2)
  expect(state.addPayloads[1]?.bid.values).toEqual(['Monday', 'Friday'])

  dialog = await openPreferOffDialog(page)
  await dialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' }).click()
  await dialog.getByRole('button', { name: 'Date Range' }).click()
  await dialog.getByRole('button', { name: 'Open Prefer Off calendar' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-22' }).click()
  await page.getByRole('gridcell', { name: 'Select 2026-06-18' }).click()
  await expect(page.getByTestId('prefer-off-calendar-popover')).toBeHidden()
  await expect(dialog.getByText('2026-06-18', { exact: true })).toBeVisible()
  await expect(dialog.getByText('2026-06-22', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  dialog = await openPreferOffDialog(page)
  await dialog.getByRole('button', { name: 'Toggle T1 for Prefer Off' }).click()
  await dialog.getByRole('button', { name: 'Weekends' }).click()
  await expect(dialog.getByText('Saturday 00:00 – Sunday 24:00')).toBeVisible()
  await expect(dialog.getByText('4 weekends')).toBeVisible()
  await dialog.getByRole('switch', { name: 'Prefer Off time window' }).click()
  await dialog.getByLabel('Prefer Off time from').fill('09:00')
  await dialog.getByLabel('Prefer Off time to').fill('17:00')
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Flexible quantity' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'ADD BID' }).click()

  expect(state.addPayloads).toHaveLength(4)
  expect(state.addPayloads[2]?.bid.values).toEqual(['Between 2026-06-18 - 2026-06-22'])
  expect(state.addPayloads[3]).toMatchObject({
    bid: { type: 'tag-list', values: ['Weekends', 'Window 09:00-17:00'] },
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
  })

  await page.reload()
  const existingRows = page.getByTestId('tier-summary-row')
  await expect(existingRows).toHaveCount(4)
  await page.getByRole('button', { name: 'Open detail for T1 Weekends, Window 09:00-17:00' }).click()
  dialog = page.getByRole('dialog', { name: 'Configure Prefer Off' })
  await expect(dialog.getByRole('button', { name: 'Weekends' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('switch', { name: 'Prefer Off time window' })).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByLabel('Prefer Off time from')).toHaveValue('09:00')
  await expect(dialog.getByLabel('Prefer Off time to')).toHaveValue('17:00')
  await expect(dialog.getByText('FULFILMENT')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Flexible quantity' })).toHaveCount(0)
  await expect(dialog.getByLabel('Prefer Off minimum required')).toHaveCount(0)
  await expect(dialog.getByLabel('Prefer Off maximum required')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'UPDATE BID' }).click()

  expect(state.patchPayloads[0]).toMatchObject({
    bid: { type: 'tag-list', values: ['Weekends', 'Window 09:00-17:00'] },
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
  })
})
