# Scenario 模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 gantt 前端顶部导航 Live 右侧新增 Scenario 模块，提供 PO/RO/TO 场景的列表管理与详情编辑能力。

**Architecture:** 采用 Zustand 状态驱动（无 React Router），与现有 shell-store 集成；左侧 340px 场景列表面板 + 右侧自适应详情面板的主从双栏布局；所有 HTTP 调用复用已有的 `api` 实例（`/fpqe/live` base）。

**Tech Stack:** React 19, TypeScript, Zustand, @rois/ui (Button/Input/Select/Badge/Tooltip/DropdownMenu/Dialog), lucide-react, date-fns, axios

---

## 文件清单

### 修改
| 文件 | 变更 |
|------|------|
| `sql/seed/01-dictionary.sql` | 为 `SCENARIO_ST` 追加 DONE / FAILED 两个字典值 |
| `gantt/src/stores/shell-store.ts` | `ActiveModule` 加 `'scenario'`；新增 `ActiveScenarioItem` 类型与 store 字段 |
| `gantt/src/components/shell/shell-top-nav.tsx` | NAV_ITEMS 插入 scenario |
| `gantt/src/components/shell/shell-sidebar.tsx` | 添加 scenario 子菜单 |
| `gantt/src/components/shell/app-shell.tsx` | 添加 `scenario → ScenarioView` 映射 |
| `gantt/src/types/index.ts` | re-export scenario types |

### 新建
| 文件 | 职责 |
|------|------|
| `gantt/src/types/scenario.ts` | 所有 scenario TypeScript 类型 |
| `gantt/src/services/scenario-api.ts` | Scenario REST API 客户端 |
| `gantt/src/stores/scenario-store.ts` | Scenario 模块 Zustand store |
| `gantt/src/components/shell/scenario-view.tsx` | 顶层双栏布局容器 |
| `gantt/src/components/scenario/scenario-empty-state.tsx` | 未选中场景时的空状态 |
| `gantt/src/components/scenario/scenario-search-bar.tsx` | 搜索 + 筛选栏 |
| `gantt/src/components/scenario/scenario-list-item.tsx` | 单行场景卡片 |
| `gantt/src/components/scenario/scenario-list-panel.tsx` | 列表面板容器 |
| `gantt/src/components/scenario/scenario-basic-info.tsx` | 详情区块 1：基本信息 |
| `gantt/src/components/scenario/filter/tag-input.tsx` | 可复用 Tag 选择器 |
| `gantt/src/components/scenario/filter/collapsible-section.tsx` | 可折叠 Accordion 节 |
| `gantt/src/components/scenario/filter/po-flight-filter.tsx` | PO 航班过滤 |
| `gantt/src/components/scenario/filter/ro-crew-filter.tsx` | RO/TO 机组过滤 |
| `gantt/src/components/scenario/filter/ro-pairing-filter.tsx` | RO/TO 环过滤 |
| `gantt/src/components/scenario/filter/to-training-filter.tsx` | TO 培训课程过滤 |
| `gantt/src/components/scenario/scenario-filter-section.tsx` | 过滤区块容器，按类型渲染 |
| `gantt/src/components/scenario/scenario-kpi-section.tsx` | 详情区块 3：KPI 展示 |
| `gantt/src/components/scenario/scenario-action-bar.tsx` | 底部固定操作栏 |
| `gantt/src/components/scenario/scenario-detail-panel.tsx` | 详情面板容器 |

---

## Task 1: 字典种子对齐

**Files:**
- Modify: `sql/seed/01-dictionary.sql`

- [ ] **Step 1: 追加 DONE / FAILED 字典值**

在 `sql/seed/01-dictionary.sql` 找到 `-- 方案状态` 段落（约第 213 行），在 `ON CONFLICT` 语句**之前**追加两行：

```sql
-- 方案状态
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SCENARIO_ST', 'DRAFT',     'Draft / 草稿',            1, 'DRAFT'),
    ('SCENARIO_ST', 'RUNNING',   'Running / 运行中',        2, 'RUNNING'),
    ('SCENARIO_ST', 'DONE',      'Done / 已完成',           3, 'DONE'),
    ('SCENARIO_ST', 'FAILED',    'Failed / 失败',           4, 'FAILED'),
    ('SCENARIO_ST', 'COMPLETED', 'Completed / 已完成',      5, 'COMPLETED'),
    ('SCENARIO_ST', 'PUBLISHED', 'Published / 已发布',      6, 'PUBLISHED'),
    ('SCENARIO_ST', 'ARCHIVED',  'Archived / 已归档',       7, 'ARCHIVED')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;
```

> 保留原有值（COMPLETED / PUBLISHED / ARCHIVED），仅追加 DONE 和 FAILED；所有 idx 重新排序。将旧的 5 行整段替换为上面 7 行。

- [ ] **Step 2: Commit**

```bash
git add sql/seed/01-dictionary.sql
git commit -m "chore(seed): 为 SCENARIO_ST 追加 DONE / FAILED 字典值"
```

---

## Task 2: TypeScript 类型定义

**Files:**
- Create: `gantt/src/types/scenario.ts`
- Modify: `gantt/src/types/index.ts`

- [ ] **Step 1: 创建 `gantt/src/types/scenario.ts`**

```typescript
// gantt/src/types/scenario.ts

export type ScenarioStatus = 'DRAFT' | 'RUNNING' | 'DONE' | 'FAILED'
export type ScenarioType = 'PO' | 'RO' | 'TO'
export type FlightStatusFilter = 'SCHEDULED' | 'ACTUAL' | 'ALL'
export type CrewDivisionFilter = 'P' | 'C' | 'ALL'
export type CrewStatusFilter = 'ACTIVE' | 'ALL'
export type PairingSourceFilter = 'MANUAL' | 'OPT' | 'IMPORT'
export type TrainingExpiryFilter = 'EXPIRING_90D' | 'ALL'

export interface PoFilterParams {
  flightNos: string[]
  depAirports: string[]
  arrAirports: string[]
  fleets: string[]
  flightStatus: FlightStatusFilter
}

export interface RoFilterParams {
  crew: {
    division: CrewDivisionFilter
    bases: string[]
    fleets: string[]
    status: CrewStatusFilter
  }
  pairing: {
    bases: string[]
    fleets: string[]
    sources: PairingSourceFilter[]
  }
}

export interface ToFilterParams extends RoFilterParams {
  training: {
    courseTypes: string[]
    expiryFilter: TrainingExpiryFilter
    priorities: string[]
  }
}

export type FilterParams = PoFilterParams | RoFilterParams | ToFilterParams

/** Lightweight row used in the scenario list */
export interface ScenarioItem {
  id: number
  name: string
  fileType: ScenarioType
  status: ScenarioStatus
  strDtLoc: string   // 'YYYY-MM-DD'
  endDtLoc: string   // 'YYYY-MM-DD'
  optimizedCount: number
  leadinLive: number   // 0 | 1
  updatedBy: string | null
  updatedAt: string    // ISO datetime
}

/** Full detail returned by GET /api/scenario/:id */
export interface ScenarioDetail extends ScenarioItem {
  worksetId: number | null
  version: number | null
  rulesetId: number | null
  filterParams: FilterParams | null
  comments: string | null
  createdBy: string | null
  createdAt: string
}

export interface ScenarioKpi {
  id: number
  scenarioId: number
  kpiNames: string
  kpiValues: string
  description: string | null
  idx: number | null
  type: 'UTILIZATION' | 'COST' | 'FAIRNESS' | null
}

export interface ScenarioListQuery {
  page: number
  pageSize: number
  name?: string
  fileType?: ScenarioType | ''
  status?: ScenarioStatus | ''
}

export interface ScenarioListResponse {
  items: ScenarioItem[]
  total: number
  page: number
  pageSize: number
}

export interface CreateScenarioInput {
  name: string
  fileType: ScenarioType
  strDtLoc: string
  endDtLoc: string
  leadinLive: number
  rulesetId?: number | null
  filterParams?: FilterParams | null
  comments?: string | null
}

export type UpdateScenarioInput = Partial<CreateScenarioInput>
```

