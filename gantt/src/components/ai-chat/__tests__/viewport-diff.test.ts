import { describe, expect, it } from 'vitest'
import { buildViewportState, diffViewportStates, formatViewportDiff } from '../viewport-diff'
import { buildViewportSnapshot } from '../viewport-snapshot'
import type { PaneReadoutEntry, PaneWindow } from '../viewport-readout'
import type { RosterItem } from '@/types/roster'
import type { PairingItem } from '@/types/pairing'
import type { FlightItem } from '@/types/flight'

const WINDOW: PaneWindow = {
  startMs: Date.parse('2026-09-01T00:00:00Z'),
  endMs: Date.parse('2026-09-03T00:00:00Z'),
  timezone: 'UTC',
}
const MOVED: PaneWindow = { ...WINDOW, startMs: WINDOW.startMs + 86_400_000, endMs: WINDOW.endMs + 86_400_000 }

// ADD→ASO→ADD round trip (ET137/ET136) needing 1 CA + 1 FO.
const pairing = (id: number, label: string, fill: { CA: number; FO: number }, base = 'ADD', fleet = '788'): PairingItem =>
  ({
    pairing: {
      id, pairingLabel: label, base, fleet,
      schStrDtUtc: '2026-09-01T05:00:00Z', schEndDtUtc: '2026-09-01T13:00:00Z',
      composition: [{ rank: 'CA', plan: 1, fill: fill.CA }, { rank: 'FO', plan: 1, fill: fill.FO }],
    },
    flights: [], segments: [], sessionTags: [],
  }) as unknown as PairingItem

const leg = (id: number, crewId: string, pairingId: number, str: string, end: string): RosterItem =>
  ({ id, crewId, pairingId, schStrDtUtc: str, schEndDtUtc: end, actStrDtUtc: null, actEndDtUtc: null }) as unknown as RosterItem

const flights = (cancelled: boolean, depIso: string): FlightItem[] =>
  [{
    registration: 'ET-AUP', fleet: '788', sessionTags: [],
    flights: [
      { id: 9001, fltNum: 'ET137', schDepDtUtc: '2026-09-01T06:00:00Z', schArvDtUtc: '2026-09-01T08:00:00Z', actDepDtUtc: depIso, estDepDtUtc: '', isCancelled: false },
      { id: 9002, fltNum: 'ET136', schDepDtUtc: '2026-09-01T09:30:00Z', schArvDtUtc: '2026-09-01T11:30:00Z', actDepDtUtc: '', estDepDtUtc: '', isCancelled: cancelled },
    ],
  }] as unknown as FlightItem[]

const read = (opts: {
  window?: PaneWindow
  pairings: PairingItem[]
  items: RosterItem[]
  alerts?: string[]
  flightRows: FlightItem[]
}): PaneReadoutEntry[] => {
  const w = opts.window ?? WINDOW
  const rows = ['T2001', 'T2002'].map((crewId) => ({ crewId, rank: 'CA', base: 'ADD', hasAlert: (opts.alerts ?? []).includes(crewId) }))
  return [
    { paneId: 'roster-main', contextId: 'live', window: w, data: { kind: 'roster', rows, items: opts.items } },
    { paneId: 'pairing', contextId: 'live', window: w, data: { kind: 'pairing', items: opts.pairings, coverageRanks: [] } },
    { paneId: 'flight', contextId: 'live', window: w, data: { kind: 'flight', rows: opts.flightRows } },
  ]
}

const T0 = new Date('2026-09-30T06:00:00Z')
const T1 = new Date('2026-09-30T06:10:00Z')

