# Scenario Gantt V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V1 React-DOM Scenario Gantt renderer with a Canvas-based renderer that matches Live Gantt visually, fix the missing top-nav tabs, and add per-instance zoom/filter state.

**Architecture:** Standalone `ScenarioGanttCanvas` + `ScenarioGanttLeftPanel` components that reuse Live Gantt rendering utilities (`renderBase`, `drawHeaderBand`, `drawTimelineHeader`, `getGanttColors`, `timeToX`, `getVisibleRowRange`) without coupling to Live Gantt stores. Per-instance Zustand store (already exists) gains `pxPerHour`, `scrollX`, `filterText`, `leftPanelWidth`. Top nav gets a dynamic-tab section that renders open `scenario-gantt:*` tabs. Backend unchanged.

**Tech Stack:** React 19 / TypeScript / Canvas 2D API / Zustand / Playwright (E2E) — gantt frontend only

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `gantt/src/stores/scenario-gantt-store.ts` | Add view state: pxPerHour, scrollX, filterText, leftPanelWidth + setters |
| Modify | `gantt/src/components/shell/shell-top-nav.tsx` | Render dynamic scenario-gantt tabs |
| **New** | `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` | Standalone Canvas renderer (resize, scroll, zoom, draw loop) |
| **New** | `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx` | Left crew-list Canvas, synced scrollY |
| Rewrite | `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` | Simplified: search + lock + save only |
| Rewrite | `gantt/src/components/shell/scenario-gantt-view.tsx` | Compose left panel + canvas + toolbar |
| Delete | `gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx` | Replaced by Canvas drawing |
| Delete | `gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx` | Replaced by Canvas drawing |
| Update | `e2e/tests/gantt/scenario-gantt-open.spec.ts` | Verify testids still match |

---

## Task 1: Extend scenario-gantt-store with view state

**Files:**
- Modify: `gantt/src/stores/scenario-gantt-store.ts`

- [ ] **Step 1: Add view state fields and actions to the store interface and factory**

Replace the full file content of `gantt/src/stores/scenario-gantt-store.ts`:

```typescript
// gantt/src/stores/scenario-gantt-store.ts
import { create } from 'zustand'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { notify } from '@/utils/notify'
import type { ScenarioGanttData, AssignmentPatch, LockStatus } from '@/types/scenario-gantt'

interface ScenarioGanttStore {
  // Data
  data: ScenarioGanttData | null
  loading: boolean
  error: string | null

  // Edit state
  pendingChanges: AssignmentPatch[]
  isDirty: boolean
  saving: boolean

  // Lock
  lockStatus: LockStatus | null
  acquiringLock: boolean

  // View state (per-instance, independent across tabs)
  pxPerHour: number
  scrollX: number
  filterText: string
  leftPanelWidth: number

  // Actions
  loadData: (scenarioId: number) => Promise<void>
  acquireLock: (scenarioId: number) => Promise<void>
  releaseLock: (scenarioId: number) => Promise<void>
  refreshLock: (scenarioId: number) => Promise<void>
  addPatch: (patch: AssignmentPatch) => void
  clearPatches: () => void
  save: (scenarioId: number) => Promise<void>
  setZoom: (pxPerHour: number) => void
  setScrollX: (x: number) => void
  setFilterText: (text: string) => void
  setLeftPanelWidth: (w: number) => void
}

function createStore(scenarioId: number) {
  return create<ScenarioGanttStore>((set, get) => ({
    data: null,
    loading: false,
    error: null,
    pendingChanges: [],
    isDirty: false,
    saving: false,
    lockStatus: null,
    acquiringLock: false,

    // View defaults
    pxPerHour: 40,
    scrollX: 0,
    filterText: '',
    leftPanelWidth: 200,

    loadData: async () => {
      set({ loading: true, error: null })
      try {
        const data = await scenarioGanttApi.getGanttData(scenarioId)
        set({ data, loading: false })
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    acquireLock: async () => {
      set({ acquiringLock: true })
      try {
        const result = await scenarioGanttApi.acquireLock(scenarioId)
        if (result.acquired) {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
          notify.success('Edit lock acquired')
        } else {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
          notify.error(`Lock held by ${status.owner ?? 'another user'}`)
        }
      } catch (err) {
        set({ acquiringLock: false })
        notify.error((err as Error).message)
      }
    },

    releaseLock: async () => {
      try {
        await scenarioGanttApi.releaseLock(scenarioId)
        set({ lockStatus: { locked: false, owner: null, ttl: null, isOwner: false }, pendingChanges: [], isDirty: false })
        notify.success('Edit lock released')
      } catch (err) {
        notify.error((err as Error).message)
      }
    },

    refreshLock: async () => {
      try {
        const status = await scenarioGanttApi.getLockStatus(scenarioId)
        set({ lockStatus: status })
      } catch { /* silent */ }
    },

    addPatch: (patch) => {
      set((s) => ({ pendingChanges: [...s.pendingChanges, patch], isDirty: true }))
    },

    clearPatches: () => set({ pendingChanges: [], isDirty: false }),

    save: async () => {
      const { pendingChanges } = get()
      if (pendingChanges.length === 0) return
      set({ saving: true })
      try {
        await scenarioGanttApi.patchOutput(scenarioId, pendingChanges)
        const data = await scenarioGanttApi.getGanttData(scenarioId)
        set({ data, pendingChanges: [], isDirty: false, saving: false })
        notify.success('Scenario adjustments saved')
      } catch (err) {
        set({ saving: false })
        notify.error((err as Error).message)
      }
    },

    setZoom: (pxPerHour) => set({ pxPerHour: Math.max(8, Math.min(200, pxPerHour)) }),
    setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
    setFilterText: (filterText) => set({ filterText }),
    setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(120, Math.min(400, w)) }),
  }))
}

// Registry: one store per scenarioId
const registry = new Map<number, ReturnType<typeof createStore>>()

export function getScenarioGanttStore(scenarioId: number) {
  if (!registry.has(scenarioId)) {
    registry.set(scenarioId, createStore(scenarioId))
  }
  return registry.get(scenarioId)!
}

export function destroyScenarioGanttStore(scenarioId: number) {
  registry.delete(scenarioId)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep "scenario-gantt-store"
```

