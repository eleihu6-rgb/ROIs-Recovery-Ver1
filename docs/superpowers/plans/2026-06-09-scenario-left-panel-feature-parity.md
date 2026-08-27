# Scenario Gantt Left Panel — Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance `ScenarioGanttLeftPanel` with column resize, sort indicators, bidirectional row selection, frozen rows, and column visibility — matching Live Gantt left panel behaviour.

**Architecture:** New `'scenario-roster'` PaneType shares the column-store and `PanelRowData` type. `scenario-roster-pane.tsx` coordinates all state (selectedCrewIds, frozenCrewIds, sortColumn, columns). `ScenarioGanttLeftPanel` is rewritten as a full-featured Canvas panel. Bidirectional selection is wired via crewId↔taskId reverse-lookup in the parent.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Zustand (column-store, scenario-layout-store)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `gantt/src/types/pane.ts` | Modify | Add `'scenario-roster'` to PaneType union |
| `gantt/src/stores/column-store.ts` | Modify | Add `'scenario-roster'` default columns + migration |
| `gantt/src/stores/scenario-layout-store.ts` | Modify | Add `frozenCrewIds: string[]` + `setFrozenCrewIds` |
| `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx` | Rewrite | Full-featured Canvas panel (A–E) |
| `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` | Modify | Add `selectedCrewIds` row tint |
| `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` | Modify | Coordinator: all state + wiring |

---

## Task 1 — Extend PaneType and column-store

**Files:**
- Modify: `gantt/src/types/pane.ts`
- Modify: `gantt/src/stores/column-store.ts`

- [ ] **Step 1: Add `'scenario-roster'` to PaneType**

In `gantt/src/types/pane.ts`, change:
```typescript
export type PaneType = 'roster-main' | 'roster-sub' | 'pairing' | 'flight'
```
to:
```typescript
export type PaneType = 'roster-main' | 'roster-sub' | 'pairing' | 'flight' | 'scenario-roster'
```

- [ ] **Step 2: Add default columns for scenario-roster in column-store**

In `gantt/src/stores/column-store.ts`, add after the `DEFAULT_FLIGHT_COLUMNS` block (before the `ColumnMap` type):

```typescript
/** Default columns for Scenario Roster pane — same keys as Live Roster; stats columns hidden by default */
const DEFAULT_SCENARIO_ROSTER_COLUMNS: ColumnConfig[] = [
  { key: 'crewId',    label: 'CrewId', width: 70, visible: true,  order: 1, row: 1 },
  { key: 'rank',      label: 'Rank',   width: 45, visible: true,  order: 2, row: 1 },
  { key: 'base',      label: 'Base',   width: 45, visible: true,  order: 3, row: 1 },
  { key: 'seniority', label: 'Sen',    width: 50, visible: true,  order: 4, row: 1 },
  { key: 'mcred',     label: 'MCred',  width: 55, visible: false, order: 5, row: 1 },
  { key: 'ybh',       label: 'YBH',    width: 55, visible: false, order: 6, row: 1 },
]
```

- [ ] **Step 3: Add `'scenario-roster'` to `getDefaultColumns()`**

In `gantt/src/stores/column-store.ts`, update `getDefaultColumns`:
```typescript
const getDefaultColumns = (): ColumnMap => ({
  'roster-main':     structuredClone(DEFAULT_ROSTER_COLUMNS),
  'roster-sub':      structuredClone(DEFAULT_ROSTER_COLUMNS),
  'pairing':         structuredClone(DEFAULT_PAIRING_COLUMNS),
  'flight':          structuredClone(DEFAULT_FLIGHT_COLUMNS),
  'scenario-roster': structuredClone(DEFAULT_SCENARIO_ROSTER_COLUMNS),
})
```

- [ ] **Step 4: Add migration in `loadFromStorage`**

In `gantt/src/stores/column-store.ts`, update the `merged` object inside `loadFromStorage`:
```typescript
const merged: ColumnMap = {
  'roster-main': isStaleRoster(parsed['roster-main']) ? defaults['roster-main'] : (parsed['roster-main'] ?? defaults['roster-main']),
  'roster-sub':  isStaleRoster(parsed['roster-sub'])  ? defaults['roster-sub']  : (parsed['roster-sub']  ?? defaults['roster-sub']),
  'pairing':     isStalePairing(parsed['pairing'])    ? defaults['pairing']     : (parsed['pairing']     ?? defaults['pairing']),
  'flight':      parsed['flight']          ?? defaults['flight'],
  'scenario-roster': parsed['scenario-roster'] ?? defaults['scenario-roster'],
}
```

