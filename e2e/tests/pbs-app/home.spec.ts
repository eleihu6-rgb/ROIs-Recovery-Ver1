/**
 * PBS App Home Screen Tests.
 *
 * Tests for the PBS App (mobile) view.
 * Auth is inherited from the shared pbs-setup.
 */
import { test, expect } from '@playwright/test'
import { PbsAppPage } from '../../pages/pbs-app/pbs-app-page'

test.describe('PBS App', () => {
  let appPage: PbsAppPage

  test.beforeEach(async ({ page }) => {
    appPage = new PbsAppPage(page)
  })

  test('PBS-3001 — should load the app home screen @smoke', async ({ page }) => {
    await appPage.goto()
    await appPage.expectLoaded()
  })

  test('PBS-3002 — should navigate to schedule screen', async ({ page }) => {
    await appPage.goto()
    await appPage.expectLoaded()
    await appPage.navigateToSchedule()

    await expect(appPage.scheduleScreen).toBeVisible()
  })
})
