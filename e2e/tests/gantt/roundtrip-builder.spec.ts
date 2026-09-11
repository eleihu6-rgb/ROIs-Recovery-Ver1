import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page, type Response } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

type Rules = { checkinMin: number; debriefMin: number; restMin: number; maxDutyBlockMin: number; singleLegExemption: boolean }
type Flight = { id: number; fltNum: string; depArp: string; arvArp: string; schDepDtUtc: string; schArvDtUtc: string; blockMin: number; fleet: string }
type Rotation = { flightIds: number[]; dutyFlightIds: number[][]; layoverMinutes: number[] }
type Search = { flights: Flight[]; rotations: Rotation[] }
type Segment = { id: number; fltId: number; dutySeq: number; segSeq: number; depArp: string; arvArp: string; schStrDtUtc: string; schEndDtUtc: string; briefStartUtc: string | null; dropoffEndUtc: string | null; dutyBriefMin: number; dutyDebriefMin: number; dutySchRestMin: number }
type Detail = { id: number; base: string; fleet: string; dutyCount: number; segCount: number; segments: Segment[] }
type Shape = 'four' | 'two' | 'layover'
type Receipt = { shape: Shape; pairingId: number; flightIds: number[]; dutyCount: number; segCount: number; rowOrder: string[]; freeRestMinutes: number[]; screenshots: string[] }
type ReadHook = { pairingPanelOrder: () => { id: string; label: string }[]; pairingSegments: () => Segment[] }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const screenshotDirectory = path.join(root, 'docs/assets/screenshots/gantt')
const outboundDate = '2026-09-20'
type Options = { fleets: string[]; narrowFleets: string[]; composition: { narrow: { rank: string; plan: number }[]; wide: { rank: string; plan: number }[] }; defaults: Rules }
const shapeOf = (rotation: Rotation): Shape | undefined => rotation.dutyFlightIds.length > 1
  ? 'layover' : rotation.flightIds.length === 4 ? 'four' : rotation.flightIds.length === 2 ? 'two' : undefined
