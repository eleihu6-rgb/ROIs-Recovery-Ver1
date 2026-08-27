import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'

const SCENARIO_ID = 999001

const initialState = {
  violations: new Map(), legalityStatus: null, computedAt: null, errorText: null,
  paramsStale: false, persistedRaw: [], computingSince: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  getScenarioViolationStore(SCENARIO_ID).setState(initialState)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scenario-violation-store computingSince', () => {
  it('stamps computingSince the first time status transitions into COMPUTING', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)

    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    expect(store.getState().computingSince).toBe(new Date('2026-07-07T00:00:00Z').getTime())
  })

  it('keeps the original computingSince across repeated COMPUTING polls', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })
    const first = store.getState().computingSince

    vi.setSystemTime(new Date('2026-07-07T00:05:00Z'))
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    expect(store.getState().computingSince).toBe(first)
  })

  it('clears computingSince once status settles to READY', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    store.getState().applyPersisted({ status: 'READY', violations: [] })

    expect(store.getState().computingSince).toBeNull()
  })

  it('clears computingSince once status settles to FAILED', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    store.getState().applyPersisted({ status: 'FAILED', violations: [], errorText: 'boom' })

    expect(store.getState().computingSince).toBeNull()
  })

  it('markRecheckTriggered force-resets computingSince to now even if already COMPUTING', () => {
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'))
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    vi.setSystemTime(new Date('2026-07-07T00:10:00Z')) // scenario has been "stuck" for 10 min
    store.getState().markRecheckTriggered()

    expect(store.getState().computingSince).toBe(new Date('2026-07-07T00:10:00Z').getTime())
    expect(store.getState().legalityStatus).toBe('COMPUTING')
  })

  it('markRecheckFailed clears computing state and records the error', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().markRecheckTriggered()

    store.getState().markRecheckFailed('Legality recheck polling failed')

    expect(store.getState().legalityStatus).toBe('FAILED')
    expect(store.getState().computingSince).toBeNull()
    expect(store.getState().errorText).toBe('Legality recheck polling failed')
  })
})

describe('scenario-violation-store applyPersisted stale clear', () => {
  const stale7505 = {
    crew_id: '13372',
    pairing_id: null,
    duty_seq: null,
    rule_code: '7505',
    rule_instance: '001',
    severity: 2,
    actual_value: 2,
    limit_value: 4,
    unit: 'day',
    message: 'The number of days off(2) must be at least 4 in 1 RP.',
    start_dt: '2026-09-01T00:00:00Z',
    end_dt: '2026-09-30T00:00:00Z',
  }

  it('clears persisted 7505 when status leaves READY for COMPUTING', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'READY', violations: [stale7505] })
    expect(store.getState().persistedRaw).toHaveLength(1)
    expect(store.getState().violations.get('crew:13372')?.[0]?.ruleCode).toBe('7505')

    store.getState().applyPersisted({ status: 'COMPUTING', violations: [] })

    expect(store.getState().legalityStatus).toBe('COMPUTING')
    expect(store.getState().persistedRaw).toEqual([])
    expect(store.getState().violations.size).toBe(0)
  })

  it('clears persisted 7505 when status settles to FAILED', () => {
    const store = getScenarioViolationStore(SCENARIO_ID)
    store.getState().applyPersisted({ status: 'READY', violations: [stale7505] })

    store.getState().applyPersisted({
      status: 'FAILED',
      violations: [],
      errorText: 'compute process exited with code 1',
    })

    expect(store.getState().persistedRaw).toEqual([])
    expect(store.getState().violations.size).toBe(0)
  })
})
