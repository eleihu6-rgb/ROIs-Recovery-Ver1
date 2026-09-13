import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Read-only receipts for the client-demo fixture. The mobile submit is performed
// by Maestro; this test must never seed an absence or silently reset shared data.
const shots = path.resolve(process.cwd(), 'docs/assets/screenshots/crew-recovery')
const screenshot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(shots, { recursive: true })
  let version = 1
  while (existsSync(path.join(shots, `${name}-Ver${version}.png`))) version++
  await page.screenshot({ path: path.join(shots, `${name}-Ver${version}.png`) })
}

const login = async (page: Page): Promise<void> => {
  const user = process.env.GANTT_TEST_USER
  const password = process.env.GANTT_TEST_PASS
  if (!user || !password) throw new Error('Set GANTT_TEST_USER and GANTT_TEST_PASS for real UI login.')
  await page.goto('/altair/')
  await page.getByTestId('login-user-code').fill(user)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-sign-in').click()
  await expect(page.getByTestId('nav-help')).toBeVisible({ timeout: 30_000 })
}

test('S1 — submitted sick leave retains original duties, or scoped reset restores the baseline', async ({ page }) => {
  const state = process.env.S1_STATE
  const manifestPath = process.env.S1_RETAIN_BASELINE
  if (!manifestPath || !['retained', 'restored'].includes(state ?? '')) throw new Error('Set S1_RETAIN_BASELINE and S1_STATE=retained|restored.')
  const baseline = JSON.parse(readFileSync(manifestPath, 'utf8')) as { roster: Array<{ id: string; crew_id: string; pairing_id: string | null }> }
  const originalIds = baseline.roster.filter(row => row.crew_id === 'J4002').map(row => Number(row.id))
  const sourceIds = baseline.roster.filter(row => row.crew_id === 'J4002' && String(row.pairing_id) === '152056').map(row => Number(row.id)).sort()
  expect(sourceIds).toHaveLength(6)
  await login(page)
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('live-empty-state').click()
  await page.getByTestId('filter-crew-division-P').click()
  await page.getByText('All bases', { exact: true }).click()
  await page.getByText('ADD — ADD', { exact: true }).click()
  await page.getByTestId('filter-crew-id').fill('J4002')
  await page.getByTestId('filter-crew-id').press('Enter')
  await page.getByTestId('filter-tab-pairing').click()
  await page.getByTestId('filter-pairing-id').fill('152056')
  await page.getByTestId('filter-pairing-id').press('Enter')
  await page.getByRole('button', { name: 'Full', exact: true }).click()
  await page.getByTestId('filter-apply').click()
  const readState = () => page.evaluate(() => window.__ganttTest!.roster().filter(row => row.crewId === 'J4002'))
  await expect.poll(async () => (await readState()).filter(row => row.pairingId === 152056).map(row => row.id).sort(), { timeout: 60000 }).toEqual(sourceIds)
  const rows = await readState()
  expect(originalIds.every(id => rows.some(row => row.id === id))).toBe(true)
  const added = rows.filter(row => !originalIds.includes(row.id))
  if (state === 'retained') {
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ assignment: 'ILL', start: '2026-09-23T21:00:00.000Z', end: '2026-09-24T20:59:59.000Z' })
  } else expect(added).toHaveLength(0)
  await expect.poll(() => page.evaluate(() => window.__ganttTest!.pairings().find(pairing => pairing.id === 152056)?.composition)).toEqual([
    { rank: 'CA', plan: 2, fill: 2 }, { rank: 'FO', plan: 2, fill: 2 },
  ])
  await screenshot(page, `s1-retained-duty-${state}`)
  await page.getByTestId('violations-button').click()
  await expect(page.locator('[data-crew-id="J4002"][data-recoverable="true"]').first()).toContainText('1001')
  await screenshot(page, `s1-retained-duty-${state}-alert`)
})

test('S1 — public Help case follows recovery costs, documents the operating workflow and GH comparison, loads its screenshots', async ({ page }) => {
  const requestedImages: string[] = []
  page.on('request', request => { if (request.url().includes('/help/screenshots/s1-')) requestedImages.push(request.url()) })
  await login(page)
  await page.getByTestId('nav-help').click()
  await expect(page.getByTestId('help-view')).toBeVisible()
  expect(requestedImages).toEqual([])
  const order = await page.locator('[data-testid^="help-topic-recovery-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')))
  expect(order[order.indexOf('help-topic-recovery-costs') + 1]).toBe('help-topic-recovery-case-001')
  await page.getByTestId('help-topic-recovery-case-001').click()
  const article = page.getByRole('article')
  for (const text of ['Getnet Kifle', '152056', 'ADD', 'retaining the original flying duties', '1001 Assignment Overlap', 'J4013', '1,762.50', 'J4018', '130.00', 'both crews', 'Preview is not Apply; Apply is not Save', 'swap Save was not tested', 'restored']) await expect(article).toContainText(text)
  await expect(article).not.toContainText('YVR')
  await expect(article).not.toContainText('Unable to submit')
  await expect(article.locator('img')).toHaveCount(4)
  await expect(article.getByTestId('s1-standby-costs').locator('tbody tr')).toHaveCount(3)
  await expect(article.getByTestId('s1-swap-costs').locator('tbody tr')).toHaveCount(6)
  for (const img of await article.locator('img').all()) {
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth >= 200)).toBeTruthy()
  }
  await article.locator('h1').scrollIntoViewIfNeeded()
  await screenshot(page, 's1-help-published')
  await page.setViewportSize({ width: 900, height: 900 })
  await expect.poll(() => article.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy()
  await screenshot(page, 's1-help-narrow')
})