- [ ] **Step 5: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/types/pane.ts gantt/src/stores/column-store.ts
git commit -m "feat(scenario-gantt): add scenario-roster PaneType + column-store defaults

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2 — Add frozenCrewIds to scenario-layout-store

**Files:**
- Modify: `gantt/src/stores/scenario-layout-store.ts`

- [ ] **Step 1: Add `frozenCrewIds` to `ScenarioPaneInfo`**

```typescript
export interface ScenarioPaneInfo {
  type: ScenarioPaneType
  scrollY: number
  leftPanelWidth: number
  frozenCrewIds: string[]   // add this line
}
```

- [ ] **Step 2: Add `setFrozenCrewIds` to the store interface**

```typescript
interface ScenarioLayoutStore {
  // ... existing fields ...
  setFrozenCrewIds: (paneId: string, ids: string[]) => void   // add this
}
```

- [ ] **Step 3: Update `makeDefault()` to include empty `frozenCrewIds`**

```typescript
panes: new Map([
  [DEFAULT_ROSTER_ID,  { type: 'roster',  scrollY: 0, leftPanelWidth: 200, frozenCrewIds: [] }],
  [DEFAULT_PAIRING_ID, { type: 'pairing', scrollY: 0, leftPanelWidth: 200, frozenCrewIds: [] }],
]),
```

Also update the `addPane` function where `newPane` is created:
```typescript
const newPane: ScenarioPaneInfo = { type, scrollY: 0, leftPanelWidth: 200, frozenCrewIds: [] }
```

- [ ] **Step 4: Implement `setFrozenCrewIds` in the store**

Inside the `create<ScenarioLayoutStore>` call, add:
```typescript
setFrozenCrewIds: (paneId, ids) => {
  const { panes } = get()
  const pane = panes.get(paneId)
  if (!pane) return
  const newPanes = new Map(panes)
  newPanes.set(paneId, { ...pane, frozenCrewIds: ids })
  set({ panes: newPanes })
},
```

- [ ] **Step 5: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/scenario-layout-store.ts
git commit -m "feat(scenario-gantt): add frozenCrewIds to scenario-layout-store

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3 — Rewrite ScenarioGanttLeftPanel (columns, sort, resize, visibility)

**Files:**
- Rewrite: `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx`

This task implements features A (resize), B (sort), E (column visibility). Features C (selection) and D (frozen) are added in Tasks 4–5.

- [ ] **Step 1: Rewrite the file**

Replace the entire content of `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx`:

