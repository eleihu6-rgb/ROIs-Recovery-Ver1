# App Shell 改造 Implementation Plan — Part 1: Backend + Foundation

> **索引：** [Part 1: Backend + Foundation](2026-04-14-app-shell-part1-backend-foundation.md) | [Part 2: Shell UI](2026-04-14-app-shell-part2-shell-ui.md)

**Goal:** 登录后落地 Dashboard 页，Gantt 作为 Live → Roster 子视图嵌入 App Shell 框架，Shell 支持 TopNav / TabBar / Sidebar 独立隐藏切换，Dashboard 对接真实后端 API。

**Architecture:** AppShell 作为顶层容器替换原 AuthenticatedApp 中的直接 AppLayout 渲染。ShellStore 管理模块切换与布局可见性，切换至 Live 时自动折叠侧边栏。后端新增 `/api/dashboard/overview` 聚合查询端点。

**Tech Stack:** React 19, Zustand, Tailwind CSS v4, Lucide React, Fastify, Drizzle ORM (node-postgres), Vitest

---

## File Map

### New — live-server
| File | Responsibility |
|------|---------------|
| `live-server/src/services/dashboard/dashboard-service.ts` | 聚合查询：flightsToday / totalActiveCrew / crewByRank / flightsByDay |
| `live-server/src/routes/dashboard/dashboard.ts` | GET /overview 路由处理器 |
| `live-server/src/routes/dashboard/index.ts` | 路由注册入口 |
| `live-server/src/__tests__/services/dashboard/dashboard-service.test.ts` | 单元测试 |

### New — gantt
| File | Responsibility |
|------|---------------|
| `gantt/src/stores/shell-store.ts` | 模块切换、布局可见性、侧边栏状态，持久化 localStorage |
| `gantt/src/services/dashboard-service.ts` | 前端 API 调用封装 |
| `gantt/src/components/shell/app-shell.tsx` | 顶层 Shell 容器，组合所有子组件 |
| `gantt/src/components/shell/shell-top-nav.tsx` | ROIS logo + 模块导航 + 右侧控件 |
| `gantt/src/components/shell/shell-tab-bar.tsx` | Tab 列表，支持隐藏/显示动画 |
| `gantt/src/components/shell/shell-sidebar.tsx` | 左侧模块导航，3 个快捷折叠按钮，Live 子菜单 |
| `gantt/src/components/shell/dashboard-view.tsx` | Dashboard 统计卡 + 图表 + 近期排班表 |
| `gantt/src/components/shell/roster-view.tsx` | GanttSubToolbar + AppLayout 包装 |
| `gantt/src/components/shell/gantt-sub-toolbar.tsx` | 从 header.tsx 提取，去除登出/ThemeSwitcher |
| `gantt/src/components/shell/placeholder-view.tsx` | Rule/Data/System 占位页 |

### Modified
| File | Change |
|------|--------|
| `live-server/src/index.ts` | 注册 `/api/dashboard` 路由 |
| `gantt/src/App.tsx` | AuthenticatedApp 渲染 AppShell，移除已迁移到 AppShell 的 effects |
| `gantt/src/components/layout/app-layout.tsx` | 移除 `<Header />`，外层 `h-screen` → `h-full` |

---

## Task 1: Backend — Dashboard Service（含测试）

**Files:**
- Create: `live-server/src/services/dashboard/dashboard-service.ts`
- Create: `live-server/src/__tests__/services/dashboard/dashboard-service.test.ts`

- [ ] **Step 1: 创建测试目录并写失败测试**

```bash
mkdir -p live-server/src/__tests__/services/dashboard
```

