import { expect, test } from '@playwright/test'
import { gotoHelp, openHelpTopic } from './help-test-utils'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal Help bidding content', () => {
  test('PBS-3105 — Quick Start, Bid, and Reserve Preference mirror current UI wording', async ({ page }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'complete-a-bid')
    await expect(page.getByTestId('help-article')).toContainText('Dashboard')
    await expect(page.getByTestId('help-article')).toContainText('T1-T7')
    await expect(page.getByTestId('help-article')).toContainText('ADD BID')
    await expect(page.getByTestId('help-article')).toContainText('EXISTING BID PROPERTIES')
    await expect(page.getByTestId('help-article')).toContainText('Award')

    await openHelpTopic(page, 'bid-overview')
    await expect(page.getByTestId('help-article')).toContainText('EXISTING BID PROPERTIES')
    await expect(page.getByTestId('help-article')).toContainText('ADD BID PROPERTIES')
    await expect(page.getByTestId('help-article')).toContainText('FAVORITED PROPERTIES')
    await expect(page.getByTestId('help-article')).toContainText('DAYS OFF')
    await expect(page.getByTestId('help-article')).toContainText('PAIRING')
    await expect(page.getByTestId('help-article')).toContainText('ROSTER')
    await expect(page.getByTestId('help-article')).toContainText('VIEW RULES')
    await expect(page.getByTestId('help-article')).toContainText('SEARCH PAIRINGS')
    await openHelpTopic(page, 'bid-add-properties')
    await expect(page.getByTestId('help-article')).toContainText('Mixed Line Bid')
    await expect(page.getByTestId('help-article')).toContainText('Reserve Preference')
    await expect(page.getByTestId('help-article')).toContainText('ROSTER category')
    await expect(page.getByTestId('help-article')).toContainText('Reserve Only')
    await expect(page.getByTestId('help-article')).toContainText('Pairing Only')

    await openHelpTopic(page, 'pairing-configure')
    await expect(page.getByTestId('help-article')).toContainText('Pairing Filters')
    await expect(page.getByTestId('help-article')).toContainText('Route station')
    await expect(page.getByTestId('help-article')).toContainText('Layover station')
    await expect(page.getByTestId('help-article')).toContainText('Credit')
    await expect(page.getByTestId('help-article')).toContainText('Redeye')
    await expect(page.getByTestId('help-article')).toContainText('DHD')
    await expect(page.getByTestId('help-article')).toContainText('Apply Filters')
    await expect(page.getByTestId('help-article')).toContainText('they do not save a bid')
    await expect(page.getByTestId('help-article')).toContainText('pairing number, base, route, or rank text')
    await expect(page.getByTestId('help-article')).toContainText('Date scope labels')
    await expect(page.getByTestId('help-article')).toContainText('Event Date')
    await expect(page.getByTestId('help-article')).toContainText('Flight Date')
    await expect(page.getByTestId('help-article')).toContainText('Pairing Start Date')
    await expect(
      page.getByTestId('help-article').getByRole('img', {
        name: 'Pairing Preference search input and Filters button',
      }),
    ).toBeVisible()
    await expect(
      page.getByTestId('help-article').getByRole('img', {
        name: 'Pairing Filters dialog with date, time, station, credit, Redeye, and DHD controls',
      }),
    ).toBeVisible()

    await openHelpTopic(page, 'bid-conditions-roster-line')
    await expect(page.getByTestId('help-article')).toContainText('ADD BID PROPERTIES -> ROSTER -> Reserve Preference')
    await expect(page.getByTestId('help-article')).toContainText('Reserve Preference configuration dialog')
    await expect(page.getByTestId('help-article')).toContainText('Short-call type')
    await expect(page.getByTestId('help-article')).toContainText('Date Scope')
    await expect(page.getByTestId('help-article')).toContainText('Tiers')
    await expect(page.getByTestId('help-article')).toContainText('PRAM')
    await expect(page.getByTestId('help-article')).toContainText('04:00-16:00')
    await expect(page.getByTestId('help-article')).toContainText('RESA / RESB')
    await expect(page.getByTestId('help-article')).toContainText('Legacy or company reserve codes')
    await expect(page.getByTestId('help-article')).toContainText('Standing Bid Reserve Preference')
    await expect(page.getByTestId('help-article')).toContainText('Whole Month, First Half, or Second Half only')
    await expect(page.getByTestId('help-topic-bid-conditions-reserve')).toHaveCount(0)
  })

  test('PBS-3106 — Favorites, Standing Bid, and Award explain current behavior', async ({ page }) => {
    await gotoHelp(page)

    await openHelpTopic(page, 'bid-favorites-search')
    await expect(page.getByTestId('help-article')).toContainText('SELECT TX')
    await expect(page.getByTestId('help-article')).toContainText('ADD TO BID')
    await expect(page.getByTestId('help-article')).toContainText('VIEW RULES')
    await expect(page.getByTestId('help-article')).toContainText('ALL PAIRINGS')

    await openHelpTopic(page, 'standing-bid-overview')
    await expect(page.getByTestId('help-article')).toContainText('EXISTING STANDING BID')
    await expect(page.getByTestId('help-article')).toContainText('ADD STANDING BID')
    await expect(page.getByTestId('help-article')).toContainText('fallback')
    await expect(page.getByTestId('help-article')).toContainText('does not show the left BIDDING CALENDAR')
    await expect(page.getByTestId('help-article')).toContainText('Lineholder Standing')
    await expect(page.getByTestId('help-article')).toContainText('Reserve Preference')
    await expect(page.getByTestId('help-article')).toContainText('StandingReserve draft')

    await openHelpTopic(page, 'standing-bid-manage')
    await expect(page.getByTestId('help-article')).toContainText('Configure Standing Bid')
    await expect(page.getByTestId('help-article')).toContainText('UPDATE BID')
    await expect(page.getByTestId('help-article')).toContainText('exact calendar date')
    await expect(page.getByTestId('help-article')).toContainText('hide this control')
    await expect(page.getByTestId('help-article')).toContainText('No airports or cities match')
    await expect(page.getByTestId('help-article')).toContainText('type at least one character')
    await expect(page.getByTestId('help-article')).toContainText('Unable to load the Time Between Flights limits.')
    await expect(page.getByTestId('help-article')).toContainText('Whole Month, First Half, or Second Half only')

    await openHelpTopic(page, 'award-overview')
    await expect(page.getByTestId('help-article')).toContainText('Award period')
    await expect(page.getByTestId('help-article')).toContainText('Roster Details')
    await expect(page.getByTestId('help-article')).toContainText('Selected Duty')
    await expect(page.getByTestId('help-article')).toContainText('Published')
    await expect(page.getByTestId('help-article')).toContainText('Awaiting publication')
    await expect(page.getByTestId('help-article')).toContainText('no matching published roster snapshot')
    await expect(page.getByTestId('help-article')).toContainText('Reason Report')
    await expect(page.getByTestId('help-article')).toContainText('Credit Hours')
    await expect(page.getByTestId('help-article')).toContainText('Block Hours')
    await expect(page.getByTestId('help-article')).toContainText('A 0 count')
    await expect(page.getByTestId('help-article')).toContainText('-- means')
    await expect(page.getByTestId('help-article')).toContainText('Missing data')
    await expect(page.getByTestId('help-article')).toContainText('does not create an Award immediately')
  })

  test('PBS-3113 — Bidding Calendar explains its controls, Bid actions, and page boundaries', async ({ page }) => {
    await gotoHelp(page)
    await openHelpTopic(page, 'bid-calendar')

    const article = page.getByTestId('help-article')
    await expect(article).toContainText('BIDDING CALENDAR')
    await expect(article).toContainText('T1-T7')
    await expect(article).toContainText('DAYS OFF')
    await expect(article).toContainText('PAIRING')
    await expect(article).toContainText('weekday heading')
    await expect(article).toContainText('Collapse / Expand')
    await expect(article).toContainText('Days Off capacity')
    await expect(article).toContainText('23/33')
    await expect(article).toContainText('same crew counts once per date')
    await expect(article).toContainText('Green means requested is below max')
    await expect(article).toContainText('Yellow means requested equals max')
    await expect(article).toContainText('Red means requested is above max')
    await expect(article).toContainText('Dashboard')
    await expect(article).toContainText('Bid')
    await expect(article).not.toContainText('Reserve page')

    const screenshot = article.getByRole('img', {
      name: 'BIDDING CALENDAR with current-period status, month, T1-T7, saved bid activity, days-off capacity, and collapse control',
    })
    await expect(screenshot).toHaveAttribute('src', /\/help\/screenshots\/bid-calendar\.png$/)
    await expect(article).toContainText(
      'The BIDDING CALENDAR shows the active period, month, Tier context, saved bid activity, days-off capacity, and the control used to collapse the panel.',
    )
  })
})
