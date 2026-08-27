import { memo } from 'react'
import { List, Filter, Clock } from 'lucide-react'
import { TimeAxis } from '@/components/gantt/time-axis'
import { usePaneStore } from '@/stores/pane-store'
import { publishChromeCommit } from '@/utils/gantt-test-hook'
import { SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'
import { LiveRpIndicator } from '@/components/panes/shared/rp-indicator'
import type { PaneType } from '@/types/pane'

/** Color indicator for each pane type */
const PANE_TYPE_COLORS: Record<PaneType, string> = {
  'roster-main': '#3b82f6',
  'roster-sub': '#3b82f6',
  'pairing': '#22c55e',
  'flight': '#a855f7',
  'scenario-roster': '#3b82f6',
  'scenario-pairing': '#22c55e',
  'scenario-flight': '#a855f7',
}

/** Filter chip displayed in the filter strip */
export interface FilterChip {
  sessionId: string
  sessionIndex: number // 0-based, used for color selection
  key: string
  value: string
}

/** Sort chip displayed in the condition strip (one per active sort criterion). */
export interface SortChip {
  key: string
  label: string
  direction: 'asc' | 'desc'
  onRemove: () => void
}

/** Global-filter chip (one per applied base/rank/fleet/division value). */
export interface GlobalFilterChip {
  id: string
  /** Dimension label, e.g. 'Base' | 'Rank' (shown in the tooltip). */
  label: string
  /** The filter value, e.g. 'YVR' | 'CA' (shown on the pill). */
  value: string
  onRemove: () => void
}

interface PaneToolbarProps {
  paneType: PaneType
  title: string
  /** Total items in date range (≡ badge, or denominator of the filtered badge) */
  unfilteredTotal?: number
  /** Items matching the applied global filter (numerator of the filtered badge) */
  filteredTotal?: number
  /** Whether a global filter (Filter dialog) is applied for this pane's domain */
  globalFilterActive?: boolean
  /** Items matching search (⌕ badge, amber color) */
  matchedTotal?: number
  /**
   * Open/partial coverage total credit (HH:MM). Pairing pane only — shown next to the
   * count badge when the Coverage filter narrows to Open and/or Partial.
   */
  openCredit?: string
  /** Items loaded in view (↓ badge, blue color) */
  loadedCount?: number
  /** Drag-and-drop support — set by PaneWrapper when multiple panes are open */
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

/**
 * Title row rendered at the top of each pane.
 * Left section (sized to the crew-list/canvas "virtual line"): drag handle,
 * pane color indicator, title and count badges. The remaining width hosts the
 * shared TimeAxis (timeline header), aligned with the pane canvas below.
 *
 * Filter/sort chips and the pane action cluster live in PaneConditionStrip,
 * overlaid on the canvas header band (where the timeline used to be).
 *
 * F54-P03: memoized — pane components re-render on scroll-state changes; the title
 * row's props are scroll-independent so it must not re-render (the embedded TimeAxis
 * subscribes to the view store itself).
 */
export const PaneToolbar = memo(({
  paneType,
  title,
  unfilteredTotal,
  filteredTotal,
  globalFilterActive,
  matchedTotal,
  loadedCount,
  openCredit,
  draggable,
  onDragStart,
  onDragEnd,
}: PaneToolbarProps) => {
  publishChromeCommit(`toolbar:${paneType}`)
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)

  // Primary count badge: plain total when unfiltered, funnel + filtered/total when
  // a global filter is applied (replaces the old toolbar match pills).
  const showFilteredBadge = globalFilterActive === true && filteredTotal !== undefined
  // Secondary ⌕ search badge shows only when an explicit multi-query Find narrowed
  // results — i.e. the search-match count differs from BOTH server totals. Comparing
  // against the server totals (not the displayed primary count) keeps it suppressed
  // even when the funnel numerator is a client-side override (e.g. pairing coverage
  // counted over loaded rows), which would otherwise no longer equal matchedTotal.
  const showMatchedBadge = matchedTotal !== undefined
    && matchedTotal !== filteredTotal
    && matchedTotal !== unfilteredTotal

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b bg-muted/30">
      {/* Left section — title + badges, width pinned to the virtual line (+2px splitter) */}
      <div
        className={[
          'flex shrink-0 items-center gap-1.5 overflow-hidden pl-2 pr-1',
          draggable ? 'cursor-grab select-none' : '',
        ].join(' ')}
        style={{ width: leftPanelWidth + SPLITTER_WIDTH }}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        data-testid="pane-title-section"
      >
        {/* Drag handle indicator */}
        {draggable && (
          <span className="text-muted-foreground/40 text-sm leading-none mr-0.5">⠿</span>
        )}
        {/* Pane type color indicator */}
        <span
          className="inline-block h-3 w-1.5 rounded-sm shrink-0"
          style={{ backgroundColor: PANE_TYPE_COLORS[paneType] }}
        />
        {/* Title */}
        <span className="whitespace-nowrap text-2xs font-semibold text-foreground">{title}</span>

        {/* Count badges */}
        <div className="ml-2 flex items-center gap-1">
          {/* Filtered: 🔽 filtered/total (amber) — unfiltered: ≡ total */}
          {showFilteredBadge ? (
            <div
              className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-2xs text-amber-400"
              title={paneType === 'flight' ? 'Filtered / total flights in date range' : 'Filtered / total in date range'}
              data-testid="pane-filtered-count"
            >
              <Filter className="h-3 w-3" />
              <span className="tabular-nums">{filteredTotal}/{unfilteredTotal || '—'}</span>
            </div>
          ) : (
            unfilteredTotal !== undefined && (
              <div
                className="inline-flex items-center gap-0.5 rounded px-1 text-2xs text-muted-foreground"
                title={paneType === 'flight' ? 'Flights in date range' : 'Total in date range'}
                data-testid="pane-total-count"
              >
                <List className="h-3 w-3" />
                <span className="tabular-nums">{unfilteredTotal}</span>
              </div>
            )
          )}

          {/* ⌕ Matching search (amber, only when different from total) */}
          {showMatchedBadge && (
            <div
              className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-2xs text-amber-400"
              title="Matching search filters"
            >
              <Filter className="h-3 w-3" />
              <span>{matchedTotal}</span>
            </div>
          )}

          {/* Open/partial coverage total credit (HH:MM) — pairing pane, when narrowed */}
          {openCredit && (
            <div
              className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-2xs text-primary"
              title="Open / partial coverage total credit (HH:MM)"
              data-testid="pane-open-credit"
            >
              <Clock className="h-3 w-3" />
              <span className="font-mono tabular-nums">{openCredit}</span>
            </div>
          )}

        </div>

        {/* Current-RP indicator (right edge of the header info) */}
        <div className="ml-auto flex items-center">
          <LiveRpIndicator />
        </div>
      </div>

      {/* Timeline header — fills the rest of the row, aligned with the pane canvas below */}
      <TimeAxis className="min-w-0 flex-1" testId="pane-time-axis" />
    </div>
  )
})
PaneToolbar.displayName = 'PaneToolbar'
