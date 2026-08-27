import { describe, expect, it } from 'vitest'
import { buildLiveAlertRowsForTest, buildLiveViolationMapForTest } from '../live-gantt-source'
import type { DisplayViolation } from '@/stores/session-violation-store'
import type { RosterItem } from '@/types'

const rosterItem = (id: number, crewId: string, pairingId: number): RosterItem => ({
  id,
  crewId,
  pairingId,
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  schStrDtUtc: '2026-06-01T19:11:00.000Z',
  schEndDtUtc: '2026-06-02T04:02:00.000Z',
  fltId: null,
  dutySeq: 1,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'CA',
  base: 'YYC',
  dutyActCreditedMinutes: 0,
  ybh: 0,
  mbh: 0,
  yal: 0,
  mal: 0,
  ydo: 0,
} as unknown as RosterItem)

const persisted = (crewId: string, message: string): DisplayViolation => ({
  crewId,
  pairingId: 10381,
  source: 'persisted',
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

describe('Live violation crew attribution', () => {
  it('does not spread a persisted pairing-attached violation to another crew on the same pairing', () => {
    const items = [
      rosterItem(1, '197', 10381),
      rosterItem(2, '2380', 10381),
    ]
    const itemsByPairingId = new Map([[10381, items]])
    const itemsByCrew = new Map([
      ['197', [items[0]]],
      ['2380', [items[1]]],
    ])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [10381, [persisted('2380', 'crew 2380 message')]],
    ])

    const map = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)

    expect(map.get(1) ?? 0).toBe(0)
    expect(map.get(2)).toBe(3)
  })

  it('builds Alert Center rows for the owner crew only', () => {
    const items = [
      rosterItem(1, '197', 10381),
      rosterItem(2, '2380', 10381),
    ]
    const displayViolations = new Map<number, DisplayViolation[]>([
      [10381, [persisted('2380', 'crew 2380 message')]],
    ])

    const rows = buildLiveAlertRowsForTest(displayViolations, items, [
      { crew: { crewId: '197', panelBase: 'YYC', panelRank: 'CA' } },
      { crew: { crewId: '2380', panelBase: 'YYC', panelRank: 'FO' } },
    ] as never)

    expect(rows).toEqual([
      expect.objectContaining({
        crewId: '2380',
        base: 'YYC',
        rank: 'FO',
        ruleCode: '8002',
        message: 'crew 2380 message',
      }),
    ])
  })
})
