# App Shell 改造 Implementation Plan — Part 2: Shell UI

> **索引：** [Part 1: Backend + Foundation](2026-04-14-app-shell-part1-backend-foundation.md) | [Part 2: Shell UI](2026-04-14-app-shell-part2-shell-ui.md)

**Goal:** 登录后落地 Dashboard 页，Gantt 作为 Live → Roster 子视图嵌入 App Shell 框架，Shell 支持 TopNav / TabBar / Sidebar 独立隐藏切换，Dashboard 对接真实后端 API。

**Architecture:** AppShell 作为顶层容器替换原 AuthenticatedApp 中的直接 AppLayout 渲染。ShellStore 管理模块切换与布局可见性，切换至 Live 时自动折叠侧边栏。后端新增 `/api/dashboard/overview` 聚合查询端点。

**Tech Stack:** React 19, Zustand, Tailwind CSS v4, Lucide React, Fastify, Drizzle ORM (node-postgres), Vitest

---

## Task 7: Frontend — ShellTabBar

**Files:**
- Create: `gantt/src/components/shell/shell-tab-bar.tsx`

- [ ] **Step 1: 创建 shell-tab-bar.tsx**

新建 `gantt/src/components/shell/shell-tab-bar.tsx`：

```typescript
import { useShellStore } from '@/stores/shell-store'
import type { ActiveModule } from '@/stores/shell-store'

interface TabDef {
  id: string
  label: string
  module: ActiveModule
  dotClass: string
}

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', module: 'dashboard', dotClass: 'bg-chart-1' },
  { id: 'roster',    label: 'Roster',    module: 'live',      dotClass: 'bg-chart-2' },
]

export const ShellTabBar = () => {
  const tabBarVisible = useShellStore((s) => s.tabBarVisible)
  const activeModule = useShellStore((s) => s.activeModule)
  const setModule = useShellStore((s) => s.setModule)

  return (
    <div
      className={[
        'shrink-0 flex items-center bg-card border-b border-border overflow-hidden transition-[height,opacity] duration-200',
        tabBarVisible ? 'h-[34px] opacity-100' : 'h-0 opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="flex h-full flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
        {TABS.map((tab) => {
          const isActive = tab.module === activeModule
          return (
            <button
              key={tab.id}
              onClick={() => setModule(tab.module)}
              className={[
                'flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[11.5px] font-medium whitespace-nowrap transition-all duration-100',
                isActive
                  ? 'bg-accent text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab.dotClass}`} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 3: Commit**

```bash
cd gantt
git add src/components/shell/shell-tab-bar.tsx
git commit -m "feat(shell): ShellTabBar — 含隐藏/显示动画"
```

---

## Task 8: Frontend — ShellSidebar

**Files:**
- Create: `gantt/src/components/shell/shell-sidebar.tsx`

- [ ] **Step 1: 创建 shell-sidebar.tsx**

新建 `gantt/src/components/shell/shell-sidebar.tsx`：

```typescript
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import {
  PanelLeftClose, PanelLeftOpen,
  PanelBottomClose, PanelBottomOpen,
  PanelTopClose, PanelTopOpen,
  CalendarDays, Link2, Plane,
} from 'lucide-react'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveLiveItem } from '@/stores/shell-store'

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  live:      'Live',
  rule:      'Rule',
  data:      'Data',
  system:    'System',
}

interface LiveMenuItem {
  item: ActiveLiveItem
  label: string
  Icon: React.ElementType
  todo: boolean
}

const LIVE_MENU: LiveMenuItem[] = [
  { item: 'roster',  label: 'Roster',  Icon: CalendarDays, todo: false },
  { item: 'pairing', label: 'Pairing', Icon: Link2,        todo: true },
  { item: 'flight',  label: 'Flight',  Icon: Plane,        todo: true },
]

export const ShellSidebar = () => {
  const activeModule    = useShellStore((s) => s.activeModule)
  const activeLiveItem  = useShellStore((s) => s.activeLiveItem)
  const setLiveItem     = useShellStore((s) => s.setLiveItem)
  const sidebarState    = useShellStore((s) => s.sidebarState)
  const setSidebarState = useShellStore((s) => s.setSidebarState)
  const tabBarVisible   = useShellStore((s) => s.tabBarVisible)
  const toggleTabBar    = useShellStore((s) => s.toggleTabBar)
  const topNavVisible   = useShellStore((s) => s.topNavVisible)
  const toggleTopNav    = useShellStore((s) => s.toggleTopNav)

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden    = sidebarState === 'hidden'
  const label = MODULE_LABELS[activeModule] ?? activeModule

  return (
    <aside
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
            'flex-1 truncate text-[10px] font-extrabold uppercase tracking-widest text-sidebar-primary',
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

          {/* Toggle Tab Bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-100"
                onClick={toggleTabBar}
              >
                {tabBarVisible
                  ? <PanelBottomClose className="h-3 w-3" />
                  : <PanelBottomOpen  className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {tabBarVisible ? 'Hide Tab Bar' : 'Show Tab Bar'}
            </TooltipContent>
          </Tooltip>

          {/* Toggle Top Nav */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-100"
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
              <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Scheduling
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {LIVE_MENU.map(({ item, label: itemLabel, Icon, todo }) => {
                const isActive = activeLiveItem === item && !todo
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role={todo ? undefined : 'button'}
                        tabIndex={todo ? -1 : 0}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-[12px] transition-colors duration-100',
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
                              <span className="ml-auto rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground">
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
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 3: Commit**

```bash
cd gantt
git add src/components/shell/shell-sidebar.tsx
git commit -m "feat(shell): ShellSidebar — 折叠/隐藏、Live 子菜单、快捷按钮"
```

---

## Task 9: Frontend — Dashboard API Service + DashboardView

**Files:**
- Create: `gantt/src/services/dashboard-service.ts`
- Create: `gantt/src/components/shell/dashboard-view.tsx`

- [ ] **Step 1: 创建前端 dashboard-service.ts**

新建 `gantt/src/services/dashboard-service.ts`：

```typescript
import { api } from './api'

