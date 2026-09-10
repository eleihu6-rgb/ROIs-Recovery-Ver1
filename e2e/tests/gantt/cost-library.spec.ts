import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import type { CostCatalog, CostInstance, CostSet, CostRevision } from '../../../gantt/src/types/cost-library'

const screenshots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/assets/screenshots/crew-recovery')

const apiToken = async (request: APIRequestContext): Promise<string> => {
  const apiBase = process.env.GANTT_API_URL ?? 'http://localhost:3000'
  const result = await request.post(`${apiBase}/api/auth/login`, {
    data: {
      userCode: TEST_ACCOUNTS.admin.userCode,
      password: TEST_ACCOUNTS.admin.password,
    },
  })
  expect(result.ok(), `API login failed: ${result.status()}`).toBeTruthy()
  return ((await result.json()) as { data: { token: string } }).data.token
}

const api = async <T>(request: APIRequestContext, route: string, method = 'GET'): Promise<T> => {
  const apiBase = process.env.GANTT_API_URL ?? 'http://localhost:3000'
  const token = await apiToken(request)
  const response = await request.fetch(`${apiBase}/api/cost-library${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await response.json()) as { data: unknown; message: string }
  if (!response.ok()) throw new Error(`${response.status()}: ${body.message}`)
  return body.data as T
}
const login = async (page: Page): Promise<void> => {
  await page.goto('/altair/')
  await page.getByTestId('login-user-code').fill(TEST_ACCOUNTS.admin.userCode)
  await page.getByTestId('login-password').fill(TEST_ACCOUNTS.admin.password)
  await page.getByTestId('login-sign-in').click()
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-nav-cost-sets').click()
  await expect(page.getByTestId('cost-library-view')).toBeVisible()
}
const shot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(screenshots, { recursive: true })
  let version = 1
  while (existsSync(path.join(screenshots, `cost-library-${name}-Ver${version}.png`))) version++
  await page.screenshot({ path: path.join(screenshots, `cost-library-${name}-Ver${version}.png`), fullPage: true })
}
const elementShot = async (target: Locator, name: string): Promise<void> => {
  mkdirSync(screenshots, { recursive: true })
  let version = 1
  while (existsSync(path.join(screenshots, `cost-library-${name}-Ver${version}.png`))) version++
  await target.scrollIntoViewIfNeeded()
  await target.screenshot({ path: path.join(screenshots, `cost-library-${name}-Ver${version}.png`) })
}
const viewportShotAt = async (page: Page, target: Locator, name: string): Promise<void> => {
  mkdirSync(screenshots, { recursive: true })
  let version = 1
  while (existsSync(path.join(screenshots, `cost-library-${name}-Ver${version}.png`))) version++
  await target.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(screenshots, `cost-library-${name}-Ver${version}.png`) })
}
const row = (page: Page, instance: CostInstance): Locator => page.getByTestId(`cost-row-${instance.id}`)
const open = async (page: Page, instance: CostInstance): Promise<Locator> => {
  await page.getByTestId(`cost-tree-${instance.id}`).click()
  await expect(page.getByTestId(`cost-detail-${instance.id}`)).toBeVisible()
  return row(page, instance)
}
const expandRow = async (page: Page, instance: CostInstance): Promise<Locator> => {
  await page.getByTestId(`cost-expand-${instance.id}`).click()
  await expect(page.getByTestId(`cost-detail-${instance.id}`)).toBeVisible()
  return row(page, instance)
}
const price = async (page: Page, instance: CostInstance, values: Record<string, string>, expected: string): Promise<void> => {
  const current = row(page, instance)
  for (const [label, value] of Object.entries(values)) {
    const input = current.getByLabel(label, { exact: true })
    await input.fill(value)
    await expect(input).toHaveValue(value)
  }
  await page.getByTestId(`cost-calculate-${instance.id}`).click()
  await expect(page.getByTestId(`cost-result-${instance.id}`)).toContainText(expected)
  await expect(page.getByTestId(`cost-formula-explanation-${instance.id}`)).toContainText('The system')
}
const expectCostStructure = async (page: Page, instance: CostInstance): Promise<void> => {
  await expect(page.getByTestId('cost-table-heading')).toContainText('Cost ID / Description')
  await expect(page.getByTestId('cost-table-heading')).toContainText('Unit price')
  await expect(page.getByTestId(`cost-row-${instance.id}`)).toHaveAttribute('data-expanded', 'true')
  await expect(page.getByTestId(`cost-tree-${instance.id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`cost-workbench-${instance.id}`)).toContainText('Calculation Workbench')
  await expect.poll(async () => page.getByTestId(`cost-row-heading-${instance.id}`).evaluate((node) => getComputedStyle(node).borderLeftColor)).not.toBe('rgba(0, 0, 0, 0)')
}
const expectGhMarkerVisible = async (page: Page, instance: CostInstance): Promise<void> => {
  const marker = page.getByTestId(`cost-gh-marker-0-before-${instance.id}`)
  await expect(marker).toBeVisible()
  const colors = await marker.evaluate((node) => {
    const style = getComputedStyle(node)
    const parentStyle = getComputedStyle(node.parentElement!)
    return {
      marker: style.borderLeftColor,
      background: parentStyle.backgroundColor,
      width: style.borderLeftWidth,
    }
  })
  expect(colors.width).not.toBe('0px')
  expect(colors.marker).not.toBe(colors.background)
  expect(colors.marker).not.toBe('rgb(238, 242, 246)')
}
const compareCredit = async (
  page: Page,
  instance: CostInstance,
  shared: Record<string, string>,
  crewA: Record<string, string>,
  crewB: Record<string, string>,
  expected: { crewA: string; crewB: string; difference: string; afterA: string; afterB: string },
): Promise<void> => {
  const current = row(page, instance)
  await current.getByRole('button', { name: 'Compare crews', exact: true }).click()
  await expect(current.getByRole('button', { name: 'Compare crews', exact: true })).toHaveAttribute('aria-pressed', 'true')
  for (const [label, value] of Object.entries(shared)) await current.getByLabel(label, { exact: true }).fill(value)
  for (const [label, value] of Object.entries(crewA)) await current.getByLabel(`Crew A ${label}`, { exact: true }).fill(value)
  for (const [label, value] of Object.entries(crewB)) await current.getByLabel(`Crew B ${label}`, { exact: true }).fill(value)
  await page.getByTestId(`cost-calculate-${instance.id}`).click()
  const result = page.getByTestId(`cost-result-${instance.id}`)
  await expect(result.getByText('Crew A incremental cash').locator('..')).toContainText(expected.crewA)
  await expect(result.getByText('Crew B incremental cash').locator('..')).toContainText(expected.crewB)
  await expect(page.getByTestId(`cost-cash-difference-${instance.id}`)).toContainText(expected.difference)
  await expect(page.getByTestId(`cost-credit-chart-${instance.id}`)).toContainText('Monthly credit')
  await expect(page.getByTestId(`cost-credit-a-${instance.id}`)).toContainText(expected.afterA)
  await expect(page.getByTestId(`cost-credit-b-${instance.id}`)).toContainText(expected.afterB)
  await expectGhMarkerVisible(page, instance)
  await expect(page.getByTestId(`cost-formula-explanation-${instance.id}`)).toContainText('The system')
}
const expectRequiredInput = async (page: Page, instance: CostInstance, suffix: string): Promise<Locator> => {
  const input = page.locator(`#cost-input-${instance.id}-${suffix}`)
  await expect(input).toHaveAttribute('required', '')
  await expect(input).toHaveAttribute('aria-required', 'true')
  await expect(input.locator('xpath=ancestor::label[1]').getByTitle('Required')).toBeVisible()
  return input
}
const expectOptionalInput = async (page: Page, instance: CostInstance, suffix: string): Promise<Locator> => {
  const input = page.locator(`#cost-input-${instance.id}-${suffix}`)
  await expect(input).not.toHaveAttribute('required', '')
  await expect(input).toHaveAttribute('aria-required', 'false')
  await expect(input.locator('xpath=ancestor::label[1]').getByTitle('Required')).toHaveCount(0)
  return input
}
const saveRevision = async (page: Page, instance: CostInstance): Promise<CostRevision> => {
  const response = page.waitForResponse(r => r.url().endsWith(`/instances/${instance.id}/revisions`) && r.request().method() === 'POST')
  await page.getByTestId(`cost-save-${instance.id}`).click()
  const result = await response
  expect(result.status(), await result.text()).toBe(200)
  const data = (await result.json()).data as CostRevision
  await expect(row(page, instance).getByRole('status')).toContainText(`Revision ${data.revisionNo} saved`)
  return data
}
const fixture = (page: Page, request: APIRequestContext): {
  copy: (source: CostInstance) => Promise<CostInstance>
  createSet: () => Promise<CostSet>
  copySet: (mode: 'shared' | 'independent') => Promise<CostSet>
  cleanup: () => Promise<void>
} => {
  const instances = new Set<number>(), sets = new Set<number>()
  const marker = `cost-pw-${Date.now()}`
  return {
    copy: async source => {
      await open(page, source)
      const response = page.waitForResponse(r => r.url().endsWith(`/instances/${source.id}/copy`) && r.request().method() === 'POST')
      await page.getByTestId(`cost-copy-${source.id}`).click()
      const result = await response
      expect(result.status()).toBe(200)
      const copy = (await result.json()).data as CostInstance
      instances.add(copy.id)
      await expect(page.getByTestId(`cost-detail-${copy.id}`)).toBeVisible()
      return copy
    },
    createSet: async () => {
      await page.getByTestId('cost-set-new').click()
      const dialog = page.getByTestId('cost-dialog')
      await dialog.getByLabel('Name', { exact: true }).fill(`${marker}-${sets.size}`)
      const response = page.waitForResponse(r => r.url().endsWith('/cost-library/sets') && r.request().method() === 'POST')
      await page.getByTestId('cost-dialog-save').click()
      const result = await response
      expect(result.status()).toBe(200)
      const set = (await result.json()).data as CostSet
      sets.add(set.id)
      await expect(dialog).toBeHidden()
      return set
    },
    copySet: async mode => {
      await page.getByTestId('cost-set-copy').click()
      const dialog = page.getByTestId('cost-dialog')
      await dialog.getByLabel('Name', { exact: true }).fill(`${marker}-${mode}-${sets.size}`)
      await dialog.getByLabel('Copy mode').selectOption(mode)
      const response = page.waitForResponse(r => /\/sets\/\d+\/copy$/.test(r.url()) && r.request().method() === 'POST')
      await page.getByTestId('cost-dialog-save').click()
      const result = await response
      expect(result.status()).toBe(200)
      const set = (await result.json()).data as CostSet
      sets.add(set.id)
      if (mode === 'independent') set.members.forEach(m => instances.add(m.costInstanceId))
      await expect(dialog).toBeHidden()
      return set
    },
    cleanup: async () => {
      for (const id of sets) {
        try { await api(request, `/sets/${id}`, 'DELETE') } catch (e) { if (!(e instanceof Error && e.message.startsWith('404:'))) throw e }
      }
      const pending = [...instances].sort((a, b) => b - a)
      for (let pass = 0; pending.length && pass <= instances.size; pass++) {
        for (const id of [...pending]) {
          try { await api(request, `/instances/${id}`, 'DELETE'); pending.splice(pending.indexOf(id), 1) }
          catch (e) { if (e instanceof Error && e.message.startsWith('404:')) pending.splice(pending.indexOf(id), 1); else if (!(e instanceof Error && e.message.startsWith('409:'))) throw e }
        }
      }
      expect(pending, 'all test-owned instances removed without touching other configurations').toEqual([])
      const catalog = await api<CostCatalog>(request, '/catalog')
      expect(catalog.instances.filter(i => instances.has(i.id))).toEqual([])
      expect(catalog.sets.filter(s => sets.has(s.id))).toEqual([])
    },
  }
}
const membership = async (page: Page, request: APIRequestContext, selected: Record<number, number>): Promise<void> => {
  const catalog = await api<CostCatalog>(request, '/catalog')
  await page.getByTestId('cost-set-members').click()
  const dialog = page.getByTestId('cost-dialog')
  await expect(page.getByTestId('cost-dialog-save')).toBeEnabled()
  for (const instance of catalog.instances) {
    const code = `${instance.typeCode}/${String(instance.instanceNo).padStart(3, '0')}`
    await dialog.getByLabel(`Include ${code}`, { exact: true }).setChecked(selected[instance.id] !== undefined)
    if (selected[instance.id] !== undefined) await dialog.getByLabel(`Revision ${code}`, { exact: true }).selectOption(String(selected[instance.id]))
  }
  await page.getByTestId('cost-dialog-save').click()
  await expect(dialog).toBeHidden()
}

