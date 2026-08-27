import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gzipSync } from 'node:zlib'

vi.mock('../../../utils/cache.js', () => ({
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
  getOrSet: vi.fn(async (_redis: unknown, _key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
}))

vi.mock('../../../config/index.js', () => ({
  env: { FILIALE: 'F8' },
}))

const loadScenarioResultIntoDb = vi.fn()
const fetchResultFile = vi.fn()
const fetchInputFile = vi.fn()

vi.mock('../../../services/scenario/scenario-result-loader.js', () => ({
  loadScenarioResultIntoDb: (...args: unknown[]) => loadScenarioResultIntoDb(...args),
}))

vi.mock('../../../services/engine-server-client.js', () => ({
  engineServerClient: {
    fetchResultFile: (...args: unknown[]) => fetchResultFile(...args),
    fetchInputFile: (...args: unknown[]) => fetchInputFile(...args),
  },
}))

import { invalidatePattern } from '../../../utils/cache.js'
import {
  buildDistributionRows,
  buildDistributionSource,
  buildRawResultPayload,
  computeAndPersistKpis,
  parseAssignments,
  parseSections,
  saveResult,
  syncScenarioPairingKpisFromDb,
} from '../../../services/scenario/scenario-result-service.js'

beforeEach(() => {
  vi.clearAllMocks()
  loadScenarioResultIntoDb.mockResolvedValue({ roster: 10, daily: 0, monthly: 2, yearly: 0 })
})

describe('scenario result', () => {
  it('parseSections parses ## SECTION CSV gzip into rows', () => {
    const gz = gzipSync(
      Buffer.from('## ASSIGNMENTS\ncrew_id,pairing_id\nF8001,5001\nF8002,5002\n', 'utf-8'),
    )
    const sections = parseSections(gz)
    expect(sections.ASSIGNMENTS).toHaveLength(2)
    expect(sections.ASSIGNMENTS[0]).toEqual({ crew_id: 'F8001', pairing_id: '5001' })
  })

  it('parseAssignments maps crew_id -> pairing_id (number)', () => {
    const assignments = parseAssignments({
      ASSIGNMENTS: [
        { crew_id: 'F8001', pairing_id: '5001' },
        { crew_id: 'F8002', pairing_id: '5002' },
      ],
    })
    expect(assignments).toEqual([
      { crewId: 'F8001', pairingId: 5001 },
      { crewId: 'F8002', pairingId: 5002 },
    ])
  })

  it('buildDistributionRows uses slot totals and excludes preassigned crew-days from availability', () => {
    const rows = buildDistributionRows(
      {
        pairing: [
          { id: '101', sch_str_dt_utc: '2026-07-01T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
          { id: '102', sch_str_dt_utc: '2026-07-02T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
          { id: '103', sch_str_dt_utc: '2026-07-01T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
        ],
        pairing_composition: [
          { pairing_id: '101', rank: 'FO', plan: '1', open: '0' },
          { pairing_id: '102', rank: 'FO', plan: '1', open: '0' },
          { pairing_id: '103', rank: 'FO', plan: '1', open: '1' },
        ],
      },
      {
        ASSIGNMENTS: [
          { crew_id: 'C1', pairing_id: '101', source: 'CR' },
          { crew_id: 'C2', pairing_id: '102', source: 'PA' },
        ],
      },
      new Map([['101', 'FLY'], ['102', 'RES'], ['103', 'FLY']]),
      ['C1', 'C2'],
      new Map([['C1', 'FO'], ['C2', 'FO']]),
      new Map([['102', new Set(['C2'])]]),
      new Map([['101', new Set(['C1'])]]),
      '2026-07-01',
      '2026-07-03',
    )

    expect(rows.map((row) => ({
      date: row.date,
      pairing: row.assigned_pairing,
      reserve: row.assigned_reserve,
      uncoveredPairing: row.uncovered_pairing,
      available: row.available_crew,
    }))).toEqual([
      { date: '2026-07-01', pairing: 1, reserve: 0, uncoveredPairing: 1, available: 2 },
      { date: '2026-07-02', pairing: 1, reserve: 0, uncoveredPairing: 1, available: 1 },
      { date: '2026-07-03', pairing: 1, reserve: 0, uncoveredPairing: 1, available: 1 },
    ])
    expect(rows[0]).toMatchObject({
      assigned_pairing_slots_total: 1,
      assigned_reserve_slots_total: 0,
      uncovered_pairing_slots_total: 1,
      uncovered_reserve_slots_total: 0,
      busy_crew_days_total: 3,
      busy_pairing_crew_days_total: 3,
      busy_reserve_crew_days_total: 0,
      available_crew_days_total: 4,
    })
  })

  /**
   * Minimal UTC/ALL day-bucket of a distribution source, mirroring the Report's
   * buildDistribution semantics (half-open [start, end) overlap). Used only to
   * assert the source encodes the same metrics as buildDistributionRows.
   */
  const deriveUtcDayRowsFromSource = (source: {
    window: { start: string; end: string }
    crews: { rank: string; tasks: { kind: string; reserve?: boolean; start: string; end: string }[] }[]
    demand: { rank: string; reserve: boolean; start: string; end: string }[]
  }): { date: string; assigned_pairing: number; assigned_reserve: number; uncovered_pairing: number; uncovered_reserve: number; available_crew: number }[] => {
    const start = Date.parse(source.window.start)
    const end = Date.parse(source.window.end)
    const dayStart = (i: number): number => start + i * 86_400_000
    const days: string[] = []
    for (let t = start; t < end; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10))
    const assignedPairing = new Array(days.length).fill(0)
    const assignedReserve = new Array(days.length).fill(0)
    const available = new Array(days.length).fill(0)
    const uncoveredPairing = new Array(days.length).fill(0)
    const uncoveredReserve = new Array(days.length).fill(0)
    const overlaps = (s: number, e: number, ds: number, de: number): boolean => s < de && e > ds
    for (const crew of source.crews) {
      const blocked = new Set<number>()
      for (const task of crew.tasks) {
        const s = Date.parse(task.start)
        const e = Date.parse(task.end)
        for (let i = 0; i < days.length; i++) {
          const ds = dayStart(i)
          if (!overlaps(s, e, ds, ds + 86_400_000)) continue
          if (task.kind === 'preassign') blocked.add(i)
          else if (task.reserve) assignedReserve[i] += 1
          else assignedPairing[i] += 1
        }
      }
      for (let i = 0; i < days.length; i++) if (!blocked.has(i)) available[i] += 1
    }
    for (const d of source.demand) {
      const s = Date.parse(d.start)
      const e = Date.parse(d.end)
      for (let i = 0; i < days.length; i++) {
        const ds = dayStart(i)
        if (!overlaps(s, e, ds, ds + 86_400_000)) continue
        if (d.reserve) uncoveredReserve[i] += 1
        else uncoveredPairing[i] += 1
      }
    }
    return days.map((date, i) => ({
      date,
      assigned_pairing: assignedPairing[i],
      assigned_reserve: assignedReserve[i],
      uncovered_pairing: uncoveredPairing[i],
      uncovered_reserve: uncoveredReserve[i],
      available_crew: available[i],
    }))
  }

  const distFixtureIn = {
    pairing: [
      { id: '101', sch_str_dt_utc: '2026-07-01T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
      { id: '102', sch_str_dt_utc: '2026-07-02T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
      { id: '103', sch_str_dt_utc: '2026-07-01T10:00:00Z', sch_end_dt_utc: '2026-07-03T04:00:00Z' },
    ],
    pairing_composition: [
      { pairing_id: '101', rank: 'FO', plan: '1', open: '0' },
      { pairing_id: '102', rank: 'FO', plan: '1', open: '0' },
      { pairing_id: '103', rank: 'FO', plan: '1', open: '1' },
    ],
  }
  const distFixtureOut = {
    ASSIGNMENTS: [
      { crew_id: 'C1', pairing_id: '101', source: 'CR' },
      { crew_id: 'C2', pairing_id: '102', source: 'PA' },
    ],
  }
  const distPairings = new Map([['101', 'FLY'], ['102', 'RES'], ['103', 'FLY']])
  const distCrewIds = ['C1', 'C2']
  const distRankByCrew = new Map([['C1', 'FO'], ['C2', 'FO']])
  const distPaByPairing = new Map([['102', new Set(['C2'])]])
  const distCrByPairing = new Map([['101', new Set(['C1'])]])

  it('buildDistributionSource maps assignments/roster/composition into a client-computable source', () => {
    const source = buildDistributionSource(
      distFixtureIn,
      distFixtureOut,
      distPairings,
      distCrewIds,
      distRankByCrew,
      new Map([['C1', 'YEG'], ['C2', 'YYZ']]),
      new Map([['YEG', 'America/Edmonton'], ['YYZ', 'America/Toronto']]),
      distPaByPairing,
      distCrByPairing,
      '2026-07-01',
      '2026-07-03',
    )

    expect(source.version).toBe(2)
    expect(source.window).toEqual({ start: '2026-07-01T00:00:00.000Z', end: '2026-07-04T00:00:00.000Z' })
    expect(source.timezones).toEqual([
      { base: 'YEG', tz: 'America/Edmonton' },
      { base: 'YYZ', tz: 'America/Toronto' },
    ])
    expect(source.crews).toHaveLength(2)
    expect(source.crews[0]).toEqual({
      crew_id: 'C1',
      rank: 'FO',
      tasks: [{ kind: 'assigned', reserve: false, start: '2026-07-01T10:00:00.000Z', end: '2026-07-03T04:00:00.000Z' }],
    })
    expect(source.crews[1]).toEqual({
      crew_id: 'C2',
      rank: 'FO',
      tasks: [{ kind: 'preassign', start: '2026-07-02T10:00:00.000Z', end: '2026-07-03T04:00:00.000Z' }],
    })
    expect(source.demand).toEqual([
      { rank: 'FO', reserve: false, start: '2026-07-01T10:00:00.000Z', end: '2026-07-03T04:00:00.000Z' },
    ])
  })

  it('buildDistributionSource derives the same UTC/ALL day rows as buildDistributionRows', () => {
    const source = buildDistributionSource(
      distFixtureIn,
      distFixtureOut,
      distPairings,
      distCrewIds,
      distRankByCrew,
      new Map(),
      new Map(),
      distPaByPairing,
      distCrByPairing,
      '2026-07-01',
      '2026-07-03',
    )
    const derived = deriveUtcDayRowsFromSource(source)
    const legacy = buildDistributionRows(
      distFixtureIn,
      distFixtureOut,
      distPairings,
      distCrewIds,
      distRankByCrew,
      distPaByPairing,
      distCrByPairing,
      '2026-07-01',
      '2026-07-03',
    )
    expect(derived).toEqual(legacy.map((row) => ({
      date: row.date,
      assigned_pairing: row.assigned_pairing,
      assigned_reserve: row.assigned_reserve,
      uncovered_pairing: row.uncovered_pairing,
      uncovered_reserve: row.uncovered_reserve,
      available_crew: row.available_crew,
    })))
  })

  it('saveResult writes current result pointers and appends a v0 version', async () => {
    const sets: Record<string, unknown>[] = []
    const fastify = {
      db: {
        update: () => ({
          set: (v: Record<string, unknown>) => {
            sets.push(v)
            return { where: async () => [] }
          },
        }),
      },
      redis: {},
    } as never

    await saveResult(fastify, {
      scenarioId: 7,
      taskId: 't1',
      status: 'DONE',
      filePath: '/c/output.gz',
      fileSize: 10,
      checksum: 'abc',
      kpi: [],
      resultMeta: {},
    })

    expect(sets[0]).toMatchObject({ checksum: 'abc', taskId: 't1', status: 'DONE' })
    expect(sets[0]).not.toHaveProperty('filePath')
    expect(sets[1]).toHaveProperty('filePaths')
  })

  it('saveResult maps non-DONE engine status to FAILED', async () => {
    const sets: Record<string, unknown>[] = []
    const fastify = {
      db: { update: () => ({ set: (v: Record<string, unknown>) => { sets.push(v); return { where: async () => [] } } }) },
      redis: {},
    } as never

    await saveResult(fastify, {
      scenarioId: 7, taskId: 't1', status: 'INFEASIBLE',
      filePath: '/c/o.gz', fileSize: 1, checksum: 'x', kpi: [], resultMeta: {},
    })
    expect(sets[0]).toMatchObject({ status: 'FAILED' })
  })

  it('saveResult re-invalidates list cache after async DB load succeeds', async () => {
    const redis = { id: 'redis' }
    const fastify = {
      db: {
        update: () => ({
          set: () => ({ where: async () => [] }),
        }),
      },
      redis,
      log: { info: vi.fn(), warn: vi.fn() },
    } as never

    await saveResult(
      fastify,
      {
        scenarioId: 683,
        taskId: 'task-683',
        status: 'DONE',
        filePath: '/c/output.gz',
        fileSize: 10,
        checksum: 'abc',
        kpi: [],
        resultMeta: {},
      },
      'bearer-token',
      'f8',
    )

    expect(loadScenarioResultIntoDb).toHaveBeenCalledOnce()
    // Invalidate on result receipt, after CR rows land, and after the final
    // RUNNING -> DONE transition.
    await vi.waitFor(() => {
      expect(invalidatePattern).toHaveBeenCalledTimes(3)
    })
    expect(invalidatePattern).toHaveBeenNthCalledWith(1, redis, 'scenario:list:*')
    expect(invalidatePattern).toHaveBeenNthCalledWith(2, redis, 'scenario:list:*')
    expect(invalidatePattern).toHaveBeenNthCalledWith(3, redis, 'scenario:list:*')
  })

  it('saveResult marks the scenario FAILED and rejects when DB result loading fails', async () => {
    const redis = { id: 'redis' }
    const sets: Record<string, unknown>[] = []
    const loadError = new Error('roster insert failed')
    loadScenarioResultIntoDb.mockRejectedValueOnce(loadError)
    const fastify = {
      db: {
        update: () => ({
          set: (value: Record<string, unknown>) => {
            sets.push(value)
            return { where: async () => [] }
          },
        }),
      },
      redis,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never

    await expect(saveResult(
      fastify,
      {
        scenarioId: 684,
        taskId: 'task-684',
        status: 'DONE',
        filePath: '/c/output.gz',
        fileSize: 10,
        checksum: 'abc',
        kpi: [],
        resultMeta: {},
      },
      'bearer-token',
      'f8',
    )).rejects.toBe(loadError)

    expect(sets[0]).toMatchObject({ taskId: 'task-684' })
    expect(sets[2]).toMatchObject({ status: 'FAILED' })
    expect(sets).not.toContainEqual(expect.objectContaining({ status: 'DONE' }))
    expect(invalidatePattern).toHaveBeenCalledTimes(2)
  })

  it('computeAndPersistKpis writes the canonical eight rows with deduped assignment and coverage counts', async () => {
    const input = gzipSync(Buffer.from(`## crew
crew_id
C1
C2
C3
C4
## crew_rank
crew_id,rank
C1,FO
C2,FO
C3,IFD
C4,FO
## pairing
id,assignment_group
101,FLY
102,FLY
103,FLY
201,RES
## pairing_composition
pairing_id,plan,fill,open
101,2,2,0
102,1,0,1
201,2,0,1
## pairing_segment
pairing_id,duty_seq,duty_act_credited_minutes,sch_str_dt_utc
101,1,1200,2026-07-02T10:00:00
102,1,900,2026-07-03T10:00:00
201,1,600,2026-07-04T10:00:00
`, 'utf-8'))
    const output = gzipSync(Buffer.from(`## ASSIGNMENTS
crew_id,pairing_id,source
C9,101,PA
C1,101,CR
C2,101,CR
C3,102,CR
C1,201,CR
## ROSTER
crew_id,assignment_group,assignment,source,sch_str_dt_utc,sch_end_dt_utc
C1,DO,DO,CR,2026-07-05T00:00:00,2026-07-06T00:00:00
C2,CRPM,CRPM,CR,2026-07-06T00:00:00,2026-07-06T04:00:00
`, 'utf-8'))

    fetchInputFile.mockResolvedValue(input)
    fetchResultFile.mockResolvedValue(output)

    const mandayQuery = vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes('roster_flight')) {
        return {
          rows: [
            { crew_id: 'C1', pairing_id: '101', pairing_group: 'FLY' },
            { crew_id: 'C2', pairing_id: '101', pairing_group: 'FLY' },
            { crew_id: 'C3', pairing_id: '102', pairing_group: 'FLY' },
            { crew_id: 'C1', pairing_id: '201', pairing_group: 'RES' },
          ],
        }
      }
      return {
        rows: [
          { crew_id: 'C1', credit: 6000 },
          { crew_id: 'C2', credit: 3000 },
          { crew_id: 'C3', credit: 0 },
        ],
      }
    })
    const fastify = {
      db: {
        execute: async () => ({
          rows: [{ crew_id: 'C1' }, { crew_id: 'C2' }, { crew_id: 'C3' }, { crew_id: 'C4' }],
        }),
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => [{
                strDtLoc: new Date('2026-07-01T00:00:00Z'),
                endDtLoc: new Date('2026-07-31T00:00:00Z'),
                filterParams: {},
                division: 'P',
              }],
            }),
            where: async () => [{
              strDtLoc: new Date('2026-07-01T00:00:00Z'),
              endDtLoc: new Date('2026-07-31T00:00:00Z'),
            }],
          }),
        }),
        delete: () => ({ where: async () => [] }),
        insert: () => ({
          values: async () => ({ onConflictDoUpdate: async () => [] }),
        }),
      },
      pgPool: {
        query: mandayQuery,
      },
      redis: {},
      log: { warn: vi.fn() },
    } as never

    await computeAndPersistKpis(fastify, {
      scenarioId: 679,
      taskId: 'task-679',
      status: 'DONE',
      filePath: '',
      fileSize: 0,
      checksum: '',
      kpi: [],
      resultMeta: {},
    }, 'token', 'f8')

    const kpiCall = mandayQuery.mock.calls.find(([q, p]) =>
      String(q).includes('insert into scenario_result') && p?.[1] === 'kpi')
    expect(kpiCall).toBeTruthy()
    const kpiPayload = JSON.parse(kpiCall?.[1]?.[2] as string) as Record<string, unknown>[]
    expect(kpiPayload.map((row) => row.kpiNames)).toEqual([
      'Crew Utilized',
      'Assigned',
      'Highest Credit',
      'Avg Credit Hours',
      'Pairing Lines',
      'Reserve Lines',
      'Pairing Coverage',
      'Reserve Coverage',
    ])
    expect(kpiPayload.map((row) => row.idx)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])

    const byName = new Map(kpiPayload.map((row) => [row.kpiNames, row]))
    expect(byName.get('Crew Utilized')).toMatchObject({ kpiValues: '4', description: 'FO:3 / IFD:1' })
    expect(byName.get('Assigned')).toMatchObject({ kpiValues: '4', description: 'FLY:2 / DO:1 / CRPM:1' })
    expect(byName.get('Highest Credit')).toMatchObject({ kpiValues: '100.0h' })
    expect(byName.get('Avg Credit Hours')).toMatchObject({
      kpiValues: '75.0h',
      description: '(2026RP07) Total Credit 150.0h / (4 - 2[0 Credit])',
    })
    expect(mandayQuery).toHaveBeenCalledWith(
      expect.stringContaining('crew_manday_fd_daily'),
      [679, '2026-07-01', '2026-07-31'],
    )
    expect(mandayQuery).toHaveBeenCalledWith(
      expect.stringContaining('crew_base_dt <= $3::date'),
      [679, '2026-07-01', '2026-07-31'],
    )
    expect(byName.get('Pairing Lines')).toMatchObject({ kpiValues: '2', description: 'Pre-Assignment: 1 / Optimize: 1' })
    expect(byName.get('Reserve Lines')).toMatchObject({ kpiValues: '1', description: 'Pre-Assignment: 0 / Optimize: 1' })
    expect(byName.get('Pairing Coverage')).toMatchObject({ kpiValues: '100.0%', description: '3 / 3 planned slots' })
    expect(byName.get('Reserve Coverage')).toMatchObject({ kpiValues: '50.0%', description: '1 / 2 planned slots' })
  })

  it('syncScenarioPairingKpisFromDb keeps filter-scope pairings after the last roster row is removed', async () => {
    const selectedRows = [
      { id: 1, scenarioId: 712, kpiNames: 'Pairing Lines', kpiValues: '2', description: 'Pre-Assignment: 0 / Optimize: 2', idx: 5, type: 'UTILIZATION' },
      { id: 2, scenarioId: 712, kpiNames: 'Reserve Lines', kpiValues: '0', description: 'Pre-Assignment: 0 / Optimize: 0', idx: 6, type: 'UTILIZATION' },
      { id: 3, scenarioId: 712, kpiNames: 'Pairing Coverage', kpiValues: '50.0%', description: '1 / 2 planned slots', idx: 7, type: 'UTILIZATION' },
      { id: 4, scenarioId: 712, kpiNames: 'Reserve Coverage', kpiValues: '0.0%', description: '0 / 0 planned slots', idx: 8, type: 'UTILIZATION' },
    ]
    const resultJsonWrites: unknown[] = []
    const fastify = {
      db: {
        execute: async () => ({
          rows: [
            { id: '17048', assignment_group: 'FLY' },
            { id: '17049', assignment_group: 'FLY' },
          ],
        }),
        insert: () => ({
          values: async () => ({ onConflictDoUpdate: async () => [] }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: async () => selectedRows,
            }),
          }),
        }),
      },
      pgPool: {
        query: vi.fn(async (query: string, params?: unknown[]) => {
          if (query.includes('create table') || query.includes('create unique index') || query.includes('create index')) {
            return { rows: [] }
          }
          if (query.includes('insert into scenario_result')) {
            resultJsonWrites.push(params?.[2])
            return { rows: [] }
          }
          if (query.includes('scenario.roster_flight')) {
            return { rows: [] }
          }
          if (query.includes('pairing_composition')) {
            return {
              rows: [
                { pairing_id: '17048', acting_rank: 'CA', plan: 1 },
                { pairing_id: '17049', acting_rank: 'CA', plan: 1 },
              ],
            }
          }
          return { rows: [] }
        }),
      },
      redis: {},
    } as never

    await syncScenarioPairingKpisFromDb(fastify, 712, {
      strDtLoc: new Date('2026-06-01T00:00:00Z'),
      endDtLoc: new Date('2026-06-30T23:59:59Z'),
      filterParams: {},
      division: 'P',
    }, 'tester')

    const merged = JSON.parse(String(resultJsonWrites[0])) as Record<string, unknown>[]
    const byName = new Map(merged.map((row) => [row.kpiNames, row]))
    expect(byName.get('Pairing Lines')).toMatchObject({
      kpiValues: '2',
      description: 'Pre-Assignment: 0 / Optimize: 2',
    })
    expect(byName.get('Pairing Coverage')).toMatchObject({
      kpiValues: '0.0%',
      description: '0 / 2 planned slots',
    })
    expect(resultJsonWrites).toHaveLength(1)
  })
})

