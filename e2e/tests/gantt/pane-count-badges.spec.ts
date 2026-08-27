/**
 * Pane title-bar count badges: filtered/total moved from toolbar pills into panes.
 *
 * - No global filter  → pane title shows plain total (`pane-total-count` = total in range).
 * - Global filter set → pane title shows funnel badge `filtered/total` (`pane-filtered-count`).
 * - Regression: a session whose FIRST pull is filtered used to show total 0 (crew) or
 *   filtered==total (pairing/flight) because unfilteredTotal was never backfilled.
 * - The old toolbar match pills (Crew x/y, Pairing x/y, Flight x/y) are removed.
 *
 * All numeric asserts compare the rendered badge text against the same store truth
 * the canvas uses (__ganttTest crewTotals/pairingTotals/flightTotals) — no
 * visibility-only assertions (§No-Illusion).
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { seedGanttAuth, readHook, waitGanttReady, selectDropdownOption } from '../../utils/gantt-hook'

type Totals = { total: number; unfilteredTotal: number }
type FlightTotals = Totals & {
  registrationTotal: number
  unfilteredRegistrationTotal: number
}

const gotoLiveEmpty = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('live-empty-state').click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
}

const applyAndWaitLoaded = async (page: Page): Promise<void> => {
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('live-empty-state')).not.toBeVisible({ timeout: 60_000 })
  await waitGanttReady(page, 60_000)
}

/** Poll a totals accessor until the unfiltered backfill (fire-and-forget count query) lands. */
const pollTotals = async (page: Page, accessor: string): Promise<Totals> => {
  await expect
    .poll(async () => (await readHook<Totals>(page, accessor)).unfilteredTotal, {
      timeout: 30_000,
      message: `${accessor}.unfilteredTotal never backfilled (count query missing?)`,
    })
    .toBeGreaterThan(0)
  return readHook<Totals>(page, accessor)
}

const badgeIn = (pane: Locator, kind: 'filtered' | 'total'): Locator =>
  pane.getByTestId(kind === 'filtered' ? 'pane-filtered-count' : 'pane-total-count')

