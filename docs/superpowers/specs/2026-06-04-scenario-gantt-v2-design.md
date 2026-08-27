# Scenario Gantt V2 — Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Scope:** Frontend only — backend routes (gantt-data, lock ×4, patch-output, engine-server fallback) are unchanged.

---

## Goal

Replace the V1 React-DOM-based Scenario Gantt renderer with a Canvas-based renderer that matches the Live Gantt visual style exactly. Each scenario tab gets its own independent zoom/scroll/filter state.

---

## What Changes vs. V1

| Area | V1 | V2 |
|------|----|----|
| Rendering | React `div` bars with absolute positioning | Canvas (`drawFrame` loop, same infrastructure as Live Gantt) |
| Left panel | React div rows | Canvas left panel, synced scrollY |
| Tab display | Not shown in top nav (bug) | Rendered as dynamic teal tabs in `ShellTopNav` |
| Zoom | Fixed, no control | Per-instance `pxPerHour`, Ctrl+scroll to adjust |
| Toolbar | Date picker + complex filters | Crew search box + lock controls + Save only |
| Loading | Same (single API call) | Same — no change |
| Backend | Unchanged | Unchanged |

---

## Section 1: Top Nav Tab Fix

`ShellTopNav` currently only iterates `NAV_ITEMS` (static modules). Dynamic `scenario-gantt:*` tabs in `openTabs` are never rendered.

**Fix:** After the static nav items, render a second group of dynamic tabs for any entry in `openTabs` that starts with `scenario-gantt:`.

```
[Dashboard] [Live] [Scenario] [Rule] … ‖ [RO-0601 ×] [RO-调班 ×]
                                          ↑ dynamic scenario tabs (teal)
```

- **Label:** `data.scenarioName` from per-instance store; fallback to `Scenario #ID` while loading
- **Style:** teal bg/text to distinguish from static tabs; always shows close `×` button
- **Close:** calls `closeTab(module)` + `destroyScenarioGanttStore(scenarioId)`
- **Separator:** a `NavDivider` between the static group and the dynamic group (hidden when no dynamic tabs are open)

**Files:** `shell-top-nav.tsx` (+~25 lines)

---

## Section 2: Canvas Rendering

### 2a. `ScenarioGanttCanvas` (new, ~250 lines)

Standalone Canvas component. Does **not** use `paneStore`, `ganttViewStore`, or `layoutStore`.

**Reuses from Live Gantt (pure utilities, no store deps):**
- `getGanttColors()` — theme-aware color palette
- `renderBase()` — background, day-grid verticals, time-axis header
- `gantt-constants` — `ROW_HEIGHT=43`, `HEADER_HEIGHT=30`, fonts, scrollbar sizes
- `useCanvasResize` hook — DPR-aware canvas sizing

**Own state (via props + refs):**
- `scrollY` / `scrollX` — `useRef`, updated on wheel/pointer drag
- `pxPerHour` — from per-instance store; Ctrl+wheel adjusts it
- Canvas resize via `useCanvasResize`

**`drawFrame` call order each animation frame:**
1. `renderBase(ctx, baseCtx)` — background, grid, time axis
2. For each visible row (`rowStart..rowEnd` from scrollY):
   - Draw row background (alternating, matching Live Gantt)
   - For each assignment on this crew:
     - **`opt`** → solid blue bar (`--gantt-task-bg` / `#3b82f6` tint), same height as Live Gantt task blocks (`TASK_HEIGHT=30`, `TASK_PADDING`)
     - **`leadin`** → green bar (`#22c55e` tint, 70% opacity)
     - **pending patch (remove)** → red strikethrough overlay on bar
     - **pending patch (reassign/add)** → amber dashed-border overlay
   - Bar label: `pairingLabel ?? "P{id}"` in `font-mono tabular-nums`, `FONT_SIZE_TASK=11`
3. Hover highlight (row tint + bar border glow) on `mousemove`
4. Scrollbar overlay (vertical + horizontal, matching Live Gantt scrollbar style)

**Interactions:**
- `wheel` — scroll Y; `Ctrl+wheel` — zoom (`pxPerHour`)
- `mousemove` — hover state (row highlight + tooltip trigger)
- `contextmenu` on bar → remove assignment patch
- No drag-to-reassign in V1

