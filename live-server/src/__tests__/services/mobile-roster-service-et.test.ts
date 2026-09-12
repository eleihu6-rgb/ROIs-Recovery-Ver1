import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/index.js', () => ({
  env: {
    LIVE_SCHEMA: 'f8_dev_live',
    PBS_SCHEMA: 'f8_dev_pbs',
  },
}))

import {
  authenticateAndLoadMobileRoster,
  type MobileRosterServiceOptions,
} from '../../services/mobile-roster/mobile-roster-service.js'

type MockRow = Record<string, unknown>

const NOW = new Date('2026-08-28T12:00:00.000Z')

const activeEtPbsUser = async (): Promise<Record<string, unknown>> => ({
  user_code: 'J4002',
  crew_id: 'J4002',
  password_hash: await bcrypt.hash('Pier2026', 10),
  status: 0,
  password_access: '1',
  portal_access: '1',
  app_access: '1',
  eff_dt: '2026-01-01T00:00:00.000Z',
  exp_dt: null,
})

const etCrewProfile = {
  crew_id: 'J4002',
  first_name: 'Getnet',
  last_name: 'Kifle',
  base: 'ADD',
  rank: 'CA',
  nationality: 'ET',
}

const etFlyingRows: MockRow[] = [
  {
    pairing_id: '2001',
    pairing_label: 'ET805/ET802',
    assignment: 'FLT',
    pairing_check_in_utc: '2026-09-01T12:10:00.000Z',
    pairing_release_utc: '2026-09-01T18:30:00.000Z',
    flt_id: '9001',
    flt_num: 'ET805',
    fleet: '7M8',
    register: 'ET-AVK',
    dep_arp: 'ADD',
    arv_arp: 'NBO',
    start_utc: '2026-09-01T12:30:00.000Z',
    end_utc: '2026-09-01T14:30:00.000Z',
    est_start_utc: '2026-09-01T12:35:00.000Z',
    est_end_utc: '2026-09-01T14:40:00.000Z',
    act_start_utc: '2026-09-01T12:42:00.000Z',
    act_end_utc: '2026-09-01T14:47:00.000Z',
    blk_min: 120,
  },
  {
    pairing_id: '2001',
    pairing_label: 'ET805/ET802',
    assignment: 'FLT',
    pairing_check_in_utc: '2026-09-01T12:10:00.000Z',
    pairing_release_utc: '2026-09-01T18:30:00.000Z',
    flt_id: '9002',
    flt_num: 'ET802',
    fleet: '7M8',
    register: null,
    dep_arp: 'NBO',
    arv_arp: 'ADD',
    start_utc: '2026-09-01T16:00:00.000Z',
    end_utc: '2026-09-01T18:00:00.000Z',
    est_start_utc: null,
    est_end_utc: null,
    act_start_utc: null,
    act_end_utc: null,
    blk_min: 120,
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

describe('authenticateAndLoadMobileRoster (ET carrier)', () => {
  it('authenticates ET crew J4002 and echoes the ET airline through the response', async () => {
    const pgPool = createPool([[await activeEtPbsUser()], [etCrewProfile], etFlyingRows])

    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'ET',
      crewId: ' j4002 ',
      password: 'Pier2026',
    })

    expect(result.airline).toBe('ET')
    expect(result.crew).toMatchObject({ crewId: 'J4002', base: 'ADD' })
    // Profile screen: name + nationality come from the same crew row.
    expect(result.crew).toMatchObject({ firstName: 'Getnet', lastName: 'Kifle', nationality: 'ET' })
    expect(result.pairings).toHaveLength(1)
    expect(result.pairings[0].flights).toHaveLength(2)
    expect(result.pairings[0].flights.map(flight => flight.flightNumber)).toEqual([
      'ET805',
      'ET802',
    ])
    // Fleet/type rides along with each flight so the crew app can print the
    // aircraft next to the flight number (it showed nothing before this).
    expect(result.pairings[0].flights.map(flight => flight.fleet)).toEqual(['7M8', '7M8'])
    // Operational detail for the destination / trip-details pages: tail, ETD/ETA,
    // ATD/ATA and block time come straight off the flight row.
    expect(result.pairings[0].flights[0]).toMatchObject({
      register: 'ET-AVK',
      estStartUtc: '2026-09-01T12:35:00.000Z',
      estEndUtc: '2026-09-01T14:40:00.000Z',
      actStartUtc: '2026-09-01T12:42:00.000Z',
      actEndUtc: '2026-09-01T14:47:00.000Z',
      blockMinutes: 120,
    })
    // A flight with no estimate/actual yet stays null instead of inventing one.
    expect(result.pairings[0].flights[1]).toMatchObject({
      register: null,
      estStartUtc: null,
      actStartUtc: null,
      blockMinutes: 120,
    })
  })
})