Expected: no errors from `scenario-gantt-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/scenario-gantt-store.ts
git commit -m "feat(gantt): scenario-gantt-store — add pxPerHour, scrollX, filterText, leftPanelWidth"
```

---

## Task 2: Fix top-nav dynamic scenario tabs

**Files:**
- Modify: `gantt/src/components/shell/shell-top-nav.tsx`

- [ ] **Step 1: Add dynamic tab section after static nav items**

In `shell-top-nav.tsx`, add the following import at the top (after existing imports):

```typescript
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
```

Then find the block that closes after the `NAV_ITEMS.map(...)` block and the `<div className="flex-1" />` line. Insert a `NavDivider` and the dynamic tabs between them:

Replace this section:

```tsx
        <div className="flex-1" />
```

With:

```tsx
        {/* Dynamic scenario-gantt tabs */}
        {openTabs.some((t) => t.startsWith('scenario-gantt:')) && (
          <NavDivider />
        )}
        {openTabs
          .filter((t) => t.startsWith('scenario-gantt:'))
          .map((module) => {
            const scenarioId = Number(module.slice('scenario-gantt:'.length))
            const isActive = module === activeModule
            // Read scenario name from the per-instance store (null-safe: store may not exist yet)
            const scenarioName = Number.isNaN(scenarioId)
              ? null
              : getScenarioGanttStore(scenarioId).getState().data?.scenarioName ?? null
            const label = scenarioName ?? `Scenario #${scenarioId}`
            return (
              <div
                key={module}
                data-testid={`module-tab-${module}`}
                className={[
                  'group flex h-[28px] shrink-0 items-center gap-1 rounded-sm text-[11.5px] font-medium whitespace-nowrap transition-all duration-100 pl-2 pr-1.5',
                  isActive
                    ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-teal-600/60 dark:text-teal-400/60 hover:bg-teal-500/10 hover:text-teal-600 dark:hover:text-teal-400',
                ].join(' ')}
              >
                <button
                  className="flex items-center gap-1.5 max-w-[140px]"
                  onClick={() => setModule(module)}
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(module)
                    destroyScenarioGanttStore(scenarioId)
                  }}
                  className={[
                    'ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-all duration-100',
                    isActive
                      ? 'text-teal-500/60 hover:bg-muted hover:text-foreground'
                      : 'text-teal-500/30 opacity-0 group-hover:opacity-100 hover:bg-muted/60 hover:text-foreground',
                  ].join(' ')}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </div>
            )
          })}

        <div className="flex-1" />
