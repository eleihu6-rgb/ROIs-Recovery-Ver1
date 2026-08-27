# Gantt Nav Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce vertical space usage in the Gantt layout by merging two navigation bars into one (TopNav + TabBar → 44px combined) and merging two per-pane header rows into one (PaneHeader + PaneToolbar → ~32px combined).

**Architecture:** Task 1 merges `ShellTopNav` and `ShellTabBar` into a single bar by giving every module nav button a closeable-tab appearance and removing the `tabBarVisible` store state. Task 2 removes `PaneHeader` entirely and folds its drag-handle and close-button functionality into `PaneToolbar` via new optional props threaded through each pane component.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand

---

## File Map

| Action | File |
|--------|------|
| Modify | `gantt/src/stores/shell-store.ts` |
| Rewrite | `gantt/src/components/shell/shell-top-nav.tsx` |
| Modify | `gantt/src/components/shell/app-shell.tsx` |
| Modify | `gantt/src/components/shell/shell-sidebar.tsx` |
| Delete | `gantt/src/components/shell/shell-tab-bar.tsx` |
| Modify | `gantt/src/components/layout/pane-toolbar.tsx` |
| Modify | `gantt/src/components/layout/pane-wrapper.tsx` |
| Modify | `gantt/src/components/panes/roster-pane.tsx` |
| Modify | `gantt/src/components/panes/pairing-pane.tsx` |
| Modify | `gantt/src/components/panes/flight-pane.tsx` |
| Delete | `gantt/src/components/layout/pane-header.tsx` |

---

## Task 1: Merge TopNav + TabBar

**Context before touching code:**

Current vertical stack (top → bottom):
- `ShellTopNav` (`h-11` = 44px): Logo + 6 module nav buttons + ThemeSwitcher + UserCode + Logout + TabBar/TopNav toggle buttons
- `ShellTabBar` (`h-[34px]` = 34px): Open tabs with colored dots and close buttons

After merge: single 44px bar — Logo | tab-style module buttons (open tabs get close ×) | right controls

`tabBarVisible` / `toggleTabBar` exist in `shell-store.ts` and are also read by `shell-sidebar.tsx`. Both references must be cleaned up.

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`
- Rewrite: `gantt/src/components/shell/shell-top-nav.tsx`
- Modify: `gantt/src/components/shell/app-shell.tsx`
- Modify: `gantt/src/components/shell/shell-sidebar.tsx`
- Delete: `gantt/src/components/shell/shell-tab-bar.tsx`

---

- [ ] **Step 1.1: Remove tabBarVisible from shell-store**

In `gantt/src/stores/shell-store.ts`, remove all `tabBarVisible`/`toggleTabBar`/`KEYS.tabBar` references.

The final store interface and implementation:

```typescript
// Remove from interface ShellStore:
//   tabBarVisible: boolean        ← DELETE
//   toggleTabBar: () => void      ← DELETE

// Remove from KEYS:
//   tabBar: 'rois-shell-tab-bar', ← DELETE

// Remove from create() initial state:
//   tabBarVisible: true,          ← DELETE

// Remove toggleTabBar method entirely ← DELETE

