import { useCallback, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import { RefreshCw, Filter, Keyboard, SquarePlus, ArrowLeft, Send } from 'lucide-react'
import { RpMultiSelect } from '@/components/common/rp-multi-select'
import { ZoomControl } from '@/components/common/zoom-control'
import { RuleGroupSelector } from '@/components/common/rule-group-selector'
import { TimezoneSwitcher } from '@/components/common/timezone-switcher'
import { DraftToolbar } from '@/components/roster/draft-toolbar'
import { RosterPublishDialog } from '@/components/roster/roster-publish-dialog'
import { FilterDialog } from '@/components/layout/filter-dialog'
import { PermissionGate } from '@/components/common/permission-gate'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useFilterStore } from '@/stores/filter-store'
import { useShellStore } from '@/stores/shell-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { PANE_COLORS, PANE_NAMES, MAX_PANES_PER_TYPE, type PaneType } from '@/types/layout'
import { applyGanttFilters } from '@/utils/apply-filters'

const ToolbarDivider = () => (
  <div className="mx-1.5 h-4 w-px bg-border/60" />
)

const ToolBtn = ({
  tip, onClick, disabled, active, amber, testId, children,
}: {
  tip: string; onClick?: () => void; disabled?: boolean; active?: boolean; amber?: boolean; testId?: string; children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100',
          amber
            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            : active
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
          disabled ? 'pointer-events-none opacity-35' : '',
        ].join(' ')}
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
  </Tooltip>
)

const MAX_PANES = 4

/**
 * Derive the Live-toolbar "pull data" prompt state.
 *
 * - never applied (appliedFilters === null) → "No data loaded"
 * - applied once but the RP selection changed since → "RP Date changed"
 * - applied once and RP selection unchanged → no prompt (data is current)
 *
 * Compared on the RP selection (not dateRange): timezone re-anchors shift dateRange
 * without changing the RP, and must not trip the stale-data message.
 */
export const resolveLiveApplyPrompt = (
  appliedFilters: { selectedRosterPeriodIds?: string[] } | null,
  selectedRosterPeriodIds: string[],
  isLiveActive: boolean,
): { show: boolean; text: 'No data loaded — apply filters to pull data' | 'RP Date changed — apply filters to pull data' } => {
  const noDataLoaded = appliedFilters === null && isLiveActive
  const appliedRpIds = appliedFilters?.selectedRosterPeriodIds ?? []
  const rpSelectionChanged =
    appliedFilters !== null &&
    (appliedRpIds.length !== selectedRosterPeriodIds.length ||
      appliedRpIds.some((id, i) => id !== selectedRosterPeriodIds[i])) &&
    isLiveActive
  return {
    show: noDataLoaded || rpSelectionChanged,
    text: noDataLoaded
      ? 'No data loaded — apply filters to pull data'
      : 'RP Date changed — apply filters to pull data',
  }
}

