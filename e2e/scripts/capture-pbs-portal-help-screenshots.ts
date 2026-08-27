/**
 * PBS Portal Help screenshot capture script.
 *
 * Run with:
 *   cd e2e && npx tsx scripts/capture-pbs-portal-help-screenshots.ts
 *
 * Prerequisite:
 *   - pbs-portal dev server running on its Vite port (default http://localhost:3030/pbs)
 *
 * Output: pbs-portal/public/help/screenshots/*.png
 */
import { chromium, type Locator, type Page } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installHelpScreenshotMocks } from './pbs-portal-help-screenshot-mocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(REPO_ROOT, 'pbs-portal/public/help/screenshots')
const BASE_URL = (process.env.PBS_PORTAL_BASE_URL ?? 'http://localhost:3030/pbs').replace(/\/$/, '')

type ShotDefinition = {
  name: string
  route: string
  readySelector?: string
  selector?: string
  locate?: (page: Page) => Locator
  prepare?: (page: Page) => Promise<void>
}

const dialogSelector = (label: string) => `[role="dialog"][aria-label="${label}"]`

const openBidPropertyDialog = async (
  page: Page,
  categoryTab: 'DAYS OFF' | 'PAIRING' | 'ROSTER',
  propertyName: string,
  dialogLabel: string,
) => {
  await page.getByRole('tab', { name: categoryTab }).click()
  await page.getByPlaceholder('Search Bid Properties').fill(propertyName)
  await page.getByLabel(`Add ${propertyName}`).first().click()
  await page.waitForSelector(dialogSelector(dialogLabel), { timeout: 20_000 })
}

const bidPropertyDialogShot = (
  name: string,
  categoryTab: 'DAYS OFF' | 'PAIRING' | 'ROSTER',
  propertyName: string,
  dialogLabel: string,
  afterOpen?: (page: Page) => Promise<void>,
): ShotDefinition => ({
  name,
  route: 'bid',
  readySelector: '[data-testid="bid-available-properties"]',
  selector: dialogSelector(dialogLabel),
  prepare: async (page) => {
    await openBidPropertyDialog(page, categoryTab, propertyName, dialogLabel)
    await afterOpen?.(page)
  },
})

const openPairingPreferenceDialog = async (page: Page) => {
  await openBidPropertyDialog(page, 'PAIRING', 'Pairing Preference', 'Configure Pairing Preference')
  await page.waitForSelector('[data-testid="pairing-preference-results-scroll"] tbody tr', { timeout: 20_000 })
}

const openLimitToEventDateDialog = async (page: Page) => {
  await openBidPropertyDialog(
    page,
    'PAIRING',
    'Pairing Check-In / Check-Out Time',
    'Configure Pairing Check-In / Check-Out Time',
  )
}

const openLimitToFlightDateDialog = async (page: Page) => {
  await openBidPropertyDialog(
    page,
    'PAIRING',
    'Flight Number Preference',
    'Configure Flight Number Preference',
  )
}

const openLimitToPairingStartDateDialog = async (page: Page) => {
  await openBidPropertyDialog(
    page,
    'PAIRING',
    'Pairing Length',
    'Configure Pairing Length',
  )
}

const locatePairingSearchControls = (page: Page) =>
  page.getByLabel('Search pairings').locator('xpath=ancestor::div[contains(@class,"grid")][1]')

const locatePairingPicker = (page: Page) =>
  page.getByLabel('Search pairings').locator(
    'xpath=ancestor::div[contains(@class,"overflow-hidden") and contains(@class,"rounded-xl")][1]',
  )

const locateEventDateScope = (page: Page) =>
  page.getByRole('switch', { name: 'Pairing Check-In / Check-Out Time limit to event date' }).locator(
    'xpath=ancestor::section[1]',
  )

const locateFlightDateScope = (page: Page) =>
  page.getByText('LIMIT TO FLIGHT DATE').locator('xpath=ancestor::section[1]')

