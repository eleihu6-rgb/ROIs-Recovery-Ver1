import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, seedScenarioListMocks } from '../../utils/gantt-hook'

const SCENARIO_ID = 679
const SCENARIO_NAME = 'SIT Scenario KPI Canonical'

const ok = (data: unknown): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, data, message: 'ok' }),
})

const reportShapedResults = {
  kpi: [],
  creditHours: [],
  uncovered: [],
  distribution: {
    version: 2,
    window: { start: '2026-07-01T06:00:00.000Z', end: '2026-07-05T06:00:00.000Z' },
    timezones: [{ base: 'YEG', tz: 'America/Edmonton' }],
    crews: [
      {
        crew_id: 'C001',
        rank: 'CA',
        tasks: [{ kind: 'assigned', start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
      },
      {
        crew_id: 'C002',
        rank: 'FO',
        tasks: [{ kind: 'preassign', start: '2026-07-02T00:00:00Z', end: '2026-07-03T00:00:00Z' }],
      },
    ],
    demand: [{ rank: 'CA', reserve: false, start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
  },
  rawResult: {
    metadata: {
      credit_roster_period_note: 'Roster Period: July Jul 01 ~ Jul 31',
      primary_base: 'YEG',
    },
    general_kpi: {
      credit_hour_summary: {
        avg_credit_per_line: 82.5,
        highest_credit_line: 91.2,
        lowest_credit_line: 71.4,
        open_time: 6,
        primary_month: '2026-07',
      },
      credit_hour_report: [
        {
          crew_id: 'C099',
          base: 'YEG',
          rank: 'FO',
          credited_hours: 88,
          credit_min: 75,
          credit_max: 92,
          pre_assigned_types: 'SIM x1',
          in_range: true,
          available_days: 22,
          per_day_rate: 2.8,
          period_credit_target: 82,
          target_gap: 6,
          preassign_rest_days: 0,
          required_dayoff: 8,
          actual_dayoff: 8,
          dayoff_ok: true,
        },
      ],
      reserve_line_summary: { pairing_lines: 4, full_pairing_lines: 2, reserve_lines: 1 },
      crew_reserve_detail: [
        { crew_id: 'C001', rank: 'CA', pairing_count: 4, reserve_count: 1, total_tasks: 5 },
        { crew_id: 'C002', rank: 'FO', pairing_count: 1, reserve_count: 3, total_tasks: 4 },
      ],
      reserve_distribution: [{ date: '2026-07-02', am_count: 2, pm_count: 1, other_count: 0 }],
    },
    resultMeta: {
      credit_hour_report: [
        {
          crew_id: 'C001',
          base: 'YVR',
          rank: 'CA',
          credited_hours: 82.5,
          credit_min: 75,
          credit_max: 92,
          pre_assigned_types: 'GDO x2',
          available_days: 22,
          period_credit_target: 82,
          target_gap: 0.5,
          dayoff_ok: true,
          credit_timezone: 'America/Vancouver',
        },
      ],
    },
    scheduling_details: {
      unassigned_summary: [
        {
          month: '2026-07',
          assigned_pairing_slots: 3,
          unassigned_pairing_slots: 1,
          unassigned_pairing_credit_hours: 10.5,
          assigned_reserve_slots: 2,
          unassigned_reserve_slots: 0,
          unassigned_reserve_credit_hours: 0,
        },
      ],
      lost_pairings: [
        {
          coverage_type: 'Pairing',
          task_id: 'P1_CA_0',
          original_pairing_id: 'P1',
          interface_id: 'P1IF',
          name: '858',
          base: 'YVR',
          rank: 'CA',
          assignment: 'FLY',
          start_base: '2026-07-03T15:30:00Z',
          end_base: '2026-07-04T18:45:00Z',
          credit: 10.5,
          coverage_status: 'unassigned',
          assigned_crew: '',
          is_fixed: false,
        },
      ],
      lost_reserves: [],
      pairing_complement: [
        {
          coverage_type: 'Pairing',
          task_id: 'P1_CA_0',
          original_pairing_id: 'P1',
          interface_id: 'P1IF',
          name: '858',
          base: 'YVR',
          rank: 'CA',
          assignment: 'FLY',
          start_base: '2026-07-03T15:30:00Z',
          end_base: '2026-07-04T18:45:00Z',
          credit: 10.5,
          coverage_status: 'unassigned',
          assigned_crew: '',
          is_fixed: false,
        },
      ],
      pre_assignment_detail: [],
    },
  },
}

test.describe('Scenario KPI Results', () => {
  test('Scen-2092 — DONE scenario renders eight canonical KPI cards in fixed order', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
    await page.route(
      (url) => url.pathname === `/altair/live/api/scenario/${SCENARIO_ID}/results`,
      (route) => route.fulfill(ok({
        kpi: [
          { id: 7, scenarioId: SCENARIO_ID, kpiNames: 'Pairing Coverage', kpiValues: '100.0%', description: '3 / 3 planned slots', idx: 7, type: 'UTILIZATION' },
          { id: 2, scenarioId: SCENARIO_ID, kpiNames: 'Assigned', kpiValues: '162', description: 'FLY:145 / DO:16 / CRPM:1', idx: 2, type: 'UTILIZATION' },
          { id: 1, scenarioId: SCENARIO_ID, kpiNames: 'Crew Utilized', kpiValues: '148', description: 'FO:100 / IFD:48', idx: 1, type: 'UTILIZATION' },
          { id: 8, scenarioId: SCENARIO_ID, kpiNames: 'Reserve Coverage', kpiValues: '50.0%', description: '1 / 2 planned slots', idx: 8, type: 'UTILIZATION' },
          { id: 3, scenarioId: SCENARIO_ID, kpiNames: 'Highest Credit', kpiValues: '98.4h', description: 'max monthly credit', idx: 3, type: 'COST' },
          { id: 6, scenarioId: SCENARIO_ID, kpiNames: 'Reserve Lines', kpiValues: '1', description: 'Pre-Assignment: 0 / Optimize: 1', idx: 6, type: 'UTILIZATION' },
          { id: 4, scenarioId: SCENARIO_ID, kpiNames: 'Avg Credit Hours', kpiValues: '75.0h', description: '(2026RP07) Total Credit 10,125.0h / (148 - 13[0 Credit])', idx: 4, type: 'COST' },
          { id: 5, scenarioId: SCENARIO_ID, kpiNames: 'Pairing Lines', kpiValues: '145', description: 'Pre-Assignment: 10 / Optimize: 135', idx: 5, type: 'UTILIZATION' },
        ],
        creditHours: [],
        uncovered: [],
        distribution: [],
        rawResult: null,
      })),
    )

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const cards = scenario.detailPanel.getByTestId('kpi-card')
    await expect(cards).toHaveCount(8)
    await expect(cards.locator('[data-testid="kpi-card-name"]')).toHaveText([
      'Crew Utilized',
      'Assigned',
      'Highest Credit',
      'Avg Credit Hours',
      'Pairing Lines',
      'Reserve Lines',
      'Pairing Coverage',
      'Reserve Coverage',
    ])

    await expect(cards.nth(1).getByTestId('kpi-card-description')).toHaveText('FLY:145 / DO:16 / CRPM:1')
    await expect(cards.nth(3).getByTestId('kpi-card-description')).toContainText('(2026RP07) Total Credit')
    await expect(cards.nth(0).getByTestId('kpi-card-description')).toHaveText('FO:100 / IFD:48')
  })

  test('Scen-2093 — Scenario result tabs expose report-shaped Credit, Uncovered, and Distribution controls', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
    await page.route(
      (url) => url.pathname === `/altair/live/api/scenario/${SCENARIO_ID}/results`,
      (route) => route.fulfill(ok(reportShapedResults)),
    )
    await page.route(
      (url) => url.pathname === '/altair/live/api/base/airport-timezones',
      (route) => route.fulfill(ok({ YVR: 'America/Vancouver' })),
    )

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()

    const tabRail = scenario.detailPanel.getByTestId('scenario-result-tab-rail')
    await expect(tabRail).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-result-tab-kpi')).toHaveAttribute('aria-selected', 'true')

    await scenario.detailPanel.getByTestId('scenario-result-tab-credit-hours').click()
    await expect(scenario.detailPanel.getByTestId('scenario-result-tab-credit-hours')).toHaveAttribute('aria-selected', 'true')
    await expect(scenario.detailPanel.getByText('Credit Hours per Crew')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Pre Assigned Types')).toBeVisible()
    // report-shaped general_kpi.credit_hour_report is the preferred path (C099
    // exists only there, not in resultMeta.credit_hour_report)
    await expect(scenario.detailPanel.getByText('C099')).toBeVisible()
    await expect(scenario.detailPanel.getByText('SIM x1')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-credit-hours-table-export')).toBeVisible()

    await scenario.detailPanel.getByTestId('scenario-result-tab-uncovered').click()
    await expect(scenario.detailPanel.getByTestId('scenario-result-tab-uncovered')).toHaveAttribute('aria-selected', 'true')
    await expect(scenario.detailPanel.getByText('Uncovered Pairings & Reserves')).toBeVisible()
    await expect(scenario.detailPanel.getByText('1 row')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Pairing Id')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Task Id')).toBeVisible()
    await expect(scenario.detailPanel.getByText('858')).toBeVisible()
    await expect(scenario.detailPanel.getByText('2026-07-03 08:30')).toBeVisible()
    await expect(scenario.detailPanel.getByText('2026-07-04 11:45')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-uncovered-table-export')).toBeVisible()

    await scenario.detailPanel.getByTestId('scenario-result-tab-distribution').click()
    await expect(scenario.detailPanel.getByTestId('scenario-result-tab-distribution')).toHaveAttribute('aria-selected', 'true')
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-view-chart')).toHaveAttribute('aria-pressed', 'true')
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-chart')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-uncovered-chart')).toBeVisible()
    const distributionPlot = scenario.detailPanel.getByTestId('scenario-distribution-load-plot')
    const distributionSvg = distributionPlot.locator('svg')
    const [plotBox, svgBox] = await Promise.all([distributionPlot.boundingBox(), distributionSvg.boundingBox()])
    expect(plotBox).not.toBeNull()
    expect(svgBox).not.toBeNull()
    expect(svgBox!.width).toBeGreaterThan(plotBox!.width * 0.95)
    await expect(distributionSvg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
    const viewBox = await distributionSvg.getAttribute('viewBox')
    const viewBoxWidth = Number(viewBox?.split(/\s+/)[2])
    expect(viewBoxWidth).toBeGreaterThan(0)
    expect(Math.abs(viewBoxWidth - svgBox!.width)).toBeLessThan(2)
    await scenario.detailPanel.getByTestId('scenario-distribution-load-plot').locator('[role="button"]').first().hover({ force: true })
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-load-tooltip')).toContainText('Available crew')
    await scenario.detailPanel.getByTestId('scenario-distribution-uncovered-plot').locator('[role="button"]').first().hover({ force: true })
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-uncovered-tooltip')).toContainText('Open slots')
    await expect(scenario.detailPanel.getByText('Assigned slots')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Uncovered slots')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Peak day load')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Crew utilization')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Daily duty load vs available crew')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Uncovered demand')).toBeVisible()
    await expect(scenario.detailPanel.getByText('slot-days · YEG local · a multi-day pairing counts on each day it spans')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-rank-all')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-rank-ca')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-tz-utc')).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-tz-yeg')).toBeVisible()
    await expect(scenario.detailPanel.locator('[data-testid="dist-weekend"]').first()).toBeVisible()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-chart').getByTestId('dist-legend')).toContainText('Available crew')
    await scenario.detailPanel.getByTestId('scenario-distribution-view-table').click()
    await expect(scenario.detailPanel.getByTestId('scenario-distribution-table')).toBeVisible()
    await expect(scenario.detailPanel.getByText('On duty')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Unc. pairing')).toBeVisible()
    await expect(scenario.detailPanel.getByText('Σ slot-days')).toBeVisible()
  })

  test('Scen-2094 — Version Differences keeps credit-range rows and shows regulatory tables read-only', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await seedScenarioListMocks(page, SCENARIO_ID, SCENARIO_NAME)
    await page.route(
      (url) => url.pathname === `/altair/live/api/scenario/${SCENARIO_ID}/versions`,
      (route) => route.fulfill(ok({
        items: [{
          version: 'v1',
          taskId: null,
          status: 'DONE',
          archivePath: null,
          filePath: null,
          inputPath: null,
          fileSize: null,
          checksum: null,
          executedBy: 'test',
          executedAt: null,
          fileTimestamp: null,
          isCurrent: false,
          hasDifferences: true,
        }],
      })),
    )
    await page.route(
      (url) => url.pathname === `/altair/live/api/scenario/${SCENARIO_ID}/versions/v1/diff`,
      (route) => route.fulfill(ok({
        algorithmParameters: [
          {
            path: 'algorithm.credit_range',
            current: { min: { CA: 76, FO: 80 }, max: { CA: 92, FO: 85 } },
            version: { min: { CA: 75, FO: 80 }, max: { CA: 92, FO: 85 } },
          },
          {
            path: 'algorithm.min_reserve_covered_pct',
            current: { pct: 2 },
            version: { pct: 0 },
          },
          {
            path: 'algorithm.floor_rescue_rules',
            current: { reserve_single_days: false, reserve_day_balance: true },
            version: { reserve_single_days: true, reserve_day_balance: true },
          },
        ],
        ruleParameters: [{
          path: 'rules.8002001',
          current: { tables: [{ header: ['Bases', 'Min'], rows: [['YVR', '12'], ['YYZ', '15']] }] },
          version: { tables: [{ header: ['Bases', 'Min'], rows: [['YVR', '10'], ['YYZ', '15']] }] },
        }],
      })),
    )

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(SCENARIO_ID, SCENARIO_NAME)
    await row.click()
    await expect(scenario.detailPanel).toBeVisible()
    await scenario.detailPanel.getByTestId('scenario-result-tab-versions').click()
    await expect(scenario.detailPanel.getByTestId('scenario-version-diff-v1')).toBeEnabled()
    await scenario.detailPanel.getByTestId('scenario-version-diff-v1').click()

    const dialog = page.getByTestId('scenario-version-diff-dialog')
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox, 'Version Differences dialog should use the wide desktop layout').not.toBeNull()
    expect(dialogBox!.width).toBeGreaterThan(1000)
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.credit_range')).toContainText('CA')
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.credit_range')).toContainText('76')
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.credit_range').locator('td').first()).toHaveText('credit_range')
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.min_reserve_covered_pct')).toContainText('2')
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.floor_rescue_rules').locator('td').first()).toHaveText('floor_rescue_rules')
    await expect(dialog.getByTestId('scenario-version-diff-row-algorithm.floor_rescue_rules').locator('[data-testid="scenario-version-diff-value-current-algorithm.floor_rescue_rules"] .text-destructive')).toHaveCount(1)
    await expect(dialog.getByTestId('scenario-version-diff-nested-table-current-rules.8002001-0')).toContainText('Bases')
    await expect(dialog.getByTestId('scenario-version-diff-nested-table-current-rules.8002001-0')).toContainText('12')
    await expect(dialog.getByTestId('scenario-version-diff-nested-table-current-rules.8002001-0').locator('.text-destructive')).toHaveCount(1)
    await expect(dialog.getByTestId('scenario-version-diff-row-rules.8002001').locator('td').first()).toHaveText('8002001')
    await expect(dialog.getByTestId('scenario-version-diff-nested-table-current-rules.8002001-0').locator('input, select, textarea, button')).toHaveCount(0)
    await expect(dialog.getByTestId('scenario-version-diff-nested-table-version-rules.8002001-0')).toContainText('10')
  })
})
