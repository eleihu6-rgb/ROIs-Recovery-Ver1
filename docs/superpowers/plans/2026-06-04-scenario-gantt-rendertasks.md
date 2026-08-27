# Scenario Gantt — renderRosterTasks Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom pairing-bar drawing in ScenarioGanttCanvas with Live Gantt's `renderRosterTasks`, using real `pairing_segment` node data from input.gz to render duty blocks, brief/debrief bars, and flight segments exactly like the Live Gantt roster view. Also add Zoom In/Out buttons and TimezoneSwitcher to the toolbar.

**Architecture:** `scenario-gantt-service.ts` parses the `pairing_segment` section from input.gz and adds it to `ScenarioGanttData`. The frontend builds a `RosterItem[]` from the cross-reference of assignments × pairing × pairing_segment, then calls `renderRosterTasks()` inside `ScenarioGanttCanvas`. No new API endpoints; backend data shape changes only. Zoom and timezone are toolbar additions only.

**Tech Stack:** TypeScript / Fastify / Node.js (live-server) · React 19 / Canvas 2D / Zustand (gantt) · `renderRosterTasks` from `@/components/gantt/renderers/roster-renderer`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `live-server/src/services/scenario/scenario-gantt-service.ts` | Parse `pairing_segment` section; add to return type |
| Modify | `gantt/src/types/scenario-gantt.ts` | Add `ScenarioGanttPairingSegment`; add to `ScenarioGanttData` |
| Modify | `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` | Replace manual bar drawing with `buildRosterItems` + `renderRosterTasks` |
| Modify | `gantt/src/components/shell/scenario-gantt-view.tsx` | Pass `pairingSegments` + `timezone` down to canvas |
| Modify | `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` | Add Zoom In/Out buttons + `TimezoneSwitcher` |

---

## Task 1: Add ScenarioGanttPairingSegment type + extend ScenarioGanttData

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts`

The `parseSections` utility returns all CSV values as strings. We capture only the fields needed to build `RosterItem`.

- [ ] **Step 1: Add the new type and extend ScenarioGanttData**

Open `gantt/src/types/scenario-gantt.ts` and add after the `ScenarioGanttAssignment` interface:

```typescript
/** One row from the pairing_segment section of input.gz.
 *  All timestamps are ISO strings (UTC). Numeric IDs are numbers (parsed from CSV string).
 */
export interface ScenarioGanttPairingSegment {
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltDt: string | null          // "YYYY-MM-DD" or null
  schStrDtUtc: string           // flight departure UTC
  schEndDtUtc: string           // flight arrival UTC
  // Duty-level node times (same for all segs in the same duty)
  brief1StartUtc: string
  brief1EndUtc: string
  debrief1StartUtc: string
  debrief1EndUtc: string
  pickup1StartUtc: string
  pickup1EndUtc: string
  dropoff1StartUtc: string
  dropoff1EndUtc: string
  dutySchRestMin: number | null  // scheduled rest before this duty (minutes)
  dutyActRestMin: number | null
}
```

Then in `ScenarioGanttData`, add the new field after `assignments`:

```typescript
  pairingSegments: ScenarioGanttPairingSegment[]
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-gantt.ts"
```

Expected: errors about `pairingSegments` being missing from existing callers (will be fixed in Task 2). No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts
git commit -m "feat(gantt): ScenarioGanttPairingSegment type + extend ScenarioGanttData"
```

---

