import { expect, test, type Page } from '@playwright/test'
import {
  BID_CONDITION_HELP_ENTRIES,
  EXPECTED_VISIBLE_BID_CONDITION_CONTEXTS,
  getBidConditionEntriesByGroup,
  getStandingBidConditionEntries,
  type BidConditionGroup,
} from '../../../../pbs-portal/src/features/help/topics/bid-conditions/condition-help-data'
import { gotoHelp, openHelpTopic } from './help-test-utils'

const contextKey = (context: {
  bidContext: string
  bidType: string
  propertyCode: number
}) => `${context.bidContext}:${context.bidType}:${context.propertyCode}`

const uniqueConditionNames = Array.from(new Set(BID_CONDITION_HELP_ENTRIES.map((entry) => entry.name)))
const entryScreenshotCount = (entries: typeof BID_CONDITION_HELP_ENTRIES) =>
  entries.reduce(
    (total, entry) => total + 1 + (entry.controlGuides?.filter((control) => control.screenshot).length ?? 0),
    0,
  )
const groupScreenshotCount = (group: BidConditionGroup) => {
  const groupEntryScreenshotCount = group === 'reserve' ? 0 : 1
  return groupEntryScreenshotCount + entryScreenshotCount(getBidConditionEntriesByGroup(group))
}

const conditionNavTestId = (topicSlug: string, conditionId: string) =>
  `help-condition-topic-${topicSlug}-${conditionId}`

