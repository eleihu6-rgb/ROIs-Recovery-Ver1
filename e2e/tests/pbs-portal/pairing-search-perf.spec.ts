/**
 * Pairing-search PERFORMANCE e2e — drives the REAL pbs-portal UI (§Simulate-User) and
 * captures the timing of the network call the UI itself fires, asserting it returns
 * correct data within a budget. Guards the pairing-search hot path optimised in
 * PBS_BACKEND_VERSION 10 (base+period index + sargable half-open period range +
 * grouped LATERAL segment rollup).
 *
 * Diagnosis + handoff:
 *   docs/modules/pbs/pairing-page-slow-load-perf-analysis.md
 *   docs/handoff/pbs/pairing-search-perf-improvement-handoff.md
 *
 * PBS-3205: Clicking SEARCH PAIRINGS (real button) fires POST /api/pairing-search/preview;
 *           the response is OK, arrives within the budget, and the search footer shows a
 *           valid numeric "Total N items" (correct data — not an error / not just visible).
 *
 * Conditions:
 *   1. User 247 (CA @ YEG) logs in with password "rois" and has ≥1 T1 pairing property
 *      so SEARCH PAIRINGS navigates to /pairing/search (same precondition as PBS-3201).
 *   2. pbs-server (:3002) + pbs-portal (:3030, base /pbs/) are running.
 *
 * NOTE on budget: the demo Postgres is remote, so the budget is a non-flaky ceiling, and
 * the test LOGS the measured latency for before/after comparison. Tighten the ceiling via
 * PBS_PERF_BUDGET_MS once the optimised server is deployed.
 */
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'
import { loginToPbsApi } from '../../utils/pbs/auth'

const PBS_USER = process.env.PBS_TEST_USER ?? '247'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'
// Non-flaky ceiling for the UI-fired preview call against the remote demo DB.
const PREVIEW_BUDGET_MS = Number.parseInt(process.env.PBS_PERF_BUDGET_MS ?? '45000', 10)
const CURRENT_RULES_BUDGET_MS = Number.parseInt(process.env.PBS_CURRENT_RULES_BUDGET_MS ?? '10000', 10)
const EFFICIENT_FLYING_BUDGET_MS = Number.parseInt(
  process.env.PBS_EFFICIENT_FLYING_BUDGET_MS ?? '2000',
  10,
)
const EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS = Number.parseInt(
  process.env.PBS_EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS ?? '1000',
  10,
)
const PBS_API = process.env.PBS_API_URL ?? 'http://localhost:3002/api'

// sessionStorage auth cannot be persisted via storageState — each test logs in.
test.use({ storageState: { cookies: [], origins: [] } })

test('PBS-3205 — SEARCH PAIRINGS fires preview, returns correct data within budget', async ({ page }) => {
  // ── Step 1: log in as a real crew and open the Pairing bid page ──────────────
  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login(PBS_USER, PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  await page.goto('pairing')
  await page.waitForURL(/\/pairing$/, { timeout: 15_000 })
  await page.waitForSelector('[data-testid="pairing-pool-counts-summary"]', { timeout: 30_000 })

  // ── Step 2: click the REAL SEARCH PAIRINGS button and capture the call the UI fires ──
  const searchBtn = page.locator('button').filter({ hasText: /SEARCH PAIRINGS/i }).first()
  await expect(searchBtn).toBeVisible({ timeout: 10_000 })

  const startedAt = Date.now()
  const [previewResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/pairing-search/preview') && r.request().method() === 'POST',
      { timeout: PREVIEW_BUDGET_MS + 15_000 },
    ),
    searchBtn.click(),
  ])
  const elapsedMs = Date.now() - startedAt

  // ── Step 3: assert the response is healthy, on time, and carries correct data ──
  expect(previewResp.ok(), `preview returned HTTP ${previewResp.status()}`).toBeTruthy()
  const body = await previewResp.json()
  // {code,data} envelope — data.summary.totalItems is the authoritative count.
  const totalItems = body?.data?.summary?.totalItems
  expect(typeof totalItems, 'preview payload missing data.summary.totalItems').toBe('number')
  expect(totalItems).toBeGreaterThanOrEqual(0)

  console.log(`[PBS-3205] preview latency=${elapsedMs}ms (budget ${PREVIEW_BUDGET_MS}ms), totalItems=${totalItems}`)
  expect(elapsedMs, `preview slower than budget ${PREVIEW_BUDGET_MS}ms`).toBeLessThan(PREVIEW_BUDGET_MS)

  // ── Step 4: the UI itself must show the same correct data (not just "no error") ──
  await page.waitForURL(/\/pairing\/search$/, { timeout: 15_000 })
  await expect(page.locator('[data-testid="pairing-search-panel"]')).toBeVisible({ timeout: 10_000 })
  const footer = page.locator('[data-testid="pairing-search-footer"]')
  await expect(footer).toContainText('Total', { timeout: 20_000 })
  const footerText = (await footer.textContent()) ?? ''
  const shown = footerText.match(/Total\s+(\d+)\s+items/)
  expect(shown, `footer did not show a numeric Total: "${footerText}"`).not.toBeNull()
  expect(Number.parseInt(shown![1], 10)).toBe(totalItems)
})

