/**
 * Crew header bell click → per-crew violations popup (Scenario + Live)
 *
 * Scen-2045 — Scenario: clicking a crew header bell opens ViolationListDialog filtered to
 *   that crew's violations only.
 * Viol-8012 — Live: same interaction — clicking the per-crew gutter bell in the Live roster
 *   opens the shared ViolationListDialog showing only that crew's violations.
 *
 * When a crew row in the roster left panel carries a bell (maxViolationSeverity > 0),
 * clicking that bell must open the shared ViolationListDialog filtered to ONLY that crew's
 * violations. This is distinct from the toolbar bell (Alert Center, shows ALL violations)
 * and the hover tooltip (pointer-events:none).
 *
 * §Gantt-Unify: one code path for both Live and Scenario via SharedRosterPane.onViolationClick.
 * §No-Illusion: asserts dialog opened with rows for the specific crew, not just visibility.
 */
import { test, expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, seedScenarioListMocks, setDateRange } from '../../utils/gantt-hook'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

/** From gantt-constants.ts — keep in sync if those change. */
const HEADER_HEIGHT = 30
const ROW_HEIGHT = 43

// ─── Scenario mock data (deterministic, no backend required) ──────────────────

const SCENARIO_ID = 6
const SCENARIO_NAME = 'RO-2026-06 YEG Test---'
const SCENARIO_PAIRING_ID = 71301

const MOCK_GANTT_DATA = {
  scenarioId: SCENARIO_ID,
  scenarioName: SCENARIO_NAME,
  fileType: 'RO' as const,
  strDtLoc: '2026-06-01T00:00:00.000Z',
  endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00',
  scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 0,
  dataSource: 'snapshot' as const,
  // 6 crew: C0001 (seniority 1) and C0003 (seniority 3) carry violations.
  crew: Array.from({ length: 6 }, (_, i) => ({
    crewId: `C${String(i + 1).padStart(4, '0')}`,
    base: 'YEG',
    division: 'Pilots',
    rank: i % 2 === 0 ? 'CA' : 'FO',
    seniorityNum: String(i + 1),
    crewName: `Crew ${i + 1}`,
  })),
  pairings: [{
    pairingId: SCENARIO_PAIRING_ID,
    pairingLabel: '71301',
    base: 'YEG',
    schStrDtUtc: '2026-06-02T08:00:00.000Z',
    schEndDtUtc: '2026-06-02T18:00:00.000Z',
    assignmentGroup: 'FLT',
    assignment: 'FLY',
    division: 'Pilots',
    compositions: [{ rank: 'CA', plan: 1, fill: 1 }],
  }],
  assignments: [{ crewId: 'C0001', pairingId: SCENARIO_PAIRING_ID, source: 'CR' as const }],
  pairingSegments: [],
  flights: [],
  // Give C0001 and C0003 a ground item each so they have at least one roster item.
  // buildViolationMap only bumps items in itemsByCrew — empty crew has no items to bump
  // → maxViolationSeverity stays 0 even when violations exist in the store.
  groundItems: [
    { crewId: 'C0001', assignmentGroup: 'DO', assignment: 'DO', schStrDtUtc: '2026-06-01T00:00:00', schEndDtUtc: '2026-06-01T23:59:59', actingRank: 'CA', source: 'CR' as const },
    { crewId: 'C0003', assignmentGroup: 'DO', assignment: 'DO', schStrDtUtc: '2026-06-01T00:00:00', schEndDtUtc: '2026-06-01T23:59:59', actingRank: 'FO', source: 'CR' as const },
  ],
  crewStats: {},
}

const MOCK_LOCK_STATUS = { locked: false, owner: null, ttl: null, isOwner: false }