test.describe('Cost Library real UI and PostgreSQL', () => {
  test.describe.configure({ mode: 'serial' })

  test('workbench required fields block calculate before API calls and clear with zero values', async ({ page, request }) => {
    await login(page)
    const catalog = await api<CostCatalog>(request, '/catalog')
    const type = (code: number): CostInstance => catalog.instances.find(i => i.typeCode === code && i.instanceNo === 1)!
    let calculateRequests = 0
    page.on('request', (route) => {
      if (route.url().endsWith('/api/cost-library/calculate')) calculateRequests += 1
    })

    await open(page, type(1002))
    await row(page, type(1002)).getByRole('button', { name: 'Compare crews', exact: true }).click()
    const additional = await expectRequiredInput(page, type(1002), 'single-addedCredit')
    const crewA = await expectRequiredInput(page, type(1002), 'A-beforeCredit')
    const crewB = await expectRequiredInput(page, type(1002), 'B-beforeCredit')
    const removedA = await expectOptionalInput(page, type(1002), 'A-removedCredit')
    await expectOptionalInput(page, type(1002), 'A-hourlyRate')

    await crewA.fill('85')
    await crewB.fill('70')
    await page.getByTestId(`cost-calculate-${type(1002).id}`).click()
    await expect(row(page, type(1002)).getByRole('alert')).toContainText('Complete the highlighted required fields.')
    await expect(additional).toHaveAttribute('aria-invalid', 'true')
    await expect(additional).toBeFocused()
    await expect(additional).toHaveAttribute('aria-describedby', `cost-input-${type(1002).id}-single-addedCredit-error`)
    await expect(additional.locator('xpath=following-sibling::*[@id="cost-input-' + type(1002).id + '-single-addedCredit-error"]')).toContainText('Enter additional credit')
    await expect(crewA).toHaveAttribute('aria-invalid', 'false')
    await expect(crewB).toHaveAttribute('aria-invalid', 'false')
  await expect(removedA).toHaveAttribute('aria-invalid', 'false')
  await page.waitForTimeout(300)
  expect(calculateRequests).toBe(0)
  await viewportShotAt(page, additional, 'required-fields-desktop')

  await additional.fill('0')
    await expect(additional).toHaveAttribute('aria-invalid', 'false')
    await page.getByTestId(`cost-calculate-${type(1002).id}`).click()
    await expect(page.getByTestId(`cost-result-${type(1002).id}`)).toContainText('Crew A incremental cash')
    await expect(page.getByTestId(`cost-result-${type(1002).id}`)).toContainText('$0.00')
    expect(calculateRequests).toBeGreaterThan(0)

    const requestsAfterSuccess = calculateRequests
    await crewB.fill('')
    await page.getByTestId(`cost-calculate-${type(1002).id}`).click()
    await expect(crewB).toHaveAttribute('aria-invalid', 'true')
    await expect(crewB).toBeFocused()
    await expect(crewA).toHaveAttribute('aria-invalid', 'false')
  await expect(additional).toHaveAttribute('aria-invalid', 'false')
  await page.waitForTimeout(300)
  expect(calculateRequests).toBe(requestsAfterSuccess)
  await viewportShotAt(page, crewB, 'required-fields-crew-b-desktop')

    await open(page, type(1003))
    const report = await expectRequiredInput(page, type(1003), 'single-reportAt')
    const departure = await expectRequiredInput(page, type(1003), 'single-departureAt')
    const pairing = await expectRequiredInput(page, type(1003), 'single-pairingCredit')
    await expectRequiredInput(page, type(1003), 'single-beforeCredit')
    await expectOptionalInput(page, type(1003), 'single-baselineStandbyCredit')
    await expectOptionalInput(page, type(1003), 'single-removedCredit')
    await expectOptionalInput(page, type(1003), 'single-hourlyRate')

    const standbyRequestsBefore = calculateRequests
    await page.getByTestId(`cost-calculate-${type(1003).id}`).click()
    await expect(report).toHaveAttribute('aria-invalid', 'true')
    await expect(departure).toHaveAttribute('aria-invalid', 'true')
    await expect(pairing).toHaveAttribute('aria-invalid', 'true')
    await expect(report).toBeFocused()
    await page.waitForTimeout(300)
    expect(calculateRequests).toBe(standbyRequestsBefore)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('shell-sidebar').locator('button').first().click()
  await viewportShotAt(page, report, 'required-fields-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  test('all calculator families, template protection and invalid inputs', async ({ page, request }) => {
    await login(page)
    const fixtures = fixture(page, request)
    try {
    const catalog = await api<CostCatalog>(request, '/catalog')
    const type = (code: number): CostInstance => catalog.instances.find(i => i.typeCode === code && i.instanceNo === 1)!
    await page.getByTestId('legality-nav-cost-templates').click()
    await expect(page.getByLabel('Cost catalogue')).toHaveCount(0)
    await expandRow(page, type(1002))
    await expect(page.getByTestId('cost-table-heading')).toContainText('Cost ID / Description')
    await expect(page.getByTestId('cost-table-heading')).toContainText('Unit price')
    await expect(page.getByTestId(`cost-row-${type(1002).id}`)).toHaveAttribute('data-expanded', 'true')
    await expect(page.getByTestId(`cost-workbench-${type(1002).id}`)).toContainText('Default case')
    await expect(row(page, type(1002)).getByLabel('Additional credit (hours)', { exact: true })).toHaveValue('6.75')
    await expect(row(page, type(1002)).getByLabel('Crew A Monthly credit before', { exact: true })).toHaveValue('84')
    await expect(row(page, type(1002)).getByLabel('Crew B Monthly credit before', { exact: true })).toHaveValue('70')
    await expect(page.getByTestId(`cost-result-${type(1002).id}`)).toContainText('$712.50')
    await expect(page.getByTestId(`cost-formula-explanation-${type(1002).id}`)).toContainText('Only credit above the floor creates incremental cash')
    await shot(page, 'templates-default-case')
    await elementShot(page.getByTestId(`cost-workbench-${type(1002).id}`), 'templates-default-workbench')
    await expect(row(page, type(1002)).getByLabel('Guarantee floor (hours)', { exact: true })).toHaveValue('85')
    await page.getByTestId(`cost-edit-${type(1002).id}`).click()
    await expect(page.getByTestId('cost-dialog').getByRole('button', { name: 'Delete instance' })).toHaveCount(0)
    await page.getByTestId('cost-dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByTestId('legality-nav-cost-sets').click()
    await expect(page.getByLabel('Cost catalogue')).toBeVisible()
    await open(page, type(2001))
    await expect(page.getByTestId(`cost-workbench-${type(2001).id}`)).not.toContainText('Default case')
    await expect(row(page, type(2001)).getByLabel('Billable quantity', { exact: true })).toHaveValue('')
    await price(page, type(2001), { 'Billable quantity': '2' }, '$280.00')
      await open(page, type(1004)); await price(page, type(1004), { 'Qualifying event (0 or 1)': '0' }, '$0.00')
      await price(page, type(1004), { 'Qualifying event (0 or 1)': '1' }, '$200.00')
      await row(page, type(1004)).getByLabel('Qualifying event (0 or 1)', { exact: true }).fill('2')
      await page.getByTestId(`cost-calculate-${type(1004).id}`).click()
      await expect(row(page, type(1004)).getByRole('alert')).toContainText('0 or 1')
      await open(page, type(1012)); await price(page, type(1012), { 'Billable quantity': '3' }, 'Unpriced')
      await open(page, type(1002)); await price(page, type(1002), { 'Monthly credit before': '84', 'Additional credit (hours)': '6.75' }, '$712.50')
      await compareCredit(
        page,
        type(1002),
        { 'Additional credit (hours)': '6.75' },
        { 'Monthly credit before': '84' },
        { 'Monthly credit before': '70' },
        { crewA: '$712.50', crewB: '$0.00', difference: '$712.50', afterA: '90:45', afterB: '76:45' },
      )
      await elementShot(page.getByTestId(`cost-workbench-${type(1002).id}`), 'gh-compare-workbench')
      await row(page, type(1002)).getByRole('button', { name: 'Single crew', exact: true }).click()
      await price(page, type(1002), { 'Monthly credit before': '70' }, '$0.00')
      await open(page, type(1003)); await price(page, type(1003), { 'Report (UTC)': '2026-09-10T07:00', 'Pairing departure (UTC)': '2026-09-10T10:00', 'Pairing credit (hours)': '5.75', 'Monthly credit before': '84' }, '$712.50')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('06:45')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('Eligible standby')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('02:00')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('Standby credit')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('01:00')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('Total assignment credit')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toContainText('06:45')
      await compareCredit(
        page,
        type(1003),
        {
          'Report (UTC)': '2026-09-10T07:00',
          'Pairing departure (UTC)': '2026-09-10T10:00',
          'Pairing credit (hours)': '5.75',
        },
        { 'Monthly credit before': '84' },
        { 'Monthly credit before': '70' },
        { crewA: '$712.50', crewB: '$0.00', difference: '$712.50', afterA: '90:45', afterB: '76:45' },
      )
      await row(page, type(1003)).getByLabel('Crew B Monthly credit before', { exact: true }).fill('71')
      await expect(page.getByTestId(`cost-result-${type(1003).id}`)).toHaveCount(0)
      await compareCredit(
        page,
        type(1003),
        {
          'Report (UTC)': '2026-09-10T07:00',
          'Pairing departure (UTC)': '2026-09-10T10:00',
          'Pairing credit (hours)': '5.75',
        },
        { 'Monthly credit before': '84' },
        { 'Monthly credit before': '70' },
        { crewA: '$712.50', crewB: '$0.00', difference: '$712.50', afterA: '90:45', afterB: '76:45' },
      )
      await page.setViewportSize({ width: 1440, height: 1600 })
      await elementShot(page.getByTestId(`cost-workbench-${type(1003).id}`), 'standby-compare-workbench-tall')
      await elementShot(page.getByTestId(`cost-workbench-${type(1003).id}`), 'standby-workbench-tall')
      await shot(page, 'standby-desktop')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByTestId('shell-sidebar').locator('button').first().click()
      await viewportShotAt(page, page.getByTestId(`cost-credit-chart-${type(1003).id}`), 'standby-mobile-chart')
      await viewportShotAt(page, page.getByTestId(`cost-cash-difference-${type(1003).id}`), 'standby-mobile-breakdown')
      await viewportShotAt(page, page.getByText('Baseline standby credit replaced (HH:MM)'), 'standby-mobile-breakdown-bottom')
      await page.setViewportSize({ width: 1440, height: 1000 })
      await open(page, type(3001)); await price(page, type(3001), { 'Delay before (minutes)': '120', 'Delay after (minutes)': '140' }, '$500.00')
      await open(page, type(2008)); await price(page, type(2008), {}, '$20.00')
      const minimum = await fixtures.copy(type(2001))
      await row(page, minimum).getByLabel('Calculation logic', { exact: true }).selectOption('minimum')
      await row(page, minimum).getByLabel('Minimum billable quantity', { exact: true }).fill('4')
      await saveRevision(page, minimum)
      await price(page, minimum, { 'Billable quantity': '2' }, '$560.00')
      await price(page, minimum, { 'Billable quantity': '0' }, '$0.00')
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByTestId(`cost-result-${minimum.id}`).scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, 'calculator-mobile')
    } finally { await fixtures.cleanup() }
  })

  test('set CRUD, sequential instances and pinned revisions persist after reload', async ({ page, request }) => {
    await login(page)
    const fixtures = fixture(page, request)
    try {
      const catalog = await api<CostCatalog>(request, '/catalog')
      const hotel = catalog.instances.find(i => i.typeCode === 2001 && i.instanceNo === 1)!
      const first = await fixtures.copy(hotel), second = await fixtures.copy(hotel)
      expect(second.instanceNo).toBe(first.instanceNo + 1)
      await open(page, first)
      await row(page, first).getByLabel('Unit price', { exact: true }).fill('160')
      const revision2 = await saveRevision(page, first)
      const set = await fixtures.createSet()
      expect(set.members.length).toBe((await api<CostCatalog>(request, '/catalog')).instances.length)
      await membership(page, request, { [first.id]: revision2.id })
      await open(page, first)
      await row(page, first).getByLabel('Unit price', { exact: true }).fill('175')
      const revision3 = await saveRevision(page, first)
      await expect(row(page, first)).toContainText('Set revision 2')
      await price(page, first, { 'Billable quantity': '2' }, '$320.00')
      await page.getByTestId(`cost-revision-toggle-${first.id}`).click()
      await expect(row(page, first)).toContainText('Latest revision 3')
      await price(page, first, { 'Billable quantity': '2' }, '$350.00')
      await page.reload()
      await page.getByTestId(`cost-set-${set.id}`).click()
      await open(page, first)
      await expect(row(page, first)).toContainText('Set revision 2')
      await price(page, first, { 'Billable quantity': '2' }, '$320.00')
      await membership(page, request, { [first.id]: revision3.id })
      await open(page, first)
      await price(page, first, { 'Billable quantity': '2' }, '$350.00')
      await page.getByTestId('cost-set-edit').click()
      await page.getByTestId('cost-dialog').getByLabel('Description', { exact: true }).fill('Persistent test configuration')
      await page.getByTestId('cost-dialog-save').click()
      await expect(page.getByTestId('cost-dialog')).toBeHidden()
      const shared = await fixtures.copySet('shared')
      expect(shared.members[0].costRevisionId).toBe(revision3.id)
      const independent = await fixtures.copySet('independent')
      expect(independent.members[0].costInstanceId).not.toBe(first.id)
      await shot(page, 'sets-desktop')
      await page.getByTestId('cost-set-delete').click()
      await page.getByTestId('cost-dialog-save').click()
      await expect(page.getByTestId('cost-dialog')).toBeHidden()
      await expect(page.getByTestId(`cost-set-${independent.id}`)).toHaveCount(0)
      const orphan = (await api<CostCatalog>(request, '/catalog')).instances.find(i => i.id === independent.members[0].costInstanceId)!
      await open(page, orphan)
      await page.getByTestId(`cost-edit-${orphan.id}`).click()
      await page.getByTestId('cost-dialog').getByRole('button', { name: 'Delete instance', exact: true }).click()
      await page.getByTestId('cost-dialog-save').click()
      await expect(page.getByTestId('cost-dialog')).toBeHidden()
      await expect(page.getByTestId(`cost-tree-${orphan.id}`)).toHaveCount(0)
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, 'sets-mobile')
    } finally { await fixtures.cleanup() }
  })

  test('GH tier editing, standby parameters, policy remapping and disabled costs', async ({ page, request }) => {
    await login(page)
    const fixtures = fixture(page, request)
    try {
      const catalog = await api<CostCatalog>(request, '/catalog')
      const gh = await fixtures.copy(catalog.instances.find(i => i.typeCode === 1002 && i.instanceNo === 1)!)
      await row(page, gh).getByLabel('New tier boundary (hours)', { exact: true }).fill('95')
      await row(page, gh).getByRole('button', { name: 'Add tier', exact: true }).click()
      await row(page, gh).getByLabel('Tier 1 multiplier', { exact: true }).fill('1.3')
      await saveRevision(page, gh)
      await price(page, gh, { 'Monthly credit before': '84', 'Additional credit (hours)': '6.75' }, '$762.50')
      await row(page, gh).getByRole('button', { name: 'Delete tier 3', exact: true }).click()
      await row(page, gh).getByLabel('Guarantee floor (hours)', { exact: true }).fill('86')
      const ghRevision = await saveRevision(page, gh)
      await expect(row(page, gh).getByLabel('Tier 3 multiplier', { exact: true })).toHaveCount(0)
      await price(page, gh, { 'Monthly credit before': '84', 'Additional credit (hours)': '6.75' }, '$632.50')
      await expect(page.getByTestId(`cost-credit-chart-${gh.id}`)).toContainText('GH 86:00')
      const standby = await fixtures.copy(catalog.instances.find(i => i.typeCode === 1003 && i.instanceNo === 1)!)
      await row(page, standby).getByLabel('Standby credit factor', { exact: true }).fill('0.25')
      await row(page, standby).getByLabel('Departure cutoff (minutes)', { exact: true }).fill('90')
      await row(page, standby).getByLabel('GH policy revision', { exact: true }).selectOption(String(ghRevision.id))
      const standbyRevision = await saveRevision(page, standby)
      const inputs = { 'Report (UTC)': '2026-09-10T07:00', 'Pairing departure (UTC)': '2026-09-10T10:00', 'Pairing credit (hours)': '5.75', 'Monthly credit before': '84' }
      await price(page, standby, inputs, '$538.75')
      await price(page, standby, { 'Crew hourly rate (optional)': '80' }, '$431.00')
      const set = await fixtures.createSet()
      await membership(page, request, { [gh.id]: ghRevision.id, [standby.id]: standbyRevision.id })
      const independent = await fixtures.copySet('independent')
      const updated = await api<CostCatalog>(request, '/catalog')
      const copiedGh = updated.instances.find(i => independent.members.some(m => m.costInstanceId === i.id) && i.typeCode === 1002)!
      const copiedStandby = updated.instances.find(i => independent.members.some(m => m.costInstanceId === i.id) && i.typeCode === 1003)!
      expect(copiedStandby.latestRevision.ghPolicyRevisionId).toBe(copiedGh.latestRevision.id)
      await open(page, copiedStandby)
      await price(page, copiedStandby, inputs, '$538.75')
      await page.getByTestId(`cost-edit-${copiedStandby.id}`).click()
      await page.getByTestId('cost-dialog').getByLabel('Enabled', { exact: true }).uncheck()
      await page.getByTestId('cost-dialog-save').click()
      await expect(page.getByTestId('cost-dialog')).toBeHidden()
      await price(page, copiedStandby, inputs, 'Disabled')
      await shot(page, 'policy-desktop')
      await page.reload()
      await page.getByTestId(`cost-set-${set.id}`).click()
      await open(page, standby)
      await expect(row(page, standby).getByLabel('Standby credit factor', { exact: true })).toHaveValue('0.25')
    } finally { await fixtures.cleanup() }
  })
})
