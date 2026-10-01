import { describe, expect, it } from 'vitest'
import { buildViewportSnapshot, formatViewportSummary, SNAPSHOT_LIST_CAP } from '../viewport-snapshot'
import type { PaneReadoutEntry, PaneWindow } from '../viewport-readout'
import type { RosterItem } from '@/types/roster'
import type { PairingItem } from '@/types/pairing'
import type { FlightItem } from '@/types/flight'

// Visible window: 01 Sep 00:00Z – 03 Sep 00:00Z
const WINDOW: PaneWindow = {
  startMs: Date.parse('2026-09-01T00:00:00Z'),
  endMs: Date.parse('2026-09-03T00:00:00Z'),
  timezone: 'UTC',
}

// Realistic ADD→ASO→ADD round trip (ET137/ET136): one pairing, two legs, one crew
// row per leg (roster_flight = crew × segment).
const rosterLeg = (id: number, crewId: string, pairingId: number | null, str: string, end: string): RosterItem =>
  ({ id, crewId, pairingId, schStrDtUtc: str, schEndDtUtc: end, actStrDtUtc: null, actEndDtUtc: null }) as unknown as RosterItem

const pairing = (
  id: number,
  label: string,
  str: string,
  end: string,
  composition: Array<{ rank: string; plan: number; fill: number }>,
  creditMin = 300,
): PairingItem =>
  ({
    pairing: { id, pairingLabel: label, base: 'ADD', fleet: '788', schStrDtUtc: str, schEndDtUtc: end, composition },
    flights: [],
    segments: [
      { id: id * 10 + 1, dutySeq: 1, dutyActCreditedMinutes: creditMin },
      { id: id * 10 + 2, dutySeq: 1, dutyActCreditedMinutes: creditMin },
    ],
    sessionTags: [],
  }) as unknown as PairingItem

const entry = (paneId: string, data: PaneReadoutEntry['data'], contextId: PaneReadoutEntry['contextId'] = 'live'): PaneReadoutEntry =>
  ({ paneId, contextId, window: WINDOW, data })

describe('buildViewportSnapshot — roster pane', () => {
  const rows = [
    { crewId: 'T2001', rank: 'CA', base: 'ADD', hasAlert: true },
    { crewId: 'T2002', rank: 'FO', base: 'ADD', hasAlert: false },
    { crewId: 'T2003', rank: 'FO', base: 'ADD', hasAlert: false },
  ]
  const items = [
    // T2001 flies both legs of pairing 151614 inside the window → ONE flying duty, not two
    rosterLeg(1, 'T2001', 151614, '2026-09-01T06:00:00Z', '2026-09-01T08:00:00Z'),
    rosterLeg(2, 'T2001', 151614, '2026-09-01T09:30:00Z', '2026-09-01T11:30:00Z'),
    // T2002 has a ground task straddling the window start → counts (overlap)
    rosterLeg(3, 'T2002', null, '2026-08-31T20:00:00Z', '2026-09-01T02:00:00Z'),
    // T2003 only has a duty AFTER the window → no duty in view
    rosterLeg(4, 'T2003', 151700, '2026-09-05T06:00:00Z', '2026-09-05T10:00:00Z'),
    // crew not shown in the pane (filtered out) must be ignored
    rosterLeg(5, 'T9999', 151614, '2026-09-01T06:00:00Z', '2026-09-01T08:00:00Z'),
  ]

  it('counts crew, duties per crew×pairing, ground tasks and alerts within the window', () => {
    const [p] = buildViewportSnapshot([entry('roster-main', { kind: 'roster', rows, items })]).panes
    expect(p).toMatchObject({
      kind: 'roster',
      context: 'Live',
      crewInPane: 3,
      crewWithDutyInView: 2,
      crewWithoutDutyInView: 1,
      flyingDutiesInView: 1,
      groundTasksInView: 1,
      crewWithAlerts: 1,
      byRank: { CA: 1, FO: 2 },
      alertCrewIds: ['T2001'],
      idleCrewIds: ['T2003'],
    })
  })
})

