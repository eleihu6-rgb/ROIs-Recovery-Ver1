import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    getById: vi.fn(async () => ({
      id: 901,
      name: 'RO Publish',
      fileType: 'RO',
      status: 'DONE',
      taskId: 'task-901',
      strDtLoc: new Date('2026-06-01T00:00:00Z'),
      endDtLoc: new Date('2026-06-30T00:00:00Z'),
      leadinLive: 1,
      pairingScenarioId: 0,
      flightScenarioId: 0,
    })),
    update: vi.fn(async () => ({ id: 901, status: 'DRAFT' })),
    duplicate: vi.fn(async () => ({ id: 902, status: 'DRAFT' })),
    transition: vi.fn(async () => ({ id: 901, status: 'PUBLISHED' })),
  },
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: vi.fn(async () => undefined),
}))

vi.mock('../../services/engine-server-client.js', () => ({
  engineServerClient: {
    fetchVersionFile: vi.fn(async () => {
      throw new Error('Publish Roster must not fetch TEAM_RULES_RESOLUTION.json')
    }),
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import { scenarioService } from '../../services/scenario/scenario-service.js'
import { engineServerClient } from '../../services/engine-server-client.js'

type SelectRow = Record<string, unknown>

const scenarioRows = [
  {
    id: 11,
    kind: 'FLYING',
    crew_id: 'F80001',
    pairing_id: '1001',
    source: 'PA',
    roster_ids: ['11', '12'],
    assignment_group: 'FLY',
    assignment: 'FLY',
    pairing_label: 'PAIR-PA',
    base: 'YVR',
    division: 'P',
    sch_str_dt_utc: new Date('2026-06-03T10:00:00Z'),
    sch_end_dt_utc: new Date('2026-06-04T18:00:00Z'),
  },
  {
    id: 21,
    kind: 'FLYING',
    crew_id: 'F80002',
    pairing_id: '1002',
    source: 'CR',
    roster_ids: ['21'],
    assignment_group: 'FLY',
    assignment: 'FLY',
    pairing_label: 'PAIR-CR',
    base: 'YVR',
    division: 'P',
    sch_str_dt_utc: new Date('2026-06-05T10:00:00Z'),
    sch_end_dt_utc: new Date('2026-06-06T18:00:00Z'),
  },
  {
    id: 31,
    kind: 'GROUND',
    crew_id: 'F80003',
    pairing_id: null,
    source: 'CR',
    roster_ids: ['31'],
    assignment_group: 'GRD',
    assignment: 'DO',
    pairing_label: null,
    base: '',
    division: 'P',
    sch_str_dt_utc: new Date('2026-06-07T07:00:00Z'),
    sch_end_dt_utc: new Date('2026-06-08T06:59:59Z'),
  },
]

const build = async (
  scenario: SelectRow[] = scenarioRows,
  liveGroundMatches: SelectRow[] = [],
  scenarioDetail: SelectRow = {
    id: 901,
    name: 'RO Publish',
    fileType: 'RO',
    status: 'DONE',
    taskId: 'task-901',
    strDtLoc: new Date('2026-06-01T00:00:00Z'),
    endDtLoc: new Date('2026-06-30T00:00:00Z'),
    leadinLive: 1,
    pairingScenarioId: 0,
    flightScenarioId: 0,
  },
  missingCrewRows: SelectRow[] = [],
  insertedPublishRows: SelectRow[] = [
    { id: '90021', crew_id: 'F80002', pairing_id: '1002', source: 'CR', sch_str_dt_utc: new Date('2026-06-05T10:00:00Z') },
    { id: '90031', crew_id: 'F80003', pairing_id: null, source: 'CR', sch_str_dt_utc: new Date('2026-06-07T07:00:00Z') },
  ],
) => {
  const insertedRows: SelectRow[][] = []
  const pgPoolQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('from "f8".roster_period')) {
      return {
        rows: [{ id: '61', rp_start: new Date('2026-06-01T00:00:00Z'), rp_end: new Date('2026-06-30T23:59:59Z') }],
      }
    }
    expect(sql).not.toContain('scenario_roster_publish_snapshot')
    if (sql.includes('from "f8".crew') && sql.includes('crew_id = any')) {
      const missingCrewIds = new Set(missingCrewRows.map((row) => String(row.crew_id)))
      const crewIds = [...new Set(scenario.map((row) => String(row.crew_id)))]
        .filter((crewId) => crewId && !missingCrewIds.has(crewId))
      return { rows: crewIds.map((crew_id) => ({ crew_id })) }
    }
    if (sql.includes('from "f8".roster_flight') && sql.includes('pairing_id is null')) {
      return { rows: liveGroundMatches }
    }
    if (sql.includes('c.crew_id is null')) {
      return { rows: missingCrewRows }
    }
    if (sql.includes('returning id, crew_id, pairing_id, source, sch_str_dt_utc')) {
      return {
        rows: insertedPublishRows,
        rowCount: insertedPublishRows.length,
      }
    }
    return { rows: [] }
  })
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ id: 1001, pairingLabel: 'PAIR-PA', base: 'YVR', assignmentGroup: 'FLY', assignment: 'FLY', division: 'P', schStrDtUtc: new Date('2026-06-03T10:00:00Z'), schEndDtUtc: new Date('2026-06-04T18:00:00Z') }]),
    })),
  }))
  const insert = vi.fn(() => ({
    values: vi.fn(async (rows: SelectRow[]) => {
      insertedRows.push(rows)
      return rows
    }),
  }))
  const app = Fastify()
  let executeCall = 0
  vi.mocked(scenarioService.getById).mockResolvedValue({
    checksum: 'scenario-checksum-901',
    filePaths: [{
      version: 'v1',
      taskId: 'task-901',
      checksum: 'scenario-checksum-901',
      status: 'DONE',
    }],
    ...scenarioDetail,
  } as never)
  app.decorate('db', {
    execute: vi.fn(async () => {
      executeCall += 1
      return executeCall === 1
        ? { rows: [{ n: scenario.length }] }
        : { rows: scenario }
    }),
    select,
    insert,
  } as never)
  app.decorate('pgPool', { query: pgPoolQuery } as never)
  app.decorate('redis', {
    incr: vi.fn(async () => 1),
    scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
    del: vi.fn(async () => undefined),
  } as never)
  app.decorate('wsBroadcastAll', vi.fn())
  app.decorate('wsBroadcast', vi.fn())
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'planner',
      userName: 'Planner',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(scenarioRoutes)
  return { app, insertedRows, pgPoolQuery }
}

