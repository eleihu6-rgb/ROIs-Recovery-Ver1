import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import {
  PanelLeftClose, PanelLeftOpen,
  PanelTopClose, PanelTopOpen,
  CalendarDays, Link2,
  Layers, Users, GraduationCap,
  ListChecks,
  Building2, Award, Cpu, MapPin, ClipboardList,
  BookOpen, Search, BarChart2,
  BarChart3, Gauge,
  Wrench, Scale, Timer, Clock3,
  Settings2, UserCog,
} from 'lucide-react'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveLiveItem, ActiveScenarioItem, ActiveLegalityItem, ActiveSystemItem, ActivePbsItem } from '@/stores/shell-store'
import { useScenarioStore } from '@/stores/scenario-store'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'
import type { DataPageId } from '@/types/data-maintenance'
import { RegressionTree } from '@/components/regression/regression-tree'
import { DevSidebar } from '@/components/dev/dev-sidebar'
import { useMenuStore } from '@/stores/menu-store'

const MODULE_LABELS: Record<string, string> = {
  dashboard:  'Dashboard',
  live:       'Live',
  scenario:   'Scenario',
  data:       'Data',
  legality:   'Legality',
  system:     'System',
  regression: 'Regression',
  pbs:        'PBS',
  dev:        'Dev',
  help:       'Help',
}

interface LiveMenuItem {
  item: ActiveLiveItem
  label: string
  Icon: React.ElementType
  todo: boolean
}

interface ScenarioMenuItem {
  item: ActiveScenarioItem
  label: string
  Icon: React.ElementType
}

const SCENARIO_MENU: ScenarioMenuItem[] = [
  { item: 'all', label: 'All Scenarios', Icon: Layers },
  { item: 'po',  label: 'Pairing',       Icon: Link2 },
  { item: 'ro',  label: 'Roster',        Icon: Users },
]

interface LegalityMenuItem {
  item: ActiveLegalityItem
  label: string
  helpTopicSlug: string
  Icon: React.ElementType
}

const LEGALITY_MENU: LegalityMenuItem[] = [
  { item: 'rule-sets',      label: 'Rule Sets',        helpTopicSlug: 'legality-tab-rule-sets', Icon: Scale },
  { item: 'rule-instances', label: 'Rule Templates',   helpTopicSlug: 'legality-tab-rule-templates', Icon: ListChecks },
]

interface SystemMenuItem {
  item: ActiveSystemItem
  label: string
  helpTopicSlug: string
  Icon: React.ElementType
}

const SYSTEM_MENU: SystemMenuItem[] = [
  { item: 'scheduler', label: 'Scheduler', helpTopicSlug: 'system-scheduler', Icon: Timer },
  { item: 'user-mgmt', label: 'Users', helpTopicSlug: 'system-users', Icon: Users },
  { item: 'profile-mgmt', label: 'Roles', helpTopicSlug: 'system-roles', Icon: Settings2 },
  { item: 'menu-mgmt', label: 'Menus', helpTopicSlug: 'system-menus', Icon: ListChecks },
  { item: 'pbs-user-mgmt', label: 'PBS Users', helpTopicSlug: 'system-pbs-users', Icon: Users },
  { item: 'dept-mgmt', label: 'Departments', helpTopicSlug: 'system-departments', Icon: Building2 },
]

interface PbsMenuItem {
  item: ActivePbsItem
  label: string
  helpTopicSlug: string
  Icon: React.ElementType
}

const PBS_MENU: PbsMenuItem[] = [
  { item: 'period', label: 'Period', helpTopicSlug: 'pbs-period', Icon: CalendarDays },
  { item: 'bid-definitions', label: 'Bid Definitions', helpTopicSlug: 'pbs-bid-definitions', Icon: Settings2 },
  { item: 'business-time', label: 'Business Time', helpTopicSlug: 'pbs-business-time', Icon: Clock3 },
  { item: 'admin-tools', label: 'Admin Tools', helpTopicSlug: 'pbs-admin-tools', Icon: Wrench },
  { item: 'simulated-crew-portal', label: 'Simulated Crew Portal', helpTopicSlug: 'pbs-simulated-crew-portal', Icon: UserCog },
]

