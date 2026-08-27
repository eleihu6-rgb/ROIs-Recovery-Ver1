/**
 * Pairing ID filter — global Filter dialog › Pairing tab › "Pairing ID".
 *
 * A multi-value search that HARD-filters the pairing pane to the pairings whose
 * numeric `pairing.id` is one of the typed values (comma- / period- / space-
 * separated). It is unified across Live and Scenario via the shared predicate
 * `matchesPairingIdFilter` (filter-store.ts): both views show ONLY the requested
 * pairings — nothing is merely floated.
 *
 * Proof model (mirrors pairing-coverage-filter.spec.ts):
 *   - Live    → drive the real Filter dialog, assert the rendered pairing-pane row
 *               count (paneRenderStat totalRows) + the displayed id order shrink to
 *               exactly the typed ids.
 *   - Scenario → mocked gantt-data with 5 known pairing ids; the scenario pairing
 *               pane's filter narrows to exactly the typed ids.
 *
 * Regression intent: before this feature the Pairing tab had no id search, so a
 * planner could not isolate specific pairings by id. A bring-to-top-only (float)
 * implementation would leave the non-matching rows visible — the "non-existent id
 * → 0 rows" and exact-count assertions below would have failed against a float.
 */

import { test, expect, type Page } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import {
  seedGanttAuth,
  seedScenarioListMocks,
  readHook,
  counts,
  openFilter,
  applyFilterLight,
  paneRenderStat,
} from '../../utils/gantt-hook'

// ── Helpers ──────────────────────────────────────────────────────────────────

type PairingRow = { id: string; label: string }

/** Type one or more pairing ids into the Pairing-ID chip field (commits each on Enter). */
const enterPairingIds = async (page: Page, ids: string[]): Promise<void> => {
  const input = page.getByTestId('filter-pairing-id')
  await input.click()
  for (const id of ids) {
    await input.fill(String(id))
    await input.press('Enter')
  }
}

const renderedPairingCount = async (page: Page): Promise<number> =>
  (await paneRenderStat(page, 'pairing'))?.totalRows ?? -1

const panelIds = async (page: Page): Promise<string[]> =>
  (await readHook<PairingRow[]>(page, 'pairingPanelOrder')).map((r) => r.id)

// ── Live mode ────────────────────────────────────────────────────────────────

test.describe('Pairing ID filter — Live', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, request)
    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectPairingPaneVisible()
    await expect.poll(async () => (await counts(page)).pairing, {
      timeout: 30_000, message: 'pairings loaded',
    }).toBeGreaterThan(1)
  })

  test('Live-1180 — Pairing ID filter shows ONLY the typed pairing ids (hard filter, both removed) @smoke', async ({ page }) => {
    const loaded = await readHook<PairingRow[]>(page, 'pairings')
    test.skip(loaded.length < 3, `need ≥3 loaded pairings to prove narrowing (have ${loaded.length})`)

    // Pick two distinct ids from the loaded set, leaving at least one OUT.
    const picked = [String(loaded[0].id), String(loaded[1].id)]

    await openFilter(page, 'pairing')
    await enterPairingIds(page, picked)
    await applyFilterLight(page)

    // The pane must render EXACTLY the two requested pairings — not float them.
    await expect.poll(() => renderedPairingCount(page), {
      message: 'pairing pane renders exactly the 2 requested ids',
    }).toBe(2)

    expect((await panelIds(page)).sort(), 'displayed pairing ids == the typed ids')
      .toEqual([...picked].sort())

    // The active filter is surfaced as a Pairing ID condition chip.
    await expect(
      dashboard.pairingPane.locator('[data-testid="pane-filter-chip"][title="Pairing ID: ' + picked[0] + '"]'),
    ).toHaveCount(1)
  })

  test('Live-1289 — a non-existent pairing id yields 0 rows (proves filter hides, not floats)', async ({ page }) => {
    const before = await renderedPairingCount(page)
    expect(before, 'pane drew rows before filtering').toBeGreaterThan(0)

    await openFilter(page, 'pairing')
    await enterPairingIds(page, ['-999999']) // no pairing can have this id
    await applyFilterLight(page)

    await expect.poll(() => renderedPairingCount(page), {
      message: 'unknown id hides everything (a float would leave all rows visible)',
    }).toBe(0)
  })
})

