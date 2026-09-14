/**
 * Protected, read-only smoke for the three prepared recovery cases.
 *
 * This deliberately uses the real Filter dialog and a real canvas context-menu
 * event. The only test hook reads roster truth and computes puck geometry; it
 * never opens a menu, changes a store, or commits a draft. The suite is opt-in
 * because the fixtures are shared and may not be installed in every database.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

type RosterItem = { id: number; crewId: string; pairingId: number | null; start?: string }
type RosterProbe = {
  id: number; pairingId: number | null; crewId: string; x: number; y: number
}

const CASES = [
  { name: 'Case 1 · 1001 overlap', crew: 'J4002', pairing: 152056 },
  { name: 'Case 2 · 3007 delay', crew: 'T2001', pairing: 152675 },
  { name: 'Case 3 · 8004 fleet', crew: 'L3002', pairing: 152227 },
] as const

const enabled = process.env.RUN_CASES_1_3_READONLY === '1'

const rightClickRosterPuck = async (page: Page, canvas: Locator, item: RosterItem): Promise<void> => {
  const probe = await page.evaluate((id) => {
    const api = window.__ganttTest as unknown as { focusRosterItem: (n: number, readOnly?: boolean) => RosterProbe | null }
    return api.focusRosterItem(id, true)
  }, item.id)
  expect(probe, `roster item ${item.id} must be rendered`).not.toBeNull()
  const box = await canvas.boundingBox()
  expect(box, 'roster canvas must be visible').not.toBeNull()
  expect(probe!.x).toBeGreaterThanOrEqual(0)
  expect(probe!.x).toBeLessThan(box!.width - 4)
  expect(probe!.y).toBeGreaterThanOrEqual(0)
  expect(probe!.y).toBeLessThan(box!.height - 4)
  await canvas.click({ position: { x: probe!.x, y: probe!.y }, button: 'right' })
}

const loadFilteredCrew = async (page: Page, crew: string): Promise<void> => {
  await page.getByTestId('module-nav-live').click()
  const empty = page.getByTestId('live-empty-state')
  await expect(empty).toBeVisible({ timeout: 10_000 })
  await empty.click()
  const dialog = page.getByTestId('filter-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-crew-id').fill(crew)
  await page.getByTestId('filter-crew-id').press('Enter')
  await page.getByTestId('filter-apply').click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  await expect(empty).toBeHidden({ timeout: 270_000 })
}

for (const item of CASES) {
  test(`${item.name} — real UI opens costed recovery options (read-only)`, async ({ page, request }) => {
    test.skip(!enabled, 'opt-in: set RUN_CASES_1_3_READONLY=1')
    test.setTimeout(300_000)
    await seedGanttAuth(page, request)
    await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await loadFilteredCrew(page, item.crew)
    const roster = await readHook<RosterItem[]>(page, 'roster')
    const source = roster.find((row) => row.crewId === item.crew && Number(row.pairingId) === item.pairing)
    expect(source, `${item.crew}/${item.pairing} fixture must be loaded`).toBeTruthy()
    if (item.pairing === 152056) {
      // Case 1's supported prepared entry is Alert Center's recoverable
      // SL/FLY 1001 row. This avoids conflating the pink SL task hitbox with
      // the separate roster-puck context-menu path.
      await page.getByTestId('violations-button').first().click()
      const alerts = page.getByTestId('violation-list-dialog')
      await expect(alerts).toBeVisible({ timeout: 30_000 })
      const row = alerts.locator('[data-testid="violation-list-row"][data-crew-id="J4002"][data-rule-code="1001"]').first()
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(row).toHaveAttribute('data-recoverable', 'true')
      const checkbox = alerts.getByTestId('alert-recovery-checkbox-J4002-152056')
      await expect(checkbox).toBeVisible()
      await checkbox.check()
      await page.getByTestId('alert-recovery-selected').click()
    } else {
      const dashboard = new GanttDashboardPage(page)
      await rightClickRosterPuck(page, dashboard.rosterCanvas, source!)
      const menu = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery$/ }).first()
      await expect(menu).toBeVisible({ timeout: 30_000 })
      await menu.click({ force: true })
    }
    const recovery = page.getByTestId('recovery-violation-dialog')
    await expect(recovery).toBeVisible({ timeout: 30_000 })
    await expect(recovery.getByTestId('recovery-plan-filter-standby')).toBeVisible({ timeout: 60_000 })
    await recovery.getByTestId('recovery-plan-filter-standby').click()
    const executable = recovery.getByTestId('recovery-options-filter-standby-executable')
    await expect(executable).toBeVisible({ timeout: 60_000 })
    await executable.click()
    await expect(executable).toHaveAttribute('aria-selected', 'true')
    // The legacy Recovery dialog renders candidate rows as crew checkboxes;
    // the unpaired-flight workspace renders the newer staffing-option rows.
    // Accept either presentation, but only inspect it (never select it).
    const options = recovery.locator('[data-testid="recovery-staffing-option"], [data-testid^="recovery-crew-checkbox-"]')
    await expect(options.first()).toBeVisible({ timeout: 60_000 })
    // Each legacy row has a mobile and desktop cost button with the same
    // prefix; at this viewport the desktop copy is the last one in the DOM.
    const cost = recovery.locator('[data-testid^="recovery-cost-button-"]').last()
    await expect(cost).toBeVisible({ timeout: 30_000 })
    await expect(cost).toContainText(/US\$|\$|Unpriced/i)
    const shotDir = path.resolve(process.cwd(), '../docs/assets/screenshots/crew-recovery')
    mkdirSync(shotDir, { recursive: true })
    let version = 1
    while (existsSync(path.join(shotDir, `cases-1-3-readonly-${item.crew}-${item.pairing}-Ver${version}.png`))) version++
    await page.screenshot({ path: path.join(shotDir, `cases-1-3-readonly-${item.crew}-${item.pairing}-Ver${version}.png`), fullPage: false })
    // No Preview, Apply, Save, or draft/store mutation follows this point.
  })
}