const locatePairingStartDateScope = (page: Page) =>
  page.getByText('LIMIT TO PAIRING START DATE').locator('xpath=ancestor::section[1]')

const shots: ShotDefinition[] = [
  {
    name: 'dashboard-overview',
    route: 'dashboard',
    readySelector: '[data-uiid="dashboard-schedule-panel"], [data-testid="dashboard-schedule-panel-error"]',
    selector: '[data-testid="dashboard-layout"]',
  },
  { name: 'bid-overview', route: 'bid', selector: '[data-testid="bid-page"]' },
  {
    name: 'bid-calendar',
    route: 'bid',
    readySelector: '[data-testid="bidding-calendar-content-region"]',
    selector: '[data-testid="shared-bidding-calendar-content"]',
  },
  {
    name: 'bid-conditions-entry',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    selector: '[data-testid="bid-available-properties"]',
    prepare: async (page) => {
      await page.getByRole('tab', { name: 'PAIRING' }).click()
      await page.waitForSelector('[data-testid="pairing-available-property-row"], [data-testid="rule-bid-available-row"]', { timeout: 20_000 })
      await page.locator('[data-testid="bid-available-properties"]').evaluate((node) => {
        const element = node as HTMLElement
        element.style.flex = '0 0 auto'
        element.style.height = '360px'
        element.style.maxHeight = '360px'
      })
    },
  },
  {
    name: 'bid-conditions-days-off-calendar-entry',
    route: 'bid',
    readySelector: '[data-testid="bidding-calendar-content-region"]',
    selector: '[data-testid="schedule-action-popover"]',
    prepare: async (page) => {
      await page.evaluate(() => window.sessionStorage.setItem('pbs.bid.calendar-date-mode', 'days-off'))
      await page.getByLabel('Add bid for 2026-06-10').click()
      await page.waitForSelector('[data-testid="schedule-action-popover"]', { timeout: 20_000 })
    },
  },
  {
    name: 'bid-conditions-pairing-calendar-entry',
    route: 'bid',
    readySelector: '[data-testid="bidding-calendar-content-region"]',
    selector: '[role="dialog"][aria-labelledby="pairing-bid-detail-title"]',
    prepare: async (page) => {
      await page.getByLabel('View pairing bid M4959').click()
      await page.waitForSelector('[role="dialog"][aria-labelledby="pairing-bid-detail-title"]', { timeout: 20_000 })
      await page.waitForSelector('[data-testid="pairing-bid-summary-grid"]', { timeout: 20_000 })
    },
  },
  bidPropertyDialogShot(
    'bid-condition-prefer-off-dialog',
    'DAYS OFF',
    'Prefer Off',
    'Configure Prefer Off',
  ),
  {
    name: 'bid-condition-days-off-date-type-controls',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: (page) => page.getByText('PREFER OFF TYPE').locator('xpath=ancestor::section[1]'),
    prepare: async (page) => {
      await openBidPropertyDialog(page, 'DAYS OFF', 'Prefer Off', 'Configure Prefer Off')
    },
  },
  bidPropertyDialogShot(
    'bid-condition-long-stretch-off-dialog',
    'DAYS OFF',
    'Long Stretch Off / Compressed Flying',
    'Configure Long Stretch Off / Compressed Flying',
  ),
  bidPropertyDialogShot(
    'bid-condition-pairing-preference-dialog',
    'PAIRING',
    'Pairing Preference',
    'Configure Pairing Preference',
    async (page) => {
      await page.waitForSelector('[data-testid="pairing-preference-results-scroll"] tbody tr', { timeout: 20_000 })
    },
  ),
  {
    name: 'bid-condition-pairing-preference-search-controls',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locatePairingSearchControls,
    prepare: openPairingPreferenceDialog,
  },
  {
    name: 'bid-condition-pairing-preference-filters-dialog',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    selector: '[data-testid="pairing-preference-filter-dialog"]',
    prepare: async (page) => {
      await openPairingPreferenceDialog(page)
      await page.getByRole('button', { name: 'Filters' }).click()
      await page.waitForSelector('[data-testid="pairing-preference-filter-dialog"]', { timeout: 20_000 })
    },
  },
  {
    name: 'bid-condition-pairing-preference-selection-controls',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locatePairingPicker,
    prepare: async (page) => {
      await openPairingPreferenceDialog(page)
      await page.getByLabel('Select pairing T4501').check()
      await page.waitForSelector('text=Selected', { timeout: 20_000 })
    },
  },
  bidPropertyDialogShot(
    'bid-condition-check-in-check-out-time-dialog',
    'PAIRING',
    'Pairing Check-In / Check-Out Time',
    'Configure Pairing Check-In / Check-Out Time',
  ),
  {
    name: 'bid-condition-limit-to-event-date-off',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locateEventDateScope,
    prepare: openLimitToEventDateDialog,
  },
  {
    name: 'bid-condition-limit-to-event-date-on',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locateEventDateScope,
    prepare: async (page) => {
      await openLimitToEventDateDialog(page)
      await page.getByRole('switch', { name: 'Pairing Check-In / Check-Out Time limit to event date' }).click()
      await page.getByRole('button', { name: 'Specific Dates' }).waitFor({ state: 'visible', timeout: 20_000 })
    },
  },
  {
    name: 'bid-condition-limit-to-flight-date-on',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locateFlightDateScope,
    prepare: async (page) => {
      await openLimitToFlightDateDialog(page)
      await page.getByRole('switch', { name: 'LIMIT TO FLIGHT DATE' }).click()
      await page.getByRole('button', { name: 'Specific Dates' }).waitFor({ state: 'visible', timeout: 20_000 })
    },
  },
  bidPropertyDialogShot(
    'bid-condition-flight-legs-per-duty-dialog',
    'PAIRING',
    'Flight Legs per Duty',
    'Configure Flight Legs per Duty',
  ),
  bidPropertyDialogShot(
    'bid-condition-work-day-preference-dialog',
    'PAIRING',
    'Work Day Preference',
    'Configure Work Day Preference',
  ),
  {
    name: 'bid-condition-work-day-weekday-controls',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: (page) => page.getByText('WORK DAYS & CHECK-IN WINDOW').locator('xpath=ancestor::section[1]'),
    prepare: async (page) => {
      await openBidPropertyDialog(page, 'PAIRING', 'Work Day Preference', 'Configure Work Day Preference')
      await page
        .getByText('WORK DAYS & CHECK-IN WINDOW')
        .locator('xpath=ancestor::section[1]')
        .getByRole('button', { name: 'Mon' })
        .click()
    },
  },
  bidPropertyDialogShot(
    'bid-condition-pairing-length-dialog',
    'PAIRING',
    'Pairing Length',
    'Configure Pairing Length',
  ),
  {
    name: 'bid-condition-limit-to-pairing-start-date-on',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: locatePairingStartDateScope,
    prepare: async (page) => {
      await openLimitToPairingStartDateDialog(page)
      await page.getByRole('switch', { name: 'LIMIT TO PAIRING START DATE' }).click()
      await page.getByRole('button', { name: 'Specific Dates' }).waitFor({ state: 'visible', timeout: 20_000 })
    },
  },
  bidPropertyDialogShot(
    'bid-condition-flight-number-preference-dialog',
    'PAIRING',
    'Flight Number Preference',
    'Configure Flight Number Preference',
  ),
  bidPropertyDialogShot(
    'bid-condition-redeye-preference-dialog',
    'PAIRING',
    'Redeye Preference',
    'Configure Redeye Preference',
  ),
  bidPropertyDialogShot(
    'bid-condition-deadhead-flying-dialog',
    'PAIRING',
    'Deadhead Flying',
    'Configure Deadhead Flying',
  ),
  bidPropertyDialogShot(
    'bid-condition-time-between-flights-dialog',
    'PAIRING',
    'Time Between Flights',
    'Configure Time Between Flights',
  ),
  bidPropertyDialogShot(
    'bid-condition-month-end-carryover-dialog',
    'PAIRING',
    'Month-End Carryover',
    'Configure Month-End Carryover',
  ),
  bidPropertyDialogShot(
    'bid-condition-airport-preference-dialog',
    'PAIRING',
    'Airport Preference',
    'Configure Airport Preference',
  ),
  bidPropertyDialogShot(
    'bid-condition-efficient-flying-first-dialog',
    'PAIRING',
    'Efficient Flying First',
    'Configure Efficient Flying First',
  ),
  bidPropertyDialogShot(
    'bid-condition-minimum-base-layover-dialog',
    'ROSTER',
    'Minimum Base Layover',
    'Configure Minimum Base Layover',
  ),
  bidPropertyDialogShot(
    'bid-condition-commuter-pattern-dialog',
    'ROSTER',
    'Commuter Pattern',
    'Configure Commuter Pattern',
  ),
  bidPropertyDialogShot(
    'bid-condition-mixed-line-bid-dialog',
    'ROSTER',
    'Mixed Line Bid',
    'Configure Mixed Line Bid',
  ),
  bidPropertyDialogShot(
    'bid-condition-credit-window-preference-dialog',
    'ROSTER',
    'Credit Window Preference',
    'Configure Credit Window Preference',
  ),
  {
    name: 'bid-condition-reserve-preference-dialog',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    selector: dialogSelector('Configure Reserve Preference'),
    prepare: async (page) => {
      await openBidPropertyDialog(page, 'ROSTER', 'Reserve Preference', 'Configure Reserve Preference')
    },
  },
  {
    name: 'bid-condition-reserve-date-scope',
    route: 'bid',
    readySelector: '[data-testid="bid-available-properties"]',
    locate: (page) => page.getByText('DATE SCOPE').locator('xpath=ancestor::section[1]'),
    prepare: async (page) => {
      await openBidPropertyDialog(page, 'ROSTER', 'Reserve Preference', 'Configure Reserve Preference')
      await page.getByLabel('Reserve Preference date scope').selectOption('specific_dates')
    },
  },
  { name: 'standing-bid-overview', route: 'standing-bid', selector: '[data-uiid="rule-bid-right-panel"]' },
  { name: 'award-overview', route: 'award', selector: '[data-testid="award-results-page"]' },
]

