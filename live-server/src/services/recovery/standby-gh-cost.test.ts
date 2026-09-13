import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { calculateStandbyGhCost } from './standby-gh-cost.js'

const crewId = 'J4011'
const pairingId = 152097
const standbyTaskId = 1355001
const reportAt = '2026-09-24T02:00:00Z'
const departureAt = '2026-09-24T05:10:00Z'

type FixtureOptions = {
  beforeCredit?: number
  assignment?: string
  division?: string
  creditMonth?: string
  endMonth?: string
  standbyMonth?: string
  monthlyCredit?: number | null
  pairingCredit?: number
  baselineStandbyCredit?: number
  policy?: 'effective' | 'missing'
  ghEnabled?: boolean
  standbyUnitPrice?: number | null
  ghUnitPrice?: number | null
  standbyParams?: Record<string, unknown>
}

const makeFixture = (options: FixtureOptions = {}): { pool: Pool; query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT rf.assignment')) {
      return {
        rows: [{
          assignment: options.assignment ?? 'ASBY',
          crew_id: crewId,
          division: options.division ?? 'P',
          report_at: reportAt,
          departure_at: departureAt,
          credit_month: options.creditMonth ?? '2026-09',
          end_month: options.endMonth ?? '2026-09',
          standby_month: options.standbyMonth ?? '2026-09',
          baseline_standby_credit: options.baselineStandbyCredit ?? 4,
          pairing_credit: options.pairingCredit ?? 15.25,
        }],
      }
    }

    if (sql.includes('FROM crew_manday_fd_daily')) {
      return { rows: [{ before_credit: options.monthlyCredit !== undefined ? options.monthlyCredit : options.beforeCredit ?? 80 }] }
    }

    if (sql.includes('SELECT r.id, r.gh_policy_revision_id')) {
      if (options.policy === 'missing') return { rows: [] }
      return {
        rows: [{
          id: 501,
          gh_policy_revision_id: 502,
          currency_code: 'USD',
          gh_params: {
            guaranteeHours: 85,
            tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }],
          },
        }],
      }
    }

    if (sql.includes('SELECT r.*,i.enabled')) {
      const revisionId = Number(params[0])
      if (revisionId === 501) {
        return {
          rows: [{
            id: 501,
            cost_instance_id: 601,
            revision_no: 1,
            calculator_code: 'standby',
            effective_from: '2026-01-01T00:00:00.000Z',
            effective_to: null,
            currency_code: 'USD',
            unit_code: 'hour',
            unit_price: options.standbyUnitPrice ?? null,
            params_json: options.standbyParams ?? { creditFactor: 0.5, departureCutoffMinutes: 60 },
            applicability_json: {},
            reference: 'standby-test',
            gh_policy_revision_id: 502,
            enabled: true,
          }],
        }
      }
      return {
        rows: [{
          id: 502,
          cost_instance_id: 602,
          revision_no: 1,
          calculator_code: 'guarantee',
          effective_from: '2026-01-01T00:00:00.000Z',
          effective_to: null,
          currency_code: 'USD',
          unit_code: 'hour',
          unit_price: options.ghUnitPrice ?? 100,
          params_json: {
            guaranteeHours: 85,
            tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }],
          },
          applicability_json: {},
          reference: 'gh-test',
          gh_policy_revision_id: null,
          enabled: options.ghEnabled ?? true,
        }],
      }
    }

    throw new Error(`Unexpected query: ${sql}`)
  })
  return { pool: { query } as unknown as Pool, query }
}

const context = { crewId, pairingId, standbyTaskId }

const expectReject = async (promise: Promise<unknown>, message: string): Promise<void> => {
  await expect(promise).rejects.toThrow(message)
}

describe('calculateStandbyGhCost', () => {
  it.each([
    [80, 950],
    [74, 160],
    [100, 1850],
  ])('prices baseline credit %dh through GH tiers at USD100 (%d USD)', async (beforeCredit, expectedAmount) => {
    const { pool } = makeFixture({ beforeCredit })
    const result = await calculateStandbyGhCost(pool, context)

    expect(result).toMatchObject({ directCost: expectedAmount, currency: 'USD' })
    expect(result.notes.join('\n')).toContain('Pairing credit 15:15 + callout standby credit 1:05 − already credited standby 4:00')
  })

  it('subtracts the already-credited standby and preserves a zero priced delta', async () => {
    const { pool } = makeFixture({ beforeCredit: 80, pairingCredit: 7.9166666667 })
    const result = await calculateStandbyGhCost(pool, context)

    expect(result.directCost).toBe(0)
    expect(result.breakdown[0]).toMatchObject({ amount: 0, status: 'priced', currencyCode: 'USD' })
  })

  it('uses the calendar month in the saved-credit query and the departure timestamp for policy selection', async () => {
    const { pool, query } = makeFixture({ beforeCredit: 80 })
    await calculateStandbyGhCost(pool, context)

    const monthlyCall = query.mock.calls.find(([sql]) => String(sql).includes('FROM crew_manday_fd_daily'))
    expect(monthlyCall?.[1]).toEqual([crewId, '2026-09'])
    const policyCall = query.mock.calls.find(([sql]) => String(sql).includes('SELECT r.id, r.gh_policy_revision_id'))
    expect(policyCall?.[1]).toEqual([departureAt])
  })

  it('rejects a non-airport-standby task', async () => {
    const { pool } = makeFixture({ assignment: 'GRND' })
    await expectReject(calculateStandbyGhCost(pool, context), 'Airport standby pricing requires')
  })

  it('rejects a non-pilot standby task', async () => {
    const { pool } = makeFixture({ division: 'C' })
    await expectReject(calculateStandbyGhCost(pool, context), 'Airport standby pricing requires')
  })

  it('rejects a cross-month pairing', async () => {
    const { pool } = makeFixture({ endMonth: '2026-10' })
    await expectReject(calculateStandbyGhCost(pool, context), 'requires one calendar month')
  })

  it('rejects when saved calendar-month credit is missing', async () => {
    const { pool } = makeFixture({ monthlyCredit: null })
    await expectReject(calculateStandbyGhCost(pool, context), 'Saved calendar-month crew credit is unavailable')
  })

  it('returns a disabled, unpriced result when the pinned GH policy is disabled', async () => {
    const { pool } = makeFixture({ ghEnabled: false })
    const result = await calculateStandbyGhCost(pool, context)

    expect(result).toMatchObject({ directCost: null, currency: 'USD' })
    expect(result.breakdown[0]).toMatchObject({ amount: null, status: 'disabled' })
  })

  it('rejects when no effective standby policy with a pinned GH revision exists', async () => {
    const { pool } = makeFixture({ policy: 'missing' })
    await expectReject(calculateStandbyGhCost(pool, context), 'No effective airport standby policy')
  })
})
