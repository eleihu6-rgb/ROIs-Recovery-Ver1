import { describe, expect, it } from 'vitest'
import { FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES, planFlightDelay, type RecoveryFlightDelayInputSegment } from '@/services/recovery-candidates'

/**
 * Flight Delay (Rule 1001 recovery) — the real scenario used on the live DB:
 * Crew 113 / Pairing 136149 (V4127) on 2026-09-16 carries the ADM/MTG ground
 * task 14:00Z-15:00Z, which overlaps flight 1888 (14:50Z-17:45Z) and flight 1889
 * (18:30Z-21:30Z).
 */
const segment = (
  flightId: number,
  fltNum: string,
  depArp: string,
  arvArp: string,
  segSeq: number,
  std: string,
  sta: string,
  atd: string = std,
  ata: string = sta,
): RecoveryFlightDelayInputSegment => ({
  flightId,
  fltNum,
  depArp,
  arvArp,
  dutySeq: 1,
  segSeq,
  stdUtc: std,
  staUtc: sta,
  atdUtc: atd,
  ataUtc: ata,
})

const crew113Pairing = (): RecoveryFlightDelayInputSegment[] => [
  segment(78053, '1888', 'YVR', 'LAX', 1, '2026-09-16T14:50:00.000Z', '2026-09-16T17:45:00.000Z'),
  segment(78059, '1889', 'LAX', 'YVR', 2, '2026-09-16T18:30:00.000Z', '2026-09-16T21:30:00.000Z'),
]

describe('planFlightDelay', () => {
  it('starts the delay 61 minutes after the overlapping ground task ends', () => {
    const plan = planFlightDelay({
      segments: crew113Pairing(),
      groundTaskEndUtc: '2026-09-16T15:00:00.000Z',
    })

    expect(FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES).toBe(61)
    expect(plan?.delayStartUtc).toBe('2026-09-16T16:01:00.000Z')
    expect(plan?.changesAnything).toBe(true)
    // First leg: ATD → 16:01, ATA keeps the 2h55m block.
    expect(plan?.segments[0]).toMatchObject({
      flightId: 78053,
      atdUtc: '2026-09-16T14:50:00.000Z',
      delayedAtdUtc: '2026-09-16T16:01:00.000Z',
      delayedAtaUtc: '2026-09-16T18:56:00.000Z',
    })
  })

  it('preserves the original turnaround between segments instead of stacking them on one new ATD', () => {
    const plan = planFlightDelay({
      segments: crew113Pairing(),
      groundTaskEndUtc: '2026-09-16T15:00:00.000Z',
    })

    // Original gap 18:30 - 17:45 = 45 min, so the second leg leaves 19:41
    // (18:56 + 45) rather than collapsing onto the first leg's new ATD.
    expect(plan?.segments[1]).toMatchObject({
      flightId: 78059,
      delayedAtdUtc: '2026-09-16T19:41:00.000Z',
      delayedAtaUtc: '2026-09-16T22:41:00.000Z',
    })
  })

  it('never advances a segment that already departs after the delay start', () => {
    const plan = planFlightDelay({
      segments: crew113Pairing(),
      // Ground task ends the night before → 00:00 delay start, before both legs.
      groundTaskEndUtc: '2026-09-15T22:00:00.000Z',
    })

    expect(plan?.delayStartUtc).toBe('2026-09-15T23:01:00.000Z')
    expect(plan?.changesAnything).toBe(false)
    expect(plan?.segments.map((entry) => entry.delayedAtdUtc)).toEqual([
      '2026-09-16T14:50:00.000Z',
      '2026-09-16T18:30:00.000Z',
    ])
  })

  it('shifts the whole Pairing by the delay so a long layover keeps its duration', () => {
    const plan = planFlightDelay({
      segments: [
        segment(1, '100', 'YVR', 'LAX', 1, '2026-09-16T06:00:00.000Z', '2026-09-16T08:00:00.000Z'),
        segment(2, '101', 'LAX', 'YVR', 2, '2026-09-16T23:00:00.000Z', '2026-09-17T01:00:00.000Z'),
      ],
      groundTaskEndUtc: '2026-09-16T07:30:00.000Z',
    })

    // Leg 1 moves 2h31m later (06:00 → 08:31) and the 15h layover is preserved,
    // so leg 2 moves by exactly the same amount (23:00 → 01:31 next day).
    expect(plan?.segments[0].delayedAtdUtc).toBe('2026-09-16T08:31:00.000Z')
    expect(plan?.segments[1].delayedAtdUtc).toBe('2026-09-17T01:31:00.000Z')
  })

  it('returns null when the ground task end or the segment times are unusable', () => {
    expect(planFlightDelay({ segments: crew113Pairing(), groundTaskEndUtc: null })).toBeNull()
    expect(planFlightDelay({ segments: [], groundTaskEndUtc: '2026-09-16T15:00:00.000Z' })).toBeNull()
    expect(planFlightDelay({
      segments: [segment(1, '100', 'YVR', 'LAX', 1, '2026-09-16T06:00:00.000Z', '2026-09-16T08:00:00.000Z', '2026-09-16T08:00:00.000Z', '2026-09-16T07:00:00.000Z')],
      groundTaskEndUtc: '2026-09-16T05:00:00.000Z',
    })).toBeNull()
  })
})
