// gantt/src/components/panes/roster-pane.tsx
//
// Thin wrapper (Phase R3): delegates all roster rendering + interaction to
// SharedRosterPane via the Live RosterPaneSource. The heavy data pipeline (crew
// ordering, panel rows, two-source violation merge, locks, session tags, hit-test,
// drag, context-menu, status line) now lives in:
//   - makeLiveRosterPaneSource: components/gantt/source/live-gantt-source.ts
//   - SharedRosterPane: components/panes/shared/roster-pane.tsx
//
// This file keeps the Live-only CHROME (PaneToolbar with crew counts, PaneLoadingBar,
// session filter chips, query-mode toggle, Alert Center / ViolationListDialog, global
// filter dialog routed through the shell store) — all passed into SharedRosterPane via
// the toolbar render-prop + the optional `liveChrome` bundle, so the scenario render path
// stays byte-identical (it supplies none of these).

import { useCallback, useMemo, useState } from 'react'
import { useLiveGanttSource } from '@/components/gantt/source/live-gantt-source'
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { SharedRosterPane, type LiveRosterChrome } from '@/components/panes/shared/roster-pane'
import { PaneToolbar, type FilterChip, type SortChip, type GlobalFilterChip } from './pane-toolbar'
import { PaneLoadingBar } from './pane-loading-bar'
import { VerticalSplitter } from '@/components/layout/vertical-splitter'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useFilterStore, hasCrewFilterValues } from '@/stores/filter-store'
import { useShellStore } from '@/stores/shell-store'
import { usePaneStore } from '@/stores/pane-store'
import { useUiStore } from '@/stores/ui-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useColumnStore } from '@/stores/column-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { applyGanttFilters } from '@/utils/apply-filters'
import { buildGlobalFilterChips } from '@/utils/global-filter-chips'
import { RosterBulkDeleteDialog } from '@/components/roster/roster-bulk-delete-dialog'
import type { PaneType as LegacyPaneType } from '@/types/pane'
import type { CrewFilters } from '@/types/crew'
import type { RosterItem } from '@/types'

