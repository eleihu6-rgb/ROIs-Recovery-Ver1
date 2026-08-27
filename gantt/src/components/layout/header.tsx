import { useState, type ReactNode } from 'react'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import {
  PanelLeftClose, PanelLeftOpen, RefreshCw,
  Filter, Plane, Link2, Users, Keyboard, LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { AirlineLogo } from '@/components/common/airline-logo'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { ZoomControl } from '@/components/common/zoom-control'
import { ThemeSwitcher } from '@/components/common/theme-switcher'
import { RuleGroupSelector } from '@/components/common/rule-group-selector'
import { TimezoneSwitcher } from '@/components/common/timezone-switcher'
import { DraftToolbar } from '@/components/roster/draft-toolbar'
import { FilterDialog } from './filter-dialog'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
// history-store undo/redo now handled by DraftToolbar
import { useRuleCheckStore } from '@/stores/rule-check-store'
import type { PaneType } from '@/types'

/* ── Toolbar primitives ── */

const ToolbarDivider = () => (
  <div className="mx-1.5 h-4 w-px bg-border/60" />
)

/** Icon button with tooltip + hover/active micro-feedback */
const ToolBtn = ({
  tip,
  onClick,
  disabled,
  active,
  children,
}: {
  tip: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100',
          active
            ? 'bg-accent text-accent-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
          disabled ? 'pointer-events-none opacity-35' : '',
        ].join(' ')}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
  </Tooltip>
)

/** Pane toggle config — icon semantically represents content type */
const PANE_CONFIG: { type: PaneType; label: string; shortLabel: string; icon: typeof Users }[] = [
  { type: 'roster-main', label: 'Roster Main', shortLabel: 'Main', icon: Users },
  { type: 'roster-sub', label: 'Roster Sub', shortLabel: 'Sub', icon: Users },
  { type: 'pairing', label: 'Pairing', shortLabel: 'Pair', icon: Link2 },
  { type: 'flight', label: 'Flight', shortLabel: 'Flt', icon: Plane },
]

/* ── Header ── */

export const Header = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const openShortcuts = useUiStore((s) => s.openShortcuts)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
  const dateRange = useFilterStore((s) => s.dateRange)
  const fetchRoster = useRosterStore((s) => s.fetchRoster)
  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
  const panes = usePaneStore((s) => s.panes)
  const togglePane = usePaneStore((s) => s.togglePane)
  const checking = useRuleCheckStore((s) => s.checking)

  const handleRefresh = () => {
    fetchRoster('main', selectedCrewIds, dateRange)
  }

  return (
    <>
      <TooltipProvider delayDuration={250}>
        {/* header with subtle bottom shadow for depth separation */}
        <header className="relative z-10 flex h-10 shrink-0 items-center border-b border-border/80 bg-card px-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

          {/* ── Brand Logo ── */}
          <AirlineLogo
            schema={useAuthStore.getState().user?.schema}
            height={22}
            className="mr-2 shrink-0"
            fallback="none"
          />

          {/* ── Group 1: Navigation + Date Range ── */}
          <div className="flex items-center gap-1">
            <ToolBtn tip={sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'} onClick={toggleSidebar}>
              {sidebarCollapsed
                ? <PanelLeftOpen className="h-3.5 w-3.5" />
                : <PanelLeftClose className="h-3.5 w-3.5" />}
            </ToolBtn>
            <DateRangePicker />
          </div>

          <ToolbarDivider />

          {/* ── Group 2: Actions ── */}
          <div className="flex items-center gap-0.5">
            <ToolBtn tip="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn tip="Filter" onClick={() => setFilterOpen(true)}>
              <Filter className="h-3.5 w-3.5" />
            </ToolBtn>
          </div>

          <ToolbarDivider />

          {/* ── Group 3: Undo / Redo / Save ── */}
          <DraftToolbar />

          <ToolbarDivider />

          {/* ── Group 3: Zoom ── */}
          <ZoomControl />

          <ToolbarDivider />

          {/* ── Group 4: Rule Set ── */}
          <RuleGroupSelector />

          <ToolbarDivider />

          {/* ── Timezone Switcher ── */}
          <TimezoneSwitcher />

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Group 4: Pane Toggles — segmented control style ── */}
          <div className="flex items-center rounded-md border border-border/50 bg-muted/40 p-0.5">
            {PANE_CONFIG.map((cfg) => {
              const pane = panes.find((p) => p.type === cfg.type)
              const visible = pane?.visible ?? false
              const Icon = cfg.icon
              return (
                <Tooltip key={cfg.type}>
                  <TooltipTrigger asChild>
                    <button
                      className={[
                        'flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium leading-none transition-all duration-150',
                        visible
                          ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                          : 'text-muted-foreground/70 hover:text-muted-foreground',
                      ].join(' ')}
                      onClick={() => togglePane(cfg.type)}
                    >
                      <Icon className={`h-3 w-3 ${visible ? '' : 'opacity-60'}`} />
                      {cfg.shortLabel}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {visible ? `Hide ${cfg.label}` : `Show ${cfg.label}`}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          <ToolbarDivider />

          {/* ── Group 5: Status + Theme ── */}
          <div className="flex items-center gap-1.5">
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

            <ThemeSwitcher />

            {/* User info + Logout */}
            <span className="text-xs text-muted-foreground">
              {useAuthStore.getState().user?.userCode}
            </span>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-95"
              onClick={() => useAuthStore.getState().logout()}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
      </TooltipProvider>

      <FilterDialog open={filterOpen} onClose={() => setFilterOpen(false)} />
    </>
  )
}