const LIVE_MENU: LiveMenuItem[] = [
  { item: 'roster',  label: 'Roster',  Icon: CalendarDays, todo: false },
]

interface DataMenuItem {
  pageId: DataPageId
  label: string
  helpTopicSlug: string
  Icon: React.ElementType
  group: 'Basic' | 'Crew'
}

const DATA_MENU: DataMenuItem[] = [
  { pageId: 'basic.org-base',          label: 'Org & Base',              helpTopicSlug: 'data-org-base',          Icon: Building2,     group: 'Basic' },
  { pageId: 'basic.rank',              label: 'Rank',                    helpTopicSlug: 'data-rank',              Icon: Award,         group: 'Basic' },
  { pageId: 'basic.fleet-aircraft',    label: 'Fleet & Aircraft',        helpTopicSlug: 'data-fleet-aircraft',    Icon: Cpu,           group: 'Basic' },
  { pageId: 'basic.location-route',    label: 'Location & Route',        helpTopicSlug: 'data-location-route',    Icon: MapPin,        group: 'Basic' },
  { pageId: 'basic.assignment',        label: 'Assignment',              helpTopicSlug: 'data-assignment',        Icon: ClipboardList, group: 'Basic' },
  { pageId: 'basic.qualification',     label: 'Qualification',           helpTopicSlug: 'data-qualification',     Icon: GraduationCap, group: 'Basic' },
  { pageId: 'basic.composition',       label: 'Composition',             helpTopicSlug: 'data-composition',       Icon: Layers,        group: 'Basic' },
  { pageId: 'basic.roster-period',     label: 'Roster Period',           helpTopicSlug: 'data-roster-period',     Icon: CalendarDays,  group: 'Basic' },
  { pageId: 'basic.config-dictionary', label: 'Config Dictionary',       helpTopicSlug: 'data-config-dictionary', Icon: BookOpen,      group: 'Basic' },
  { pageId: 'basic.query',             label: 'Query',                   helpTopicSlug: 'data-query',             Icon: Search,        group: 'Basic' },
  { pageId: 'basic.holiday',           label: 'Holiday Calendar',        helpTopicSlug: 'data-holiday',           Icon: CalendarDays,  group: 'Basic' },
  { pageId: 'crew.master',             label: 'Crew Master',             helpTopicSlug: 'data-crew-master',       Icon: Users,         group: 'Crew'  },
  { pageId: 'crew.workload-summary',   label: 'Crew Workload Summary',   helpTopicSlug: 'data-crew-workload',     Icon: BarChart2,     group: 'Crew'  },
]