describe('scenario publish roster route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks PA as Pre-assign, CR as Pending/Published, and includes ground rows', async () => {
    const { app } = await build()

    const res = await app.inject({ method: 'GET', url: '/901/roster' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: {
        publishSupported: true,
        assignments: expect.arrayContaining([
          expect.objectContaining({
            crewId: 'F80003',
            kind: 'GROUND',
            source: 'CR',
            status: 'PENDING',
            publishable: true,
          }),
          expect.objectContaining({
            crewId: 'F80002',
            kind: 'FLYING',
            source: 'CR',
            status: 'PENDING',
            publishable: true,
          }),
          expect.objectContaining({
            crewId: 'F80001',
            kind: 'FLYING',
            source: 'PA',
            status: 'PRE_ASSIGN',
            publishable: false,
          }),
        ]),
      },
    })
  })

  it('normalizes string timestamps from scenario roster queries', async () => {
    const { app } = await build([
      {
        ...scenarioRows[1],
        sch_str_dt_utc: '2026-06-05 10:00:00+00',
        sch_end_dt_utc: '2026-06-06 18:00:00+00',
      },
    ])

    const res = await app.inject({ method: 'GET', url: '/901/roster' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: {
        assignments: [
          expect.objectContaining({
            crewId: 'F80002',
            schStrDtUtc: '2026-06-05T10:00:00.000Z',
            schEndDtUtc: '2026-06-06T18:00:00.000Z',
          }),
        ],
      },
    })
  })

  it('marks scenario roster rows with missing Live crew as exceptions', async () => {
    const { app } = await build(
      [
        ...scenarioRows,
        {
          ...scenarioRows[2],
          id: 41,
          crew_id: '227',
          roster_ids: ['41'],
        },
      ],
      [],
      {
        id: 901,
        name: 'RO Publish',
        fileType: 'RO',
        status: 'DONE',
        taskId: 'task-901',
        strDtLoc: new Date('2026-06-01T00:00:00Z'),
        endDtLoc: new Date('2026-06-30T00:00:00Z'),
        leadinLive: 1,
        pairingScenarioId: 0,
        flightScenarioId: 0,
      },
      [{ crew_id: '227' }],
    )

    const res = await app.inject({ method: 'GET', url: '/901/roster' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: {
        assignments: expect.arrayContaining([
          expect.objectContaining({
            crewId: '227',
            status: 'EXCEPTION',
            publishable: false,
            published: false,
          }),
        ]),
      },
    })
  })

  it('hides publish support for scenarios that do not reference live pairings', async () => {
    const { app } = await build(
      [{ ...scenarioRows[0], kind: 'FLYING', source: 'CR' }],
      [],
      {
        id: 901,
        name: 'RO Publish',
        fileType: 'RO',
        status: 'DONE',
        taskId: 'task-901',
        strDtLoc: new Date('2026-06-01T00:00:00Z'),
        endDtLoc: new Date('2026-06-30T00:00:00Z'),
        leadinLive: 1,
        pairingScenarioId: 1,
        flightScenarioId: 0,
      },
    )

    const res = await app.inject({ method: 'GET', url: '/901/roster' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: { assignments: [], publishSupported: false },
    })
  })

  it('copies selected scenario roster rows into live roster_flight with SCENARIO provenance', async () => {
    const { app, pgPoolQuery } = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/901/publish',
      payload: { rosterIds: [21, 31], username: 'planner' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ code: 200, data: { published: 2 } })
    expect(pgPoolQuery).toHaveBeenCalled()
    const insertCall = pgPoolQuery.mock.calls.find(([sql]) => String(sql).includes('returning id, crew_id, pairing_id, source, sch_str_dt_utc'))
    expect(insertCall).toBeTruthy()
    const sqlText = String(insertCall?.[0])
    expect(sqlText).toContain("request_source")
    expect(sqlText).toContain("'SCENARIO'")
    expect(sqlText).not.toContain('"scenario_publish_snapshot_id"')
    expect(sqlText).toContain('"comments"')
    expect(sqlText).toContain('rf."comments"')
    expect(sqlText).toContain("rf.id = any($2::bigint[])")
    expect(sqlText).toContain('coalesce(rf."act_rest_min", ps."duty_act_rest_min")')
    expect(sqlText).toContain('left join "f8".pairing_segment ps')
    expect(sqlText).toContain('ps.duty_seq = rf.duty_seq')
    expect(insertCall?.[1]).toEqual([901, [21, 31], 'planner'])
    expect(engineServerClient.fetchVersionFile).not.toHaveBeenCalled()
    expect(app.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:F80002')
    expect(app.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:F80003')
    expect(app.wsBroadcastAll).toHaveBeenCalledWith('f8', {
      type: 'roster-updated',
      crewIds: ['F80002', 'F80003'],
    })
    // The publish path recomputes manday synchronously; clients with the LIVE gantt open must
    // also be told the authoritative RpCred is ready (regression: RpCred went stale until reload).
    expect(app.wsBroadcastAll).toHaveBeenCalledWith('f8', {
      type: 'manday-updated',
      crewIds: ['F80002', 'F80003'],
    })
  })

  it('counts multi-segment flying publish rows as one assignment by crew and pairing', async () => {
    const multiSegmentRows = Array.from({ length: 6 }, (_, i) => ({
      id: String(91000 + i),
      crew_id: 'F80002',
      pairing_id: '1002',
      source: 'CR',
      sch_str_dt_utc: new Date(`2026-06-05T1${i}:00:00Z`),
    }))
    const { app } = await build(scenarioRows, [], undefined, [], multiSegmentRows)

    const res = await app.inject({
      method: 'POST',
      url: '/901/publish',
      payload: { rosterIds: [21, 22, 23, 24, 25, 26], username: 'planner' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ code: 200, data: { published: 1 } })
  })

  it('returns a readable conflict when selected crew do not exist in Live crew master', async () => {
    const { app, pgPoolQuery } = await build(
      scenarioRows,
      [],
      {
        id: 901,
        name: 'RO Publish',
        fileType: 'RO',
        status: 'DONE',
        taskId: 'task-901',
        strDtLoc: new Date('2026-06-01T00:00:00Z'),
        endDtLoc: new Date('2026-06-30T00:00:00Z'),
        leadinLive: 1,
        pairingScenarioId: 0,
        flightScenarioId: 0,
      },
      [{ crew_id: '227' }],
    )

    const res = await app.inject({
      method: 'POST',
      url: '/901/publish',
      payload: { rosterIds: [21], username: 'planner' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 409,
      message: expect.stringContaining('227'),
    })
    expect(pgPoolQuery.mock.calls.some(([sql]) => String(sql).includes('returning id, crew_id, pairing_id, source, sch_str_dt_utc'))).toBe(false)
  })
})