test.describe('Pane count badges (filtered/total)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1149 — filtered first pull shows funnel filtered/total on roster pane — regression: total was 0', async ({ page }) => {
    await gotoLiveEmpty(page)
    await selectDropdownOption(page, 'filter-crew-base', 'YEG', 'crew')
    // Pairing Coverage defaults to Open+Partial (a narrowing set) which now drives a
    // funnel badge on the pairing pane. This test asserts the pairing pane keeps its
    // PLAIN total (no pairing filter), so select Full too → all three coverage states
    // active → no narrowing.
    await page.getByTestId('filter-tab-pairing').click()
    await page.getByTestId('filter-pairing-coverage-full').click()
    await applyAndWaitLoaded(page)

    // The unfiltered total is backfilled by a count-only query after the filtered pull.
    const totals = await pollTotals(page, 'crewTotals')
    expect(totals.total).toBeGreaterThan(0)
    expect(totals.unfilteredTotal).toBeGreaterThan(totals.total)

    // Badge shows EXACTLY filtered/total from store truth — not 0, not '—'.
    const roster = page.getByTestId('roster-pane').first()
    await expect(badgeIn(roster, 'filtered')).toHaveText(`${totals.total}/${totals.unfilteredTotal}`)
    await expect(badgeIn(roster, 'total')).toHaveCount(0)

    // Pairing pane has NO pairing filter set → keeps the plain total badge.
    const pairing = page.getByTestId('pairing-pane').first()
    const pairingTotals = await readHook<Totals>(page, 'pairingTotals')
    expect(pairingTotals.unfilteredTotal).toBeGreaterThan(0)
    await expect(badgeIn(pairing, 'total')).toHaveText(String(pairingTotals.unfilteredTotal))
    await expect(badgeIn(pairing, 'filtered')).toHaveCount(0)

    // Old toolbar match pills are gone even while a filter is active.
    await expect(page.getByText(/Crew \d+\//)).toHaveCount(0)
    await expect(page.getByText(/Pairing \d+\//)).toHaveCount(0)
    await expect(page.getByText(/Flight \d+\//)).toHaveCount(0)
  })

  test('Live-1150 — unfiltered load shows plain totals on roster and pairing panes', async ({ page }) => {
    await gotoLiveEmpty(page)
    // Pairing Coverage defaults to Open+Partial (narrowing → funnel). Select Full so all
    // three states are active (no narrowing) and the pairing pane shows its plain total.
    await page.getByTestId('filter-tab-pairing').click()
    await page.getByTestId('filter-pairing-coverage-full').click()
    await applyAndWaitLoaded(page)

    const crew = await readHook<Totals>(page, 'crewTotals')
    expect(crew.unfilteredTotal).toBeGreaterThan(0)
    const roster = page.getByTestId('roster-pane').first()
    await expect(badgeIn(roster, 'total')).toHaveText(String(crew.unfilteredTotal))
    await expect(badgeIn(roster, 'filtered')).toHaveCount(0)

    const pairingTotals = await readHook<Totals>(page, 'pairingTotals')
    expect(pairingTotals.unfilteredTotal).toBeGreaterThan(0)
    // Unfiltered: filtered total equals unfiltered total in the store (single source).
    expect(pairingTotals.total).toBe(pairingTotals.unfilteredTotal)
    const pairing = page.getByTestId('pairing-pane').first()
    await expect(badgeIn(pairing, 'total')).toHaveText(String(pairingTotals.unfilteredTotal))
    await expect(badgeIn(pairing, 'filtered')).toHaveCount(0)
  })

  test('Live-1151 — pairing filter shows filtered/total on pairing pane — regression: badge showed total/total', async ({ page }) => {
    await gotoLiveEmpty(page)
    await page.getByTestId('filter-tab-pairing').click()
    await selectDropdownOption(page, 'filter-pairing-base', 'YEG', 'pairing')
    await applyAndWaitLoaded(page)

    const totals = await pollTotals(page, 'pairingTotals')
    expect(totals.total).toBeGreaterThan(0)
    // The old bug wrote the filtered total into unfilteredTotal (x/x). With a
    // restrictive base filter the true total must be strictly larger.
    expect(totals.unfilteredTotal).toBeGreaterThan(totals.total)

    const pairing = page.getByTestId('pairing-pane').first()
    await expect(badgeIn(pairing, 'filtered')).toHaveText(`${totals.total}/${totals.unfilteredTotal}`)
    await expect(badgeIn(pairing, 'total')).toHaveCount(0)

    // Crew has no filter → roster pane keeps the plain total badge.
    const roster = page.getByTestId('roster-pane').first()
    await expect(badgeIn(roster, 'filtered')).toHaveCount(0)
    const crew = await readHook<Totals>(page, 'crewTotals')
    await expect(badgeIn(roster, 'total')).toHaveText(String(crew.unfilteredTotal))
  })

  test('Live-1152 — flight pane follows the same behavior: plain total, then filtered/total after a flight filter', async ({ page }) => {
    await gotoLiveEmpty(page)
    await applyAndWaitLoaded(page)

    // Add a Flight pane (loads unfiltered for the current range).
    await page.getByTestId('add-pane-flight').click()
    const flight = page.getByTestId('flight-pane').first()
    await expect
      .poll(async () => (await readHook<FlightTotals>(page, 'flightTotals')).unfilteredTotal, { timeout: 30_000 })
      .toBeGreaterThan(0)
    const unfiltered = await readHook<FlightTotals>(page, 'flightTotals')
    // Badge shows flight legs (flightTotal), not RegNo rows after bin-pack.
    expect(unfiltered.unfilteredTotal).toBeGreaterThan(0)
    expect(unfiltered.unfilteredRegistrationTotal).toBeGreaterThan(0)
    await expect(badgeIn(flight, 'total')).toHaveText(String(unfiltered.unfilteredTotal))
    await expect(badgeIn(flight, 'filtered')).toHaveCount(0)
    // When the range has multi-leg registrations (or bin-pack splits), legs ≠ rows.
    // Soft proof when data allows; badge must still equal flightTotals.unfilteredTotal.

    // Apply a flight departure-airport filter → funnel badge with a real denominator.
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-tab-flight').click()
    await page.getByTestId('filter-flight-dep').fill('YEG')
    await page.getByTestId('filter-flight-dep').press('Enter') // commit the chip
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
    await waitGanttReady(page, 60_000)

    const totals = await pollTotals(page, 'flightTotals')
    expect(totals.total).toBeGreaterThan(0)
    expect(totals.unfilteredTotal).toBeGreaterThan(totals.total)
    await expect(badgeIn(flight, 'filtered')).toHaveText(`${totals.total}/${totals.unfilteredTotal}`)
    await expect(badgeIn(flight, 'total')).toHaveCount(0)
  })
})
