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

async function searchPairings(page: Page, dashboard: GanttDashboardPage, anchorId = fixture.anchorFlightId, from = '2026-09-17', to = '2026-09-25', screenshot = 'case4-pairing-options') {
  let probe: FlightProbe | null = null
  await expect.poll(async () => {
    probe = await page.evaluate(id => window.__ganttTest.flightProbe(id), anchorId)
    return probe?.id
  }, { timeout: 60000 }).toBe(anchorId)
  await rightClickFlight(page, dashboard.flightCanvas, probe!)
  await page.getByRole('button', { name: 'Recovery', exact: true }).click()
  const options = page.getByTestId('recovery-pairing-options')
  await expect(options).toBeVisible({ timeout: 45000 })
  await options.getByLabel('From', { exact: true }).fill(from)
  await options.getByLabel('To', { exact: true }).fill(to)
  await options.getByTestId('recovery-pairing-search').click()
  await expect(options.getByText('Anchor included').first()).toBeVisible({ timeout: 60000 })
  await expect.poll(() => options.locator('button').filter({ hasText: 'Anchor included' }).count()).toBeGreaterThan(1)
  await expect(options.getByRole('img', { name: /Selected recovery rotation timeline/ })).toBeVisible()
  await expect(options.getByTestId('rt-preview')).toContainText('ADD → BJM → ADD')
  await expect(page.getByRole('button', { name: 'Build pairing (Save)', exact: true })).toBeEnabled()
  await shot(page, screenshot)
  return options
}

test('Case 4 read-only pairing alternatives and chart', async ({ page, request }) => {
  await searchPairings(page, await openLive(page, request))
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  expect(await readHook<unknown[]>(page, 'draftOps')).toEqual([])
  await expect(page.getByTestId('draft-save-btn')).toBeDisabled()
  await shot(page, 'case4-restored-initial')
})

test('Case 4 Sep19 wide-scope read-only pairing alternatives', async ({ page, request }) => {
  const options = await searchPairings(page, await openLive(page, request, undefined, true),
    159575, '2026-08-25', '2026-10-07', 'case4-sep19-wide-scope')
  await expect(options.getByLabel('From', { exact: true })).toHaveValue('2026-08-25')
  await expect(options.getByLabel('To', { exact: true })).toHaveValue('2026-10-07')
  await expect(options.getByTestId('rt-preview')).toContainText('ET895')
  await expect(options).toContainText('2026-09-19')
  await options.locator('button').filter({ hasText: 'Anchor included' }).last().click()
  await expect(options.getByTestId('recovery-chart-duty')).toHaveCount(2)
  await expect(options.getByTestId('recovery-chart-flight')).toHaveCount(2)
  await expect(options.getByTestId('recovery-chart-flight').first()).toContainText('ET895')
  await expect(options.getByTestId('recovery-chart-layover')).toContainText('Layover at BJM')
  await expect(options).toContainText('Independent time scale per duty')
  await expect(page.getByRole('navigation', { name: 'Recovery strategies' })).toContainText('Recovery methods')
  const build = page.getByRole('button', { name: 'Build pairing (Save)', exact: true })
  await expect(build).toBeInViewport()
  await expect(build).toBeEnabled()
  // AppDialog intentionally places its close icon outside the shell edge.
  expect(await options.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  for (const row of await options.getByTestId('recovery-chart-flight').all()) {
    expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  }
  await shot(page, 'case4-sep19-long-layover-layout')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  expect(await readHook<unknown[]>(page, 'draftOps')).toEqual([])
  await expect(page.getByTestId('draft-save-btn')).toBeDisabled()
})

test('Case 4 Build saves pairing at row 1 and reopen skips pairing options', async ({ page, request }) => {
  test.skip(process.env.CASE4_RUN_WRITES !== '1', 'Requires approved isolated fixture/reset')
  const dashboard = await openLive(page, request)
  const options = await searchPairings(page, dashboard)
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/pairing/roundtrip/build') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Build pairing (Save)', exact: true }).click()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  const receipt = (await response.json()).data
  fs.writeFileSync(targetFile, JSON.stringify(receipt))
  await expect(options).not.toBeVisible()
  await expect(page.getByText('Saved pairing · fill missing seats only · loaded Live crew and roster scope')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect.poll(async () => Number((await readHook<Array<{id:string}>>(page, 'pairingPanelOrder'))[0]?.id)).toBe(receipt.pairingId)
  await openPairingRecovery(page, dashboard, receipt.pairingId)
  await shot(page, 'case4-saved-open-pairing')
})

