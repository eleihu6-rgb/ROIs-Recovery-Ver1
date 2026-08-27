import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { scenarioApi } from '@/services/scenario-api'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { ScenarioKpiSection } from '../scenario-kpi-section'
import type { ScenarioKpi, ScenarioResults } from '@/types'

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    getVersions: vi.fn(),
    deleteVersion: vi.fn(),
    getVersionDiff: vi.fn(),
    getNotes: vi.fn().mockResolvedValue({ items: [] }),
  },
}))

const kpi = (id: number, name: string, idx: number, value = '0'): ScenarioKpi => ({
  id,
  scenarioId: 679,
  kpiNames: name,
  kpiValues: value,
  description: null,
  idx,
  type: 'UTILIZATION',
})

const render = (kpis: ScenarioKpi[], results?: ScenarioResults, division?: string): HTMLDivElement => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioKpiSection
      scenarioId={1}
      fileType="RO"
      results={results ?? { kpi: kpis, creditHours: [], uncovered: [], distribution: [], rawResult: null }}
      status="DONE"
      division={division}
    />)
  })
  return container
}

describe('ScenarioKpiSection', () => {
  it('defaults to the KPI tab, sorts cards by idx and renders zero values', () => {
    const container = render([
      kpi(7, 'Pairing Coverage', 7, '0.0%'),
      kpi(2, 'Assigned', 2, '0'),
      kpi(1, 'Crew Utilized', 1, '148'),
      kpi(4, 'Avg Credit Hours', 4, '0.0h'),
    ])

    expect(container.querySelector('[data-testid="scenario-result-tab-kpi"]')?.className).toContain('border-primary')
    expect(container.querySelector('[data-testid="scenario-result-tab-kpi"]')?.className).toContain('bg-primary')
    expect(container.querySelector('[data-testid="scenario-result-tab-kpi"]')?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-testid="scenario-result-tab-credit-hours"]')?.textContent).toBe('Credit Hours')
    expect(container.querySelector('[data-testid="scenario-result-tab-uncovered"]')?.textContent).toBe('Uncovered')
    expect(container.querySelector('[data-testid="scenario-result-tab-distribution"]')?.textContent).toBe('Distribution')

    const names = [...container.querySelectorAll('[data-testid="kpi-card-name"]')]
      .map((el) => el.textContent)
    expect(names).toEqual([
      'Crew Utilized',
      'Assigned',
      'Avg Credit Hours',
      'Pairing Coverage',
    ])
    const assigned = [...container.querySelectorAll('[data-testid="kpi-card"]')]
      .find((el) => el.getAttribute('data-kpi-name') === 'Assigned')
    expect(assigned?.querySelector('[data-testid="kpi-card-value"]')?.textContent).toBe('0')
  })

  it('switches to the Credit Hours tab', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '148')])
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-credit-hours"]') as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('No Credit Hours data available.')
    expect(container.querySelectorAll('[data-testid="kpi-card"]').length).toBe(0)
  })

  it('switches to the Distribution tab', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '148')], {
      kpi: [],
      creditHours: [],
      uncovered: [],
      distribution: [{
        date: '2026-07-01',
        assigned_pairing: 2,
        assigned_reserve: 1,
        uncovered_pairing: 0,
        uncovered_reserve: 3,
        available_crew: 12,
      }],
      rawResult: null,
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-distribution"]') as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('Daily slot-day distribution')
    expect(container.querySelector('[data-testid="scenario-distribution-chart"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-uncovered-chart"]')).not.toBeNull()
    act(() => {
      ;(container.querySelector('[data-testid="scenario-distribution-view-table"]') as HTMLButtonElement).click()
    })
    expect(container.textContent).toContain('On duty')
    expect(container.textContent).toContain('Σ slot-days')
  })

  it('uses report-shaped Credit Hours rows from rawResult', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '148')], {
      kpi: [],
      creditHours: [{ crew_id: 'OLD', rank: 'CA', credit_hours: 1 }],
      uncovered: [],
      distribution: [],
      rawResult: {
        general_kpi: {
          credit_hour_summary: {
            avg_credit_per_line: 82.5,
            highest_credit_line: 91.2,
            lowest_credit_line: 71.4,
            open_time: 6,
            primary_month: '2026-07',
          },
          credit_hour_report: [{ crew_id: 'C001', base: 'YVR', rank: 'FO', credited_hours: 82.5, credit_min: 75, credit_max: 92, pre_assigned_types: 'GDO x2', in_range: false, dayoff_ok: true }],
        },
      },
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-credit-hours"]') as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('Credit Hours per Crew')
    expect(container.textContent).toContain('Crew Id')
    expect(container.textContent).toContain('Credited Hours')
    expect(container.textContent).toContain('Pre Assigned Types')
    expect(container.textContent).toContain('Period Credit Target')
    expect(container.textContent).toContain('Required Dayoff')
    expect(container.textContent).toContain('Actual Dayoff')
    expect(container.textContent).toContain('Dayoff Ok')
    expect(container.textContent).toContain('In Range')
    expect(container.textContent).toContain('C001')
    expect(container.textContent).toContain('82.5')
    expect(container.textContent).not.toContain('Open BLH') // summary tiles removed — report tables carry no headline stats
    expect(container.textContent).not.toContain('OLD')
    expect(container.textContent).not.toContain('Target Min')
    expect(container.textContent).not.toContain('Target Max')
    expect(container.textContent).not.toContain('Credit Period')
  })

  it('uses the fixed Report column set for rich backend Credit Hours rows', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '1')], {
      kpi: [],
      creditHours: [{
        crew_id: 'C001',
        base: 'YVR',
        rank: 'FO',
        credited_hours: 82.5,
        target_min: 75,
        target_max: 92,
        credit_period: '2026RP07',
        credit_min: 75,
        credit_max: 92,
        pre_assigned_types: 'GDO ×2',
        in_range: true,
        available_days: 31,
        per_day_rate: 3,
        period_credit_target: 90,
        target_gap: 7.5,
        preassign_rest_days: 2,
        required_dayoff: 8,
        actual_dayoff: 9,
        dayoff_ok: true,
      }],
      uncovered: [],
      distribution: [],
      rawResult: null,
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-credit-hours"]') as HTMLButtonElement).click()
    })

    const headers = [...container.querySelectorAll('[data-testid="scenario-credit-hours-table"] th')]
      .map((element) => element.textContent)
    expect(headers).toEqual([
      'Crew Id',
      'Base',
      'Rank',
      'Credited Hours',
      'Credit Min',
      'Credit Max',
      'Pre Assigned Types',
      'In Range',
      'Available Days',
      'Per Day Rate',
      'Period Credit Target',
      'Target Gap',
      'Preassign Rest Days',
      'Required Dayoff',
      'Actual Dayoff',
      'Dayoff Ok',
    ])
    expect(headers).not.toContain('Target Min')
    expect(headers).not.toContain('Target Max')
    expect(headers).not.toContain('Credit Period')
  })

  it('reads Credit Hours rows from resultMeta when the engine callback has no general_kpi report', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '1')], {
      kpi: [],
      creditHours: [],
      uncovered: [],
      distribution: [],
      rawResult: {
        resultMeta: {
          credit_hour_report: [{
            crew_id: '113',
            base: 'YVR',
            rank: 'CA',
            credited_hours: 24,
            credit_min: 75,
            credit_max: 92,
            available_days: 18,
            per_day_rate: 3.732,
            period_credit_target: 91.17,
            target_gap: -67.17,
            preassign_rest_days: 0,
            required_dayoff: 13,
            actual_dayoff: 25,
            dayoff_ok: true,
            in_range: false,
          }],
        },
      },
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-credit-hours"]') as HTMLButtonElement).click()
    })

    expect(container.querySelector('[data-testid="scenario-credit-hours-table"]')?.textContent).toContain('113')
    expect(container.querySelector('[data-testid="scenario-credit-hours-table"]')?.textContent).toContain('24')
    expect(container.querySelector('[data-testid="scenario-credit-hours-table"]')?.textContent).toContain('91.17')
    expect(container.textContent).not.toContain('No Credit Hours data available.')
  })

  it('renders the Report Results Uncovered Pairings & Reserves table', () => {
    useAirportTzStore.setState({
      map: { YVR: 'America/Vancouver' },
      loaded: true,
    })
    const container = render([kpi(1, 'Crew Utilized', 1, '148')], {
      kpi: [],
      creditHours: [],
      uncovered: [{ type: 'Pairing', task_id: 'OLD' }],
      distribution: [],
      rawResult: {
        metadata: { credit_roster_period_note: 'Roster Period: July Jul 01 ~ Jul 31' },
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
              start_base: '2026-08-03T15:30:00Z',
              end_base: '2026-08-04T18:45:00Z',
              credit: 10.5,
              coverage_status: 'unassigned',
              assigned_crew: '',
              is_fixed: false,
            },
          ],
          pairing_complement: [
            {
              coverage_type: 'Pairing',
              task_id: 'P1_CA_0',
              original_pairing_id: 'P1',
              name: '858',
              base: 'YVR',
              rank: 'CA',
              start_base: '2026-08-03T15:30:00Z',
              end_base: '2026-08-04T18:45:00Z',
              credit: 10.5,
              coverage_status: 'unassigned',
              assigned_crew: '',
              is_fixed: false,
            },
            {
              coverage_type: 'Reserve',
              task_id: 'R1_FO_0',
              original_pairing_id: 'R1',
              name: 'PRPM',
              base: 'YVR',
              rank: 'FO',
              start_base: '2026-08-05',
              end_base: '2026-08-05',
              credit: 0,
              coverage_status: 'assigned',
              assigned_crew: 'C002',
              is_fixed: false,
            },
          ],
        },
      },
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-uncovered"]') as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain('Uncovered Pairings & Reserves') // single Results-view table, no stat tiles
    expect(container.textContent).toContain('1 row')
    expect(container.textContent).toContain('Pairing Id')
    expect(container.textContent).toContain('Task Id')
    expect(container.textContent).toContain('Start Base')
    expect(container.textContent).toContain('End Base')
    expect(container.textContent).toContain('P1_CA_0')
    expect(container.textContent).toContain('858')
    expect(container.textContent).toContain('2026-08-03 08:30')
    expect(container.textContent).toContain('2026-08-04 11:45')
    expect(container.textContent).toContain('Roster Period: July')
    expect(container.textContent).not.toContain('OLD')

    const headers = [...container.querySelectorAll('[data-testid="scenario-uncovered-table"] th')]
      .map((element) => element.textContent)
    expect(headers).toEqual([
      'Type',
      'Pairing Id',
      'Task Id',
      'Name',
      'Base',
      'Rank',
      'Start Base',
      'End Base',
      'Credit',
    ])
    expect(headers).not.toContain('Original Pairing Id')
    expect(headers).not.toContain('Interface Id')
    expect(headers).not.toContain('Coverage Status')
  })

  it('matches the Report Distribution metrics, charts and table via the distribution source', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '148')], {
      kpi: [],
      creditHours: [],
      uncovered: [],
      distribution: {
        version: 2,
        window: { start: '2026-07-01T06:00:00.000Z', end: '2026-07-05T06:00:00.000Z' },
        timezones: [{ base: 'YEG', tz: 'America/Edmonton' }],
        crews: [
          {
            crew_id: 'C1',
            rank: 'CA',
            tasks: [{ kind: 'assigned', start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
          },
          {
            crew_id: 'C2',
            rank: 'FO',
            tasks: [{ kind: 'preassign', start: '2026-07-02T00:00:00Z', end: '2026-07-03T00:00:00Z' }],
          },
        ],
        demand: [{ rank: 'CA', reserve: false, start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
      },
      rawResult: null,
    })

    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-distribution"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="scenario-distribution-view-chart"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Assigned slots')
    expect(container.textContent).toContain('Uncovered slots')
    expect(container.textContent).toContain('Peak day load')
    expect(container.textContent).toContain('Crew utilization')
    expect(container.textContent).toContain('Daily duty load vs available crew')
    expect(container.textContent).toContain('a multi-day pairing counts on each day it spans')
    expect(container.textContent).toContain('Uncovered demand')
    expect(container.textContent).toContain('1 slot open')
    expect(container.textContent).toContain('YEG local')
    expect(container.textContent).toContain('4 days · 2 crew')

    // Rank + Timezone controls render for a source, with the default rank ALL
    // and the default timezone the first crew base (YEG local).
    expect(container.querySelector('[data-testid="scenario-distribution-rank-all"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-rank-ca"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-tz-utc"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-tz-yeg"]')).not.toBeNull()

    // Clicking the CA rank narrows the crew set (2 crew → 1 crew).
    act(() => {
      ;(container.querySelector('[data-testid="scenario-distribution-rank-ca"]') as HTMLButtonElement).click()
    })
    expect(container.textContent).toContain('4 days · 1 crew')

    const loadPlot = container.querySelector('[data-testid="scenario-distribution-load-plot"]')
    expect(loadPlot?.className).toContain('overflow-hidden')
    expect(loadPlot?.firstElementChild?.className).toContain('w-full')
    expect(loadPlot?.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')

    // Weekend bands (Jul 4 is a Saturday) and the header legend are present.
    expect(container.querySelectorAll('[data-testid="dist-weekend"]').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="scenario-distribution-chart"] [data-testid="dist-legend"]')?.textContent).toContain('Available crew')

    // Hovering one day on the load chart links the uncovered chart (shared cursor).
    act(() => {
      loadPlot?.querySelector('[role="button"]')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(container.querySelectorAll('[data-testid="dist-cursor"]')).toHaveLength(2)
    const uncoveredPlot = container.querySelector('[data-testid="scenario-distribution-uncovered-plot"]')
    expect(uncoveredPlot?.querySelector('[data-testid="dist-cursor"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-load-tooltip"]')?.textContent).toContain('Available crew')

    act(() => {
      ;(container.querySelector('[data-testid="scenario-distribution-view-table"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="scenario-distribution-table"]')).not.toBeNull()
    const headers = [...container.querySelectorAll('[data-testid="scenario-distribution-table"] th')]
      .map((element) => element.textContent)
    expect(headers).toEqual([
      'Day',
      'Pairing',
      'Reserve',
      'On duty',
      'Available',
      'Idle',
      'Unc. pairing',
      'Unc. reserve',
    ])
    expect(container.textContent).toContain('Σ slot-days')
    const weekendRow = [...container.querySelectorAll('[data-testid="scenario-distribution-table"] tbody tr')]
      .find((row) => row.textContent?.includes('Sat, Jul 4'))
    expect(weekendRow?.className).toContain('weekend')
  })

  it('renders legacy flat-array distribution rows without rank or timezone controls', () => {
    const container = render([kpi(1, 'Crew Utilized', 1, '148')], {
      kpi: [],
      creditHours: [],
      uncovered: [],
      distribution: [
        {
          date: '2026-07-01',
          assigned_pairing: 2,
          assigned_reserve: 1,
          uncovered_pairing: 0,
          uncovered_reserve: 3,
          available_crew: 12,
        },
        {
          date: '2026-07-02',
          assigned_pairing: 3,
          assigned_reserve: 0,
          uncovered_pairing: 1,
          uncovered_reserve: 0,
          available_crew: 10,
        },
      ],
      rawResult: {
        metadata: { primary_base: 'YEG' },
      },
    })

    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-distribution"]') as HTMLButtonElement).click()
    })
    expect(container.textContent).toContain('Daily duty load vs available crew')
    expect(container.textContent).toContain('YEG local')
    expect(container.querySelector('[data-testid="scenario-distribution-rank-all"]')).toBeNull()
    expect(container.querySelector('[data-testid="scenario-distribution-tz-utc"]')).toBeNull()
    act(() => {
      ;(container.querySelector('[data-testid="scenario-distribution-view-table"]') as HTMLButtonElement).click()
    })
    const headers = [...container.querySelectorAll('[data-testid="scenario-distribution-table"] th')]
      .map((element) => element.textContent)
    expect(headers).toEqual([
      'Day',
      'Pairing',
      'Reserve',
      'On duty',
      'Available',
      'Idle',
      'Unc. pairing',
      'Unc. reserve',
    ])
    expect(container.textContent).toContain('avg 11')
  })

  it('derives the same UTC/ALL metrics from a distribution source and its legacy flat rows', () => {
    const source = {
      version: 2,
      window: { start: '2026-07-01T00:00:00.000Z', end: '2026-07-05T00:00:00.000Z' },
      timezones: [],
      crews: [
        {
          crew_id: 'C1',
          rank: 'CA',
          tasks: [{ kind: 'assigned', start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
        },
        {
          crew_id: 'C2',
          rank: 'FO',
          tasks: [{ kind: 'preassign', start: '2026-07-02T00:00:00Z', end: '2026-07-03T00:00:00Z' }],
        },
      ],
      demand: [{ rank: 'CA', reserve: false, start: '2026-07-01T10:00:00Z', end: '2026-07-03T04:00:00Z' }],
    }
    const legacy = [
      {
        date: '2026-07-01',
        assigned_pairing: 1,
        assigned_reserve: 0,
        uncovered_pairing: 1,
        uncovered_reserve: 0,
        available_crew: 2,
        assigned_pairing_slots_total: 1,
        assigned_reserve_slots_total: 0,
        uncovered_pairing_slots_total: 1,
        uncovered_reserve_slots_total: 0,
        busy_crew_days_total: 3,
        available_crew_days_total: 7,
      },
      { date: '2026-07-02', assigned_pairing: 1, assigned_reserve: 0, uncovered_pairing: 1, uncovered_reserve: 0, available_crew: 1 },
      { date: '2026-07-03', assigned_pairing: 1, assigned_reserve: 0, uncovered_pairing: 1, uncovered_reserve: 0, available_crew: 2 },
      { date: '2026-07-04', assigned_pairing: 0, assigned_reserve: 0, uncovered_pairing: 0, uncovered_reserve: 0, available_crew: 2 },
    ]
    const tilesOf = (distribution: unknown): { utilization: string; avg: string } => {
      const el = document.createElement('div')
      const root = createRoot(el)
      act(() => {
        root.render(<ScenarioKpiSection scenarioId={1} fileType="RO" kpis={[]} results={{ kpi: [], creditHours: [], uncovered: [], distribution, rawResult: null }} status="DONE" />)
      })
      act(() => {
        ;(el.querySelector('[data-testid="scenario-result-tab-distribution"]') as HTMLButtonElement).click()
      })
      const text = el.textContent ?? ''
      const utilization = text.match(/(\d+)%/)?.at(0) ?? ''
      const avg = text.match(/avg ([\d.]+) crew available/)?.[1] ?? ''
      return { utilization, avg }
    }
    const fromSource = tilesOf(source)
    const fromLegacy = tilesOf(legacy)
    expect(fromSource).toEqual(fromLegacy)
    expect(fromSource.avg).toBe('1.8') // 7 available crew-days / 4 days
  })

  it('shows credit-range differences for the selected division and renders regulatory JSON as read-only nested tables', async () => {
    vi.mocked(scenarioApi.getVersions).mockReset().mockResolvedValue({
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
    })
    vi.mocked(scenarioApi.getVersionDiff).mockReset().mockResolvedValue({
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
    })

    const container = render([kpi(1, 'Crew Utilized', 1, '148')], undefined, 'P')
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-versions"]') as HTMLButtonElement).click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-version-diff-v1"]') as HTMLButtonElement).click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const diffRoot = document.body
    const creditRow = diffRoot.querySelector('[data-testid="scenario-version-diff-row-algorithm.credit_range"]')
    expect(creditRow).not.toBeNull()
    expect(creditRow?.textContent).toContain('CA')
    expect(creditRow?.textContent).toContain('76')
    expect(creditRow?.textContent).toContain('75')
    expect(creditRow?.querySelector('td')?.textContent).toBe('credit_range')
    expect(diffRoot.querySelector('[data-testid="scenario-version-diff-row-algorithm.min_reserve_covered_pct"]')).not.toBeNull()

    const floorRow = diffRoot.querySelector('[data-testid="scenario-version-diff-row-algorithm.floor_rescue_rules"]')
    expect(floorRow?.querySelector('td')?.textContent).toBe('floor_rescue_rules')
    expect(floorRow?.textContent).toContain('reserve_single_days')
    expect(floorRow?.querySelectorAll('[data-testid="scenario-version-diff-value-current-algorithm.floor_rescue_rules"] .text-destructive')).toHaveLength(1)
    expect(floorRow?.querySelectorAll('[data-testid="scenario-version-diff-value-version-algorithm.floor_rescue_rules"] .text-destructive')).toHaveLength(1)

    const currentNested = diffRoot.querySelector('[data-testid="scenario-version-diff-nested-table-current-rules.8002001-0"]')
    const versionNested = diffRoot.querySelector('[data-testid="scenario-version-diff-nested-table-version-rules.8002001-0"]')
    expect(currentNested?.textContent).toContain('Bases')
    expect(currentNested?.textContent).toContain('12')
    expect(versionNested?.textContent).toContain('10')
    expect(currentNested?.closest('tr')?.querySelector('td')?.textContent).toBe('8002001')
    expect(currentNested?.querySelectorAll('.text-destructive')).toHaveLength(1)
    expect(versionNested?.querySelectorAll('.text-destructive')).toHaveLength(1)
    expect(currentNested?.querySelectorAll('input, select, textarea, button')).toHaveLength(0)
    expect(versionNested?.querySelectorAll('input, select, textarea, button')).toHaveLength(0)
    expect(diffRoot.textContent).not.toContain('"tables"')
  })

  it('reloads Versions when a running scenario completes', async () => {
    vi.mocked(scenarioApi.getVersions).mockReset()
    vi.mocked(scenarioApi.getVersions)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })

    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(<ScenarioKpiSection scenarioId={1} fileType="RO" kpis={[]} results={undefined} status="RUNNING" />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-result-tab-versions"]') as HTMLButtonElement).click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(scenarioApi.getVersions).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(<ScenarioKpiSection scenarioId={1} fileType="RO" kpis={[]} results={undefined} status="DONE" />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(scenarioApi.getVersions).toHaveBeenCalledTimes(2)
  })
})
