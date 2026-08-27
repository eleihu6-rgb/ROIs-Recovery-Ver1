# Gantt Bar Rendering Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `DutyNodeGanttBar` to match the HTML spec: individual flight segments, visible REST gap with centered ⊕ button, time axis, Block labels, and correct gradients.

**Architecture:** Extract a pure `buildGanttBlocks()` function into `duty-node-utils.ts` that computes blocks/axis/labels from state+segments; the component becomes a thin renderer of that output. Tests cover the pure function; the component only contains rendering logic.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind + inline style (gradients/hatching require inline style — Tailwind cannot express `repeating-linear-gradient`)

---

## File Map

| File | Change |
|------|--------|
| `gantt/src/utils/duty-node-utils.ts` | Add 4 types + `buildGanttBlocks()` at end of file |
| `gantt/src/utils/__tests__/duty-node-utils.test.ts` | Append `buildGanttBlocks` describe block |
| `gantt/src/components/pairing/duty-node-gantt-bar.tsx` | Full rewrite (~165 → ~150 lines) |
| `gantt/src/components/pairing/duty-node-dialog.tsx` | **No change** — props interface unchanged |

---

## Task 1: Add types + `buildGanttBlocks()` to `duty-node-utils.ts`

**Files:**
- Modify: `gantt/src/utils/duty-node-utils.ts` (append after existing exports)

- [ ] **Step 1: Append types and function to `duty-node-utils.ts`**

Add the following block at the **end** of the file, after the existing `applyBlock2DebriefEndChange` function:

```typescript
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

function hhmm(d: Date): string {
  return d.toISOString().slice(11, 16)
}

export function buildGanttBlocks(
  state:           DutyEditState,
  segments:        PairingSegment[],
  restAfterSegSeq: number | null,
): GanttBlocksResult {
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

  const b1Segs  = isDouble && restIdx >= 0 ? segs.slice(0, restIdx + 1) : segs
  const briefEnd = new Date(segs[0].actStrDtUtc)  // locked = first flight dep

  const blocks: GanttBlock[]      = []
  let restGapPct: number | null   = null

  // ── Pickup ──────────────────────────────────────────────────────────────
  blocks.push({
    type: 'pickup', label: '', isRestGap: false,
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
      restGapPct     = lPct(gapStart) + gapW / 2
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
      type: 'hotel', label: '🏨 REST',
      widthPct: wPct(state.dropoffEnd, state.double!.pickupStart),
      start: state.dropoffEnd, end: state.double!.pickupStart,
    })
    const b2Segs    = restIdx >= 0 ? segs.slice(restIdx + 1) : segs
    const b2BriefEnd = new Date(b2Segs[0].actStrDtUtc)
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
    const b2DebriefStart = new Date(b2Segs[b2Segs.length - 1].actEndDtUtc)
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
    { pct: lPct(state.pickupStart),           text: hhmm(state.pickupStart),           kind: 'edit'  },
    { pct: lPct(state.briefStart),            text: hhmm(state.briefStart),            kind: 'edit'  },
    { pct: lPct(briefEnd),                    text: hhmm(briefEnd),                    kind: 'lock'  },
    { pct: lPct(lastDebriefStart),            text: hhmm(lastDebriefStart),            kind: 'lock'  },
    { pct: lPct(state.debriefEnd),            text: hhmm(state.debriefEnd),            kind: 'edit'  },
    { pct: lPct(state.dropoffEnd),            text: hhmm(state.dropoffEnd),            kind: 'edit'  },
    { pct: lPct(state.double!.pickupStart),   text: hhmm(state.double!.pickupStart),   kind: 'hotel' },
    { pct: lPct(state.double!.briefStart),    text: hhmm(state.double!.briefStart),    kind: 'edit'  },
    { pct: lPct(state.double!.debriefEnd),    text: hhmm(state.double!.debriefEnd),    kind: 'edit'  },
    { pct: lPct(state.double!.dropoffEnd),    text: hhmm(state.double!.dropoffEnd),    kind: 'edit'  },
  ] : [
    { pct: lPct(state.pickupStart),           text: hhmm(state.pickupStart),           kind: 'edit'  },
    { pct: lPct(state.briefStart),            text: hhmm(state.briefStart),            kind: 'edit'  },
    { pct: lPct(briefEnd),                    text: hhmm(briefEnd),                    kind: 'lock'  },
    { pct: lPct(lastDebriefStart),            text: hhmm(lastDebriefStart),            kind: 'lock'  },
    { pct: lPct(state.debriefEnd),            text: hhmm(state.debriefEnd),            kind: 'edit'  },
    { pct: lPct(state.dropoffEnd),            text: hhmm(state.dropoffEnd),            kind: 'edit'  },
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
```