```typescript
// gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx
import { useRef, useEffect, useCallback, useState } from 'react'
import {
  getGanttColors,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  FONT_FAMILY,
  FONT_SIZE_PANEL,
  FONT_SIZE_PANEL_HEADER,
  PIN_ICON_SIZE,
} from '@/components/gantt/gantt-constants'
import type { ColumnConfig } from '@/types'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'

const RESIZE_HOTZONE = 4  // px either side of column boundary

interface ScenarioGanttLeftPanelProps {
  rows: PanelRowData[]
  columns: ColumnConfig[]          // visible + sorted by order
  allColumns: ColumnConfig[]       // all columns (for visibility toggle)
  scrollY: number
  frozenRowCount: number
  selectedCrewIds: Set<string>
  width: number
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
  onScrollY: (y: number) => void
  onColumnWidthChange: (key: string, width: number) => void
  onColumnHeaderClick: (key: string) => void
  onColumnVisibilityChange: (key: string, visible: boolean) => void
  onRowClick: (crewId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onFreezeRow: (crewId: string) => void
  onUnfreezeRow: (crewId: string) => void
}

export const ScenarioGanttLeftPanel = ({
  rows,
  columns,
  allColumns,
  scrollY,
  frozenRowCount,
  selectedCrewIds,
  width,
  sortColumn,
  sortDirection,
  onScrollY,
  onColumnWidthChange,
  onColumnHeaderClick,
  onColumnVisibilityChange,
  onRowClick,
  onFreezeRow,
  onUnfreezeRow,
}: ScenarioGanttLeftPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })
  const rafRef       = useRef(0)
  const hoverRowRef  = useRef(-1)   // canvas row index under mouse (-1 = none)

  // Context menu state for column visibility
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Drag-resize state (refs to avoid RAF stale-closure issues)
  const dragRef = useRef<{ active: boolean; colKey: string; startX: number; startWidth: number }>({
    active: false, colKey: '', startX: 0, startWidth: 0,
  })

  const propsRef = useRef({ rows, columns, allColumns, scrollY, frozenRowCount, selectedCrewIds, sortColumn, sortDirection, width })
  useEffect(() => {
    propsRef.current = { rows, columns, allColumns, scrollY, frozenRowCount, selectedCrewIds, sortColumn, sortDirection, width }
  })

  // ── Canvas resize observer ──────────────────────────────────────────────────
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
      scheduleFrame()
    }
    const ro = new ResizeObserver(update)
    ro.observe(container)
    update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── RAF cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
  }, [])

  // ── Draw ────────────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = dprRef.current
    const { width: w, height } = sizeRef.current
    const p = propsRef.current
    const colors = getGanttColors()

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, height)

    const frozenCount   = p.frozenRowCount
    const fzHeight      = frozenCount * ROW_HEIGHT
    const scrollableCount = p.rows.length - frozenCount

    // ── Scrollable rows (clipped below frozen zone) ──────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER_HEIGHT + fzHeight, w, height - HEADER_HEIGHT - fzHeight)
    ctx.clip()

    const first = Math.max(0, Math.floor(p.scrollY / ROW_HEIGHT))
    const last  = Math.min(scrollableCount - 1, Math.ceil((p.scrollY + height - HEADER_HEIGHT - fzHeight) / ROW_HEIGHT))

    for (let idx = first; idx <= last; idx++) {
      const i   = idx + frozenCount
      const row = p.rows[i]
      if (!row) continue
      const y = HEADER_HEIGHT + i * ROW_HEIGHT - p.scrollY
      if (y > height) break
      drawRow(ctx, w, y, i, row, p.columns, colors, false, selectedCrewIds.has(row.rowId), hoverRowRef.current === i)
    }
    ctx.restore()

    // ── Frozen rows (fixed at top) ───────────────────────────────────────────
    for (let i = 0; i < frozenCount && i < p.rows.length; i++) {
      const row = p.rows[i]
      if (!row) continue
      const y = HEADER_HEIGHT + i * ROW_HEIGHT
      drawRow(ctx, w, y, i, row, p.columns, colors, true, selectedCrewIds.has(row.rowId), hoverRowRef.current === i)
    }

    // Frozen separator line
    if (frozenCount > 0 && frozenCount < p.rows.length) {
      const sepY = HEADER_HEIGHT + fzHeight
      ctx.save()
      ctx.strokeStyle = colors.selectionBorder
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(0, sepY)
      ctx.lineTo(w, sepY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // Right border
    ctx.fillStyle = colors.gridColor
    ctx.fillRect(w - 0.5, 0, 0.5, height)

    // ── Column header (drawn last to cover row overflow) ─────────────────────
    ctx.fillStyle = colors.bgColorPanelHeader
    ctx.fillRect(0, 0, w, HEADER_HEIGHT)

    let colX = 0
    for (const col of p.columns) {
      const isSort = p.sortColumn === col.key
      ctx.fillStyle = isSort ? colors.selectionBorder : colors.textColor
      ctx.font = `${isSort ? 'bold' : 'normal'} ${FONT_SIZE_PANEL_HEADER}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'

      ctx.save()
      ctx.beginPath()
      ctx.rect(colX + 4, 5, col.width - 8, 15)
      ctx.clip()
      const label = isSort ? `${col.label} ${p.sortDirection === 'asc' ? '↑' : '↓'}` : col.label
      ctx.fillText(label, colX + 4, 5)
      ctx.restore()

      ctx.strokeStyle = colors.gridColor
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(colX + col.width, 0)
      ctx.lineTo(colX + col.width, HEADER_HEIGHT)
      ctx.stroke()

      colX += col.width
    }

    // Header bottom border
    ctx.strokeStyle = colors.gridColorMajor ?? colors.gridColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, HEADER_HEIGHT)
    ctx.lineTo(w, HEADER_HEIGHT)
    ctx.stroke()
  }, [selectedCrewIds])

  const scheduleFrame = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawFrame() })
  }, [drawFrame])

  // RAF-merged render on every React commit (same pattern as PaneHeaderCanvas)
  useEffect(() => { scheduleFrame() })

  // ── Column boundary detection ────────────────────────────────────────────
  const getResizeColumn = useCallback((canvasX: number): { key: string; startWidth: number } | null => {
    const cols = propsRef.current.columns
    let x = 0
    for (const col of cols) {
      x += col.width
      if (Math.abs(canvasX - x) <= RESIZE_HOTZONE) {
        return { key: col.key, startWidth: col.width }
      }
    }
    return null
  }, [])

  // ── Row index from canvas Y ──────────────────────────────────────────────
  const getRowIndex = useCallback((canvasY: number): number => {
    const p = propsRef.current
    const relY = canvasY - HEADER_HEIGHT
    if (relY < 0) return -1
    const fzHeight = p.frozenRowCount * ROW_HEIGHT
    if (relY < fzHeight) {
      return Math.floor(relY / ROW_HEIGHT)
    }
    return p.frozenRowCount + Math.floor((relY + p.scrollY) / ROW_HEIGHT)
  }, [])

  // ── Native wheel (passive: false) ────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const maxScrollY = Math.max(0, propsRef.current.rows.length * ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
    const nextY = Math.max(0, Math.min(maxScrollY, propsRef.current.scrollY + e.deltaY))
    onScrollY(nextY)
  }, [onScrollY])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (dragRef.current.active) {
      const dx = x - dragRef.current.startX
      const newWidth = Math.max(30, dragRef.current.startWidth + dx)
      onColumnWidthChange(dragRef.current.colKey, newWidth)
      return
    }

    // Cursor: resize hotzone in header
    if (y <= HEADER_HEIGHT && getResizeColumn(x)) {
      canvas.style.cursor = 'col-resize'
    } else {
      canvas.style.cursor = 'default'
    }

    // Hover row tracking
    const rowIdx = y > HEADER_HEIGHT ? getRowIndex(y) : -1
    if (rowIdx !== hoverRowRef.current) {
      hoverRowRef.current = rowIdx
      scheduleFrame()
    }
  }, [getResizeColumn, getRowIndex, onColumnWidthChange, scheduleFrame])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (y <= HEADER_HEIGHT) {
      const resizeCol = getResizeColumn(x)
      if (resizeCol) {
        dragRef.current = { active: true, colKey: resizeCol.key, startX: x, startWidth: resizeCol.startWidth }
        e.preventDefault()
      }
    }
  }, [getResizeColumn])

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Header click → sort (skip if in resize hotzone)
    if (y <= HEADER_HEIGHT) {
      if (!getResizeColumn(x)) {
        let colX = 0
        for (const col of propsRef.current.columns) {
          if (x >= colX && x < colX + col.width) { onColumnHeaderClick(col.key); return }
          colX += col.width
        }
      }
      return
    }

    // Pin icon click (right side of row)
    const rowIdx = getRowIndex(y)
    const row = propsRef.current.rows[rowIdx]
    if (!row) return

    const iconX = sizeRef.current.width - PIN_ICON_SIZE - 6
    if (x >= iconX - 4) {
      const isFrozen = rowIdx < propsRef.current.frozenRowCount
      if (isFrozen) onUnfreezeRow(row.rowId)
      else onFreezeRow(row.rowId)
      return
    }

    // Row selection click
    onRowClick(row.rowId, e.ctrlKey || e.metaKey, e.shiftKey)
  }, [getResizeColumn, getRowIndex, onColumnHeaderClick, onRowClick, onFreezeRow, onUnfreezeRow])

  const handleMouseLeave = useCallback(() => {
    if (hoverRowRef.current !== -1) {
      hoverRowRef.current = -1
      scheduleFrame()
    }
  }, [scheduleFrame])

  // ── Context menu (column visibility) ─────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const y = e.clientY - rect.top
    if (y > HEADER_HEIGHT) return   // only header right-click
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

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
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />

      {/* Column visibility context menu */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[140px] rounded border border-border bg-popover py-1 shadow-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <div className="border-b border-border px-3 py-1 text-2xs font-semibold text-muted-foreground">Columns</div>
            {propsRef.current.allColumns.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={col.visible}
                  disabled={col.key === 'crewId'}
                  onChange={(ev) => onColumnVisibilityChange(col.key, ev.target.checked)}
                  className="h-3 w-3"
                />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Standalone draw helpers ─────────────────────────────────────────────────

function drawRow(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  y: number,
  i: number,
  row: PanelRowData,
  columns: ColumnConfig[],
  colors: ReturnType<typeof getGanttColors>,
  isFrozen: boolean,
  isSelected: boolean,
  isHovered: boolean,
): void {
  // Alternating background
  if (i % 2 === 1) {
    ctx.fillStyle = colors.bgColorAlt
    ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT)
  }

  // Frozen tint
  if (isFrozen) {
    ctx.fillStyle = colors.rowFrozenColor
    ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT)
  }

  // Selection highlight
  if (isSelected) {
    ctx.fillStyle = colors.rowSelectedColor
    ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT)
    ctx.fillStyle = colors.selectionBorder
    ctx.fillRect(0, y, 3, ROW_HEIGHT)
  }

  // Hover tint (subtle, non-selected)
  if (isHovered && !isSelected) {
    ctx.fillStyle = colors.rowSelectedColor
    ctx.globalAlpha = 0.4
    ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT)
    ctx.globalAlpha = 1
  }

  // Horizontal separator
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, y + ROW_HEIGHT)
  ctx.lineTo(canvasWidth, y + ROW_HEIGHT)
  ctx.stroke()

  // Cell values — row 1 (top half) and crewName in bottom half
  let x = 0
  for (const col of columns) {
    const value = row.values[col.key] ?? ''
    const cellY = y + 5

    ctx.fillStyle = row.colors?.[col.key] ?? colors.textColor
    ctx.font = `bold ${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 3, cellY - 1, col.width - 6, 15)
    ctx.clip()
    ctx.fillText(value, x + 4, cellY)
    ctx.restore()

    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + col.width, y)
    ctx.lineTo(x + col.width, y + ROW_HEIGHT)
    ctx.stroke()

    x += col.width
  }

  // crewName bottom span
  const crewName = row.values['crewName'] ?? ''
  if (crewName) {
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `9px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.save()
    ctx.beginPath()
    ctx.rect(8, y + ROW_HEIGHT / 2 + 3, canvasWidth - 16, 14)
    ctx.clip()
    ctx.fillText(crewName, 8, y + ROW_HEIGHT / 2 + 9)
    ctx.restore()
  }

  // Pin icon (show on hover OR when frozen)
  if (isFrozen || isHovered) {
    const iconX = canvasWidth - PIN_ICON_SIZE - 6
    ctx.save()
    if (isFrozen) {
      ctx.fillStyle = colors.selectionBorder
      ctx.globalAlpha = 0.15
      ctx.beginPath()
      ctx.arc(iconX + PIN_ICON_SIZE / 2, y + ROW_HEIGHT / 2, PIN_ICON_SIZE / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = isFrozen ? colors.selectionBorder : colors.textColorSecondary
    ctx.font = `${PIN_ICON_SIZE - 2}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.globalAlpha = isFrozen ? 1 : 0.5
    ctx.fillText('📌', iconX + PIN_ICON_SIZE / 2, y + ROW_HEIGHT / 2)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
    ctx.restore()
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx
git commit -m "feat(scenario-gantt): rewrite left panel — column resize, sort, frozen, selection, visibility

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4 — Add selectedCrewIds row tint to ScenarioGanttCanvas

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`

- [ ] **Step 1: Add `selectedCrewIds` to props interface**

In `scenario-gantt-canvas.tsx`, update `ScenarioGanttCanvasProps`:
```typescript
interface ScenarioGanttCanvasProps {
  // ... existing props ...
  selectedCrewIds: Set<string>   // add this line
  // ...
}
```

- [ ] **Step 2: Include in `propsRef`**

Update both the `propsRef` initialization and the `useEffect` that syncs props:
```typescript
const propsRef = useRef({
  crew, pairingMap, assignments, groundItems, pairingSegments, pendingChanges,
  rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit, timezone,
  selectedTaskIds, selectedCrewIds,   // add selectedCrewIds
})
useEffect(() => {
  propsRef.current = {
    crew, pairingMap, assignments, groundItems, pairingSegments, pendingChanges,
    rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, canEdit, timezone,
    selectedTaskIds, selectedCrewIds,   // add selectedCrewIds
  }
})
```

Also add to the destructure in the component function signature:
```typescript
export const ScenarioGanttCanvas = ({
  // ... existing props ...
  selectedCrewIds,
  // ...
}: ScenarioGanttCanvasProps) => {
```

- [ ] **Step 3: Draw row tint after `renderBase` in `drawFrame`**

In the `drawFrame` callback, after `renderBase(rc)` and before `renderRosterTasks(rrc)`, add:

```typescript
// Draw selected-crew row tints
if (p.selectedCrewIds.size > 0) {
  const colors = getGanttColors()
  ctx.fillStyle = colors.rowSelectedColor
  ctx.globalAlpha = 0.35
  for (let ri = 0; ri < p.crew.length; ri++) {
    if (!p.selectedCrewIds.has(p.crew[ri].crewId)) continue
    const rowTop = HEADER_HEIGHT + ri * ROW_HEIGHT - p.scrollY
    if (rowTop + ROW_HEIGHT < HEADER_HEIGHT || rowTop > height) continue
    ctx.fillRect(0, Math.max(HEADER_HEIGHT, rowTop), width, ROW_HEIGHT)
  }
  ctx.globalAlpha = 1
}
```

Note: `HEADER_HEIGHT` and `ROW_HEIGHT` are already imported at the top of the file.

- [ ] **Step 4: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
git commit -m "feat(scenario-gantt): add selectedCrewIds row tint to canvas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5 — Wire everything in scenario-roster-pane

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`

This is the coordinator task. It wires columns, selection, frozen rows, and sort into `ScenarioGanttLeftPanel` and `ScenarioGanttCanvas`.

- [ ] **Step 1: Add imports**

Add to the import block at the top of `scenario-roster-pane.tsx`:
```typescript
import { useMemo, useState, useCallback, useRef } from 'react'
import { useColumnStore } from '@/stores/column-store'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
```

(Remove `useCallback` from existing import if already there; `useRef` likewise.)

- [ ] **Step 2: Read columns from column-store and build panelRows**

Inside `ScenarioRosterPane`, after the existing store reads, add:

```typescript
const columns      = useColumnStore((s) => s.getVisibleColumns('scenario-roster'))
const allColumns   = useColumnStore((s) => s.getColumns('scenario-roster'))
const updateColumn = useColumnStore((s) => s.updateColumn)

// Adapter: ScenarioGanttCrew[] → PanelRowData[]
const panelRows = useMemo((): PanelRowData[] =>
  filteredCrew.map((c) => ({
    rowId: c.crewId,
    values: {
      crewId:    c.crewId,
      rank:      c.rank,
      base:      c.base,
      seniority: c.seniorityNum ?? '',
      mcred:     '',
      ybh:       '',
      crewName:  c.crewName ?? '',
    },
  })),
[filteredCrew])
```

- [ ] **Step 3: Replace sort state with column-store-compatible approach**

Remove the existing `sortColumn`/`sortDirection` useState and `handleSort`. Replace with:

```typescript
const [sortColumn, setSortColumn]     = useState<string | null>(null)
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

const handleColumnHeaderClick = useCallback((key: string) => {
  setSortColumn((prev) => {
    if (prev === key) {
      setSortDirection((d) => d === 'asc' ? 'desc' : 'asc')
      return key
    }
    setSortDirection('asc')
    return key
  })
}, [])
```

Update `filteredCrew` sort to handle all column keys:

```typescript
const filteredCrew = useMemo(() => {
  const list = (data?.crew ?? []).filter((c) => matchesCrew(c, filterText, crewFilter))
  // Default: seniority asc, then crewId
  list.sort((a, b) => {
    const na = a.seniorityNum !== null ? Number(a.seniorityNum) : Infinity
    const nb = b.seniorityNum !== null ? Number(b.seniorityNum) : Infinity
    if (na !== nb) return na - nb
    return a.crewId.localeCompare(b.crewId)
  })
  if (!sortColumn) return list
  return [...list].sort((a, b) => {
    if (sortColumn === 'seniority') {
      const na = a.seniorityNum !== null ? Number(a.seniorityNum) : Infinity
      const nb = b.seniorityNum !== null ? Number(b.seniorityNum) : Infinity
      return sortDirection === 'asc' ? na - nb : nb - na
    }
    const va = sortColumn === 'crewId' ? a.crewId
             : sortColumn === 'rank'   ? a.rank
             : sortColumn === 'base'   ? a.base
             : ''
    const vb = sortColumn === 'crewId' ? b.crewId
             : sortColumn === 'rank'   ? b.rank
             : sortColumn === 'base'   ? b.base
             : ''
    return sortDirection === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })
}, [data?.crew, filterText, crewFilter, sortColumn, sortDirection])
```

- [ ] **Step 4: Add selection state (bidirectional)**

**4a — Shared itemsByCrewRef for reverse-lookup**

Add to `ScenarioGanttCanvasProps` in `scenario-gantt-canvas.tsx`:
```typescript
itemsByCrewRef?: React.MutableRefObject<Map<string, Array<{ id: number }>>>
```

Add to the component signature destructure and both `propsRef` objects. Inside `drawFrame`, after `buildRosterItems`, assign:
```typescript
if (p.itemsByCrewRef) {
  p.itemsByCrewRef.current = new Map(
    [...itemsByCrew.entries()].map(([k, v]) => [k, v.map((it) => ({ id: it.id }))])
  )
}
```

**4b — Selection state in scenario-roster-pane.tsx**

```typescript
const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set())
// itemsByCrewRef is updated by ScenarioGanttCanvas each frame after buildRosterItems
const itemsByCrewRef = useRef<Map<string, Array<{ id: number }>>>(new Map())
```

Row click (left panel → canvas): find all task IDs for that crew and select them:
```typescript
const handleRowClick = useCallback((crewId: string, ctrlKey: boolean, shiftKey: boolean) => {
  setSelectedCrewIds((prev) => {
    const next = new Set(ctrlKey || shiftKey ? prev : new Set<string>())
    if (next.has(crewId)) next.delete(crewId)
    else next.add(crewId)
    // Sync task selection
    const taskIds = new Set<number>()
    for (const id of next) {
      for (const it of (itemsByCrewRef.current.get(id) ?? [])) taskIds.add(it.id)
    }
    setSelectedTaskIds(taskIds)
    return next
  })
}, [])
```

Canvas task click (canvas → left panel): reverse-lookup crewIds from selectedTaskIds:
```typescript
const handleSelectTasks = useCallback((ids: Set<number>) => {
  setSelectedTaskIds(ids)
  if (ids.size === 0) { setSelectedCrewIds(new Set()); return }
  const crewIds = new Set<string>()
  for (const [crewId, items] of itemsByCrewRef.current) {
    if (items.some((it) => ids.has(it.id))) crewIds.add(crewId)
  }
  setSelectedCrewIds(crewIds)
}, [])
```

- [ ] **Step 5: Add frozen rows**

```typescript
const frozenCrewIds    = useLayoutStore((s) => s.panes.get(paneId)?.frozenCrewIds ?? [])
const setFrozenCrewIds = useLayoutStore((s) => s.setFrozenCrewIds)

const handleFreezeRow = useCallback((crewId: string) => {
  setFrozenCrewIds(paneId, [...frozenCrewIds.filter((id) => id !== crewId), crewId])
}, [frozenCrewIds, paneId, setFrozenCrewIds])

const handleUnfreezeRow = useCallback((crewId: string) => {
  setFrozenCrewIds(paneId, frozenCrewIds.filter((id) => id !== crewId))
}, [frozenCrewIds, paneId, setFrozenCrewIds])
```

Reorder `panelRows` to put frozen crew first (matching `filteredCrew` reorder):
```typescript
const { orderedRows, orderedCrew, frozenRowCount } = useMemo(() => {
  const frozenSet = new Set(frozenCrewIds)
  const frozenRows = panelRows.filter((r) => frozenSet.has(r.rowId))
  const scrollRows = panelRows.filter((r) => !frozenSet.has(r.rowId))
  const frozenC    = filteredCrew.filter((c) => frozenSet.has(c.crewId))
  const scrollC    = filteredCrew.filter((c) => !frozenSet.has(c.crewId))
  return {
    orderedRows:     [...frozenRows, ...scrollRows],
    orderedCrew:     [...frozenC,    ...scrollC],
    frozenRowCount:  frozenRows.length,
  }
}, [panelRows, filteredCrew, frozenCrewIds])
```

- [ ] **Step 6: Wire column width change and visibility**

```typescript
const handleColumnWidthChange = useCallback((key: string, w: number) => {
  updateColumn('scenario-roster', key, { width: w })
}, [updateColumn])

const handleColumnVisibilityChange = useCallback((key: string, visible: boolean) => {
  updateColumn('scenario-roster', key, { visible })
}, [updateColumn])
```

- [ ] **Step 7: Update JSX to pass all new props**

Replace the `<ScenarioGanttLeftPanel>` and `<ScenarioGanttCanvas>` usage with:

```tsx
<ScenarioGanttLeftPanel
  rows={orderedRows}
  columns={columns}
  allColumns={allColumns}
  scrollY={scrollY}
  frozenRowCount={frozenRowCount}
  selectedCrewIds={selectedCrewIds}
  width={leftPanelWidth}
  sortColumn={sortColumn}
  sortDirection={sortDirection}
  onScrollY={setScrollY}
  onColumnWidthChange={handleColumnWidthChange}
  onColumnHeaderClick={handleColumnHeaderClick}
  onColumnVisibilityChange={handleColumnVisibilityChange}
  onRowClick={handleRowClick}
  onFreezeRow={handleFreezeRow}
  onUnfreezeRow={handleUnfreezeRow}
/>
<PanelSplitter onDrag={(dx) => setLeftPanelWidth(paneId, leftPanelWidth + dx)} />
<ScenarioGanttCanvas
  crew={orderedCrew}
  pairingMap={pairingMap}
  assignments={data.assignments}
  groundItems={data.groundItems}
  pairingSegments={data.pairingSegments}
  pendingChanges={pendingChanges}
  rangeStart={rangeStart}
  rangeEnd={rangeEnd}
  pxPerHour={pxPerHour}
  scrollX={scrollX}
  scrollY={scrollY}
  canEdit={false}
  timezone={timezone}
  selectedTaskIds={selectedTaskIds}
  selectedCrewIds={selectedCrewIds}
  itemsByCrewRef={itemsByCrewRef}
  onScrollY={setScrollY}
  onScrollX={setScrollX}
  onZoom={setZoom}
  onRemove={(pairingId, crewId) => addPatch({ op: 'remove', pairingId, crewId })}
  onSelectTasks={handleSelectTasks}
  onScrollYChange={setScrollY}
/>
```

- [ ] **Step 8: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```
Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 9: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-roster-pane.tsx \
        gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx
git commit -m "feat(scenario-gantt): wire bidirectional selection, frozen rows, column config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6 — Version bump, build, deploy

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump FRONTEND_VERSION**

In `gantt/src/version.ts`, increment `FRONTEND_VERSION` by 1 (current value + 1).

- [ ] **Step 2: Build and deploy**

```bash
cd /home/yuan.z/rois && bash rois.sh build gantt 2>&1
```
Expected: `✓ [gantt] 完成` with 0 TypeScript errors.

- [ ] **Step 3: Smoke test checklist**

Open Scenario Gantt (scenario 6) and verify:
1. Left panel shows columns: CrewId / Rank / Base / Sen
2. Clicking a column header sorts the rows (arrow ↑/↓ appears)
3. Dragging a column boundary resizes it (cursor changes to `col-resize`)
4. Right-clicking the header shows column visibility checkboxes
5. Hovering a data row shows the pin icon
6. Clicking the pin icon freezes the row to the top
7. Clicking a frozen row's pin icon unfreezes it
8. Clicking a left panel row highlights it + canvas highlights that crew's tasks
9. Clicking a canvas task highlights its crew row in the left panel
10. Ctrl+click on left panel rows multi-selects

- [ ] **Step 4: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): bump version F124

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
