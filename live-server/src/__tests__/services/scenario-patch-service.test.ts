// live-server/src/__tests__/services/scenario-patch-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

vi.mock('../../services/engine-server-client.js')
vi.mock('../../config/env.js', () => ({
  env: { ENGINE_SERVER_URL: 'http://engine:3003', LIVE_SCHEMA: 'f8', SCENARIO_SCHEMA: 'scenario' },
}))

const mandayMocks = vi.hoisted(() => ({ recompute: vi.fn(async () => undefined) }))
vi.mock('../../services/manday/manday-tool.js', () => mandayMocks)

import { engineServerClient } from '../../services/engine-server-client.js'
import {
  applyScenarioRosterPatches,
  applyOutputPatch,
  validateScenarioRosterPatches,
} from '../../services/scenario/scenario-patch-service.js'
import { recompute as recomputeManday } from '../../services/manday/manday-tool.js'

function makeGz(text: string): Buffer {
  return gzipSync(Buffer.from(text, 'utf-8'))
}

it('maps DH and DHD seg_assignment to roster assignment_group DHD in SQL', () => {
  // process.cwd()-relative path: live-server is type:commonjs; import.meta breaks `tsc` (TS1470).
  const src = readFileSync(
    resolve(process.cwd(), 'src/services/scenario/scenario-patch-service.ts'),
    'utf8',
  )
  expect(src).toMatch(/upper\(btrim\(ps\.seg_assignment\)\)\s+IN\s*\(\s*'DH'\s*,\s*'DHD'\s*\)/)
})

const BASE_OUTPUT = makeGz(
  `## ASSIGNMENTS\ncrew_id,pairing_id\nF80001,100\nF80002,200\n`
)
const GROUND_OUTPUT = makeGz(
  `## ASSIGNMENTS\ncrew_id,pairing_id\nF80001,100\n\n## ROSTER\ncrew_id,sch_str_dt_utc,sch_end_dt_utc,assignment_group,assignment\nF80001,2026-07-01T08:00:00Z,2026-07-01T16:00:00Z,GRD,SIM\nF80001,2026-07-02T08:00:00Z,2026-07-02T16:00:00Z,GRD,SIM\n`
)