---

## Task 2: Write failing tests for `buildGanttBlocks`

**Files:**
- Modify: `gantt/src/utils/__tests__/duty-node-utils.test.ts` (append new describe block)

- [ ] **Step 1: Add imports and helpers at top of test file**

The existing file already imports from `'../duty-node-utils'`. Update the import line to include `buildGanttBlocks`:

```typescript
import {
  applyBriefStartChange,
  applyDebriefEndChange,
  applyBlock2BriefStartChange,
  applyBlock2DebriefEndChange,
  detectRestGap,
  buildGanttBlocks,
} from '../duty-node-utils'
import type { DutyEditState } from '../duty-node-utils'
```

- [ ] **Step 2: Append the `buildGanttBlocks` describe block at the end of the test file**

```typescript
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
    const restIdx2 = types.indexOf('rest')
    const flightIdxs = types.map((t, i) => t === 'flight' ? i : -1).filter((i) => i >= 0)
    expect(restIdx2).toBeGreaterThan(flightIdxs[0])
    expect(restIdx2).toBeLessThan(flightIdxs[1])
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
})

describe('buildGanttBlocks — axis label dedup', () => {
  it('skips axis labels within 4% of the previous one', () => {
    // Compress pickup and briefStart very close together
    const tinyState: DutyEditState = {
      dutySeq:     1,
      pickupStart: D('2026-05-15T06:59:00Z'),  // 1 min before brief
      briefStart:  D('2026-05-15T07:00:00Z'),
      debriefEnd:  D('2026-05-15T17:00:00Z'),
      dropoffEnd:  D('2026-05-15T18:00:00Z'),
      double: null,
    }
    const segs = [seg(1, 'CA101', '2026-05-15T07:00:00Z', '2026-05-15T16:00:00Z')]
    const result = buildGanttBlocks(tinyState, segs, null)
    // pickupStart and briefStart are almost at the same pct — one should be dropped
    const pcts = result.axisLabels.map((l) => l.pct)
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i] - pcts[i - 1]).toBeGreaterThan(4)
    }
  })
})
```

- [ ] **Step 3: Run the tests — they should FAIL because `buildGanttBlocks` doesn't exist yet**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/utils/__tests__/duty-node-utils.test.ts 2>&1 | tail -20
```

Expected: multiple `ReferenceError: buildGanttBlocks is not defined` or similar failures.

---

## Task 3: Implement `buildGanttBlocks` and run tests green

- [ ] **Step 1: Apply the code from Task 1 Step 1** (append the block to `duty-node-utils.ts`)

- [ ] **Step 2: Run tests — all should pass**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/utils/__tests__/duty-node-utils.test.ts 2>&1 | tail -30
```

Expected: all tests PASS, no failures.

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai && git add gantt/src/utils/duty-node-utils.ts gantt/src/utils/__tests__/duty-node-utils.test.ts && git commit -m "feat(gantt): add buildGanttBlocks utility with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Rewrite `duty-node-gantt-bar.tsx`

**Files:**
- Rewrite: `gantt/src/components/pairing/duty-node-gantt-bar.tsx`

