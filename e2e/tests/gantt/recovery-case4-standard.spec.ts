/** Real Case 4 interaction. Writes require the isolated fixture/reset gate. */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { rightClickFlight, rightClickPairingSeg, type FlightProbe, type PairingProbe } from '../../utils/pairing-build'
import { readHook, seedGanttAuth } from '../../utils/gantt-hook'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, '.local/case4/fixture.json'), 'utf8'))
const targetFile = path.join(root, '.local/case4/ui-target.json')
const targetId = (): number => JSON.parse(fs.readFileSync(targetFile, 'utf8')).pairingId
const shot = async (page: Page, name: string) => {
  const base = path.join(root, 'docs/assets/screenshots/crew-recovery', name)
  let version = 1
  while (fs.existsSync(`${base}-Ver${version}.png`)) version++
  await page.screenshot({ path: `${base}-Ver${version}.png` })
}

async function openLive(page: Page, request: APIRequestContext, pairingId?: number, wideRange = false) {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-live').click()
  const empty = page.getByTestId('live-empty-state')
  if (await empty.isVisible()) await empty.click()
  else await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByTestId('filter-crew-id').fill(fixture.crewIds.join(','))
  await page.getByTestId('filter-crew-id').press('Enter')
  if (pairingId) {
    await page.getByTestId('filter-tab-pairing').click()
    await page.getByTestId('filter-pairing-id').fill(String(pairingId))
    await page.getByTestId('filter-pairing-id').press('Enter')
  }
  await page.getByTestId('filter-tab-flight').click()
  await page.getByTestId('filter-flight-fltnum').fill('ET895')
  await page.getByTestId('filter-flight-fltnum').press('Enter')
  await page.getByTestId('filter-apply').click()
  if (wideRange) await expect(page.getByTitle('Select up to 6 roster periods (max span, for performance)')).toContainText('2026-08-25 ~ 2026-10-07')
  const dashboard = new GanttDashboardPage(page)
  await dashboard.addFlightPane()
  return dashboard
}

async function openPairingRecovery(page: Page, dashboard: GanttDashboardPage, id: number) {
  let segment: PairingProbe | undefined
  await expect.poll(async () => {
    segment = (await page.evaluate(id => window.__ganttTest.pairingVisibleSegments(2000, id), id)).find(s => s.pairingId === id)
    return Boolean(segment)
  }, { timeout: 60000 }).toBe(true)
  expect(await rightClickPairingSeg(page, dashboard.pairingCanvas, segment!)).toBe(true)
  await page.getByRole('button', { name: /Recovery — open seats/ }).click()
  await expect(page.getByTestId('recovery-pairing-options')).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Open rank' })).toBeEnabled({ timeout: 180000 })
}