describe('buildRawResultPayload', () => {
  it('carries report-shaped sections at the top level under the gantt keys', () => {
    const payload = buildRawResultPayload({
      scenarioId: 1,
      taskId: 't',
      status: 'DONE',
      filePath: '',
      fileSize: 0,
      checksum: '',
      kpi: [{ code: 'coverage', value: '0.99' }],
      resultMeta: { credit_hour_report: [{ crew_id: 'C1' }] },
      generalKpi: { credit_hour_report: [{ crew_id: 'C1' }] },
      schedulingDetails: { pairing_complement: [{ task_id: 'P1_CA_0' }] },
    })
    expect(payload.general_kpi).toEqual({ credit_hour_report: [{ crew_id: 'C1' }] })
    expect(payload.scheduling_details).toEqual({ pairing_complement: [{ task_id: 'P1_CA_0' }] })
    expect(payload.metadata).toMatchObject({ scenarioId: 1 })
    expect(payload.resultMeta).toEqual({ credit_hour_report: [{ crew_id: 'C1' }] })
    expect(payload.engineKpi).toEqual([{ code: 'coverage', value: '0.99' }])
  })

  it('defaults the report-shaped sections to empty for older callbacks', () => {
    const payload = buildRawResultPayload({
      scenarioId: 1,
      taskId: 't',
      status: 'DONE',
      filePath: '',
      fileSize: 0,
      checksum: '',
      kpi: [],
      resultMeta: {},
    })
    expect(payload.general_kpi).toEqual({})
    expect(payload.scheduling_details).toEqual({})
    expect(payload.resultMeta).toEqual({})
    expect(payload.engineKpi).toEqual([])
  })
})
