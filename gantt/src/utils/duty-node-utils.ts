import type { PairingSegment } from '@/types'

export interface DutyDoubleState {
  pickupStart: Date
  briefStart:  Date
  debriefEnd:  Date
  dropoffEnd:  Date
}

export interface DutyEditState {
  dutySeq:     number
  pickupStart: Date
  briefStart:  Date
  // briefEnd: readonly — = first seg actStrDtUtc
  // debriefStart: readonly — = last seg actEndDtUtc
  debriefEnd:  Date
  dropoffEnd:  Date
  double:      DutyDoubleState | null
}

export interface RestGapResult {
  restAfterSegIdx: number   // 0-based index in the duty's segment array
  restAfterSegSeq: number   // the seg_seq value of Block 1 last segment
  gapMinutes:      number
}

const REST_GAP_MIN_MINUTES = 120

/** Returns the largest inter-segment gap >= REST_GAP_MIN_MINUTES, or null. */
export function detectRestGap(segs: PairingSegment[]): RestGapResult | null {
  if (segs.length < 2) return null

  let best: RestGapResult | null = null

  for (let i = 0; i < segs.length - 1; i++) {
    const gapMs = new Date(segs[i + 1].actStrDtUtc).getTime() - new Date(segs[i].actEndDtUtc).getTime()
    const gapMin = gapMs / 60000
    if (gapMin >= REST_GAP_MIN_MINUTES && (best === null || gapMin > best.gapMinutes)) {
      best = { restAfterSegIdx: i, restAfterSegSeq: segs[i].segSeq, gapMinutes: gapMin }
    }
  }

  return best
}

export function applyBriefStartChange(state: DutyEditState, newBriefStart: Date): DutyEditState {
  const pickupDuration = state.briefStart.getTime() - state.pickupStart.getTime()
  return {
    ...state,
    briefStart:  newBriefStart,
    pickupStart: new Date(newBriefStart.getTime() - pickupDuration),
  }
}

export function applyDebriefEndChange(state: DutyEditState, newDebriefEnd: Date): DutyEditState {
  const dropoffDuration = state.dropoffEnd.getTime() - state.debriefEnd.getTime()
  return {
    ...state,
    debriefEnd: newDebriefEnd,
    dropoffEnd: new Date(newDebriefEnd.getTime() + dropoffDuration),
  }
}

export function applyBlock2BriefStartChange(state: DutyEditState, newBriefStart: Date): DutyEditState {
  if (!state.double) return state
  const pickupDuration = state.double.briefStart.getTime() - state.double.pickupStart.getTime()
  return {
    ...state,
    double: {
      ...state.double,
      briefStart:  newBriefStart,
      pickupStart: new Date(newBriefStart.getTime() - pickupDuration),
    },
  }
}

export function applyBlock2DebriefEndChange(state: DutyEditState, newDebriefEnd: Date): DutyEditState {
  if (!state.double) return state
  const dropoffDuration = state.double.dropoffEnd.getTime() - state.double.debriefEnd.getTime()
  return {
    ...state,
    double: {
      ...state.double,
      debriefEnd: newDebriefEnd,
      dropoffEnd: new Date(newDebriefEnd.getTime() + dropoffDuration),
    },
  }
}

// ─── Gantt block types ────────────────────────────────────────────────────

export type GanttBlockType =
  | 'pickup' | 'brief' | 'flight' | 'transit'
  | 'rest'   | 'hotel' | 'debrief' | 'dropoff'

export interface GanttBlock {
  type:       GanttBlockType
  widthPct:   number      // flex basis %; minimum 0.3
  label:      string      // flight number or empty
  start:      Date        // for tooltip
  end:        Date
  isRestGap?: boolean     // true on single-mode REST gap block
}

export interface GanttAxisLabel {
  pct:  number            // left %
  text: string            // "HH:MM"
  kind: 'edit' | 'lock' | 'hotel'
}

