/**
 * RBot to Pairing Build Automation handoff (Live Gantt).
 *
 * Ryan's acceptance: a planner types a PLAIN-ENGLISH pairing-build order into the RBot
 * chat box ("build pairings for ADD 7M8 from 2026-09-20 to 2026-09-30"); the chat action
 * must move the Gantt date range onto that window, open the existing Pairing Build
 * Automation dialog pre-filled, run the open-flight search for them, then -- after the
 * planner presses Build -- show the in-dialog progress and the final build summary.
 *
 * The AI endpoint is stubbed deterministically (same precedent as ai-chat.spec.ts) so
 * this asserts the dispatch plus the REAL dialog/store/network behaviour, not the LLM.
 * The backend tool mapping (plain English to build_pairings inputs) is covered by
 * ai-server/tests/test_chat_tools.py + test_chat_route.py, and was confirmed against the
 * running ai-server with a real LLM call.
 *
 * NOTE: pressing Build commits ONE real pairing row (precedent:
 * roundtrip-builder.spec.ts), so the run is scoped to a single rotation.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const screenshotDirectory = path.join(root, 'docs/assets/screenshots/gantt')

type Search = { flights: { id: number; fltNum: string }[]; rotations: { flightIds: number[] }[] }

const capture = async (page: Page, checkpoint: string): Promise<string> => {
  fs.mkdirSync(screenshotDirectory, { recursive: true })
  let version = 1
  let target: string
  do { target = path.join(screenshotDirectory, `rbot-pairing-build-${checkpoint}-Ver${version++}.png`) } while (fs.existsSync(target))
  await page.screenshot({ path: target, fullPage: true })
  return path.relative(root, target)
}

const OPEN_ORDER = 'build pairings for ADD 7M8 from 2026-09-20 to 2026-09-30'

test("R'Bot pairing build - plain-English order opens the builder, searches, builds and summarises", async ({ page, request }, testInfo) => {
  await seedGanttAuth(page, request)

  const requests: string[] = []
  // Path-only glob: the dev server may serve the API under /altair (prod nginx) or
  // /live-api (this workstation's VITE_API_PREFIX), so never pin the prefix.
  await page.route('**/ai/chat', async (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] }
    requests.push(body.messages[body.messages.length - 1]?.content ?? '')
    await route.fulfill({
      json: {
        role: 'assistant',
        content: "Opening the Pairing Build Automation for ADD 7M8 - review the scope, then press Build all.",
        actions: [{
          type: 'build_pairings', base: 'ADD', start: '2026-09-20', end: '2026-09-30',
          fleets: ['7M8'], composition: [{ rank: 'CA', plan: 1 }, { rank: 'FO', plan: 1 }],
        }],
      },
    })
  })

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await dashboard.expectRosterPaneVisible()
  await page.getByTestId('ai-chat-toggle').click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

  // The RBot handoff opens the dialog, which auto-runs the search -- arm the waiter first.
  const searchPending = page.waitForResponse((response) =>
    response.url().endsWith('/api/pairing/roundtrip/search') && response.request().method() === 'POST')

  // 1. Plain English into the real chat box.
  await page.getByTestId('ai-chat-input').fill(OPEN_ORDER)
  await page.getByTestId('ai-chat-send').click()

  // 2. The action ran and reported itself.
  await expect(page.getByTestId('ai-chat-applied')).toContainText('Opening Pairing Build Automation')
  expect(requests).toContain(OPEN_ORDER)

  // 3. The real dialog opened, pre-filled, flagged as RBot-prepared.
  await expect(page.getByTestId('roundtrip-builder-dialog')).toBeVisible()
  await expect(page.getByTestId('rt-rbot-banner')).toBeVisible()
  await expect(page.getByTestId('rt-base')).toHaveValue('ADD')
  await expect(page.getByTestId('rt-from')).toHaveValue('2026-09-20')
  await expect(page.getByTestId('rt-to')).toHaveValue('2026-09-30')
  await expect(page.getByTestId('rt-fleet')).toHaveValues(['7M8'])

  // 4. The open-flight search ran by itself and found buildable rotations in scope.
  const searchResponse = await searchPending
  expect(searchResponse.ok(), await searchResponse.text()).toBeTruthy()
  const search = (await searchResponse.json() as { data: Search }).data
  expect(search.rotations.length, 'ADD 7M8 2026-09-20 to 2026-09-30 must be buildable').toBeGreaterThan(0)
  await expect(page.getByTestId('rt-build')).toBeEnabled()
  await expect(page.getByTestId('rt-build')).toContainText('Build all')

  // 5. Select ONE rotation (its first flight) and build just that pairing.
  const rotation = search.rotations[0]
  const seedFlight = search.flights.find((flight) => flight.id === Number(rotation.flightIds[0]))!
  await page.getByTestId('rt-flight-search').fill(seedFlight.fltNum)
  await page.getByTestId(`rt-flight-${seedFlight.id}`).click()
  await expect(page.getByTestId('rt-build')).toHaveText('Build pairing')

  const buildPending = page.waitForResponse((response) =>
    response.url().endsWith('/api/pairing/roundtrip/build') && response.request().method() === 'POST')
  await page.getByTestId('rt-build').click()
  const buildResponse = await buildPending
  expect(buildResponse.ok(), await buildResponse.text()).toBeTruthy()
  const built = (await buildResponse.json() as { data: { pairingId: number; dutyCount: number; segCount: number } }).data

  // 6. The dialog stayed open and now shows the build summary.
  await expect(page.getByTestId('roundtrip-builder-dialog')).toBeVisible()
  await expect(page.getByTestId('rt-summary')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('rt-summary-title')).toContainText('1 pairing built')
  await expect(page.getByTestId('rt-summary')).toContainText('of 1 requested')
  await expect(page.getByTestId('rt-summary')).toContainText('unpaired')

  const screenshot = await capture(page, `built-${built.pairingId}`)
  await testInfo.attach('rbot-pairing-build', {
    body: JSON.stringify({
      order: OPEN_ORDER, searchedFlights: search.flights.length, searchRotations: search.rotations.length,
      builtPairingId: built.pairingId, dutyCount: built.dutyCount, segCount: built.segCount, screenshot,
    }, null, 2),
    contentType: 'application/json',
  })
  await testInfo.attach('screenshot', { path: path.join(root, screenshot), contentType: 'image/png' })
})
