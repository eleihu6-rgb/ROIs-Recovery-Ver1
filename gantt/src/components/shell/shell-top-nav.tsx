import { X } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import {
  LayoutDashboard, CalendarDays, FlaskConical, Database,
  LogOut, HelpCircle, Megaphone, Scale, Wrench, CalendarCog, Settings2,
} from 'lucide-react'
import { ScenarioNavDropdown } from '@/components/shell/scenario-nav-dropdown'
import { ThemeSwitcher } from '@/components/common/theme-switcher'
import { AirlineLogo } from '@/components/common/airline-logo'
import { useAppVersionStore } from '@/services/app-version-service'
import { useShellStore } from '@/stores/shell-store'
import { useAuthStore } from '@/stores/auth-store'
import { useMenuStore } from '@/stores/menu-store'
import { APP_ENV } from '@/config/env'
import type { ActiveModule } from '@/stores/shell-store'
import { useEffect } from 'react'

interface NavItem {
  module: ActiveModule
  label: string
  Icon: React.ElementType
  /** Optional testid override; defaults to `module-nav-${module}`. */
  testid?: string
}

const NAV_ITEMS: NavItem[] = [
  { module: 'dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
  { module: 'live',       label: 'Live',       Icon: CalendarDays },
  { module: 'scenario',   label: 'Scenario',   Icon: FlaskConical },
  { module: 'data',       label: 'Data',       Icon: Database },
  { module: 'legality',   label: 'Legality',   Icon: Scale },
  { module: 'system',     label: 'System',     Icon: Settings2 },
  { module: 'regression', label: 'Regression', Icon: FlaskConical, testid: 'nav-regression' },
  { module: 'pbs',        label: 'PBS',        Icon: CalendarCog,  testid: 'nav-pbs' },
  { module: 'dev',        label: 'Dev',        Icon: Wrench,       testid: 'nav-dev' },
  { module: 'help',       label: 'Help',       Icon: HelpCircle,   testid: 'nav-help' },
  { module: 'release',    label: 'Release',    Icon: Megaphone,    testid: 'nav-release' },
]

const NavDivider = () => <div className="mx-1.5 h-4 w-px bg-border/60 shrink-0" />

const ENV_BADGE_STYLES: Record<string, string> = {
  PROD: 'bg-red-600 text-white',
  UAT:  'bg-amber-500 text-black',
  SIT:  'bg-blue-600 text-white',
  DEV:  'bg-slate-500 text-white',
}

export const ShellTopNav = () => {
  const activeModule      = useShellStore((s) => s.activeModule)
  const openTabs          = useShellStore((s) => s.openTabs)
  const setModule         = useShellStore((s) => s.setModule)
  const closeTab          = useShellStore((s) => s.closeTab)
  const user = useAuthStore((s) => s.user)
  // 订阅 nodes（变化触发重渲染）——仅订阅函数引用不会在菜单加载后刷新
  const menuNodes = useMenuStore((s) => s.nodes)
  const canAccessModule   = useMenuStore((s) => s.canAccessModule)
  const appVersion = useAppVersionStore((s) => s.appVersion)

  // 登录后拉取权限菜单树（未授权 Tab 不渲染）
  useEffect(() => {
    if (user) void useMenuStore.getState().load()
  }, [user])

  // 按权限过滤：每个 module 是否渲染由 canAccessModule 决定（admin 短路通过，
  // 非 admin 必须拥有对应菜单权限；菜单未加载时 fail-open 由 AppShell/ContentArea 兜底）。
  const PERM_NAV_ITEMS = NAV_ITEMS.filter(({ module }) => canAccessModule(module))

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

        {/* Module nav — tab style; open modules show close button when multiple tabs open */}
        {PERM_NAV_ITEMS.map(({ module, label, Icon, testid }) => {
          if (module === 'scenario') {
            return <ScenarioNavDropdown key={module} />
          }
          const isActive = module === activeModule
          const isOpen   = openTabs.includes(module)
          const canClose = isOpen && openTabs.length > 1
          return (
            <div
              key={module}
              className={[
                'group flex h-[28px] shrink-0 items-center rounded-sm text-xs font-medium whitespace-nowrap transition-all duration-100',
                isActive
                  ? 'bg-accent text-foreground font-semibold pl-2.5 pr-1.5'
                  : isOpen
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground pl-2.5 pr-1.5'
                    : 'text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground px-2.5',
              ].join(' ')}
            >
              <button
                data-testid={testid ?? `module-nav-${module}`}
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

        {/* Env Badge */}
        {APP_ENV && ENV_BADGE_STYLES[APP_ENV] && (
          <span data-testid="env-badge" className={`rounded px-1.5 py-0.5 text-2xs font-bold ${ENV_BADGE_STYLES[APP_ENV]}`}>
            {APP_ENV}
          </span>
        )}

        <span className="px-1 text-xs text-muted-foreground whitespace-nowrap">
          {user?.userCode ?? '—'} · {user?.schema?.toUpperCase() ?? ''}
        </span>

        <span
          className="px-1 text-xs font-semibold text-muted-foreground/80 tabular-nums whitespace-nowrap"
          title="Repo version (B=backend / F=frontend)"
        >
          {appVersion}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
              onClick={() => useAuthStore.getState().logout()}
              data-testid="logout-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Sign Out</TooltipContent>
        </Tooltip>

      </header>
    </TooltipProvider>
  )
}