- [ ] **Step 2: 在 `gantt/src/types/index.ts` 追加 re-export**

在文件末尾追加一行：

```typescript
export type { ScenarioStatus, ScenarioType, FlightStatusFilter, CrewDivisionFilter, CrewStatusFilter, PairingSourceFilter, TrainingExpiryFilter, PoFilterParams, RoFilterParams, ToFilterParams, FilterParams, ScenarioItem, ScenarioDetail, ScenarioKpi, ScenarioListQuery, ScenarioListResponse, CreateScenarioInput, UpdateScenarioInput } from './scenario'
```

- [ ] **Step 3: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add gantt/src/types/scenario.ts gantt/src/types/index.ts
git commit -m "feat(scenario): 添加 Scenario 模块 TypeScript 类型定义"
```

---

## Task 3: Scenario API 服务

**Files:**
- Create: `gantt/src/services/scenario-api.ts`

- [ ] **Step 1: 创建 `gantt/src/services/scenario-api.ts`**

```typescript
// gantt/src/services/scenario-api.ts
import { api } from './api'
import type {
  ScenarioItem,
  ScenarioDetail,
  ScenarioKpi,
  ScenarioListQuery,
  ScenarioListResponse,
  CreateScenarioInput,
  UpdateScenarioInput,
  ScenarioStatus,
} from '@/types'

export const scenarioApi = {
  async list(query: ScenarioListQuery): Promise<ScenarioListResponse> {
    const params: Record<string, unknown> = {
      page: query.page,
      pageSize: query.pageSize,
    }
    if (query.name) params.name = query.name
    if (query.fileType) params.fileType = query.fileType
    if (query.status) params.status = query.status
    return api.get('/api/scenario', { params }) as Promise<ScenarioListResponse>
  },

  async getById(id: number): Promise<ScenarioDetail> {
    return api.get(`/api/scenario/${id}`) as Promise<ScenarioDetail>
  },

  async create(data: CreateScenarioInput): Promise<ScenarioDetail> {
    return api.post('/api/scenario', data) as Promise<ScenarioDetail>
  },

  async update(id: number, data: UpdateScenarioInput): Promise<ScenarioDetail> {
    return api.put(`/api/scenario/${id}`, data) as Promise<ScenarioDetail>
  },

  async remove(id: number): Promise<void> {
    return api.delete(`/api/scenario/${id}`) as Promise<void>
  },

  async transition(id: number, status: ScenarioStatus): Promise<ScenarioDetail> {
    return api.post(`/api/scenario/${id}/transition`, { status }) as Promise<ScenarioDetail>
  },

  async getKpis(id: number): Promise<ScenarioKpi[]> {
    return api.get(`/api/scenario/${id}/kpi`) as Promise<ScenarioKpi[]>
  },
}
```

- [ ] **Step 2: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/scenario-api.ts
git commit -m "feat(scenario): 添加 Scenario API 服务"
```

---

## Task 4: Scenario Store

**Files:**
- Create: `gantt/src/stores/scenario-store.ts`

- [ ] **Step 1: 创建 `gantt/src/stores/scenario-store.ts`**

```typescript
// gantt/src/stores/scenario-store.ts
import { create } from 'zustand'
import { scenarioApi } from '@/services/scenario-api'
import type {
  ScenarioItem,
  ScenarioDetail,
  ScenarioKpi,
  ScenarioListQuery,
  ScenarioStatus,
  ScenarioType,
  CreateScenarioInput,
  UpdateScenarioInput,
} from '@/types'

interface ScenarioStore {
  // List state
  items: ScenarioItem[]
  total: number
  page: number
  pageSize: number
  searchName: string
  filterType: ScenarioType | ''
  filterStatus: ScenarioStatus | ''
  listLoading: boolean

  // Detail state
  selectedId: number | null
  detail: ScenarioDetail | null
  kpis: ScenarioKpi[]
  draftDetail: Partial<ScenarioDetail> | null  // pending edits
  isDirty: boolean
  detailLoading: boolean
  saving: boolean

  // Actions — list
  setSearch: (name: string) => void
  setFilterType: (type: ScenarioType | '') => void
  setFilterStatus: (status: ScenarioStatus | '') => void
  setPage: (page: number) => void
  fetchList: () => Promise<void>

  // Actions — detail
  selectScenario: (id: number) => Promise<void>
  clearSelection: () => void
  patchDraft: (patch: Partial<ScenarioDetail>) => void
  saveDetail: () => Promise<void>
  createNew: (data: CreateScenarioInput) => Promise<void>
  removeScenario: (id: number) => Promise<void>
  transitionStatus: (id: number, status: ScenarioStatus) => Promise<void>
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  searchName: '',
  filterType: '',
  filterStatus: '',
  listLoading: false,

  selectedId: null,
  detail: null,
  kpis: [],
  draftDetail: null,
  isDirty: false,
  detailLoading: false,
  saving: false,

  setSearch: (name) => {
    set({ searchName: name, page: 1 })
    get().fetchList()
  },

  setFilterType: (type) => {
    set({ filterType: type, page: 1 })
    get().fetchList()
  },

  setFilterStatus: (status) => {
    set({ filterStatus: status, page: 1 })
    get().fetchList()
  },

  setPage: (page) => {
    set({ page })
    get().fetchList()
  },

  fetchList: async () => {
    const { page, pageSize, searchName, filterType, filterStatus } = get()
    set({ listLoading: true })
    try {
      const query: ScenarioListQuery = { page, pageSize }
      if (searchName) query.name = searchName
      if (filterType) query.fileType = filterType
      if (filterStatus) query.status = filterStatus
      const res = await scenarioApi.list(query)
      set({ items: res.items, total: res.total, listLoading: false })
    } catch {
      set({ listLoading: false })
    }
  },

  selectScenario: async (id) => {
    if (get().selectedId === id) return
    set({ selectedId: id, detailLoading: true, detail: null, kpis: [], draftDetail: null, isDirty: false })
    try {
      const [detail, kpis] = await Promise.all([
        scenarioApi.getById(id),
        scenarioApi.getKpis(id),
      ])
      set({ detail, draftDetail: { ...detail }, kpis, detailLoading: false })
    } catch {
      set({ detailLoading: false })
    }
  },

  clearSelection: () => {
    set({ selectedId: null, detail: null, kpis: [], draftDetail: null, isDirty: false })
  },

  patchDraft: (patch) => {
    const draft = get().draftDetail
    if (!draft) return
    set({ draftDetail: { ...draft, ...patch }, isDirty: true })
  },

  saveDetail: async () => {
    const { selectedId, draftDetail, detail } = get()
    if (!selectedId || !draftDetail || !detail) return
    set({ saving: true })
    try {
      const updateData: UpdateScenarioInput = {
        name: draftDetail.name,
        strDtLoc: draftDetail.strDtLoc,
        endDtLoc: draftDetail.endDtLoc,
        leadinLive: draftDetail.leadinLive,
        rulesetId: draftDetail.rulesetId,
        filterParams: draftDetail.filterParams ?? null,
        comments: draftDetail.comments ?? null,
      }
      const updated = await scenarioApi.update(selectedId, updateData)
      set({ detail: updated, draftDetail: { ...updated }, isDirty: false, saving: false })
      // Refresh list to reflect name/status changes
      get().fetchList()
    } catch {
      set({ saving: false })
    }
  },

  createNew: async (data) => {
    const created = await scenarioApi.create(data)
    await get().fetchList()
    await get().selectScenario(created.id)
  },

  removeScenario: async (id) => {
    await scenarioApi.remove(id)
    if (get().selectedId === id) get().clearSelection()
    await get().fetchList()
  },

  transitionStatus: async (id, status) => {
    set({ saving: true })
    try {
      const updated = await scenarioApi.transition(id, status)
      if (get().selectedId === id) {
        set({ detail: updated, draftDetail: { ...updated }, saving: false })
      } else {
        set({ saving: false })
      }
      get().fetchList()
    } catch {
      set({ saving: false })
    }
  },
}))
```