export interface DashboardOverview {
  flightsToday: number
  totalActiveCrew: number
  violations: number | null
  pendingApprovals: number | null
  crewByRank: Array<{ rank: string; count: number }>
  flightsByDay: Array<{ date: string; count: number }>
}

export const dashboardApi = {
  async overview(): Promise<DashboardOverview> {
    return api.get('/api/dashboard/overview') as Promise<DashboardOverview>
  },
}
```

- [ ] **Step 2: 创建 dashboard-view.tsx**

新建 `gantt/src/components/shell/dashboard-view.tsx`：

```typescript
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { dashboardApi, type DashboardOverview } from '@/services/dashboard-service'

const StatCard = ({
  label,
  value,
  accentClass,
  sub,
}: {
  label: string
  value: number | null
  accentClass: string
  sub: string
}) => (
  <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
    <div className={`absolute inset-x-0 top-0 h-[3px] rounded-t-lg ${accentClass}`} />
    <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {label}
    </div>
    <div className="mb-1 text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">
      {value === null ? '—' : value.toLocaleString()}
    </div>
    <div className="text-[10.5px] text-muted-foreground">{sub}</div>
  </div>
)

export const DashboardView = () => {
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const result = await dashboardApi.overview()
      setData(result)
    } catch {
      // silently fail — stat cards show "—"
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const maxRank = Math.max(...(data?.crewByRank.map((r) => r.count) ?? [1]), 1)
  const maxDay  = Math.max(...(data?.flightsByDay.map((d) => d.count) ?? [1]), 1)

  return (
    <div className="h-full overflow-y-auto p-5">
      {/* Page header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[15px] font-extrabold tracking-tight text-foreground">Overview</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{today} · F8 Airlines</div>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mb-3 grid grid-cols-4 gap-2.5">
            <StatCard label="Flights Today"     value={data?.flightsToday ?? null}      accentClass="bg-chart-1"    sub="Scheduled departures" />
            <StatCard label="Active Crew"        value={data?.totalActiveCrew ?? null}   accentClass="bg-chart-2"    sub="On payroll" />
            <StatCard label="Violations"         value={data?.violations ?? null}        accentClass="bg-destructive" sub="Rule checks" />
            <StatCard label="Pending Approvals"  value={data?.pendingApprovals ?? null}  accentClass="bg-chart-4"    sub="Awaiting review" />
          </div>

          {/* Charts row */}
          <div className="mb-3 grid grid-cols-3 gap-2.5">
            {/* Crew by Rank — horizontal bar chart */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-[11px] font-bold text-foreground">Crew by Rank</div>
              {data && data.crewByRank.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {data.crewByRank.map(({ rank, count }) => (
                    <div key={rank} className="flex items-center gap-2 text-[11px]">
                      <div className="w-10 shrink-0 text-right text-[10px] font-medium text-muted-foreground">
                        {rank}
                      </div>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-primary transition-[width] duration-500"
                          style={{ width: `${Math.round((count / maxRank) * 100)}%` }}
                        />
                      </div>
                      <div className="w-8 shrink-0 text-right text-[10px] font-semibold text-muted-foreground">
                        {count}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center text-[11px] italic text-muted-foreground/50">
                  No data
                </div>
              )}
            </div>

            {/* Crew Status — placeholder */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-[11px] font-bold text-foreground">Crew Status</div>
              <div className="flex h-[80px] items-center justify-center text-[11px] italic text-muted-foreground/50">
                Data integration pending
              </div>
            </div>

            {/* Flights last 14 days — vertical bar chart */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-[11px] font-bold text-foreground">Flights — Last 14 Days</div>
              {data && data.flightsByDay.length > 0 ? (
                <>
                  <div className="flex h-[60px] items-end gap-[3px]">
                    {data.flightsByDay.map(({ date, count }) => (
                      <div
                        key={date}
                        className="min-h-[4px] flex-1 rounded-t-[2px] bg-primary/55 transition-opacity duration-100 hover:bg-primary"
                        style={{ height: `${Math.max(4, Math.round((count / maxDay) * 100))}%` }}
                        title={`${date}: ${count}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
                    <span>{data.flightsByDay[0]?.date?.slice(5) ?? ''}</span>
                    <span>{data.flightsByDay.at(-1)?.date?.slice(5) ?? ''}</span>
                  </div>
                </>
              ) : (
                <div className="flex h-[60px] items-center justify-center text-[11px] italic text-muted-foreground/50">
                  No data
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 4: Commit**

```bash
cd gantt
git add src/services/dashboard-service.ts src/components/shell/dashboard-view.tsx
git commit -m "feat(shell): DashboardView + API service — 统计卡与图表"
```

---

## Task 10: Frontend — RosterView + PlaceholderView

**Files:**
- Create: `gantt/src/components/shell/roster-view.tsx`
- Create: `gantt/src/components/shell/placeholder-view.tsx`

- [ ] **Step 1: 创建 roster-view.tsx**

新建 `gantt/src/components/shell/roster-view.tsx`：

```typescript
import { GanttSubToolbar } from './gantt-sub-toolbar'
import { AppLayout } from '@/components/layout/app-layout'

/** Live → Roster 视图：Gantt 专用工具栏 + 完整排班界面 */
export const RosterView = () => (
  <div className="flex h-full flex-col overflow-hidden">
    <GanttSubToolbar />
    <AppLayout />
  </div>
)
```

- [ ] **Step 2: 创建 placeholder-view.tsx**

新建 `gantt/src/components/shell/placeholder-view.tsx`：

```typescript
interface PlaceholderViewProps {
  module: string
}

/** 未开发模块的占位页 */
export const PlaceholderView = ({ module }: PlaceholderViewProps) => (
  <div className="flex h-full items-center justify-center">
    <div className="text-center">
      <div className="mb-2 text-[15px] font-bold text-foreground">{module}</div>
      <div className="text-[12px] text-muted-foreground">This module is under development</div>
    </div>
  </div>
)
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 4: Commit**

```bash
cd gantt
git add src/components/shell/roster-view.tsx src/components/shell/placeholder-view.tsx
git commit -m "feat(shell): RosterView（GanttSubToolbar + AppLayout）+ PlaceholderView"
```

---

## Task 11: Frontend — AppShell（顶层容器）

**Files:**
- Create: `gantt/src/components/shell/app-shell.tsx`

- [ ] **Step 1: 创建 app-shell.tsx**

新建 `gantt/src/components/shell/app-shell.tsx`：

```typescript
import { useEffect } from 'react'
import { ShellTopNav } from './shell-top-nav'
import { ShellTabBar } from './shell-tab-bar'
import { ShellSidebar } from './shell-sidebar'
import { DashboardView } from './dashboard-view'
import { RosterView } from './roster-view'
import { PlaceholderView } from './placeholder-view'
import { useShellStore } from '@/stores/shell-store'
import { useColumnStore } from '@/stores/column-store'
import { useFilterStore } from '@/stores/filter-store'
import { useAssignmentStore } from '@/stores/assignment-store'

const ContentArea = () => {
  const activeModule   = useShellStore((s) => s.activeModule)
  const activeLiveItem = useShellStore((s) => s.activeLiveItem)

  if (activeModule === 'dashboard') return <DashboardView />
  if (activeModule === 'live' && activeLiveItem === 'roster') return <RosterView />

  const label = activeModule.charAt(0).toUpperCase() + activeModule.slice(1)
  return <PlaceholderView module={label} />
}

export const AppShell = () => {
  const topNavVisible         = useShellStore((s) => s.topNavVisible)
  const loadShell             = useShellStore((s) => s.loadFromStorage)
  const loadColumns           = useColumnStore((s) => s.loadFromStorage)
  const loadFilters           = useFilterStore((s) => s.loadFromStorage)
  const fetchAssignmentGroups = useAssignmentStore((s) => s.fetchGroups)

  useEffect(() => {
    loadShell()
    loadColumns()
    loadFilters()
    fetchAssignmentGroups()
  }, [loadShell, loadColumns, loadFilters, fetchAssignmentGroups])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top nav — animates to h-0 when hidden */}
      <div
        className={[
          'shrink-0 overflow-hidden transition-[height,opacity] duration-200',
          topNavVisible ? 'h-11 opacity-100' : 'h-0 opacity-0',
        ].join(' ')}
      >
        <ShellTopNav />
      </div>

      <ShellTabBar />

      {/* Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ShellSidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <ContentArea />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 3: Commit**

```bash
cd gantt
git add src/components/shell/app-shell.tsx
git commit -m "feat(shell): AppShell 顶层容器"
```

---

## Task 12: Frontend — App.tsx 接线

**Files:**
- Modify: `gantt/src/App.tsx`

- [ ] **Step 1: 修改 App.tsx**

编辑 `gantt/src/App.tsx`：

1. 删除 `import { AppLayout } from '@/components/layout/app-layout'`
2. 添加 `import { AppShell } from '@/components/shell/app-shell'`
3. 删除 `AuthenticatedApp` 中的 store imports 和 useEffect（已移至 AppShell）
4. 简化 `AuthenticatedApp`：

```typescript
import { AppShell } from '@/components/shell/app-shell'

/** Main app — only rendered after authentication */
function AuthenticatedApp() {
  return <AppShell />
}
```

完整修改后的 `App.tsx`：

```typescript
import { Component, type ReactNode, useEffect, useState } from 'react'
import { I18nProvider } from '@rois/ui'
import { AppShell } from '@/components/shell/app-shell'
import { LoginPage } from '@/components/auth/login-page'
import { SessionTimeoutDialog } from '@/components/auth/session-timeout-dialog'
import { useThemeStore } from '@/stores/theme-store'
import { useAuthStore } from '@/stores/auth-store'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 20, color: 'red' }}>Render Error</h1>
          <pre style={{ background: '#f5f5f5', padding: 16, whiteSpace: 'pre-wrap' }}>
            {this.state.error}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function AuthenticatedApp() {
  return <AppShell />
}

function App() {
  const user = useAuthStore((s) => s.user)
  const restore = useAuthStore((s) => s.restore)
  const [restoring, setRestoring] = useState(true)

  const loadTheme = useThemeStore((s) => s.loadFromStorage)
  useEffect(() => { loadTheme() }, [loadTheme])

  useEffect(() => {
    restore().finally(() => setRestoring(false))
  }, [restore])

  if (restoring) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <I18nProvider>
      <ErrorBoundary>
        {user ? (
          <>
            <AuthenticatedApp />
            <SessionTimeoutDialog />
          </>
        ) : (
          <LoginPage />
        )}
      </ErrorBoundary>
    </I18nProvider>
  )
}

export default App
```

- [ ] **Step 2: 最终 TypeScript 全量检查**

```bash
cd gantt && npx tsc --noEmit
```

期望：0 errors

- [ ] **Step 3: 检查 live-server TypeScript**

```bash
cd live-server && npx tsc --noEmit
```

期望：0 errors

- [ ] **Step 4: 运行 live-server 所有测试**

```bash
cd live-server && npm test
```

期望：所有测试通过（含新增的 dashboard-service 测试）

- [ ] **Step 5: Commit + Push**

```bash
cd gantt
git add src/App.tsx
git commit -m "feat(shell): App.tsx 接入 AppShell，完成 App Shell 改造"

git push origin feat/rule-engine-upgrade
```

---

## 自检：规格覆盖

| 规格要求 | 实现任务 |
|---------|---------|
| 登录后默认落地 Dashboard | Task 3 ShellStore 默认 `activeModule: 'dashboard'`，Task 12 App.tsx |
| TopNav/TabBar/Sidebar 独立隐藏切换 | Task 3 ShellStore + Task 6/7/8 |
| 侧边栏快捷折叠按钮（3 个） | Task 8 ShellSidebar header |
| 切换至 Live 时自动折叠侧边栏 | Task 3 ShellStore `setModule` 逻辑 |
| 用户手动操作不被自动覆盖 | Task 3 ShellStore `sidebarUserOverride` |
| Live → Roster 打开完整 Gantt | Task 10 RosterView + Task 5 AppLayout |
| Pairing/Flight 列为 TODO | Task 8 ShellSidebar `todo: true` |
| GanttSubToolbar 保留所有 Gantt 控件 | Task 4 |
| ThemeSwitcher / 登出 移至 TopNav | Task 6 ShellTopNav |
| Dashboard API 真实数据 | Task 1 dashboard-service + Task 2 路由 |
| crewByRank 使用 display_order 排序 | Task 1 SQL |
| flightsByDay 使用 flt_dt 字段 | Task 1 SQL |
| `h-screen` → `h-full` | Task 5 AppLayout |
| TypeScript 0 errors | Task 2/5/12 检查步骤 |