export const GanttSubToolbar = () => {
  const [publishOpen, setPublishOpen] = useState(false)
  const filterOpen = useShellStore((s) => s.filterDialogOpen)
  const filterTab = useShellStore((s) => s.filterDialogTab)
  const setFilterOpen = useShellStore((s) => s.setFilterDialogOpen)
  const isLiveActive = useShellStore((s) => s.activeModule === 'live')
  const appliedFilters = useFilterStore((s) => s.appliedFilters)
  const selectedRosterPeriodIds = useFilterStore((s) => s.selectedRosterPeriodIds)
  const { show: showApplyPrompt, text: applyPromptText } = resolveLiveApplyPrompt(
    appliedFilters,
    selectedRosterPeriodIds,
    isLiveActive,
  )
  // Funnel pulse targets the TRUE empty start (never applied). The "RP Date changed"
  // stale-data prompt uses the same inline message but without the full attention ring.
  const noDataLoaded = appliedFilters === null && isLiveActive
  const openShortcuts = useUiStore((s) => s.openShortcuts)
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const timezoneAirport = useTimezoneStore((s) => s.timezoneAirport)
  const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
  const refreshing = useGanttViewStore((s) => s.refreshing)
  const refreshAllPanes = useGanttViewStore((s) => s.refreshAllPanes)
  const fetchPaneData = useGanttViewStore((s) => s.fetchPaneData)
  const addPane = useLayoutStore((s) => s.addPane)
  const resetLayout = useLayoutStore((s) => s.resetLayout)
  const totalPanes = useLayoutStore((s) => s.panes.size)
  const checking = useRuleCheckStore((s) => s.checking)

  // Filter active state
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount())
  const hasFilter = activeFilterCount > 0

  // 各类对象 filtered/total 计数已移至各 pane 标题栏徽标（pane-toolbar.tsx），
  // 工具栏不再渲染 match pills。
  const panes = useLayoutStore((s) => s.panes)

  // Per-type pane counts (used to disable Add buttons once a type hits its cap)
  const paneTypeCounts = ([...panes.values()]).reduce(
    (acc, p) => { acc[p.type]++; return acc },
    { roster: 0, pairing: 0, flight: 0 } as Record<PaneType, number>
  )

  // Apply Filters: selectively re-fetch only the panes whose query conditions changed.
  // Delegates to the shared applyGanttFilters() so condition-chip removal reuses the same path.
  const handleFilterApply = useCallback(() => applyGanttFilters(), [])

  const handleAddPane = (type: PaneType) => {
    const paneId = addPane(type)
    if (paneId) fetchPaneData(type)
  }

  return (
    <>
      <TooltipProvider delayDuration={250}>
        <header className="relative z-10 flex h-9 shrink-0 items-center border-b border-border/80 bg-card px-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

          <div className="flex items-center gap-1">
            <RpMultiSelect />
          </div>

          <ToolbarDivider />

          <div className="flex items-center gap-0.5">
            <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_REFRESH">
              <ToolBtn tip="Refresh" onClick={refreshAllPanes} disabled={refreshing} active={refreshing} testId="refresh-btn">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </ToolBtn>
            </PermissionGate>

            {/* Filter button — amber with count badge when filters are active;
                pulsing attention ring while no data has been pulled yet (Live empty start) */}
            <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_FILTER">
            <div className="relative">
              {noDataLoaded && (
                <motion.span
                  data-testid="filter-attention-ring"
                  className="pointer-events-none absolute inset-0 rounded-md bg-primary/35"
                  initial={{ scale: 1, opacity: 0.55 }}
                  animate={{ scale: 1.7, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
                />
              )}
              <ToolBtn
                tip={hasFilter ? `Filters (${activeFilterCount} active)` : 'Filter'}
                onClick={() => setFilterOpen(true)}
                amber={hasFilter}
                testId="filter-btn"
              >
                {noDataLoaded ? (
                  <motion.span
                    className="inline-flex"
                    animate={{ scale: [1, 1.18, 1] }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                  >
                    <Filter className="h-3.5 w-3.5 text-primary" />
                  </motion.span>
                ) : (
                  <Filter className="h-3.5 w-3.5" />
                )}
              </ToolBtn>
              {hasFilter && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-3xs font-bold text-white">
                  {activeFilterCount > 9 ? '9+' : activeFilterCount}
                </span>
              )}
            </div>
            </PermissionGate>

            {/* Inline reminder while Live is empty (spec: Live starts EMPTY; the Filter
                dialog is the only load mechanism). Replaces the old centered pop-up card —
                clicking it opens the Filter dialog, same as the funnel. */}
            <AnimatePresence>
              {showApplyPrompt && (
                <motion.button
                  type="button"
                  data-testid="live-empty-state"
                  onClick={() => setFilterOpen(true)}
                  className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary/10 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                >
                  <motion.span
                    className="inline-flex shrink-0"
                    animate={{ x: [0, -2.5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </motion.span>
                  {applyPromptText}
                </motion.button>
              )}
            </AnimatePresence>

          </div>

          <ToolbarDivider />
          <DraftToolbar />
          <ToolbarDivider />
          <ZoomControl />
          <ToolbarDivider />
          <RuleGroupSelector />
          <ToolbarDivider />
          <TimezoneSwitcher />

          <div className="flex-1" />

          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 p-1">
            {(['roster', 'pairing', 'flight'] as PaneType[]).map((type) => {
              const typeMaxed = paneTypeCounts[type] >= MAX_PANES_PER_TYPE[type]
              const disabled = totalPanes >= MAX_PANES || typeMaxed
              return (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-all"
                    onClick={() => handleAddPane(type)}
                    disabled={disabled}
                    style={{ opacity: disabled ? 0.5 : 1 }}
                    data-testid={`add-pane-${type}`}
                  >
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: PANE_COLORS[type] }} />
                    {PANE_NAMES[type]}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {typeMaxed
                    ? `Max ${MAX_PANES_PER_TYPE[type]} ${PANE_NAMES[type]} panes`
                    : totalPanes >= MAX_PANES
                      ? 'Max 4 panes'
                      : `Add ${PANE_NAMES[type]} pane`}
                </TooltipContent>
              </Tooltip>
              )
            })}
            <button className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={resetLayout} data-testid="reset-layout">
              Reset
            </button>
          </div>

          <ToolbarDivider />

          <div className="flex items-center gap-1.5">
            <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_PUBLISH">
              <ToolBtn tip="Publish Roster" testId="roster-publish-btn" onClick={() => setPublishOpen(true)}>
                <Send className="h-4 w-4" />
              </ToolBtn>
            </PermissionGate>
            <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_CREATE_GROUND">
              <ToolBtn
                tip="Create Ground Task"
                testId="create-ground-task-btn"
                onClick={() => {
                  const airport = timezoneAirport === 'UTC' ? '' : timezoneAirport
                  openGroundTaskCreate({ depArp: airport, arvArp: airport })
                }}
              >
                <SquarePlus className="h-4 w-4" />
              </ToolBtn>
            </PermissionGate>
            {checking && (
              <span className="text-xs text-muted-foreground animate-pulse">Checking...</span>
            )}
            {selectedTaskIds.size > 0 && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-primary">
                {selectedTaskIds.size} sel
              </span>
            )}
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
              onClick={openShortcuts}
              title="Keyboard shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
      </TooltipProvider>
      <FilterDialog open={filterOpen} initialTab={filterTab} onClose={() => setFilterOpen(false)} onApply={handleFilterApply} />
      <RosterPublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
    </>
  )
}