- [ ] **Step 2: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/scenario-store.ts
git commit -m "feat(scenario): 添加 Scenario Zustand store"
```

---

## Task 5: Shell 集成（导航 + 路由）

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`
- Modify: `gantt/src/components/shell/shell-top-nav.tsx`
- Modify: `gantt/src/components/shell/shell-sidebar.tsx`
- Modify: `gantt/src/components/shell/app-shell.tsx`

- [ ] **Step 1: 修改 `shell-store.ts` — 扩展类型与状态**

将文件顶部类型定义从：
```typescript
export type ActiveModule = 'dashboard' | 'live' | 'rule' | 'data' | 'system'
export type ActiveLiveItem = 'roster' | 'pairing' | 'flight'
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'
```
改为：
```typescript
export type ActiveModule = 'dashboard' | 'live' | 'scenario' | 'rule' | 'data' | 'system'
export type ActiveLiveItem = 'roster' | 'pairing' | 'flight'
export type ActiveScenarioItem = 'all' | 'po' | 'ro-to'
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'
```

在 `interface ShellStore` 中，在 `activeLiveItem` 行之后插入：
```typescript
  activeScenarioItem: ActiveScenarioItem
```

在 `setLiveItem` 行之后插入：
```typescript
  setScenarioItem: (item: ActiveScenarioItem) => void
```

在常量 `KEYS` 对象内追加：
```typescript
  scenarioItem: 'rois-shell-scenario-item',
```

在 `create<ShellStore>` 初始状态中，在 `activeLiveItem: 'roster'` 之后插入：
```typescript
  activeScenarioItem: 'all',
```

在 `setLiveItem` 方法之后插入：
```typescript
  setScenarioItem: (item) => {
    set({ activeScenarioItem: item })
    save(KEYS.scenarioItem, item)
  },
```

在 `loadFromStorage` 方法的 `try` 块内，在 `const liveItem = ...` 行之后插入：
```typescript
      const scenarioItem = (localStorage.getItem(KEYS.scenarioItem) as ActiveScenarioItem | null) ?? 'all'
```

在 `set({ activeModule: module, activeLiveItem: liveItem, ...` 调用中，追加 `activeScenarioItem: scenarioItem`：
```typescript
      set({ activeModule: module, activeLiveItem: liveItem, activeScenarioItem: scenarioItem, openTabs, topNavVisible, tabBarVisible, sidebarState, sidebarUserOverride })
```

- [ ] **Step 2: 修改 `shell-top-nav.tsx` — 插入 Scenario 菜单项**

在导入行中添加 `FlaskConical`：
```typescript
import {
  LayoutDashboard, CalendarDays, FlaskConical, ScrollText, Database, Settings2,
  PanelTopClose, PanelBottomClose, PanelBottomOpen, LogOut,
} from 'lucide-react'
```

将 `NAV_ITEMS` 数组改为：
```typescript
const NAV_ITEMS: NavItem[] = [
  { module: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { module: 'live',      label: 'Live',      Icon: CalendarDays },
  { module: 'scenario',  label: 'Scenario',  Icon: FlaskConical },
  { module: 'rule',      label: 'Rule',      Icon: ScrollText },
  { module: 'data',      label: 'Data',      Icon: Database },
  { module: 'system',    label: 'System',    Icon: Settings2 },
]
```

- [ ] **Step 3: 修改 `shell-sidebar.tsx` — 添加 scenario 子菜单**

在文件顶部导入区加入：
```typescript
import { Layers, FlaskConical, Users } from 'lucide-react'
```
（追加到现有 lucide 导入语句中）

在 `MODULE_LABELS` 对象中追加：
```typescript
  scenario:  'Scenario',
```

在文件中 `ActiveLiveItem` 导入行之后追加：
```typescript
import type { ActiveLiveItem, ActiveScenarioItem } from '@/stores/shell-store'
```
（合并到同一 import 语句）

在组件函数体内，在 `setLiveItem` 行之后添加：
```typescript
  const activeScenarioItem = useShellStore((s) => s.activeScenarioItem)
  const setScenarioItem    = useShellStore((s) => s.setScenarioItem)
```

在文件中 `LiveMenuItem` 接口定义之后，添加：
```typescript
interface ScenarioMenuItem {
  item: ActiveScenarioItem
  label: string
  Icon: React.ElementType
}

const SCENARIO_MENU: ScenarioMenuItem[] = [
  { item: 'all',   label: 'All Scenarios', Icon: Layers },
  { item: 'po',    label: 'PO',            Icon: FlaskConical },
  { item: 'ro-to', label: 'RO / TO',       Icon: Users },
]
```

在 `{/* Body — module-specific nav items */}` 的 `<div>` 内，在 `{activeModule === 'live' && ...}` 块之后添加：
```typescript
        {activeModule === 'scenario' && (
          <>
            {!isCollapsed && (
              <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
                Optimization
              </div>
            )}
            <TooltipProvider delayDuration={300}>
              {SCENARIO_MENU.map(({ item, label: itemLabel, Icon }) => {
                const isActive = activeScenarioItem === item
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        className={[
                          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-l-2 px-3 py-1.5 text-[12px] transition-colors duration-100',
                          isActive
                            ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground cursor-default'
                            : 'cursor-pointer border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        ].join(' ')}
                        onClick={() => setScenarioItem(item)}
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
```