const expectScreenshotsLoaded = async (page: Page, expectedCount: number) => {
  const screenshots = page.getByTestId('help-screenshot')
  await expect(screenshots).toHaveCount(expectedCount)

  for (let index = 0; index < expectedCount; index += 1) {
    const image = screenshots.nth(index).locator('img')
    await expect(image).toBeVisible()
    await expect.poll(
      () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      { message: `Help screenshot ${index + 1} should load with a real width` },
    ).toBeGreaterThan(0)
    await expect.poll(
      () => image.evaluate((element) => (element as HTMLImageElement).naturalHeight),
      { message: `Help screenshot ${index + 1} should load with a real height` },
    ).toBeGreaterThan(0)
  }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Help bid condition reference', () => {
  test('PBS-3115 — Help data covers every visible bid condition catalog context', () => {
    const expectedContexts = EXPECTED_VISIBLE_BID_CONDITION_CONTEXTS.map(contextKey).sort()
    const documentedContexts = BID_CONDITION_HELP_ENTRIES
      .flatMap((entry) => entry.visibleContexts)
      .map(contextKey)
      .sort()

    expect(documentedContexts).toEqual(expectedContexts)
    expect(uniqueConditionNames).toEqual([
      'Prefer Off',
      'Long Stretch Off / Compressed Flying',
      'Pairing Preference',
      'Pairing Check-In / Check-Out Time',
      'Flight Legs per Duty',
      'Work Day Preference',
      'Pairing Length',
      'Flight Number Preference',
      'Redeye Preference',
      'Deadhead Flying',
      'Time Between Flights',
      'Month-End Carryover',
      'Airport Preference',
      'Efficient Flying First',
      'Minimum Base Layover',
      'Commuter Pattern',
      'Mixed Line Bid',
      'Credit Window Preference',
      'Reserve Preference',
    ])
  })

  test('PBS-3116 — Bid Conditions navigation exposes condition drilldown without an All page', async ({ page }) => {
    await gotoHelp(page)

    await page.getByTestId('help-cat-bid-conditions').click()
    await expect(page.getByTestId('help-topic-bid-conditions-all')).toHaveCount(0)
    await expect(page.getByTestId('help-topic-bid-conditions-days-off')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-conditions-pairing')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-conditions-roster-line')).toBeVisible()
    await expect(page.getByTestId('help-topic-bid-conditions-reserve')).toHaveCount(0)
    await expect(page.getByTestId('help-topic-bid-conditions-standing-bid')).toBeVisible()

    for (const entry of getBidConditionEntriesByGroup('days-off')) {
      await expect(page.getByTestId(conditionNavTestId('bid-conditions-days-off', entry.id))).toBeVisible()
    }
    for (const entry of getBidConditionEntriesByGroup('pairing')) {
      await expect(page.getByTestId(conditionNavTestId('bid-conditions-pairing', entry.id))).toBeVisible()
    }
    for (const entry of getBidConditionEntriesByGroup('roster-line')) {
      await expect(page.getByTestId(conditionNavTestId('bid-conditions-roster-line', entry.id))).toBeVisible()
    }
    await expect(page.getByTestId(
      conditionNavTestId('bid-conditions-roster-line', 'reserve-preference'),
    )).toBeVisible()

    const standingPairingPreference = page.getByTestId(
      conditionNavTestId('bid-conditions-standing-bid', 'pairing-preference'),
    )
    await expect(standingPairingPreference).toHaveCount(0)
    for (const entry of getStandingBidConditionEntries()) {
      await expect(page.getByTestId(conditionNavTestId('bid-conditions-standing-bid', entry.id))).toBeVisible()
    }
  })

  test('PBS-3119 — Bid Conditions condition links open the group page and scroll to the matching card', async ({
    page,
  }) => {
    await gotoHelp(page)
    await page.getByTestId('help-cat-bid-conditions').click()

    const articleScrollRegion = page.getByTestId('help-view').locator('> div')
    await page.getByTestId(conditionNavTestId('bid-conditions-pairing', 'flight-number-preference')).click()

    const article = page.getByTestId('help-article')
    const targetCard = article.getByTestId('help-bid-condition-flight-number-preference')
    await expect(article).toContainText('Pairing condition list')
    await expect(targetCard).toBeInViewport()
    await expect(page.getByTestId(conditionNavTestId('bid-conditions-pairing', 'flight-number-preference'))).toHaveClass(
      /bg-\[#f4f5ff\]/,
    )
    await expect(articleScrollRegion.evaluate((element) => element.scrollTop)).resolves.toBeGreaterThan(0)

    await page.getByTestId('help-topic-bid-conditions-pairing').click()
    await expect.poll(() => articleScrollRegion.evaluate((element) => element.scrollTop)).toBe(0)
  })

  test('PBS-3117 — Bid Conditions group topics explain their visible condition sets', async ({ page }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'bid-conditions-days-off')
    await expect(page.getByTestId('help-article')).toContainText('Days Off entry points')
    await expect(page.getByTestId('help-article')).toContainText('Specific Dates')
    await expect(page.getByTestId('help-article')).toContainText('Prefer Off')
    await expect(page.getByTestId('help-article')).toContainText('Long Stretch Off / Compressed Flying')
    await expect(page.getByTestId('help-article')).not.toContainText('Reserve Preference')
    await expectScreenshotsLoaded(page, groupScreenshotCount('days-off'))

    await openHelpTopic(page, 'bid-conditions-pairing')
    await expect(page.getByTestId('help-article')).toContainText('Pairing entry points')
    await expect(page.getByTestId('help-article')).toContainText('Pairing entries on the left BIDDING CALENDAR')
    await expect(page.getByTestId('help-article')).toContainText('Two ways to start')
    await expect(page.getByTestId('help-article')).toContainText('Date-scope labels')
    await expect(page.getByTestId('help-article')).toContainText('Flight Date')
    await expect(page.getByTestId('help-article')).toContainText('Pairing Start Date')
    await expect(page.getByTestId('help-article')).toContainText('Pairing Preference')
    await expect(page.getByTestId('help-article')).toContainText('Work Day Preference')
    await expect(page.getByTestId('help-article')).toContainText('Month-End Carryover')
    await expect(page.getByTestId('help-article')).toContainText('Efficient Flying First')
    await expect(page.getByTestId('help-article')).not.toContainText('Minimum Base Layover')
    await expectScreenshotsLoaded(page, groupScreenshotCount('pairing'))

    await openHelpTopic(page, 'bid-conditions-roster-line')
    await expect(page.getByTestId('help-article')).toContainText('Roster / Line entry points')
    await expect(page.getByTestId('help-article')).toContainText('Most conditions start from ADD BID PROPERTIES')
    await expect(page.getByTestId('help-article')).toContainText('Minimum Base Layover')
    await expect(page.getByTestId('help-article')).toContainText('Commuter Pattern')
    await expect(page.getByTestId('help-article')).toContainText('Mixed Line Bid')
    await expect(page.getByTestId('help-article')).toContainText('Credit Window Preference')
    await expect(page.getByTestId('help-article')).toContainText('Reserve Preference')
    await expect(page.getByTestId('help-article')).toContainText(
      'Bid: ADD BID PROPERTIES -> ROSTER -> Reserve Preference',
    )
    await expectScreenshotsLoaded(page, groupScreenshotCount('roster-line'))
  })

  test('PBS-3120 — Bid Conditions explain Pairing Preference controls and reusable date scopes', async ({
    page,
  }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'bid-conditions-pairing')
    const article = page.getByTestId('help-article')
    const pairingPreference = article.getByTestId('help-bid-condition-pairing-preference')
    await expect(pairingPreference.getByTestId('help-bid-condition-controls-pairing-preference')).toContainText(
      'Search pairing list',
    )
    await expect(pairingPreference.getByTestId('help-bid-condition-controls-pairing-preference')).toContainText(
      'Search narrows the candidate pairing table by pairing number, base, route, or rank text.',
    )
    await expect(pairingPreference.getByTestId('help-bid-condition-controls-pairing-preference')).toContainText(
      'Apply Filters only changes the visible candidate table.',
    )
    await expect(pairingPreference.getByTestId('help-bid-condition-controls-pairing-preference')).toContainText(
      'Only the selected count becomes the Pairing Preference bid.',
    )
    await expect(
      pairingPreference.getByRole('img', { name: 'Pairing Preference search input and Filters button' }),
    ).toBeVisible()
    await expect(
      pairingPreference.getByRole('img', { name: 'Pairing Filters dialog with date, time, station, credit, Redeye, and DHD controls' }),
    ).toBeVisible()
    await expect(
      pairingPreference.getByRole('img', { name: 'Pairing Preference selected count and selected pairing chip after a row is checked' }),
    ).toBeVisible()

    const checkTime = article.getByTestId('help-bid-condition-pairing-check-in-check-out-time')
    await expect(checkTime.getByTestId('help-bid-condition-controls-pairing-check-in-check-out-time')).toContainText(
      'Limit to Event Date off',
    )
    await expect(checkTime.getByTestId('help-bid-condition-controls-pairing-check-in-check-out-time')).toContainText(
      'It limits when this saved Current Bid rule is eligible to match.',
    )
    await expect(
      checkTime.getByRole('img', { name: 'Limit to Event Date switch in the off state' }),
    ).toBeVisible()
    await expect(
      checkTime.getByRole('img', { name: 'Limit to Event Date switch in the on state with Specific Dates and Date Range choices' }),
    ).toBeVisible()

    const flightNumber = article.getByTestId('help-bid-condition-flight-number-preference')
    await expect(flightNumber).toContainText('Type at least one character')
    await expect(flightNumber).toContainText('Changing Type alone will not add a flight number')
    await expect(flightNumber.getByTestId('help-bid-condition-controls-flight-number-preference')).toContainText(
      'Flight Date means the operating date of a flight leg inside the pairing.',
    )
    await expect(
      flightNumber.getByRole('img', { name: 'Limit to Flight Date switch in the on state with Specific Dates and Date Range choices' }),
    ).toBeVisible()

    const pairingLength = article.getByTestId('help-bid-condition-pairing-length')
    await expect(pairingLength.getByTestId('help-bid-condition-controls-pairing-length')).toContainText(
      'Pairing Start Date means the first calendar date of the pairing.',
    )
    await expect(
      pairingLength.getByRole('img', { name: 'Limit to Pairing Start Date switch in the on state with Specific Dates and Date Range choices' }),
    ).toBeVisible()

    const workDay = article.getByTestId('help-bid-condition-work-day-preference')
    await expect(workDay.getByTestId('help-bid-condition-controls-work-day-preference')).toContainText(
      'Leaving time blank is valid for a weekday-only Work Day Preference.',
    )
    await expect(workDay.getByRole('img', { name: 'Work Day Preference weekday buttons and optional check-in windows' })).toBeVisible()

    const timeBetweenFlights = article.getByTestId('help-bid-condition-time-between-flights')
    await expect(timeBetweenFlights).toContainText('No date scope')
    await expect(timeBetweenFlights).toContainText('does not expose Limit to Event Date')
    await expect(timeBetweenFlights).toContainText('Unable to load the Time Between Flights limits.')

    const airportPreference = article.getByTestId('help-bid-condition-airport-preference')
    await expect(airportPreference).toContainText('No airports or cities match')
    await expect(airportPreference).toContainText('current account, base, period, selected event type, and search text')
  })

  test('PBS-3121 — Reserve Preference and Days Off control-level Help explains date scopes', async ({ page }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'bid-conditions-days-off')
    const daysOffArticle = page.getByTestId('help-article')
    const preferOff = daysOffArticle.getByTestId('help-bid-condition-prefer-off')
    await expect(preferOff.getByTestId('help-bid-condition-controls-prefer-off')).toContainText('Prefer Off Type')
    await expect(preferOff.getByTestId('help-bid-condition-controls-prefer-off')).toContainText(
      'Specific Dates and Date Range are current-period choices.',
    )
    await expect(
      preferOff.getByRole('img', { name: 'Prefer Off Type segmented control with Specific Dates, Date Range, Days of Week, and Weekends' }),
    ).toBeVisible()

    await openHelpTopic(page, 'bid-conditions-roster-line')
    const reserveArticle = page.getByTestId('help-article')
    const reservePreference = reserveArticle.getByTestId('help-bid-condition-reserve-preference')
    await expect(reservePreference.getByTestId('help-bid-condition-controls-reserve-preference')).toContainText(
      'Current Bid Reserve Preference can use Whole Month, First Half, Second Half, Date Range, or Specific Dates',
    )
    await expect(reservePreference.getByTestId('help-bid-condition-controls-reserve-preference')).toContainText(
      'Standing Bid Reserve Preference supports Whole Month, First Half, or Second Half only.',
    )
    await expect(reservePreference).toContainText(
      'pilot crews see P-series options such as PRAM, PRMM, or PRPM',
    )
    await expect(reservePreference).toContainText(
      'cabin crews see C-series options such as CRAM or CRPM',
    )
    await expect(
      reservePreference.getByRole('img', { name: 'Reserve Preference Date Scope control with scope mode choices' }),
    ).toBeVisible()
  })

  test('PBS-3118 — Standing Bid Conditions excludes the Current-only Pairing Preference card', async ({ page }) => {
    await gotoHelp(page)
    await openHelpTopic(page, 'bid-conditions-standing-bid')

    const article = page.getByTestId('help-article')
    await expect(article).toContainText('Standing Bid condition list')
    await expect(article).toContainText('Current-only')
    await expect(article.getByTestId('help-bid-condition-pairing-preference')).toHaveCount(0)
    await expect(article.getByTestId('help-bid-condition-reserve-preference')).toBeVisible()
    await expect(article.getByTestId('help-bid-condition-credit-window-preference')).toBeVisible()
    await expectScreenshotsLoaded(page, entryScreenshotCount(getStandingBidConditionEntries()))
  })
})