**Tooltip:** plain HTML div overlay (not canvas), shows pairing label, `schStrDtUtc → schEndDtUtc`, source badge.

### 2b. `ScenarioGanttLeftPanel` (new, ~150 lines)

Standalone Canvas for the left crew list. Shares `scrollY` ref with `ScenarioGanttCanvas` via prop/callback.

- Fixed default width 200 px; resizable via `VerticalSplitter`
- Each row (height `ROW_HEIGHT=43`): `crewId` (primary, `FONT_SIZE_PANEL=11`, bold) + `base` · `rank` (secondary, `text-2xs`, muted color)
- Renders only rows that pass `filterText` — same filtered list as the main canvas

**Files:**
- `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` (new)
- `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx` (new)
- `gantt/src/components/scenario-gantt/scenario-gantt-bar.tsx` (delete)
- `gantt/src/components/scenario-gantt/scenario-gantt-renderer.tsx` (delete)

---

## Section 3: Per-instance Store

Extend existing `scenario-gantt-store.ts` factory. New fields added to each instance:

```typescript
// Zoom & scroll (independent per tab)
pxPerHour: number          // default 40
scrollX: number            // horizontal scroll offset (px), default 0

// Local filter
filterText: string         // crew search: matches crewId / base / rank (case-insensitive)

// Actions
setZoom: (pxPerHour: number) => void
setScrollX: (x: number) => void
setFilterText: (text: string) => void
```

Existing fields retained unchanged: `data`, `loading`, `error`, `pendingChanges`, `isDirty`, `saving`, `lockStatus`, `acquiringLock`, and all lock/patch actions.

**Filtered crew list** (derived, computed in view): `data.crew.filter(c => matchesFilter(c, filterText))`. The canvas receives only filtered rows; assignment lookup still uses the full `data.assignments` map.

---

## Section 4: Simplified Toolbar

```
[Scenario badge] [场景名]  |  [Snapshot/Live badge]  |  [🔍 Search crew…]  flex-1  [Lock control]  [Save]
```

**Kept:**
- Scenario name + data-source badge
- Crew search input (`filterText`, instant local filter, no API call)
- Lock control: `Viewing · Read-only` / `Editing Xm` / `Locked by Y`
- Save button (enabled only when `isOwner && isDirty && !saving`)

**Removed (V1 scope):**
- Date range picker
- Base / Rank / Division dropdowns
- Zoom slider (replaced by Ctrl+scroll gesture)

**File:** `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` (rewrite)

---

## Section 5: Data Flow (unchanged)

```
setModule('scenario-gantt:42')
  → ScenarioGanttView mounts
  → loadData(42)
  → GET /api/scenario/42/gantt-data   ← single call, all data
  → { crew[], pairings[], assignments[] }
  → per-instance store
  → ScenarioGanttCanvas renders all rows (virtual scroll on canvas only)
```

No pagination, no segmented loading. Local `filterText` narrows the rendered crew list client-side only.

**Patch / Save flow (unchanged):**
```
right-click bar → addPatch({ op:'remove', ... })
Save → POST /api/scenario/:id/patch-output → live-server applies delta to output.gz → PUT engine-server file
```

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `shell-top-nav.tsx` | Render dynamic scenario-gantt tabs |
| Modify | `scenario-gantt-store.ts` | Add pxPerHour, scrollX, filterText, setters |
| Rewrite | `scenario-gantt-view.tsx` | Compose left panel + canvas + toolbar |
| Rewrite | `scenario-gantt-toolbar.tsx` | Simplified toolbar |
| **New** | `scenario-gantt-canvas.tsx` | Standalone Canvas renderer |
| **New** | `scenario-gantt-left-panel.tsx` | Left crew list Canvas |
| Delete | `scenario-gantt-bar.tsx` | Replaced by Canvas drawing |
| Delete | `scenario-gantt-renderer.tsx` | Replaced by Canvas drawing |
| Update | `e2e/tests/gantt/scenario-gantt-open.spec.ts` | Update testids if changed |

---

## Out of Scope (V1)

- Drag-to-reassign pairing bars
- Base / Rank / Division filter dropdowns
- Zoom control in toolbar (Ctrl+scroll only)
- Rule violation overlay on scenario gantt bars
- Undo/redo for patches