test('PBS-4281 — Efficient Flying cold preview stays correct and under two seconds', async ({ request }) => {
  test.setTimeout(30_000)

  const { token } = await loginToPbsApi(request, PBS_API, PBS_USER, PBS_PASS)
  const requestData = {
    periodCode: 'Jul 2026',
    preview: {
      property: {
        propertyGroupKey: randomUUID(),
        propertyCode: 428,
        name: 'Efficient Flying First',
        action: 'award',
        quantifier: null,
        bid: {
          type: 'efficient-flying-preference',
          mode: 'efficient',
        },
      },
      page: 1,
      pageSize: 30,
    },
  }
  const startedAt = Date.now()
  const response = await request.post(`${PBS_API}/pairing-search/preview`, {
    headers: { Authorization: `Bearer ${token}` },
    data: requestData,
    timeout: EFFICIENT_FLYING_BUDGET_MS + 5_000,
  })
  const elapsedMs = Date.now() - startedAt
  const responseText = await response.text()

  expect(response.ok(), `Efficient Flying preview returned HTTP ${response.status()}: ${responseText}`).toBeTruthy()
  const body = JSON.parse(responseText)
  const data = body?.data ?? body
  expect(typeof data?.summary?.totalItems).toBe('number')
  expect(typeof data?.summary?.pairingIdCount).toBe('number')
  expect(
    elapsedMs,
    `Efficient Flying cold preview exceeded ${EFFICIENT_FLYING_BUDGET_MS}ms`,
  ).toBeLessThan(EFFICIENT_FLYING_BUDGET_MS)

  console.log(
    `[PBS-4281] Efficient Flying cold preview latency=${elapsedMs}ms `
    + `(budget ${EFFICIENT_FLYING_BUDGET_MS}ms), totalItems=${data.summary.totalItems}`,
  )

  const cacheHitStartedAt = Date.now()
  const cacheHitResponse = await request.post(`${PBS_API}/pairing-search/preview`, {
    headers: { Authorization: `Bearer ${token}` },
    data: requestData,
    timeout: EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS + 5_000,
  })
  const cacheHitElapsedMs = Date.now() - cacheHitStartedAt

  expect(cacheHitResponse.ok()).toBeTruthy()
  expect(
    cacheHitElapsedMs,
    `Efficient Flying cache hit exceeded ${EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS}ms`,
  ).toBeLessThan(EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS)
  console.log(
    `[PBS-4281] Efficient Flying cache-hit latency=${cacheHitElapsedMs}ms `
    + `(budget ${EFFICIENT_FLYING_CACHE_HIT_BUDGET_MS}ms)`,
  )
})

