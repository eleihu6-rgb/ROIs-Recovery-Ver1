import { describe, expect, it } from 'vitest'
import {
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
  isFlyPairing,
  crewFlyTasksOverlappingWindow,
  crewTasksOverlappingWindow,
} from '../violation-puck-window'
import type { RosterItem } from '@/types'

const task = (
  id: number,
  pairingId: number,
  start: string,
  end: string,
  assignmentGroup = 'FLY',
): RosterItem =>
  ({
    id,
    crewId: id === 1 && pairingId === 16693 ? '923' : '2438',
    pairingId,
    assignmentGroup,
    schStrDtUtc: start,
    schEndDtUtc: end,
  }) as RosterItem

describe('violation-puck-window', () => {
  it('resolves window_* over start/end', () => {
    expect(resolveViolationPaintWindow({
      startDt: '2026-08-01T00:00:00.000Z',
      endDt: '2026-08-02T00:00:00.000Z',
      windowStartDt: '2026-09-19T06:31:00.000Z',
      windowEndDt: '2026-09-26T06:31:00.000Z',
    })).toEqual({
      startMs: Date.parse('2026-09-19T06:31:00.000Z'),
      endMs: Date.parse('2026-09-26T06:31:00.000Z'),
    })
  })

  it('returns true when violation has no window (legacy paint)', () => {
    expect(pairingTasksOverlapViolationWindow(
      [task(1, 16693, '2026-08-27T13:00:00.000Z', '2026-08-27T16:55:00.000Z')],
      { startDt: null, endDt: null },
    )).toBe(true)
  })

  it('Aug FLY does not overlap Sep 19–26 7501 window', () => {
    expect(pairingTasksOverlapViolationWindow(
      [
        task(1, 16693, '2026-08-27T13:00:00.000Z', '2026-08-27T16:55:00.000Z'),
        task(2, 16693, '2026-08-28T11:40:00.000Z', '2026-08-28T16:50:00.000Z'),
      ],
      {
        startDt: '2026-09-19T06:31:00.000Z',
        endDt: '2026-09-26T06:31:00.000Z',
      },
    )).toBe(false)
  })

  it('overlapping duty returns true', () => {
    expect(pairingTasksOverlapViolationWindow(
      [task(1, 16693, '2026-09-20T15:00:00.000Z', '2026-09-20T21:00:00.000Z')],
      {
        startDt: '2026-09-19T06:31:00.000Z',
        endDt: '2026-09-26T06:31:00.000Z',
      },
    )).toBe(true)
  })
})

describe('isFlyPairing / crewFlyTasksOverlappingWindow', () => {
  const window7501 = {
    startDt: '2026-08-09T06:31:00.000Z',
    endDt: '2026-08-16T06:31:00.000Z',
  }

  it('isFlyPairing true when any segment is FLY', () => {
    expect(isFlyPairing([
      task(1, 15676, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z', 'FLY'),
      task(2, 15676, '2026-08-11T19:30:00.000Z', '2026-08-11T21:00:00.000Z', 'DHD'),
    ])).toBe(true)
  })

  it('isFlyPairing false for ground-only pairing tasks', () => {
    expect(isFlyPairing([
      task(1, 99, '2026-08-11T00:00:00.000Z', '2026-08-12T00:00:00.000Z', 'DO'),
    ])).toBe(false)
  })

  it('returns overlapping tasks on all FLY pairings (2438 shape)', () => {
    const crewTasks = [
      task(10, 116335, '2026-08-10T15:15:00.000Z', '2026-08-10T19:10:00.000Z', 'FLY'),
      task(11, 15676, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z', 'FLY'),
      task(12, 15676, '2026-08-11T19:30:00.000Z', '2026-08-11T21:00:00.000Z', 'DHD'),
      task(13, 15806, '2026-08-13T15:15:00.000Z', '2026-08-13T19:00:00.000Z', 'FLY'),
      task(14, 15806, '2026-08-14T10:05:00.000Z', '2026-08-14T14:15:00.000Z', 'FLY'),
    ]
    const out = crewFlyTasksOverlappingWindow(crewTasks, window7501)
    expect(out.map((t) => t.id).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14])
  })

  it('returns empty when violation has no usable window (caller must use legacy path)', () => {
    expect(crewFlyTasksOverlappingWindow(
      [task(1, 1, '2026-08-11T15:15:00.000Z', '2026-08-11T19:00:00.000Z')],
      { startDt: null, endDt: null },
    )).toEqual([])
  })

  it('excludes tasks outside the window', () => {
    const crewTasks = [
      task(1, 16693, '2026-08-27T13:00:00.000Z', '2026-08-27T16:55:00.000Z'),
    ]
    expect(crewFlyTasksOverlappingWindow(crewTasks, {
      startDt: '2026-09-19T06:31:00.000Z',
      endDt: '2026-09-26T06:31:00.000Z',
    })).toEqual([])
  })
})

describe('crewTasksOverlappingWindow (7305 any-assignment)', () => {
  it('includes RES and ground duties inside the consecutive-day window', () => {
    const crewTasks = [
      task(1, 138726, '2026-09-05T07:00:00.000Z', '2026-09-05T19:00:00.000Z', 'RES'),
      { ...task(2, 138729, '2026-09-06T14:00:00.000Z', '2026-09-07T02:00:00.000Z', 'RES'), pairingId: 138729 },
      { ...task(3, 0, '2026-09-11T04:00:00.000Z', '2026-09-12T03:59:59.000Z', 'DO'), pairingId: null },
    ]
    const out = crewTasksOverlappingWindow(crewTasks, {
      windowStartDt: '2026-09-05T07:00:00.000Z',
      windowEndDt: '2026-09-10T19:00:00.000Z',
    })
    expect(out.map((t) => t.id)).toEqual([1, 2])
  })
})