// In loadFromStorage, remove:
//   const tabBarVisible = localStorage.getItem(KEYS.tabBar) !== 'false'  ← DELETE
// And remove tabBarVisible from the set({...}) call at end of loadFromStorage
```

The `set({...})` at the end of `loadFromStorage` currently reads:
```typescript
set({ activeModule: module, activeLiveItem: liveItem, activeScenarioItem: scenarioItem, activeRuleItem: ruleItem, openTabs, topNavVisible, tabBarVisible, sidebarState, sidebarUserOverride })
```
Change to:
```typescript
set({ activeModule: module, activeLiveItem: liveItem, activeScenarioItem: scenarioItem, activeRuleItem: ruleItem, openTabs, topNavVisible, sidebarState, sidebarUserOverride })
```

- [ ] **Step 1.2: Rewrite shell-top-nav.tsx**

Replace the entire file content with this merged implementation:

```typescript
import { X } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import {
  LayoutDashboard, CalendarDays, FlaskConical, ScrollText, Database, Settings2,
  PanelTopClose, LogOut,
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/common/theme-switcher'
import { AirlineLogo } from '@/components/common/airline-logo'
import { useShellStore } from '@/stores/shell-store'
import { useAuthStore } from '@/stores/auth-store'
import type { ActiveModule } from '@/stores/shell-store'

interface NavItem {
  module: ActiveModule
  label: string
  Icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { module: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { module: 'live',      label: 'Live',      Icon: CalendarDays },
  { module: 'scenario',  label: 'Scenario',  Icon: FlaskConical },
  { module: 'rule',      label: 'Rule',      Icon: ScrollText },
  { module: 'data',      label: 'Data',      Icon: Database },
  { module: 'system',    label: 'System',    Icon: Settings2 },
]

const NavDivider = () => <div className="mx-1.5 h-4 w-px bg-border/60 shrink-0" />

export const ShellTopNav = () => {
  const activeModule = useShellStore((s) => s.activeModule)
  const openTabs     = useShellStore((s) => s.openTabs)
  const setModule    = useShellStore((s) => s.setModule)
  const closeTab     = useShellStore((s) => s.closeTab)
  const toggleTopNav = useShellStore((s) => s.toggleTopNav)
  const user = useAuthStore((s) => s.user)

  return (
    <TooltipProvider delayDuration={250}>
      <header className="flex h-11 shrink-0 items-center border-b border-border bg-card px-2 gap-0.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

        {/* Brand logo */}
        <div className="flex items-center select-none cursor-default border-r border-border pr-3 mr-2 shrink-0">
          <AirlineLogo
            schema={user?.schema}
            height={28}
            fallback="none"
            className="shrink-0"
          />
        </div>

        {/* Module nav — tab style; open tabs show close button */}
        {NAV_ITEMS.map(({ module, label, Icon }) => {
          const isActive = module === activeModule
          const isOpen   = openTabs.includes(module)
          const canClose = isOpen && openTabs.length > 1
          return (
            <div
              key={module}
              className={[
                'group flex h-[28px] shrink-0 items-center rounded-sm text-[11.5px] font-medium whitespace-nowrap transition-all duration-100',
                isActive
                  ? 'bg-accent text-foreground font-semibold pl-2.5 pr-1.5'
                  : isOpen
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground pl-2.5 pr-1.5'
                    : 'text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground px-2.5',
              ].join(' ')}
            >
              <button
                className="flex items-center gap-1.5"
                onClick={() => setModule(module)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
              {canClose && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); closeTab(module) }}
                  className={[
                    'ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-all duration-100',
                    isActive
                      ? 'text-foreground/50 hover:bg-muted hover:text-foreground'
                      : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted/60 hover:text-foreground',
                  ].join(' ')}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          )
        })}

        <div className="flex-1" />

        {/* Right controls */}
        <ThemeSwitcher />
        <NavDivider />
        <span className="px-1 text-[11px] text-muted-foreground whitespace-nowrap">
          {user?.userCode ?? '—'} · {user?.schema?.toUpperCase() ?? ''}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
              onClick={() => useAuthStore.getState().logout()}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Sign Out</TooltipContent>
        </Tooltip>

        <NavDivider />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-100"
              onClick={toggleTopNav}
            >
              <PanelTopClose className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Hide Nav</TooltipContent>
        </Tooltip>

      </header>
    </TooltipProvider>
  )
}
```

- [ ] **Step 1.3: Remove ShellTabBar from app-shell.tsx**

In `gantt/src/components/shell/app-shell.tsx`:

Remove the import:
```typescript
import { ShellTabBar } from './shell-tab-bar'  // ← DELETE this line
```

Remove the `<ShellTabBar />` JSX element — it appears between the TopNav block and the workspace div:
```typescript
<ShellTabBar />  // ← DELETE this line
```

The `topNavVisible` animated wrapper stays unchanged — it now wraps just `<ShellTopNav />` which is the merged bar.

- [ ] **Step 1.4: Remove Tab Bar controls from shell-sidebar.tsx**

In `gantt/src/components/shell/shell-sidebar.tsx`, remove the three lines that read `tabBarVisible`/`toggleTabBar`:

```typescript
// DELETE these three lines (around line 70-72):
const tabBarVisible   = useShellStore((s) => s.tabBarVisible)
const toggleTabBar    = useShellStore((s) => s.toggleTabBar)
```

Also remove the TabBar toggle button block. It looks like this (around line 120-132):
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button
      className="..."
      onClick={toggleTabBar}
    >
      {tabBarVisible
        ? <PanelBottomClose className="h-3.5 w-3.5" />
        : <PanelBottomOpen className="h-3.5 w-3.5" />}
    </button>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="text-xs">
    {tabBarVisible ? 'Hide Tab Bar' : 'Show Tab Bar'}
  </TooltipContent>
</Tooltip>
```

Remove the unused icon imports `PanelBottomClose`, `PanelBottomOpen` from the lucide-react import at the top of the file if they are no longer referenced elsewhere in the file.

- [ ] **Step 1.5: Delete shell-tab-bar.tsx**

```bash
rm gantt/src/components/shell/shell-tab-bar.tsx
```

- [ ] **Step 1.6: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. If errors appear, they will be about `tabBarVisible`/`toggleTabBar` references not yet cleaned up — fix each one.

- [ ] **Step 1.7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/stores/shell-store.ts \
        gantt/src/components/shell/shell-top-nav.tsx \
        gantt/src/components/shell/app-shell.tsx \
        gantt/src/components/shell/shell-sidebar.tsx
git rm gantt/src/components/shell/shell-tab-bar.tsx
git commit -m "$(cat <<'EOF'
refactor(gantt): merge TopNav + TabBar into single 44px navigation bar

Removes the separate 34px ShellTabBar row. All 6 module buttons now live
in ShellTopNav with tab-style appearance; open modules show a close button.
Removes tabBarVisible/toggleTabBar from shell-store.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Merge PaneHeader + PaneToolbar

**Context before touching code:**

Each pane currently has two React rows before the Canvas:
- `PaneHeader` (`h-8` = 32px, in `pane-wrapper.tsx`): drag handle + pane title + close button
- `PaneToolbar` (`h-8` = 32px, in each pane component): color bar + label + count badges + sort/search/columns/float

After merge: single `h-8` row — drag handle + color bar + title + count badges + sort/search/columns/close

The approach: add optional drag/close props to `PaneToolbar`; remove `PaneHeader` from `PaneWrapper` and instead pass drag callbacks down through pane components.

The drag system: `PaneWrapper` already knows `paneId` and can call `useLayoutStore`'s `startDrag(paneId, e)`, `endDrag()`, `closePane(paneId)`. These are moved here from `PaneHeader`.

**Files:**
- Modify: `gantt/src/components/layout/pane-toolbar.tsx`
- Modify: `gantt/src/components/layout/pane-wrapper.tsx`
- Modify: `gantt/src/components/panes/roster-pane.tsx`
- Modify: `gantt/src/components/panes/pairing-pane.tsx`
- Modify: `gantt/src/components/panes/flight-pane.tsx`
- Delete: `gantt/src/components/layout/pane-header.tsx`

---

- [ ] **Step 2.1: Add drag/close props to PaneToolbar**

In `gantt/src/components/layout/pane-toolbar.tsx`:

Add `X` to the lucide-react imports at the top (it may already be there — check the import line and add if missing):
```typescript
import { ArrowUpDown, Search, ChevronsUpDown, Settings2, ExternalLink, PanelBottomOpen, List, Filter, Download, X } from 'lucide-react'
```

Add three new optional props to the `PaneToolbarProps` interface (add before the closing `}`):
```typescript
interface PaneToolbarProps {
  // ... all existing props unchanged ...
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}
```

Destructure the new props in the `PaneToolbar` component signature:
```typescript
export const PaneToolbar = ({
  paneType,
  title,
  sortLabel,
  onSortClick,
  onSearchClick,
  extraActions,
  onFloatToggle,
  isFloating,
  unfilteredTotal,
  matchedTotal,
  loadedCount,
  filterChips,
  queryMode,
  onClearAll,
  onRemoveFilter,
  onQueryModeToggle,
  draggable,
  onDragStart,
  onDragEnd,
  onClose,
}: PaneToolbarProps) => {
```

Replace the existing `Row 1` div (the outer `<div className="flex h-8 shrink-0 ...">`) with this version that wires drag and close:

```tsx
{/* Row 1: Title bar with badges and actions */}
<div
  className={[
    'flex h-8 shrink-0 items-center justify-between border-b bg-muted/30 px-2',
    draggable ? 'cursor-grab select-none' : '',
  ].join(' ')}
  draggable={draggable}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
>
  <div className="flex items-center gap-1.5">
    {/* Drag indicator */}
    {draggable && (
      <span className="text-muted-foreground/40 text-sm leading-none mr-0.5">⠿</span>
    )}
    {/* Pane type color indicator */}
    <span
      className="inline-block h-3 w-1.5 rounded-sm shrink-0"
      style={{ backgroundColor: PANE_TYPE_COLORS[paneType] }}
    />
    {/* Title */}
    <span className="text-[11px] font-semibold text-foreground">{title}</span>

    {/* Count badges */}
    <div className="ml-2 flex items-center gap-1">
      {unfilteredTotal !== undefined && (
        <div
          className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground"
          title="Total in date range"
        >
          <List className="h-3 w-3" />
          <span>{unfilteredTotal}</span>
        </div>
      )}
      {showMatchedBadge && (
        <div
          className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-[10px] text-amber-400"
          title="Matching search filters"
        >
          <Filter className="h-3 w-3" />
          <span>{matchedTotal}</span>
        </div>
      )}
      {loadedCount !== undefined && (
        <div
          className="inline-flex items-center gap-0.5 rounded bg-blue-500/10 px-1 text-[10px] text-blue-400"
          title="Loaded in view"
        >
          <Download className="h-3 w-3" />
          <span>{loadedCount}</span>
        </div>
      )}
    </div>
  </div>

  <div className="flex items-center gap-0.5">
    {/* Query mode toggle */}
    {onQueryModeToggle && (
      <button
        className={`inline-flex h-5 items-center justify-center rounded-md px-1 text-[9px] font-medium transition-all duration-100 hover:bg-accent/60 active:scale-95 ${
          queryMode === 'append'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-muted-foreground'
        }`}
        onClick={onQueryModeToggle}
        title={`Query mode: ${queryMode === 'append' ? 'Append (add to results)' : 'Replace (new results)'}`}
      >
        {queryMode === 'append' ? 'APPEND' : 'REPLACE'}
      </button>
    )}
    {onSortClick && (
      <button
        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
        onClick={onSortClick}
        title="Sort"
      >
        <ArrowUpDown className="h-3 w-3" />
      </button>
    )}
    {onSearchClick && (
      <button
        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
        onClick={onSearchClick}
        title="Search"
      >
        <Search className="h-3 w-3" />
      </button>
    )}
    {extraActions}
    {onFloatToggle && (
      <button
        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
        onClick={onFloatToggle}
        title={isFloating ? 'Dock back' : 'Float pane'}
      >
        {isFloating
          ? <PanelBottomOpen className="h-3 w-3" />
          : <ExternalLink className="h-3 w-3" />}
      </button>
    )}
    <button
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
      onClick={() => setColumnConfigOpen(true)}
      title="Column settings"
    >
      <Settings2 className="h-3 w-3" />
    </button>
    {/* Close button — shown when onClose is provided (drag layout mode) */}
    {onClose && (
      <button
        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-destructive/20 hover:text-destructive active:scale-95"
        onClick={onClose}
        title="Close pane"
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
</div>
```

Note: `showMatchedBadge` is already computed inside the component body (before the return). Leave that line unchanged.

- [ ] **Step 2.2: Rewrite pane-wrapper.tsx**

Replace the entire file:

```typescript
// gantt/src/components/layout/pane-wrapper.tsx

import { RosterPane } from '@/components/panes/roster-pane'
import { PairingPane } from '@/components/panes/pairing-pane'
import { FlightPane } from '@/components/panes/flight-pane'
import { useLayoutStore } from '@/stores/layout-store'
import type { PaneType } from '@/types/layout'

interface PaneWrapperProps {
  paneId: string
  row: number
}

interface PaneDragProps {
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClose: () => void
}

const renderPaneContent = (type: PaneType, paneId: string, dragProps: PaneDragProps) => {
  switch (type) {
    case 'roster':  return <RosterPane  paneId={paneId} {...dragProps} />
    case 'pairing': return <PairingPane paneId={paneId} {...dragProps} />
    case 'flight':  return <FlightPane  paneId={paneId} {...dragProps} />
  }
}

export const PaneWrapper = ({ paneId }: PaneWrapperProps) => {
  const pane       = useLayoutStore((s) => s.panes.get(paneId))
  const totalPanes = useLayoutStore((s) => s.panes.size)
  const startDrag  = useLayoutStore((s) => s.startDrag)
  const endDrag    = useLayoutStore((s) => s.endDrag)
  const closePane  = useLayoutStore((s) => s.closePane)

  if (!pane) return null

  const dragProps: PaneDragProps = {
    draggable: totalPanes > 1,
    onDragStart: (e: React.DragEvent) => startDrag(paneId, e as unknown as DragEvent),
    onDragEnd: endDrag,
    onClose: () => closePane(paneId),
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      {renderPaneContent(pane.type, paneId, dragProps)}
    </div>
  )
}
```

Note: `row` prop is removed from `PaneWrapperProps` since it was only used by PaneHeader. Check if any callers pass `row` — if they do, keep the prop in the interface but mark it unused (add `_row` or just ignore). Looking at `grid-cell.tsx`, it calls `<PaneWrapper paneId={paneId} row={row} />`, so keep `row` in the interface but don't use it to avoid a TS error at the call site:

```typescript
interface PaneWrapperProps {
  paneId: string
  row: number  // kept for caller compatibility; unused after PaneHeader removal
}

export const PaneWrapper = ({ paneId }: PaneWrapperProps) => {
```

- [ ] **Step 2.3: Add drag props to RosterPane**

In `gantt/src/components/panes/roster-pane.tsx`:

Update the `RosterPaneProps` interface:
```typescript
interface RosterPaneProps {
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}
```

Destructure the new props from the function signature:
```typescript
export const RosterPane = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: RosterPaneProps) => {
```

Pass them to `PaneToolbar` (around line 607):
```typescript
<PaneToolbar
  paneType={legacyPaneType}
  title={legacyPaneType === 'roster-main' ? 'Roster Main' : 'Roster Sub'}
  unfilteredTotal={unfilteredTotal}
  matchedTotal={getMatchedTotal()}
  loadedCount={getLoadedCount()}
  filterChips={filterChips}
  queryMode={queryMode}
  onClearAll={clearFilters}
  onRemoveFilter={(sessionId, key) => removeFilter(Number(sessionId), key as keyof CrewFilters)}
  onQueryModeToggle={() => setQueryMode(queryMode === 'replace' ? 'append' : 'replace')}
  draggable={draggable}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onClose={onClose}
/>
```

- [ ] **Step 2.4: Add drag props to PairingPane**

In `gantt/src/components/panes/pairing-pane.tsx`:

Update `PairingPaneProps`:
```typescript
interface PairingPaneProps {
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}
```

Destructure in function signature:
```typescript
export const PairingPane = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: PairingPaneProps) => {
```

Pass to `PaneToolbar` (around line 504):
```typescript
<PaneToolbar
  paneType={legacyPaneType}
  title="Pairing"
  unfilteredTotal={unfilteredTotal}
  matchedTotal={getMatchedTotal()}
  loadedCount={getLoadedCount()}
  filterChips={filterChips}
  sortLabel={sortLabel}
  queryMode={queryMode}
  onClearAll={clearFilters}
  onRemoveFilter={(sessionId, key) => removeFilter(Number(sessionId), key as keyof PairingFilters)}
  onQueryModeToggle={() => setQueryMode(queryMode === 'replace' ? 'append' : 'replace')}
  draggable={draggable}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onClose={onClose}
/>
```

- [ ] **Step 2.5: Add drag props to FlightPane**

In `gantt/src/components/panes/flight-pane.tsx`:

First, read the current `FlightPaneProps` interface and `PaneToolbar` call in that file to find the exact lines (the interface is near the top, toolbar call is around line 427).

Update `FlightPaneProps`:
```typescript
interface FlightPaneProps {
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}
```

Destructure in function signature:
```typescript
export const FlightPane = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: FlightPaneProps) => {
```

Pass to `PaneToolbar` — add these four props to the existing `<PaneToolbar .../>` call:
```typescript
  draggable={draggable}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onClose={onClose}
```

- [ ] **Step 2.6: Delete pane-header.tsx**

```bash
rm gantt/src/components/layout/pane-header.tsx
```

- [ ] **Step 2.7: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. Common issues to look for:
- Any file that still imports from `./pane-header` or `@/components/layout/pane-header`
- `row` prop warning in `pane-wrapper.tsx` if the parameter is unused (fix with destructuring `{ paneId }`)
- Missing `X` import in `pane-toolbar.tsx` (already in the lucide imports — verify)

- [ ] **Step 2.8: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/components/layout/pane-toolbar.tsx \
        gantt/src/components/layout/pane-wrapper.tsx \
        gantt/src/components/panes/roster-pane.tsx \
        gantt/src/components/panes/pairing-pane.tsx \
        gantt/src/components/panes/flight-pane.tsx
git rm gantt/src/components/layout/pane-header.tsx
git commit -m "$(cat <<'EOF'
refactor(gantt): merge PaneHeader into PaneToolbar, save ~32px per pane

Removes the separate PaneHeader (h-8) row from each pane. Drag-handle
and close-button functionality is folded into PaneToolbar via new optional
draggable/onDragStart/onDragEnd/onClose props threaded from PaneWrapper.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
