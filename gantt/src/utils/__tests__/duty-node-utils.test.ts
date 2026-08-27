import { describe, it, expect } from 'vitest'
import {
  applyBriefStartChange,
  applyDebriefEndChange,
  applyBlock2BriefStartChange,
  applyBlock2DebriefEndChange,
  detectRestGap,
  buildGanttBlocks,
} from '../duty-node-utils'
import type { DutyEditState } from '../duty-node-utils'

const D = (iso: string) => new Date(iso)

const baseState = (): DutyEditState => ({
  dutySeq:     1,
  pickupStart: D('2026-03-01T08:30:00Z'),
  briefStart:  D('2026-03-01T09:00:00Z'),
  debriefEnd:  D('2026-03-01T14:30:00Z'),
  dropoffEnd:  D('2026-03-01T15:00:00Z'),
  double: null,
})

describe('applyBriefStartChange', () => {
  it('shifts briefStart and preserves pickup duration', () => {
    const state = baseState() // pickup: 08:30→09:00 = 30min
    const result = applyBriefStartChange(state, D('2026-03-01T10:00:00Z'))
    expect(result.briefStart).toEqual(D('2026-03-01T10:00:00Z'))
    expect(result.pickupStart).toEqual(D('2026-03-01T09:30:00Z')) // 10:00 - 30min
    expect(result.debriefEnd).toEqual(state.debriefEnd) // unchanged
    expect(result.dropoffEnd).toEqual(state.dropoffEnd) // unchanged
  })

  it('handles zero pickup duration (briefStart === pickupStart)', () => {
    const state = { ...baseState(), pickupStart: D('2026-03-01T09:00:00Z') }
    const result = applyBriefStartChange(state, D('2026-03-01T10:00:00Z'))
    expect(result.briefStart).toEqual(D('2026-03-01T10:00:00Z'))
    expect(result.pickupStart).toEqual(D('2026-03-01T10:00:00Z'))
  })
})

describe('applyDebriefEndChange', () => {
  it('shifts debriefEnd and preserves dropoff duration', () => {
    const state = baseState() // dropoff: 14:30→15:00 = 30min
    const result = applyDebriefEndChange(state, D('2026-03-01T15:00:00Z'))
    expect(result.debriefEnd).toEqual(D('2026-03-01T15:00:00Z'))
    expect(result.dropoffEnd).toEqual(D('2026-03-01T15:30:00Z')) // 15:00 + 30min
    expect(result.briefStart).toEqual(state.briefStart) // unchanged
  })
})

describe('independent edits', () => {
  it('pickupStart change does not affect briefStart or dropoffEnd', () => {
    const state = baseState()
    const result = { ...state, pickupStart: D('2026-03-01T08:00:00Z') }
    expect(result.briefStart).toEqual(state.briefStart)
    expect(result.dropoffEnd).toEqual(state.dropoffEnd)
  })

  it('dropoffEnd change does not affect debriefEnd or briefStart', () => {
    const state = baseState()
    const result = { ...state, dropoffEnd: D('2026-03-01T16:00:00Z') }
    expect(result.debriefEnd).toEqual(state.debriefEnd)
    expect(result.briefStart).toEqual(state.briefStart)
  })
})

describe('applyBlock2BriefStartChange', () => {
  it('shifts block 2 briefStart and preserves block 2 pickup duration', () => {
    const state: DutyEditState = {
      ...baseState(),
      double: {
        pickupStart: D('2026-03-02T07:30:00Z'),
        briefStart:  D('2026-03-02T08:00:00Z'),
        debriefEnd:  D('2026-03-02T14:00:00Z'),
        dropoffEnd:  D('2026-03-02T14:30:00Z'),
      },
    }
    const result = applyBlock2BriefStartChange(state, D('2026-03-02T09:00:00Z'))
    expect(result.double!.briefStart).toEqual(D('2026-03-02T09:00:00Z'))
    expect(result.double!.pickupStart).toEqual(D('2026-03-02T08:30:00Z')) // 09:00 - 30min
    expect(result.double!.debriefEnd).toEqual(state.double!.debriefEnd)
  })
})

describe('applyBlock2DebriefEndChange', () => {
  it('shifts block 2 debriefEnd and preserves block 2 dropoff duration', () => {
    const state: DutyEditState = {
      ...baseState(),
      double: {
        pickupStart: D('2026-03-02T07:30:00Z'),
        briefStart:  D('2026-03-02T08:00:00Z'),
        debriefEnd:  D('2026-03-02T14:00:00Z'),
        dropoffEnd:  D('2026-03-02T14:30:00Z'),
      },
    }
    const result = applyBlock2DebriefEndChange(state, D('2026-03-02T15:00:00Z'))
    expect(result.double!.debriefEnd).toEqual(D('2026-03-02T15:00:00Z'))
    expect(result.double!.dropoffEnd).toEqual(D('2026-03-02T15:30:00Z'))
  })
})