新建 `live-server/src/__tests__/services/dashboard/dashboard-service.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dashboardService } from '../../../services/dashboard/dashboard-service.js'

const makeFastify = (responses: {
  flightsToday?: unknown[]
  activeCrew?: unknown[]
  crewByRank?: unknown[]
  flightsByDay?: unknown[]
}) => {
  let callIndex = 0
  const responseOrder = [
    responses.flightsToday ?? [{ count: '0' }],
    responses.activeCrew ?? [{ count: '0' }],
    responses.crewByRank ?? [],
    responses.flightsByDay ?? [],
  ]
  return {
    db: {
      execute: vi.fn().mockImplementation(() => ({
        rows: responseOrder[callIndex++] ?? [],
      })),
    },
  } as any
}

describe('dashboardService.overview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('converts string count fields to numbers', async () => {
    const fastify = makeFastify({
      flightsToday: [{ count: '42' }],
      activeCrew: [{ count: '1847' }],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.flightsToday).toBe(42)
    expect(result.totalActiveCrew).toBe(1847)
  })

  it('violations and pendingApprovals are always null', async () => {
    const fastify = makeFastify({})
    const result = await dashboardService.overview(fastify)
    expect(result.violations).toBeNull()
    expect(result.pendingApprovals).toBeNull()
  })

  it('maps crewByRank with rank and count', async () => {
    const fastify = makeFastify({
      crewByRank: [
        { rank: 'CPT', display_order: 1, count: '421' },
        { rank: 'FO',  display_order: 2, count: '512' },
      ],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.crewByRank).toEqual([
      { rank: 'CPT', count: 421 },
      { rank: 'FO',  count: 512 },
    ])
  })

  it('maps flightsByDay with date and count', async () => {
    const fastify = makeFastify({
      flightsByDay: [
        { date: '2026-04-01', count: '48' },
        { date: '2026-04-14', count: '52' },
      ],
    })
    const result = await dashboardService.overview(fastify)
    expect(result.flightsByDay).toEqual([
      { date: '2026-04-01', count: 48 },
      { date: '2026-04-14', count: 52 },
    ])
  })

  it('returns empty arrays when no data', async () => {
    const fastify = makeFastify({})
    const result = await dashboardService.overview(fastify)
    expect(result.crewByRank).toEqual([])
    expect(result.flightsByDay).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd live-server && npm test -- --reporter=verbose src/__tests__/services/dashboard/
```

期望：`Error: Cannot find module '../../../services/dashboard/dashboard-service.js'`

- [ ] **Step 3: 创建 dashboard-service.ts**

新建 `live-server/src/services/dashboard/dashboard-service.ts`：

```typescript
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

export interface DashboardOverview {
  flightsToday: number
  totalActiveCrew: number
  violations: null
  pendingApprovals: null
  crewByRank: Array<{ rank: string; count: number }>
  flightsByDay: Array<{ date: string; count: number }>
}

export const dashboardService = {
  async overview(fastify: FastifyInstance): Promise<DashboardOverview> {
    // today in Asia/Shanghai as YYYY-MM-DD string (matches flt_dt format)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

    const { rows: flightsTodayRows } = await fastify.db.execute(sql`
      SELECT COUNT(*) AS count
      FROM roster_flight
      WHERE flt_dt = ${today}
        AND is_deleted = 0
    `)
    const flightsToday = Number((flightsTodayRows[0] as Record<string, unknown>)?.count ?? 0)

    const { rows: activeCrewRows } = await fastify.db.execute(sql`
      SELECT COUNT(*) AS count
      FROM crew
      WHERE status = 0
        AND is_deleted = 0
    `)
    const totalActiveCrew = Number((activeCrewRows[0] as Record<string, unknown>)?.count ?? 0)

    const { rows: crewByRankRows } = await fastify.db.execute(sql`
      SELECT r.rank, r.display_order, COUNT(DISTINCT cr.crew_id) AS count
      FROM crew_rank cr
      JOIN rank r ON r.rank = cr.rank
      JOIN crew c ON c.crew_id = cr.crew_id
      WHERE cr.eff_dt <= NOW()
        AND (cr.exp_dt IS NULL OR cr.exp_dt > NOW())
        AND c.status = 0
        AND c.is_deleted = 0
      GROUP BY r.rank, r.display_order
      ORDER BY r.display_order
    `)
    const crewByRank = (crewByRankRows as Record<string, unknown>[]).map((r) => ({
      rank: r.rank as string,
      count: Number(r.count),
    }))

    const { rows: flightsByDayRows } = await fastify.db.execute(sql`
      SELECT flt_dt AS date, COUNT(*) AS count
      FROM roster_flight
      WHERE flt_dt >= TO_CHAR(NOW() - INTERVAL '13 days', 'YYYY-MM-DD')
        AND is_deleted = 0
      GROUP BY flt_dt
      ORDER BY flt_dt
    `)
    const flightsByDay = (flightsByDayRows as Record<string, unknown>[]).map((r) => ({
      date: r.date as string,
      count: Number(r.count),
    }))

    return {
      flightsToday,
      totalActiveCrew,
      violations: null,
      pendingApprovals: null,
      crewByRank,
      flightsByDay,
    }
  },
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd live-server && npm test -- --reporter=verbose src/__tests__/services/dashboard/
```

