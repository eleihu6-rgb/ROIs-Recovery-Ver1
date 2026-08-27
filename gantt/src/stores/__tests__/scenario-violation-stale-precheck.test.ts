import { describe, expect, it, beforeEach, vi } from 'vitest'
import { getScenarioViolationStore, destroyScenarioViolationStore } from '@/stores/scenario-violation-store'

const runRuleBatch = vi.hoisted(() => vi.fn())

vi.mock('@/utils/run-rule-batch', () => ({
  runRuleBatch: (...args: unknown[]) => runRuleBatch(...args),
}))

vi.mock('@/stores/rule-check-store', () => ({
  useRuleCheckStore: { getState: () => ({ ruleGroupCode: '103' }) },
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: { getState: () => ({ getQuals: () => null }) },
}))

const SCENARIO_ID = 999002

describe('scenario-violation-store stale precheck', () => {
  beforeEach(() => {
    runRuleBatch.mockReset()
    destroyScenarioViolationStore(SCENARIO_ID)
    getScenarioViolationStore(SCENARIO_ID).setState({
      violations: new Map(),
      legalityStatus: null,
      computedAt: null,
      errorText: null,
      paramsStale: false,
      persistedRaw: [],
      computingSince: null,
      checking: false,
    })
  })

  it('discards a late runPreCheck result after resetToPersisted', async () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({
      status: 'READY',
      violations: [{
        crew_id: '13372', pairing_id: null, duty_seq: null, rule_code: '8002', rule_instance: '001',
        severity: 2, actual_value: null, limit_value: null, unit: null, message: 'block',
        start_dt: '2026-09-01', end_dt: '2026-09-30',
      }],
    })

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    runRuleBatch.mockImplementation(async () => {
      await gate
      return {
        flat: [{
          ruleCode: '7505',
          ruleName: '7505/001',
          severity: 1,
          canOverride: true,
          message: 'The number of days off(11) must be at least 12 in 1 RP.',
          targetType: 'crew',
          targetId: '13372',
          crewId: '13372',
        }],
        hasBlocking: false,
      }
    })

    const pending = store.getState().runPreCheck(['13372'], [])
    store.getState().resetToPersisted()
    release()
    await pending

    const codes = [...store.getState().violations.values()].flat().map((v) => v.ruleCode)
    expect(codes).toEqual(['8002'])
    expect(codes).not.toContain('7505')
  })
})
