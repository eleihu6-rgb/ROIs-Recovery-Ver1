import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { calculateTransferGhCost } from './transfer-gh-cost.js'

const sourceCrewId = 'L3001'
const targetCrewId = 'J4011'
const pairingId = 152227

type RowOptions = {
  targetBefore?: number | null
  sourceBefore?: number | null
  pairingCredit?: number
  removedCredit?: number
  sourceComplete?: boolean
  sourceBaseMatches?: boolean
  targetBaseMatches?: boolean
  targetAssignedRows?: number
  sourceDivision?: string
  targetDivision?: string
  targetRankCount?: number
  creditMonth?: string
  endMonth?: string
  policy?: 'present' | 'missing'
}

const makeFixture = (options: RowOptions = {}): Pool => {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('WITH crew_ids')) {
      const shared = {
        pairing_id: pairingId,
        base: 'ADD',
        departure_at: '2026-09-18T00:15:00Z',
        arrival_at: '2026-09-18T23:05:00Z',
        credit_month: options.creditMonth ?? '2026-09',
        end_month: options.endMonth ?? options.creditMonth ?? '2026-09',
        pairing_credit: options.pairingCredit ?? 15.1666666666667,
        acting_rank: 'CA',
        rank_count: 0,
      }
      return {
        rows: [
          {
            ...shared,
            role: 'source',
            crew_id: sourceCrewId,
            division: options.sourceDivision ?? 'P',
            removed_credit: options.removedCredit ?? options.pairingCredit ?? 15.1666666666667,
            assigned_rows: 2,
            base_matches: options.sourceBaseMatches ?? true,
            complete_assignment: options.sourceComplete ?? true,
          },
          {
            ...shared,
            role: 'target',
            crew_id: targetCrewId,
            division: options.targetDivision ?? 'P',
            removed_credit: 0,
            assigned_rows: options.targetAssignedRows ?? 0,
            rank_count: options.targetRankCount ?? 0,
            base_matches: options.targetBaseMatches ?? true,
            complete_assignment: false,
          },
        ],
      }
    }
    if (sql.includes('FROM crew_manday_fd_daily')) {
      return {
        rows: [
          ...(options.sourceBefore === null ? [] : [{ crew_id: sourceCrewId, before_credit: options.sourceBefore ?? 20 }]),
          ...(options.targetBefore === null ? [] : [{ crew_id: targetCrewId, before_credit: options.targetBefore ?? 84 }]),
        ],
      }
    }
    if (sql.includes('SELECT r.id, r.currency_code, r.params_json, r.unit_price')) {
      if (options.policy === 'missing') return { rows: [] }
      return {
        rows: [{
          id: 501,
          currency_code: 'USD',
          params_json: { guaranteeHours: 85, tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }] },
          unit_price: 100,
        }],
      }
    }
    if (sql.includes('SELECT r.*,i.enabled')) {
      return {
        rows: [{
          id: Number(params[0]),
          cost_instance_id: 601,
          revision_no: 1,
          calculator_code: 'guarantee',
          effective_from: '2026-01-01T00:00:00.000Z',
          effective_to: null,
          currency_code: 'USD',
          unit_code: 'hour',
          unit_price: 100,
          params_json: { guaranteeHours: 85, tiers: [{ upToHours: 90, multiplier: 1.2 }, { upToHours: null, multiplier: 1.5 }] },
          applicability_json: {},
          reference: 'transfer-gh-test',
          gh_policy_revision_id: null,
          enabled: true,
        }],
      }
    }
    throw new Error(`Unexpected query: ${sql}`)
  })
  return { query } as unknown as Pool
}

const context = { sourceCrewId, sourcePairingId: pairingId, targetCrewId }

describe('calculateTransferGhCost', () => {
  it('quotes zero incremental pay when the receiving crew stays below the GH floor', async () => {
    const result = await calculateTransferGhCost(makeFixture({ targetBefore: 40 }), context)

    // 40 + 15.17 stays under the 85h floor → no incremental pay; source saving 0.
    expect(result.directCost).toBe(0)
    expect(result.breakdown.map((row) => row.label)).toEqual([
      `Crew ${targetCrewId} — incremental GH pay`,
      `Crew ${sourceCrewId} — released-duty GH saving`,
    ])
    expect(result.breakdown.map((row) => row.amount)).toEqual([0, 0])
    expect(result.notes.join('\n')).toContain('credit before 40:00 → after 55:10')
  })

  it('prices the receiving crew when the transferred duty crosses the floor and upper tier', async () => {
    const result = await calculateTransferGhCost(makeFixture({ targetBefore: 84, pairingCredit: 15 }), context)

    // 84 → 99: (90−85)×1.2×100 + (99−90)×1.5×100 = 600 + 1350 = 1950.
    expect(result.breakdown[0]?.amount).toBe(1950)
    expect(result.directCost).toBe(1950 + Number(result.breakdown[1]?.amount))
    expect(result.notes.join('\n')).toContain('credit before 84:00 → after 99:00')
  })

  it('treats a receiving crew with no saved credit rows as an empty-month 0h baseline', async () => {
    const result = await calculateTransferGhCost(makeFixture({ targetBefore: null }), context)

    expect(result.breakdown[0]?.amount).toBe(0)
    expect(result.notes.join('\n')).toContain('no saved credit rows for the month, baseline 0h')
  })

  it('excludes the source saving and says so when the source has no saved credit baseline', async () => {
    const result = await calculateTransferGhCost(makeFixture({ sourceBefore: null }), context)

    expect(result.breakdown.map((row) => row.label)).toEqual([`Crew ${targetCrewId} — incremental GH pay`])
    expect(result.notes.join('\n')).toContain('no saved calendar-month credit baseline')
  })

  it('excludes the source saving when its saved baseline is below the released duty credit', async () => {
    const result = await calculateTransferGhCost(makeFixture({ sourceBefore: 7.58, pairingCredit: 15 }), context)

    expect(result.breakdown.map((row) => row.label)).toEqual([`Crew ${targetCrewId} — incremental GH pay`])
    expect(result.notes.join('\n')).toContain('exceeds the crew\'s saved 7:35 baseline')
  })

  it.each([
    ['an incomplete source assignment', { sourceComplete: false }],
    ['a source base mismatch', { sourceBaseMatches: false }],
    ['a target base mismatch', { targetBaseMatches: false }],
    ['a target already assigned to the pairing', { targetAssignedRows: 2 }],
    ['a non-pilot source', { sourceDivision: 'C' }],
    ['a non-pilot target', { targetDivision: 'C' }],
    ['a multi-rank target duty', { targetRankCount: 1 }],
    ['a cross-month pairing', { endMonth: '2026-10' }],
    ['a missing GH policy', { policy: 'missing' }],
  ])('rejects %s', async (_label, options) => {
    await expect(calculateTransferGhCost(makeFixture(options), context)).rejects.toThrow()
  })

  it('rejects a transfer to the same crew', async () => {
    await expect(calculateTransferGhCost({ query: vi.fn() } as unknown as Pool, { ...context, targetCrewId: sourceCrewId }))
      .rejects.toThrow('two different crews')
  })
})