export const ShellSidebar = () => {
  const activeModule    = useShellStore((s) => s.activeModule)
  // 订阅 nodes（变化触发重渲染）——仅订阅函数引用不会在菜单加载后刷新
  const menuNodes = useMenuStore((s) => s.nodes)
  const canAccessPage   = useMenuStore((s) => s.canAccessPage)
  const activeLiveItem  = useShellStore((s) => s.activeLiveItem)
  const setLiveItem     = useShellStore((s) => s.setLiveItem)
  const activeScenarioItem = useShellStore((s) => s.activeScenarioItem)
  const setScenarioItem    = useShellStore((s) => s.setScenarioItem)
  const setFilterType      = useScenarioStore((s) => s.setFilterType)
  const activeLegalityItem = useShellStore((s) => s.activeLegalityItem)
  const setLegalityItem    = useShellStore((s) => s.setLegalityItem)
  const activeSystemItem   = useShellStore((s) => s.activeSystemItem)
  const setSystemItem      = useShellStore((s) => s.setSystemItem)
  const activePbsItem      = useShellStore((s) => s.activePbsItem)
  const setPbsItem         = useShellStore((s) => s.setPbsItem)
  const selectedDataPage   = useDataMaintenanceStore((s) => s.selectedPage)
  const setDataPage        = useDataMaintenanceStore((s) => s.setSelectedPage)
  const sidebarState    = useShellStore((s) => s.sidebarState)
  const setSidebarState = useShellStore((s) => s.setSidebarState)
  const topNavVisible   = useShellStore((s) => s.topNavVisible)
  const toggleTopNav    = useShellStore((s) => s.toggleTopNav)

  // Release & Help bring their own left nav, so this shell sidebar's module-nav
  // body is empty for them — hide it so those tabs use the full page width.
  const hasOwnNav = activeModule === 'release' || activeModule === 'help'
  let isHidden    = sidebarState === 'hidden' || (hasOwnNav && topNavVisible)
  let isCollapsed = !isHidden && (sidebarState === 'collapsed' || hasOwnNav)

  // Invariant: while the top nav is hidden, the sidebar must stay reachable — it
  // holds the only "Show Top Nav" restore control (and its attention hint). Demote
  // a would-be-hidden sidebar to the collapsed icon rail instead of zero width.
  if (!topNavVisible && isHidden) {
    isHidden = false
    isCollapsed = true
  }

  const label = MODULE_LABELS[activeModule] ?? activeModule

  return (
    <aside
      data-testid="shell-sidebar"
      data-state={isHidden ? 'hidden' : isCollapsed ? 'collapsed' : 'expanded'}
      className={[
        'relative shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar-background',
        'overflow-hidden transition-[width] duration-200 ease-in-out',
        isHidden ? 'w-0 border-r-0' : isCollapsed ? 'w-12' : 'w-[200px]',
      ].join(' ')}
    >
      {/* Header with quick-toggle buttons */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-sidebar-border px-2">
        <span
          className={[
            'flex-1 truncate text-2xs font-semibold uppercase tracking-widest text-sidebar-primary',
            'transition-[opacity,max-width] duration-150',
            isCollapsed ? 'max-w-0 overflow-hidden opacity-0' : 'max-w-[120px] opacity-100',
          ].join(' ')}
        >
          {label}
        </span>

        <TooltipProvider delayDuration={300}>
          {/* Collapse/expand sidebar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-100"
                onClick={() => setSidebarState(isCollapsed ? 'expanded' : 'collapsed', true)}
              >
                {isCollapsed
                  ? <PanelLeftOpen  className="h-3 w-3" />
                  : <PanelLeftClose className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            </TooltipContent>
          </Tooltip>

          {/* Toggle Top Nav */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                data-testid="toggle-top-nav-btn"
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-sm transition-all duration-100',
                  topNavVisible
                    ? 'text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    : 'text-primary bg-primary/10 animate-nav-hint',
                ].join(' ')}
                onClick={toggleTopNav}
              >
                {topNavVisible
                  ? <PanelTopClose className="h-3 w-3" />
                  : <PanelTopOpen  className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {topNavVisible ? 'Hide Top Nav' : 'Show Top Nav'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Body — module-specific nav items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {activeModule === 'live' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Scheduling
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {LIVE_MENU.filter((m) => canAccessPage(m.item)).map(({ item, label: itemLabel, Icon, todo }) => {
                const isActive = activeLiveItem === item && !todo
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role={todo ? undefined : 'button'}
                        tabIndex={todo ? -1 : 0}
                        data-testid={`live-nav-${item}`}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                          todo
                            ? 'pointer-events-none cursor-default border-transparent text-sidebar-foreground/40 opacity-50'
                            : isActive
                              ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                              : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={todo ? undefined : () => setLiveItem(item)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1">{itemLabel}</span>
                            {todo && (
                              <span className="ml-auto rounded bg-muted px-1 py-0.5 text-3xs font-semibold text-muted-foreground">
                                Soon
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="text-xs">
                        {itemLabel}{todo ? ' (Coming Soon)' : ''}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </>
        )}
        {activeModule === 'scenario' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Optimization
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {SCENARIO_MENU.filter((m) => canAccessPage(m.item)).map(({ item, label: itemLabel, Icon }) => {
                const isActive = activeScenarioItem === item
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`scenario-nav-${item}`}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                          isActive
                            ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                            : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={() => {
                          setScenarioItem(item)
                          setFilterType(item === 'all' ? '' : item.toUpperCase() as 'PO' | 'RO' | 'TO')
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                      </div>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                    )}
                  </Tooltip>
                )
              })}

              {/* Crew Bids — same row styling as the optimization items above
                  (flush px-3, h-4 icon, text-xs) so the icon + text column aligns. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="scenario-nav-crew-bids"
                    className={[
                      'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                      activeScenarioItem === 'crew-bids'
                        ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                        : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    ].join(' ')}
                    onClick={() => {
                      setScenarioItem('crew-bids')
                      setFilterType('TO')
                    }}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span className="flex-1">Crew Bids</span>}
                  </div>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="text-xs">Crew Bids</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </>
        )}
        {activeModule === 'legality' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Configuration
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {LEGALITY_MENU.filter((m) => canAccessPage(m.item)).map(({ item, label: itemLabel, Icon }) => {
                const isActive = activeLegalityItem === item
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`legality-nav-${item}`}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                          isActive
                            ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                            : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={() => setLegalityItem(item)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                      </div>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                    )}
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </>
        )}
        {activeModule === 'data' && (
          <TooltipProvider delayDuration={300}>
            {/* Basic and Crew groups — standard nav items */}
            {(['Basic', 'Crew'] as const).map((group) => (
              <div key={group}>
                {!isCollapsed && (
                  <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                    {group}
                  </div>
                )}
                {DATA_MENU.filter((m) => m.group === group && canAccessPage(m.pageId)).map(({ pageId, label: itemLabel, Icon }) => {
                  const isActive = selectedDataPage === pageId
                  return (
                    <Tooltip key={pageId}>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          data-testid={`data-tree-item-${pageId}`}
                          className={[
                            'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                            isActive
                              ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                              : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                          ].join(' ')}
                          onClick={() => setDataPage(pageId)}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                        </div>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                      )}
                    </Tooltip>
                  )
                })}
              </div>
            ))}

          </TooltipProvider>
        )}
        {activeModule === 'system' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Operations
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {SYSTEM_MENU.filter((m) => canAccessPage(m.item)).map(({ item, label: itemLabel, Icon }) => {
                const isActive = activeSystemItem === item
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`system-nav-${item}`}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                          isActive
                            ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                            : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={() => setSystemItem(item)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                      </div>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                    )}
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </>
        )}
        {activeModule === 'regression' && <RegressionTree isCollapsed={isCollapsed} />}
        {activeModule === 'pbs' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-3xs font-bold uppercase tracking-widest text-sidebar-foreground/40">
                PBS Admin
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {PBS_MENU.filter(({ item }) => canAccessPage(item)).map(({ item, label: itemLabel, Icon }) => {
                const isActive = activePbsItem === item
                return (
                  <div key={item}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          data-testid={`pbs-nav-${item}`}
                          className={[
                            'w-full text-left',
                            'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-xs transition-colors duration-100',
                            isActive
                              ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                              : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                          ].join(' ')}
                          onClick={() => setPbsItem(item)}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!isCollapsed && <span className="flex-1">{itemLabel}</span>}
                        </button>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right" className="text-xs">{itemLabel}</TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                )
              })}
            </TooltipProvider>
          </>
        )}
        {activeModule === 'dev' && <DevSidebar isCollapsed={isCollapsed} />}
      </div>

      {/* Edge expand tab — only when collapsed, extends outside border */}
      {isCollapsed && (
        <button
          className={[
            'absolute right-0 top-1/2 z-10 flex h-11 w-3.5 -translate-y-1/2 translate-x-full',
            'items-center justify-center rounded-r-md border border-l-0 border-border',
            'bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-primary transition-all duration-100',
          ].join(' ')}
          onClick={() => setSidebarState('expanded', true)}
          title="Expand Sidebar"
        >
          <PanelLeftOpen className="h-2.5 w-2.5" />
        </button>
      )}
    </aside>
  )
}
