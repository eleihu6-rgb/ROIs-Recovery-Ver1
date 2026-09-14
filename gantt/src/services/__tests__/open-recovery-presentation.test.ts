import { describe, expect, it } from 'vitest'
import { staffingOptionToRecoveryOption } from '../open-recovery-presentation'
import type { StaffingOption } from '../open-pairing-recovery'

const roster = (id: number, pairingId: number | null, label: string, start: string) => ({
  id, pairingId, label, schStrDtUtc: start, briefStartUtc: null, assignment: null, assignmentGroup: pairingId == null ? 'SBY' : 'FLY',
})

const option = (overrides: Partial<StaffingOption> = {}): StaffingOption => ({
  id: 'standby-42-CA-C4001', method: 'standby', crewId: 'C4001', crewName: 'Test Crew', rank: 'CA', pairingId: 42,
  standbyTaskId: 10, beforeItems: [roster(10, null, 'SBY', '2026-09-17T04:00:00Z')],
  afterItems: [roster(10, null, 'SBY', '2026-09-17T04:00:00Z'), roster(20, 42, 'ET895 ADD-BJM', '2026-09-17T07:15:00Z'), roster(21, 42, 'ET894 BJM-ADD', '2026-09-17T12:35:00Z')],
  operations: [], costInput: {} as StaffingOption['costInput'], reasons: [], ruleMessages: [], ruleCheck: 'not-run', fingerprint: 'before', pairingFingerprint: 'pairing',
  ...overrides,
})

describe('staffingOptionToRecoveryOption', () => {
  it('keeps standby visible and adds the open pairing without inventing a source crew', () => {
    const result = staffingOptionToRecoveryOption(option())
    expect(result.sourceCrewId).toBe('')
    expect(result.changes.map((change) => change.changeType)).toEqual(['keep', 'add'])
    expect(result.changes[0]?.after).toContain('Callout standby retained')
    expect(result.changes[1]?.after).toContain('ET895')
    expect(result.changes[1]?.after).toContain('ET894')
    expect(staffingOptionToRecoveryOption(option(), 100).metrics.rosterStability).toBe(99.65)
  })

  it('represents move-up donor release and preserves unpriced cost state', () => {
    const result = staffingOptionToRecoveryOption(option({
      id: 'move-up-42-CA-C4001', method: 'move-up', donorPairingId: 7, standbyTaskId: undefined,
      beforeItems: [roster(30, 7, 'ET700 donor', '2026-09-17T03:00:00Z')],
      afterItems: [roster(20, 42, 'ET895 target', '2026-09-17T05:15:00Z')],
      cost: { directCost: null, currency: 'CNY', breakdown: [], notes: ['Missing revision'] },
    }))
    expect(result.changes.map((change) => change.changeType)).toEqual(['cancel', 'add'])
    expect(result.changes[0]?.after).toContain('vacant donor seat')
    expect(result.metrics.costEnrichmentFailed).toBe(true)
    expect(result.metrics.directCost).toBe(0)
  })

  it('copies priced cost breakdown and keeps available assignment as an add', () => {
    const result = staffingOptionToRecoveryOption(option({ method: 'available', standbyTaskId: undefined, cost: { directCost: 1234, currency: 'CNY', breakdown: [], notes: [] } }))
    expect(result.mode).toBe('transfer')
    expect(result.changes).toHaveLength(1)
    expect(result.metrics).toMatchObject({ directCost: 1234, totalCost: 1234, costEnrichmentFailed: false })
  })
})
