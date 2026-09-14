/**
 * Pop-up standard (2026-09-13) — the restyled AppDialog chrome in the real gantt.
 *
 * The standard's status-card anatomy is applied by `@rois/ui` AppDialog, so every
 * pop-up inherits it. This spec opens a real data dialog (Live roster pane →
 * Crew Absence) as an admin and asserts the user-visible chrome:
 *   - the tone band with its outline circle glyph (data-app-dialog-header)
 *   - the circular close disc that straddles the top-right corner
 *   - the pill action row inside the body (no footer bar)
 *
 * Read-only: it queries the absence list and captures a screenshot. No write
 * fixture is created, so shared SIT data is untouched.
 */
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')

const nextVersioned = (base: string): string => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let version = 1
  while (existsSync(path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`))) version++
  return path.join(SCREENSHOT_DIR, `${base}-Ver${version}.png`)
}

test('AppDialog renders the status-card chrome (tone band, circle glyph, close disc, pill actions)', async ({ page, request }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedGanttAuth(page, request)
  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto(150_000)
  await setDateRange(page, '2026-09-01', '2026-09-30')

  // A real data pop-up, opened the way an admin opens it.
  await page.getByTestId('crew-absence-button').first().click()
  const dialog = page.getByTestId('crew-absence-dialog')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(dialog).toContainText('Crew Absence')

  // 1. Tone band + outline circle glyph.
  const band = dialog.locator('[data-app-dialog-header]')
  await expect(band).toBeVisible()
  await expect(band.locator('span.rounded-full').first()).toBeVisible()

  // 2. Circular close disc straddling the corner (outside the clipped card body).
  const closeDisc = dialog.getByTestId('crew-absence-dialog-close')
  await expect(closeDisc).toBeVisible()
  const discBox = await closeDisc.boundingBox()
  const cardBox = await dialog.boundingBox()
  expect(discBox, 'close disc has a box').not.toBeNull()
  expect(cardBox, 'dialog has a box').not.toBeNull()
  // Straddling: the disc's centre sits on the card's right edge, so half of it
  // hangs outside — the reference's overhanging close button.
  expect(discBox!.x + discBox!.width / 2).toBeGreaterThan(cardBox!.x + cardBox!.width - 2)
  expect(discBox!.x + discBox!.width).toBeGreaterThan(cardBox!.x + cardBox!.width)

  // 3. Actions are a pill row in the body — no separate footer bar.
  const actions = dialog.locator('[data-app-dialog-actions]')
  await expect(actions).toBeVisible()
  const closeAction = actions.getByRole('button', { name: 'Close' })
  await expect(closeAction).toBeVisible()
  const radius = await closeAction.evaluate((el) => getComputedStyle(el).borderRadius)
  // rounded-full on a ~32px-high button resolves to half its height.
  expect(parseFloat(radius)).toBeGreaterThanOrEqual(14)

  await page.screenshot({ path: nextVersioned('app-dialog-standard'), fullPage: true })

  // The pop-up still closes from the disc (behaviour kept by the restyle).
  await closeDisc.click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
})