/** C0001 gets 2 violations; C0003 gets 1. C0001 is row 0 (seniority 1 = topmost). */
const MOCK_LEGALITY = {
  status: 'READY' as const,
  violations: [
    {
      crew_id: 'C0001', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '006',
      severity: 3, actual_value: null, limit_value: null, unit: null,
      message: 'Cumulative block hours exceeded',
      start_dt: '2026-06-01T00:00:00', end_dt: '2026-06-30T00:00:00',
    },
    {
      crew_id: 'C0001', pairing_id: null, duty_seq: null, rule_code: '8056', rule_instance: '001',
      severity: 2, actual_value: null, limit_value: null, unit: null,
      message: 'Minimum rest between duties violated',
      start_dt: '2026-06-05T00:00:00', end_dt: '2026-06-06T00:00:00',
    },
    {
      crew_id: 'C0001', pairing_id: 71301, duty_seq: null, rule_code: '8002', rule_instance: '001',
      severity: 3, actual_value: 3660, limit_value: 3600, unit: 'MINUTE',
      message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
      start_dt: '2026-07-13T12:00:00.000Z',
      end_dt: '2026-07-13T18:00:00.000Z',
      window_start_dt: '2026-06-16T00:00:00.000Z',
      window_end_dt: '2026-07-13T00:00:00.000Z',
    },
    {
      crew_id: 'C0003', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '006',
      severity: 3, actual_value: null, limit_value: null, unit: null,
      message: 'Cumulative block hours exceeded',
      start_dt: '2026-06-01T00:00:00', end_dt: '2026-06-30T00:00:00',
    },
  ],
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data: body, message: 'ok' }),
})

// ─── Shared helper: click the bell at a given row index in the named canvas ──

/**
 * Click the violation bell for the crew at the given panel row index.
 * The bell is drawn at the right edge of the header canvas (width - 10 px);
 * the row centre Y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + half-row-height.
 * Assumes scrollY = 0 (top of roster).
 */
async function clickCrewBell(
  page: Page,
  canvasTestId: string,
  rowIndex: number,
  paneTypePrefix: string,
): Promise<void> {
  const point = await crewBellPoint(page, canvasTestId, rowIndex, paneTypePrefix)
  await page.mouse.click(point.x, point.y)
}

async function hoverCrewBell(
  page: Page,
  canvasTestId: string,
  rowIndex: number,
  paneTypePrefix: string,
): Promise<void> {
  const point = await crewBellPoint(page, canvasTestId, rowIndex, paneTypePrefix)
  await page.mouse.move(point.x, point.y)
}

async function crewBellPoint(
  page: Page,
  canvasTestId: string,
  rowIndex: number,
  paneTypePrefix: string,
): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId(canvasTestId)
  const box = await canvas.boundingBox()
  if (!box) throw new Error(`${canvasTestId} has no bounding box`)
  const scrollY = await page.evaluate((prefix) => {
    const testApi = (window as unknown as {
      __ganttTest?: { paneScrollY?: (paneTypePrefix: string) => number }
    }).__ganttTest
    return testApi?.paneScrollY?.(prefix) ?? 0
  }, paneTypePrefix)
  return {
    x: box.x + box.width - 10,
    y: box.y + HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2,
  }
}

const readScenarioRosterPuck = (
  page: Page,
  wantPairingId: number,
): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number } | null> =>
  page.evaluate(
    ({ sid, pid }) => window.__ganttTest?.scenarioRosterPuck?.(sid, pid) ?? null,
    { sid: SCENARIO_ID, pid: wantPairingId },
  )