describe('buildViewportSnapshot — pairing pane', () => {
  const items = [
    pairing(1, 'P-OPEN', '2026-09-01T05:00:00Z', '2026-09-01T12:00:00Z', [
      { rank: 'CA', plan: 1, fill: 0 },
      { rank: 'FO', plan: 2, fill: 0 },
    ]),
    pairing(2, 'P-PART', '2026-09-02T05:00:00Z', '2026-09-02T12:00:00Z', [
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 2, fill: 1 },
    ]),
    pairing(3, 'P-FULL', '2026-09-02T05:00:00Z', '2026-09-02T12:00:00Z', [
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 2, fill: 2 },
    ]),
    // open but outside the window → not "on screen"
    pairing(4, 'P-LATER', '2026-09-10T05:00:00Z', '2026-09-10T12:00:00Z', [{ rank: 'CA', plan: 1, fill: 0 }]),
  ]

  it('open positions = pure open + partial, only for pairings in the window', () => {
    const [p] = buildViewportSnapshot([entry('pairing', { kind: 'pairing', items, coverageRanks: [] })]).panes
    expect(p).toMatchObject({
      kind: 'pairing',
      pairingsInPane: 4,
      pairingsInView: 3,
      coverage: { open: 1, partial: 1, full: 1, over: 0 },
      openPositionPairings: 2,
      openPositionCredit: '10:00',
      openPositionsByRank: { CA: 1, FO: 3 },
    })
    if (p.kind !== 'pairing') throw new Error('expected pairing pane')
    expect(p.openPairings.map((o) => `${o.label}:${o.coverage}:${o.openPositions}`)).toEqual([
      'P-OPEN:open:CA 1, FO 2',
      'P-PART:partial:FO 1',
    ])
  })

  it('coverage is rank-scoped when the pane filters by rank (matches the pane)', () => {
    const [p] = buildViewportSnapshot([entry('pairing', { kind: 'pairing', items, coverageRanks: ['CA'] })]).panes
    // CA-only: P-PART's CA slot is filled → full; only P-OPEN still needs a CA
    expect(p).toMatchObject({ openPositionPairings: 1, openPositionsByRank: { CA: 1 } })
  })

  it('caps the named open-pairing list', () => {
    const many = Array.from({ length: SNAPSHOT_LIST_CAP + 5 }, (_, i) =>
      pairing(100 + i, `P${i}`, '2026-09-01T05:00:00Z', '2026-09-01T12:00:00Z', [{ rank: 'CA', plan: 1, fill: 0 }]))
    const [p] = buildViewportSnapshot([entry('pairing', { kind: 'pairing', items: many, coverageRanks: [] })]).panes
    if (p.kind !== 'pairing') throw new Error('expected pairing pane')
    expect(p.openPositionPairings).toBe(SNAPSHOT_LIST_CAP + 5)
    expect(p.openPairings).toHaveLength(SNAPSHOT_LIST_CAP)
  })
})

describe('buildViewportSnapshot — flight pane + summary', () => {
  const rows = [
    {
      registration: 'ET-AUP',
      fleet: '788',
      sessionTags: [],
      flights: [
        { fltNum: 'ET137', schDepDtUtc: '2026-09-01T06:00:00Z', schArvDtUtc: '2026-09-01T08:00:00Z', isCancelled: false },
        { fltNum: 'ET136', schDepDtUtc: '2026-09-01T09:30:00Z', schArvDtUtc: '2026-09-01T11:30:00Z', isCancelled: true },
        { fltNum: 'ET139', schDepDtUtc: '2026-09-06T09:30:00Z', schArvDtUtc: '2026-09-06T11:30:00Z', isCancelled: false },
      ],
    },
  ] as unknown as FlightItem[]

  it('counts flights in the window and cancellations', () => {
    const [p] = buildViewportSnapshot([entry('flight', { kind: 'flight', rows }, 42)]).panes
    expect(p).toMatchObject({ kind: 'flight', context: 'Scenario 42', aircraftRows: 1, flightsInView: 2, cancelledInView: 1 })
  })

  it('summary names the window and the numbers; empty view says so', () => {
    const snap = buildViewportSnapshot([entry('flight', { kind: 'flight', rows })])
    const text = formatViewportSummary(snap)
    expect(text).toContain('Flights (Live, 01 Sep 00:00 – 03 Sep 00:00): 2 flights on 1 aircraft rows, 1 cancelled.')
    expect(formatViewportSummary(buildViewportSnapshot([]))).toContain('No Gantt pane is open')
  })
})
