/**
 * Gantt Scenario detail-panel — compact RP Date and Birthday date inputs.
 *
 * Regression guards:
 *  - RP Date should stay on one row when there is enough room, while the
 *    flex-wrap layout can still wrap gracefully in narrower containers.
 *  - Birthday empty date inputs should show only the placeholder label and open
 *    the native picker action immediately when clicked.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedScenarioListMocks } from '../../utils/gantt-hook'

const SCENARIO_ID = 6
const SCENARIO_NAME = 'RO-2026-03 Mar Full Assignment'

const AUTH_STATE = {
  user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
  token: 'mock-token',
}

const ok = (data: unknown): string => JSON.stringify({ code: 200, data, message: 'ok' })

test.describe('Scenario — compact detail date inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      window.sessionStorage.setItem('rois-auth', JSON.stringify(auth))
      const win = window as typeof window & { __datePickerShown?: number }
      win.__datePickerShown = 0
      const proto = HTMLInputElement.prototype as typeof HTMLInputElement.prototype & {
        showPicker?: () => void
      }
      proto.showPicker = function showPickerMock(this: HTMLInputElement): void {
        win.__datePickerShown = (win.__datePickerShown ?? 0) + 1
      }
    }, AUTH_STATE)

    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)

    await page.route('**/altair/live/api/roster-periods', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ok({
          maxPeriods: 3,
          items: [
            { id: 6, rosterPeriod: '2026RP06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: false },
            { id: 7, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: true },
            { id: 8, rosterPeriod: '2026RP08', name: '2026-08', rpStart: '2026-08-01', rpEnd: '2026-08-31', isCurrent: false },
          ],
        }),
      }))

    await page.route('**/altair/live/api/division', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ok([
          { id: 1, division: 'P', description: 'Pilot' },
          { id: 2, division: 'C', description: 'Cabin' },
        ]),
      }))

    await page.route('**/altair/live/api/base', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ok([]) }))
    await page.route('**/altair/live/api/rank', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ok([]) }))
    await page.route('**/altair/live/api/fleet', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ok([]) }))
    await page.route('**/altair/live/api/pairing/types', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ok([]) }))
    await page.route('**/altair/live/api/pairing/assignment-groups', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: ok([]) }))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
  })

  test('Scen-2012 — RP Date uses one row at standard width and empty Birthday inputs open the picker immediately', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    const rpRect = await scenario.rpPeriod.boundingBox()
    const startRect = await scenario.startDate.boundingBox()
    const endRect = await scenario.endDate.boundingBox()
    expect(rpRect).not.toBeNull()
    expect(startRect).not.toBeNull()
    expect(endRect).not.toBeNull()
    if (!rpRect || !startRect || !endRect) throw new Error('missing RP Date boxes')

    expect(Math.abs(startRect.y - rpRect.y), 'RP Date start field should align with the period selector').toBeLessThan(12)
    expect(Math.abs(endRect.y - rpRect.y), 'RP Date end field should align with the period selector').toBeLessThan(12)

    const birthdayFrom = page.getByTestId('scenario-crew-birthday-from')
    const birthdayFromPlaceholder = page.getByTestId('scenario-crew-birthday-from-placeholder')
    await expect(birthdayFrom).toHaveValue('')
    await birthdayFromPlaceholder.click()
    await expect.poll(
      () => page.evaluate(() => (window as typeof window & { __datePickerShown?: number }).__datePickerShown ?? 0),
      { timeout: 5_000 },
    ).toBe(1)
  })
})
