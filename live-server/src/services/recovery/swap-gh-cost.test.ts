import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { calculateSwapGhCost } from './swap-gh-cost.js'

const sourceCrewId = 'J4002'
const targetCrewId = 'J4011'
const sourcePairingId = 152097
const targetPairingId = 152098

type RowOptions = {
  sourceBefore?: number | null
  targetBefore?: number | null
  sourcePairingCredit?: number | null
  targetPairingCredit?: number | null
  sourceRemovedCredit?: number | null
  targetRemovedCredit?: number | null
  sourceMonth?: string
  targetMonth?: string
  sourceEndMonth?: string
  targetEndMonth?: string
  sourceComplete?: boolean
  targetComplete?: boolean
  sourceBaseMatches?: boolean
  targetBaseMatches?: boolean
  sourceDivision?: string
  targetDivision?: string
  sourceRank?: string | null
  targetRank?: string | null
  sourceRankCount?: number
  targetRankCount?: number
  policy?: 'present' | 'missing'
  policyCurrency?: string
  policyRate?: number | null
  policyEnabled?: boolean
  ghEnabled?: boolean
}

const makeFixture = (options: RowOptions = {}): { pool: Pool; query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('WITH participants')) {
      return {
        rows: [
          {
            crew_id: sourceCrewId,
            pairing_id: sourcePairingId,
            base: 'ADD',
            division: options.sourceDivision ?? 'P',
            departure_at: '2026-09-24T05:00:00Z',
            arrival_at: '2026-09-24T12:00:00Z',
            credit_month: options.sourceMonth ?? '2026-09',
            end_month: options.sourceEndMonth ?? options.sourceMonth ?? '2026-09',
            pairing_credit: options.sourcePairingCredit === undefined ? 15 : options.sourcePairingCredit,
            removed_credit: options.sourceRemovedCredit === undefined ? 15 : options.sourceRemovedCredit,
            acting_rank: options.sourceRank === undefined ? 'CA' : options.sourceRank,
            rank_count: options.sourceRankCount ?? 0,
            complete_assignment: options.sourceComplete ?? true,
            base_matches: options.sourceBaseMatches ?? true,
          },
          {
            crew_id: targetCrewId,
            pairing_id: targetPairingId,
            base: 'ADD',
            division: options.targetDivision ?? 'P',
            departure_at: '2026-09-25T05:00:00Z',
            arrival_at: '2026-09-25T12:00:00Z',
            credit_month: options.targetMonth ?? '2026-09',
            end_month: options.targetEndMonth ?? options.targetMonth ?? '2026-09',
            pairing_credit: options.targetPairingCredit === undefined ? 8 : options.targetPairingCredit,
            removed_credit: options.targetRemovedCredit === undefined ? 8 : options.targetRemovedCredit,
            acting_rank: options.targetRank === undefined ? 'CA' : options.targetRank,
            rank_count: options.targetRankCount ?? 0,
            complete_assignment: options.targetComplete ?? true,
            base_matches: options.targetBaseMatches ?? true,
          },
        ],
      }
    }

    if (sql.includes('FROM crew_manday_fd_daily')) {
      return {
        rows: [
          ...(options.sourceBefore !== null
            ? [{ crew_id: sourceCrewId, before_credit: options.sourceBefore ?? 80 }]
            : []),
          ...(options.targetBefore !== null
            ? [{ crew_id: targetCrewId, before_credit: options.targetBefore ?? 80 }]
            : []),
        ],
      }
    }

    if (sql.includes('SELECT r.id, r.currency_code, r.params_json')) {
      if (options.policy === 'missing') return { rows: [] }
      return {
        rows: [{
          id: 501,
          currency_code: options.policyCurrency ?? 'USD',
          params_json: {
            guaranteeHours: 85,
            tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }],
          },
          unit_price: options.policyRate === undefined ? 100 : options.policyRate,
        }],
      }
    }

    if (sql.includes('SELECT r.*,i.enabled')) {
      const revisionId = Number(params[0])
      return {
        rows: [{
          id: revisionId,
          cost_instance_id: revisionId === 501 ? 601 : 602,
          revision_no: 1,
          calculator_code: 'guarantee',
          effective_from: '2026-01-01T00:00:00.000Z',
          effective_to: null,
          currency_code: options.policyCurrency ?? 'USD',
          unit_code: 'hour',
          unit_price: options.policyRate === undefined ? 100 : options.policyRate,
          params_json: {
            guaranteeHours: 85,
            tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }],
          },
          applicability_json: {},
          reference: 'swap-gh-test',
          gh_policy_revision_id: null,
          enabled: options.policyEnabled ?? options.ghEnabled ?? true,
        }],
      }
    }

    throw new Error(`Unexpected query: ${sql}`)
  })
  return { pool: { query } as unknown as Pool, query }
}

const context = { sourceCrewId, sourcePairingId, targetCrewId, targetPairingId }
const expectReject = async (promise: Promise<unknown>, message: string): Promise<void> => {
  await expect(promise).rejects.toThrow(message)
}