## Task 2: Parse pairing_segment in scenario-gantt-service + supply pairingSegments

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`

`parseSections` returns `Record<string, Record<string, string>[]>`. The `pairing_segment` key maps to rows whose string fields match the DB column names (snake_case).

- [ ] **Step 1: Add parsePairingSegments helper and update both path A + B**

Read the current file first:
```bash
cat /home/yuan.z/rois/rois-ai/live-server/src/services/scenario/scenario-gantt-service.ts
```

Then make the following changes:

**Add `parsePairingSegments` function** (after `parseOptAssignments`):

```typescript
function parsePairingSegments(inputGz: Buffer): import('../../../gantt/src/types/scenario-gantt.js' /* frontend only */) ScenarioGanttPairingSegment[] {
  // NOTE: this function lives in live-server — use the local interface shape, not the frontend type
  // Return type matches ScenarioGanttPairingSegment but declared inline
  const sections = parseSections(inputGz)
  return (sections['pairing_segment'] ?? []).map((r) => ({
    pairingId:        Number(r['pairing_id']),
    dutySeq:          Number(r['duty_seq']),
    segSeq:           Number(r['seg_seq']),
    fltId:            r['flt_id'] ? Number(r['flt_id']) : null,
    fltDt:            r['flt_dt'] || null,
    schStrDtUtc:      r['sch_str_dt_utc'] ?? '',
    schEndDtUtc:      r['sch_end_dt_utc'] ?? '',
    brief1StartUtc:   r['brief_1_start_utc'] ?? '',
    brief1EndUtc:     r['brief_1_end_utc'] ?? '',
    debrief1StartUtc: r['debrief_1_start_utc'] ?? '',
    debrief1EndUtc:   r['debrief_1_end_utc'] ?? '',
    pickup1StartUtc:  r['pickup_1_start_utc'] ?? '',
    pickup1EndUtc:    r['pickup_1_end_utc'] ?? '',
    dropoff1StartUtc: r['dropoff_1_start_utc'] ?? '',
    dropoff1EndUtc:   r['dropoff_1_end_utc'] ?? '',
    dutySchRestMin:   r['duty_sch_rest_min'] ? Number(r['duty_sch_rest_min']) : null,
    dutyActRestMin:   r['duty_act_rest_min'] ? Number(r['duty_act_rest_min']) : null,
  }))
}
```

**Note:** The return type annotation referencing the frontend file is wrong. Instead, define a local interface `PairingSegmentRow` in the live-server file that mirrors `ScenarioGanttPairingSegment`, and use it as the return type. Then include it in the `ScenarioGanttData` returned — since live-server and gantt share the same type via the API response shape.

The correct approach: just add `pairingSegments` to the returned object using `Record<string, unknown>[]`-style (the service already uses duck-typed objects). Here is the actual clean implementation:

Add this function (no import needed, types inferred):

```typescript
function parsePairingSegments(inputGz: Buffer) {
  const sections = parseSections(inputGz)
  return (sections['pairing_segment'] ?? []).map((r) => ({
    pairingId:        Number(r['pairing_id']),
    dutySeq:          Number(r['duty_seq']),
    segSeq:           Number(r['seg_seq']),
    fltId:            r['flt_id'] ? Number(r['flt_id']) : null,
    fltDt:            r['flt_dt'] || null,
    schStrDtUtc:      r['sch_str_dt_utc'] ?? '',
    schEndDtUtc:      r['sch_end_dt_utc'] ?? '',
    brief1StartUtc:   r['brief_1_start_utc'] ?? '',
    brief1EndUtc:     r['brief_1_end_utc'] ?? '',
    debrief1StartUtc: r['debrief_1_start_utc'] ?? '',
    debrief1EndUtc:   r['debrief_1_end_utc'] ?? '',
    pickup1StartUtc:  r['pickup_1_start_utc'] ?? '',
    pickup1EndUtc:    r['pickup_1_end_utc'] ?? '',
    dropoff1StartUtc: r['dropoff_1_start_utc'] ?? '',
    dropoff1EndUtc:   r['dropoff_1_end_utc'] ?? '',
    dutySchRestMin:   r['duty_sch_rest_min'] ? Number(r['duty_sch_rest_min']) : null,
    dutyActRestMin:   r['duty_act_rest_min'] ? Number(r['duty_act_rest_min']) : null,
  }))
}
```

**Update `buildGanttDataSnapshot` (path B):**

In `buildGanttDataSnapshot`, change the parallel fetch to also parse segments from the same `inputGz`:

```typescript
export async function buildGanttDataSnapshot(sc, token, airline) {
  const [inputGz, outputGz] = await Promise.all([
    engineServerClient.fetchInputFile(sc.taskId, token, airline, sc.id),
    engineServerClient.fetchResultFile(sc.taskId, token, airline, sc.id),
  ])

  const { crew, pairings } = parseCrewAndPairings(inputGz)
  const pairingSegments    = parsePairingSegments(inputGz)
  const assignments        = parseOptAssignments(outputGz)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    strDtLoc: new Date(sc.strDtLoc).toISOString(),
    endDtLoc: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'snapshot',
    crew,
    pairings,
    pairingSegments,
    assignments,
  }
}
```

**Update `buildGanttDataLiveRefresh` (path A):**

In `buildGanttDataLiveRefresh`, `buildRoInputGz` returns a `Buffer`. Parse segments from it:

```typescript
  const [inputGz, outputGz] = await Promise.all([
    buildRoInputGz(fastify, scenarioRow),
    engineServerClient.fetchResultFile(sc.taskId, token, airline, sc.id),
  ])

  const { crew, pairings } = parseCrewAndPairings(inputGz)
  const pairingSegments    = parsePairingSegments(inputGz)
  const optAssignments     = parseOptAssignments(outputGz)

  // ... lead-in logic unchanged ...

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    strDtLoc: new Date(sc.strDtLoc).toISOString(),
    endDtLoc: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'live-refresh',
    crew,
    pairings,
    pairingSegments,
    assignments: [...optAssignments, ...leadinAssignments],
  }