- [ ] **Step 1: Replace the entire file with the new implementation**

```typescript
import type { DutyEditState, GanttBlock } from '@/utils/duty-node-utils'
import type { PairingSegment } from '@/types'
import { buildGanttBlocks } from '@/utils/duty-node-utils'

interface Props {
  state:           DutyEditState
  segments:        PairingSegment[]
  firstSeg:        PairingSegment   // kept for interface compat with dialog
  lastSeg:         PairingSegment   // kept for interface compat with dialog
  restAfterSegSeq: number | null
  onAddDouble:     () => void
}

const BLOCK_BG: Record<string, string> = {
  pickup:  'linear-gradient(135deg,#92400e,#b45309)',
  brief:   'linear-gradient(135deg,#1e3a8a,#2563eb)',
  flight:  'linear-gradient(135deg,#1f2937,#374151)',
  transit: 'repeating-linear-gradient(45deg,#1c2128 0,#1c2128 4px,#242d3c 4px,#242d3c 8px)',
  rest:    'repeating-linear-gradient(45deg,#1a1040 0,#1a1040 5px,#231651 5px,#231651 10px)',
  hotel:   'rgba(110,64,201,0.18)',
  debrief: 'linear-gradient(135deg,#164e63,#0891b2)',
  dropoff: 'linear-gradient(135deg,#92400e,#b45309)',
}

const BLOCK_COLOR: Record<string, string> = {
  hotel:   '#a78bfa',
  transit: 'transparent',
  rest:    'transparent',
  flight:  'rgba(255,255,255,0.65)',
}

function blockBorderStyle(type: string): React.CSSProperties {
  if (type === 'rest') {
    return {
      borderLeft:  '1px dashed rgba(110,64,201,0.4)',
      borderRight: '1px dashed rgba(110,64,201,0.4)',
    }
  }
  if (type === 'hotel') {
    return {
      borderLeft:  '1px dashed rgba(110,64,201,0.5)',
      borderRight: '1px dashed rgba(110,64,201,0.5)',
    }
  }
  return {}
}

function fmtDur(from: Date, to: Date): string {
  const mins = Math.round(Math.abs(to.getTime() - from.getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m.toString().padStart(2, '0')}m`
}

function BlockSegment({ block }: { block: GanttBlock }) {
  const showLabel = block.widthPct >= 5
  const label = block.type === 'hotel' && !showLabel ? '🏨' : (showLabel ? block.label : '')
  const tip = `${block.label || block.type}: ${block.start.toISOString().slice(11, 16)} – ${block.end.toISOString().slice(11, 16)} (${fmtDur(block.start, block.end)})`

  return (
    <div
      title={tip}
      style={{
        flex:            `0 0 ${block.widthPct}%`,
        height:          '100%',
        background:      BLOCK_BG[block.type] ?? '#374151',
        color:           BLOCK_COLOR[block.type] ?? 'rgba(255,255,255,0.88)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        fontSize:        10,
        fontWeight:      600,
        fontFamily:      'monospace',
        overflow:        'hidden',
        whiteSpace:      'nowrap',
        cursor:          'default',
        transition:      'filter 0.15s',
        ...blockBorderStyle(block.type),
      }}
    >
      {label && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>
          {label}
        </span>
      )}
    </div>
  )
}

