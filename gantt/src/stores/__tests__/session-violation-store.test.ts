import { describe, expect, it, beforeEach } from 'vitest'
import { useSessionViolationStore } from '../session-violation-store'
import type { ViolationItem } from '@/services/rule-session-api'

const violation = (message: string): ViolationItem => ({
  ruleCode: '8002',
  ruleInstance: '001',
  ruleName: '8002',
  passed: false,
  severity: 3,
  actualValue: 6584,
  limitValue: 5400,
  unit: 'MINUTE',
  message,
})

describe('session-violation-store persisted owner attribution', () => {
  beforeEach(() => {
    useSessionViolationStore.setState({
      persistedViolations: new Map(),
      sessionViolations: new Map(),
      displayViolations: new Map(),
    })
  })

  it('keeps persisted violations distinct by crew and pairing owner', () => {
    const store = useSessionViolationStore.getState()

    store.setPersistedViolations('197', 10381, [violation('crew 197 message')])
    store.setPersistedViolations('2380', 10381, [violation('crew 2380 message')])

    const display = useSessionViolationStore.getState().displayViolations.get(10381) ?? []

    expect(display).toHaveLength(2)
    expect(display.map((v) => ({ crewId: v.crewId, message: v.message }))).toEqual([
      { crewId: '197', message: 'crew 197 message' },
      { crewId: '2380', message: 'crew 2380 message' },
    ])
  })

  it('keeps session violations scoped by crew and pairing without replacing other crew', () => {
    const store = useSessionViolationStore.getState()

    store.setPersistedViolations('197', 10381, [violation('crew 197 persisted')])
    store.setPersistedViolations('2380', 10381, [violation('crew 2380 persisted')])
    ;(store.setSessionViolations as unknown as (crewId: string, pairingId: number, violations: ViolationItem[]) => void)(
      '2380',
      10381,
      [violation('crew 2380 session')],
    )

    const display = useSessionViolationStore.getState().displayViolations.get(10381) ?? []

    expect(display.map((v) => ({ source: v.source, crewId: v.crewId, message: v.message }))).toEqual([
      { source: 'persisted', crewId: '197', message: 'crew 197 persisted' },
      { source: 'session', crewId: '2380', message: 'crew 2380 session' },
    ])
  })

  it('replacePersistedViolations drops out-of-window pairing keys from a prior fetch', () => {
    const store = useSessionViolationStore.getState()

    store.setPersistedViolations('1318', 10932, [violation('June 7504')])
    store.setPersistedViolations('1318', 11049, [violation('June 7501')])
    store.replacePersistedViolations([
      { crewId: '1318', pairingId: 20001, violations: [violation('Aug in-window')] },
    ])

    const display = useSessionViolationStore.getState().displayViolations
    expect(display.get(10932)).toBeUndefined()
    expect(display.get(11049)).toBeUndefined()
    expect(display.get(20001)?.map((v) => v.message)).toEqual(['Aug in-window'])
  })

  it('clearSessionViolationsByRuleCodes drops only Min-GDO preview rows', () => {
    const store = useSessionViolationStore.getState()
    const gdo: ViolationItem = {
      ...violation('days off(11) must be at least 12'),
      ruleCode: '7505',
      ruleInstance: '001',
      ruleName: '7505/001',
      severity: 1,
    }
    store.setSessionViolations('13372', 99901, [gdo, violation('block soft')])
    store.setSessionViolations('13372', 99902, [{ ...gdo, ruleCode: '7507', ruleName: '7507/001' }])

    store.clearSessionViolationsByRuleCodes(['7505', '7507'])

    const session = useSessionViolationStore.getState().sessionViolations
    expect(session.get('13372:99901')?.map((v) => v.ruleCode)).toEqual(['8002'])
    expect(session.get('13372:99902')).toBeUndefined()
  })
})