describe('diffViewportStates', () => {
  // Before: P1 open, P2 full; T2001 flies P2 (both legs); ET136 operating on time.
  const before = read({
    pairings: [pairing(1, 'P1', { CA: 0, FO: 0 }), pairing(2, 'P2', { CA: 1, FO: 1 })],
    items: [
      leg(11, 'T2001', 2, '2026-09-01T06:00:00Z', '2026-09-01T08:00:00Z'),
      leg(12, 'T2001', 2, '2026-09-01T09:30:00Z', '2026-09-01T11:30:00Z'),
    ],
    flightRows: flights(false, '2026-09-01T06:00:00Z'),
  })

  it('reports coverage, duty, alert and flight changes by object id', () => {
    // After: T2001 moved off P2 onto P1 (as CA) → P2 partial, P1 partial; T2002 now has an
    // alert; ET136 cancelled; ET137 departed 45 min late.
    const after = read({
      pairings: [pairing(1, 'P1', { CA: 1, FO: 0 }), pairing(2, 'P2', { CA: 0, FO: 1 })],
      items: [
        leg(21, 'T2001', 1, '2026-09-01T06:00:00Z', '2026-09-01T08:00:00Z'),
        leg(22, 'T2001', 1, '2026-09-01T09:30:00Z', '2026-09-01T11:30:00Z'),
      ],
      alerts: ['T2002'],
      flightRows: flights(true, '2026-09-01T06:45:00Z'),
    })
    const lines = diffViewportStates(buildViewportState(before, T0), buildViewportState(after, T1))
    // lines follow pane order (roster, pairing, flight)
    expect(lines).toEqual([
      // one duty (P2 → P1) counted once per crew × pairing, not per leg
      '1 crew gained duties: T2001 +1',
      '1 crew lost duties: T2001 −1',
      '1 crew have new alerts: T2002',
      '1 pairing(s) now have open positions: P2',
      '1 pairing(s) changed coverage: P1 open→partial',
      '1 flight(s) cancelled: ET136',
      '1 flight(s) retimed: ET137 +45m',
    ])
    expect(formatViewportDiff(buildViewportState(before, T0), lines)).toMatch(/^Since your last read \(06:00 UTC\):\n• 1 crew gained duties: T2001 \+1/)
  })

  it('no changes → says so', () => {
    const lines = diffViewportStates(buildViewportState(before, T0), buildViewportState(before, T1))
    expect(lines).toEqual([])
    expect(formatViewportDiff(buildViewportState(before, T0), lines)).toBe('Since your last read (06:00 UTC): no changes on screen.')
  })

  it('first read has nothing to compare with', () => {
    expect(formatViewportDiff(null, [])).toBeNull()
  })

  it('moved view: scrolled-in/out duties are not reported as changes; real coverage changes still are', () => {
    const afterMoved = read({
      window: MOVED,
      pairings: [pairing(1, 'P1', { CA: 1, FO: 1 }), pairing(2, 'P2', { CA: 1, FO: 1 })],
      items: [],
      flightRows: flights(false, '2026-09-01T06:00:00Z'),
    })
    // P1/P2 still overlap MOVED? They are on 1 Sep — MOVED starts 2 Sep, so they left the view.
    const lines = diffViewportStates(buildViewportState(before, T0), buildViewportState(afterMoved, T1))
    expect(lines).toEqual(['Your view moved since the last read — comparing only objects visible in both reads.'])
    expect(formatViewportDiff(buildViewportState(before, T0), lines)).toContain('no changes on screen.')
  })
})

describe('viewDefaults ("this view" scope)', () => {
  it('pins base/fleet only when the screen shows exactly one; dates are the visible window; crew when few', () => {
    const snap = buildViewportSnapshot(read({
      pairings: [pairing(1, 'P1', { CA: 0, FO: 0 })],
      items: [],
      flightRows: [],
    }))
    expect(snap.viewDefaults).toEqual({
      start: '2026-09-01', end: '2026-09-02', base: 'ADD', fleets: ['788'], crewIds: ['T2001', 'T2002'],
    })
  })

  it('two bases on screen → no base guessed', () => {
    const snap = buildViewportSnapshot(read({
      pairings: [pairing(1, 'P1', { CA: 0, FO: 0 }), pairing(2, 'P2', { CA: 0, FO: 0 }, 'DXB', '388')],
      items: [],
      flightRows: [],
    }))
    expect(snap.viewDefaults?.base).toBeUndefined()
    expect(snap.viewDefaults?.fleets).toBeUndefined()
  })

  it('Scenario-only view has no Live scope', () => {
    const entries = read({ pairings: [], items: [], flightRows: [] }).map((e) => ({ ...e, contextId: 7 }))
    expect(buildViewportSnapshot(entries).viewDefaults).toBeUndefined()
  })
})