// ── Scenario mode (mocked gantt-data with known ids) ─────────────────────────

const DEMO_SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const DEMO_SCENARIO_ID = 6

const MOCK_PAIRINGS = [2001, 2002, 2003, 2004, 2005].map((pid, i) => ({
  pairingId: pid, pairingLabel: `E${pid}`, base: 'YEG', assignment: 'FLT', division: 'Pilots',
  assignmentGroup: 'FLT',
  schStrDtUtc: `2026-03-0${2 + i}T08:00:00.000Z`, schEndDtUtc: `2026-03-0${2 + i}T16:00:00.000Z`,
  compositions: [{ rank: 'CA', plan: 1, fill: 0 }],
}))

const MOCK_PAIRING_SEGMENTS = MOCK_PAIRINGS.map((p, i) => ({
  pairingId: p.pairingId, dutySeq: 1, segSeq: 1, fltId: 6000 + i, fltDt: `2026-03-0${2 + i}`,
  fltNum: `200${i}`, airline: 'F8', depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLT',
  schStrDtUtc: p.schStrDtUtc, schEndDtUtc: p.schEndDtUtc,
  dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
  dutySchStrDtUtc: p.schStrDtUtc, dutySchEndDtUtc: p.schEndDtUtc,
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
  crew: Array.from({ length: 5 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, base: 'YEG', division: 'Pilots',
    rank: 'CA', seniorityNum: String(i + 1), crewName: `Crew ${i + 1}`,
  })),
  pairings: MOCK_PAIRINGS,
  assignments: MOCK_PAIRINGS.map((p, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`, pairingId: p.pairingId, source: 'CR' as const,
  })),
  pairingSegments: MOCK_PAIRING_SEGMENTS,
  flights: [],
  groundItems: [],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

const expectScenarioPairingRows = async (page: Page, n: number, description: string): Promise<void> => {
  await expect.poll(() => renderedPairingCount(page), { timeout: 8_000, message: description }).toBe(n)
}

const openScenarioPairingFilter = async (page: Page): Promise<void> => {
  const filterBtns = page.getByTestId('pane-filter-button')
  const count = await filterBtns.count()
  const filterBtn = count >= 2 ? filterBtns.nth(1) : filterBtns.first()
  await filterBtn.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-tab-pairing').click()
}

test.describe('Pairing ID filter — Scenario', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)

    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/gantt-data`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_GANTT_DATA, message: 'ok' }) }))
    await page.route(`**/api/scenario/${DEMO_SCENARIO_ID}/lock-status`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: MOCK_LOCK_STATUS, message: 'ok' }) }))

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const item = await scenario.scenarioRow(DEMO_SCENARIO_ID, DEMO_SCENARIO_NAME)
    await item.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-open-btn').click()

    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 10_000 })
    await expectScenarioPairingRows(page, 5, 'all 5 mocked pairings render before test starts')
  })

  test('Scen-2440 — Pairing ID filter narrows the scenario pane to exactly the typed ids @smoke', async ({ page }) => {
    await openScenarioPairingFilter(page)
    await enterPairingIds(page, ['2001', '2003'])
    await applyFilterLight(page)

    await expectScenarioPairingRows(page, 2, 'only pairings 2001 + 2003 remain')
    expect((await panelIds(page)).sort(), 'displayed scenario pairing ids == typed ids')
      .toEqual(['2001', '2003'])
  })

  test('Scen-2441 — a single Pairing ID shows exactly one pairing', async ({ page }) => {
    await openScenarioPairingFilter(page)
    await enterPairingIds(page, ['2002'])
    await applyFilterLight(page)

    await expectScenarioPairingRows(page, 1, 'only pairing 2002 remains')
    expect(await panelIds(page)).toEqual(['2002'])
  })
})