const methods = [
  { label: 'Standby Crew', crews: ['C4002', 'C4018'] },
  { label: 'Available Crew', crews: ['C4001', 'C4011'] },
  { label: 'Move-up / Roster Transfer', crews: ['C4009', 'C4019'] },
]
for (const method of methods) {
  test(`Case 4 ${method.label} Preview Apply Save both ranks`, async ({ page, request }) => {
    test.skip(process.env.CASE4_RUN_WRITES !== '1', 'Requires approved isolated fixture/reset')
    const id = targetId()
    const dashboard = await openLive(page, request, id)
    for (const [index, crewId] of method.crews.entries()) {
      await openPairingRecovery(page, dashboard, id)
      const dialog = page.getByTestId('recovery-violation-dialog')
      await dialog.getByRole('combobox', { name: 'Open rank' }).selectOption(index === 0 ? 'CA' : 'FO')
      await dialog.getByRole('button', { name: method.label, exact: true }).click()
      await expect(dialog.getByRole('button', { name: 'Find roster options', exact: true })).toHaveCount(0)
      const candidate = dialog.getByTestId(`recovery-crew-checkbox-${crewId}`)
      await expect(candidate).toBeVisible({ timeout: 180000 })
      await expect(candidate).toBeEnabled({ timeout: 180000 })
      await candidate.check()
      await dialog.getByRole('button', { name: /Cost breakdown/ }).click()
      const costs = page.getByTestId('recovery-cost-breakdown-dialog')
      await expect(costs).toBeVisible()
      await shot(page, `case4-${crewId}-cost`)
      await costs.getByRole('button', { name: 'Close', exact: true }).first().click()
      await dialog.getByRole('button', { name: 'Preview', exact: true }).last().click()
      await expect(dialog.getByTestId('recovery-preview-dock')).toBeVisible({ timeout: 60000 })
      if (method.label.startsWith('Move-up')) await expect(dialog.getByText(/Overall recovery: Partial/)).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled({ timeout: 60000 })
      await shot(page, `case4-${crewId}-preview`)
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(dialog).not.toBeVisible({ timeout: 60000 })
      expect((await readHook<unknown[]>(page, 'draftOps')).length).toBeGreaterThan(0)
      await page.getByTestId('draft-save-btn').click()
      await expect.poll(async () => (await readHook<unknown[]>(page, 'draftOps')).length, { timeout: 120000 }).toBe(0)
      await expect.poll(async () => (await readHook<{saving:boolean}>(page, 'draftState')).saving).toBe(false)
      await expect.poll(async () => (await readHook<Array<{crewId:string;pairingId:number}>>(page, 'roster')).filter(r => r.crewId === crewId && r.pairingId === id).length).toBe(2)
      await expect.poll(async () => {
        const pairing = (await readHook<Array<{id:number;composition:Array<{rank:string;fill:number}>}>>(page, 'pairings')).find(p => p.id === id)
        return pairing?.composition.find(c => c.rank === (index === 0 ? 'CA' : 'FO'))?.fill
      }, { timeout: 30000 }).toBe(1)
      await shot(page, `case4-${crewId}-saved`)
    }
    await openLive(page, request, id)
    await expect.poll(async () => (await readHook<Array<{crewId:string;pairingId:number}>>(page, 'roster')).filter(r => method.crews.includes(r.crewId) && r.pairingId === id).length, { timeout: 60000 }).toBe(4)
    await shot(page, `case4-${method.crews[0]}-reloaded`)
  })
}