const utcMs = (value: string): number => Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`)
const calendarDay = (value: string, timezone: string): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(utcMs(value)))

const capture = async (page: Page, checkpoint: string): Promise<string> => {
  fs.mkdirSync(screenshotDirectory, { recursive: true })
  let version = 1
  let target: string
  do { target = path.join(screenshotDirectory, `roundtrip-builder-${checkpoint}-Ver${version++}.png`) } while (fs.existsSync(target))
  await page.screenshot({ path: target, fullPage: true })
  return path.relative(root, target)
}

const searchFlights = async (page: Page): Promise<{ data: Search; rules: Rules; timezone: string }> => {
  const pending = page.waitForResponse(response => response.url().endsWith('/api/pairing/roundtrip/search') && response.request().method() === 'POST')
  await page.getByTestId('rt-find').click()
  const response = await pending
  expect(response.ok(), await response.text()).toBeTruthy()
  const request = response.request().postDataJSON() as { scope: { rules: Rules; timezone: string } }
  const body = await response.json() as { data: Search }
  return { data: body.data, rules: request.scope.rules, timezone: request.scope.timezone }
}

const verifyDetail = (detail: Detail, rotation: Rotation, flights: Flight[], rules: Rules): number[] => {
  const segments = [...detail.segments].sort((a, b) => a.dutySeq - b.dutySeq || a.segSeq - b.segSeq)
  expect(detail.base).toBe('ADD')
  expect(segments.map(segment => Number(segment.fltId))).toEqual(rotation.flightIds)
  expect(new Set(segments.map(segment => segment.fltId)).size).toBe(segments.length)
  expect(segments[0].depArp).toBe('ADD')
  expect(segments.at(-1)?.arvArp).toBe('ADD')
  expect(detail.segCount).toBe(segments.length)
  const duties = [...new Set(segments.map(segment => segment.dutySeq))].map(sequence => segments.filter(segment => segment.dutySeq === sequence))
  expect(detail.dutyCount).toBe(duties.length)
  expect(duties.map(duty => duty.map(segment => Number(segment.fltId)))).toEqual(rotation.dutyFlightIds)
  const freeRestMinutes: number[] = []
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const flight = flights.find(candidate => candidate.id === Number(segment.fltId))!
    expect(segment.depArp).toBe(flight.depArp)
    expect(segment.arvArp).toBe(flight.arvArp)
    expect(utcMs(segment.schStrDtUtc)).toBe(utcMs(flight.schDepDtUtc))
    expect(utcMs(segment.schEndDtUtc)).toBe(utcMs(flight.schArvDtUtc))
    if (index) {
      expect(segments[index - 1].arvArp).toBe(segment.depArp)
      expect(utcMs(segment.schStrDtUtc)).toBeGreaterThanOrEqual(utcMs(segments[index - 1].schEndDtUtc))
    }
  }
  for (let index = 0; index < duties.length; index++) {
    const duty = duties[index]
    const first = duty[0]
    const last = duty.at(-1)!
    expect(first.briefStartUtc).toBeTruthy()
    expect(last.dropoffEndUtc).toBeTruthy()
    expect((utcMs(first.schStrDtUtc) - utcMs(first.briefStartUtc!)) / 60_000).toBe(rules.checkinMin)
    expect((utcMs(last.dropoffEndUtc!) - utcMs(last.schEndDtUtc)) / 60_000).toBe(rules.debriefMin)
    const block = duty.reduce((sum, segment) => sum + flights.find(flight => flight.id === Number(segment.fltId))!.blockMin, 0)
    if (duty.length > 1 || !rules.singleLegExemption) expect(block).toBeLessThanOrEqual(rules.maxDutyBlockMin)
    if (index) {
      const previous = duties[index - 1]
      const previousLast = previous.at(-1)!
      const freeRest = (utcMs(first.briefStartUtc!) - utcMs(previousLast.dropoffEndUtc!)) / 60_000
      const previousPeriod = (utcMs(previousLast.schEndDtUtc) - utcMs(previous[0].briefStartUtc!)) / 60_000
      expect(freeRest).toBeGreaterThanOrEqual(Math.max(rules.restMin, previousPeriod))
      expect(freeRest).toBeGreaterThanOrEqual(Number(previousLast.dutySchRestMin))
      freeRestMinutes.push(freeRest)
    }
  }
  expect(freeRestMinutes).toEqual(rotation.layoverMinutes)
  return freeRestMinutes
}

test('RT-20260920: build 3 four-leg, 2 two-leg and 5 layover ADD pairings through the public UI', async ({ page }, testInfo) => {
  const receipts: Receipt[] = []
  const details = new Map<number, Promise<Detail>>()
  const onResponse = (response: Response): void => {
    const match = new URL(response.url()).pathname.match(/\/api\/pairing\/(\d+)$/)
    if (match && response.request().method() === 'GET' && response.ok()) {
      details.set(Number(match[1]), (async (): Promise<Detail> => {
        const body = await response.json() as { data: Detail }
        return body.data
      })())
    }
  }
  page.on('response', onResponse)
  const writeReceipt = (): void => fs.writeFileSync(testInfo.outputPath('roundtrip-builder-receipt.json'), JSON.stringify({
    target: 'https://cr.rois.one/altair/live', outboundDate, base: 'ADD', receipts,
  }, null, 2))
  try {
    await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
    const login = new GanttLoginPage(page)
    await expect(login.userCodeInput).toBeVisible()
    await login.login(process.env.GANTT_TEST_USER ?? TEST_ACCOUNTS.jen.userCode, process.env.GANTT_TEST_PASS ?? TEST_ACCOUNTS.jen.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible()
    await page.getByTestId('module-nav-live').click()
    await expect(page).toHaveURL(/\/altair\/live/)
    await page.getByTestId('filter-btn').click()
    await page.getByTestId('filter-apply').click()
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __ganttTest?: ReadHook }).__ganttTest?.pairingPanelOrder))).toBeTruthy()
    await page.getByTestId('roundtrip-builder-button').click()
    await expect(page.getByTestId('roundtrip-builder-dialog')).toBeVisible()
    await page.getByTestId('rt-from').fill(outboundDate)
    await page.getByTestId('rt-to').fill('2026-09-24')
    await page.getByTestId('rt-base').selectOption('ADD')
    await page.getByTestId('rt-fleet').selectOption('7M8')
    await capture(page, 'scope')

    let search = await searchFlights(page)
    const candidates = (shape: Shape): Rotation[] => search.data.rotations.filter(rotation => {
      const first = search.data.flights.find(flight => flight.id === rotation.flightIds[0])
      return first && first.depArp === 'ADD' && calendarDay(first.schDepDtUtc, search.timezone) === outboundDate && shapeOf(rotation) === shape
    })
    expect(candidates('four').length, 'real schedule must support all three four-segment duties before any writes').toBeGreaterThanOrEqual(3)
    expect(candidates('two').length).toBeGreaterThanOrEqual(2)
    expect(candidates('layover').length).toBeGreaterThanOrEqual(5)
    await capture(page, 'search')
    const sequence: Shape[] = ['four', 'four', 'four', 'two', 'two', 'layover', 'layover', 'layover', 'layover', 'layover']
    for (const [index, shape] of sequence.entries()) {
      if (index) {
        await page.getByTestId('roundtrip-builder-button').click()
        search = await searchFlights(page)
      }
      const rotation = candidates(shape)[0]
      expect(rotation, `remaining real ${shape} rotation departing ${outboundDate}`).toBeTruthy()
      const seed = search.data.flights.find(flight => flight.id === rotation.flightIds[0])!
      await page.getByTestId('rt-flight-search').fill(seed.fltNum)
      await page.getByTestId('rt-departure-date').fill(outboundDate)
      await page.getByTestId(`rt-flight-${seed.id}`).click()
      await expect(page.getByTestId('rt-preview')).toBeVisible()
      const previewScreenshot = await capture(page, `${index + 1}-${shape}-preview`)
      const pending = page.waitForResponse(response => response.url().endsWith('/api/pairing/roundtrip/build') && response.request().method() === 'POST')
      await page.getByTestId('rt-build').click()
      const response = await pending
      expect(response.ok(), await response.text()).toBeTruthy()
      const { data: built } = await response.json() as { data: { pairingId: number; dutyCount: number; segCount: number } }
      const receipt: Receipt = { shape, pairingId: built.pairingId, flightIds: rotation.flightIds, dutyCount: built.dutyCount, segCount: built.segCount, rowOrder: [], freeRestMinutes: [], screenshots: [previewScreenshot] }
      receipts.push(receipt)
      writeReceipt()
      await expect.poll(() => page.evaluate(() => (window as unknown as { __ganttTest: ReadHook }).__ganttTest.pairingPanelOrder().slice(0, 2).map(row => row.id)), { timeout: 30_000 })
        .toEqual(receipts.length > 1 ? [String(built.pairingId), String(receipts.at(-2)!.pairingId)] : expect.arrayContaining([String(built.pairingId)]))
      receipt.rowOrder = await page.evaluate(() => (window as unknown as { __ganttTest: ReadHook }).__ganttTest.pairingPanelOrder().slice(0, 2).map(row => row.id))
      expect(receipt.rowOrder[0]).toBe(String(built.pairingId))
      await expect.poll(() => details.has(built.pairingId)).toBeTruthy()
      const detail = await details.get(built.pairingId)!
      receipt.freeRestMinutes = verifyDetail(detail, rotation, search.data.flights, search.rules)
      const displayed = await page.evaluate(id => (window as unknown as { __ganttTest: ReadHook }).__ganttTest.pairingSegments().filter(segment => Number((segment as Segment & { pairingId: number }).pairingId) === id), built.pairingId)
      expect(displayed.map(segment => Number(segment.fltId))).toEqual(rotation.flightIds)
      expect(displayed.map(segment => segment.dutySeq)).toEqual(detail.segments.map(segment => segment.dutySeq))
      for (const segment of detail.segments) {
        const rendered = displayed.find(candidate => Number(candidate.fltId) === Number(segment.fltId))!
        expect(utcMs(rendered.schStrDtUtc)).toBe(utcMs(segment.schStrDtUtc))
        expect(utcMs(rendered.schEndDtUtc)).toBe(utcMs(segment.schEndDtUtc))
        if (segment.briefStartUtc) expect(utcMs(rendered.briefStartUtc!)).toBe(utcMs(segment.briefStartUtc))
        if (segment.dropoffEndUtc) expect(utcMs(rendered.dropoffEndUtc!)).toBe(utcMs(segment.dropoffEndUtc))
      }
      // The dialog now stays open after a run so the planner can read the in-dialog
      // build summary (built vs requested, unpaired flights, warnings), then closes it.
      await expect(page.getByTestId('rt-summary')).toBeVisible()
      await expect(page.getByTestId('rt-summary-title')).toContainText('1 pairing built')
      await page.getByTestId('rt-show-results').click()
      await expect(page.getByTestId('roundtrip-builder-dialog')).not.toBeVisible()
      receipt.screenshots.push(await capture(page, `${index + 1}-${shape}-built`))
      writeReceipt()
    }
    expect(receipts.filter(receipt => receipt.shape === 'four')).toHaveLength(3)
    expect(receipts.filter(receipt => receipt.shape === 'two')).toHaveLength(2)
    expect(receipts.filter(receipt => receipt.shape === 'layover')).toHaveLength(5)
    expect(new Set(receipts.flatMap(receipt => receipt.flightIds)).size).toBe(receipts.reduce((count, receipt) => count + receipt.flightIds.length, 0))
  } finally {
    writeReceipt()
    page.off('response', onResponse)
    await testInfo.attach('roundtrip-builder-receipt', { path: testInfo.outputPath('roundtrip-builder-receipt.json'), contentType: 'application/json' })
  }
})

test('RT-read-only: public controls and retained ten pairings', async ({ page }, testInfo) => {
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'docs/test-cases/gantt/roundtrip-builder-ten-build-receipt.json'), 'utf8')) as { receipts: Receipt[] }
  const screenshots: string[] = []
  let searchRequests = 0
  let buildRequests = 0
  page.on('request', request => {
    if (request.url().endsWith('/api/pairing/roundtrip/search')) searchRequests++
    if (request.url().endsWith('/api/pairing/roundtrip/build')) buildRequests++
  })
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  const login = new GanttLoginPage(page)
  await expect(login.userCodeInput).toBeVisible()
  await login.login(process.env.GANTT_TEST_USER ?? TEST_ACCOUNTS.jen.userCode, process.env.GANTT_TEST_PASS ?? TEST_ACCOUNTS.jen.password)
  await page.getByTestId('module-nav-live').click()
  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-apply').click()

  // Delay the real first options response so the close/reopen race is reproducible.
  let releaseOptions: () => void = (): void => undefined
  const optionsGate = new Promise<void>(resolve => { releaseOptions = resolve })
  let optionsHeld = false
  await page.route('**/api/pairing/roundtrip/options', async route => {
    const response = await route.fetch()
    optionsHeld = true
    await optionsGate
    await route.fulfill({ response })
  }, { times: 1 })
  await page.getByTestId('roundtrip-builder-button').click()
  await expect.poll(() => optionsHeld).toBeTruthy()
  await expect(page.getByText('Loading build options...')).toBeVisible()
  screenshots.push(await capture(page, 'readonly-options-loading'))
  await page.getByTestId('rt-show-results').click()
  await expect(page.getByTestId('roundtrip-builder-dialog')).not.toBeVisible()
  const optionsResponse = page.waitForResponse(response => response.url().endsWith('/api/pairing/roundtrip/options'))
  await page.getByTestId('roundtrip-builder-button').click()
  const response = await optionsResponse
  const options = (await response.json() as { data: Options }).data
  releaseOptions()
  await expect(page.getByTestId('rt-from')).toBeVisible()
  await expect(page.getByText('Loading build options...')).not.toBeVisible()
  screenshots.push(await capture(page, 'readonly-options-reopened'))

  const narrow = options.fleets.find(fleet => options.narrowFleets.includes(fleet))!
  const wide = options.fleets.find(fleet => !options.narrowFleets.includes(fleet))!
  expect(narrow).toBeTruthy()
  expect(wide).toBeTruthy()
  await page.getByTestId('rt-fleet').selectOption(narrow)
  for (const slot of options.composition.narrow) await expect(page.getByRole('spinbutton', { name: `${slot.rank} required count` })).toHaveValue(String(slot.plan))
  await page.getByTestId('rt-fleet').selectOption(wide)
  for (const slot of options.composition.wide) await expect(page.getByRole('spinbutton', { name: `${slot.rank} required count` })).toHaveValue(String(slot.plan))
  const customized = options.composition.wide[0]
  await page.getByRole('spinbutton', { name: `${customized.rank} required count` }).fill(String(customized.plan + 1))
  await page.getByTestId('rt-fleet').selectOption(narrow)
  await expect(page.getByRole('spinbutton', { name: `${customized.rank} required count` })).toHaveValue(String(customized.plan + 1))
  screenshots.push(await capture(page, 'readonly-composition-preserved'))
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByTestId('rt-base').selectOption('ADD')
  await page.getByTestId('rt-fleet').selectOption('7M8')
  const minimum = await page.getByTestId('rt-from').getAttribute('min')
  expect(minimum).toBeTruthy()
  const beforeMinimum = new Date(`${minimum}T00:00:00Z`)
  beforeMinimum.setUTCDate(beforeMinimum.getUTCDate() - 1)
  await page.getByTestId('rt-from').fill(beforeMinimum.toISOString().slice(0, 10))
  await page.getByTestId('rt-find').click()
  await expect(page.getByRole('alert')).toContainText('Choose dates within the open Gantt')
  expect(searchRequests).toBe(0)
  await expect(page.getByTestId('rt-build')).toBeDisabled()
  screenshots.push(await capture(page, 'readonly-invalid-range'))
  await page.getByTestId('rt-from').fill('2026-09-24')
  await page.getByTestId('rt-to').fill('2026-09-20')
  await page.getByTestId('rt-find').click()
  await expect(page.getByRole('alert')).toContainText('Choose dates within the open Gantt')
  expect(searchRequests).toBe(0)
  await page.getByTestId('rt-from').fill(outboundDate)
  await page.getByTestId('rt-to').fill('2026-09-24')
  const search = await searchFlights(page)
  expect(searchRequests).toBe(1)
  await expect(page.getByTestId('rt-build')).toHaveText(`Build all (${search.data.rotations.length})`)
  await expect(page.getByTestId('rt-build')).toBeEnabled()
  await expect(page.getByRole('columnheader', { name: 'Link' })).toBeVisible()
  await expect(page.locator('td').filter({ hasText: /[A-Z]{3}-[A-Z]{3} \d{2} [A-Z][a-z]{2}/ }).first()).toBeVisible()
  await expect(page.locator('.text-emerald-700').first()).toBeVisible()
  screenshots.push(await capture(page, 'readonly-link-candidates'))
  const consumed = new Set(saved.receipts.flatMap(receipt => receipt.flightIds))
  expect(search.data.flights.filter(flight => consumed.has(flight.id))).toHaveLength(0)
  const rotation = search.data.rotations.find(candidate => candidate.flightIds.length > 1)!
  expect(rotation).toBeTruthy()
  const interior = search.data.flights.find(flight => flight.id === rotation.flightIds[1])!
  await page.getByTestId('rt-flight-search').fill(interior.fltNum)
  await page.getByTestId('rt-departure-date').fill(calendarDay(interior.schDepDtUtc, search.timezone))
  await page.getByTestId(`rt-flight-${interior.id}`).click()
  await expect(page.getByTestId('rt-preview')).toBeVisible()
  await expect(page.getByTestId('rt-build')).toHaveText('Build pairing')
  screenshots.push(await capture(page, 'readonly-interior-preview'))
  await page.getByTestId('rt-clear-selection').click()
  await expect(page.getByTestId('rt-build')).toHaveText(`Build all (${search.data.rotations.length})`)
  await expect(page.getByTestId('rt-build')).toBeEnabled()
  await page.getByTestId('rt-restMin').fill(String(options.defaults.restMin + 1))
  await expect(page.getByTestId('rt-build')).toBeDisabled()
  await expect(page.getByTestId('rt-flight-search')).not.toBeVisible()
  await page.getByTestId('rt-show-results').click()

  const apiPrefix = new URL(response.url()).pathname.replace('/pairing/roundtrip/options', '')
  const details = await page.evaluate(async ({ ids, prefix }) => {
    const auth = JSON.parse(window.sessionStorage.getItem('rois-auth') ?? '{}') as { token?: string }
    const output: Detail[] = []
    for (const id of ids) {
      const result = await fetch(`${prefix}/pairing/${id}`, { headers: { authorization: `Bearer ${auth.token}` } })
      if (!result.ok) throw new Error(`Pairing detail ${id} returned ${result.status}`)
      output.push((await result.json() as { data: Detail }).data)
    }
    return output
  }, { ids: saved.receipts.map(receipt => receipt.pairingId), prefix: apiPrefix })
  for (const detail of details) {
    const receipt = saved.receipts.find(candidate => candidate.pairingId === Number(detail.id))!
    const segments = [...detail.segments].sort((a, b) => a.dutySeq - b.dutySeq || a.segSeq - b.segSeq)
    expect(calendarDay(segments[0].schStrDtUtc, search.timezone)).toBe(outboundDate)
    const duties = [...new Set(segments.map(segment => segment.dutySeq))].map(sequence => segments.filter(segment => segment.dutySeq === sequence).map(segment => Number(segment.fltId)))
    const rotation: Rotation = { flightIds: receipt.flightIds, dutyFlightIds: duties, layoverMinutes: receipt.freeRestMinutes }
    const flights: Flight[] = segments.map(segment => ({ id: Number(segment.fltId), fltNum: '', depArp: segment.depArp, arvArp: segment.arvArp, schDepDtUtc: segment.schStrDtUtc, schArvDtUtc: segment.schEndDtUtc, blockMin: (utcMs(segment.schEndDtUtc) - utcMs(segment.schStrDtUtc)) / 60_000, fleet: detail.fleet }))
    verifyDetail(detail, rotation, flights, options.defaults)
    expect(shapeOf(rotation)).toBe(receipt.shape)
    expect(detail.segCount).toBe(receipt.segCount)
    expect(detail.dutyCount).toBe(receipt.dutyCount)
  }
  expect(details).toHaveLength(10)
  expect(buildRequests).toBe(0)
  screenshots.push(await capture(page, 'readonly-complete'))
  const receiptPath = testInfo.outputPath('roundtrip-builder-readonly-receipt.json')
  fs.writeFileSync(receiptPath, JSON.stringify({ target: 'https://cr.rois.one/altair/live', pairingIds: details.map(detail => detail.id), buildRequests, searchRequests, checks: ['options close/reopen', 'fleet default composition', 'customized composition preserved', 'out-of-range dates', 'reversed dates', 'link candidates with preferred green option', 'consumed flights excluded', 'interior selection', 'clear selection', 'scope edit invalidation', 'ten saved base loops, shapes and real rest'], screenshots }, null, 2))
  await testInfo.attach('roundtrip-builder-readonly-receipt', { path: receiptPath, contentType: 'application/json' })
})
