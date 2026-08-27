import { ChevronDown, CircleOff, ClipboardList, FlaskConical, X } from 'lucide-react'
import {
  cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Tooltip, TooltipContent, TooltipTrigger,
} from '@rois/ui'
import type { ScenarioType } from '@/types/scenario'
import { SCENARIO_TYPE_ICON, SCENARIO_TYPE_COLOR } from '@/utils/scenario-type'
import { useShellStore } from '@/stores/shell-store'
import { parseScenarioModuleKey, scenarioTabLabel } from '@/utils/scenario-module'

const SCENARIO_PREFIX = 'scenario-gantt:'
const SCENARIO_ID_BADGE_CLASS = 'bg-[#DFF7EA] text-[#065F46] font-semibold'

/** Fallback label before the view sets a persisted one — version-aware (e.g. `v1 #123`). */
const scenarioFallbackLabel = (module: string): string => {
  const { id, version } = parseScenarioModuleKey(module)
  return scenarioTabLabel(id, '', version)
}

/**
 * The "Scenario" top-nav entry, rendered as a dropdown:
 *  - "Scenarios" → the management view (module `scenario`)
 *  - currently-open scenario Gantts directly below it (switch / close)
 * Replaces the old right-extending `scenario-gantt:N` tabs.
 */
export const ScenarioNavDropdown = () => {
  const activeModule      = useShellStore((s) => s.activeModule)
  const openTabs          = useShellStore((s) => s.openTabs)
  const scenarioTabLabels = useShellStore((s) => s.scenarioTabLabels)
  const scenarioTabTypes  = useShellStore((s) => s.scenarioTabTypes)
  const setModule         = useShellStore((s) => s.setModule)
  const closeTabAndSetModule = useShellStore((s) => s.closeTabAndSetModule)
  const closeAllScenarioTabs = useShellStore((s) => s.closeAllScenarioTabs)

  const openScenarios = openTabs.filter((t) => t.startsWith(SCENARIO_PREFIX))
  const activeIsScenario = activeModule.startsWith(SCENARIO_PREFIX)
  const activeIsList = activeModule === 'scenario'
  const isActive = activeIsScenario || activeIsList

  // When on a non-scenario, non-list tab (e.g. Live, Data) but with open scenario
  // tabs, keep showing the last open scenario's label so the user can see it is
  // still there and navigate back with one click.
  const lastOpenScenario = !activeIsScenario && !activeIsList && openScenarios.length > 0
    ? openScenarios[openScenarios.length - 1]
    : null

  const displayModule = activeIsScenario ? activeModule : lastOpenScenario

  const activeType = displayModule
    ? ((scenarioTabTypes[displayModule] ?? 'PO') as ScenarioType)
    : null
  const TriggerIcon = activeType ? SCENARIO_TYPE_ICON[activeType] : FlaskConical
  const triggerLabel = displayModule
    ? (scenarioTabLabels[displayModule] ?? scenarioFallbackLabel(displayModule))
    : 'Scenario'

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="module-nav-scenario"
              className={cn(
                'group flex h-[28px] shrink-0 items-center gap-1.5 rounded-sm pl-2.5 pr-1.5 text-xs font-medium whitespace-nowrap transition-all duration-100',
                isActive
                  ? activeIsScenario
                    ? SCENARIO_ID_BADGE_CLASS
                    : 'bg-accent text-foreground font-semibold'
                  : 'text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[140px] truncate">{triggerLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {displayModule && (
          <TooltipContent side="bottom" className="max-w-[320px] text-xs">
            {triggerLabel}
          </TooltipContent>
        )}
      </Tooltip>

      <DropdownMenuContent align="start" className="min-w-[200px]">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <DropdownMenuItem
            data-testid="scenario-nav-list"
            onSelect={() => setModule('scenario')}
            className={cn('flex-1 rounded-sm', activeIsList && 'font-semibold')}
          >
            <ClipboardList className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Scenarios
          </DropdownMenuItem>
          <button
            type="button"
            data-testid="scenario-nav-close-all"
            onClick={() => closeAllScenarioTabs()}
            className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            aria-label="Close all scenario tabs"
          >
            <CircleOff className="h-3.5 w-3.5 shrink-0" />
            Close All
          </button>
        </div>

        {openScenarios.map((module) => {
          const { id: scenarioId } = parseScenarioModuleKey(module)
          const type = (scenarioTabTypes[module] ?? 'PO') as ScenarioType
          const Icon = SCENARIO_TYPE_ICON[type]
          const colors = SCENARIO_TYPE_COLOR[type]
          const label = scenarioTabLabels[module] ?? scenarioFallbackLabel(module)
          const rowActive = module === activeModule
          return (
            <Tooltip key={module}>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  data-testid={`scenario-nav-tab-${module}`}
                  onSelect={() => setModule(module)}
                  className={cn('group/row pr-1', rowActive && `${colors.bg} ${colors.text} font-semibold`)}
                >
                  <Icon className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[160px] truncate">{label}</span>
                  <button
                    type="button"
                    data-testid={`scenario-nav-close-${module}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      closeTabAndSetModule(module, 'scenario')
                    }}
                    className="ml-auto flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-muted hover:text-foreground"
                    aria-label={`Close ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[320px] text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