await fs.mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

let captured = 0
let skipped = 0

const shoot = async (name: string, target: Locator | Page) => {
  const dest = path.join(OUT_DIR, `${name}.png`)
  await target.screenshot({ path: dest })
  captured += 1
  console.log(`✓  ${name}.png`)
}

const tryShoot = async (
  name: string,
  route: string,
  selector?: string,
  readySelector?: string,
  prepare?: (page: Page) => Promise<void>,
  locate?: (page: Page) => Locator,
) => {
  try {
    await page.goto(`${BASE_URL}/${route}`)
    await page.waitForSelector('[data-testid="dashboard-top-nav"]', { timeout: 30_000 })
    if (readySelector) {
      await page.waitForSelector(readySelector, { timeout: 30_000 })
    }
    if (prepare) {
      await prepare(page)
    }
    const target = locate ? locate(page).first() : page.locator(selector ?? '').first()
    await target.waitFor({ state: 'visible', timeout: 20_000 })
    await page.waitForTimeout(800)
    await shoot(name, target)
  } catch (error) {
    skipped += 1
    console.warn(`✗  ${name} — skipped: ${(error as Error).message.split('\n')[0]}`)
  }
}

try {
  await installHelpScreenshotMocks(page)

  for (const shot of shots) {
    await tryShoot(shot.name, shot.route, shot.selector, shot.readySelector, shot.prepare, shot.locate)
  }
} finally {
  await browser.close()
}

console.log(`Done. Captured ${captured}; skipped ${skipped}.`)

if (captured !== shots.length) {
  process.exitCode = 1
}