describe('applyOutputPatch', () => {
  let writtenGz: Buffer | null = null

  beforeEach(() => {
    vi.resetAllMocks()
    writtenGz = null
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(BASE_OUTPUT)
    vi.mocked(engineServerClient.writeOutputFile).mockImplementation(async (_, gz) => {
      writtenGz = gz
    })
  })

  it('remove: removes the matching assignment', async () => {
    await applyOutputPatch('t-1', 702, [{ op: 'remove', crewId: 'F80001', pairingId: 100 }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).not.toContain('F80001,100')
    expect(text).toContain('F80002,200')
  })

  it('reassign: changes crew_id for matching pairing', async () => {
    await applyOutputPatch(
      't-1',
      702,
      [{ op: 'reassign', crewId: 'F80001', pairingId: 100, toCrewId: 'F80003' }],
      'tok', 'f8',
    )
    const text = gunzipSync(writtenGz!).toString()
    expect(text).not.toContain('F80001,100')
    expect(text).toContain('F80003,100')
  })

  it('add: inserts new assignment row', async () => {
    await applyOutputPatch('t-1', 702, [{ op: 'add', crewId: 'F80004', pairingId: 300 }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).toContain('F80004,300')
  })

  it('remove: removes a matching ground roster row without changing assignments', async () => {
    vi.mocked(engineServerClient.fetchResultFile).mockResolvedValue(GROUND_OUTPUT)
    await applyOutputPatch('t-1', 702, [{
      op: 'remove',
      crewId: 'F80001',
      pairingId: null,
      startDtUtc: '2026-07-01T08:00:00Z',
      endDtUtc: '2026-07-01T16:00:00Z',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    }], 'tok', 'f8')
    const text = gunzipSync(writtenGz!).toString()
    expect(text).toContain('F80001,100')
    expect(text).not.toContain('2026-07-01T08:00:00Z')
    expect(text).toContain('2026-07-02T08:00:00Z')
  })

  it('writes MODIFIED_AT section to mark patched file', async () => {
    await applyOutputPatch('t-1', 702, [{ op: 'remove', crewId: 'F80001', pairingId: 100 }], 'tok', 'f8')
    expect(engineServerClient.fetchResultFile).toHaveBeenCalledWith('t-1', 'tok', 'f8', 702)
    const text = gunzipSync(writtenGz!).toString()
    expect(text).toContain('## MODIFIED_AT')
    expect(text).toContain('patch_count')
  })
})

describe('validateScenarioRosterPatches', () => {
  const pointersLive = {
    rowCount: 1,
    rows: [{ id: 702, pairing_scenario_id: 0, flight_scenario_id: 0 }],
  }
  const pointersFrozen = {
    rowCount: 1,
    rows: [{ id: 702, pairing_scenario_id: 405, flight_scenario_id: 0 }],
  }

  it('allows add when crew and pairing exist and the crew is not already assigned', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersFrozen)
      .mockResolvedValueOnce({ rowCount: 1 })
    const pool = { query } as never

    await validateScenarioRosterPatches(pool, 702, [{
      op: 'add',
      crewId: 'F80001',
      pairingId: 100,
    }])

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "f8".scenario'),
      [702],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN "scenario".pairing'),
      [702, 'F80001', 100, 405],
    )
    expect(query.mock.calls[1][0]).toContain('FROM "f8".crew')
    expect(query.mock.calls[1][0]).toContain('NOT EXISTS')
    // Regression: crew master has no is_deleted (would 500 on save: "column c.is_deleted does not exist")
    expect(query.mock.calls[1][0]).not.toMatch(/c\.is_deleted/)
  })

  it('validates add against live pairing when pairing_scenario_id=0', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersLive)
      .mockResolvedValueOnce({ rowCount: 1 })
    const pool = { query } as never

    await validateScenarioRosterPatches(pool, 702, [{
      op: 'add',
      crewId: '713',
      pairingId: 15643,
    }])

    expect(query.mock.calls[1][0]).toContain('JOIN "f8".pairing')
    expect(query.mock.calls[1][1]).toEqual([702, '713', 15643, 0])
  })

  it('rejects add when crew or pairing is invalid or already assigned', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersFrozen)
      .mockResolvedValueOnce({ rowCount: 0 })
    const pool = { query } as never

    await expect(validateScenarioRosterPatches(pool, 702, [{
      op: 'add',
      crewId: 'F80001',
      pairingId: 100,
    }])).rejects.toThrow('Scenario pairing can only be assigned to a valid unassigned crew')
  })

  it('allows deletes when the matching roster source is CR', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersFrozen)
      .mockResolvedValueOnce({ rowCount: 1 })
    const pool = { query } as never

    await validateScenarioRosterPatches(pool, 702, [{
      op: 'remove',
      crewId: 'F80001',
      pairingId: null,
      startDtUtc: '2026-07-01T08:00:00Z',
      endDtUtc: '2026-07-01T16:00:00Z',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    }])

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("source IN ('CR','MA')"),
      [702, 'F80001', '2026-07-01T08:00:00Z', '2026-07-01T16:00:00Z', 'GRD', 'SIM'],
    )
  })

  it('rejects deletes when no CR roster row matches', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersFrozen)
      .mockResolvedValueOnce({ rowCount: 0 })
    const pool = { query } as never

    await expect(validateScenarioRosterPatches(pool, 702, [{
      op: 'remove',
      crewId: 'F80001',
      pairingId: 100,
    }])).rejects.toThrow('Only CR roster assignments can be removed')
  })

  it('rejects reassign patches when no CR roster row matches', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(pointersFrozen)
      .mockResolvedValueOnce({ rowCount: 0 })
    const pool = { query } as never

    await expect(validateScenarioRosterPatches(pool, 702, [{
      op: 'reassign',
      crewId: 'F80001',
      pairingId: 100,
      toCrewId: 'F80003',
    }])).rejects.toThrow('Only CR roster assignments can be reassigned')
  })
})