- [ ] **Step 4: 修改 `app-shell.tsx` — 添加 ScenarioView 路由映射**

在顶部 import 区追加（先用占位，Task 10 会创建该文件）：
```typescript
import { ScenarioView } from './scenario-view'
```

在 `ModuleView` 函数中，在 `if (module === 'live') return <RosterView />` 之后添加：
```typescript
  if (module === 'scenario') return <ScenarioView />
```

> **注意：** `ScenarioView` 文件将在 Task 10 创建。如果在那之前运行 `tsc`，会有找不到模块的报错，这是正常的中间状态。可以暂时跳过此步骤，在 Task 10 完成后再补充。

- [ ] **Step 5: 类型检查（仅检查 store 和 nav）**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v scenario-view
```

Expected: 0 errors（scenario-view 的 module not found 错误忽略）

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/shell-store.ts gantt/src/components/shell/shell-top-nav.tsx gantt/src/components/shell/shell-sidebar.tsx gantt/src/components/shell/app-shell.tsx
git commit -m "feat(scenario): Shell 集成 — 导航菜单 + Sidebar 子菜单 + 路由映射"
```

---

## Task 6: 空状态组件

**Files:**
- Create: `gantt/src/components/scenario/scenario-empty-state.tsx`

- [ ] **Step 1: 创建目录并新建文件**

```bash
mkdir -p /home/yuan.z/rois/rois-ai/gantt/src/components/scenario/filter
```

创建 `gantt/src/components/scenario/scenario-empty-state.tsx`：

```typescript
// gantt/src/components/scenario/scenario-empty-state.tsx
import { FlaskConical } from 'lucide-react'
import { Button } from '@rois/ui'

interface ScenarioEmptyStateProps {
  onCreateNew: () => void
}

export const ScenarioEmptyState = ({ onCreateNew }: ScenarioEmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
      <FlaskConical className="h-7 w-7 text-muted-foreground" />
    </div>
    <div>
      <p className="text-sm font-medium text-foreground">没有选中场景</p>
      <p className="mt-1 text-xs text-muted-foreground">
        从左侧选择一个场景查看详情，或创建新场景
      </p>
    </div>
    <Button size="sm" onClick={onCreateNew}>
      + 新建场景
    </Button>
  </div>
)
```

- [ ] **Step 2: Commit**

```bash
git add gantt/src/components/scenario/scenario-empty-state.tsx
git commit -m "feat(scenario): 添加空状态组件"
```

---

## Task 7: 场景列表面板

**Files:**
- Create: `gantt/src/components/scenario/scenario-search-bar.tsx`
- Create: `gantt/src/components/scenario/scenario-list-item.tsx`
- Create: `gantt/src/components/scenario/scenario-list-panel.tsx`

- [ ] **Step 1: 创建 `scenario-search-bar.tsx`**

```typescript
// gantt/src/components/scenario/scenario-search-bar.tsx
import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { Input, Button, Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import { useScenarioStore } from '@/stores/scenario-store'
import type { ScenarioType, ScenarioStatus } from '@/types'

const TYPE_OPTIONS: { value: ScenarioType | ''; label: string }[] = [
  { value: '', label: '全部类型' },
  { value: 'PO', label: 'PO' },
  { value: 'RO', label: 'RO' },
  { value: 'TO', label: 'TO' },
]

const STATUS_OPTIONS: { value: ScenarioStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'RUNNING', label: '运行中' },
  { value: 'DONE', label: '已完成' },
  { value: 'FAILED', label: '失败' },
]

interface ScenarioSearchBarProps {
  onCreateNew: () => void
}

export const ScenarioSearchBar = ({ onCreateNew }: ScenarioSearchBarProps) => {
  const searchName   = useScenarioStore((s) => s.searchName)
  const filterType   = useScenarioStore((s) => s.filterType)
  const filterStatus = useScenarioStore((s) => s.filterStatus)
  const setSearch       = useScenarioStore((s) => s.setSearch)
  const setFilterType   = useScenarioStore((s) => s.setFilterType)
  const setFilterStatus = useScenarioStore((s) => s.setFilterStatus)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNameChange = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setSearch(value), 300)
  }

  // cleanup
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          className="h-7 pl-7 text-xs"
          placeholder="搜索场景名称..."
          defaultValue={searchName}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>

      <Select value={filterType} onValueChange={(v) => setFilterType(v as ScenarioType | '')}>
        <SelectTrigger className="h-7 w-[80px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ScenarioStatus | '')}>
        <SelectTrigger className="h-7 w-[80px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button size="sm" className="h-7 shrink-0 text-xs px-2" onClick={onCreateNew}>
        + 新建
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `scenario-list-item.tsx`**

```typescript
// gantt/src/components/scenario/scenario-list-item.tsx
import { MoreHorizontal, Trash2, Copy } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@rois/ui'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { ScenarioItem, ScenarioType, ScenarioStatus } from '@/types'

// ── Type badge ──────────────────────────────────────────────────────────────
const TYPE_BADGE: Record<ScenarioType, string> = {
  PO: 'bg-blue-500/15 text-blue-400',
  RO: 'bg-emerald-500/15 text-emerald-400',
  TO: 'bg-violet-500/15 text-violet-400',
}

// ── Status dot ──────────────────────────────────────────────────────────────
const StatusDot = ({ status }: { status: ScenarioStatus }) => {
  const base = 'h-2 w-2 rounded-full shrink-0'
  if (status === 'RUNNING') return <span className={`${base} bg-blue-400 animate-pulse`} />
  if (status === 'DONE')    return <span className={`${base} bg-emerald-400`} />
  if (status === 'FAILED')  return <span className={`${base} bg-destructive`} />
  return <span className={`${base} bg-muted-foreground/40`} />
}

// ── Main component ───────────────────────────────────────────────────────────
interface ScenarioListItemProps {
  item: ScenarioItem
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

export const ScenarioListItem = ({ item, isSelected, onSelect, onDelete }: ScenarioListItemProps) => {
  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: zhCN })
    } catch {
      return ''
    }
  })()

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'group relative flex flex-col gap-0.5 border-l-2 px-3 py-2 text-xs cursor-pointer transition-colors duration-100',
        isSelected
          ? 'border-primary bg-accent'
          : 'border-transparent hover:bg-accent/50',
      ].join(' ')}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      {/* Row 1: name + type badge + status dot */}
      <div className="flex items-center gap-1.5">
        <span className="flex-1 truncate font-medium text-foreground">{item.name}</span>
        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[item.fileType]}`}>
          {item.fileType}
        </span>
        <StatusDot status={item.status} />
      </div>

      {/* Row 2: date range · optimized count */}
      <div className="text-muted-foreground">
        {item.strDtLoc} ~ {item.endDtLoc}
        {item.optimizedCount > 0 && ` · 优化 ${item.optimizedCount} 次`}
      </div>

      {/* Row 3 (hover): source · updated by · relative time */}
      <div className="h-0 overflow-hidden text-muted-foreground/70 transition-all duration-150 group-hover:h-4">
        {item.leadinLive === 1 && '引用 Live · '}
        {item.updatedBy && `${item.updatedBy} · `}
        {relativeTime}
      </div>

      {/* Three-dot menu */}
      <div
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem className="gap-2 text-xs">
              <Copy className="h-3.5 w-3.5" /> 复制场景
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-xs text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除场景
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 `scenario-list-panel.tsx`**

```typescript
// gantt/src/components/scenario/scenario-list-panel.tsx
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@rois/ui'
import { useScenarioStore } from '@/stores/scenario-store'
import { ScenarioSearchBar } from './scenario-search-bar'
import { ScenarioListItem } from './scenario-list-item'

