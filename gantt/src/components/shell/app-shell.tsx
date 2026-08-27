import { useEffect } from 'react'
import { Toaster } from '@rois/ui'
import { ShellTopNav } from './shell-top-nav'
import { ShellSidebar } from './shell-sidebar'
import { DashboardView } from './dashboard-view'
import { RosterView } from './roster-view'
import { ScenarioView } from './scenario-view'
import { ScenarioGanttView } from './scenario-gantt-view'
import { PlaceholderView } from './placeholder-view'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveModule } from '@/stores/shell-store'
import { useMenuStore } from '@/stores/menu-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useColumnStore } from '@/stores/column-store'
import { useFilterStore } from '@/stores/filter-store'
import { useAssignmentStore } from '@/stores/assignment-store'
import { RegressionView } from '@/components/regression/regression-view'
import { PbsView } from '@/components/pbs/pbs-view'
import { DevView } from '@/components/dev/dev-view'
import { HelpView } from '@/components/help/help-view'
import { ReleaseView } from '@/components/release/release-view'
import { DataView } from '@/components/data/data-view'
import { LegalityView } from '@/components/legality/legality-view'
import { SystemView } from '@/components/system/system-view'
import { PairingInfoDialog } from '@/components/pairing/pairing-info-dialog'
import { FlightDetailDialog } from '@/components/flight/flight-detail-dialog'
import { FlightNaviDialog } from '@/components/flight-navi/flight-navi-dialog'
import { GroundTaskDialog } from '@/components/roster/ground-task-dialog'
import { RuleConfirmDialog } from '@/components/roster/rule-confirm-dialog'
import { ScenarioContextMenu } from '@/components/scenario-gantt/scenario-context-menu'
import { MandayInfoDialog } from '@/components/roster/manday-info-dialog'
import { ScheduleDetailsDialog } from '@/components/roster/schedule-details-dialog'
import { DailyTaskCalendarDialog } from '@/components/roster/daily-task-calendar-dialog'
import { CrewInfoDialog } from '@/components/roster/crew-info-dialog'
import { GanttDayStatisticsDialog } from '@/components/gantt/gantt-day-statistics-dialog'
import { AiChatPanel } from '@/components/ai-chat/ai-chat-panel'
import { useUrlSync } from '@/hooks/use-url-sync'

/** Render the correct view for a given module */
const ModuleView = ({ module }: { module: ActiveModule }) => {
  if (module === 'dashboard') return <DashboardView />
  if (module === 'live')      return <RosterView />
  if (module === 'scenario')  return <ScenarioView />
  if (module === 'regression') return <RegressionView />
  if (module === 'pbs')        return <PbsView />
  if (module === 'dev')        return <DevView />
  if (module === 'help')       return <HelpView />
  if (module === 'release')    return <ReleaseView />
  if (module === 'data')       return <DataView />
  if (module === 'legality')   return <LegalityView />
  if (module === 'system')     return <SystemView />
  if (module.startsWith('scenario-gantt:')) {
    const raw = module.slice('scenario-gantt:'.length)
    const [scenarioIdText, version] = raw.split('@', 2)
    const scenarioId = Number(scenarioIdText)
    if (!Number.isNaN(scenarioId)) return <ScenarioGanttView scenarioId={scenarioId} version={version || undefined} />
  }
  const label = module.charAt(0).toUpperCase() + module.slice(1)
  return <PlaceholderView module={label} />
}

/**
 * Keep-alive content area: all open tabs are mounted simultaneously.
 * The active tab is visible; inactive tabs are hidden via visibility:hidden
 * (not display:none) so that canvas layouts and resize observers keep working.
 */