```

Also add `destroyScenarioGanttStore` to the existing import from scenario-gantt-store (added in Step 1 above) — verify it's imported.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep "shell-top-nav"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/shell/shell-top-nav.tsx
git commit -m "fix(gantt): render dynamic scenario-gantt tabs in ShellTopNav"
```

---

## Task 3: Create ScenarioGanttCanvas

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`

- [ ] **Step 1: Create the canvas component**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
import { useRef, useEffect, useCallback } from 'react'
import { parseISO } from 'date-fns'
import {
  renderBase,
  drawHeaderBand,
  drawTimelineHeader,
} from '@/components/gantt/renderers/base-renderer'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import {
  getGanttColors,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  TASK_HEIGHT,
  TASK_PADDING,
  MIN_TASK_WIDTH,
  FONT_FAMILY,
  FONT_SIZE_TASK,
  SCROLLBAR_SIZE,
  SCROLLBAR_RADIUS,
} from '@/components/gantt/gantt-constants'
import { timeToX, getVisibleRowRange, rowY } from '@/components/gantt/gantt-utils'
import type { ScenarioGanttCrew, ScenarioGanttPairing, ScenarioGanttAssignment, AssignmentPatch } from '@/types/scenario-gantt'

interface ScenarioGanttCanvasProps {
  crew: ScenarioGanttCrew[]          // already filtered
  pairingMap: Map<number, ScenarioGanttPairing>
  assignments: ScenarioGanttAssignment[]
  pendingChanges: AssignmentPatch[]
  rangeStart: Date
  rangeEnd: Date
  pxPerHour: number
  scrollX: number
  scrollY: number
  canEdit: boolean
  onScrollY: (y: number) => void
  onScrollX: (x: number) => void
  onZoom: (pxPerHour: number) => void
  onRemove: (pairingId: number, crewId: string) => void
  onScrollYChange?: (y: number) => void  // for syncing left panel
}

/** Build crewId → effective assignments map, applying pending patches */
function buildEffectiveAssignments(
  assignments: ScenarioGanttAssignment[],
  pendingChanges: AssignmentPatch[],
): Map<string, ScenarioGanttAssignment[]> {
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
  const map = new Map<string, ScenarioGanttAssignment[]>()
  for (const a of current) {
    const list = map.get(a.crewId) ?? []
    list.push(a)
    map.set(a.crewId, list)
  }
  return map
}

/** Set of "crewId:pairingId" pending removes for quick lookup */
function buildPendingRemoveSet(pendingChanges: AssignmentPatch[]): Set<string> {
  const s = new Set<string>()
  for (const p of pendingChanges) {
    if (p.op === 'remove') s.add(`${p.crewId}:${p.pairingId}`)
  }
  return s
}

export const ScenarioGanttCanvas = ({
  crew,
  pairingMap,
  assignments,
  pendingChanges,
  rangeStart,
  rangeEnd,
  pxPerHour,
  scrollX,
  scrollY,
  canEdit,
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

  // Keep latest props in refs so RAF callback doesn't need to re-register
  const propsRef = useRef({
    crew, pairingMap, assignments, pendingChanges,
    rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit,
  })
  useEffect(() => {
    propsRef.current = {
      crew, pairingMap, assignments, pendingChanges,
      rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit,
    }
  })

  // ── Canvas resize ──────────────────────────────────────────────────────────
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

  // ── Draw ────────────────────────────────────────────────────────────────────
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

    const totalRows  = p.crew.length
    const rangeStartMs = p.rangeStart.getTime()
    const rangeEndMs   = p.rangeEnd.getTime()
    const totalMs      = Math.max(rangeEndMs - rangeStartMs, 1)
    const totalWidth   = (totalMs / 3_600_000) * p.pxPerHour

    const rc: BaseRenderContext = {
      ctx,
      dpr: 1,               // already scaled via setTransform
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
      timezone: 'UTC',
    }

    // Base layers (background, weekend, today, grid, now-line)
    renderBase(rc)
    // Header background + time labels
    drawHeaderBand(rc)
    drawTimelineHeader(rc, [])

    // Pairing bars
    const effectiveMap  = buildEffectiveAssignments(p.assignments, p.pendingChanges)
    const pendingRemove = buildPendingRemoveSet(p.pendingChanges)
    const { first, last } = getVisibleRowRange(p.scrollY, height, totalRows)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT)
    ctx.clip()

    for (let i = first; i <= last; i++) {
      const crew = p.crew[i]
      if (!crew) continue
      const ry = rowY(i, p.scrollY, 0)
      const rowAssignments = effectiveMap.get(crew.crewId) ?? []

      for (const a of rowAssignments) {
        const pairing = p.pairingMap.get(a.pairingId)
        if (!pairing) continue

        const barLeft = timeToX(pairing.schStrDtUtc, p.rangeStart, p.pxPerHour) - p.scrollX
        const barRight = timeToX(pairing.schEndDtUtc, p.rangeStart, p.pxPerHour) - p.scrollX
        const barWidth = Math.max(MIN_TASK_WIDTH, barRight - barLeft)

        // Skip entirely off-screen bars
        if (barLeft > width || barRight < 0) continue

        const barY = ry + TASK_PADDING
        const isPendingRemove = pendingRemove.has(`${crew.crewId}:${a.pairingId}`)

        // Colors by source / pending state
        let bgColor: string
        let borderColor: string
        if (isPendingRemove) {
          bgColor = 'rgba(239,68,68,0.12)'
          borderColor = '#ef4444'
        } else if (a.source === 'leadin') {
          bgColor = 'rgba(34,197,94,0.18)'
          borderColor = 'rgba(34,197,94,0.70)'
        } else {
          bgColor = 'rgba(59,130,246,0.18)'
          borderColor = 'rgba(59,130,246,0.70)'
        }

        ctx.fillStyle = bgColor
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.setLineDash(isPendingRemove ? [4, 3] : [])
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(barLeft, barY, barWidth, TASK_HEIGHT, 3)
        } else {
          ctx.rect(barLeft, barY, barWidth, TASK_HEIGHT)
        }
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])

        // Label (only if bar is wide enough)
        if (barWidth > 24) {
          ctx.fillStyle = colors.textColor
          ctx.font = `${FONT_SIZE_TASK}px ${FONT_FAMILY}`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'left'
          const label = pairing.pairingLabel ?? `P${pairing.pairingId}`
          ctx.fillText(label, barLeft + 4, barY + TASK_HEIGHT / 2, barWidth - 8)
        }
      }
    }

    ctx.restore()

    // Vertical scrollbar
    if (totalRows * ROW_HEIGHT > height - HEADER_HEIGHT) {
      const trackH  = height - HEADER_HEIGHT
      const thumbH  = Math.max(20, (trackH / (totalRows * ROW_HEIGHT)) * trackH)
      const thumbY  = HEADER_HEIGHT + (p.scrollY / (totalRows * ROW_HEIGHT - trackH)) * (trackH - thumbH)
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
      const thumbX  = (p.scrollX / (totalWidth - width)) * (trackW - thumbW)
      ctx.fillStyle = colors.scrollbarColor
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(thumbX, height - SCROLLBAR_SIZE - 2, thumbW, SCROLLBAR_SIZE, SCROLLBAR_RADIUS)
      } else {
        ctx.rect(thumbX, height - SCROLLBAR_SIZE - 2, thumbW, SCROLLBAR_SIZE)
      }
      ctx.fill()
    }
  }, []) // props accessed via ref

  // Redraw when any prop changes
  useEffect(() => { drawFrame() })

  // ── Interactions ────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      onZoom(propsRef.current.pxPerHour * factor)
    } else if (e.shiftKey) {
      // Horizontal scroll
      onScrollX(propsRef.current.scrollX + e.deltaY)
    } else {
      // Vertical scroll
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
    const x = e.clientX - rect.left + propsRef.current.scrollX
    const y = e.clientY - rect.top + propsRef.current.scrollY - HEADER_HEIGHT

    const rowIndex = Math.floor(y / ROW_HEIGHT)
    const clickedCrew = propsRef.current.crew[rowIndex]
    if (!clickedCrew) return

    const effectiveMap = buildEffectiveAssignments(propsRef.current.assignments, propsRef.current.pendingChanges)
    const rowAssignments = effectiveMap.get(clickedCrew.crewId) ?? []

    for (const a of rowAssignments) {
      const pairing = propsRef.current.pairingMap.get(a.pairingId)
      if (!pairing) continue
      const barLeft = timeToX(pairing.schStrDtUtc, propsRef.current.rangeStart, propsRef.current.pxPerHour)
      const barRight = timeToX(pairing.schEndDtUtc, propsRef.current.rangeStart, propsRef.current.pxPerHour)
      if (x >= barLeft && x <= barRight) {
        onRemove(a.pairingId, clickedCrew.crewId)
        return
      }
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep "scenario-gantt-canvas"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
git commit -m "feat(gantt): ScenarioGanttCanvas — standalone Canvas renderer with scroll/zoom"
```

