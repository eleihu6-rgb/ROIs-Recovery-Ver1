/**
 * Live TimezoneSwitcher — full-row click targets for UTC and bases.
 *
 * Regression: the custom absolute dropdown sat under the h-9 Live toolbar
 * stacking/overflow context, so only a thin top strip of the UTC row received
 * pointer events. Users had to hunt for a tiny clickable sliver to switch back
 * to UTC. The menu is now a portaled DropdownMenuContent with full-row items.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Live TimezoneSwitcher hit targets', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    // Start on a non-UTC base so selecting UTC is a real switch.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'gantt-timezone',
        JSON.stringify({ timezone: 'America/Edmonton', timezoneAirport: 'YEG' }),
      )
    })
  })

  test('Live-TZ-01 — UTC row is fully clickable and switches display timezone', async ({ page }) => {
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
      timeout: 30_000,
    })
    await page.getByTestId('module-nav-live').click()

    const trigger = page.getByTestId('timezone-switcher')
    await expect(trigger).toBeVisible()
    await expect(trigger).toContainText('YEG')

    await trigger.click()
    const menu = page.getByTestId('timezone-menu')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Display Timezone')

    const utcOption = page.getByTestId('timezone-option-UTC')
    await expect(utcOption).toBeVisible()

    // Full row must be a real hit target — not a 1–2px sliver under the toolbar.
    const box = await utcOption.boundingBox()
    expect(box, 'UTC option has a layout box').not.toBeNull()
    expect(box!.height, 'UTC option height').toBeGreaterThanOrEqual(28)
    expect(box!.width, 'UTC option width').toBeGreaterThanOrEqual(200)

    // Click near the vertical center of the row (where the old clipped menu failed).
    await utcOption.click({ position: { x: Math.floor(box!.width / 2), y: Math.floor(box!.height / 2) } })

    await expect(menu).toBeHidden()
    await expect(trigger).toContainText('UTC')

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('gantt-timezone')
      return raw ? (JSON.parse(raw) as { timezone: string; timezoneAirport: string }) : null
    })
    expect(stored).toEqual({ timezone: 'UTC', timezoneAirport: 'UTC' })

    const hookTz = await page.evaluate(() => window.__ganttTest!.timezone())
    expect(hookTz).toEqual({ timezone: 'UTC', timezoneAirport: 'UTC' })
  })
})
