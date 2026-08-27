# Gantt Bar Rendering Rewrite — Design Spec

**Date:** 2026-05-18  
**Scope:** `gantt/src/components/pairing/duty-node-gantt-bar.tsx` + `gantt/src/utils/duty-node-utils.ts`  
**Reference:** `docs/modules/gantt/pairing-duty-node-editor.html`

## Background

The implemented Gantt bar in `DutyNodeGanttBar` deviates from the HTML spec in four areas:

1. All flight segments collapsed into a single block (no individual rendering, no transit gaps)
2. Single-mode REST gap invisible — ⊕ button not centered over it
3. No time axis below the bar; no Block 1 / Block 2 labels above in double mode
4. Colors use flat Tailwind classes instead of spec gradients (Debrief same color as Brief)

## Solution: Plan C — `buildGanttBlocks()` utility + component rewrite

Logic and rendering are separated. A pure function computes the block list; the component only renders.

---

## 1. Data Structures (new, in `duty-node-utils.ts`)

```typescript
type GanttBlockType =
  | 'pickup' | 'brief' | 'flight' | 'transit'
  | 'rest'   | 'hotel' | 'debrief' | 'dropoff'

interface GanttBlock {
  type:         GanttBlockType
  widthPct:     number       // flex basis %, min 0.3
  label:        string       // flight number or empty string
  start:        Date         // for tooltip
  end:          Date
  isRestGap?:   boolean      // true on the single-mode REST gap block
}

interface GanttAxisLabel {
  pct:  number               // left % on the time axis
  text: string               // "HH:MM"
  kind: 'edit' | 'lock' | 'hotel'
}

interface GanttBlockLabel {
  pct:  number               // left % above the bar
  text: string               // "Block 1" | "Block 2"
  kind: 'b1' | 'b2'
}

interface GanttBlocksResult {
  blocks:      GanttBlock[]
  axisLabels:  GanttAxisLabel[]
  blockLabels: GanttBlockLabel[]   // empty when single-mode
  restGapPct:  number | null       // center % of REST gap for ⊕ button; null when double/no gap
}
```

---

## 2. `buildGanttBlocks()` — Pure Function

**Signature:**
```typescript
export function buildGanttBlocks(
  state:            DutyEditState,
  segments:         PairingSegment[],
  restAfterSegSeq:  number | null,
): GanttBlocksResult
```

**Timeline boundaries:**
- `totalStart = state.pickupStart`
- `totalEnd   = isDouble ? state.double.dropoffEnd : state.dropoffEnd`

**Helper:** `wPct(a, b) = max(0.3, (b−a) / totalMs × 100)`

### Single mode block sequence

```
pickup → brief → seg[0] → [transit → seg[1] → ...] up to restAfterSegIdx
  → REST GAP (isRestGap:true)
  → seg[restAfterSegIdx+1] → [transit → ...] → last seg
  → debrief → dropoff
```

- REST gap: from `seg[restAfterSegIdx].actEndDtUtc` to `seg[restAfterSegIdx+1].actStrDtUtc`
- `restGapPct` = left% of REST gap start + widthPct/2 (center for ⊕ button)
- If no `restAfterSegSeq`, rest gap and remaining-seg section are omitted

### Double mode block sequence

```
pickup → brief → b1 segs (0..restAfterSegIdx) → debrief¹ → dropoff¹
  → HOTEL gap
  → pickup² → brief² → b2 segs → debrief² → dropoff²
```

- `restGapPct = null` (⊕ button not shown in double mode)
- `blockLabels` contains Block 1 (at brief¹ left%) and Block 2 (at brief² left%)

### Axis labels

Single mode: pickupStart(edit), briefStart(edit), briefEnd(lock), debriefStart(lock), debriefEnd(edit), dropoffEnd(edit)

Double mode adds: double.pickupStart(hotel), double.briefStart(edit), double.debriefEnd(edit), double.dropoffEnd(edit)

Dedup rule: skip a label if it would render within 4% of the previous one.

---

## 3. `DutyNodeGanttBar` Component Rewrite

**DOM structure (three vertical layers):**

```
<div style="position:relative; overflow:visible">

  {/* Layer 1: Block labels (double mode only, -18px above bar) */}
  {blockLabels.map → <span style="position:absolute; top:-18px; left:{pct}%">}

  {/* Layer 2: Main bar (flexbox, height 30px, overflow:hidden) */}
  <div style="display:flex; height:30px; border-radius:5px; overflow:hidden; background:rgba(0,0,0,0.25)">
    {blocks.map → <div style="flex:0 0 {widthPct}%; background:{color}">
      {label if widthPct >= 5}
    </div>}
  </div>

  {/* ⊕ button — absolute, centered over REST gap */}
  {restGapPct != null && !isDouble &&
    <button style="position:absolute; top:-22px; left:{restGapPct}%; transform:translateX(-50%)">
      ⊕ Add Double
    </button>}

  {/* Layer 3: Time axis (height 20px, relative) */}
  <div style="position:relative; height:20px; margin-top:3px">
    {axisLabels.map → <span style="position:absolute; left:{pct}%; transform:translateX(-50%)">}
  </div>

</div>
```

**Colors (inline style, matching HTML spec exactly):**

| Type | Background |
|------|-----------|
| pickup / dropoff | `linear-gradient(135deg,#92400e,#b45309)` |
| brief | `linear-gradient(135deg,#1e3a8a,#2563eb)` |
| debrief | `linear-gradient(135deg,#164e63,#0891b2)` |
| flight | `linear-gradient(135deg,#1f2937,#374151)` |
| transit | `repeating-linear-gradient(45deg,#1c2128 0,#1c2128 4px,#242d3c 4px,#242d3c 8px)` |
| rest | `repeating-linear-gradient(45deg,#1a1040 0,#1a1040 5px,#231651 5px,#231651 10px)` + dashed purple border left/right |
| hotel | `rgba(110,64,201,0.18)` + `border-left/right: 1px dashed rgba(110,64,201,0.5)` |

Label visibility: render text only when `widthPct >= 5`.

**Props interface — unchanged:**
```typescript
interface Props {
  state:           DutyEditState
  segments:        PairingSegment[]
  firstSeg:        PairingSegment
  lastSeg:         PairingSegment
  restAfterSegSeq: number | null
  onAddDouble:     () => void
}
```

---

## 4. Tests (`duty-node-utils.test.ts`)

New test cases for `buildGanttBlocks`:

- Single mode, no rest gap → no `rest` block, `restGapPct === null`
- Single mode, with rest gap → `rest` block present, `isRestGap:true`, `restGapPct` is center of gap
- Double mode → no `rest` block, two `pickup/brief/debrief/dropoff` sequences, `blockLabels.length === 2`
- `widthPct` minimum 0.3 for tiny segments
- Axis label dedup (< 4% apart skips one)

---

## 5. Files Changed

| File | Change |
|------|--------|
| `gantt/src/utils/duty-node-utils.ts` | Add types + `buildGanttBlocks()` |
| `gantt/src/components/pairing/duty-node-gantt-bar.tsx` | Full rewrite |
| `gantt/src/utils/__tests__/duty-node-utils.test.ts` | Add `buildGanttBlocks` tests |
| `gantt/src/components/pairing/duty-node-dialog.tsx` | No change (props unchanged) |
