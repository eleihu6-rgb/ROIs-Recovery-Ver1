import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8_dev_live',
    PBS_SCHEMA: 'f8_dev_pbs',
  },
}))

import {
  authenticateAndLoadMobileRoster,
  MobileRosterServiceError,
  type MobileRosterServiceOptions,
} from '../mobile-roster-service.js'

type MockRow = Record<string, unknown>

const NOW = new Date('2026-08-28T12:00:00.000Z')

const activePbsUser = async (overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> => ({
  user_code: '113',
  crew_id: '113',
  password_hash: await bcrypt.hash('Pier2026', 10),
  status: 0,
  password_access: '1',
  portal_access: '1',
  app_access: '1',
  eff_dt: '2026-01-01T00:00:00.000Z',
  exp_dt: null,
  ...overrides,
})

const crewProfile = {
  crew_id: '113',
  first_name: 'Avery',
  last_name: 'Pierce',
  base: 'YEG',
  rank: 'CA',
}

const flyingRows: MockRow[] = [
  {
    pairing_id: '12345',
    pairing_label: 'F8123',
    assignment: 'FLY',
    pairing_check_in_utc: '2026-09-01T10:00:00.000Z',
    pairing_release_utc: '2026-09-03T22:00:00.000Z',
    flt_id: '7001',
    flt_num: 'F8123',
    dep_arp: 'YEG',
    arv_arp: 'YVR',
    start_utc: '2026-09-01T11:00:00.000Z',
    end_utc: '2026-09-01T12:30:00.000Z',
  },
  {
    pairing_id: '12345',
    pairing_label: 'F8123',
    assignment: 'FLY',
    pairing_check_in_utc: '2026-09-01T10:00:00.000Z',
    pairing_release_utc: '2026-09-03T22:00:00.000Z',
    flt_id: '7002',
    flt_num: 'F8124',
    dep_arp: 'YVR',
    arv_arp: 'YEG',
    start_utc: '2026-09-03T20:30:00.000Z',
    end_utc: '2026-09-03T22:00:00.000Z',
  },
]

const createPool = (rows: MockRow[][]) => ({
  query: vi.fn(async (): Promise<{ rows: MockRow[] }> => ({ rows: rows.shift() ?? [] })),
})

const serviceOptions = (pgPool: ReturnType<typeof createPool>) => ({
  pgPool: pgPool as MobileRosterServiceOptions['pgPool'],
  liveSchema: 'f8_dev_live',
  pbsSchema: 'f8_dev_pbs',
  now: NOW,
})

// The duty report / release anchors the roster read must prefer: the brief start
// (first departure − brief) and the debrief end (last arrival + debrief) win over
// `duty_sch_str_dt_utc` / `duty_sch_end_dt_utc`, which the gantt build service
// fills with the duty's first departure / last arrival.
const REPORT_EXPR = 'coalesce(ps.brief_start_utc, ps.pickup_start_utc, ps.duty_sch_str_dt_utc)'
const RELEASE_EXPR = 'coalesce(ps.debrief_end_utc, ps.dropoff_end_utc, ps.duty_sch_end_dt_utc)'
const REPORT_EXPR_ALL = 'coalesce(ps_all.brief_start_utc, ps_all.pickup_start_utc, ps_all.duty_sch_str_dt_utc)'
const RELEASE_EXPR_ALL = 'coalesce(ps_all.debrief_end_utc, ps_all.dropoff_end_utc, ps_all.duty_sch_end_dt_utc)'

describe('authenticateAndLoadMobileRoster', () => {
  it('authenticates crew 113 through pbs_user password_hash and maps flying pairing', async () => {
    const pgPool = createPool([[await activePbsUser()], [crewProfile], flyingRows])

    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: ' 113 ',
      password: 'Pier2026',
    })

    expect(result.airline).toBe('F8')
    expect(result.crew.crewId).toBe('113')
    expect(result.pairings).toHaveLength(1)
    expect(result.pairings[0].flights).toHaveLength(2)
  })

  it('rejects invalid password', async () => {
    const pgPool = createPool([[await activePbsUser()]])

    await expect(authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'incorrect',
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects disabled portal account', async () => {
    const pgPool = createPool([[await activePbsUser({ portal_access: '0' })]])

    await expect(authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects disabled app account', async () => {
    const pgPool = createPool([[await activePbsUser({ app_access: '0' })]])

    await expect(authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('maps non-flying duty into groundDuties', async () => {
    const pgPool = createPool([
      [await activePbsUser()],
      [crewProfile],
      [{
        pairing_id: null,
        pairing_label: null,
        assignment: 'TRN',
        pairing_check_in_utc: null,
        pairing_release_utc: null,
        flt_id: null,
        flt_num: null,
        dep_arp: 'YEG',
        arv_arp: 'YEG',
        start_utc: '2026-09-05T09:00:00.000Z',
        end_utc: '2026-09-05T17:00:00.000Z',
      }],
    ])

    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
    })

    expect(result.groundDuties[0]).toMatchObject({
      assignment: 'TRN',
      startUtc: '2026-09-05T09:00:00.000Z',
      endUtc: '2026-09-05T17:00:00.000Z',
    })
  })

  it('preserves pairing duty boundaries when only later flight segments are in the window', async () => {
    const pgPool = createPool([
      [await activePbsUser()],
      [crewProfile],
      [
        {
          pairing_id: '54321',
          pairing_label: 'F8543',
          assignment: 'FLY',
          pairing_check_in_utc: '2026-08-31T23:30:00.000Z',
          pairing_release_utc: '2026-09-02T04:00:00.000Z',
          flt_id: '8001',
          flt_num: 'F8543',
          dep_arp: 'YEG',
          arv_arp: 'YVR',
          start_utc: '2026-09-01T01:00:00.000Z',
          end_utc: '2026-09-01T02:30:00.000Z',
        },
        {
          pairing_id: '54321',
          pairing_label: 'F8543',
          assignment: 'FLY',
          pairing_check_in_utc: '2026-08-31T23:30:00.000Z',
          pairing_release_utc: '2026-09-02T04:00:00.000Z',
          flt_id: '8002',
          flt_num: 'F8544',
          dep_arp: 'YVR',
          arv_arp: 'YEG',
          start_utc: '2026-09-02T01:30:00.000Z',
          end_utc: '2026-09-02T03:00:00.000Z',
        },
      ],
    ])

    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
      startDate: '2026-09-01',
      endDate: '2026-10-01',
    })

    expect(result.pairings[0]).toMatchObject({
      checkInUtc: '2026-08-31T23:30:00.000Z',
      releaseUtc: '2026-09-02T04:00:00.000Z',
    })
    expect(result.pairings[0].flights).toHaveLength(2)
  })

  it('defaults date window to current month plus next month', async () => {
    const pgPool = createPool([[await activePbsUser()], [crewProfile], []])

    await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
    })

    const queryCalls = pgPool.query.mock.calls as unknown as Array<[string, unknown[]]>
    const rosterQueryValues = queryCalls[2]?.[1]
    expect(rosterQueryValues).toEqual([
      '113',
      '2026-08-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ])
  })

  // Regression: `roster_flight.sch_str_dt_utc` / `pairing_segment.duty_sch_*_dt_utc`
  // are `timestamp without time zone` holding UTC wall-clock. Selecting them raw made
  // node-postgres parse the value as the SERVER's local time, so the API answered with
  // instants shifted by the machine's UTC offset (e.g. a 05:30Z ET duty came back as
  // 12:30Z on a Vancouver host) and the app drew those duties on the wrong day. The
  // query must render them as explicit UTC ISO strings in SQL.
  it('renders roster timestamps as explicit UTC ISO strings, never raw naive columns', async () => {
    const pgPool = createPool([[await activePbsUser()], [crewProfile], flyingRows])

    await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
    })

    const queryCalls = pgPool.query.mock.calls as unknown as Array<[string, unknown[]]>
    const rosterQuery = queryCalls[2]?.[0] ?? ''
    const utcIso = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`

    expect(rosterQuery).toContain(`${utcIso('rf.sch_str_dt_utc')} as start_utc`)
    expect(rosterQuery).toContain(`${utcIso('rf.sch_end_dt_utc')} as end_utc`)
    expect(rosterQuery).toContain(`${utcIso(REPORT_EXPR)} as segment_check_in_utc`)
    expect(rosterQuery).toContain(`${utcIso(RELEASE_EXPR)} as segment_release_utc`)
    expect(rosterQuery).toContain(utcIso(`min(${REPORT_EXPR_ALL})`))
    expect(rosterQuery).toContain(utcIso(`max(${RELEASE_EXPR_ALL})`))
    expect(rosterQuery).toContain(utcIso('min(rf_all.sch_str_dt_utc)'))
    expect(rosterQuery).toContain(utcIso('max(rf_all.sch_end_dt_utc)'))
    // The crew app prints the aircraft type next to the flight number; the fleet
    // code has to come from the flight row the roster segment points at.
    expect(rosterQuery).toContain('f.fleet')
  })

  // Regression (Ryan 2026-09-12, crew K1003 / pairing 152375 EK414 DXB–SYD): the Home
  // card printed "Check-in 02:00L" — identical to the 02:00L DXB departure — because the
  // roster read `duty_sch_str_dt_utc`, which the gantt build service fills with the duty's
  // FIRST DEPARTURE while the airline-imported rows put the report time there. The crew's
  // real check-in is the brief start (dep − 2h); release is the debrief end (arr + 15m).
  it('reads duty check-in/release from the brief/debrief anchors, not the flight times', async () => {
    const pgPool = createPool([[await activePbsUser()], [crewProfile], flyingRows])

    await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'EK',
      crewId: '113',
      password: 'Pier2026',
    })

    const queryCalls = pgPool.query.mock.calls as unknown as Array<[string, unknown[]]>
    const rosterQuery = queryCalls[2]?.[0] ?? ''

    // The brief (report) anchor outranks the departure column everywhere it is read.
    expect(rosterQuery.indexOf('ps.brief_start_utc')).toBeGreaterThan(-1)
    expect(rosterQuery).toContain(REPORT_EXPR)
    expect(rosterQuery).toContain(REPORT_EXPR_ALL)
    expect(rosterQuery).not.toContain('min(ps_all.duty_sch_str_dt_utc)')
    expect(rosterQuery).not.toContain('max(ps_all.duty_sch_end_dt_utc)')
    // Release likewise: debrief/dropoff end before the duty's last scheduled arrival column.
    expect(rosterQuery).toContain(RELEASE_EXPR)
    expect(rosterQuery).toContain(RELEASE_EXPR_ALL)
  })

  // Regression: the month window must be compared UTC-to-UTC. Passing the ISO
  // boundary straight at a naive column let Postgres reinterpret the column in the
  // session timezone (Asia/Bangkok on the dev DB), which moved the window edge by
  // hours and could drop a duty that starts just after midnight UTC.
  it('compares the date window against UTC wall-clock, not the session timezone', async () => {
    const pgPool = createPool([[await activePbsUser()], [crewProfile], []])

    await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'F8',
      crewId: '113',
      password: 'Pier2026',
      startDate: '2026-09-01',
      endDate: '2026-10-01',
    })

    const queryCalls = pgPool.query.mock.calls as unknown as Array<[string, unknown[]]>
    const rosterQuery = queryCalls[2]?.[0] ?? ''
    expect(rosterQuery).toContain('rf.sch_str_dt_utc >= ($2::timestamptz at time zone \'UTC\')')
    expect(rosterQuery).toContain('rf.sch_str_dt_utc < ($3::timestamptz at time zone \'UTC\')')
  })
})