期望：5 tests pass

- [ ] **Step 5: Commit**

```bash
cd live-server
git add src/services/dashboard/dashboard-service.ts src/__tests__/services/dashboard/dashboard-service.test.ts
git commit -m "feat(dashboard): dashboard-service 聚合查询 + 单元测试"
```

---

## Task 2: Backend — Dashboard Route

**Files:**
- Create: `live-server/src/routes/dashboard/dashboard.ts`
- Create: `live-server/src/routes/dashboard/index.ts`
- Modify: `live-server/src/index.ts`

- [ ] **Step 1: 创建路由文件**

新建 `live-server/src/routes/dashboard/dashboard.ts`：

```typescript
import type { FastifyInstance } from 'fastify'
import { success } from '../../utils/response.js'
import { dashboardService } from '../../services/dashboard/dashboard-service.js'

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/overview
  fastify.get('/overview', async (_request, reply) => {
    const data = await dashboardService.overview(fastify)
    return success(reply, data)
  })
}
```

新建 `live-server/src/routes/dashboard/index.ts`：

```typescript
import type { FastifyInstance } from 'fastify'
import dashboardRoutes from './dashboard.js'

export default async function (fastify: FastifyInstance) {
  fastify.register(dashboardRoutes)
}
```

- [ ] **Step 2: 注册路由到 index.ts**

编辑 `live-server/src/index.ts`，在现有 import 区末尾添加：

```typescript
import dashboardRoutes from './routes/dashboard/index.js'
```

在 `await server.register(draftRoutes, { prefix: '/api/draft' })` 后添加：

```typescript
await server.register(dashboardRoutes, { prefix: '/api/dashboard' })
```

- [ ] **Step 3: TypeScript 编译检查**

```bash
cd live-server && npx tsc --noEmit
```

期望：0 errors

- [ ] **Step 4: Commit**

```bash
cd live-server
git add src/routes/dashboard/ src/index.ts
git commit -m "feat(dashboard): GET /api/dashboard/overview 路由"
```

---

## Task 3: Frontend — ShellStore

**Files:**
- Create: `gantt/src/stores/shell-store.ts`

- [ ] **Step 1: 创建 shell-store.ts**

新建 `gantt/src/stores/shell-store.ts`：