```

- [ ] **Step 2: Restart live-server**

```bash
~/rois/rois.sh restart live-server
```

- [ ] **Step 3: Smoke-test the API returns pairingSegments**

```bash
# Replace TOKEN and SCENARIO_ID with real values
curl -s -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/scenario/SCENARIO_ID/gantt-data \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('pairingSegments:', len(d['data']['pairingSegments']))"
```

Expected: a number > 0 (or 0 if scenario has no pairing_segment rows, which is also valid).

- [ ] **Step 4: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts
git commit -m "feat(live-server): parse pairing_segment from input.gz + include in gantt-data response"
```

---

## Task 3: Update ScenarioGanttCanvas — buildRosterItems + renderRosterTasks

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`

This is the core rendering change. We replace the manual pairing bar loop with `renderRosterTasks` from the Live Gantt renderer.

Key imports needed:
- `renderRosterTasks` from `@/components/gantt/renderers/roster-renderer`
- `RosterRenderContext` type from same
- `RosterItem` type from `@/types`
- `ScenarioGanttPairingSegment` type from `@/types/scenario-gantt`

- [ ] **Step 1: Rewrite scenario-gantt-canvas.tsx**

Replace the full file content with:

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
import { useRef, useEffect, useCallback } from 'react'
import {
  renderBase,
  drawHeaderBand,
  drawTimelineHeader,
} from '@/components/gantt/renderers/base-renderer'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import {
  renderRosterTasks,
} from '@/components/gantt/renderers/roster-renderer'
import type { RosterRenderContext } from '@/components/gantt/renderers/roster-renderer'
import type { RosterItem } from '@/types'
import {
  getGanttColors,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  SCROLLBAR_SIZE,
  SCROLLBAR_RADIUS,
} from '@/components/gantt/gantt-constants'
import { getVisibleRowRange } from '@/components/gantt/gantt-utils'
import type {
  ScenarioGanttCrew,
  ScenarioGanttPairing,
  ScenarioGanttAssignment,
  ScenarioGanttPairingSegment,
  AssignmentPatch,
} from '@/types/scenario-gantt'

interface ScenarioGanttCanvasProps {
  crew: ScenarioGanttCrew[]
  pairingMap: Map<number, ScenarioGanttPairing>
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  pendingChanges: AssignmentPatch[]
  rangeStart: Date
  rangeEnd: Date
  pxPerHour: number
  scrollX: number
  scrollY: number
  canEdit: boolean
  timezone: string
  onScrollY: (y: number) => void
  onScrollX: (x: number) => void
  onZoom: (pxPerHour: number) => void
  onRemove: (pairingId: number, crewId: string) => void
  onScrollYChange?: (y: number) => void
}

/** Apply pending patches to get the effective assignment list */
function buildEffectiveAssignments(
  assignments: ScenarioGanttAssignment[],
  pendingChanges: AssignmentPatch[],
): ScenarioGanttAssignment[] {
  let current = [...assignments]
  for (const p of pendingChanges) {
    if (p.op === 'remove') {
      current = current.filter((a) => !(a.crewId === p.crewId && a.pairingId === p.pairingId))
    } else if (p.op === 'add') {
      current.push({ crewId: p.crewId, pairingId: p.pairingId, source: 'opt' })
    } else if (p.op === 'reassign' && p.toCrewId) {
      current = current.map((a) =>
        a.crewId === p.crewId && a.pairingId === p.pairingId ? { ...a, crewId: p.toCrewId! } : a
      )
    }
  }
  return current
}

/**
 * Build RosterItem[] from scenario data so renderRosterTasks can be reused directly.
 * One RosterItem per pairing_segment row (flight-level granularity).
 * Falls back to one RosterItem per pairing when no segments exist.
 */
function buildRosterItems(
  assignments: ScenarioGanttAssignment[],
  pairingMap: Map<number, ScenarioGanttPairing>,
  pairingSegments: ScenarioGanttPairingSegment[],
  pendingChanges: AssignmentPatch[],
): { items: RosterItem[]; itemsByCrew: Map<string, RosterItem[]> } {
  const effective = buildEffectiveAssignments(assignments, pendingChanges)

  // Group segments by pairingId
  const segsByPairing = new Map<number, ScenarioGanttPairingSegment[]>()
  for (const seg of pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }

  const items: RosterItem[] = []
  const itemsByCrew = new Map<string, RosterItem[]>()
  let counter = 1

  for (const a of effective) {
    const pairing = pairingMap.get(a.pairingId)
    if (!pairing) continue

    const segs = (segsByPairing.get(a.pairingId) ?? []).sort(
      (x, y) => x.dutySeq !== y.dutySeq ? x.dutySeq - y.dutySeq : x.segSeq - y.segSeq
    )

    const makeBase = (): Omit<RosterItem, 'id' | 'schStrDtUtc' | 'schEndDtUtc' | 'actStrDtUtc' | 'actEndDtUtc' | 'fltId' | 'fltDt' | 'dutySeq' | 'segSeq'> => ({
      crewId: a.crewId,
      pairingId: a.pairingId,
      ver: 1,
      base: pairing.base,
      label: pairing.pairingLabel,
      assignmentGroup: pairing.assignmentGroup,
      assignment: pairing.assignment,
      role: null,
      subRole: null,
      source: a.source,
      isRequested: 0,
      isSwapped: 0,
      preference: null,
      comments: null,
      score: null,
      workingHour: null,
      division: pairing.division,
      actingRank: '',
      activeRank: null,
      position: null,
      schCreditedMinutes: null,
      actCreditedMinutes: null,
      tagSet: null,
      exceptionCode: null,
    })

    const addItem = (item: RosterItem) => {
      items.push(item)
      const bucket = itemsByCrew.get(a.crewId) ?? []
      bucket.push(item)
      itemsByCrew.set(a.crewId, bucket)
    }

    if (segs.length === 0) {
      // No segment data — one block for the whole pairing
      addItem({
        ...makeBase(),
        id: counter++,
        schStrDtUtc: pairing.schStrDtUtc,
        schEndDtUtc: pairing.schEndDtUtc,
        actStrDtUtc: pairing.schStrDtUtc,
        actEndDtUtc: pairing.schEndDtUtc,
        fltId: null,
        fltDt: null,
        dutySeq: null,
        segSeq: null,
      })
    } else {
      for (const seg of segs) {
        addItem({
          ...makeBase(),
          id: counter++,
          schStrDtUtc: seg.schStrDtUtc,
          schEndDtUtc: seg.schEndDtUtc,
          actStrDtUtc: seg.schStrDtUtc,
          actEndDtUtc: seg.schEndDtUtc,
          fltId: seg.fltId,
          fltDt: seg.fltDt,
          dutySeq: seg.dutySeq,
          segSeq: seg.segSeq,
          // Duty-level segment mode fields
          briefStartUtc: seg.brief1StartUtc || null,
          briefEndUtc: seg.brief1EndUtc || null,
          debriefStartUtc: seg.debrief1StartUtc || null,
          debriefEndUtc: seg.debrief1EndUtc || null,
          pickupStartUtc: seg.pickup1StartUtc || null,
          pickupEndUtc: seg.pickup1EndUtc || null,
          dropoffStartUtc: seg.dropoff1StartUtc || null,
          dropoffEndUtc: seg.dropoff1EndUtc || null,
          dutySchRestMin: seg.dutySchRestMin,
          dutyActRestMin: seg.dutyActRestMin,
        })
      }
    }
  }

  return { items, itemsByCrew }
}

export const ScenarioGanttCanvas = ({
  crew,
  pairingMap,
  assignments,
  pairingSegments,
  pendingChanges,
  rangeStart,
  rangeEnd,
  pxPerHour,
  scrollX,
  scrollY,
  canEdit,
  timezone,
  onScrollY,
  onScrollX,
  onZoom,
  onRemove,
  onScrollYChange,
}: ScenarioGanttCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })

  const propsRef = useRef({
    crew, pairingMap, assignments, pairingSegments, pendingChanges,
    rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit, timezone,
  })
  useEffect(() => {
    propsRef.current = {
      crew, pairingMap, assignments, pairingSegments, pendingChanges,
      rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit, timezone,
    }
  })

  // ── Canvas resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return

    const update = () => {
      const dpr  = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`
      dprRef.current  = dpr
      sizeRef.current = { width: w, height: h }
      drawFrame()
    }

    const ro = new ResizeObserver(update)
    ro.observe(container)
    update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draw ─────────────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = dprRef.current
    const { width, height } = sizeRef.current
    const p = propsRef.current
    const colors = getGanttColors()

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const totalRows = p.crew.length
    const rangeEndMs   = p.rangeEnd.getTime()
    const rangeStartMs = p.rangeStart.getTime()
    const totalMs      = Math.max(rangeEndMs - rangeStartMs, 1)
    const totalWidth   = (totalMs / 3_600_000) * p.pxPerHour

    const rc: BaseRenderContext = {
      ctx,
      dpr: 1,
      canvasWidth: width,
      canvasHeight: height,
      scrollX: p.scrollX,
      scrollY: p.scrollY,
      pxPerHour: p.pxPerHour,
      rangeStart: p.rangeStart,
      rangeEnd: p.rangeEnd,
      totalRows,
      dropTargetRow: -1,
      frozenRowCount: 0,
      selectedRowIndices: new Set(),
      timezone: p.timezone,
    }

    // Base layers
    renderBase(rc)
    drawHeaderBand(rc)
    drawTimelineHeader(rc, [])

    // Build roster items from scenario data
    const { items, itemsByCrew } = buildRosterItems(
      p.assignments, p.pairingMap, p.pairingSegments, p.pendingChanges,
    )

    // Roster task rendering (same as Live Gantt)
    const rrc: RosterRenderContext = {
      ...rc,
      crewIds: p.crew.map((c) => c.crewId),
      items,
      itemsByCrew,
      selectedTaskIds: new Set(),
      hoveredTaskId: null,
      violationMap: new Map(),
      lockMap: new Map(),
      crewSessionTags: new Map(),
      showSessionTags: false,
      timezone: p.timezone,
    }

    renderRosterTasks(rrc)

    // Vertical scrollbar
    if (totalRows * ROW_HEIGHT > height - HEADER_HEIGHT) {
      const trackH  = height - HEADER_HEIGHT
      const thumbH  = Math.max(20, (trackH / (totalRows * ROW_HEIGHT)) * trackH)
      const thumbY  = HEADER_HEIGHT + (p.scrollY / Math.max(1, totalRows * ROW_HEIGHT - trackH)) * (trackH - thumbH)
      ctx.fillStyle = colors.scrollbarColor
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH, SCROLLBAR_RADIUS)
      } else {
        ctx.rect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH)
      }
      ctx.fill()
    }

    // Horizontal scrollbar
    if (totalWidth > width) {
      const trackW  = width
      const thumbW  = Math.max(20, (width / totalWidth) * trackW)
      const thumbX  = (p.scrollX / Math.max(1, totalWidth - width)) * (trackW - thumbW)
      ctx.fillStyle = colors.scrollbarColor
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(thumbX, height - SCROLLBAR_SIZE - 2, thumbW, SCROLLBAR_SIZE, SCROLLBAR_RADIUS)
      } else {
        ctx.rect(thumbX, height - SCROLLBAR_SIZE - 2, thumbW, SCROLLBAR_SIZE)
      }
      ctx.fill()
    }
  }, [])

  // Redraw on prop change
  useEffect(() => { drawFrame() })

  // ── Interactions ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      onZoom(propsRef.current.pxPerHour * factor)
    } else if (e.shiftKey) {
      onScrollX(propsRef.current.scrollX + e.deltaY)
    } else {
      const maxScrollY = Math.max(0, propsRef.current.crew.length * ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
      const nextY = Math.max(0, Math.min(maxScrollY, propsRef.current.scrollY + e.deltaY))
      onScrollY(nextY)
      onScrollYChange?.(nextY)
    }
  }, [onScrollX, onScrollY, onZoom, onScrollYChange])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!propsRef.current.canEdit) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const y = e.clientY - rect.top + propsRef.current.scrollY - HEADER_HEIGHT
    const rowIndex = Math.floor(y / ROW_HEIGHT)
    const clickedCrew = propsRef.current.crew[rowIndex]
    if (!clickedCrew) return

    // Find any assignment for this crew at the clicked X position
    const { items } = buildRosterItems(
      propsRef.current.assignments, propsRef.current.pairingMap,
      propsRef.current.pairingSegments, propsRef.current.pendingChanges,
    )
    const crewItems = items.filter((it) => it.crewId === clickedCrew.crewId)
    // Any pairing on this crew is a valid target for remove via context menu
    if (crewItems.length > 0 && crewItems[0].pairingId !== null) {
      onRemove(crewItems[0].pairingId!, clickedCrew.crewId)
    }
  }, [onRemove])

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden" data-testid="sg-canvas">
      <canvas
        ref={canvasRef}
        className="block"
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
    </div>
  )
}
```

- [ ] **Step 2: Fix TypeScript errors**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-gantt-canvas\|RosterItem\|RosterRenderContext" | head -20
```

