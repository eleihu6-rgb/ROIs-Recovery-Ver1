// gantt/src/components/panes/flight-pane.tsx
//
// Thin wrapper: delegates to SharedFlightPane with Live-specific toolbar and splitter.
// The heavy implementation now lives in src/components/panes/shared/flight-pane.tsx.
// This file is kept for backward compat with pane-wrapper.tsx / app-layout.tsx / pane-container.tsx.

import { useMemo, useCallback } from 'react'
import { useFlightStore } from '@/stores/flight-store'
import { useFilterStore, hasFlightFilterValues } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useUiStore } from '@/stores/ui-store'
import { PaneToolbar } from './pane-toolbar'
import { PaneLoadingBar } from './pane-loading-bar'
import { VerticalSplitter } from '@/components/layout/vertical-splitter'
import { SharedFlightPane } from './shared/flight-pane'

interface FlightPaneProps {
  /** Unique pane instance ID (e.g., 'flight', 'flight-1') */
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

/**
 * Live Flight Pane.
 *
 * Thin wrapper around SharedFlightPane that provides Live-specific chrome:
 * - PaneToolbar with flight counts + draggable header
 * - PaneLoadingBar for initial data load
 * - VerticalSplitter between header-canvas and gantt-canvas
 *
 * All flight-data logic, scroll, zoom, drag registration, and status-bar formatting
 * is now handled inside SharedFlightPane via the Live FlightPaneSource.
 */
export const FlightPane = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: FlightPaneProps) => {
  const loading = useFlightStore((s) => s.loading)
  const unfilteredTotal = useFlightStore((s) => s.unfilteredFlightTotal)
  const filteredTotal = useFlightStore((s) => s.flightTotal)
  const globalFilterActive = useFilterStore((s) => !!s.appliedFilters && hasFlightFilterValues(s.appliedFilters.flight))
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const handleNaviClick = useCallback(() => useUiStore.getState().openFlightNavi(), [])

  // Title badge = flight legs only (flightTotal). Do not pass matchedTotal/loadedCount —
  // those are RegNo row counts and would show a second row-count badge.
  const toolbar = useMemo(() => (_rowCount: number) => (
    <>
      <PaneToolbar
        paneType="flight"
        title="Flight"
        unfilteredTotal={unfilteredTotal}
        filteredTotal={filteredTotal}
        globalFilterActive={globalFilterActive}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <PaneLoadingBar progress={null} />
    </>
  ), [
    unfilteredTotal,
    filteredTotal,
    globalFilterActive,
    draggable,
    onDragStart,
    onDragEnd,
    loading,
  ])

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="flight-pane">
      <SharedFlightPane
        paneId={paneId}
        contextId="live"
        leftPanelWidth={leftPanelWidth}
        onClose={onClose}
        toolbar={toolbar}
        splitter={<VerticalSplitter />}
        canvasTestId="flight-canvas"
        onNaviClick={handleNaviClick}
      />
    </div>
  )
}