```typescript
import { create } from 'zustand'

export type ActiveModule = 'dashboard' | 'live' | 'rule' | 'data' | 'system'
export type ActiveLiveItem = 'roster' | 'pairing' | 'flight'
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

interface ShellStore {
  activeModule: ActiveModule
  activeLiveItem: ActiveLiveItem
  topNavVisible: boolean
  tabBarVisible: boolean
  sidebarState: SidebarState
  /** true 表示用户手动操作过 sidebar，阻止模块切换时自动覆盖 */
  sidebarUserOverride: boolean

  setModule: (module: ActiveModule) => void
  setLiveItem: (item: ActiveLiveItem) => void
  toggleTopNav: () => void
  toggleTabBar: () => void
  /** byUser=true 时设置 sidebarUserOverride=true，阻止后续自动切换 */
  setSidebarState: (state: SidebarState, byUser?: boolean) => void
  loadFromStorage: () => void
}

const KEYS = {
  module:          'rois-shell-module',
  liveItem:        'rois-shell-live-item',
  topNav:          'rois-shell-top-nav',
  tabBar:          'rois-shell-tab-bar',
  sidebar:         'rois-shell-sidebar',
  sidebarOverride: 'rois-shell-sidebar-override',
} as const

const save = (key: string, value: string): void => {
  try { localStorage.setItem(key, value) } catch { /* ignore storage errors */ }
}

export const useShellStore = create<ShellStore>((set, get) => ({
  activeModule: 'dashboard',
  activeLiveItem: 'roster',
  topNavVisible: true,
  tabBarVisible: true,
  sidebarState: 'expanded',
  sidebarUserOverride: false,

  setModule: (module) => {
    const { sidebarUserOverride } = get()
    set({ activeModule: module })
    save(KEYS.module, module)
    if (!sidebarUserOverride) {
      const next: SidebarState = module === 'live' ? 'collapsed' : 'expanded'
      set({ sidebarState: next })
      save(KEYS.sidebar, next)
    }
  },

  setLiveItem: (item) => {
    set({ activeLiveItem: item })
    save(KEYS.liveItem, item)
  },

  toggleTopNav: () => {
    const next = !get().topNavVisible
    set({ topNavVisible: next })
    save(KEYS.topNav, String(next))
  },

  toggleTabBar: () => {
    const next = !get().tabBarVisible
    set({ tabBarVisible: next })
    save(KEYS.tabBar, String(next))
  },

  setSidebarState: (state, byUser = false) => {
    set({ sidebarState: state, ...(byUser ? { sidebarUserOverride: true } : {}) })
    save(KEYS.sidebar, state)
    if (byUser) save(KEYS.sidebarOverride, 'true')
  },

  loadFromStorage: () => {
    try {
      const module = (localStorage.getItem(KEYS.module) as ActiveModule | null) ?? 'dashboard'
      const liveItem = (localStorage.getItem(KEYS.liveItem) as ActiveLiveItem | null) ?? 'roster'
      const topNavVisible = localStorage.getItem(KEYS.topNav) !== 'false'
      const tabBarVisible = localStorage.getItem(KEYS.tabBar) !== 'false'
      const sidebarState = (localStorage.getItem(KEYS.sidebar) as SidebarState | null) ?? 'expanded'
      const sidebarUserOverride = localStorage.getItem(KEYS.sidebarOverride) === 'true'
      set({ activeModule: module, activeLiveItem: liveItem, topNavVisible, tabBarVisible, sidebarState, sidebarUserOverride })
    } catch { /* ignore */ }
  },
}))
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 3: Commit**

```bash
cd gantt
git add src/stores/shell-store.ts
git commit -m "feat(shell): ShellStore — 模块切换与布局可见性状态"
```

---

## Task 4: Frontend — GanttSubToolbar（从 header.tsx 提取）

**Files:**
- Create: `gantt/src/components/shell/gantt-sub-toolbar.tsx`

- [ ] **Step 1: 创建 shell/ 目录并新建 gantt-sub-toolbar.tsx**

```bash
mkdir -p gantt/src/components/shell
```

新建 `gantt/src/components/shell/gantt-sub-toolbar.tsx`：

内容等同于 `gantt/src/components/layout/header.tsx`，但做如下改动：
1. 移除 `import { ThemeSwitcher } ...` 这行
2. 移除 `import { LogOut } from 'lucide-react'`（从 import 列表移除 `LogOut`）
3. 移除 JSX 中 `<ThemeSwitcher />` 那行
4. 移除 JSX 中用户信息 `<span>` 和登出 `<button>` 两个元素
5. 导出名改为 `GanttSubToolbar`（原为 `Header`）

完整文件（保留所有 Gantt 工具栏功能）：

```typescript
import { useState, type ReactNode } from 'react'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import {
  PanelLeftClose, PanelLeftOpen, RefreshCw,
  Filter, Plane, Link2, Users, Keyboard,
} from 'lucide-react'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { ZoomControl } from '@/components/common/zoom-control'
import { RuleGroupSelector } from '@/components/common/rule-group-selector'
import { DraftToolbar } from '@/components/roster/draft-toolbar'
import { FilterDialog } from '@/components/layout/filter-dialog'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import type { PaneType } from '@/types'

