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

const NOW = new Date('2026-09-12T06:00:00.000Z')

// Crew K1003 (Khalid Al Nuaimi, CA, A380, DXB) — the UAE batch seeded on
// 2026-08-27. Their roster is Emirates, but the app can only reach it through
// the shared ROIS mobile-roster endpoint. Ryan, 2026-09-11: the UAE crew's app
// header showed the Ethiopian logo, because branding followed the sign-in
// option instead of the crew's own carrier.
const uaeCrewProfile = {
  crew_id: 'K1003',
  first_name: 'Khalid',
  last_name: 'Al Nuaimi',
  base: 'DXB',
  rank: 'CA',
  nationality: 'AE',
}

const uaeFlyingRows: MockRow[] = [
  {
    pairing_id: '150388',
    pairing_label: 'EK763/EK764',
    assignment: 'PAX',
    pairing_check_in_utc: '2026-09-01T04:15:00.000Z',
    pairing_release_utc: '2026-09-03T03:50:00.000Z',
    flt_id: '146115',
    flt_num: 'EK763',
    carrier: 'EK',
    fleet: 'A380',
    register: null,
    dep_arp: 'DXB',
    arv_arp: 'JNB',
    start_utc: '2026-09-01T04:15:00.000Z',
    end_utc: '2026-09-01T12:30:00.000Z',
    est_start_utc: null,
    est_end_utc: null,
    act_start_utc: '2026-09-01T04:15:00.000Z',
    act_end_utc: '2026-09-01T12:30:00.000Z',
    blk_min: 495,
  },
  {
    pairing_id: '150388',
    pairing_label: 'EK763/EK764',
    assignment: 'PAX',
    pairing_check_in_utc: '2026-09-01T04:15:00.000Z',
    pairing_release_utc: '2026-09-03T03:50:00.000Z',
    flt_id: '146118',
    flt_num: 'EK764',
    carrier: 'EK',
    fleet: 'A380',
    register: null,
    dep_arp: 'JNB',
    arv_arp: 'DXB',
    start_utc: '2026-09-02T19:35:00.000Z',
    end_utc: '2026-09-03T03:50:00.000Z',
    est_start_utc: null,
    est_end_utc: null,
    act_start_utc: null,
    act_end_utc: null,
    blk_min: 495,
  },
]

const activeUaePbsUser = async (): Promise<Record<string, unknown>> => ({
  user_code: 'K1003',
  crew_id: 'K1003',
  password_hash: await bcrypt.hash('Pier2026', 10),
  status: 0,
  password_access: '1',
  portal_access: '1',
  app_access: '1',
  eff_dt: '2026-01-01T00:00:00.000Z',
  exp_dt: null,
})

const createPool = (rows: MockRow[][]) => ({
  query: vi.fn(async (): Promise<{ rows: MockRow[] }> => ({ rows: rows.shift() ?? [] })),
})

const serviceOptions = (pgPool: ReturnType<typeof createPool>) => ({
  pgPool: pgPool as MobileRosterServiceOptions['pgPool'],
  liveSchema: 'f8_dev_live',
  pbsSchema: 'f8_dev_pbs',
  now: NOW,
})

describe('mobile roster — the crew’s own carrier', () => {
  it('reports the carrier the crew flies, not the airline that signed in', async () => {
    const pgPool = createPool([[await activeUaePbsUser()], [uaeCrewProfile], uaeFlyingRows])

    // Signed in through the ET option: same ROIS endpoint, same credentials.
    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'ET',
      crewId: 'k1003',
      password: 'Pier2026',
    })

    // The sign-in airline still echoes — it names the roster service.
    expect(result.airline).toBe('ET')
    // …but the crew's carrier comes from their flights, which is what the app
    // draws in the header and uses for the carrier theme.
    expect(result.crew.carrier).toBe('EK')
    expect(result.pairings[0].flights.map(flight => flight.carrier)).toEqual(['EK', 'EK'])
  })

  it('leaves the crew carrier null when the window has no flights to read it from', async () => {
    const groundOnlyRow: MockRow = {
      pairing_id: null,
      pairing_label: null,
      assignment: 'GDO',
      pairing_check_in_utc: null,
      pairing_release_utc: null,
      flt_id: null,
      flt_num: null,
      carrier: null,
      fleet: null,
      register: null,
      dep_arp: null,
      arv_arp: null,
      start_utc: '2026-09-05T00:00:00.000Z',
      end_utc: '2026-09-05T23:59:00.000Z',
      est_start_utc: null,
      est_end_utc: null,
      act_start_utc: null,
      act_end_utc: null,
      blk_min: null,
    }
    const pgPool = createPool([[await activeUaePbsUser()], [uaeCrewProfile], [groundOnlyRow]])

    const result = await authenticateAndLoadMobileRoster(serviceOptions(pgPool), {
      airline: 'ET',
      crewId: 'K1003',
      password: 'Pier2026',
    })

    expect(result.crew.carrier).toBeNull()
    expect(result.groundDuties).toHaveLength(1)
  })
})