---

## Task 4: Create ScenarioGanttLeftPanel

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx`

- [ ] **Step 1: Create the left panel canvas component**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx
import { useRef, useEffect, useCallback } from 'react'
import {
  getGanttColors,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  FONT_FAMILY,
  FONT_SIZE_PANEL,
  FONT_SIZE_PANEL_HEADER,
} from '@/components/gantt/gantt-constants'
import type { ScenarioGanttCrew } from '@/types/scenario-gantt'

interface ScenarioGanttLeftPanelProps {
  crew: ScenarioGanttCrew[]   // already filtered
  scrollY: number
  width: number
  onScrollY: (y: number) => void
}

export const ScenarioGanttLeftPanel = ({
  crew,
  scrollY,
  width,
  onScrollY,
}: ScenarioGanttLeftPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })

  const propsRef = useRef({ crew, scrollY, width })
  useEffect(() => { propsRef.current = { crew, scrollY, width } })

  // ── Resize ──────────────────────────────────────────────────────────────────
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

  // ── Draw ────────────────────────────────────────────────────────────────────
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

    // Header background
    ctx.fillStyle = colors.bgColorPanelHeader
    ctx.fillRect(0, 0, width, HEADER_HEIGHT)

    // Header label
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `bold ${FONT_SIZE_PANEL_HEADER}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('Crew', 12, HEADER_HEIGHT / 2)

    // Separator line below header
    ctx.fillStyle = colors.gridColor
    ctx.fillRect(0, HEADER_HEIGHT - 1, width, 1)

    // Crew rows
    const startRow = Math.max(0, Math.floor(p.scrollY / ROW_HEIGHT))
    const endRow   = Math.min(p.crew.length - 1, Math.ceil((p.scrollY + height - HEADER_HEIGHT) / ROW_HEIGHT))

    for (let i = startRow; i <= endRow; i++) {
      const c = p.crew[i]
      if (!c) continue
      const y = HEADER_HEIGHT + i * ROW_HEIGHT - p.scrollY

      // Row background (alternating)
      ctx.fillStyle = i % 2 === 0 ? colors.bgColor : colors.bgColorAlt
      ctx.fillRect(0, y, width, ROW_HEIGHT)

      // Row separator
      ctx.fillStyle = colors.gridColor
      ctx.fillRect(0, y + ROW_HEIGHT - 1, width, 1)

      // Crew ID (primary)
      ctx.fillStyle = colors.textColor
      ctx.font = `bold ${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(c.crewId, 12, y + 6, width - 24)

      // Base · Rank (secondary)
      ctx.fillStyle = colors.textColorSecondary
      ctx.font = `${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      const sub = [c.base, c.rank].filter(Boolean).join(' · ')
      ctx.fillText(sub, 12, y + 20, width - 24)
    }

    // Right border
    ctx.fillStyle = colors.gridColor
    ctx.fillRect(width - 1, 0, 1, height)
  }, [])

  // Redraw on prop change
  useEffect(() => { drawFrame() })

  // ── Wheel scroll ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const maxScrollY = Math.max(0, propsRef.current.crew.length * ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
    const nextY = Math.max(0, Math.min(maxScrollY, propsRef.current.scrollY + e.deltaY))
    onScrollY(nextY)
  }, [onScrollY])

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 overflow-hidden"
      style={{ width }}
      data-testid="sg-left-panel"
    >
      <canvas
        ref={canvasRef}
        className="block"
        onWheel={handleWheel}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep "scenario-gantt-left-panel"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx
git commit -m "feat(gantt): ScenarioGanttLeftPanel — crew list Canvas synced to main scroll"
```

---

## Task 5: Rewrite ScenarioGanttToolbar

**Files:**
- Rewrite: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx`

- [ ] **Step 1: Write the simplified toolbar**

```tsx
// gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx
import type { ReactNode } from 'react'
import { Loader2, Save, Lock, Unlock, Eye, Search } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider, Input } from '@rois/ui'
import { cn } from '@rois/ui'
import type { ScenarioGanttData, LockStatus } from '@/types/scenario-gantt'

interface ScenarioGanttToolbarProps {
  data: ScenarioGanttData
  lockStatus: LockStatus | null
  isDirty: boolean
  saving: boolean
  acquiringLock: boolean
  filterText: string
  onFilterChange: (text: string) => void
  onAcquireLock: () => void
  onReleaseLock: () => void
  onSave: () => void
}

export const ScenarioGanttToolbar = ({
  data,
  lockStatus,
  isDirty,
  saving,
  acquiringLock,
  filterText,
  onFilterChange,
  onAcquireLock,
  onReleaseLock,
  onSave,
}: ScenarioGanttToolbarProps): ReactNode => {
  const isOwner  = lockStatus?.isOwner ?? false
  const isLocked = lockStatus?.locked  ?? false
  const lockedBy = lockStatus?.owner   ?? null

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      data-testid="scenario-gantt-toolbar"
    >
      {/* Scenario badge */}
      <span className="rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-widest bg-teal-500/15 text-teal-400">
        Scenario
      </span>

      {/* Scenario name */}
      <span className="text-xs font-semibold text-foreground" data-testid="sg-scenario-name">
        {data.scenarioName ?? `Scenario #${data.scenarioId}`}
      </span>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Data source badge */}
      {data.dataSource === 'live-refresh'
        ? <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400">Live Context</span>
        : <span className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-blue-500/15 text-blue-400">Snapshot</span>
      }

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Crew search */}
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search crew…"
          className="h-6 w-36 pl-6 text-xs"
          data-testid="sg-filter-input"
        />
      </div>

      <div className="flex-1" />

      <TooltipProvider delayDuration={300}>
        {/* Save button (only when owner + dirty) */}
        {isOwner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 w-7 p-0', isDirty && !saving && 'text-primary')}
                disabled={!isDirty || saving}
                onClick={onSave}
                data-testid="sg-save-btn"
              >
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {saving ? 'Saving…' : isDirty ? 'Save adjustments' : 'Saved'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Lock control */}
        {isOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-amber-400 hover:text-amber-500"
                onClick={onReleaseLock}
                data-testid="sg-release-lock-btn"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span className="text-2xs font-semibold">Editing</span>
                {lockStatus?.ttl != null && (
                  <span className="text-2xs text-amber-400/70">{Math.round(lockStatus.ttl / 60)}m</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Release edit lock</TooltipContent>
          </Tooltip>
        ) : isLocked ? (
          <div className="flex items-center gap-1.5 rounded border border-red-500/25 bg-red-500/10 px-2 py-0.5">
            <Lock className="h-3 w-3 text-red-400" />
            <span className="text-2xs font-semibold text-red-400">Locked by {lockedBy}</span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                disabled={acquiringLock}
                onClick={onAcquireLock}
                data-testid="sg-acquire-lock-btn"
              >
                {acquiringLock
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eye className="h-3.5 w-3.5" />}
                <span className="text-2xs">Viewing · Read-only</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Acquire edit lock</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep "scenario-gantt-toolbar"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx
git commit -m "feat(gantt): ScenarioGanttToolbar — simplified: search + lock + save only"
```

---

## Task 6: Rewrite ScenarioGanttView

**Files:**
- Rewrite: `gantt/src/components/shell/scenario-gantt-view.tsx`

- [ ] **Step 1: Write the new view**

```tsx
// gantt/src/components/shell/scenario-gantt-view.tsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { ScenarioGanttToolbar } from '@/components/scenario-gantt/scenario-gantt-toolbar'
import { ScenarioGanttCanvas } from '@/components/scenario-gantt/scenario-gantt-canvas'
import { ScenarioGanttLeftPanel } from '@/components/scenario-gantt/scenario-gantt-left-panel'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import type {
  ScenarioGanttCrew, ScenarioGanttPairing,
  ScenarioGanttAssignment, AssignmentPatch,
} from '@/types/scenario-gantt'

const LOCK_POLL_MS      = 30_000
const LOCK_KEEPALIVE_MS = 5 * 60_000

function matchesCrew(c: ScenarioGanttCrew, text: string): boolean {
  if (!text) return true
  const q = text.toLowerCase()
  return (
    c.crewId.toLowerCase().includes(q) ||
    c.base.toLowerCase().includes(q) ||
    c.rank.toLowerCase().includes(q)
  )
}

const PanelSplitter = ({ onDrag }: { onDrag: (dx: number) => void }) => {
  const isDragging = useRef(false)
  const startX     = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      onDrag(ev.clientX - startX.current)
      startX.current = ev.clientX
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onDrag])

  return (
    <div
      className="shrink-0 w-0.5 cursor-col-resize bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors"
      onMouseDown={handleMouseDown}
    />
  )
}

export const ScenarioGanttView = ({ scenarioId }: { scenarioId: number }): ReactNode => {
  const useStore = getScenarioGanttStore(scenarioId)

  const data           = useStore((s) => s.data)
  const loading        = useStore((s) => s.loading)
  const error          = useStore((s) => s.error)
  const pendingChanges = useStore((s) => s.pendingChanges)
  const isDirty        = useStore((s) => s.isDirty)
  const saving         = useStore((s) => s.saving)
  const lockStatus     = useStore((s) => s.lockStatus)
  const acquiringLock  = useStore((s) => s.acquiringLock)
  const pxPerHour      = useStore((s) => s.pxPerHour)
  const scrollX        = useStore((s) => s.scrollX)
  const filterText     = useStore((s) => s.filterText)
  const leftPanelWidth = useStore((s) => s.leftPanelWidth)

  const loadData          = useStore((s) => s.loadData)
  const acquireLock       = useStore((s) => s.acquireLock)
  const releaseLock       = useStore((s) => s.releaseLock)
  const refreshLock       = useStore((s) => s.refreshLock)
  const addPatch          = useStore((s) => s.addPatch)
  const save              = useStore((s) => s.save)
  const setZoom           = useStore((s) => s.setZoom)
  const setScrollX        = useStore((s) => s.setScrollX)
  const setFilterText     = useStore((s) => s.setFilterText)
  const setLeftPanelWidth = useStore((s) => s.setLeftPanelWidth)

  // scrollY is high-frequency (every scroll tick) — keep local, not in Zustand
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    void loadData(scenarioId)
    return () => {
      const s = getScenarioGanttStore(scenarioId).getState()
      if (s.lockStatus?.isOwner) void s.releaseLock(scenarioId)
      destroyScenarioGanttStore(scenarioId)
    }
  }, [scenarioId, loadData])

  useEffect(() => {
    const id = setInterval(() => void refreshLock(scenarioId), LOCK_POLL_MS)
    return () => clearInterval(id)
  }, [scenarioId, refreshLock])

  const isOwner = lockStatus?.isOwner ?? false
  useEffect(() => {
    if (!isOwner) return
    const id = setInterval(() => void scenarioGanttApi.keepaliveLock(scenarioId), LOCK_KEEPALIVE_MS)
    return () => clearInterval(id)
  }, [isOwner, scenarioId])

  const filteredCrew = useMemo(
    () => (data?.crew ?? []).filter((c) => matchesCrew(c, filterText)),
    [data?.crew, filterText],
  )

  const pairingMap = useMemo(
    () => new Map((data?.pairings ?? []).map((p) => [p.pairingId, p])),
    [data?.pairings],
  )

  const rangeStart = useMemo(() => data ? new Date(data.strDtLoc) : new Date(), [data?.strDtLoc])
  const rangeEnd   = useMemo(() => data ? new Date(data.endDtLoc) : new Date(), [data?.endDtLoc])

  const handleSplitterDrag = useCallback((dx: number) => {
    setLeftPanelWidth(leftPanelWidth + dx)
  }, [leftPanelWidth, setLeftPanelWidth])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading scenario data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        Error: {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="scenario-gantt-view">
      <ScenarioGanttToolbar
        data={data}
        lockStatus={lockStatus}
        isDirty={isDirty}
        saving={saving}
        acquiringLock={acquiringLock}
        filterText={filterText}
        onFilterChange={setFilterText}
        onAcquireLock={() => void acquireLock(scenarioId)}
        onReleaseLock={() => void releaseLock(scenarioId)}
        onSave={() => void save(scenarioId)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ScenarioGanttLeftPanel
          crew={filteredCrew}
          scrollY={scrollY}
          width={leftPanelWidth}
          onScrollY={setScrollY}
        />
        <PanelSplitter onDrag={handleSplitterDrag} />
        <ScenarioGanttCanvas
          crew={filteredCrew}
          pairingMap={pairingMap as Map<number, ScenarioGanttPairing>}
          assignments={data.assignments as ScenarioGanttAssignment[]}
          pendingChanges={pendingChanges as AssignmentPatch[]}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pxPerHour={pxPerHour}
          scrollX={scrollX}
          scrollY={scrollY}
          canEdit={isOwner}
          onScrollY={setScrollY}
          onScrollX={setScrollX}
          onZoom={setZoom}
          onRemove={(pairingId, crewId) => addPatch({ op: 'remove', pairingId, crewId })}
          onScrollYChange={setScrollY}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles (full project)**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (or only pre-existing unrelated errors like `pairing-duty-node-service.ts`).

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): ScenarioGanttView — Canvas-based layout with left panel + splitter"
```

---

## Task 7: Delete old files + update E2E test

**Files:**
- Delete: `gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx`
- Delete: `gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx`
- Update: `e2e/tests/gantt/scenario-gantt-open.spec.ts`

- [ ] **Step 1: Delete old React-DOM renderer files**

```bash
rm /home/yuan.z/rois/rois-ai/gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx
rm /home/yuan.z/rois/rois-ai/gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx
```

- [ ] **Step 2: Verify no remaining imports of deleted files**

```bash
grep -r "scenario-gantt-bar\|scenario-gantt-renderer" /home/yuan.z/rois/rois-ai/gantt/src --include="*.tsx" --include="*.ts"
```

Expected: no output.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Update E2E test — verify testids still match**

Open `e2e/tests/gantt/scenario-gantt-open.spec.ts` and confirm these testids are still present in the new components:
- `scenario-gantt-toolbar` ✓ (in `scenario-gantt-toolbar.tsx`)
- `sg-scenario-name` ✓ (in `scenario-gantt-toolbar.tsx`)
- `module-tab-scenario-gantt:*` pattern ✓ (added via `data-testid={`module-tab-${module}`}` in `shell-top-nav.tsx`)

Update the tab assertion in the test — the new tab is matched by `data-testid`:

Find the line:
```typescript
    const ganttTab = page.getByRole('navigation').getByText(input.name).or(
      page.locator('[data-testid^="module-tab-scenario-gantt"]'),
    ).first()
```

Replace with:
```typescript
    const ganttTab = page.locator('[data-testid^="module-tab-scenario-gantt"]').first()
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(gantt): remove old React-DOM renderer files; update E2E tab selector"
```

---

## Task 8: Build verification

- [ ] **Step 1: TypeScript full check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -20
```

Expected: no errors from scenario-gantt files.

- [ ] **Step 2: Production build**

```bash
~/rois/rois.sh build gantt 2>&1 | tail -10
```

Expected: `✓ [gantt] 完成` with no TypeScript errors.

- [ ] **Step 3: Smoke-test in browser**

Start the dev server and verify manually:
```bash
cd /home/yuan.z/rois/rois-ai/gantt
npx vite --port 5173 &
```

Check:
1. Open Scenario module → click Open on a DONE scenario → teal tab appears in top nav
2. Scenario Gantt view loads with left panel (crew list) + canvas (pairing bars)
3. Crew search box filters the left panel and canvas rows in sync
4. Ctrl+scroll zooms the timeline
5. Right-click on a pairing bar (when in Editing mode) marks it for removal

- [ ] **Step 4: Run E2E smoke test**

```bash
cd /home/yuan.z/rois/rois-ai
npx playwright test e2e/tests/gantt/scenario-gantt-open.spec.ts --reporter=list 2>&1 | tail -15
```

Expected: PASS (or note if test environment lacks a DONE scenario).

- [ ] **Step 5: Version bump**

In `gantt/src/version.ts`, increment `FRONTEND_VERSION` by 1.

- [ ] **Step 6: Final commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version (scenario-gantt V2 — Canvas renderer + tab fix)"
```
