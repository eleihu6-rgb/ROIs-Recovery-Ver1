import { describe, expect, it } from 'vitest'
import {
  chooseRotations,
  rankLinkCandidates,
  roundtripScopeSchema,
  scopeBounds,
  validateRotation,
  type RoundtripFlight,
  type RoundtripScope,
} from '../../../services/pairing/roundtrip-chooser.js'

const scope: RoundtripScope = {
  startDate: '2026-09-20',
  endDate: '2026-09-23',
  ganttStart: '2026-09-01',
  ganttEnd: '2026-09-30',
  timezone: 'UTC',
  base: 'ADD',
  fleets: ['738'],
  composition: [{ rank: 'CA', plan: 1 }, { rank: 'FO', plan: 1 }],
  rules: { checkinMin: 120, debriefMin: 15, restMin: 720, maxDutyBlockMin: 480, singleLegExemption: true },
}

const leg = (id: number, depArp: string, arvArp: string, start: number, duration: number): RoundtripFlight => ({
  id,
  airline: 'ET',
  fleet: '738',
  fltNum: `ET${id}`,
  depArp,
  arvArp,
  schDepDtUtc: new Date(Date.UTC(2026, 8, 20, 4, start)).toISOString(),
  schArvDtUtc: new Date(Date.UTC(2026, 8, 20, 4, start + duration)).toISOString(),
  blockMin: duration,
})