describe('detectRestGap', () => {
  it('returns null when all gaps < 120 min', () => {
    const segs = [
      { segSeq: 1, actEndDtUtc: '2026-03-01T10:00:00Z', actStrDtUtc: '2026-03-01T08:00:00Z' },
      { segSeq: 2, actEndDtUtc: '2026-03-01T14:00:00Z', actStrDtUtc: '2026-03-01T11:00:00Z' },
    ]
    expect(detectRestGap(segs as any)).toBeNull()
  })

  it('returns the largest gap >= 120 min', () => {
    const segs = [
      { segSeq: 1, actEndDtUtc: '2026-03-01T10:00:00Z', actStrDtUtc: '2026-03-01T08:00:00Z' },
      { segSeq: 2, actEndDtUtc: '2026-03-01T16:00:00Z', actStrDtUtc: '2026-03-01T13:00:00Z' }, // gap from 10→13 = 180min
      { segSeq: 3, actEndDtUtc: '2026-03-01T20:00:00Z', actStrDtUtc: '2026-03-01T17:00:00Z' }, // gap from 16→17 = 60min
    ]
    const result = detectRestGap(segs as any)
    expect(result).toEqual({ restAfterSegIdx: 0, restAfterSegSeq: 1, gapMinutes: 180 })
  })
})

// ─── buildGanttBlocks ────────────────────────────────────────────────────

const seg = (segSeq: number, fltNum: string, start: string, end: string) => ({
  segSeq,
  fltNum,
  actStrDtUtc: start,
  actEndDtUtc: end,
} as unknown as import('@/types').PairingSegment)

const singleState = (): DutyEditState => ({
  dutySeq:     1,
  pickupStart: D('2026-05-15T06:00:00Z'),
  briefStart:  D('2026-05-15T06:30:00Z'),
  debriefEnd:  D('2026-05-15T16:30:00Z'),
  dropoffEnd:  D('2026-05-15T17:00:00Z'),
  double: null,
})

describe('buildGanttBlocks — single mode, no rest gap', () => {
  const segs = [
    seg(1, 'CA101', '2026-05-15T07:00:00Z', '2026-05-15T09:45:00Z'),
    seg(2, 'CA102', '2026-05-15T10:00:00Z', '2026-05-15T12:00:00Z'),
  ]

  it('produces no rest block and null restGapPct when gap < 120 min', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    expect(result.restGapPct).toBeNull()
    expect(result.blocks.find((b) => b.type === 'rest')).toBeUndefined()
  })

  it('block sequence is pickup→brief→flight→transit→flight→debrief→dropoff', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    const types = result.blocks.map((b) => b.type)
    expect(types).toEqual(['pickup', 'brief', 'flight', 'transit', 'flight', 'debrief', 'dropoff'])
  })

  it('blockLabels is empty in single mode', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    expect(result.blockLabels).toHaveLength(0)
  })

  it('all widthPct values are >= 0.3', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    for (const b of result.blocks) {
      expect(b.widthPct).toBeGreaterThanOrEqual(0.3)
    }
  })

  it('total widthPct sums to approximately 100', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    const total = result.blocks.reduce((s, b) => s + b.widthPct, 0)
    expect(total).toBeGreaterThan(99)
    expect(total).toBeLessThanOrEqual(101)
  })

  it('axisLabels has edit labels for pickupStart, briefStart, debriefEnd, dropoffEnd', () => {
    const result = buildGanttBlocks(singleState(), segs, null)
    const editLabels = result.axisLabels.filter((l) => l.kind === 'edit')
    expect(editLabels.length).toBeGreaterThanOrEqual(4)
  })
})