test('Case 4 shared staffing standard across all three strategies', async ({ page, request }) => {
  const dashboard = await openLive(page, request, 152689)
  await openPairingRecovery(page, dashboard, 152689)
  const dialog = page.getByTestId('recovery-violation-dialog')
  await expect(dialog.getByRole('combobox', { name: 'Open rank' })).toHaveValue('CA')
  await expect(dialog.getByRole('button', { name: 'Find roster options', exact: true })).toHaveCount(0)
  await expect(dialog.getByTestId('recovery-crew-checkbox-C4002')).toBeVisible({ timeout: 180000 })
  // Rank changes discover automatically; switching back must refresh the CA set.
  await expect(dialog.getByRole('combobox', { name: 'Open rank' })).toBeEnabled({ timeout: 180000 })
  await dialog.getByRole('combobox', { name: 'Open rank' }).selectOption('FO')
  await expect(dialog.getByTestId('recovery-crew-checkbox-C4012')).toBeVisible({ timeout: 180000 })
  await expect(dialog.getByTestId('recovery-crew-checkbox-C4002')).toHaveCount(0)
  await expect(dialog.getByRole('combobox', { name: 'Open rank' })).toBeEnabled({ timeout: 180000 })
  await dialog.getByRole('combobox', { name: 'Open rank' }).selectOption('CA')
  await expect(dialog.getByTestId('recovery-crew-checkbox-C4002')).toBeVisible({ timeout: 180000 })
  await expect(dialog.getByTestId('recovery-crew-checkbox-C4012')).toHaveCount(0)
  const tree = dialog.getByTestId('recovery-plan-tree')
  await expect(tree.getByText('By cost tier', { exact: true })).toBeVisible()
  await expect(tree.getByTestId('recovery-cost-tier-free-standby')).toContainText('0.00', { timeout: 180000 })
  await expect(dialog.getByTestId('recovery-cost-button-standby-152689-CA-C4002').filter({ visible: true })).not.toContainText('Unpriced')
  await shot(page, 'case4-auto-discovery')
  await expect(tree.getByTestId('recovery-cost-tier-low-roster')).toContainText('410.00')
  await expect(tree.getByTestId('recovery-cost-tier-low-swap-duty')).toContainText('2,470.00')
  await expect(tree.getByTestId('recovery-plan-filter-standby')).toContainText('★')
  await shot(page, 'case4-by-cost-tier')
  for (const [method, groupId, crew] of [['Standby Crew','standby','C4002'],['Available Crew','roster','C4001'],['Move-up / Roster Transfer','swap-duty','C4009']]) {
    await tree.getByTestId(`recovery-cost-tier-${groupId === 'standby' ? 'free' : 'low'}-${groupId}`).click()
    const group = dialog.getByTestId(`recovery-options-${groupId}`)
    await expect(group.getByRole('tab', { name: /All/ })).toBeVisible()
    if (groupId === 'standby') {
      // A cost-tier leaf selects the method, not just its zero-cost candidates.
      await expect(group.getByTestId('recovery-crew-checkbox-C4006')).toBeAttached()
      await expect(group.getByTestId('recovery-cost-button-standby-152689-CA-C4006').filter({ visible: true })).toContainText('326.25')
    }
    await expect(group.getByText('Crew / option', { exact: true })).toBeVisible()
    await expect(group.getByText('Stability', { exact: true })).toBeVisible()
    const id = `${groupId === 'roster' ? 'available' : groupId === 'swap-duty' ? 'move-up' : 'standby'}-152689-CA-${crew}`
    const cost = group.getByTestId(`recovery-cost-button-${id}`).filter({ visible: true })
    await expect(cost).not.toContainText('Unpriced')
    await shot(page, `case4-standard-${groupId}-options`)
    await cost.click()
    const breakdown = page.getByTestId('recovery-cost-breakdown-dialog')
    await expect(breakdown).toBeVisible()
    await expect(breakdown).toContainText('GH')
    await shot(page, `case4-standard-${groupId}-cost`)
    await breakdown.getByRole('button', { name: 'Close', exact: true }).first().click()
    const row = group.locator('div.border-l-2').filter({ has: page.getByTestId(`recovery-preview-${id}`) })
    await row.getByTestId('recovery-detail').click()
    const detail = page.getByTestId('recovery-detail-dialog')
    await expect(detail).toContainText('Before / after complete Roster changes')
    await expect(detail).toContainText('ET895')
    await shot(page, `case4-standard-${groupId}-detail`)
    await detail.getByRole('button', { name: 'Close', exact: true }).first().click()
    await group.getByTestId(`recovery-preview-${id}`).click()
    await expect(page.getByTestId('recovery-preview-dock')).toContainText(crew, { timeout: 60000 })
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled({ timeout: 60000 })
    if (groupId === 'swap-duty') await expect(dialog).toContainText('Overall recovery: Partial')
    await shot(page, `case4-standard-${groupId}-preview`)
    await dialog.getByTestId('recovery-expand-options').click()
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
  expect(await readHook<unknown[]>(page, 'draftOps')).toEqual([])
})
