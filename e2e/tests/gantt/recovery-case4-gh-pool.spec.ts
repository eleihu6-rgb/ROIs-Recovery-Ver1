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
  await expect(page.getByRole('combobox', { name: 'Open rank' })).toBeEnabled({ timeout: 60000 })
}

test('Case 4 seven real standby rosters with GH cost spread', async ({ page, request }) => {
  const dashboard = await openLive(page, request, 152689)
  await openPairingRecovery(page, dashboard, 152689)
  const dialog = page.getByTestId('recovery-violation-dialog')
  await dialog.getByRole('combobox', { name: 'Open rank' }).selectOption('CA')
  await dialog.getByRole('button', { name: 'Find roster options', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Find roster options', exact: true })).toBeEnabled({ timeout: 180000 })
  const group = dialog.getByTestId('recovery-options-standby')
  await expect(group.getByRole('tab', { name: 'Executable (7)', exact: true })).toBeVisible()
  await group.getByRole('tab', { name: 'Executable (7)', exact: true }).click()
  await shot(page, 'case4-gh-pool-seven-options')
  const cases = [['C4002',0,'21:30'],['C4003',0,'51:15'],['C4004',75,'83:20'],['C4005',185,'84:15'],['C4006',326.25,'89:25'],['C4007',0,'29:25'],['C4008',0,'29:55']] as const
  for (const [crew, amount, before] of cases) {
    const id = `standby-152689-CA-${crew}`
    await expect(group.getByTestId(`recovery-crew-checkbox-${crew}`)).toBeEnabled()
    const cost = group.getByTestId(`recovery-cost-button-${id}`).filter({ visible: true })
    expect(Number((await cost.innerText()).replace(/[^0-9.]/g,''))).toBe(amount)
    await cost.click()
    const breakdown = page.getByTestId('recovery-cost-breakdown-dialog')
    await expect(breakdown).toContainText('Airport standby — incremental GH pay')
    await expect(breakdown).toContainText(`credit before ${before}`)
    await expect(breakdown).toContainText('saved planned roster credit')
    expect(Number((await breakdown.getByTestId('recovery-cost-breakdown-total').innerText()).replace(/[^0-9.]/g,''))).toBe(amount)
    await shot(page, `case4-gh-pool-${crew}-cost`)
    await breakdown.getByRole('button', { name: 'Close', exact: true }).first().click()
    await group.getByTestId(`recovery-preview-${id}`).click()
    await expect(dialog.getByTestId('recovery-preview-dock')).toContainText(crew, { timeout:60000 })
    await expect(dialog.getByRole('button', { name:'Apply', exact:true })).toBeEnabled({ timeout:60000 })
    const loaded = await readHook<Array<{crewId:string;pairingId:number}>>(page,'roster')
    for (const pair of ({C4004:[152131,152027],C4005:[152080,151924],C4006:[152122,151994]} as Record<string,number[]>)[crew] ?? []) {
      expect(loaded.filter(row => row.crewId===crew && row.pairingId===pair).length).toBeGreaterThanOrEqual(2)
    }
    await shot(page, `case4-gh-pool-${crew}-preview`)
    await dialog.getByTestId('recovery-expand-options').click()
  }
  await dialog.getByRole('button', { name:'Close', exact:true }).first().click()
  expect(await readHook<unknown[]>(page,'draftOps')).toEqual([])
})
