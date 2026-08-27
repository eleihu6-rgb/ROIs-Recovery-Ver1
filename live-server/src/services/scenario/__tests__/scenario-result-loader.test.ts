import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { buildRosterRows, insertRosterRows, loadResultGzIntoDb, overlayLiveRosterFields } from '../scenario-result-loader.js'

vi.mock('../../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
  },
}))

const DB = 'postgresql://f8:Pier2026AIf8@47.253.173.207:55432/rois'
const THROWAWAY = 999990
// Second throwaway id for the source-preservation test (the optimizer's per-row
// CR/PA tag must survive the transcribe into scenario.roster_flight, not be
// flattened to 'OPT' — else the gantt paints the ⚡ optimizer badge on PA
// (carried-from-live) duties like MLOA leave days). See scenario 541 crew 806/1227.
const THROWAWAY_SRC = 999591
const SC541 = path.resolve(process.cwd(), '../engine-server/complete/F8/541_20260622_202057')
const MANDAY_TABLES = [
  'crew_manday_fd_daily', 'crew_manday_fd_period', 'crew_manday_fd_yearly',
  'crew_manday_cc_am_daily', 'crew_manday_cc_am_period', 'crew_manday_cc_am_yearly',
]

let pool: pg.Pool

const cleanup = async () => {
  await pool.query('delete from scenario.roster_flight where scenario_id=$1', [THROWAWAY])
  for (const t of MANDAY_TABLES) {
    await pool.query(`delete from scenario.${t} where scenario_id=$1`, [THROWAWAY])
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB })
})
afterAll(async () => {
  await cleanup()
  await pool.end()
})