describe('applyScenarioRosterPatches', () => {
  const pointersLive = {
    rowCount: 1,
    rows: [{ id: 702, pairing_scenario_id: 0, flight_scenario_id: 0 }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies add and CR-only reassign updates inside the DB-backed scenario roster', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0 }) // undelete miss
      .mockResolvedValueOnce({ rowCount: 1 }) // insert
      .mockResolvedValueOnce({ rowCount: 1 }) // reassign
      .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
    const release = vi.fn()
    const client = { query, release }
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn()
        .mockResolvedValueOnce(pointersLive) // partitionsForScenario
        .mockResolvedValue({ rowCount: 1 }),
    } as never

    await applyScenarioRosterPatches(pool, 702, [
      { op: 'add', crewId: 'F80001', pairingId: 100, rosterActingRank: 'CA' },
      { op: 'reassign', crewId: 'F80002', pairingId: 200, toCrewId: 'F80003' },
    ], 'planner')

    expect(query).toHaveBeenCalledWith('BEGIN')
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("source IN ('CR','MA')"),
      [702, 'F80002', 200, 'F80003', 'planner', null],
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO'),
      // $6 = roster_acting_rank taken from the patch
      [702, 'F80001', 100, 'planner', 0, 'CA'],
    )
    expect(query.mock.calls.some((call) => String(call[0]).includes('JOIN "f8".pairing'))).toBe(true)
    // Regression: untyped $1/$2 in INSERT…SELECT tripped PG "inconsistent types deduced".
    const insertSql = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO'))?.[0] as string
    expect(insertSql).toContain('$1::bigint')
    expect(insertSql).toContain('$2::varchar')
    // Manual add must persist flight_acting_rank from the patch (not hardcoded '').
    expect(insertSql).toMatch(/COALESCE\(\$6::varchar,\s*''\)/)
    expect(insertSql).not.toMatch(/'MA',\s*'',\s*\$6::varchar/)
    expect(query).toHaveBeenCalledWith('COMMIT')
    expect(release).toHaveBeenCalled()
  })

  it('revives soft-deleted CR rows on re-add instead of inserting duplicates', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 2 }) // undelete hit
      .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
    const release = vi.fn()
    const client = { query, release }
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn()
        .mockResolvedValueOnce(pointersLive)
        .mockResolvedValue({ rowCount: 1 }),
    } as never

    await applyScenarioRosterPatches(pool, 698, [
      { op: 'add', crewId: '713', pairingId: 15643, rosterActingRank: 'FO' },
    ], 'planner')

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET is_deleted = 0'),
      // $5 = roster_acting_rank taken from the patch on revive
      [698, '713', 15643, 'planner', 'FO'],
    )
    const reviveSql = query.mock.calls.find((call) => String(call[0]).includes('SET is_deleted = 0'))?.[0] as string
    expect(reviveSql).toMatch(/flight_acting_rank\s*=\s*COALESCE\(\$5/)
    expect(query.mock.calls.every((call) => !String(call[0]).includes('INSERT INTO'))).toBe(true)
    expect(release).toHaveBeenCalled()
  })

  it('recomputes manday only for the patched crews (not the whole scenario)', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1 }) // remove ground
      .mockResolvedValueOnce({ rowCount: 1 }) // reassign
      .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
    const release = vi.fn()
    const client = { query, release }
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn()
        .mockResolvedValueOnce(pointersLive)
        .mockResolvedValue({ rowCount: 1 }),
    } as never

    await applyScenarioRosterPatches(pool, 702, [
      { op: 'remove', crewId: 'F80001', pairingId: null, startDtUtc: '2026-07-01T08:00:00Z', endDtUtc: '2026-07-01T16:00:00Z', assignmentGroup: 'GRD', assignment: 'SIM' },
      { op: 'reassign', crewId: 'F80002', pairingId: 200, toCrewId: 'F80003' },
    ], 'planner')

    // Async: the service no longer recomputes manday in the request (the route enqueues
    // a manday-recompute job instead), so recompute must NOT be triggered here.
    expect(recomputeManday).not.toHaveBeenCalled()
  })
})