export interface GanttBlockLabel {
  pct:  number
  text: string            // "Block 1" | "Block 2"
  kind: 'b1' | 'b2'
}

export interface GanttBlocksResult {
  blocks:      GanttBlock[]
  axisLabels:  GanttAxisLabel[]
  blockLabels: GanttBlockLabel[]  // empty in single mode
  restGapPct:  number | null      // center % for ⊕ button; null in double mode or no gap
}

function hhmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

export function buildGanttBlocks(
  state:           DutyEditState,
  segments:        PairingSegment[],
  restAfterSegSeq: number | null,
  timezone:        string = 'UTC',
): GanttBlocksResult {
  if (segments.length === 0) {
    return { blocks: [], axisLabels: [], blockLabels: [], restGapPct: null }
  }

  const isDouble   = state.double != null
  const totalStart = state.pickupStart
  const totalEnd   = isDouble ? state.double!.dropoffEnd : state.dropoffEnd
  const totalMs    = totalEnd.getTime() - totalStart.getTime()

  const wPct = (a: Date, b: Date): number =>
    Math.max(0.3, (b.getTime() - a.getTime()) / totalMs * 100)
  const lPct = (t: Date): number =>
    (t.getTime() - totalStart.getTime()) / totalMs * 100

  const segs    = [...segments].sort((a, b) => a.segSeq - b.segSeq)
  const restIdx = restAfterSegSeq != null
    ? segs.findIndex((s) => s.segSeq === restAfterSegSeq)
    : -1

  const b1Segs  = restIdx >= 0 ? segs.slice(0, restIdx + 1) : segs
  const briefEnd = new Date(segs[0].actStrDtUtc)  // locked = first flight dep

  const blocks: GanttBlock[]      = []
  let restGapPct: number | null   = null
  let b2BriefEndForAxis: Date | null = null
  let b2DebriefStartForAxis: Date | null = null

  // ── Pickup ──────────────────────────────────────────────────────────────
  blocks.push({
    type: 'pickup', label: '',
    widthPct: wPct(state.pickupStart, state.briefStart),
    start: state.pickupStart, end: state.briefStart,
  })
  // ── Brief ───────────────────────────────────────────────────────────────
  blocks.push({
    type: 'brief', label: '',
    widthPct: wPct(state.briefStart, briefEnd),
    start: state.briefStart, end: briefEnd,
  })

  // ── Block 1 flight segments ──────────────────────────────────────────────
  for (let i = 0; i < b1Segs.length; i++) {
    if (i > 0) {
      const gs = new Date(b1Segs[i - 1].actEndDtUtc)
      const ge = new Date(b1Segs[i].actStrDtUtc)
      if (ge > gs) {
        blocks.push({ type: 'transit', label: '', widthPct: wPct(gs, ge), start: gs, end: ge })
      }
    }
    blocks.push({
      type: 'flight', label: b1Segs[i].fltNum,
      widthPct: wPct(new Date(b1Segs[i].actStrDtUtc), new Date(b1Segs[i].actEndDtUtc)),
      start: new Date(b1Segs[i].actStrDtUtc), end: new Date(b1Segs[i].actEndDtUtc),
    })
  }

  if (!isDouble) {
    // ── Single mode: REST gap + remaining flights ──────────────────────────
    if (restIdx >= 0 && restIdx < segs.length - 1) {
      const gapStart = new Date(segs[restIdx].actEndDtUtc)
      const gapEnd   = new Date(segs[restIdx + 1].actStrDtUtc)
      const gapW     = wPct(gapStart, gapEnd)
      restGapPct     = (lPct(gapStart) + lPct(gapEnd)) / 2
      blocks.push({
        type: 'rest', label: '', isRestGap: true,
        widthPct: gapW, start: gapStart, end: gapEnd,
      })
      const afterSegs = segs.slice(restIdx + 1)
      for (let i = 0; i < afterSegs.length; i++) {
        if (i > 0) {
          const gs = new Date(afterSegs[i - 1].actEndDtUtc)
          const ge = new Date(afterSegs[i].actStrDtUtc)
          if (ge > gs) {
            blocks.push({ type: 'transit', label: '', widthPct: wPct(gs, ge), start: gs, end: ge })
          }
        }
        blocks.push({
          type: 'flight', label: afterSegs[i].fltNum,
          widthPct: wPct(new Date(afterSegs[i].actStrDtUtc), new Date(afterSegs[i].actEndDtUtc)),
          start: new Date(afterSegs[i].actStrDtUtc), end: new Date(afterSegs[i].actEndDtUtc),
        })
      }
    }
    // ── Block 1 Debrief + Dropoff ──────────────────────────────────────────
    const debriefStart = new Date(segs[segs.length - 1].actEndDtUtc)
    blocks.push({
      type: 'debrief', label: '',
      widthPct: wPct(debriefStart, state.debriefEnd),
      start: debriefStart, end: state.debriefEnd,
    })
    blocks.push({
      type: 'dropoff', label: '',
      widthPct: wPct(state.debriefEnd, state.dropoffEnd),
      start: state.debriefEnd, end: state.dropoffEnd,
    })
  } else {
    // ── Double mode: B1 debrief/dropoff → Hotel → B2 ──────────────────────
    const b1DebriefStart = new Date(b1Segs[b1Segs.length - 1].actEndDtUtc)
    blocks.push({
      type: 'debrief', label: 'Deb¹',
      widthPct: wPct(b1DebriefStart, state.debriefEnd),
      start: b1DebriefStart, end: state.debriefEnd,
    })
    blocks.push({
      type: 'dropoff', label: 'Drop¹',
      widthPct: wPct(state.debriefEnd, state.dropoffEnd),
      start: state.debriefEnd, end: state.dropoffEnd,
    })
    blocks.push({
      type: 'hotel', label: 'REST',
      widthPct: wPct(state.dropoffEnd, state.double!.pickupStart),
      start: state.dropoffEnd, end: state.double!.pickupStart,
    })
    const b2Segs    = restIdx >= 0 ? segs.slice(restIdx + 1) : []
    if (b2Segs.length === 0) {
      return { blocks, axisLabels: [], blockLabels: [], restGapPct: null }
    }
    const b2BriefEnd = new Date(b2Segs[0].actStrDtUtc)
    const b2DebriefStart = new Date(b2Segs[b2Segs.length - 1].actEndDtUtc)
    b2BriefEndForAxis = b2BriefEnd
    b2DebriefStartForAxis = b2DebriefStart
    blocks.push({
      type: 'pickup', label: 'Pick²',
      widthPct: wPct(state.double!.pickupStart, state.double!.briefStart),
      start: state.double!.pickupStart, end: state.double!.briefStart,
    })
    blocks.push({
      type: 'brief', label: 'Brief²',
      widthPct: wPct(state.double!.briefStart, b2BriefEnd),
      start: state.double!.briefStart, end: b2BriefEnd,
    })
    for (let i = 0; i < b2Segs.length; i++) {
      if (i > 0) {
        const gs = new Date(b2Segs[i - 1].actEndDtUtc)
        const ge = new Date(b2Segs[i].actStrDtUtc)
        if (ge > gs) {
          blocks.push({ type: 'transit', label: '', widthPct: wPct(gs, ge), start: gs, end: ge })
        }
      }
      blocks.push({
        type: 'flight', label: b2Segs[i].fltNum,
        widthPct: wPct(new Date(b2Segs[i].actStrDtUtc), new Date(b2Segs[i].actEndDtUtc)),
        start: new Date(b2Segs[i].actStrDtUtc), end: new Date(b2Segs[i].actEndDtUtc),
      })
    }
    blocks.push({
      type: 'debrief', label: 'Deb²',
      widthPct: wPct(b2DebriefStart, state.double!.debriefEnd),
      start: b2DebriefStart, end: state.double!.debriefEnd,
    })
    blocks.push({
      type: 'dropoff', label: 'Drop²',
      widthPct: wPct(state.double!.debriefEnd, state.double!.dropoffEnd),
      start: state.double!.debriefEnd, end: state.double!.dropoffEnd,
    })
  }

  // ── Axis labels ─────────────────────────────────────────────────────────
  const lastDebriefStart = isDouble
    ? new Date(b1Segs[b1Segs.length - 1].actEndDtUtc)
    : new Date(segs[segs.length - 1].actEndDtUtc)

  const rawLabels: GanttAxisLabel[] = isDouble ? [
    { pct: lPct(state.pickupStart),           text: hhmm(state.pickupStart,           timezone), kind: 'edit'  },
    { pct: lPct(state.briefStart),            text: hhmm(state.briefStart,            timezone), kind: 'edit'  },
    { pct: lPct(briefEnd),                    text: hhmm(briefEnd,                    timezone), kind: 'lock'  },
    { pct: lPct(lastDebriefStart),            text: hhmm(lastDebriefStart,            timezone), kind: 'lock'  },
    { pct: lPct(state.debriefEnd),            text: hhmm(state.debriefEnd,            timezone), kind: 'edit'  },
    { pct: lPct(state.dropoffEnd),            text: hhmm(state.dropoffEnd,            timezone), kind: 'edit'  },
    { pct: lPct(state.double!.pickupStart),   text: hhmm(state.double!.pickupStart,   timezone), kind: 'hotel' },
    { pct: lPct(state.double!.briefStart),    text: hhmm(state.double!.briefStart,    timezone), kind: 'edit'  },
    { pct: lPct(b2BriefEndForAxis!),          text: hhmm(b2BriefEndForAxis!,          timezone), kind: 'lock'  },
    { pct: lPct(b2DebriefStartForAxis!),      text: hhmm(b2DebriefStartForAxis!,      timezone), kind: 'lock'  },
    { pct: lPct(state.double!.debriefEnd),    text: hhmm(state.double!.debriefEnd,    timezone), kind: 'edit'  },
    { pct: lPct(state.double!.dropoffEnd),    text: hhmm(state.double!.dropoffEnd,    timezone), kind: 'edit'  },
  ] : [
    { pct: lPct(state.pickupStart),           text: hhmm(state.pickupStart,           timezone), kind: 'edit'  },
    { pct: lPct(state.briefStart),            text: hhmm(state.briefStart,            timezone), kind: 'edit'  },
    { pct: lPct(briefEnd),                    text: hhmm(briefEnd,                    timezone), kind: 'lock'  },
    { pct: lPct(lastDebriefStart),            text: hhmm(lastDebriefStart,            timezone), kind: 'lock'  },
    { pct: lPct(state.debriefEnd),            text: hhmm(state.debriefEnd,            timezone), kind: 'edit'  },
    { pct: lPct(state.dropoffEnd),            text: hhmm(state.dropoffEnd,            timezone), kind: 'edit'  },
  ]

  // Dedup: skip label if within 4% of previous
  const axisLabels: GanttAxisLabel[] = []
  for (const lp of rawLabels) {
    if (!axisLabels.length || lp.pct - axisLabels[axisLabels.length - 1].pct > 4) {
      axisLabels.push(lp)
    }
  }

  // ── Block labels (double mode only) ──────────────────────────────────────
  const blockLabels: GanttBlockLabel[] = isDouble ? [
    { pct: lPct(state.briefStart),          text: 'Block 1', kind: 'b1' },
    { pct: lPct(state.double!.briefStart),  text: 'Block 2', kind: 'b2' },
  ] : []

  return { blocks, axisLabels, blockLabels, restGapPct }
}