Fix any errors before committing. Common issues:
- `RosterItem.actRestMin` optional field: add `actRestMin: null` to the item objects if needed
- `RosterRenderContext` may require additional fields from `BaseRenderContext` — `...rc` spread should cover them

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
git commit -m "feat(gantt): ScenarioGanttCanvas — use renderRosterTasks with pairing_segment data"
```

---

## Task 4: Update ScenarioGanttView to pass pairingSegments + timezone

**Files:**
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`

The view needs to:
1. Read `data.pairingSegments` from the store
2. Read `timezone` from `useTimezoneStore`
3. Pass both to `ScenarioGanttCanvas`

- [ ] **Step 1: Add imports and wire pairingSegments + timezone**

At the top of the file, add:
```typescript
import { useTimezoneStore } from '@/stores/timezone-store'
import type { ScenarioGanttPairingSegment } from '@/types/scenario-gantt'
```

Inside `ScenarioGanttView`, add:
```typescript
  const timezone = useTimezoneStore((s) => s.timezone)
```

Pass to `ScenarioGanttCanvas` (find the `<ScenarioGanttCanvas` JSX and add):
```tsx
          pairingSegments={data.pairingSegments as ScenarioGanttPairingSegment[]}
          timezone={timezone}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-gantt-view\|pairingSegments\|timezone" | head -10
```

Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): ScenarioGanttView — pass pairingSegments + timezone to canvas"
```

---

## Task 5: Add Zoom In/Out + TimezoneSwitcher to toolbar

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx`