describe('loadResultGzIntoDb', () => {
  it('preserves segment scheduled and actual timestamps when building optimizer roster rows', () => {
    const rows = buildRosterRows(
      {
        crew_base: [{ crew_id: '1001', base: 'YYZ', eff_dt: '2026-01-01' }],
        crew_rank: [{ crew_id: '1001', rank: 'CA' }],
        pairing: [{ id: '2001', base: 'YYZ', assignment_group: 'FLT', assignment: 'FLT' }],
        pairing_segment: [{
          pairing_id: '2001',
          flt_id: '3001',
          duty_seq: '1',
          seg_seq: '1',
          sch_str_dt_utc: '2026-06-05T10:00:00Z',
          sch_end_dt_utc: '2026-06-05T14:00:00Z',
          act_str_dt_utc: '2026-06-05T10:15:00Z',
          act_end_dt_utc: '2026-06-05T14:20:00Z',
          duty_act_credited_minutes: '240',
        }],
      },
      { ASSIGNMENTS: [{ crew_id: '1001', pairing_id: '2001', source: 'PA' }] },
      new Map(),
    )

    expect(rows[0]).toMatchObject({
      sch_str_dt_utc: '2026-06-05T10:00:00Z',
      sch_end_dt_utc: '2026-06-05T14:00:00Z',
      act_str_dt_utc: '2026-06-05T10:15:00Z',
      act_end_dt_utc: '2026-06-05T14:20:00Z',
    })
  })

  it('inserts live_id and roster credit columns into scenario.roster_flight', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return { rows: [], rowCount: 0 }
      },
    }

    await insertRosterRows(pool as never, 700, [{
      crew_id: '1001',
      pairing_id: null,
      live_id: 12345,
      base: 'YYZ',
      label: 'VAC label',
      assignment_group: 'GRD',
      assignment: 'VAC',
      role: 'REST',
      source: 'PA',
      flight_acting_rank: 'IFD',
      roster_acting_rank: null,
      division: null,
      flt_id: null,
      duty_seq: null,
      seg_seq: null,
      flt_dt: null,
      sch_str_dt_utc: '2026-06-05T00:00:00Z',
      sch_end_dt_utc: '2026-06-06T00:00:00Z',
      sch_credited_minutes: 240,
      act_credited_minutes: 245,
      dep_arp: 'YYZ',
      arv_arp: 'YYZ',
      comments: null,
    }])

    const insert = calls.find((call) => call.sql.includes('insert into') && call.sql.includes('roster_flight'))
    expect(insert?.sql).toContain('live_id')
    expect(insert?.sql).toContain('label')
    expect(insert?.sql).toContain('role')
    expect(insert?.sql).toContain('sch_credited_minutes')
    expect(insert?.sql).toContain('act_credited_minutes')
    expect(insert?.sql).toContain('dep_arp')
    expect(insert?.sql).toContain('arv_arp')
    expect(insert?.params).toEqual(expect.arrayContaining([12345, 'VAC label', 'REST', 240, 245, 'YYZ']))
  })

  it('overlays PA flying rows from live by crew, pairing, and flight when optimizer output has no old_id', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        if (sql.includes('roster_flight') && params?.length === 7) {
          return {
            rows: [{
              ord: 0,
              id: '98765',
              label: 'Live PA',
              role: 'CAPTAIN',
              division: 'P',
              roster_acting_rank: 'CA',
              dep_arp: 'YYZ',
              arv_arp: 'YVR',
              sch_credited_minutes: '360',
              act_credited_minutes: '365',
            }],
            rowCount: 1,
          }
        }
        return { rows: [], rowCount: 0 }
      },
    }
    const rows = [{
      crew_id: '1001',
      pairing_id: 2001,
      live_id: null,
      base: 'YYZ',
      label: null,
      assignment_group: 'FLT',
      assignment: 'FLY',
      role: null,
      source: 'PA',
      flight_acting_rank: 'CA',
      roster_acting_rank: null,
      division: null,
      flt_id: 3001,
      duty_seq: 1,
      seg_seq: 1,
      flt_dt: '2026-06-05',
      sch_str_dt_utc: '2026-06-05T10:00:00Z',
      sch_end_dt_utc: '2026-06-05T14:00:00Z',
      sch_credited_minutes: null,
      act_credited_minutes: null,
      dep_arp: null,
      arv_arp: null,
      comments: null,
    }]

    await overlayLiveRosterFields(pool as never, rows)

    expect(calls[0].params).toEqual([
      [0],
      ['1001'],
      [2001],
      [3001],
      ['FLY'],
      ['2026-06-05T10:00:00Z'],
      ['2026-06-05T14:00:00Z'],
    ])
    expect(rows[0]).toMatchObject({
      live_id: 98765,
      label: 'Live PA',
      role: 'CAPTAIN',
      division: 'P',
      roster_acting_rank: 'CA',
      dep_arp: 'YYZ',
      arv_arp: 'YVR',
      sch_credited_minutes: 360,
      act_credited_minutes: 365,
    })
  })

  it('loads scenario 460 gz into roster + manday (throwaway id)', async () => {
    const inPath = '/tmp/sc460/input.gz'
    const outPath = '/tmp/sc460/output.gz'
    if (!existsSync(inPath) || !existsSync(outPath)) {
      console.warn('[skip] /tmp/sc460/*.gz absent — re-fetch via engine result endpoint to run loader test')
      return
    }
    await cleanup()
    const res = await loadResultGzIntoDb(
      pool,
      THROWAWAY,
      readFileSync(inPath),
      readFileSync(outPath),
      { setScenarioDone: false }, // throwaway id — don't touch f8.scenario
    )
    expect(res.roster).toBeGreaterThan(0)
    expect(res.monthly).toBeGreaterThan(0)

    const rf = await pool.query<{ n: number }>(
      'select count(*)::int n from scenario.roster_flight where scenario_id=$1', [THROWAWAY])
    expect(rf.rows[0].n).toBeGreaterThan(0)

    const md = await pool.query<{ n: number }>(
      'select count(*)::int n from scenario.crew_manday_fd_period where scenario_id=$1', [THROWAWAY])
    expect(md.rows[0].n).toBeGreaterThan(0)
  })

  it('preserves the optimizer source (CR/PA) per row — never flattens to OPT', async () => {
    const inPath = `${SC541}/input.gz`
    const outPath = `${SC541}/output.gz`
    if (!existsSync(inPath) || !existsSync(outPath)) {
      console.warn(`[skip] ${SC541}/*.gz absent — cannot run source-preservation test`)
      return
    }
    await pool.query('delete from scenario.roster_flight where scenario_id=$1', [THROWAWAY_SRC])
    await loadResultGzIntoDb(
      pool,
      THROWAWAY_SRC,
      readFileSync(inPath),
      readFileSync(outPath),
      { setScenarioDone: false },
    )

    const dist = await pool.query<{ source: string | null; n: number }>(
      `select source, count(*)::int n from scenario.roster_flight
       where scenario_id=$1 and pairing_id is null group by source order by n desc`,
      [THROWAWAY_SRC],
    )
    const bySource = Object.fromEntries(dist.rows.map((r) => [r.source ?? 'NULL', r.n]))

    // The whole point: PA (carried-from-live) duties stay 'PA' so the gantt
    // does NOT badge them, and only optimizer-placed duties carry 'CR'.
    expect(bySource['OPT'], 'source must NOT be flattened to OPT').toBeUndefined()
    expect(bySource['PA'] ?? 0, 'PA ground duties must be preserved').toBeGreaterThan(0)
    expect(bySource['CR'] ?? 0, 'optimizer-placed (CR) ground duties must be preserved').toBeGreaterThan(0)

    // Crew 806 & 1227 are on MLOA leave the whole period → all PA → no ⚡.
    const leave = await pool.query<{ crew_id: string; source: string | null; n: number }>(
      `select crew_id, source, count(*)::int n from scenario.roster_flight
       where scenario_id=$1 and pairing_id is null and crew_id in ('806','1227')
       group by crew_id, source order by crew_id`,
      [THROWAWAY_SRC],
    )
    for (const row of leave.rows) {
      expect(row.source, `crew ${row.crew_id} leave DOs must be PA (no optimizer badge)`).toBe('PA')
    }
    expect(leave.rows.length, 'crew 806/1227 must be present as PA DOs').toBeGreaterThan(0)

    await pool.query('delete from scenario.roster_flight where scenario_id=$1', [THROWAWAY_SRC])
  }, 180_000)
})
