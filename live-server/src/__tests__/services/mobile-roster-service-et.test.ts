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
    dep_arp: 'ADD',
    arv_arp: 'NBO',
    start_utc: '2026-09-01T12:30:00.000Z',
    end_utc: '2026-09-01T14:30:00.000Z',
  },
  {
    pairing_id: '2001',
    pairing_label: 'ET805/ET802',
    assignment: 'FLT',
    pairing_check_in_utc: '2026-09-01T12:10:00.000Z',
    pairing_release_utc: '2026-09-01T18:30:00.000Z',
    flt_id: '9002',
    flt_num: 'ET802',
    dep_arp: 'NBO',
    arv_arp: 'ADD',
    start_utc: '2026-09-01T16:00:00.000Z',
    end_utc: '2026-09-01T18:00:00.000Z',
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
    expect(result.pairings).toHaveLength(1)
    expect(result.pairings[0].flights).toHaveLength(2)
    expect(result.pairings[0].flights.map(flight => flight.flightNumber)).toEqual([
      'ET805',
      'ET802',
    ])
  })
})