interface RosterPaneProps {
  /** Unique pane instance ID (e.g., 'roster-1', 'roster-2') */
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

/**
 * Live Roster Pane — thin wrapper around SharedRosterPane.
 */
export const RosterPane = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: RosterPaneProps) => {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  // Derive legacy pane type from layout: roster in grid row 0 → 'roster-main', row 1 → 'roster-sub'.
  const pane = useLayoutStore((s) => s.panes.get(paneId))
  const grid = useLayoutStore((s) => s.grid)
  const legacyPaneType: 'roster-main' | 'roster-sub' = useMemo(() => {
    if (!pane || pane.type !== 'roster') return 'roster-main'
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < 2; col++) {
        if (grid[row]?.[col] === paneId) return row === 0 ? 'roster-main' : 'roster-sub'
      }
    }
    return 'roster-main'
  }, [pane, paneId, grid])

  // Source bound to this pane's legacyPaneType + paneId so source.roster reads the right data.
  const source = useLiveGanttSource(legacyPaneType, paneId)

  // ── Toolbar (crew counts + loading bar) ─────────────────────────────────────
  const rosterKey = legacyPaneType === 'roster-main' ? 'main' as const : 'sub' as const
  const loading = useRosterStore((s) => s[rosterKey].loading)
  const rosterProgress = useRosterStore((s) => s[rosterKey].progress)
  const crewLoading = useCrewStore((s) => s.loading)
  const loadingMore = useCrewStore((s) => s.loadingMore)
  const unfilteredTotal = useCrewStore((s) => s.unfilteredTotal)
  const filteredTotal = useCrewStore((s) => s.total)
  const globalFilterActive = useFilterStore((s) => !!s.appliedFilters && hasCrewFilterValues(s.appliedFilters.crew))
  const getMatchedTotal = useCrewStore((s) => s.getMatchedTotal)
  const getLoadedCount = useCrewStore((s) => s.getLoadedCount)
  const queryMode = useCrewStore((s) => s.queryMode)
  const clearFilters = useCrewStore((s) => s.clearFilters)
  const removeFilter = useCrewStore((s) => s.removeFilter)
  const sessions = useCrewStore((s) => s.sessions)
  const activeGlobalFilter = useCrewStore((s) => s.activeGlobalFilter)
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const dropTargetRow = usePaneStore((s) => s.getDropTargetRow(legacyPaneType))
  const allColumns = useColumnStore((s) => s.getColumns(legacyPaneType))
  const sortCriteria = usePaneStore((s) => s.getSortCriteria(legacyPaneType))
  const removeSortCriterion = usePaneStore((s) => s.removeSortCriterion)
  const setHoveredCrew = useGanttViewStore((s) => s.setHoveredCrew)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  // Session-derived filter chips
  const filterChips = useMemo((): FilterChip[] =>
    sessions.flatMap((session, sessionIndex) =>
      Object.entries(session.filters)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([key, value]) => ({
          sessionId: String(session.id),
          sessionIndex,
          key,
          value: String(value),
        })),
    ),
  [sessions])

  const globalFilterChips = useMemo<GlobalFilterChip[]>(() =>
    buildGlobalFilterChips(
      activeGlobalFilter,
      [
        { dim: 'bases', label: 'Base' },
        { dim: 'ranks', label: 'Rank' },
        { dim: 'fleets', label: 'Fleet' },
        { dim: 'divisions', label: 'Division' },
      ],
      (dim, value) => {
        const fs = useFilterStore.getState()
        fs.setCrewFilter({ [dim]: fs.crew[dim].filter((v) => v !== value) })
        void applyGanttFilters()
      },
    ),
  [activeGlobalFilter])

  const sortChips = useMemo<SortChip[]>(() =>
    sortCriteria.map((c) => ({
      key: c.column,
      label: allColumns.find((col) => col.key === c.column)?.label ?? c.column.toUpperCase(),
      direction: c.direction,
      onRemove: () => removeSortCriterion(legacyPaneType, c.column),
    })),
  [sortCriteria, allColumns, legacyPaneType, removeSortCriterion])

  const sortFields = useMemo(() => allColumns.map((c) => ({ key: c.key, label: c.label })), [allColumns])

  const handleQueryModeToggle = useCallback(() => {
    const s = useCrewStore.getState()
    s.setQueryMode(s.queryMode === 'replace' ? 'append' : 'replace')
  }, [])
  const handleRemoveFilter = useCallback(
    (sessionId: string, key: string) => removeFilter(Number(sessionId), key as keyof CrewFilters),
    [removeFilter],
  )
  const handleFilterOpen = useCallback(() => useShellStore.getState().openFilterDialog('crew'), [])
  const handleHeaderRowRightClick = useCallback((rowIndex: number, crewId: string, cx: number, cy: number) => {
    const mockTask = { id: -1, crewId } as RosterItem
    openContextMenu(cx, cy, mockTask, legacyPaneType, rowIndex)
  }, [openContextMenu, legacyPaneType])
  const handleViolationHover = useCallback((rowId: string | null, cx: number, cy: number) => {
    setHoveredCrew(rowId ?? '', cx, cy)
  }, [setHoveredCrew])
  const handleBulkDeleteOpen = useCallback(() => setBulkDeleteOpen(true), [])

  const toolbar = useMemo(() => (_rowCount: number) => (
    <PaneToolbar
      paneType={legacyPaneType}
      title={legacyPaneType === 'roster-main' ? 'Roster' : 'Roster Sub'}
      unfilteredTotal={unfilteredTotal}
      filteredTotal={filteredTotal}
      globalFilterActive={globalFilterActive}
      matchedTotal={getMatchedTotal()}
      loadedCount={getLoadedCount()}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  ), [legacyPaneType, unfilteredTotal, filteredTotal, globalFilterActive, getMatchedTotal, getLoadedCount, draggable, onDragStart, onDragEnd])

  const liveChrome = useMemo<LiveRosterChrome>(() => ({
    loadingBar: <PaneLoadingBar progress={rosterProgress} />,
    filterChips,
    queryMode,
    onQueryModeToggle: handleQueryModeToggle,
    onRemoveFilter: handleRemoveFilter,
    onFilterClick: handleFilterOpen,
    globalFilterChips,
    onClearAll: clearFilters,
    showFrozenQuickFilter: true,
    frozenLabel: 'Frozen rows only',
    loadingMore,
    enableRubberBand: true,
    onHeaderRowRightClick: handleHeaderRowRightClick,
    onViolationHover: handleViolationHover,
    sortFields,
    sortChips,
    dropTargetRow,
    onRosterBulkDeleteClick: handleBulkDeleteOpen,
  }), [
    loading, crewLoading, rosterProgress, filterChips, queryMode, handleQueryModeToggle, handleRemoveFilter,
    handleFilterOpen, globalFilterChips, clearFilters,
    loadingMore, handleHeaderRowRightClick, handleViolationHover, sortFields,
    sortChips, dropTargetRow, handleBulkDeleteOpen,
  ])

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="roster-pane">
      <GanttSourceProvider value={source}>
        <SharedRosterPane
          paneId={paneId}
          contextId="live"
          leftPanelWidth={leftPanelWidth}
          onClose={onClose}
          canvasTestId="roster-canvas"
          livePaneType={legacyPaneType}
          toolbar={toolbar}
          splitter={<VerticalSplitter />}
          liveChrome={liveChrome}
        />
        <RosterBulkDeleteDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} />
      </GanttSourceProvider>
    </div>
  )
}
