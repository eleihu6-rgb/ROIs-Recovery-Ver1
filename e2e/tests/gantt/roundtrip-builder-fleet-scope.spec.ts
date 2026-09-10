import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1920, height: 1080 } })

test('RT-fleet-scope: ADD September 28-30 All fleets returns only single-fleet rotations', async ({ page }, testInfo) => {
  let buildRequests = 0
  page.on('request', request => {
    if (request.url().endsWith('/api/pairing/roundtrip/build')) buildRequests++
  })
  try {
    await page.goto('/altair/live', { waitUntil: 'domcontentloaded' })
    const login = new GanttLoginPage(page)
    await expect(login.userCodeInput).toBeVisible()
    await login.login(process.env.GANTT_TEST_USER ?? TEST_ACCOUNTS.jen.userCode, process.env.GANTT_TEST_PASS ?? TEST_ACCOUNTS.jen.password)
    await page.getByTestId('module-nav-live').click()
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-apply').click()
    await page.getByTestId('roundtrip-builder-button').click()
    await expect(page.getByTestId('roundtrip-builder-dialog')).toBeVisible()
    await page.getByTestId('rt-from').fill('2026-09-28')
    await page.getByTestId('rt-to').fill('2026-09-30')
    await page.getByTestId('rt-base').selectOption('ADD')
    await page.getByTestId('rt-fleet').selectOption({ label: 'All fleets' })
    for (const rank of ['CA', 'FO']) {
      await page.getByRole('spinbutton', { name: `${rank} required count` }).fill('2')
    }
    const pending = page.waitForResponse(response => response.url().endsWith('/api/pairing/roundtrip/search') && response.request().method() === 'POST')
    await page.getByTestId('rt-find').click()
    const response = await pending
    const body = await response.json() as {
      message?: string
      data?: { flights: { id: number; fleet: string }[]; rotations: { flightIds: number[] }[] }
    }
    await testInfo.attach('search-receipt', {
      body: JSON.stringify({ url: response.url(), status: response.status(), request: response.request().postDataJSON(), response: body }, null, 2),
      contentType: 'application/json',
    })
    expect(response.ok(), JSON.stringify(body)).toBeTruthy()
    expect(body.data?.rotations.length, 'scope must exercise actual rotation candidates').toBeGreaterThan(0)
    const flights = new Map(body.data!.flights.map(flight => [Number(flight.id), flight]))
    for (const rotation of body.data!.rotations) {
      const fleets = rotation.flightIds.map(id => flights.get(Number(id))?.fleet)
      expect(fleets.every(fleet => Boolean(fleet)), 'all rotation flights have known fleets').toBeTruthy()
      expect(new Set(fleets).size, `mixed rotation ${rotation.flightIds.join(',')}: ${fleets.join(',')}`).toBe(1)
    }
    await expect(page.getByText(/Cannot mix fleets in one pairing/)).not.toBeVisible()
    await expect(page.getByTestId('rt-build')).toBeEnabled()
    expect(buildRequests).toBe(0)
  } finally {
    const directory = path.join(root, 'docs/assets/screenshots/gantt')
    fs.mkdirSync(directory, { recursive: true })
    let version = 1
    let screenshot: string
    do { screenshot = path.join(directory, `roundtrip-builder-add-sep28-30-all-fleets-Ver${version++}.png`) } while (fs.existsSync(screenshot))
    await page.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('snapshot-scope', { path: screenshot, contentType: 'image/png' })
  }
})