export function DutyNodeGanttBar({
  state, segments, restAfterSegSeq, onAddDouble,
}: Props) {
  const { blocks, axisLabels, blockLabels, restGapPct } = buildGanttBlocks(
    state, segments, restAfterSegSeq,
  )
  const isDouble = state.double != null

  return (
    <div style={{ position: 'relative', overflow: 'visible', marginTop: 20, marginBottom: 4 }}>

      {/* Block labels (double mode only) — 18px above bar */}
      {blockLabels.map((bl) => (
        <span
          key={bl.kind}
          style={{
            position:      'absolute',
            top:           -18,
            left:          `${bl.pct}%`,
            fontSize:      9,
            fontFamily:    'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         bl.kind === 'b2' ? '#a78bfa' : '#8b949e',
            pointerEvents: 'none',
          }}
        >
          {bl.text}
        </span>
      ))}

      {/* ⊕ Add Double button — centered over REST gap, 22px above bar */}
      {!isDouble && restGapPct != null && (
        <button
          type="button"
          onClick={onAddDouble}
          title="Add second sign-in/out block"
          style={{
            position:   'absolute',
            top:        -22,
            left:       `${restGapPct}%`,
            transform:  'translateX(-50%)',
            height:     18,
            padding:    '0 8px',
            background: '#6e40c9',
            color:      '#fff',
            border:     'none',
            borderRadius: 9,
            fontSize:   10,
            fontWeight: 600,
            cursor:     'pointer',
            whiteSpace: 'nowrap',
            display:    'flex',
            alignItems: 'center',
            gap:        3,
            boxShadow:  '0 2px 6px rgba(0,0,0,0.4)',
            zIndex:     10,
          }}
        >
          ⊕ Add Double
        </button>
      )}

      {/* Main bar — flexbox, height 30px */}
      <div
        style={{
          display:      'flex',
          height:       30,
          borderRadius: 5,
          overflow:     'hidden',
          background:   'rgba(0,0,0,0.25)',
        }}
      >
        {blocks.map((b, i) => <BlockSegment key={i} block={b} />)}
      </div>

      {/* Time axis — 20px below bar */}
      <div style={{ position: 'relative', height: 20, marginTop: 3 }}>
        {axisLabels.map((lp, i) => (
          <span
            key={i}
            style={{
              position:   'absolute',
              left:       `${lp.pct}%`,
              transform:  'translateX(-50%)',
              fontSize:   10,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              color:
                lp.kind === 'edit'  ? '#2f81f7' :
                lp.kind === 'hotel' ? '#a78bfa' :
                '#4d5761',
            }}
          >
            {lp.text}
          </span>
        ))}
      </div>

    </div>
  )
}
```

- [ ] **Step 2: Add the missing React import**

The file uses `React.CSSProperties` in `blockBorderStyle`. Add the import at the top of the file:

```typescript
import React from 'react'
```

So the top of the file reads:

```typescript
import React from 'react'
import type { DutyEditState, GanttBlock } from '@/utils/duty-node-utils'
import type { PairingSegment } from '@/types'
import { buildGanttBlocks } from '@/utils/duty-node-utils'
```

- [ ] **Step 3: TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. If there are errors, fix them before proceeding.

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/yuan.z/rois/rois-ai && git add gantt/src/components/pairing/duty-node-gantt-bar.tsx && git commit -m "feat(gantt): rewrite DutyNodeGanttBar — individual segments, REST gap, time axis, gradients

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] Spec §1 (buildGanttBlocks types) → Task 1 Step 1
- [x] Spec §2 (buildGanttBlocks logic: single/double/rest/hotel) → Task 1 Step 1
- [x] Spec §2 (axis label dedup > 4%) → Task 1 Step 1 + Task 2 dedup test
- [x] Spec §2 (blockLabels double mode) → Task 1 Step 1
- [x] Spec §3 (component: 3-layer DOM) → Task 4 Step 1
- [x] Spec §3 (⊕ button centered over gap) → `restGapPct` = center of gap
- [x] Spec §3 (color table) → `BLOCK_BG` record in Task 4 Step 1
- [x] Spec §3 (label if widthPct ≥ 5) → `BlockSegment` component
- [x] Spec §3 (props interface unchanged) → `firstSeg`/`lastSeg` kept, dialog not touched
- [x] Spec §4 (tests: single/double/no-gap/widthPct min/dedup) → Task 2
- [x] Type consistency: `GanttBlock`, `GanttAxisLabel`, `GanttBlockLabel`, `GanttBlocksResult` defined in Task 1 and used consistently in Task 4
