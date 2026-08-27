/**
 * Pairing pane defaults to Open+Partial hard filter — regression spec (Task 4).
 *
 * What we prove:
 *  1. Scenario mode: when a scenario gantt opens, the pairing pane immediately shows
 *     only open+partial pairings (full/over pairings are hidden); a coverage chip
 *     "Open, Partial" is visible in the condition strip.
 *  2. Scenario mode: clicking × on that coverage chip widens coverage to all states,
 *     removes the chip, and reveals previously hidden full/over pairings.
 *  3. Live mode: the pairing pane's condition strip shows a coverage chip "Open, Partial"
 *     right after the live gantt loads (no user action required); × clears it the same way.
 *
 * Spec IDs: Scen-2010, Scen-2011, Live-1010, Live-1011
 *
 * Scenario test uses mocked gantt-data with 4 pairings:
 *   P1001 — open   (CA slot: plan 1, fill 0) → should be visible
 *   P1002 — partial (CA slot: plan 2, fill 1) → should be visible
 *   P1003 — full   (CA slot: plan 1, fill 1) → should be HIDDEN (hard filter)
 *   P1004 — over   (CA slot: plan 1, fill 2) → should be HIDDEN (hard filter)
 *
 * Expected: 2 rows rendered (open + partial); chip shows "Open, Partial".
 */

import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import {
  seedGanttAuth,
  seedScenarioListMocks,
  paneRenderStat,
  gotoGantt,
} from '../../utils/gantt-hook'

const DEMO_SCENARIO_ID = 6
const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'

// ── Mock pairings covering all four coverage states ────────────────────────

const mkPairing = (
  id: number,
  label: string,
  compositions: { rank: string; plan: number; fill: number }[],
) => ({
  pairingId: id,
  pairingLabel: label,
  base: 'YEG',
  division: 'P',
  assignment: 'FLY',
  assignmentGroup: 'FLY',
  fleet: '73H',
  schStrDtUtc: '2026-03-02T08:00:00.000Z',
  schEndDtUtc: '2026-03-02T16:00:00.000Z',
  compositions,
})

const MOCK_PAIRINGS = [
  mkPairing(1001, 'P1001', [{ rank: 'CA', plan: 1, fill: 0 }]),   // open
  mkPairing(1002, 'P1002', [{ rank: 'CA', plan: 2, fill: 1 }]),   // partial
  mkPairing(1003, 'P1003', [{ rank: 'CA', plan: 1, fill: 1 }]),   // full  — must be HIDDEN
  mkPairing(1004, 'P1004', [{ rank: 'CA', plan: 1, fill: 2 }]),   // over  — must be HIDDEN
]

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS.map((p, i) => ({
  pairingId: p.pairingId,
  dutySeq: 1, segSeq: 1,
  fltId: 5000 + i,
  fltDt: '2026-03-02',
  fltNum: `F${i + 1}`,
  airline: 'F8',
  depArp: 'YEG',
  arvArp: 'YYZ',
  segAssignment: 'FLY',
  schStrDtUtc: p.schStrDtUtc,
  schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: 'YEG',
  dutyEndArp: 'YYZ',
  dutySchStrDtUtc: p.schStrDtUtc,
  dutySchEndDtUtc: p.schEndDtUtc,
  dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 480,
  brief1StartUtc: p.schStrDtUtc, brief1EndUtc: p.schStrDtUtc,
  debrief1StartUtc: p.schEndDtUtc, debrief1EndUtc: p.schEndDtUtc,
  pickup1StartUtc: p.schStrDtUtc, pickup1EndUtc: p.schStrDtUtc,
  dropoff1StartUtc: p.schEndDtUtc, dropoff1EndUtc: p.schEndDtUtc,
}))

