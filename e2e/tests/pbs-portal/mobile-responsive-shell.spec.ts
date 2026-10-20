import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PHONE_VIEWPORT = { width: 390, height: 844 }
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotPath = (fileName: string) =>
  path.join(__dirname, '../../../docs/assets/screenshots/pbs-portal', fileName)

const mockSession = {
  user: {
    id: 'pbs-mobile-user',
    name: 'Mobile Crew',
    employeeNo: '762',
  },
  authMode: 'password',
}

const mockAwardCurrent = {
  rosterPeriodId: 75,
  periodCode: 'Jun 2026',
  published: true,
  availability: 'AVAILABLE',
  lifecycleStage: 'FINAL',
  rpStart: '2026-06-01',
  rpEnd: '2026-06-30',
  timeZone: {
    base: 'YEG',
    zoneId: 'America/Edmonton',
    timezoneLabel: 'YEG Local Time',
    fallback: false,
  },
  summary: {
    tier: 'T6',
    offDays: 14,
    creditMinutes: 5507,
    premiumMinutes: 4230,
    pairingCount: 18,
    activityCount: 0,
    warnings: [],
  },
  calendar: {
    monthLabel: 'JUN 2026',
    weekdayLabels: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    events: [],
  },
  items: [],
  reasonReport: {
    available: false,
    disabledReason: 'No award explanations are available for this period.',
    items: [],
  },
}

const mockAuthenticatedMobileAward = async (page: Page) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pbs-portal.auth.token', 'mobile-test-token')
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: mockSession, message: 'OK' },
    })
  })

  await page.route('**/api/award/current', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: mockAwardCurrent, message: 'OK' },
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
            lifecycleStage: 'FINAL',
          }],
        },
        message: 'OK',
      },
    })
  })
}

const mockAuthenticatedMobileBidWithOfflineData = async (page: Page) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pbs-portal.auth.token', 'mobile-test-token')
  })

  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/api/auth/session')) {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: mockSession, message: 'OK' },
      })
      return
    }

    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      json: { code: 500, data: null, message: 'Mobile layout test offline data' },
    })
  })
}

const expectNoPageOverflow = async (page: Page) => {
  const hasOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1)

  expect(hasOverflow).toBe(false)
}

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PBS Portal mobile shell', () => {
  test('PBS-MOBILE-001 — login form fits a phone viewport', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto('login')

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    const formBox = await page.locator('#pbs-portal-login-form').boundingBox()

    expect(formBox).not.toBeNull()
    expect(formBox!.x).toBeGreaterThanOrEqual(0)
    expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width)
    await expectNoPageOverflow(page)

    await page.screenshot({
      path: screenshotPath('mobile-responsive-login-Ver1.png'),
      fullPage: true,
    })
  })

  test('PBS-MOBILE-002 — Award stacks vertically and the mobile drawer reaches Help', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await mockAuthenticatedMobileAward(page)
    await page.goto('award')

    const topNav = page.getByTestId('dashboard-top-nav')
    await expect(topNav).toHaveAttribute('data-mobile-nav', 'true')
    await expect(page.getByTestId('award-page-viewport')).toHaveAttribute('data-layout-mode', 'mobile')
    await expect(page.getByTestId('award-page-canvas')).not.toHaveAttribute('style', /scale/)
    await expect(page.getByText('JUN 2026 Award Calendar')).toBeVisible()
    await expect(page.getByLabel('Award summary')).toContainText('Credit Hours')

    const calendarBox = await page.getByTestId('award-month-calendar').boundingBox()
    const sidePanelBox = await page.getByTestId('award-side-panel').boundingBox()

    expect(calendarBox).not.toBeNull()
    expect(sidePanelBox).not.toBeNull()
    expect(sidePanelBox!.y).toBeGreaterThan(calendarBox!.y + calendarBox!.height - 1)
    await expectNoPageOverflow(page)

    await page.screenshot({
      path: screenshotPath('mobile-responsive-award-Ver1.png'),
      fullPage: true,
    })

    await page.getByTestId('mobile-nav-trigger').click()
    const drawer = page.getByTestId('mobile-nav-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Help' })).toBeVisible()

    await drawer.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('heading', { name: 'Log out of ROIS Crew?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByTestId('mobile-nav-trigger').click()
    const reopenedDrawer = page.getByTestId('mobile-nav-drawer')
    await expect(reopenedDrawer).toBeVisible()

    await reopenedDrawer.getByRole('link', { name: 'Help' }).click()
    await expect(page).toHaveURL(/\/help$/)
    await expect(page.getByTestId('mobile-nav-drawer')).toHaveCount(0)
    await expect(page.getByTestId('help-page')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Help Center' })).toBeVisible()
    await expectNoPageOverflow(page)

    await page.screenshot({
      path: screenshotPath('mobile-responsive-help-Ver1.png'),
      fullPage: true,
    })
  })

  test('PBS-MOBILE-003 — Bid workbench keeps the calendar behind a phone toggle', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await mockAuthenticatedMobileBidWithOfflineData(page)
    await page.goto('bid')

    await expect(page.getByTestId('dashboard-top-nav')).toHaveAttribute('data-mobile-nav', 'true')
    await expect(page.getByTestId('bid-page-error')).toContainText('Unable to load the current bid.')

    const calendarToggle = page.getByTestId('mobile-bidding-calendar-toggle')
    await expect(calendarToggle).toBeVisible()
    await expect(calendarToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('Unable to load the current bidding calendar.')).toHaveCount(0)

    await calendarToggle.click()

    await expect(calendarToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Unable to load the current bidding calendar.')).toBeVisible()
    await expectNoPageOverflow(page)

    await page.screenshot({
      path: screenshotPath('mobile-responsive-bid-Ver1.png'),
      fullPage: true,
    })
  })

  test('PBS-MOBILE-004 — Dashboard stacks the calendar above profile details', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await mockAuthenticatedMobileBidWithOfflineData(page)
    await page.goto('dashboard')

    const layout = page.getByTestId('dashboard-layout')
    await expect(layout).toBeVisible()
    await expect(page.getByTestId('dashboard-schedule-panel-error')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mobile Crew' })).toBeVisible()
    await expectNoPageOverflow(page)

    const layoutBox = await layout.boundingBox()
    const calendarBox = await page.getByTestId('dashboard-schedule-panel-error').boundingBox()
    const profileBox = await page.getByRole('heading', { name: 'Mobile Crew' }).boundingBox()

    expect(layoutBox).not.toBeNull()
    expect(calendarBox).not.toBeNull()
    expect(profileBox).not.toBeNull()
    expect(calendarBox!.y).toBeLessThan(profileBox!.y)
    expect(calendarBox!.width).toBeGreaterThan(layoutBox!.width - 2)

    await page.screenshot({
      path: screenshotPath('mobile-responsive-dashboard-Ver1.png'),
      fullPage: true,
    })
  })
})