describe('calculateSwapGhCost', () => {
  it('returns zero when both crews remain below the GH floor', async () => {
    const { pool } = makeFixture({ sourceBefore: 80, targetBefore: 80, sourcePairingCredit: 8, sourceRemovedCredit: 8 })
    const result = await calculateSwapGhCost(pool, context)

    expect(result).toMatchObject({ directCost: 0, currency: 'USD' })
    expect(result.breakdown.map((row) => row.amount)).toEqual([0, 0])
  })

  it('prices the target crew when the received pairing crosses the floor and upper tier', async () => {
    const { pool } = makeFixture({
      sourceBefore: 80,
      targetBefore: 84,
      sourcePairingCredit: 15,
      targetPairingCredit: 8,
    })
    const result = await calculateSwapGhCost(pool, context)

    // Target: 84 - 8 + 15 = 91 hours; GH delta is 5×1.2×100 + 1×1.5×100 = 750.
    expect(result.directCost).toBe(750)
    expect(result.breakdown.map((row) => row.amount)).toEqual([750, 0])
    expect(result.notes.join('\n')).toContain('credit before 84:00 → after 91:00')
  })

  it('preserves a negative source saving and a negative net swap total', async () => {
    const { pool } = makeFixture({
      sourceBefore: 100,
      targetBefore: 85,
      sourcePairingCredit: 10,
      targetPairingCredit: 5,
      sourceRemovedCredit: 20,
      targetRemovedCredit: 5,
    })
    const result = await calculateSwapGhCost(pool, context)

    // Source: 100 -> 85 = -2100; target: 85 -> 90 = +600.
    expect(result.breakdown[0]?.amount).toBe(600)
    expect(result.breakdown[1]?.amount).toBe(-2100)
    expect(result.directCost).toBe(-1500)
  })

  it('rejects identical crew identities', async () => {
    await expectReject(calculateSwapGhCost({ query: vi.fn() } as unknown as Pool, { ...context, targetCrewId: sourceCrewId }), 'two different crews and pairings')
  })

  it('rejects identical pairing identities', async () => {
    await expectReject(calculateSwapGhCost({ query: vi.fn() } as unknown as Pool, { ...context, targetPairingId: sourcePairingId }), 'two different crews and pairings')
  })

  it.each([
    ['incomplete source assignment', { sourceComplete: false }],
    ['base mismatch', { sourceBaseMatches: false }],
    ['non-pilot source', { sourceDivision: 'C' }],
    ['rank count mismatch', { sourceRankCount: 1 }],
    ['different acting rank', { targetRank: 'FO' }],
    ['different calendar month', { targetMonth: '2026-10' }],
    ['cross-month target pairing', { targetEndMonth: '2026-10' }],
  ])('rejects %s', async (_label, options) => {
    const { pool } = makeFixture(options)
    await expectReject(calculateSwapGhCost(pool, context), 'Swap GH pricing')
  })

  it('rejects unavailable saved pairing credit', async () => {
    const { pool } = makeFixture({ sourcePairingCredit: null })
    await expectReject(calculateSwapGhCost(pool, context), 'Saved pairing duty credit is unavailable')
  })

  it('rejects unavailable saved monthly credit', async () => {
    const { pool } = makeFixture({ targetBefore: null })
    await expectReject(calculateSwapGhCost(pool, context), 'Saved calendar-month crew credit is unavailable')
  })

  it('rejects removed credit greater than baseline credit', async () => {
    const { pool } = makeFixture({ sourceBefore: 10, sourceRemovedCredit: 15 })
    await expectReject(calculateSwapGhCost(pool, context), 'Removed credit cannot exceed baseline credit')
  })

  it('rejects a missing effective GH policy', async () => {
    const { pool } = makeFixture({ policy: 'missing' })
    await expectReject(calculateSwapGhCost(pool, context), 'No default GH policy')
  })

  it('returns null rather than zero when the GH revision is disabled or unpriced', async () => {
    const disabled = await calculateSwapGhCost(makeFixture({ ghEnabled: false }).pool, context)
    expect(disabled).toMatchObject({ directCost: null, currency: 'USD' })
    expect(disabled.breakdown.every((row) => row.status === 'disabled')).toBe(true)

    const unpriced = await calculateSwapGhCost(makeFixture({ policyRate: null }).pool, context)
    expect(unpriced).toMatchObject({ directCost: null, currency: 'USD' })
    expect(unpriced.breakdown.every((row) => row.amount === null && row.status === 'unpriced')).toBe(true)
  })

  it('uses both departure/arrival policy bounds and one source calendar-month query', async () => {
    const { pool, query } = makeFixture()
    await calculateSwapGhCost(pool, context)

    const monthlyCall = query.mock.calls.find(([sql]) => String(sql).includes('FROM crew_manday_fd_daily'))
    expect(monthlyCall?.[1]).toEqual([[sourceCrewId, targetCrewId], '2026-09'])
    const policyCall = query.mock.calls.find(([sql]) => String(sql).includes('SELECT r.id, r.currency_code, r.params_json'))
    expect(policyCall?.[1]).toEqual(['2026-09-24T05:00:00Z', '2026-09-25T12:00:00Z'])
  })
})