The existing `ZoomControl` component uses `useGanttViewStore` (global) — can't reuse directly. We add inline zoom buttons that accept callbacks. `TimezoneSwitcher` uses `useTimezoneStore` (global) and can be imported as-is.

- [ ] **Step 1: Update toolbar**

Add to the import section:
```typescript
import { ZoomIn, ZoomOut } from 'lucide-react'
import { TimezoneSwitcher } from '@/components/common/timezone-switcher'
```

Add two new props to `ScenarioGanttToolbarProps`:
```typescript
  pxPerHour: number
  onZoomIn: () => void
  onZoomOut: () => void
```

Inside the toolbar JSX, find `<div className="flex-1" />` and insert before `<TooltipProvider`:

```tsx
      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-100"
              onClick={onZoomIn}
              data-testid="sg-zoom-in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom In (Ctrl+scroll)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-100"
              onClick={onZoomOut}
              data-testid="sg-zoom-out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom Out (Ctrl+scroll)</TooltipContent>
        </Tooltip>
      </div>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Timezone selector (shared with Live Gantt) */}
      <TimezoneSwitcher />

      <div className="mx-1 h-3.5 w-px bg-border" />
```

- [ ] **Step 2: Pass zoom handlers from ScenarioGanttView**

In `gantt/src/components/shell/scenario-gantt-view.tsx`, update the `<ScenarioGanttToolbar` usage:

```tsx
      <ScenarioGanttToolbar
        data={data}
        lockStatus={lockStatus}
        isDirty={isDirty}
        saving={saving}
        acquiringLock={acquiringLock}
        filterText={filterText}
        pxPerHour={pxPerHour}
        onFilterChange={setFilterText}
        onAcquireLock={() => void acquireLock(scenarioId)}
        onReleaseLock={() => void releaseLock(scenarioId)}
        onSave={() => void save(scenarioId)}
        onZoomIn={() => setZoom(pxPerHour * 1.3)}
        onZoomOut={() => setZoom(pxPerHour / 1.3)}
      />
```

- [ ] **Step 3: TypeScript check (full project)**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -20
```

Expected: zero errors from modified files.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx \
        gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): ScenarioGanttToolbar — add Zoom In/Out + TimezoneSwitcher"
```

---

## Task 6: Build + deploy + version bump

- [ ] **Step 1: Full TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -20
```

Expected: no errors from scenario-gantt files.

- [ ] **Step 2: Production build**

```bash
~/rois/rois.sh build gantt 2>&1 | tail -8
```

Expected: `✓ [gantt] 完成`.

- [ ] **Step 3: Version bump — increment FRONTEND_VERSION by 1**

```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/version.ts
# Then edit the file to increment FRONTEND_VERSION
```

- [ ] **Step 4: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version (scenario-gantt renderRosterTasks + zoom + timezone)"
```