test('PBS-3504 — Bid page loads employee 19 pairing counts without the refresh error', async ({ page }) => {
  test.setTimeout(60_000)

  const login = new PbsLoginPage(page)
  await login.goto()
  await login.login('19', PBS_PASS)
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

  const startedAt = Date.now()
  const countsResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST'
    && response.url().includes('/pairing-search/current-rules/counts'), {
    timeout: CURRENT_RULES_BUDGET_MS + 5_000,
  })
  await page.goto('bid')
  const response = await countsResponse
  const elapsedMs = Date.now() - startedAt

  expect(response.ok(), `UI counts returned HTTP ${response.status()}`).toBeTruthy()
  expect(elapsedMs, `UI counts exceeded ${CURRENT_RULES_BUDGET_MS}ms`).toBeLessThan(CURRENT_RULES_BUDGET_MS)
  await expect(page.getByTestId('pairing-pool-counts-summary')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('pairing-pool-counts-pairings')).not.toHaveText('Try refresh again')
})

test('PBS-3503 — employee 19 real seven-rule counts preserve the captured baseline under budget', async ({ request }) => {
  test.setTimeout(90_000)

  const { token } = await loginToPbsApi(request, PBS_API, '19', PBS_PASS)
  const headers = { Authorization: `Bearer ${token}` }
  const draftResponse = await request.get(`${PBS_API}/pairing-bids/current?periodCode=Jun%202026`, { headers })
  expect(draftResponse.ok(), `current pairing draft returned HTTP ${draftResponse.status()}`).toBeTruthy()
  const draftBody = await draftResponse.json()
  const properties = (draftBody?.data ?? draftBody)?.draft?.properties

  expect(properties, 'employee 19 current pairing draft is missing properties').toHaveLength(7)

  const samples: number[] = []
  for (let index = 0; index < 5; index += 1) {
    const coldProperties = properties.map((property: Record<string, unknown>) => ({
      ...property,
      propertyGroupKey: randomUUID(),
    }))
    const startedAt = Date.now()
    const response = await request.post(`${PBS_API}/pairing-search/current-rules/counts`, {
      headers,
      data: { periodCode: 'Jun 2026', tier: 'T1', properties: coldProperties },
      timeout: CURRENT_RULES_BUDGET_MS + 5_000,
    })
    const elapsedMs = Date.now() - startedAt
    const responseText = await response.text()

    expect(response.ok(), `counts returned HTTP ${response.status()}: ${responseText}`).toBeTruthy()
    const body = JSON.parse(responseText)
    const data = body?.data ?? body
    expect(data.rows.map((row: { propertyCode: number }) => row.propertyCode)).toEqual([102, 102, 168, 103, 103, 107, 107])
    expect(data.rows.map((row: { rule: { pairingIdCount: number } }) => row.rule.pairingIdCount)).toEqual([3, 2, 4, 34, 15, 13, 16])
    expect(data.rows.map((row: { funnel: { pairingIdCount: number } }) => row.funnel.pairingIdCount)).toEqual([0, 2, 0, 0, 0, 0, 0])
    expect(data.summary.activePropertyCount).toBe(6)
    expect(data.summary.allRules?.pairingIdCount).toBe(0)
    expect(elapsedMs, `seven-rule request exceeded ${CURRENT_RULES_BUDGET_MS}ms`).toBeLessThan(CURRENT_RULES_BUDGET_MS)
    samples.push(elapsedMs)
  }

  samples.sort((a, b) => a - b)
  console.log(`[PBS-3503] 7-rule cold samples=${samples.join(',')}ms median=${samples[2]}ms max=${samples.at(-1)}ms`)
})

