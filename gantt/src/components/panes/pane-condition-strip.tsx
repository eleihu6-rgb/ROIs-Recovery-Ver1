import { memo, useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Filter, Settings2, X, SlidersHorizontal, Navigation, Bell, Gauge, RefreshCw, ShieldPlus, ListX, Trash2 } from 'lucide-react'
import { ColumnConfigDialog } from '@/components/common/column-config-dialog'
import { usePaneStore } from '@/stores/pane-store'
import { SESSION_COLORS } from '@/stores/pairing-store'
import { publishChromeCommit } from '@/utils/gantt-test-hook'
import { HEADER_HEIGHT, SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'
import { PANE_LABELS } from '@/types/pane'
import type { PaneType } from '@/types/pane'
import type { FilterChip, SortChip, GlobalFilterChip } from './pane-toolbar'

interface PaneConditionStripProps {
  paneType: PaneType
  /** Optional override for left panel width (used by scenario panes with their own layout store) */
  leftPanelWidth?: number
  /** Optional sort label (legacy text indicator, when provided) */
  sortLabel?: string
  /** Active filter chips with session colors */
  filterChips?: FilterChip[]
  /** Active global-filter chips (base/rank/fleet/division applied via the Filter dialog) */
  globalFilterChips?: GlobalFilterChip[]
  /** Active sort chips (priority-ordered) */
  sortChips?: SortChip[]
  /** Quick filter chips (per-pane client-side filter) */
  quickFilterChips?: { key: string; label: string; onRemove: () => void }[]
  /** Query mode for search/add operations */
  queryMode?: 'replace' | 'append'
  onQueryModeToggle?: () => void
  /** Open the global Filter dialog pre-switched to this pane's tab */
  onFilterClick?: () => void
  onSortClick?: () => void
  /** Whether the quick filter panel is open */
  quickFilterOpen?: boolean
  onQuickFilterToggle?: () => void
  onClearAll?: () => void
  onRemoveFilter?: (sessionId: string, key: string) => void
  /** Open the Flight Navi table (flight pane only) */
  onNaviClick?: () => void
  /** Open the Legality Alert Center (roster panes only) — lists loaded violations. */
  onViolationsClick?: () => void
  /** Count of violation messages currently loaded (badge on the alert button). */
  violationCount?: number
  /** Open the Roster Quality Analyzer (scenario roster pane only). */
  onQualityClick?: () => void
  /** Count of crew with open quality findings (badge on the quality button). */
  qualityIssueCount?: number
  /** Force a legality recheck (scenario roster pane only). Renders the Recheck button. */
  onRecheck?: () => void
  /** Recheck in flight → disable + spin the Recheck button. */
  recheckComputing?: boolean
  /** Rule params changed since last check → tint the button + show the outdated dot. */
  recheckStale?: boolean
  /** Recheck has been COMPUTING longer than expected — re-enables the button even
   *  though `recheckComputing` is still true (see stuck-button-recovery spec). */
  recheckStuck?: boolean
  /** Open the RES Pairing Creator planner (Live pairing pane only). */
  onResPairingClick?: () => void
  /** Toggle compact overlap lanes in roster panes. */
  overlapLanes?: boolean
  onOverlapLanesToggle?: () => void
  /** Open Live roster bulk-delete dialog. */
  onRosterBulkDeleteClick?: () => void
  rosterBulkDeleteDisabled?: boolean
  rosterBulkDeleteIcon?: React.ReactNode
  rosterBulkDeleteTitle?: string
  /** Close this pane — set by PaneWrapper */
  onClose?: () => void
}

/**
 * Condition strip rendered as an overlay on the canvas header band
 * (the 30px strip right of the crew-list/canvas "virtual line", where the
 * timeline used to be — the timeline now lives in the pane title row).
 *
 * Left side: filter / global-filter / sort / quick-filter chips.
 * Right side: pane action cluster (REPLACE, sort, quick filter,
 * column settings, close), moved down from the title row.
 *
 * The outer element is pointer-events-none so the left-panel column headers
 * underneath stay clickable; the inner content area re-enables pointer events.
 *
 * F54-P04: memoized — chips arrays and callbacks are stabilized by the panes
 * (useMemo/useCallback), so scroll-driven pane re-renders skip this subtree.
 */
export const PaneConditionStrip = memo(({
  paneType,
  leftPanelWidth: leftPanelWidthOverride,
  sortLabel,
  filterChips,
  globalFilterChips,
  sortChips,
  quickFilterChips,
  queryMode,
  onQueryModeToggle,
  onFilterClick,
  onSortClick,
  quickFilterOpen,
  onQuickFilterToggle,
  onClearAll,
  onRemoveFilter,
  onNaviClick,
  onViolationsClick,
  violationCount,
  onQualityClick,
  qualityIssueCount,
  onRecheck,
  recheckComputing,
  recheckStale,
  recheckStuck,
  onResPairingClick,
  overlapLanes,
  onOverlapLanesToggle,
  onRosterBulkDeleteClick,
  rosterBulkDeleteDisabled = false,
  rosterBulkDeleteIcon,
  rosterBulkDeleteTitle = 'Bulk delete roster flights',
  onClose,
}: PaneConditionStripProps) => {
  publishChromeCommit(`strip:${paneType}`)
  const [columnConfigOpen, setColumnConfigOpen] = useState(false)
  const storeLeftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const leftPanelWidth = leftPanelWidthOverride ?? storeLeftPanelWidth

  const hasFilters = filterChips && filterChips.length > 0

  // ── F54-P06: nowrap strip + "+N" overflow popover ─────────────────────────
  // Chips render on a single non-wrapping line; chips that don't fit are clipped
  // and counted, and a "+N" button opens a popover listing ALL chips (so every
  // remove/clear action stays reachable).
  const chipsRowRef = useRef<HTMLDivElement>(null)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const totalChips =
    (filterChips?.length ?? 0) + (globalFilterChips?.length ?? 0) +
    (sortChips?.length ?? 0) + (quickFilterChips?.length ?? 0)

  useEffect(() => {
    const el = chipsRowRef.current
    if (!el) return
    const recompute = () => {
      // Note: offsetLeft would be relative to the positioned strip overlay (incl. the
      // left-panel padding), so measure in viewport coordinates instead.
      const limit = el.getBoundingClientRect().right
      let hidden = 0
      for (const child of el.children) {
        if ((child as HTMLElement).getBoundingClientRect().right > limit + 1) hidden++
      }
      setHiddenCount(hidden)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [totalChips, sortLabel, leftPanelWidth])

  // Close the overflow popover when it empties or on outside click
  useEffect(() => {
    if (!overflowOpen) return
    if (totalChips === 0) {
      setOverflowOpen(false)
      return
    }
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-chip-overflow]')) setOverflowOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [overflowOpen, totalChips])

  /** All chips, rendered identically in the strip row and in the overflow popover. */
  const renderChips = () => (
    <>
      {filterChips?.map((chip, index) => {
        const sessionColor = SESSION_COLORS[chip.sessionIndex % SESSION_COLORS.length]
        return (
          <div
            key={`${chip.sessionId}-${chip.key}-${index}`}
            data-testid="pane-filter-chip"
            title={`${chip.key}: ${chip.value}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium"
            style={{ backgroundColor: sessionColor, color: '#fff' }}
          >
            <span>{chip.value}</span>
            {onRemoveFilter && (
              <button
                className="inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/20"
                onClick={() => onRemoveFilter(chip.sessionId, chip.key)}
                title="Remove filter"
              >
                <X className="h-2 w-2" />
              </button>
            )}
          </div>
        )
      })}

      {globalFilterChips?.map((chip) => {
        // For assignment-dimension chips (id = "assignments:PRAM" etc.) expose a
        // per-code testid so acceptance tests can assert each specific code filter.
        const assignmentCode = chip.id.startsWith('assignments:') ? chip.id.slice('assignments:'.length) : null
        return (
        <div
          key={chip.id}
          data-testid={assignmentCode ? `pairing-filter-chip-${assignmentCode}` : 'pane-filter-chip'}
          title={`${chip.label}: ${chip.value}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-medium text-primary-foreground"
        >
          <span>{chip.value}</span>
          <button
            className="inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/20"
            onClick={chip.onRemove}
            title={`Remove ${chip.label} filter`}
          >
            <X className="h-2 w-2" />
          </button>
        </div>
      )
      })}

      {sortChips?.map((chip) => (
        <div
          key={`sort-${chip.key}`}
          data-testid="pane-sort-chip"
          title={`Sorted by ${chip.label} (${chip.direction === 'asc' ? 'ascending' : 'descending'})`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-secondary-foreground"
        >
          <span>{chip.direction === 'asc' ? '↑' : '↓'} {chip.label}</span>
          <button
            className="inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-foreground/10"
            onClick={chip.onRemove}
            title="Remove sort"
          >
            <X className="h-2 w-2" />
          </button>
        </div>
      ))}

      {/* Quick filter chips (per-pane client-side filter) */}
      {quickFilterChips?.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-2xs text-amber-400"
        >
          <span>{chip.label}</span>
          <button
            className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm hover:bg-amber-500/20"
            onClick={chip.onRemove}
            title={`Remove ${chip.key} filter`}
          >
            <X className="h-2 w-2" />
          </button>
        </span>
      ))}
    </>
  )

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center"
        style={{ height: HEADER_HEIGHT, paddingLeft: leftPanelWidth + SPLITTER_WIDTH }}
        data-testid="pane-condition-strip"
      >
        <div className="pointer-events-auto flex h-full min-w-0 flex-1 items-center gap-1 pl-1 pr-2">
          {/* Optional sort label (legacy text indicator, when provided) */}
          {sortLabel && (
            <span className="text-2xs text-muted-foreground mr-1 shrink-0">Sorted: {sortLabel}</span>
          )}

          {/* Chips — single non-wrapping line; overflow collapses into "+N" (F54-P06) */}
          <div ref={chipsRowRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
            {renderChips()}
          </div>

          {/* "+N" overflow indicator — opens a popover with ALL chips */}
          {hiddenCount > 0 && (
            <button
              data-testid="chip-overflow-button"
              data-chip-overflow
              className="inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setOverflowOpen((o) => !o)}
              title={`${hiddenCount} more condition${hiddenCount > 1 ? 's' : ''}`}
            >
              +{hiddenCount}
            </button>
          )}

          {/* Clear all filters — always visible, outside the clipped chip row */}
          {onClearAll && hasFilters && (
            <button
              className="shrink-0 text-2xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClearAll}
            >
              Clear all
            </button>
          )}

          {/* Action cluster — right-aligned (moved down from the title row) */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {/* Legality Recheck — force a recompute (scenario roster pane only). Lives here next
                to the Alert Center bell, NOT in its own row (§Pane-Toolbar-Home). */}
            {onRecheck && (
              <button
                className={[
                  'relative inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100 hover:bg-accent/60 active:scale-95 disabled:opacity-50',
                  recheckStale ? 'text-amber-400 hover:text-amber-500' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={onRecheck}
                disabled={recheckComputing && !recheckStuck}
                title={recheckStale
                  ? 'Recheck legality — may be outdated (rule parameters changed since last check)'
                  : 'Recheck legality'}
                data-testid="scenario-legality-recheck"
              >
                <RefreshCw className={`h-3 w-3 ${recheckComputing ? 'animate-spin' : ''}`} />
                {recheckStale && (
                  <span
                    data-testid="scenario-legality-outdated"
                    title="Legality may be outdated"
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                )}
              </button>
            )}
            {/* Legality Alert Center — lists loaded violation messages (roster panes only) */}
            {onViolationsClick && (
              <button
                className="relative inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onViolationsClick}
                title="Alert Center — loaded violations"
                data-testid="violations-button"
              >
                <Bell className="h-3 w-3" />
                {violationCount !== undefined && violationCount > 0 && (
                  <span
                    data-testid="violations-button-count"
                    className="absolute -right-1 -top-1 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-destructive px-0.5 text-3xs font-bold leading-none text-destructive-foreground"
                  >
                    {violationCount > 99 ? '99+' : violationCount}
                  </span>
                )}
              </button>
            )}
            {/* Roster Quality Analyzer — per-crew roster quality (scenario roster pane only) */}
            {onQualityClick && (
              <button
                className="relative inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onQualityClick}
                title="Quality Analyzer — roster quality per crew"
                data-testid="quality-analysis-button"
              >
                <Gauge className="h-3 w-3" />
                {qualityIssueCount !== undefined && qualityIssueCount > 0 && (
                  <span
                    data-testid="quality-analysis-button-count"
                    className="absolute -right-1 -top-1 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-amber-500 px-0.5 text-3xs font-bold leading-none text-white"
                  >
                    {qualityIssueCount > 99 ? '99+' : qualityIssueCount}
                  </span>
                )}
              </button>
            )}
            {/* RES Pairing Creator — Live pairing pane only */}
            {onResPairingClick && (
              <button
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onResPairingClick}
                title="RES Pairing Creator"
                data-testid="res-pairing-button"
              >
                <ShieldPlus className="h-3 w-3" />
              </button>
            )}
            {/* Flight Navi — table navigator (flight pane only) */}
            {onNaviClick && (
              <button
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onNaviClick}
                title="Flight Navi"
                data-testid="flight-navi-button"
              >
                <Navigation className="h-3 w-3" />
              </button>
            )}
            {/* Query mode toggle */}
            {onQueryModeToggle && (
              <button
                className={`inline-flex h-5 items-center justify-center rounded-md px-1 text-3xs font-medium transition-all duration-100 hover:bg-accent/60 active:scale-95 ${
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
            {/* Global filter — same dialog as the toolbar funnel, opens on this pane's tab */}
            {onFilterClick && (
              <button
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onFilterClick}
                title="Filters"
                data-testid="pane-filter-button"
              >
                <Filter className="h-3 w-3" />
              </button>
            )}
            {onSortClick && (
              <button
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
                onClick={onSortClick}
                title="Sort"
                data-testid="pane-sort-button"
              >
                <ArrowUpDown className="h-3 w-3" />
              </button>
            )}
            {onOverlapLanesToggle && (
              <button
                className={[
                  'inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100',
                  overlapLanes
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
                ].join(' ')}
                onClick={onOverlapLanesToggle}
                title={overlapLanes ? 'Overlap lanes on' : 'Overlap lanes'}
                data-testid="roster-overlap-lanes-button"
              >
                <ArrowUpDown className="h-3 w-3 rotate-90" />
              </button>
            )}
            {onRosterBulkDeleteClick && (
              <button
                className={[
                  'inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100',
                  rosterBulkDeleteDisabled
                    ? 'cursor-not-allowed text-muted-foreground/35'
                    : 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive active:scale-95',
                ].join(' ')}
                onClick={onRosterBulkDeleteClick}
                disabled={rosterBulkDeleteDisabled}
                title={rosterBulkDeleteTitle}
                data-testid="roster-bulk-delete-button"
              >
                {rosterBulkDeleteIcon ?? <ListX className="h-3 w-3" />}
              </button>
            )}
            {onQuickFilterToggle && (
              <button
                className={[
                  'inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100',
                  quickFilterOpen
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
                ].join(' ')}
                onClick={onQuickFilterToggle}
                title="Quick filter"
              >
                <SlidersHorizontal className="h-3 w-3" />
              </button>
            )}
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
              onClick={() => setColumnConfigOpen(true)}
              title="Column settings"
            >
              <Settings2 className="h-3 w-3" />
            </button>
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

        {/* Overflow popover — lists ALL chips so clipped ones stay removable (F54-P06) */}
        {overflowOpen && totalChips > 0 && (
          <div
            data-testid="chip-overflow-popover"
            data-chip-overflow
            className="pointer-events-auto absolute right-2 z-20 flex max-w-md flex-wrap items-center gap-1 rounded-md border border-border bg-popover p-2 shadow-md"
            style={{ top: HEADER_HEIGHT + 2 }}
          >
            {renderChips()}
          </div>
        )}
      </div>

      <ColumnConfigDialog
        open={columnConfigOpen}
        onClose={() => setColumnConfigOpen(false)}
        paneType={paneType}
        paneLabel={PANE_LABELS[paneType]}
      />
    </>
  )
})
PaneConditionStrip.displayName = 'PaneConditionStrip'
