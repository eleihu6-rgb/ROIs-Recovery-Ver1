import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { calculateOpenPairingGhCost } from './open-pairing-gh-cost.js'

const crewId = 'J4001'
const targetPairingId = 152800
const donorPairingId = 152801

type FixtureOptions = {
  donor?: boolean
  targetCredit?: number | null
  donorRemovedCredit?: number | null
  targetMonth?: string
  targetEndMonth?: string
  donorMonth?: string
  donorEndMonth?: string
  donorComplete?: boolean
  donorBaseMatches?: boolean
  donorBase?: string
  donorDivision?: string
  targetBaseMatches?: boolean
  targetDivision?: string
  targetAssigned?: boolean
  monthlyCredit?: number | null
  policy?: boolean
}

const makeFixture = (options: FixtureOptions = {}): { pool: Pool; query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('WITH participants')) {
      const target = {
        crew_id: crewId, pairing_id: targetPairingId, base: 'ADD', division: options.targetDivision ?? 'P',
        departure_at: '2026-09-20T10:00:00Z', arrival_at: '2026-09-20T20:00:00Z',
        credit_month: options.targetMonth ?? '2026-09', end_month: options.targetEndMonth ?? '2026-09',
        pairing_credit: options.targetCredit === undefined ? 15 : options.targetCredit, removed_credit: 0,
        rank_count: 0, complete_assignment: false, base_matches: options.targetBaseMatches ?? true,
      }
      if (!options.donor) return { rows: [target] }
      return { rows: [target, {
        ...target, pairing_id: donorPairingId, base: options.donorBase ?? target.base, division: options.donorDivision ?? target.division,
        departure_at: '2026-09-18T08:00:00Z', arrival_at: '2026-09-18T18:00:00Z',
        credit_month: options.donorMonth ?? '2026-09', end_month: options.donorEndMonth ?? '2026-09',
        pairing_credit: 12, removed_credit: options.donorRemovedCredit === undefined ? 12 : options.donorRemovedCredit,
        complete_assignment: options.donorComplete ?? true, base_matches: options.donorBaseMatches ?? true,
      }] }
    }
    if (sql.includes('SELECT 1 FROM roster_flight')) return { rows: options.targetAssigned ? [{}] : [] }
    if (sql.includes('FROM crew_manday_fd_daily')) return { rows: options.monthlyCredit === null ? [] : [{ crew_id: crewId, before_credit: options.monthlyCredit ?? 80 }] }
    if (sql.includes('SELECT r.id, r.currency_code')) return { rows: options.policy === false ? [] : [{ id: 501, currency_code: 'USD', params_json: { guaranteeHours: 85, tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }] }, unit_price: 100 }] }
    if (sql.includes('SELECT r.*,i.enabled')) return { rows: [{ id: 501, cost_instance_id: 601, revision_no: 1, calculator_code: 'guarantee', effective_from: '2026-01-01T00:00:00.000Z', effective_to: null, currency_code: 'USD', unit_code: 'hour', unit_price: 100, params_json: { guaranteeHours: 85, tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }] }, applicability_json: {}, reference: 'open-pairing-test', gh_policy_revision_id: null, enabled: true }] }
    throw new Error(`Unexpected query: ${sql}`)
  })
  return { pool: { query } as unknown as Pool, query }
}

describe('calculateOpenPairingGhCost', () => {
  it('prices a new open-pairing assignment from saved target duty and monthly credit, with no source crew', async () => {
    const { pool, query } = makeFixture({ monthlyCredit: 84 })
    const result = await calculateOpenPairingGhCost(pool, { crewId, pairingId: targetPairingId })

    expect(result.directCost).toBe(1950)
    expect(result.breakdown[0]).toMatchObject({ label: `Crew ${crewId} — incremental GH pay`, amount: 1950, status: 'priced' })
    expect(result.notes.join('\n')).toContain('84.00h − 0.00h + 15.00h')
    const monthlyCall = query.mock.calls.find(([sql]) => String(sql).includes('FROM crew_manday_fd_daily'))
    expect(monthlyCall?.[1]).toEqual([[crewId], '2026-09'])
  })

  it('uses received target credit and removed donor credit for move-up pricing', async () => {
    const { pool } = makeFixture({ donor: true, monthlyCredit: 84, targetCredit: 15, donorRemovedCredit: 12 })
    const result = await calculateOpenPairingGhCost(pool, { crewId, pairingId: targetPairingId, donorPairingId })

    expect(result.breakdown).toHaveLength(1)
    expect(result.directCost).toBe(240)
    expect(result.notes.join('\n')).toContain('84.00h − 12.00h + 15.00h')
    expect(result.notes.join('\n')).toContain(`Donor pairing ${donorPairingId} loses this crew`)
  })

  it.each([
    ['target division mismatch', { targetDivision: 'C' }],
    ['target base mismatch', { targetBaseMatches: false }],
    ['target already assigned', { targetAssigned: true }],
    ['incomplete donor', { donor: true, donorComplete: false }],
    ['donor base mismatch', { donor: true, donorBaseMatches: false }],
    ['donor pairing base differs from target', { donor: true, donorBase: 'NBO' }],
    ['donor division differs from target', { donor: true, donorDivision: 'C' }],
    ['cross-month target', { targetEndMonth: '2026-10' }],
    ['cross-month donor', { donor: true, donorEndMonth: '2026-10' }],
    ['missing monthly inputs', { monthlyCredit: null }],
    ['missing target saved credit', { targetCredit: null }],
    ['missing donor saved credit', { donor: true, donorRemovedCredit: null }],
    ['missing GH policy', { policy: false }],
  ])('rejects %s', async (_label, options) => {
    const fixtureOptions = options as FixtureOptions
    await expect(calculateOpenPairingGhCost(makeFixture(fixtureOptions).pool, { crewId, pairingId: targetPairingId, ...(fixtureOptions.donor ? { donorPairingId } : {}) })).rejects.toThrow()
  })

  it('rejects a donor identical to the open pairing', async () => {
    await expect(calculateOpenPairingGhCost(makeFixture().pool, { crewId, pairingId: targetPairingId, donorPairingId: targetPairingId })).rejects.toThrow('must differ')
  })
})