const ToolbarDivider = () => (
  <div className="mx-1.5 h-4 w-px bg-border/60" />
)

const ToolBtn = ({
  tip, onClick, disabled, active, children,
}: {
  tip: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode
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

const PANE_CONFIG: { type: PaneType; label: string; shortLabel: string; icon: typeof Users }[] = [
  { type: 'roster-main', label: 'Roster Main', shortLabel: 'Main', icon: Users },
  { type: 'roster-sub',  label: 'Roster Sub',  shortLabel: 'Sub',  icon: Users },
  { type: 'pairing',     label: 'Pairing',     shortLabel: 'Pair', icon: Link2 },
  { type: 'flight',      label: 'Flight',      shortLabel: 'Flt',  icon: Plane },
]

export const GanttSubToolbar = () => {
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
        <header className="relative z-10 flex h-10 shrink-0 items-center border-b border-border/80 bg-card px-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

          <div className="flex items-center gap-1">
            <ToolBtn tip={sidebarCollapsed ? 'Show Crew Panel' : 'Hide Crew Panel'} onClick={toggleSidebar}>
              {sidebarCollapsed
                ? <PanelLeftOpen className="h-3.5 w-3.5" />
                : <PanelLeftClose className="h-3.5 w-3.5" />}
            </ToolBtn>
            <DateRangePicker />
          </div>

          <ToolbarDivider />

          <div className="flex items-center gap-0.5">
            <ToolBtn tip="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn tip="Filter" onClick={() => setFilterOpen(true)}>
              <Filter className="h-3.5 w-3.5" />
            </ToolBtn>
          </div>

          <ToolbarDivider />
          <DraftToolbar />
          <ToolbarDivider />
          <ZoomControl />
          <ToolbarDivider />
          <RuleGroupSelector />

          <div className="flex-1" />

          <div className="flex items-center rounded-md border border-border/50 bg-muted/40 p-[3px]">
            {PANE_CONFIG.map((cfg) => {
              const pane = panes.find((p) => p.type === cfg.type)
              const visible = pane?.visible ?? false
              const Icon = cfg.icon
              return (
                <Tooltip key={cfg.type}>
                  <TooltipTrigger asChild>
                    <button
                      className={[
                        'flex items-center gap-1 rounded-[3px] px-2 py-[3px] text-[11px] font-medium leading-none transition-all duration-150',
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

          <div className="flex items-center gap-1.5">
            {checking && (
              <span className="text-[11px] text-muted-foreground animate-pulse">Checking...</span>
            )}
            {selectedTaskIds.size > 0 && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
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
      <FilterDialog open={filterOpen} onClose={() => setFilterOpen(false)} />
    </>
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
git add src/components/shell/gantt-sub-toolbar.tsx
git commit -m "feat(shell): GanttSubToolbar — 从 Header 提取 Gantt 专用工具栏"
```

---

## Task 5: Frontend — AppLayout 修改

**Files:**
- Modify: `gantt/src/components/layout/app-layout.tsx`

- [ ] **Step 1: 移除 `<Header />` 并修改根 div 的高度类**

在 `gantt/src/components/layout/app-layout.tsx` 中：

1. 删除 import 行：
```typescript
import { Header } from './header'
```

2. 删除 JSX 中的 `<Header />` 那一行。

3. 将最外层 div 的 `h-screen` 改为 `h-full`：
```typescript
// 改前
<div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
// 改后
<div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd gantt && npx tsc --noEmit 2>&1 | head -20
```

期望：0 errors

- [ ] **Step 3: Commit**

```bash
cd gantt
git add src/components/layout/app-layout.tsx
git commit -m "refactor(shell): AppLayout 移除 Header，h-screen → h-full"
```

---

## Task 6: Frontend — ShellTopNav

**Files:**
- Create: `gantt/src/components/shell/shell-top-nav.tsx`

- [ ] **Step 1: 创建 shell-top-nav.tsx**

新建 `gantt/src/components/shell/shell-top-nav.tsx`：

```typescript
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import {
  LayoutDashboard, CalendarDays, ScrollText, Database, Settings2,
  PanelTopClose, PanelBottomClose, PanelBottomOpen, LogOut,
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/common/theme-switcher'
import { useShellStore } from '@/stores/shell-store'
import { useAuthStore } from '@/stores/auth-store'
import type { ActiveModule } from '@/stores/shell-store'

interface NavItem {
  module: ActiveModule
  label: string
  Icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { module: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { module: 'live',      label: 'Live',      Icon: CalendarDays },
  { module: 'rule',      label: 'Rule',      Icon: ScrollText },
  { module: 'data',      label: 'Data',      Icon: Database },
  { module: 'system',    label: 'System',    Icon: Settings2 },
]

const NavDivider = () => <div className="mx-1.5 h-4 w-px bg-border/60 shrink-0" />

export const ShellTopNav = () => {
  const activeModule = useShellStore((s) => s.activeModule)
  const setModule = useShellStore((s) => s.setModule)
  const tabBarVisible = useShellStore((s) => s.tabBarVisible)
  const toggleTopNav = useShellStore((s) => s.toggleTopNav)
  const toggleTabBar = useShellStore((s) => s.toggleTabBar)
  const user = useAuthStore((s) => s.user)

  return (
    <TooltipProvider delayDuration={250}>
      <header className="flex h-11 shrink-0 items-center border-b border-border bg-card px-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

        {/* Logo */}
        <div className="flex items-center gap-2 select-none cursor-default border-r border-border pr-3 mr-2 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary text-[11px] font-black text-primary-foreground">
            R
          </div>
          <span className="text-sm font-bold tracking-tight">
            <span className="text-primary">ROIS</span>
          </span>
        </div>

        {/* Module nav */}
        {NAV_ITEMS.map(({ module, label, Icon }) => (
          <button
            key={module}
            className={[
              'flex h-full items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium whitespace-nowrap transition-all duration-100',
              activeModule === module
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
            onClick={() => setModule(module)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-100"
                onClick={toggleTabBar}
              >
                {tabBarVisible
                  ? <PanelBottomClose className="h-3.5 w-3.5" />
                  : <PanelBottomOpen className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {tabBarVisible ? 'Hide Tab Bar' : 'Show Tab Bar'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-100"
                onClick={toggleTopNav}
                title="Hide Top Nav"
              >
                <PanelTopClose className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Hide Top Nav</TooltipContent>
          </Tooltip>

          <NavDivider />
          <ThemeSwitcher />
          <NavDivider />

          <span className="px-1 text-[11px] text-muted-foreground whitespace-nowrap">
            {user?.userCode ?? '—'} · {user?.schema?.toUpperCase() ?? ''}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
                onClick={() => useAuthStore.getState().logout()}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Sign Out</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
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
git add src/components/shell/shell-top-nav.tsx
git commit -m "feat(shell): ShellTopNav — 模块导航 + 布局控件 + 用户信息"
```

---