const ContentArea = () => {
  const openTabs    = useShellStore((s) => s.openTabs)
  const activeModule = useShellStore((s) => s.activeModule)
  const canAccessModule = useMenuStore((s) => s.canAccessModule)

  // Keep Live and Scenario timezones independent: restore Live timezone
  // whenever the active tab is not a scenario-gantt (scenario restores its own via ScenarioGanttView).
  useEffect(() => {
    if (!activeModule.startsWith('scenario-gantt:')) {
      useTimezoneStore.getState().applyLiveTimezone()
    }
  }, [activeModule])

  // Defense-in-depth: even if stale localStorage leaks a non-permitted module
  // into openTabs, do NOT mount its view — its mount effect would fire a
  // permission-gated endpoint and surface a 403 toast. canAccessModule
  // short-circuits admin → true and respects menu permissions for non-admin.
  const visibleTabs = openTabs.filter((m) => canAccessModule(m))

  return (
    <div className="relative h-full w-full overflow-hidden">
      {visibleTabs.map((module) => (
        <div
          key={module}
          className={[
            'absolute inset-0',
            module === activeModule ? '' : 'invisible pointer-events-none',
          ].join(' ')}
        >
          <ModuleView module={module} />
        </div>
      ))}
    </div>
  )
}

export const AppShell = () => {
  const topNavVisible         = useShellStore((s) => s.topNavVisible)
  const loadShell             = useShellStore((s) => s.loadFromStorage)
  const loadColumns           = useColumnStore((s) => s.loadFromStorage)
  const loadFilters           = useFilterStore((s) => s.loadFromStorage)
  const fetchAssignmentGroups = useAssignmentStore((s) => s.fetchGroups)
  const canAccessRbot         = useMenuStore((s) => s.canAccessPage('rbot'))

  useEffect(() => {
    loadShell()
    loadColumns()
    loadFilters()
    fetchAssignmentGroups()
  }, [loadShell, loadColumns, loadFilters, fetchAssignmentGroups])

  useUrlSync()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top nav — animates to h-0 when hidden */}
      <div
        data-testid="shell-top-nav-wrap"
        data-visible={topNavVisible ? 'true' : 'false'}
        className={[
          'shrink-0 overflow-hidden transition-[height,opacity] duration-200',
          topNavVisible ? 'h-11 opacity-100' : 'h-0 opacity-0',
        ].join(' ')}
      >
        <ShellTopNav />
      </div>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ShellSidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <ContentArea />
        </main>
      </div>

      {/* Toast notifications — mounted once at the shell root so every module
          (Live / Scenario / Rule / …) can surface notify.* toasts. Previously
          this lived in app-layout, which only the Live view mounts, so toasts
          were invisible on the Scenario tab. */}
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'border border-border/60 bg-popover text-popover-foreground shadow-lg text-xs',
          duration: 4000,
        }}
        closeButton
      />

      {/* Shared detail dialogs — hoisted to the shell root so exactly ONE instance
          of each exists in the whole keep-alive tree. Both Live panes and Scenario
          panes drive them via ui-store (openPairingInfo / openFlightDetail /
          openGroundTaskEdit, with an optional scenarioId picking the data source /
          view-only mode). Mounting them per-view caused double-mount: every open
          tab stays mounted, so two subscribers rendered two stacked dialogs +
          duplicate fetches. */}
      <PairingInfoDialog />
      <FlightDetailDialog />
      <FlightNaviDialog />
      <GroundTaskDialog />

      {/* Draft legality confirm — same hoist as Toaster. AppLayout only mounts under
          Live; Scenario tabs never mount it, and an inactive Live tab is
          `invisible pointer-events-none`, so a Live-only mount hid or hung the
          dialog on Scenario assign. */}
      <RuleConfirmDialog />

      {/* Scenario-specific right-click context menu — driven by the ui-store, gated on
          contextMenuScenarioId != null (Live right-clicks fall through to Live's <ContextMenu/>
          mounted in app-layout). Mounted once here so every scenario tab shares one instance. */}
      <ScenarioContextMenu />
      <MandayInfoDialog />
      <ScheduleDetailsDialog />
      <DailyTaskCalendarDialog />
      <CrewInfoDialog />
      <GanttDayStatisticsDialog />
      {canAccessRbot && <AiChatPanel />}
    </div>
  )
}