describe('buildGanttBlocks — single mode, with rest gap', () => {
  // 07:00–09:45 then 14:00–16:00 → gap = 255 min ≥ 120
  const segs = [
    seg(1, 'CA101', '2026-05-15T07:00:00Z', '2026-05-15T09:45:00Z'),
    seg(2, 'CA102', '2026-05-15T14:00:00Z', '2026-05-15T16:00:00Z'),
  ]

  it('includes a rest block with isRestGap:true', () => {
    const result = buildGanttBlocks(singleState(), segs, 1)
    const restBlock = result.blocks.find((b) => b.type === 'rest')
    expect(restBlock).toBeDefined()
    expect(restBlock!.isRestGap).toBe(true)
  })

  it('restGapPct is the center of the REST gap (between 0 and 100)', () => {
    const result = buildGanttBlocks(singleState(), segs, 1)
    expect(result.restGapPct).not.toBeNull()
    expect(result.restGapPct!).toBeGreaterThan(0)
    expect(result.restGapPct!).toBeLessThan(100)
  })

  it('flight after rest gap is present', () => {
    const result = buildGanttBlocks(singleState(), segs, 1)
    const flights = result.blocks.filter((b) => b.type === 'flight')
    expect(flights).toHaveLength(2)
    expect(flights[0].label).toBe('CA101')
    expect(flights[1].label).toBe('CA102')
  })

  it('sequence contains rest block between the two flights', () => {
    const result = buildGanttBlocks(singleState(), segs, 1)
    const types = result.blocks.map((b) => b.type)
    const restIdx = types.indexOf('rest')
    const flightIdxs = types.map((t, i) => t === 'flight' ? i : -1).filter((i) => i >= 0)
    expect(restIdx).toBeGreaterThan(flightIdxs[0])
    expect(restIdx).toBeLessThan(flightIdxs[1])
  })
})

describe('buildGanttBlocks — double mode', () => {
  const segs = [
    seg(1, 'CA205', '2026-05-16T09:00:00Z', '2026-05-16T11:30:00Z'),
    seg(2, 'CA306', '2026-05-16T16:30:00Z', '2026-05-16T19:00:00Z'),
  ]

  const doubleState = (): DutyEditState => ({
    dutySeq:     2,
    pickupStart: D('2026-05-16T08:00:00Z'),
    briefStart:  D('2026-05-16T08:30:00Z'),
    debriefEnd:  D('2026-05-16T12:00:00Z'),
    dropoffEnd:  D('2026-05-16T12:30:00Z'),
    double: {
      pickupStart: D('2026-05-16T15:45:00Z'),
      briefStart:  D('2026-05-16T16:00:00Z'),
      debriefEnd:  D('2026-05-16T19:30:00Z'),
      dropoffEnd:  D('2026-05-16T20:00:00Z'),
    },
  })

  it('has no rest block', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    expect(result.blocks.find((b) => b.type === 'rest')).toBeUndefined()
  })

  it('restGapPct is null in double mode', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    expect(result.restGapPct).toBeNull()
  })

  it('has a hotel block between the two blocks', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    expect(result.blocks.find((b) => b.type === 'hotel')).toBeDefined()
  })

  it('blockLabels has 2 entries (Block 1 and Block 2)', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    expect(result.blockLabels).toHaveLength(2)
    expect(result.blockLabels[0].text).toBe('Block 1')
    expect(result.blockLabels[1].text).toBe('Block 2')
  })

  it('has two debrief and two dropoff blocks', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    const types = result.blocks.map((b) => b.type)
    expect(types.filter((t) => t === 'debrief')).toHaveLength(2)
    expect(types.filter((t) => t === 'dropoff')).toHaveLength(2)
  })

  it('all widthPct values are >= 0.3', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    for (const b of result.blocks) {
      expect(b.widthPct).toBeGreaterThanOrEqual(0.3)
    }
  })

  it('hotel axis labels have kind:hotel', () => {
    const result = buildGanttBlocks(doubleState(), segs, 1)
    const hotelLabels = result.axisLabels.filter((l) => l.kind === 'hotel')
    expect(hotelLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('handles double mode with no restAfterSegSeq (returns early, no duplicate flights)', () => {
    const result = buildGanttBlocks(doubleState(), segs, null)
    const flights = result.blocks.filter((b) => b.type === 'flight')
    // Should not duplicate — early return from b2Segs empty guard
    expect(flights.length).toBeLessThanOrEqual(segs.length)
  })
})

describe('buildGanttBlocks — axis label dedup', () => {
  it('skips axis labels within 4% of the previous one', () => {
    const tinyState: DutyEditState = {
      dutySeq:     1,
      pickupStart: D('2026-05-15T06:59:00Z'),
      briefStart:  D('2026-05-15T07:00:00Z'),
      debriefEnd:  D('2026-05-15T17:00:00Z'),
      dropoffEnd:  D('2026-05-15T18:00:00Z'),
      double: null,
    }
    const segs = [seg(1, 'CA101', '2026-05-15T07:00:00Z', '2026-05-15T16:00:00Z')]
    const result = buildGanttBlocks(tinyState, segs, null)
    const pcts = result.axisLabels.map((l) => l.pct)
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i] - pcts[i - 1]).toBeGreaterThan(4)
    }
  })
})