const MOCK_GANTT_DATA = {
  scenarioId: DEMO_SCENARIO_ID,
  scenarioName: DEMO_SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-03-01T00:00:00.000Z',
  endDtLoc: '2026-03-31T23:59:59.000Z',
  scenarioStrDt: '2026-03-01T00:00:00.000Z',
  scenarioEndDt: '2026-03-31T23:59:59.000Z',
  leadinLive: 1,
  dataSource: 'snapshot' as const,
  crew: Array.from({ length: 2 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: 'CA',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  assignments: [
    { crewId: 'C0001', pairingId: 1001, source: 'CR' as const },
    { crewId: 'C0002', pairingId: 1002, source: 'CR' as const },
  ],
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

// ── Scen-2010: scenario pairing pane defaults to Open+Partial ─────────────

test('Scen-2010 — scenario pairing pane defaults to Open+Partial and hides full/over pairings', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }),
    }),
  )
  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
    }),
  )

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })

  // Assert exactly 2 rows rendered (open + partial only; full + over hidden by default hard filter).
  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: 'only 2 open+partial pairings should be visible by default' },
    )
    .toBe(2)

  // Assert the coverage chip shows "Open, Partial" in the pairing pane condition strip.
  // The chip renders as data-testid="pane-filter-chip" with value "Open, Partial" when narrowed.
  const chips = page.getByTestId('pane-filter-chip')
  const coverageChip = chips.filter({ hasText: 'Open, Partial' })
  await expect(coverageChip).toBeVisible({ timeout: 5_000 })
  await expect(coverageChip).toContainText('Open, Partial')
})

// ── Scen-2011: coverage chip × widens filter (regression for no-op reset bug) ─

test('Scen-2011 — clicking × on Open, Partial coverage chip clears it and shows full/over pairings', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }),
    }),
  )
  await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }),
    }),
  )

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })

  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: 'default hard filter shows 2 open+partial rows' },
    )
    .toBe(2)

  const coverageChip = page.getByTestId('pane-filter-chip').filter({ hasText: 'Open, Partial' })
  await expect(coverageChip).toBeVisible({ timeout: 5_000 })
  // Real UI: click the chip's × (same gesture as roster filter chips).
  await coverageChip.getByRole('button').click()

  // Chip gone + hard filter widened → all 4 mock coverage states visible.
  await expect(coverageChip).toHaveCount(0)
  await expect
    .poll(
      async () => (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1,
      { timeout: 8_000, message: 'removing coverage chip must reveal full+over pairings (4 rows)' },
    )
    .toBe(4)
})

// ── Live-1010: live pairing pane defaults to Open+Partial chip ────────────

test('Live-1010 — live pairing pane defaults to Open+Partial coverage chip', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoGantt(page)

  // The coverage chip is shown whenever coverage is narrowed (not all 4 states selected).
  // With the new default ['open','partial'], the chip is always present after load.
  // We assert the chip exists AND contains the correct text — never just `toBeVisible`.
  const chips = page.getByTestId('pane-filter-chip')
  const coverageChip = chips.filter({ hasText: 'Open, Partial' })
  await expect(coverageChip).toBeVisible({ timeout: 15_000 })
  await expect(coverageChip).toContainText('Open, Partial')
})

test('Live-1011 — clicking × on Open, Partial coverage chip clears coverage filter', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await gotoGantt(page)

  const pairingPane = page.getByTestId('pairing-pane')
  const coverageChip = pairingPane.getByTestId('pane-filter-chip').filter({ hasText: 'Open, Partial' })
  await expect(coverageChip).toBeVisible({ timeout: 15_000 })

  await coverageChip.getByRole('button').click()

  await expect(coverageChip).toHaveCount(0)
  await expect
    .poll(async () => {
      const applied = await page.evaluate(() => {
        const f = (window as unknown as {
          __ganttTest?: { filters: () => { applied: null | { pairing: { coverage?: string[] } } } }
        }).__ganttTest?.filters()
        return f?.applied?.pairing.coverage ?? null
      })
      return applied
    }, { timeout: 10_000, message: 'applied coverage must widen to all 4 states' })
    .toEqual(['open', 'partial', 'full', 'over'])
})
