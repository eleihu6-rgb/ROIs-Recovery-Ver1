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

  it('synthesizes a published-delay (3007) Alert Center row for every crew on a future delayed Pairing', () => {
    const delayed = (id: number, crewId: string, pairingId: number): RosterItem => ({
      ...rosterItem(id, crewId, pairingId),
      label: 'ET2681 ADD-DXB',
      fltDt: '2099-09-29',
      schStrDtUtc: '2099-09-29T04:00:00.000Z',
      schEndDtUtc: '2099-09-29T12:00:00.000Z',
      actStrDtUtc: '2099-09-29T06:00:00.000Z',
      actEndDtUtc: '2099-09-29T14:00:00.000Z',
    } as unknown as RosterItem)
    const items = [
      delayed(1, 'T2001', 152675),
      delayed(2, 'T2021', 152675),
      delayed(3, 'T2022', 152675),
    ]

    const rows = buildLiveAlertRowsForTest(new Map(), items, [
      { crew: { crewId: 'T2001', panelBase: 'ADD', panelRank: 'CA' } },
      { crew: { crewId: 'T2021', panelBase: 'ADD', panelRank: 'FO' } },
      { crew: { crewId: 'T2022', panelBase: 'ADD', panelRank: 'FO' } },
    ] as never)

    expect(rows.map((r) => `${r.ruleCode}:${r.crewId}:${r.pairingId}:${r.canRecover}`)).toEqual([
      '3007:T2001:152675:true',
      '3007:T2021:152675:true',
      '3007:T2022:152675:true',
    ])
    expect(rows[0].affectedCrewIds).toEqual(['T2001', 'T2021', 'T2022'])
  })

  it('does not synthesize a published-delay row for a completed Pairing (Recovery is future-only)', () => {
    const completed = {
      ...rosterItem(1, 'T2001', 152675),
      label: 'ET168 ADD-GDQ',
      schStrDtUtc: '2000-09-01T12:20:00.000Z',
      schEndDtUtc: '2000-09-01T18:00:00.000Z',
      actStrDtUtc: '2000-09-01T16:20:00.000Z',
      actEndDtUtc: '2000-09-01T22:00:00.000Z',
    } as unknown as RosterItem

    const rows = buildLiveAlertRowsForTest(
      new Map(),
      [completed],
      [{ crew: { crewId: 'T2001', panelBase: 'ADD', panelRank: 'CA' } }] as never,
    )

    expect(rows).toEqual([])
  })
})