describe('roundtrip chooser', () => {
  it.each([['ALL'], ['738', '7M8']])('keeps packed base turns separate for fleet scope %j', (...fleets: string[]) => {
    const flights = [leg(1, 'ADD', 'DIR', 0, 60), leg(2, 'DIR', 'ADD', 105, 60),
      { ...leg(3, 'ADD', 'JIB', 210, 60), fleet: '7M8' }, { ...leg(4, 'JIB', 'ADD', 315, 60), fleet: '7M8' }]
    expect(chooseRotations(flights, { ...scope, fleets }).map(rotation => rotation.flightIds)).toEqual([[1, 2], [3, 4]])
    expect(() => validateRotation(flights, { ...scope, fleets })).toThrow('fleet')
  })

  it('skips a different-fleet return and waits for the same fleet next day', () => {
    const flights = [leg(1, 'ADD', 'DIR', 0, 60),
      { ...leg(2, 'DIR', 'ADD', 105, 60), fleet: '7M8' }, leg(3, 'DIR', 'ADD', 1440, 60)]
    expect(chooseRotations(flights, { ...scope, fleets: ['ALL'] }).map(rotation => rotation.flightIds)).toEqual([[1, 3]])
    expect(chooseRotations(flights.slice(0, 2), { ...scope, fleets: ['ALL'] })).toEqual([])
  })

  it('rejects unknown fleets in all-fleet scope', () => {
    expect(() => validateRotation([leg(1, 'ADD', 'DIR', 0, 60),
      { ...leg(2, 'DIR', 'ADD', 105, 60), fleet: '' }], { ...scope, fleets: ['ALL'] })).toThrow('fleet')
  })

  it('accepts all-fleet scope and rejects empty fleet lists', () => {
    expect(roundtripScopeSchema.safeParse({ ...scope, fleets: ['ALL'] }).success).toBe(true)
    expect(roundtripScopeSchema.safeParse({ ...scope, fleets: [] }).success).toBe(false)
  })

  it('shows three closest link candidates and prefers the layover option', () => {
    const outbound = leg(1, 'ADD', 'LHR', 0, 420)
    const sameDay = leg(2, 'LHR', 'ADD', 600, 420)
    const nextDay = leg(3, 'LHR', 'ADD', 1740, 420)
    const twoDays = leg(4, 'LHR', 'ADD', 3180, 420)
    const far = leg(5, 'LHR', 'ADD', 9000, 420)
    const flights = [outbound, sameDay, nextDay, twoDays, far]

    const links = rankLinkCandidates(outbound, flights, chooseRotations(flights, scope), scope)

    expect(links.map((link) => link.flightId)).toEqual([2, 3, 4])
    expect(links.map((link) => link.preferred)).toEqual([false, true, false])
  })

  it('looks backward for inbound flights returning to base', () => {
    const dayBefore = leg(10, 'ADD', 'BKO', -1440, 240)
    const inbound = leg(11, 'BKO', 'ADD', 0, 240)
    const twoDaysBefore = leg(12, 'ADD', 'BKO', -2880, 240)
    const unrelatedForward = leg(13, 'ADD', 'ENU', 300, 240)
    const flights = [dayBefore, inbound, twoDaysBefore, unrelatedForward]

    const links = rankLinkCandidates(inbound, flights, chooseRotations(flights, scope), scope)

    expect(links.map((link) => link.flightId)).toEqual([10, 12])
    expect(links[0]?.preferred).toBe(true)
  })

  it('requires a positive count for every submitted rank', () => {
    expect(roundtripScopeSchema.safeParse({ ...scope, composition: [{ rank: 'CA', plan: 0 }, { rank: 'FO', plan: 1 }] }).success).toBe(false)
  })

  it('packs two short base turns into one four-leg duty', () => {
    const flights = [leg(1, 'ADD', 'DIR', 0, 60), leg(2, 'DIR', 'ADD', 105, 60), leg(3, 'ADD', 'JIB', 210, 60), leg(4, 'JIB', 'ADD', 315, 60)]
    expect(chooseRotations(flights, scope)).toMatchObject([{ flightIds: [1, 2, 3, 4], dutyFlightIds: [[1, 2, 3, 4]], blockMin: 240 }])
  })

  it('uses real next-day rest when the same-day return exceeds block', () => {
    const flights = [leg(1, 'ADD', 'JFK', 0, 420), leg(2, 'JFK', 'ADD', 480, 420), leg(3, 'JFK', 'ADD', 1620, 420)]
    expect(chooseRotations(flights, scope)).toMatchObject([{ flightIds: [1, 3], dutyFlightIds: [[1], [3]], layoverMinutes: [1065] }])
  })

  it('rejects 12h ground time that does not leave 12h free rest', () => {
    expect(() => validateRotation([leg(1, 'ADD', 'JFK', 0, 420), leg(2, 'JFK', 'ADD', 1140, 420)], scope)).toThrow()
  })

  it('rejects broken stations, duplicate IDs, fleet changes and dates outside the scope', () => {
    const a = leg(1, 'ADD', 'DIR', 0, 60)
    const b = leg(2, 'DIR', 'ADD', 120, 60)
    for (const flights of [[a, { ...b, depArp: 'JIB' }], [a, { ...b, id: 1 }], [a, { ...b, fleet: '789' }], [a, { ...b, schArvDtUtc: '2026-09-24T01:00:00Z' }]]) {
      expect(() => validateRotation(flights, scope)).toThrow()
    }
  })

  it('converts full calendar days across DST', () => {
    const bounds = scopeBounds({ ...scope, startDate: '2026-11-01', endDate: '2026-11-01', ganttStart: '2026-11-01', ganttEnd: '2026-11-30', timezone: 'America/Vancouver' })
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(25 * 3600000)
  })

  it('accepts the block cap exactly and rejects one minute above it', () => {
    expect(validateRotation([leg(1, 'ADD', 'DIR', 0, 240), leg(2, 'DIR', 'ADD', 300, 240)], scope).blockMin).toBe(480)
    expect(() => validateRotation([leg(1, 'ADD', 'DIR', 0, 240), leg(2, 'DIR', 'ADD', 300, 241)], scope)).toThrow('block')
  })

  it('honors the single-leg exemption and prior duty period for long-haul rest', () => {
    const long = leg(1, 'ADD', 'JFK', 0, 900)
    expect(() => validateRotation([long, leg(2, 'JFK', 'ADD', 1860, 900)], scope)).toThrow('rest')
    expect(validateRotation([long, leg(2, 'JFK', 'ADD', 2100, 900)], scope).dutyFlightIds).toEqual([[1], [2]])
    expect(() => validateRotation([long, leg(2, 'JFK', 'ADD', 2100, 900)], { ...scope, rules: { ...scope.rules, singleLegExemption: false } })).toThrow('block')
  })

  it('requires first check-in and final debrief within scope, and leaves stranded flights uncovered', () => {
    expect(() => validateRotation([leg(1, 'ADD', 'DIR', -200, 60), leg(2, 'DIR', 'ADD', 0, 60)], scope)).toThrow('Check-in')
    expect(chooseRotations([leg(1, 'ADD', 'DIR', 0, 60)], scope)).toEqual([])
    expect(() => scopeBounds({ ...scope, startDate: '2026-08-31' })).toThrow('Gantt')
    expect(() => scopeBounds({ ...scope, timezone: 'Invalid/Zone' })).toThrow('timezone')
  })
})
