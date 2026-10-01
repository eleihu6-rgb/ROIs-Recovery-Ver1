import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesRecoveryScope, openRecoveryForAlerts, type RecoveryShortcutScope } from '../rbot-recovery'

// Alert Center rows, Case-3 shape: 8004 on pairing 152227 for CA L3002 + FO L3006; a 1001 elsewhere.
const rows = [
  { crewId: 'L3002', ruleCode: '8004', pairingId: 152227, affectedCrewIds: ['L3002'] },
  { crewId: 'L3006', ruleCode: '8004', pairingId: 152227, affectedCrewIds: ['L3006'] },
  { crewId: 'T2004', ruleCode: '1001', pairingId: 151614, affectedCrewIds: ['T2004', 'T2005'] },
]

describe('matchesRecoveryScope', () => {
  const pick = (scope: Parameters<typeof matchesRecoveryScope>[1]) => rows.filter((r) => matchesRecoveryScope(r, scope)).map((r) => r.crewId)

  it('no scope = every recoverable row (the existing Ctrl+R shortcut)', () => {
    expect(pick(null)).toEqual(['L3002', 'L3006', 'T2004'])
  })
  it('crew + rule narrows to that alert', () => {
    expect(pick({ crewId: 'L3002', ruleCode: '8004' })).toEqual(['L3002'])
  })
  it('crew matches an affected crew too (1001 overlap names both crew)', () => {
    expect(pick({ crewId: 'T2005' })).toEqual(['T2004'])
  })
  it('pairing narrows to all crew on that pairing', () => {
    expect(pick({ pairingId: 152227 })).toEqual(['L3002', 'L3006'])
  })
})

describe('openRecoveryForAlerts', () => {
  const handlers: Array<(e: Event) => void> = []
  afterEach(() => { for (const h of handlers.splice(0)) window.removeEventListener('recovery:shortcut', h) })
  const listen = (fn: (scope: RecoveryShortcutScope) => void): void => {
    const h = (e: Event): void => fn((e as CustomEvent<RecoveryShortcutScope>).detail)
    handlers.push(h)
    window.addEventListener('recovery:shortcut', h)
  }

  it('reports the count the Live roster pane found (positive path)', () => {
    const seen = vi.fn()
    listen((scope) => { seen(scope.crewId, scope.ruleCode); scope.matched = rows.filter((r) => matchesRecoveryScope(r, scope)).length })
    expect(openRecoveryForAlerts({ crewId: 'L3002', ruleCode: '8004' }))
      .toBe('Opened Recovery for 1 alert (crew L3002, rule 8004) — pick an option and Apply')
    expect(seen).toHaveBeenCalledWith('L3002', '8004')
  })
  it('no Live roster listening → says so instead of pretending', () => {
    expect(openRecoveryForAlerts({})).toBe('Recovery needs the Live Gantt roster open.')
  })
  it('nothing recoverable → explains which rules Recovery handles', () => {
    listen((scope) => { scope.matched = 0 })
    expect(openRecoveryForAlerts({ ruleCode: '1001' })).toContain('No recoverable alert for rule 1001')
  })
})