async function hoverScenarioRosterPuck(
  page: Page,
  wantPairingId: number,
): Promise<{ x: number; y: number; pairingId: number; crewId: string; itemId: number }> {
  await expect
    .poll(() => readScenarioRosterPuck(page, wantPairingId), {
      timeout: 15_000,
      message: 'scenario roster pairing puck should render before hover',
    })
    .not.toBeNull()
  const puck = await readScenarioRosterPuck(page, wantPairingId)
  if (!puck) throw new Error('scenario roster puck probe returned null after poll')
  const canvas = page.getByTestId('scenario-roster-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('scenario-roster-canvas has no bounding box')
  await page.mouse.move(box.x + puck.x, box.y + puck.y)
  return puck
}

async function openMockScenario(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  await seedGanttAuth(page, request)
  // seedScenarioListMocks sets up a catch-all abort + scenario list/detail/KPI mocks.
  // Routes registered AFTER (below) override the catch-all due to LIFO priority.
  await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
  await page.route(`**/api/scenario/${SCENARIO_ID}/gantt-data`, (route) => route.fulfill(json(MOCK_GANTT_DATA)))
  await page.route(`**/api/scenario/${SCENARIO_ID}/lock-status`, (route) => route.fulfill(json(MOCK_LOCK_STATUS)))
  await page.route(`**/api/scenario/${SCENARIO_ID}/legality`, (route) => route.fulfill(json(MOCK_LEGALITY)))

  const scenario = new ScenarioPage(page)
  await scenario.gotoRo()
  const item = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
  await item.click()
  await expect(scenario.detailPanel).toBeVisible()
  await scenario.detailPanel.getByTestId('scenario-open-btn').click()

  const view = page.getByTestId('scenario-gantt-view')
  await expect(view).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 10_000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Scen-2045 — Scenario: clicking crew header bell opens per-crew popup
// Fully mocked — no backend required.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Scen-2045 — Scenario crew header bell click opens per-crew violations popup', () => {
  test('Scenario roster puck hover shows Scenario violation tooltip', async ({ page, request }) => {
    await openMockScenario(page, request)

    await expect(page.getByTestId('scenario-gantt-view').getByTestId('violations-button-count')).toHaveText('4', { timeout: 15_000 })
    const puck = await hoverScenarioRosterPuck(page, SCENARIO_PAIRING_ID)
    expect(puck.crewId).toBe('C0001')

    const scenarioTooltip = page.locator('div.fixed', { hasText: 'Rule Violations' }).last()
    await expect(scenarioTooltip).toBeVisible({ timeout: 5_000 })
    await expect(scenarioTooltip).toContainText('8002/001')
    await expect(scenarioTooltip).toContainText('2026-06-16..2026-07-13')
    await expect(scenarioTooltip).not.toContainText('Cumulative block hours exceeded')
    await expect(scenarioTooltip).not.toContainText('Minimum rest between duties violated')
  })

  test('Scen-2045 — click crew row bell in Scenario → ViolationListDialog shows only that crew violations', async ({ page, request }) => {
    await openMockScenario(page, request)
    const view = page.getByTestId('scenario-gantt-view')

    // Wait for the bell badge AND the panel rows to reflect violations.
    // The badge proves violations reached the store; the poll waits for the
    // shared roster model to rebuild with non-zero maxViolationSeverity.
    await expect(view.getByTestId('violations-button-count')).toHaveText('4', { timeout: 15_000 })
    await expect
      .poll(
        () => page.evaluate(() => window.__ganttTest?.scenarioCrewViolationSeverities?.()[0]?.severity ?? 0),
        { timeout: 5_000, message: 'C0001 panel row must carry violation severity > 0 after badge shows 3' },
      )
      .toBeGreaterThan(0)
    const liveTaskSeverities = await page.evaluate(() => {
      const rows = window.__ganttTest?.scenarioCrewViolationSeverities?.() ?? []
      return rows.find((r) => r.crewId === 'C0001')?.severity ?? 0
    })
    expect(liveTaskSeverities).toBeGreaterThan(0)

    // C0001 is at row 0 (seniority 1 = topmost). Both violations belong to C0001.
    const severities = await page.evaluate(() =>
      window.__ganttTest?.scenarioCrewViolationSeverities?.() ?? [],
    )
    expect(severities[0]?.crewId, 'C0001 (seniority 1) should be the first panel row').toBe('C0001')

    // ── Hover the bell on row 0 → shared tooltip lists C0001's scenario violations ──
    await hoverCrewBell(page, 'pane-header-canvas-scenario-roster', 0, 'scenario-roster')
    const scenarioTooltip = page.locator('div.fixed', { hasText: 'Rule Violations' }).last()
    await expect(scenarioTooltip).toBeVisible({ timeout: 5_000 })
    await expect(scenarioTooltip).toContainText('8002/001')
    await expect(scenarioTooltip).toContainText('8056/001')
    await expect(scenarioTooltip).toContainText('2026-06-16..2026-07-13')

    // ── Click the bell on row 0 → per-crew popup with C0001's violations only ──
    await clickCrewBell(page, 'pane-header-canvas-scenario-roster', 0, 'scenario-roster')

    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Must show only C0001's 3 violations — not C0003's 1.
    const rows = dialog.locator('[data-testid="violation-list-row"]')
    await expect(rows).toHaveCount(3)
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute('data-crew-id', 'C0001')
    }
    // Both rule codes are present.
    await expect(dialog.locator('[data-rule-code="8002"]')).toHaveCount(2)
    await expect(dialog.locator('[data-rule-code="8056"]')).toHaveCount(1)
    await expect(dialog.locator('[data-rule-id="8002/001"]')).toHaveCount(1)
    await expect(dialog.locator('[data-rule-id="8002/001"]')).toContainText('2026-06-16..2026-07-13')

    // ── Close (X button in title bar) and click row 2 (C0003) ──
    // Use testid to avoid ambiguity: AppDialog renders both an X (aria-label="Close") in the
    // title bar AND a "Close" button in the footer — getByRole would match both.
    await page.getByTestId('violation-list-dialog-close').click()
    await expect(dialog).not.toBeVisible({ timeout: 3_000 })

    await clickCrewBell(page, 'pane-header-canvas-scenario-roster', 2, 'scenario-roster')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    const rows2 = dialog.locator('[data-testid="violation-list-row"]')
    await expect(rows2).toHaveCount(1)
    await expect(rows2.first()).toHaveAttribute('data-crew-id', 'C0003')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Viol-8012 — Live: clicking crew header bell opens per-crew popup
// Requires live-server running with F8 violations loaded under pbs_solver_ruleset.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Viol-8012 — Live crew header bell click opens per-crew violations popup', () => {
  test('Viol-8012 — click crew row bell in Live → ViolationListDialog shows only that crew violations', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    // Poll until the persisted Live violation source exposes an owner crew and the
    // matching row in the panel carries a violation bell.
    // waitForFunction returns a JSHandle; .jsonValue() extracts the typed value.
    type SevRow = { crewId: string; severity: number }
    const handle = await page.waitForFunction(
      () => {
        const testApi = (window as unknown as {
          __ganttTest?: {
            crewViolationSeverities?: () => SevRow[]
            liveViolations?: () => Array<{ crewId?: string }>
          }
        }).__ganttTest
        const sevs = testApi?.crewViolationSeverities?.() ?? []
        const ownerCrewIds = new Set((testApi?.liveViolations?.() ?? []).map((v) => v.crewId).filter(Boolean))
        const idx = sevs.findIndex((s) => ownerCrewIds.has(s.crewId) && s.severity > 0)
        return idx >= 0 ? { crewId: sevs[idx].crewId, rowIndex: idx } : null
      },
      undefined,
      { timeout: 30_000 },
    )
    const bellCrew = await handle.jsonValue() as { crewId: string; rowIndex: number }
    if (!bellCrew) throw new Error('No crew with violation bell found in Live roster')

    await expect(page.getByTestId('pane-header-canvas-roster-main')).toBeVisible({ timeout: 10_000 })

    await page.evaluate(({ rowIndex, rowHeight }) => {
      const testApi = (window as unknown as {
        __ganttTest?: {
          paneScrollY?: (paneTypePrefix: string) => number
          scrollPaneVertically?: (paneTypePrefix: string, dy: number) => string[]
        }
      }).__ganttTest
      const current = testApi?.paneScrollY?.('roster-main') ?? 0
      const target = Math.max(0, rowIndex * rowHeight - rowHeight)
      testApi?.scrollPaneVertically?.('roster', target - current)
    }, { rowIndex: bellCrew.rowIndex, rowHeight: ROW_HEIGHT })

    await clickCrewBell(page, 'pane-header-canvas-roster-main', bellCrew.rowIndex, 'roster')

    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Every row in the per-crew popup belongs to the clicked crew.
    const rows = dialog.locator('[data-testid="violation-list-row"]')
    await expect(rows).not.toHaveCount(0)
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute('data-crew-id', bellCrew.crewId)
    }
    const liveViolations = await page.evaluate(() => {
      const t = (window as unknown as {
        __ganttTest?: { liveViolations?: () => Array<{ crewId?: string; ruleCode: string; message: string }> }
      }).__ganttTest
      return t?.liveViolations?.() ?? []
    })
    expect(
      liveViolations.some((v) => v.crewId === bellCrew.crewId),
      'Live persisted violation source must retain the owner crewId used by the per-crew dialog',
    ).toBeTruthy()

    // The full Alert Center (toolbar bell) still works independently and shows ALL violations.
    await page.getByTestId('violation-list-dialog-close').click()
    await expect(dialog).not.toBeVisible({ timeout: 3_000 })

    await page.getByTestId('violations-button').first().click()
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    const allCrewIds = await dialog
      .locator('[data-testid="violation-list-row"]')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-crew-id') ?? ''))])
    expect(allCrewIds.length, 'Alert Center must contain rows for more than one crew').toBeGreaterThan(1)
  })

  test('Viol-8013 — Live June crew bell hover includes cross-window 8002 owned by that crew', async ({ page, request }) => {
    test.setTimeout(360_000)

    await seedGanttAuth(page, request)
    await gotoGantt(page)

    await setDateRange(page, '2026-06-01', '2026-06-30')

    await page.getByTestId('filter-btn').click({ noWaitAfter: true })
    const filterDialog = page.getByTestId('filter-dialog')
    await expect(filterDialog).toBeVisible({ timeout: 5_000 })
    await filterDialog.getByTestId('filter-tab-crew').click()
    await filterDialog.getByTestId('filter-crew-id').fill('2380')
    await filterDialog.getByTestId('filter-crew-id').press('Enter')
    await filterDialog.getByTestId('filter-apply').click()
    await expect(filterDialog).toBeHidden({ timeout: 10_000 })

    await expect
      .poll(
        () => page.evaluate(() => {
          const t = (window as unknown as {
            __ganttTest?: {
              liveViolations?: () => Array<{ crewId?: string; ruleCode: string }>
            }
          }).__ganttTest
          return (t?.liveViolations?.() ?? []).some((v) => v.crewId === '2380' && v.ruleCode === '8002')
        }),
        { timeout: 60_000, intervals: [1000], message: 'crew 2380 June window should load persisted 8002' },
      )
      .toBeTruthy()

    const rowIndex = await page.evaluate(() => {
      const rows = window.__ganttTest?.crewViolationSeverities?.() ?? []
      return rows.findIndex((r) => r.crewId === '2380' && r.severity > 0)
    })
    expect(rowIndex, 'crew 2380 must have a visible violation bell row').toBeGreaterThanOrEqual(0)

    await expect(page.getByTestId('pane-header-canvas-roster-main')).toBeVisible({ timeout: 10_000 })
    await hoverCrewBell(page, 'pane-header-canvas-roster-main', rowIndex, 'roster')

    const tooltip = page.locator('div.fixed', { hasText: 'Rule Violations' }).last()
    await expect(tooltip).toBeVisible({ timeout: 5_000 })
    await expect(tooltip).toContainText('8002/001')
  })
})