test('PBS-3502 — current rule counts stay correct and under budget with twenty representative conditions', async ({ request }) => {
  test.setTimeout(180_000)

  const { token } = await loginToPbsApi(request, PBS_API, '19', PBS_PASS)
  const headers = { Authorization: `Bearer ${token}` }
  const buildProperties = () => {
    const key = () => randomUUID()
    const pairing = Array.from({ length: 5 }, (_, index) => ({
      propertyGroupKey: key(),
      rowSeq: index + 1,
      propertyCode: 102,
      name: 'Pairing Preference',
      action: 'award' as const,
      quantifier: null,
      bid: { type: 'pairing-preference' as const, pairingIds: [String(10721 + index)] },
      tiers: ['T1'],
    }))
    const airports = Array.from({ length: 5 }, (_, index) => ({
      propertyGroupKey: key(),
      rowSeq: index + 6,
      propertyCode: 168,
      name: 'Airport Preference',
      action: 'award' as const,
      quantifier: null,
      bid: {
        type: 'airport-preference' as const,
        event: 'landing_or_layover' as const,
        locations: [{ code: index % 2 === 0 ? 'YEG' : 'YHZ', kind: 'airport' as const }],
        dateScope: { mode: 'specific_dates' as const, dates: [`2026-06-${String(10 + index).padStart(2, '0')}`] },
        minimumLayoverDuration: '14:00',
      },
      tiers: ['T1'],
    }))
    const checkTimes = Array.from({ length: 5 }, (_, index) => ({
      propertyGroupKey: key(),
      rowSeq: index + 11,
      propertyCode: 103,
      name: 'Pairing Check-In / Check-Out Time',
      action: 'award' as const,
      quantifier: null,
      bid: {
        type: 'pairing-check-time' as const,
        timeType: index % 2 === 0 ? 'check_in' as const : 'check_out' as const,
        operator: 'Between' as const,
        from: `0${index + 3}:00`,
        to: `${index + 11}:00`,
        dateScope: {
          mode: 'date_range' as const,
          from: `2026-06-${String(index + 1).padStart(2, '0')}`,
          to: `2026-06-${String(index + 10).padStart(2, '0')}`,
        },
      },
      tiers: ['T1'],
    }))
    const dutyLegs = Array.from({ length: 5 }, (_, index) => ({
      propertyGroupKey: key(),
      rowSeq: index + 16,
      propertyCode: 107,
      name: 'Flight Legs per Duty',
      action: 'award' as const,
      quantifier: 'any' as const,
      bid: {
        type: 'flight-legs-per-duty' as const,
        operator: '=' as const,
        legs: index + 1,
        dateScope: {
          mode: 'date_range' as const,
          from: `2026-06-${String(index + 1).padStart(2, '0')}`,
          to: `2026-06-${String(index + 10).padStart(2, '0')}`,
        },
      },
      tiers: ['T1'],
    }))

    return [...pairing, ...airports, ...checkTimes, ...dutyLegs]
  }
  const postCounts = async (properties: ReturnType<typeof buildProperties>) => {
    const startedAt = Date.now()
    const response = await request.post(`${PBS_API}/pairing-search/current-rules/counts`, {
      headers,
      data: { periodCode: 'Jun 2026', tier: 'T1', properties },
      timeout: CURRENT_RULES_BUDGET_MS + 5_000,
    })
    const elapsedMs = Date.now() - startedAt
    const responseText = await response.text()
    expect(response.ok(), `counts returned HTTP ${response.status()}: ${responseText}`).toBeTruthy()
    const body = JSON.parse(responseText)
    const data = body?.data ?? body
    expect(data?.rows).toHaveLength(20)
    expect(data?.summary?.activePropertyCount).toBe(20)
    return { elapsedMs, data }
  }

  const coldSamples = []
  for (let index = 0; index < 5; index += 1) {
    coldSamples.push(await postCounts(buildProperties()))
  }
  const durations = coldSamples.map((sample) => sample.elapsedMs).sort((a, b) => a - b)
  const median = durations[Math.floor(durations.length / 2)]!
  const maximum = durations.at(-1)!

  console.log(`[PBS-3502] 20-condition cold samples=${durations.join(',')}ms median=${median}ms max=${maximum}ms`)
  expect(median, '20-condition median exceeded the 8s target').toBeLessThan(8_000)
  expect(maximum, `20-condition request exceeded ${CURRENT_RULES_BUDGET_MS}ms`).toBeLessThan(CURRENT_RULES_BUDGET_MS)

  const concurrentProperties = buildProperties()
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => postCounts(concurrentProperties)))
  console.log(`[PBS-3502] concurrent identical cold requests=${concurrent.map((sample) => sample.elapsedMs).join(',')}ms`)
  for (const sample of concurrent) {
    expect(sample.elapsedMs, `concurrent request exceeded ${CURRENT_RULES_BUDGET_MS}ms`).toBeLessThan(CURRENT_RULES_BUDGET_MS)
  }
})