interface ScenarioListPanelProps {
  onCreateNew: () => void
}

export const ScenarioListPanel = ({ onCreateNew }: ScenarioListPanelProps) => {
  const items       = useScenarioStore((s) => s.items)
  const total       = useScenarioStore((s) => s.total)
  const page        = useScenarioStore((s) => s.page)
  const pageSize    = useScenarioStore((s) => s.pageSize)
  const selectedId  = useScenarioStore((s) => s.selectedId)
  const listLoading = useScenarioStore((s) => s.listLoading)
  const fetchList      = useScenarioStore((s) => s.fetchList)
  const selectScenario = useScenarioStore((s) => s.selectScenario)
  const removeScenario = useScenarioStore((s) => s.removeScenario)
  const setPage        = useScenarioStore((s) => s.setPage)

  useEffect(() => { fetchList() }, [fetchList])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-border">
      <ScenarioSearchBar onCreateNew={onCreateNew} />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {listLoading && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            加载中...
          </div>
        )}
        {!listLoading && items.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            暂无场景
          </div>
        )}
        {!listLoading && items.map((item) => (
          <ScenarioListItem
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            onSelect={() => selectScenario(item.id)}
            onDelete={() => removeScenario(item.id)}
          />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>共 {total} 个场景</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>{page} / {totalPages}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v scenario-view
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/scenario/scenario-search-bar.tsx gantt/src/components/scenario/scenario-list-item.tsx gantt/src/components/scenario/scenario-list-panel.tsx
git commit -m "feat(scenario): 场景列表面板 — 搜索栏、列表行、分页"
```

---

## Task 8: 过滤条件组件

**Files:**
- Create: `gantt/src/components/scenario/filter/tag-input.tsx`
- Create: `gantt/src/components/scenario/filter/collapsible-section.tsx`
- Create: `gantt/src/components/scenario/filter/po-flight-filter.tsx`
- Create: `gantt/src/components/scenario/filter/ro-crew-filter.tsx`
- Create: `gantt/src/components/scenario/filter/ro-pairing-filter.tsx`
- Create: `gantt/src/components/scenario/filter/to-training-filter.tsx`
- Create: `gantt/src/components/scenario/scenario-filter-section.tsx`

- [ ] **Step 1: 创建 `filter/tag-input.tsx`**

```typescript
// gantt/src/components/scenario/filter/tag-input.tsx
import { useState, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import { Input } from '@rois/ui'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export const TagInput = ({ tags, onChange, placeholder = '添加...', disabled = false }: TagInputProps) => {
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInputValue('')
    setInputVisible(false)
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => removeTag(tag)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        inputVisible ? (
          <Input
            ref={inputRef}
            className="h-5 w-24 px-1 text-[11px]"
            value={inputValue}
            autoFocus
            placeholder={placeholder}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(inputValue) }
              if (e.key === 'Escape') { setInputVisible(false); setInputValue('') }
            }}
            onBlur={() => { addTag(inputValue) }}
          />
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            onClick={() => setInputVisible(true)}
          >
            <Plus className="h-2.5 w-2.5" /> 添加
          </button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `filter/collapsible-section.tsx`**

```typescript
// gantt/src/components/scenario/filter/collapsible-section.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  badgeCount?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

export const CollapsibleSection = ({
  title,
  badgeCount,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="flex-1 text-left">{title}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {badgeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `filter/po-flight-filter.tsx`**

```typescript
// gantt/src/components/scenario/filter/po-flight-filter.tsx
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import type { PoFilterParams, FlightStatusFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface PoFlightFilterProps {
  params: PoFilterParams
  onChange: (params: PoFilterParams) => void
  disabled?: boolean
}

const FLIGHT_STATUS_OPTIONS: { value: FlightStatusFilter; label: string }[] = [
  { value: 'SCHEDULED', label: '计划' },
  { value: 'ACTUAL',    label: '实际' },
  { value: 'ALL',       label: '全部' },
]

export const PoFlightFilter = ({ params, onChange, disabled = false }: PoFlightFilterProps) => {
  const patch = (partial: Partial<PoFilterParams>) => onChange({ ...params, ...partial })

  const totalTags =
    params.flightNos.length +
    params.depAirports.length +
    params.arrAirports.length +
    params.fleets.length

  return (
    <CollapsibleSection title="航班过滤" badgeCount={totalTags}>
      <div className="flex flex-col gap-3 text-xs">
        {/* Flight Nos */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">航班号</label>
          <TagInput
            tags={params.flightNos}
            onChange={(flightNos) => patch({ flightNos })}
            placeholder="如 CA101 或 CA1*"
            disabled={disabled}
          />
        </div>

        {/* Dep airports */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">出发机场</label>
          <TagInput
            tags={params.depAirports}
            onChange={(depAirports) => patch({ depAirports })}
            placeholder="如 PEK"
            disabled={disabled}
          />
        </div>

        {/* Arr airports */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">到达机场</label>
          <TagInput
            tags={params.arrAirports}
            onChange={(arrAirports) => patch({ arrAirports })}
            placeholder="如 SHA"
            disabled={disabled}
          />
        </div>

        {/* Fleets */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">机队型号</label>
          <TagInput
            tags={params.fleets}
            onChange={(fleets) => patch({ fleets })}
            placeholder="如 B737"
            disabled={disabled}
          />
        </div>

        {/* Flight status */}
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-muted-foreground">航班状态</label>
          <Select
            value={params.flightStatus}
            onValueChange={(v) => patch({ flightStatus: v as FlightStatusFilter })}
            disabled={disabled}
          >
            <SelectTrigger className="h-6 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLIGHT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

- [ ] **Step 4: 创建 `filter/ro-crew-filter.tsx`**

```typescript
// gantt/src/components/scenario/filter/ro-crew-filter.tsx
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import type { RoFilterParams, CrewDivisionFilter, CrewStatusFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface RoCrewFilterProps {
  crew: RoFilterParams['crew']
  onChange: (crew: RoFilterParams['crew']) => void
  disabled?: boolean
}

export const RoCrewFilter = ({ crew, onChange, disabled = false }: RoCrewFilterProps) => {
  const patch = (partial: Partial<RoFilterParams['crew']>) => onChange({ ...crew, ...partial })

  const badgeCount = crew.bases.length + crew.fleets.length

  return (
    <CollapsibleSection title="机组过滤" badgeCount={badgeCount}>
      <div className="flex flex-col gap-3 text-xs">
        {/* Division */}
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-muted-foreground">机组类型</label>
          <Select
            value={crew.division}
            onValueChange={(v) => patch({ division: v as CrewDivisionFilter })}
            disabled={disabled}
          >
            <SelectTrigger className="h-6 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="P" className="text-xs">飞行员</SelectItem>
              <SelectItem value="C" className="text-xs">客舱</SelectItem>
              <SelectItem value="ALL" className="text-xs">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bases */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">基地</label>
          <TagInput
            tags={crew.bases}
            onChange={(bases) => patch({ bases })}
            placeholder="如 PEK"
            disabled={disabled}
          />
        </div>

        {/* Fleets */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">机队资质</label>
          <TagInput
            tags={crew.fleets}
            onChange={(fleets) => patch({ fleets })}
            placeholder="如 B737"
            disabled={disabled}
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-muted-foreground">在职状态</label>
          <Select
            value={crew.status}
            onValueChange={(v) => patch({ status: v as CrewStatusFilter })}
            disabled={disabled}
          >
            <SelectTrigger className="h-6 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE" className="text-xs">在职</SelectItem>
              <SelectItem value="ALL" className="text-xs">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

- [ ] **Step 5: 创建 `filter/ro-pairing-filter.tsx`**

```typescript
// gantt/src/components/scenario/filter/ro-pairing-filter.tsx
import type { RoFilterParams, PairingSourceFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface RoPairingFilterProps {
  pairing: RoFilterParams['pairing']
  onChange: (pairing: RoFilterParams['pairing']) => void
  disabled?: boolean
}

const SOURCE_OPTIONS: { value: PairingSourceFilter; label: string }[] = [
  { value: 'MANUAL', label: '手动' },
  { value: 'OPT',    label: '优化' },
  { value: 'IMPORT', label: '导入' },
]

export const RoPairingFilter = ({ pairing, onChange, disabled = false }: RoPairingFilterProps) => {
  const patch = (partial: Partial<RoFilterParams['pairing']>) => onChange({ ...pairing, ...partial })

  const badgeCount = pairing.bases.length + pairing.fleets.length

  const toggleSource = (source: PairingSourceFilter) => {
    const current = pairing.sources
    const next = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source]
    patch({ sources: next })
  }

  return (
    <CollapsibleSection title="环（Pairing）过滤" badgeCount={badgeCount}>
      <div className="flex flex-col gap-3 text-xs">
        {/* Bases */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">基地</label>
          <TagInput
            tags={pairing.bases}
            onChange={(bases) => patch({ bases })}
            placeholder="如 PEK"
            disabled={disabled}
          />
        </div>

        {/* Fleets */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">机队</label>
          <TagInput
            tags={pairing.fleets}
            onChange={(fleets) => patch({ fleets })}
            placeholder="如 B737"
            disabled={disabled}
          />
        </div>

        {/* Sources — multi-checkbox */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">环来源</label>
          <div className="flex gap-2">
            {SOURCE_OPTIONS.map(({ value, label }) => {
              const checked = pairing.sources.includes(value)
              return (
                <label
                  key={value}
                  className={[
                    'flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] border select-none transition-colors',
                    checked
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground',
                    disabled ? 'pointer-events-none opacity-50' : '',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleSource(value)}
                    disabled={disabled}
                  />
                  {label}
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

- [ ] **Step 6: 创建 `filter/to-training-filter.tsx`**

```typescript
// gantt/src/components/scenario/filter/to-training-filter.tsx
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import type { ToFilterParams, TrainingExpiryFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface ToTrainingFilterProps {
  training: ToFilterParams['training']
  onChange: (training: ToFilterParams['training']) => void
  disabled?: boolean
}

export const ToTrainingFilter = ({ training, onChange, disabled = false }: ToTrainingFilterProps) => {
  const patch = (partial: Partial<ToFilterParams['training']>) => onChange({ ...training, ...partial })
  const badgeCount = training.courseTypes.length + training.priorities.length

  return (
    <CollapsibleSection title="培训课程" badgeCount={badgeCount}>
      <div className="flex flex-col gap-3 text-xs">
        {/* Course types */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">课程类型</label>
          <TagInput
            tags={training.courseTypes}
            onChange={(courseTypes) => patch({ courseTypes })}
            placeholder="如 年度复训"
            disabled={disabled}
          />
        </div>

        {/* Expiry filter */}
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-muted-foreground">有效期</label>
          <Select
            value={training.expiryFilter}
            onValueChange={(v) => patch({ expiryFilter: v as TrainingExpiryFilter })}
            disabled={disabled}
          >
            <SelectTrigger className="h-6 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXPIRING_90D" className="text-xs">即将到期（90天内）</SelectItem>
              <SelectItem value="ALL" className="text-xs">全部</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priorities */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">优先级</label>
          <TagInput
            tags={training.priorities}
            onChange={(priorities) => patch({ priorities })}
            placeholder="如 紧急"
            disabled={disabled}
          />
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

- [ ] **Step 7: 创建 `scenario-filter-section.tsx`**

```typescript
// gantt/src/components/scenario/scenario-filter-section.tsx
import type { ScenarioDetail, PoFilterParams, RoFilterParams, ToFilterParams } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'
import { PoFlightFilter } from './filter/po-flight-filter'
import { RoCrewFilter } from './filter/ro-crew-filter'
import { RoPairingFilter } from './filter/ro-pairing-filter'
import { ToTrainingFilter } from './filter/to-training-filter'

const DEFAULT_PO_FILTER: PoFilterParams = {
  flightNos: [],
  depAirports: [],
  arrAirports: [],
  fleets: [],
  flightStatus: 'ALL',
}

const DEFAULT_RO_FILTER: RoFilterParams = {
  crew: { division: 'ALL', bases: [], fleets: [], status: 'ACTIVE' },
  pairing: { bases: [], fleets: [], sources: ['MANUAL', 'OPT', 'IMPORT'] },
}

const DEFAULT_TO_FILTER: ToFilterParams = {
  ...DEFAULT_RO_FILTER,
  training: { courseTypes: [], expiryFilter: 'ALL', priorities: [] },
}

interface ScenarioFilterSectionProps {
  detail: ScenarioDetail
  disabled?: boolean
}

export const ScenarioFilterSection = ({ detail, disabled = false }: ScenarioFilterSectionProps) => {
  const patchDraft = useScenarioStore((s) => s.patchDraft)

  const handlePoChange = (params: PoFilterParams) => {
    patchDraft({ filterParams: params })
  }

  const handleRoChange = (params: RoFilterParams) => {
    patchDraft({ filterParams: params })
  }

  const handleToChange = (params: ToFilterParams) => {
    patchDraft({ filterParams: params })
  }

  if (detail.fileType === 'PO') {
    const params = (detail.filterParams as PoFilterParams | null) ?? DEFAULT_PO_FILTER
    return (
      <div className="flex flex-col">
        <PoFlightFilter params={params} onChange={handlePoChange} disabled={disabled} />
      </div>
    )
  }

  if (detail.fileType === 'RO') {
    const params = (detail.filterParams as RoFilterParams | null) ?? DEFAULT_RO_FILTER
    return (
      <div className="flex flex-col">
        <RoCrewFilter crew={params.crew} onChange={(crew) => handleRoChange({ ...params, crew })} disabled={disabled} />
        <RoPairingFilter pairing={params.pairing} onChange={(pairing) => handleRoChange({ ...params, pairing })} disabled={disabled} />
      </div>
    )
  }

  if (detail.fileType === 'TO') {
    const params = (detail.filterParams as ToFilterParams | null) ?? DEFAULT_TO_FILTER
    return (
      <div className="flex flex-col">
        <RoCrewFilter
          crew={params.crew}
          onChange={(crew) => handleToChange({ ...params, crew })}
          disabled={disabled}
        />
        <RoPairingFilter
          pairing={params.pairing}
          onChange={(pairing) => handleToChange({ ...params, pairing })}
          disabled={disabled}
        />
        <ToTrainingFilter
          training={params.training}
          onChange={(training) => handleToChange({ ...params, training })}
          disabled={disabled}
        />
      </div>
    )
  }

  return null
}
```

- [ ] **Step 8: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v scenario-view
```

Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add gantt/src/components/scenario/filter/ gantt/src/components/scenario/scenario-filter-section.tsx
git commit -m "feat(scenario): 过滤条件组件 — TagInput、CollapsibleSection、PO/RO/TO 过滤器"
```

---

## Task 9: 场景详情面板

**Files:**
- Create: `gantt/src/components/scenario/scenario-basic-info.tsx`
- Create: `gantt/src/components/scenario/scenario-kpi-section.tsx`
- Create: `gantt/src/components/scenario/scenario-action-bar.tsx`
- Create: `gantt/src/components/scenario/scenario-detail-panel.tsx`

- [ ] **Step 1: 创建 `scenario-basic-info.tsx`**

```typescript
// gantt/src/components/scenario/scenario-basic-info.tsx
import { Input } from '@rois/ui'
import type { ScenarioDetail } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'

interface ScenarioBasicInfoProps {
  detail: ScenarioDetail
  disabled?: boolean
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
    <div className="flex-1">{children}</div>
  </div>
)

const TYPE_BADGE: Record<string, string> = {
  PO: 'bg-blue-500/15 text-blue-400',
  RO: 'bg-emerald-500/15 text-emerald-400',
  TO: 'bg-violet-500/15 text-violet-400',
}

export const ScenarioBasicInfo = ({ detail, disabled = false }: ScenarioBasicInfoProps) => {
  const patchDraft = useScenarioStore((s) => s.patchDraft)

  return (
    <div className="border-b border-border p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        基本信息
      </div>
      <div className="flex flex-col gap-2.5 text-xs">
        <Field label="场景类型">
          <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[detail.fileType] ?? ''}`}>
            {detail.fileType}
          </span>
        </Field>

        <Field label="开始日期">
          <Input
            type="date"
            className="h-6 text-xs"
            value={detail.strDtLoc}
            disabled={disabled}
            onChange={(e) => patchDraft({ strDtLoc: e.target.value })}
          />
        </Field>

        <Field label="结束日期">
          <Input
            type="date"
            className="h-6 text-xs"
            value={detail.endDtLoc}
            disabled={disabled}
            onChange={(e) => patchDraft({ endDtLoc: e.target.value })}
          />
        </Field>

        <Field label="引用 Live">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border accent-primary"
              checked={detail.leadinLive === 1}
              disabled={disabled}
              onChange={(e) => patchDraft({ leadinLive: e.target.checked ? 1 : 0 })}
            />
            <span className="text-foreground">引用 Live 数据</span>
          </label>
        </Field>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 `scenario-kpi-section.tsx`**

```typescript
// gantt/src/components/scenario/scenario-kpi-section.tsx
import type { ScenarioKpi, ScenarioStatus } from '@/types'

interface ScenarioKpiSectionProps {
  kpis: ScenarioKpi[]
  status: ScenarioStatus
}

const KpiCard = ({ kpi }: { kpi: ScenarioKpi }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-center">
    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {kpi.kpiNames}
    </div>
    <div className="text-base font-bold tabular-nums text-foreground">
      {kpi.kpiValues}
    </div>
    {kpi.description && (
      <div className="text-[10px] text-muted-foreground">{kpi.description}</div>
    )}
  </div>
)

export const ScenarioKpiSection = ({ kpis, status }: ScenarioKpiSectionProps) => {
  if (status === 'DRAFT') return null

  return (
    <div className="border-b border-border p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        KPI 指标
      </div>

      {status === 'RUNNING' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">优化进行中...</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ animation: 'rois-bar 1.5s cubic-bezier(0.65,0.815,0.735,0.395) infinite' }}
            />
          </div>
        </div>
      )}

      {status === 'FAILED' && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          优化失败，请检查配置后重新提交。
        </div>
      )}

      {status === 'DONE' && kpis.length === 0 && (
        <div className="text-xs text-muted-foreground">暂无 KPI 数据</div>
      )}

      {status === 'DONE' && kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `scenario-action-bar.tsx`**

```typescript
// gantt/src/components/scenario/scenario-action-bar.tsx
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Button } from '@rois/ui'
import type { ScenarioDetail } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'
import { useShellStore } from '@/stores/shell-store'

interface ScenarioActionBarProps {
  detail: ScenarioDetail
}

export const ScenarioActionBar = ({ detail }: ScenarioActionBarProps) => {
  const isDirty           = useScenarioStore((s) => s.isDirty)
  const saving            = useScenarioStore((s) => s.saving)
  const saveDetail        = useScenarioStore((s) => s.saveDetail)
  const transitionStatus  = useScenarioStore((s) => s.transitionStatus)
  const setModule         = useShellStore((s) => s.setModule)

  const isRunning = detail.status === 'RUNNING'

  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(detail.updatedAt), { addSuffix: true, locale: zhCN })
    } catch {
      return ''
    }
  })()

  const handleOptimize = () => {
    if (isRunning) {
      transitionStatus(detail.id, 'FAILED') // stop = force to FAILED; real impl may call stop API
    } else {
      transitionStatus(detail.id, 'RUNNING')
    }
  }

  const handleOpenGantt = () => {
    setModule('live')
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-2.5">
      {/* Meta */}
      <div className="flex-1 text-[11px] text-muted-foreground">
        {detail.updatedBy && <span>{detail.updatedBy} · </span>}
        {relativeTime}
      </div>

      {/* Actions */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={!isDirty || saving}
        onClick={saveDetail}
      >
        {saving ? '保存中...' : isDirty ? '保存 *' : '已保存'}
      </Button>

      <Button
        size="sm"
        className={[
          'h-7 text-xs',
          isRunning ? 'bg-amber-500 hover:bg-amber-600 text-white' : '',
        ].join(' ')}
        disabled={saving}
        onClick={handleOptimize}
      >
        {isRunning ? '停止优化' : '启动优化'}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        onClick={handleOpenGantt}
      >
        打开 Gantt
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: 创建 `scenario-detail-panel.tsx`**

```typescript
// gantt/src/components/scenario/scenario-detail-panel.tsx
import { useScenarioStore } from '@/stores/scenario-store'
import { ScenarioBasicInfo } from './scenario-basic-info'
import { ScenarioFilterSection } from './scenario-filter-section'
import { ScenarioKpiSection } from './scenario-kpi-section'
import { ScenarioActionBar } from './scenario-action-bar'
import { ScenarioEmptyState } from './scenario-empty-state'

interface ScenarioDetailPanelProps {
  onCreateNew: () => void
}

export const ScenarioDetailPanel = ({ onCreateNew }: ScenarioDetailPanelProps) => {
  const detail        = useScenarioStore((s) => s.detail)
  const draftDetail   = useScenarioStore((s) => s.draftDetail)
  const kpis          = useScenarioStore((s) => s.kpis)
  const detailLoading = useScenarioStore((s) => s.detailLoading)

  if (detailLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        加载中...
      </div>
    )
  }

  if (!detail || !draftDetail) {
    return <ScenarioEmptyState onCreateNew={onCreateNew} />
  }

  const displayDetail = { ...detail, ...draftDetail } as ScenarioDetail
  const isReadonly = detail.status === 'RUNNING'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
          value={draftDetail.name ?? ''}
          placeholder="场景名称"
          disabled={isReadonly}
          onChange={(e) => useScenarioStore.getState().patchDraft({ name: e.target.value })}
        />
        <span className={[
          'shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold',
          detail.status === 'RUNNING' ? 'bg-blue-500/15 text-blue-400' :
          detail.status === 'DONE'    ? 'bg-emerald-500/15 text-emerald-400' :
          detail.status === 'FAILED'  ? 'bg-destructive/15 text-destructive' :
          'bg-muted text-muted-foreground',
        ].join(' ')}>
          {detail.status === 'DRAFT' ? '草稿' :
           detail.status === 'RUNNING' ? '运行中' :
           detail.status === 'DONE' ? '已完成' : '失败'}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <ScenarioBasicInfo detail={displayDetail} disabled={isReadonly} />
        <div className="border-b border-border">
          <div className="p-4 pb-0 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            优化范围过滤
          </div>
          <ScenarioFilterSection detail={displayDetail} disabled={isReadonly} />
        </div>
        <ScenarioKpiSection kpis={kpis} status={detail.status} />
      </div>

      {/* Fixed bottom action bar */}
      <ScenarioActionBar detail={displayDetail} />
    </div>
  )
}
```

- [ ] **Step 5: 类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v scenario-view
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario/scenario-basic-info.tsx gantt/src/components/scenario/scenario-kpi-section.tsx gantt/src/components/scenario/scenario-action-bar.tsx gantt/src/components/scenario/scenario-detail-panel.tsx
git commit -m "feat(scenario): 场景详情面板 — 基本信息、KPI、操作栏"
```

---

## Task 10: 顶层视图组装

**Files:**
- Create: `gantt/src/components/shell/scenario-view.tsx`

- [ ] **Step 1: 创建 `scenario-view.tsx`**

```typescript
// gantt/src/components/shell/scenario-view.tsx
import { useCallback } from 'react'
import { useScenarioStore } from '@/stores/scenario-store'
import { ScenarioListPanel } from '@/components/scenario/scenario-list-panel'
import { ScenarioDetailPanel } from '@/components/scenario/scenario-detail-panel'
import type { CreateScenarioInput } from '@/types'

/** Default payload for a new PO scenario */
const makeNewScenario = (): CreateScenarioInput => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const startDate = `${yyyy}-${mm}-01`
  const endDate = `${yyyy}-${mm}-${dd}`
  return {
    name: '新场景',
    fileType: 'RO',
    strDtLoc: startDate,
    endDtLoc: endDate,
    leadinLive: 1,
  }
}

export const ScenarioView = () => {
  const createNew = useScenarioStore((s) => s.createNew)

  const handleCreateNew = useCallback(async () => {
    await createNew(makeNewScenario())
  }, [createNew])

  return (
    <div className="flex h-full overflow-hidden">
      <ScenarioListPanel onCreateNew={handleCreateNew} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <ScenarioDetailPanel onCreateNew={handleCreateNew} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 确认 app-shell.tsx 的 import 已添加**

检查 `gantt/src/components/shell/app-shell.tsx` 中是否包含以下行：
```typescript
import { ScenarioView } from './scenario-view'
```
以及 `ModuleView` 函数中：
```typescript
  if (module === 'scenario') return <ScenarioView />
```

若 Task 5 Step 4 已完成则无需修改；否则在此步骤补充。

- [ ] **Step 3: 完整类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
```

Expected: **0 errors**

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/shell/scenario-view.tsx gantt/src/components/shell/app-shell.tsx
git commit -m "feat(scenario): 顶层 ScenarioView 双栏布局组装完成"
```

---

## Task 11: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npm run dev
```

- [ ] **Step 2: 验证导航**

打开 `http://localhost:5566`，检查：
- 顶部导航出现 **Scenario** 菜单项（FlaskConical 图标，位于 Live 右侧）
- 点击后 Tab Bar 出现 Scenario 标签
- 左侧 Sidebar 显示 All Scenarios / PO / RO·TO 三个子项
- 刷新页面后导航状态保持（localStorage 持久化）

- [ ] **Step 3: 验证列表面板**

- 左侧 340px 场景列表面板正确渲染
- 搜索框输入有 debounce 过滤效果（需后端返回数据）
- 类型和状态下拉正确显示选项
- 类型徽章颜色：PO 蓝 / RO 绿 / TO 紫
- RUNNING 状态的指示点有 `animate-pulse` 呼吸动画
- 鼠标悬停列表行显示修改人/时间信息
- 点击行，右侧详情面板切换

- [ ] **Step 4: 验证详情面板**

- 场景名称行内可编辑
- 基本信息区块字段正确映射
- 过滤条件 Accordion 按 PO/RO/TO 类型正确渲染
- TagInput 可添加/删除 Tag
- CollapsibleSection 折叠/展开正常
- 修改任意字段后"保存"按钮高亮显示 `保存 *`
- 保存成功后"已保存"恢复
- "打开 Gantt"按钮点击后切换到 Live 模块

- [ ] **Step 5: 最终类型检查**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
```

Expected: 0 errors

---

## 注意事项

1. **后端 API 已就绪**：`/api/scenario` 系列端点在 live-server 完整实现，前端直接对接即可。
2. **字典状态对齐**：Task 1 必须先执行，`SCENARIO_ST` 字典原有 COMPLETED/PUBLISHED/ARCHIVED，需追加 DONE/FAILED 才与后端服务的状态机匹配。
3. **ScenarioView 在 Task 10 前的中间状态**：Task 5 Step 4 导入了尚未创建的 `scenario-view.tsx`，期间 `tsc --noEmit` 会有找不到模块报错。使用 `2>&1 | grep -v scenario-view` 过滤此报错即可，Task 10 完成后恢复正常。
4. **停止优化 API**：目前 `handleOptimize` 中"停止"调用的是 `transition(id, 'FAILED')`，实际 live-server 可能有专用停止端点，上线前与后端确认。
5. **"打开 Gantt"联动**：目前实现为切换到 Live 模块，后续可扩展为将场景的 `filter_params` 注入到 `filter-store` 中实现数据范围联动。
