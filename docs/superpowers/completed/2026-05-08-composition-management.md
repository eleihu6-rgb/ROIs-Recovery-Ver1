# Composition Management Implementation Plan

> **STATUS: COMPLETED** (2026-05-10)
>
> All 13 tasks implemented and merged to main branch.
> See `docs/modules/gantt/composition-management.md` for feature documentation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Composition Load (配比定义管理) and Composition (配比方案管理) as two new sub-pages under the Gantt Rule module sidebar, with full CRUD backed by the already-existing live-server API.

**Architecture:** Extend `shell-store` with `ActiveRuleItem`, add three sidebar nav items for the Rule module, then build six new frontend-only files (types → API → two Zustand stores → view components). The dynamic rank×option matrix derives its row/column structure from `composition_rank` rows and allows inline cell editing that upserts/deletes DB rows immediately.

**Tech Stack:** React 19, TypeScript, Zustand, Axios (via `api` helper), `@rois/ui` (shadcn/ui + Tailwind), Lucide icons, Vite.

**Spec:** `docs/superpowers/specs/2026-05-08-composition-management-design.md`  
**Mockup:** `docs/modules/gantt/composition-management-mockup.html`

---

## File Map

| Status | Path | Responsibility |
|---|---|---|
| **Create** | `gantt/src/types/composition.ts` | TS types for all three tables |
| **Create** | `gantt/src/services/composition-api.ts` | All API calls |
| **Modify** | `gantt/src/stores/shell-store.ts` | Add `ActiveRuleItem` + `setRuleItem` |
| **Modify** | `gantt/src/components/shell/shell-sidebar.tsx` | Add Rule nav items |
| **Create** | `gantt/src/components/rule/rule-manager-view.tsx` | Extract existing RuleView content |
| **Modify** | `gantt/src/components/rule/rule-view.tsx` | Switch on `activeRuleItem` |
| **Create** | `gantt/src/stores/composition-load-store.ts` | Load list, filters, CRUD |
| **Create** | `gantt/src/components/composition/composition-load-view.tsx` | Filter bar + table + pagination |
| **Create** | `gantt/src/components/composition/composition-load-dialog.tsx` | Add/Edit modal for loads |
| **Create** | `gantt/src/stores/composition-store.ts` | Composition tree, selected comp, rank matrix ops |
| **Create** | `gantt/src/components/composition/composition-tree.tsx` | Left tree panel |
| **Create** | `gantt/src/components/composition/rank-option-matrix.tsx` | Dynamic rank×option grid |
| **Create** | `gantt/src/components/composition/composition-detail.tsx` | Header info + Edit/Delete |
| **Create** | `gantt/src/components/composition/composition-view.tsx` | Wire tree + detail panel |

---

## Task 1: TypeScript Types

**Files:**
- Create: `gantt/src/types/composition.ts`

- [x] **Step 1: Create the types file**

```typescript
// gantt/src/types/composition.ts

export interface Composition {
  id: number
  filiale: string | null
  division: string
  name: string
  nameDesc: string | null
  displayOrder: number
  hierarchy: number | null
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export interface CompositionRank {
  id: number
  compId: number
  rank: string
  planValue: number        // always set when row exists; null cell = no row in DB
  planValueExtra: number
  options: number          // option index, 1-based
}

export interface CompositionLoad {
  id: number
  filiale: string
  division: string
  sequence: number
  fltNum: string | null
  fleet: string | null
  flightFlag: string | null
  fltType: string | null
  segType: string | null
  routeId: number | null
  loadFactor: string | null
  effDt: string
  expDt: string | null
  dow: string
  description: string | null
  compId: number | null
  subFleet: string | null
  flightAssignment: string | null
  serviceType: string | null
  paxNum: string | null
  restFacility: number | null
  departureTime: string | null
  arrivalTime: string | null
  optionId: number | null
  blhLow: string | null
  blhUpper: string | null
}

export type CreateCompositionData = {
  filiale?: string | null
  division: string
  name: string
  nameDesc?: string | null
  displayOrder: number
  hierarchy?: number | null
}

export type CreateLoadData = Omit<CompositionLoad, 'id'>

export type CreateRankData = {
  compId: number
  rank: string
  planValue: number
  planValueExtra: number
  options: number
}
```

- [x] **Step 2: Verify type-check passes**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `composition.ts`.

- [x] **Step 3: Commit**

```bash
git add gantt/src/types/composition.ts
git commit -m "feat(gantt): add composition TypeScript types"
```

---

## Task 2: API Service

**Files:**
- Create: `gantt/src/services/composition-api.ts`

- [x] **Step 1: Create the API service**

```typescript
// gantt/src/services/composition-api.ts
import { api } from './api'
import type {
  Composition, CompositionRank, CompositionLoad,
  CreateCompositionData, CreateLoadData, CreateRankData,
} from '@/types/composition'

export const compositionApi = {
  // ── Composition ──────────────────────────────────────────────
  listCompositions: (): Promise<Composition[]> =>
    api.get('/api/composition') as Promise<Composition[]>,

  createComposition: (data: CreateCompositionData): Promise<Composition> =>
    api.post('/api/composition', data) as Promise<Composition>,

  updateComposition: (id: number, data: Partial<CreateCompositionData>): Promise<Composition> =>
    api.put(`/api/composition/${id}`, data) as Promise<Composition>,

  deleteComposition: (id: number): Promise<void> =>
    api.delete(`/api/composition/${id}`) as Promise<void>,

  // ── Composition Load ─────────────────────────────────────────
  listLoads: (): Promise<CompositionLoad[]> =>
    api.get('/api/composition/load') as Promise<CompositionLoad[]>,

  createLoad: (data: CreateLoadData): Promise<CompositionLoad> =>
    api.post('/api/composition/load', data) as Promise<CompositionLoad>,

  updateLoad: (id: number, data: Partial<CreateLoadData>): Promise<CompositionLoad> =>
    api.put(`/api/composition/load/${id}`, data) as Promise<CompositionLoad>,

  deleteLoad: (id: number): Promise<void> =>
    api.delete(`/api/composition/load/${id}`) as Promise<void>,

  // ── Composition Rank ─────────────────────────────────────────
  getRanksByCompId: (compId: number): Promise<CompositionRank[]> =>
    api.get(`/api/composition/rank/comp/${compId}`) as Promise<CompositionRank[]>,

  createRank: (data: CreateRankData): Promise<CompositionRank> =>
    api.post('/api/composition/rank', data) as Promise<CompositionRank>,

  updateRank: (id: number, data: { planValue: number }): Promise<CompositionRank> =>
    api.put(`/api/composition/rank/${id}`, data) as Promise<CompositionRank>,

  deleteRank: (id: number): Promise<void> =>
    api.delete(`/api/composition/rank/${id}`) as Promise<void>,
}
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add gantt/src/services/composition-api.ts
git commit -m "feat(gantt): add composition API service"
```

---

## Task 3: Shell Store — Add ActiveRuleItem

**Files:**
- Modify: `gantt/src/stores/shell-store.ts`

- [x] **Step 1: Add type and fields to the store**

In `gantt/src/stores/shell-store.ts`, make these four changes:

**a) Add the new type after `ActiveScenarioItem`:**
```typescript
export type ActiveRuleItem = 'rule-manager' | 'comp-load' | 'comp'
```

**b) Add to `ShellStore` interface (after `activeScenarioItem`):**
```typescript
activeRuleItem: ActiveRuleItem
setRuleItem: (item: ActiveRuleItem) => void
```

**c) Add to `KEYS` object:**
```typescript
ruleItem: 'rois-shell-rule-item',
```

**d) Add initial state (after `activeScenarioItem: 'all'`):**
```typescript
activeRuleItem: 'rule-manager',
```

**e) Add the action (after `setScenarioItem`):**
```typescript
setRuleItem: (item) => {
  set({ activeRuleItem: item })
  save(KEYS.ruleItem, item)
},
```

**f) Add to `loadFromStorage` — inside the `try` block, add the parse:**
```typescript
const ruleItem = (localStorage.getItem(KEYS.ruleItem) as ActiveRuleItem | null) ?? 'rule-manager'
```
And include `activeRuleItem: ruleItem` in the final `set({...})` call.

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add gantt/src/stores/shell-store.ts
git commit -m "feat(gantt): add ActiveRuleItem to shell store"
```

---

## Task 4: Sidebar — Add Rule Nav Items

**Files:**
- Modify: `gantt/src/components/shell/shell-sidebar.tsx`

- [x] **Step 1: Add imports and menu definition**

At the top of `shell-sidebar.tsx`, add to the existing lucide import:
```typescript
import {
  // ... existing imports ...
  ClipboardCheck, AlignJustify,
} from 'lucide-react'
```

And import the new type:
```typescript
import type { ActiveLiveItem, ActiveScenarioItem, ActiveRuleItem } from '@/stores/shell-store'
```

Add the menu constant after `SCENARIO_MENU`:
```typescript
interface RuleMenuItem {
  item: ActiveRuleItem
  label: string
  Icon: React.ElementType
}

const RULE_MENU: RuleMenuItem[] = [
  { item: 'rule-manager', label: 'Rule Manager',      Icon: ClipboardCheck },
  { item: 'comp-load',    label: 'Composition Load',  Icon: AlignJustify },
  { item: 'comp',         label: 'Composition',       Icon: Users },
]
```

- [x] **Step 2: Wire store state and add Rule branch**

In the `ShellSidebar` component body, add after the `setScenarioItem` line:
```typescript
const activeRuleItem = useShellStore((s) => s.activeRuleItem)
const setRuleItem    = useShellStore((s) => s.setRuleItem)
```

In the sidebar body section (inside `<div className="flex-1 overflow-y-auto...">`), add a new branch **after** the `activeModule === 'scenario'` block:

```tsx
{activeModule === 'rule' && (
  <>
    {!isCollapsed && (
      <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
        Configuration
      </div>
    )}
    <TooltipProvider delayDuration={300}>
      {RULE_MENU.map(({ item, label: itemLabel, Icon }) => {
        const isActive = activeRuleItem === item
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
                onClick={() => setRuleItem(item)}
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

- [x] **Step 3: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 4: Smoke test — open http://localhost:5173, navigate to Rule tab**

Expected: sidebar shows three items (Rule Manager, Composition Load, Composition). Clicking each switches the active item (highlight moves). Rule Manager click leaves the right panel unchanged.

- [x] **Step 5: Commit**

```bash
git add gantt/src/components/shell/shell-sidebar.tsx
git commit -m "feat(gantt): add Rule module sidebar navigation"
```

---

## Task 5: RuleView — Extract and Switch

**Files:**
- Create: `gantt/src/components/rule/rule-manager-view.tsx`
- Modify: `gantt/src/components/rule/rule-view.tsx`

- [x] **Step 1: Create rule-manager-view.tsx**

Copy the current content of `rule-view.tsx` verbatim into a new file, renaming only the exported component:

```typescript
// gantt/src/components/rule/rule-manager-view.tsx
import { useEffect } from 'react'
import { useRuleConfigStore } from '@/stores/rule-config-store'
import { RuleGroupList } from './rule-group-list'
import { RuleGroupHeader } from './rule-group-header'
import { RuleGroupRules } from './rule-group-rules'

export const RuleManagerView = () => {
  const fetchGroups = useRuleConfigStore((s) => s.fetchGroups)
  const selectedGroupCode = useRuleConfigStore((s) => s.selectedGroupCode)
  const groups = useRuleConfigStore((s) => s.groups)
  const selectGroup = useRuleConfigStore((s) => s.selectGroup)

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    if (!selectedGroupCode && groups.length > 0) {
      void selectGroup(groups[0].groupCode)
    }
  }, [groups, selectedGroupCode, selectGroup])

  return (
    <div className="flex h-full overflow-hidden">
      <RuleGroupList />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {!selectedGroupCode ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a rule set to configure
          </div>
        ) : (
          <>
            <RuleGroupHeader />
            <RuleGroupRules />
          </>
        )}
      </div>
    </div>
  )
}
```

- [x] **Step 2: Replace rule-view.tsx**

Replace the entire content of `gantt/src/components/rule/rule-view.tsx`:

```typescript
// gantt/src/components/rule/rule-view.tsx
import { useShellStore } from '@/stores/shell-store'
import { RuleManagerView } from './rule-manager-view'
import { CompositionLoadView } from '@/components/composition/composition-load-view'
import { CompositionView } from '@/components/composition/composition-view'

export const RuleView = () => {
  const activeRuleItem = useShellStore((s) => s.activeRuleItem)
  if (activeRuleItem === 'comp-load') return <CompositionLoadView />
  if (activeRuleItem === 'comp')      return <CompositionView />
  return <RuleManagerView />
}
```

Note: `CompositionLoadView` and `CompositionView` don't exist yet — TypeScript will error until Tasks 7 and 13 are done. That's fine; keep the file as-is and proceed.

- [x] **Step 3: Create placeholder stubs so the project compiles**

```bash
mkdir -p /home/yuan.z/rois/rois-ai/gantt/src/components/composition
```

Create `gantt/src/components/composition/composition-load-view.tsx`:
```typescript
export const CompositionLoadView = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    Composition Load — coming soon
  </div>
)
```

Create `gantt/src/components/composition/composition-view.tsx`:
```typescript
export const CompositionView = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    Composition — coming soon
  </div>
)
```

- [x] **Step 4: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [x] **Step 5: Smoke test**

Navigate to Rule tab → click Composition Load → right panel shows "coming soon". Click Composition → same. Click Rule Manager → original rule UI.

- [x] **Step 6: Commit**

```bash
git add gantt/src/components/rule/rule-manager-view.tsx \
        gantt/src/components/rule/rule-view.tsx \
        gantt/src/components/composition/composition-load-view.tsx \
        gantt/src/components/composition/composition-view.tsx
git commit -m "feat(gantt): refactor RuleView to support sub-navigation"
```

---

## Task 6: Composition Load Store

**Files:**
- Create: `gantt/src/stores/composition-load-store.ts`

- [x] **Step 1: Create the store**

```typescript
// gantt/src/stores/composition-load-store.ts
import { create } from 'zustand'
import { compositionApi } from '@/services/composition-api'
import type { CompositionLoad, Composition, CreateLoadData } from '@/types/composition'

export interface CompositionLoadFilters {
  division: string
  sequence: string
  fleet: string
  fltNum: string
  subFleet: string
  flightFlag: string
  flightAssignment: string
}

const DEFAULT_FILTERS: CompositionLoadFilters = {
  division: '', sequence: '', fleet: '', fltNum: '',
  subFleet: '', flightFlag: '', flightAssignment: '',
}

interface CompositionLoadStore {
  items: CompositionLoad[]
  compositions: Composition[]   // for name resolution in table + dialog dropdown
  loading: boolean

  filters: CompositionLoadFilters

  fetchAll(): Promise<void>
  fetchCompositions(): Promise<void>
  setFilter(patch: Partial<CompositionLoadFilters>): void
  clearFilters(): void
  create(data: CreateLoadData): Promise<void>
  update(id: number, data: Partial<CreateLoadData>): Promise<void>
  remove(id: number): Promise<void>
}

export const useCompositionLoadStore = create<CompositionLoadStore>((set, get) => ({
  items: [],
  compositions: [],
  loading: false,
  filters: { ...DEFAULT_FILTERS },

  fetchAll: async () => {
    set({ loading: true })
    try {
      const items = await compositionApi.listLoads()
      set({ items })
    } finally {
      set({ loading: false })
    }
  },

  fetchCompositions: async () => {
    const compositions = await compositionApi.listCompositions()
    set({ compositions })
  },

  setFilter: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),

  clearFilters: () =>
    set({ filters: { ...DEFAULT_FILTERS } }),

  create: async (data) => {
    const item = await compositionApi.createLoad(data)
    set((s) => ({ items: [...s.items, item] }))
  },

  update: async (id, data) => {
    const updated = await compositionApi.updateLoad(id, data)
    set((s) => ({ items: s.items.map((i) => (i.id === id ? updated : i)) }))
  },

  remove: async (id) => {
    await compositionApi.deleteLoad(id)
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  },
}))
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/stores/composition-load-store.ts
git commit -m "feat(gantt): add composition load Zustand store"
```

---

## Task 7: Composition Load View

**Files:**
- Modify: `gantt/src/components/composition/composition-load-view.tsx` (replace stub)
- Create: `gantt/src/components/composition/composition-load-dialog.tsx`

- [x] **Step 1: Create the Add/Edit dialog**

```typescript
// gantt/src/components/composition/composition-load-dialog.tsx
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useCompositionLoadStore } from '@/stores/composition-load-store'
import { notify } from '@/utils/notify'
import type { CompositionLoad, CreateLoadData } from '@/types/composition'

interface Props {
  open: boolean
  editItem: CompositionLoad | null
  onClose(): void
}

const EMPTY: Omit<CreateLoadData, 'filiale'> = {
  division: '',
  sequence: 1,
  fltNum: null,
  fleet: null,
  flightFlag: null,
  fltType: null,
  segType: null,
  routeId: null,
  loadFactor: null,
  effDt: new Date().toISOString().slice(0, 10),
  expDt: null,
  dow: '1234567',
  description: null,
  compId: null,
  subFleet: null,
  flightAssignment: null,
  serviceType: null,
  paxNum: null,
  restFacility: null,
  departureTime: null,
  arrivalTime: null,
  optionId: null,
  blhLow: null,
  blhUpper: null,
}

export const CompositionLoadDialog = ({ open, editItem, onClose }: Props) => {
  const create = useCompositionLoadStore((s) => s.create)
  const update = useCompositionLoadStore((s) => s.update)
  const compositions = useCompositionLoadStore((s) => s.compositions)

  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editItem) {
      const f: Record<string, string> = {}
      Object.entries(editItem).forEach(([k, v]) => {
        if (k !== 'id') f[k] = v === null ? '' : String(v)
      })
      setForm(f)
    } else {
      const f: Record<string, string> = {}
      Object.entries({ filiale: '', ...EMPTY }).forEach(([k, v]) => {
        f[k] = v === null ? '' : String(v)
      })
      setForm(f)
    }
  }, [open, editItem])

  const field = (key: string) => form[key] ?? ''
  const setField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const toPayload = (): CreateLoadData => ({
    filiale: field('filiale') || 'F8',
    division: field('division'),
    sequence: parseInt(field('sequence')) || 1,
    fltNum:           field('fltNum') || null,
    fleet:            field('fleet') || null,
    flightFlag:       field('flightFlag') || null,
    fltType:          field('fltType') || null,
    segType:          field('segType') || null,
    routeId:          field('routeId') ? parseInt(field('routeId')) : null,
    loadFactor:       field('loadFactor') || null,
    effDt:            field('effDt') || new Date().toISOString(),
    expDt:            field('expDt') || null,
    dow:              field('dow') || '1234567',
    description:      field('description') || null,
    compId:           field('compId') ? parseInt(field('compId')) : null,
    subFleet:         field('subFleet') || null,
    flightAssignment: field('flightAssignment') || null,
    serviceType:      field('serviceType') || null,
    paxNum:           field('paxNum') || null,
    restFacility:     field('restFacility') ? parseInt(field('restFacility')) : null,
    departureTime:    field('departureTime') || null,
    arrivalTime:      field('arrivalTime') || null,
    optionId:         field('optionId') ? parseInt(field('optionId')) : null,
    blhLow:           field('blhLow') || null,
    blhUpper:         field('blhUpper') || null,
  })

  const handleSubmit = async () => {
    if (!field('division') || !field('sequence')) {
      notify.error('Division and Sequence are required')
      return
    }
    setSaving(true)
    try {
      if (editItem) {
        await update(editItem.id, toPayload())
        notify.success('Load rule updated')
      } else {
        await create(toPayload())
        notify.success('Load rule created')
      }
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const inputCls = 'h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'
  const labelCls = 'text-[10px] font-semibold text-muted-foreground mb-1 block'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="relative w-[720px] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-bold">
            {editItem ? 'Edit Load Rule' : 'Add Load Rule'}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-3 gap-4 p-5">
          <div>
            <label className={labelCls}>Division *</label>
            <input className={inputCls} value={field('division')} onChange={(e) => setField('division', e.target.value)} placeholder="P / C" />
          </div>
          <div>
            <label className={labelCls}>Priority (Sequence) *</label>
            <input className={inputCls} type="number" value={field('sequence')} onChange={(e) => setField('sequence', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Filiale</label>
            <input className={inputCls} value={field('filiale')} onChange={(e) => setField('filiale', e.target.value)} placeholder="F8" />
          </div>

          <div>
            <label className={labelCls}>Fleet</label>
            <input className={inputCls} value={field('fleet')} onChange={(e) => setField('fleet', e.target.value)} placeholder="* = any" />
          </div>
          <div>
            <label className={labelCls}>Flight No.</label>
            <input className={inputCls} value={field('fltNum')} onChange={(e) => setField('fltNum', e.target.value)} placeholder="* = any" />
          </div>
          <div>
            <label className={labelCls}>Sub Fleet</label>
            <input className={inputCls} value={field('subFleet')} onChange={(e) => setField('subFleet', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Flight Flag</label>
            <input className={inputCls} value={field('flightFlag')} onChange={(e) => setField('flightFlag', e.target.value)} placeholder="A / C" />
          </div>
          <div>
            <label className={labelCls}>Flight Assignment</label>
            <input className={inputCls} value={field('flightAssignment')} onChange={(e) => setField('flightAssignment', e.target.value)} placeholder="FLY / SBY" />
          </div>
          <div>
            <label className={labelCls}>Service Type</label>
            <input className={inputCls} value={field('serviceType')} onChange={(e) => setField('serviceType', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Segment Type</label>
            <input className={inputCls} value={field('segType')} onChange={(e) => setField('segType', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Load Factor %</label>
            <input className={inputCls} value={field('loadFactor')} onChange={(e) => setField('loadFactor', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Pax Num</label>
            <input className={inputCls} value={field('paxNum')} onChange={(e) => setField('paxNum', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>DEP Time (HH:mm–HH:mm)</label>
            <input className={inputCls} value={field('departureTime')} onChange={(e) => setField('departureTime', e.target.value)} placeholder="00:00–23:59" />
          </div>
          <div>
            <label className={labelCls}>ARR Time (HH:mm–HH:mm)</label>
            <input className={inputCls} value={field('arrivalTime')} onChange={(e) => setField('arrivalTime', e.target.value)} placeholder="00:00–23:59" />
          </div>
          <div>
            <label className={labelCls}>Rest Facility</label>
            <input className={inputCls} type="number" value={field('restFacility')} onChange={(e) => setField('restFacility', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>BLH Low</label>
            <input className={inputCls} value={field('blhLow')} onChange={(e) => setField('blhLow', e.target.value)} placeholder="0:00" />
          </div>
          <div>
            <label className={labelCls}>BLH Upper</label>
            <input className={inputCls} value={field('blhUpper')} onChange={(e) => setField('blhUpper', e.target.value)} placeholder="99:00" />
          </div>
          <div>
            <label className={labelCls}>Day of Week</label>
            <input className={inputCls} value={field('dow')} onChange={(e) => setField('dow', e.target.value)} placeholder="1234567" />
          </div>

          <div>
            <label className={labelCls}>Effective Date *</label>
            <input className={inputCls} type="date" value={field('effDt')?.slice(0, 10)} onChange={(e) => setField('effDt', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Expiry Date</label>
            <input className={inputCls} type="date" value={field('expDt')?.slice(0, 10)} onChange={(e) => setField('expDt', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Composition</label>
            <select className={inputCls} value={field('compId')} onChange={(e) => setField('compId', e.target.value)}>
              <option value="">— none —</option>
              {compositions.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name} ({c.division})</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Option ID</label>
            <input className={inputCls} type="number" value={field('optionId')} onChange={(e) => setField('optionId', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={field('description')} onChange={(e) => setField('description', e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Replace the composition-load-view.tsx stub with the real view**

```typescript
// gantt/src/components/composition/composition-load-view.tsx
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Plus, Trash2 } from 'lucide-react'
import { useCompositionLoadStore } from '@/stores/composition-load-store'
import { CompositionLoadDialog } from './composition-load-dialog'
import { notify } from '@/utils/notify'
import type { CompositionLoad } from '@/types/composition'

export const CompositionLoadView = () => {
  const fetchAll          = useCompositionLoadStore((s) => s.fetchAll)
  const fetchCompositions = useCompositionLoadStore((s) => s.fetchCompositions)
  const items             = useCompositionLoadStore((s) => s.items)
  const compositions      = useCompositionLoadStore((s) => s.compositions)
  const loading           = useCompositionLoadStore((s) => s.loading)
  const filters           = useCompositionLoadStore((s) => s.filters)
  const setFilter         = useCompositionLoadStore((s) => s.setFilter)
  const clearFilters      = useCompositionLoadStore((s) => s.clearFilters)
  const remove            = useCompositionLoadStore((s) => s.remove)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<CompositionLoad | null>(null)

  useEffect(() => {
    void fetchAll()
    void fetchCompositions()
  }, [fetchAll, fetchCompositions])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.division && item.division !== filters.division) return false
      if (filters.sequence && String(item.sequence) !== filters.sequence.trim()) return false
      if (filters.fleet && !(item.fleet ?? '*').toLowerCase().includes(filters.fleet.toLowerCase())) return false
      if (filters.fltNum && !(item.fltNum ?? '*').toLowerCase().includes(filters.fltNum.toLowerCase())) return false
      if (filters.subFleet && item.subFleet !== filters.subFleet) return false
      if (filters.flightFlag && item.flightFlag !== filters.flightFlag) return false
      if (filters.flightAssignment && item.flightAssignment !== filters.flightAssignment) return false
      return true
    })
  }, [items, filters])

  const compName = (id: number | null) => {
    if (!id) return '—'
    return compositions.find((c) => c.id === id)?.name ?? String(id)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this load rule?')) return
    try {
      await remove(id)
      notify.success('Deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const inputCls = 'h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'
  const selectCls = inputCls + ' min-w-[120px]'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Filter Bar ── */}
      <div className="flex-shrink-0 border-b border-border bg-card px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground w-16 text-right">Division</span>
          <input className={inputCls} placeholder="P / C" value={filters.division}
            onChange={(e) => setFilter({ division: e.target.value })} />
          <span className="text-[10px] font-semibold text-muted-foreground w-16 text-right">Priority</span>
          <input className={inputCls} placeholder="1" value={filters.sequence} style={{ width: 60 }}
            onChange={(e) => setFilter({ sequence: e.target.value })} />
          <span className="text-[10px] font-semibold text-muted-foreground w-10 text-right">Fleet</span>
          <input className={inputCls} placeholder="A330" value={filters.fleet}
            onChange={(e) => setFilter({ fleet: e.target.value })} />
          <span className="text-[10px] font-semibold text-muted-foreground w-16 text-right">Flight No.</span>
          <input className={inputCls} placeholder="FU1234" value={filters.fltNum}
            onChange={(e) => setFilter({ fltNum: e.target.value })} />
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={clearFilters}
              className="h-7 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground w-16 text-right">Sub Fleet</span>
          <input className={inputCls} value={filters.subFleet}
            onChange={(e) => setFilter({ subFleet: e.target.value })} />
          <span className="text-[10px] font-semibold text-muted-foreground w-16 text-right">Flt Flag</span>
          <input className={inputCls} placeholder="A / C" value={filters.flightFlag}
            onChange={(e) => setFilter({ flightFlag: e.target.value })} />
          <span className="text-[10px] font-semibold text-muted-foreground w-20 text-right">Flt Assign.</span>
          <input className={inputCls} placeholder="FLY / SBY" value={filters.flightAssignment}
            onChange={(e) => setFilter({ flightAssignment: e.target.value })} />
        </div>
      </div>

      {/* ── Table Toolbar ── */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          Total <strong className="text-foreground">{filtered.length}</strong> records
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { void fetchAll(); void fetchCompositions() }}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button onClick={() => { setEditItem(null); setDialogOpen(true) }}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/15 px-3 text-xs font-semibold text-primary hover:bg-primary/25">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10 bg-card">
                {['Filiale','Division','Priority','Fleet','Flight No.','Sub Fleet','Flt Flag','Flt Assign.',
                  'Svc Type','Seg Type','Load Factor%','Pax Num','DEP Time','ARR Time',
                  'Effective Date','Expiry Date','DoW','Description','BLH','Composition','Option','Action'
                ].map((h) => (
                  <th key={h} className="border-b border-border px-3 py-2 text-left text-[10px] font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={22} className="py-12 text-center text-xs text-muted-foreground">
                    No records match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-card/80">
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.filiale}</td>
                  <td className="px-3 py-1.5">{row.division}</td>
                  <td className="px-3 py-1.5">{row.sequence}</td>
                  <td className="px-3 py-1.5">{row.fleet ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.fltNum ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.subFleet ?? '*'}</td>
                  <td className="px-3 py-1.5">
                    {row.flightFlag && (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                        {row.flightFlag}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {row.flightAssignment && (
                      <span className="rounded bg-green-500/12 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
                        {row.flightAssignment}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{row.serviceType ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.segType ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.loadFactor ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.paxNum ?? '*'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.departureTime ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.arrivalTime ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.effDt?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.expDt?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-1.5">{row.dow}</td>
                  <td className="max-w-[120px] truncate px-3 py-1.5">{row.description ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {row.blhLow && row.blhUpper ? `${row.blhLow}–${row.blhUpper}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-primary whitespace-nowrap">{compName(row.compId)}</td>
                  <td className="px-3 py-1.5">{row.optionId ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <button
                      onClick={() => { setEditItem(row); setDialogOpen(true) }}
                      className="mr-2 text-primary hover:underline text-[10px] font-semibold"
                    >Edit</button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="text-destructive hover:underline text-[10px] font-semibold"
                    >Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CompositionLoadDialog
        open={dialogOpen}
        editItem={editItem}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
```

- [x] **Step 3: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 4: Browser test — navigate to Rule → Composition Load**

Expected:
- Filter bar visible with two rows of inputs
- Table renders (empty if no data, or rows from DB)
- Add button opens dialog; Cancel closes it
- Edit button pre-fills dialog fields; Save calls PUT
- Del button confirms then removes the row

- [x] **Step 5: Commit**

```bash
git add gantt/src/components/composition/composition-load-view.tsx \
        gantt/src/components/composition/composition-load-dialog.tsx
git commit -m "feat(gantt): implement Composition Load page (filter table + CRUD dialog)"
```

---

## Task 8: Composition Store

**Files:**
- Create: `gantt/src/stores/composition-store.ts`

- [x] **Step 1: Create the store**

```typescript
// gantt/src/stores/composition-store.ts
import { create } from 'zustand'
import { compositionApi } from '@/services/composition-api'
import type { Composition, CompositionRank, CreateCompositionData } from '@/types/composition'

interface CompositionStore {
  compositions: Composition[]
  loading: boolean

  selectedId: number | null
  ranks: CompositionRank[]         // all rank rows for the selected composition
  rankLoading: boolean

  // Derived display state (rebuilt whenever ranks changes)
  displayRanks: string[]           // unique rank codes, determines columns
  displayOptions: number[]         // unique option indices, determines rows

  fetchAll(): Promise<void>
  selectComposition(id: number): Promise<void>

  createComposition(data: CreateCompositionData): Promise<void>
  updateComposition(id: number, data: Partial<CreateCompositionData>): Promise<void>
  removeComposition(id: number): Promise<void>

  // Matrix operations (each triggers API immediately)
  setCell(rank: string, optionIdx: number, value: number | null): Promise<void>
  addRank(rankCode: string): void
  deleteRank(rankCode: string): Promise<void>
  addOption(): void
  deleteOption(optionIdx: number): Promise<void>
}

const deriveDisplay = (ranks: CompositionRank[]) => ({
  displayRanks: [...new Set(ranks.map((r) => r.rank))].sort(),
  displayOptions: [...new Set(ranks.map((r) => r.options))].sort((a, b) => a - b),
})

export const useCompositionStore = create<CompositionStore>((set, get) => ({
  compositions: [],
  loading: false,
  selectedId: null,
  ranks: [],
  rankLoading: false,
  displayRanks: [],
  displayOptions: [],

  fetchAll: async () => {
    set({ loading: true })
    try {
      const compositions = await compositionApi.listCompositions()
      set({ compositions })
    } finally {
      set({ loading: false })
    }
  },

  selectComposition: async (id) => {
    set({ selectedId: id, rankLoading: true, ranks: [], displayRanks: [], displayOptions: [] })
    try {
      const ranks = await compositionApi.getRanksByCompId(id)
      set({ ranks, ...deriveDisplay(ranks) })
    } finally {
      set({ rankLoading: false })
    }
  },

  createComposition: async (data) => {
    const created = await compositionApi.createComposition(data)
    set((s) => ({ compositions: [...s.compositions, created] }))
  },

  updateComposition: async (id, data) => {
    const updated = await compositionApi.updateComposition(id, data)
    set((s) => ({
      compositions: s.compositions.map((c) => (c.id === id ? updated : c)),
    }))
  },

  removeComposition: async (id) => {
    await compositionApi.deleteComposition(id)
    set((s) => ({
      compositions: s.compositions.filter((c) => c.id !== id),
      ...(s.selectedId === id ? { selectedId: null, ranks: [], displayRanks: [], displayOptions: [] } : {}),
    }))
  },

  setCell: async (rank, optionIdx, value) => {
    const { selectedId, ranks } = get()
    if (!selectedId) return

    const existing = ranks.find((r) => r.rank === rank && r.options === optionIdx)

    if (value !== null) {
      if (existing) {
        const updated = await compositionApi.updateRank(existing.id, { planValue: value })
        set((s) => ({ ranks: s.ranks.map((r) => (r.id === existing.id ? updated : r)) }))
      } else {
        const created = await compositionApi.createRank({
          compId: selectedId,
          rank,
          options: optionIdx,
          planValue: value,
          planValueExtra: 0,
        })
        set((s) => ({ ranks: [...s.ranks, created] }))
      }
    } else {
      if (existing) {
        await compositionApi.deleteRank(existing.id)
        set((s) => ({ ranks: s.ranks.filter((r) => r.id !== existing.id) }))
      }
      // null + no existing row = no-op
    }
  },

  addRank: (rankCode) => {
    const { displayRanks } = get()
    if (displayRanks.includes(rankCode)) return
    set((s) => ({ displayRanks: [...s.displayRanks, rankCode].sort() }))
  },

  deleteRank: async (rankCode) => {
    const { ranks } = get()
    const toDelete = ranks.filter((r) => r.rank === rankCode)
    await Promise.all(toDelete.map((r) => compositionApi.deleteRank(r.id)))
    set((s) => ({
      ranks: s.ranks.filter((r) => r.rank !== rankCode),
      displayRanks: s.displayRanks.filter((r) => r !== rankCode),
    }))
  },

  addOption: () => {
    const { displayOptions } = get()
    const nextIdx = displayOptions.length > 0 ? Math.max(...displayOptions) + 1 : 1
    set((s) => ({ displayOptions: [...s.displayOptions, nextIdx] }))
  },

  deleteOption: async (optionIdx) => {
    const { ranks } = get()
    const toDelete = ranks.filter((r) => r.options === optionIdx)
    await Promise.all(toDelete.map((r) => compositionApi.deleteRank(r.id)))
    set((s) => ({
      ranks: s.ranks.filter((r) => r.options !== optionIdx),
      displayOptions: s.displayOptions.filter((o) => o !== optionIdx),
    }))
  },
}))
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/stores/composition-store.ts
git commit -m "feat(gantt): add composition Zustand store with rank matrix operations"
```

---

## Task 9: Composition Tree Panel

**Files:**
- Create: `gantt/src/components/composition/composition-tree.tsx`

- [x] **Step 1: Create the tree component**

```typescript
// gantt/src/components/composition/composition-tree.tsx
import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'

interface Props {
  onAdd(): void
}

export const CompositionTree = ({ onAdd }: Props) => {
  const compositions = useCompositionStore((s) => s.compositions)
  const selectedId   = useCompositionStore((s) => s.selectedId)
  const selectComposition = useCompositionStore((s) => s.selectComposition)

  const [search, setSearch] = useState('')

  const filtered = compositions.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.division.toLowerCase().includes(search.toLowerCase())
  )

  // Group by division, then sort each group by displayOrder
  const byDivision = filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
    const div = c.division || 'Other'
    if (!acc[div]) acc[div] = []
    acc[div].push(c)
    return acc
  }, {})
  Object.values(byDivision).forEach((arr) =>
    arr.sort((a, b) => a.displayOrder - b.displayOrder)
  )
  const divisions = Object.keys(byDivision).sort()

  const isSby = (name: string) => name.toLowerCase().includes('sby')

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-card overflow-hidden">
      {/* Search + Add */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={onAdd}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex-shrink-0"
          title="New Composition"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {divisions.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No compositions</div>
        )}
        {divisions.map((div) => (
          <div key={div}>
            {/* Division header */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              <span>▾</span>
              <span>{div}</span>
            </div>
            {/* Composition items */}
            {byDivision[div].map((comp) => (
              <div
                key={comp.id}
                role="button"
                tabIndex={0}
                onClick={() => void selectComposition(comp.id)}
                className={[
                  'flex items-center gap-2 py-1.5 pl-7 pr-3 text-xs cursor-pointer border-l-2 transition-colors duration-100',
                  selectedId === comp.id
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-transparent text-foreground/70 hover:bg-accent/50 hover:text-foreground',
                ].join(' ')}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
                <span className="flex-1 truncate">{comp.name}</span>
                {isSby(comp.name) && (
                  <span className="ml-auto rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-400">
                    SBY
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/components/composition/composition-tree.tsx
git commit -m "feat(gantt): add composition tree panel"
```

---

## Task 10: Rank × Option Matrix

**Files:**
- Create: `gantt/src/components/composition/rank-option-matrix.tsx`

- [x] **Step 1: Create the matrix component**

```typescript
// gantt/src/components/composition/rank-option-matrix.tsx
import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { notify } from '@/utils/notify'

export const RankOptionMatrix = () => {
  const ranks         = useCompositionStore((s) => s.ranks)
  const displayRanks  = useCompositionStore((s) => s.displayRanks)
  const displayOptions = useCompositionStore((s) => s.displayOptions)
  const rankLoading   = useCompositionStore((s) => s.rankLoading)
  const setCell       = useCompositionStore((s) => s.setCell)
  const addRank       = useCompositionStore((s) => s.addRank)
  const deleteRank    = useCompositionStore((s) => s.deleteRank)
  const addOption     = useCompositionStore((s) => s.addOption)
  const deleteOption  = useCompositionStore((s) => s.deleteOption)

  // Which cell is being edited: "rank:optionIdx" key
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingKey) inputRef.current?.focus()
  }, [editingKey])

  const cellKey = (rank: string, opt: number) => `${rank}:${opt}`

  const getCellValue = (rank: string, opt: number): number | null => {
    const row = ranks.find((r) => r.rank === rank && r.options === opt)
    return row?.planValue ?? null
  }

  const startEdit = (rank: string, opt: number) => {
    const val = getCellValue(rank, opt)
    setEditingKey(cellKey(rank, opt))
    setEditVal(val !== null ? String(val) : '')
  }

  const commitEdit = async (rank: string, opt: number) => {
    setEditingKey(null)
    const parsed = editVal.trim() === '' ? null : parseInt(editVal, 10)
    const value = isNaN(parsed as number) ? null : parsed
    try {
      await setCell(rank, opt, value)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const handleAddRank = () => {
    const code = prompt('Rank code (e.g. CA, FO, FA):')
    if (!code?.trim()) return
    const upper = code.trim().toUpperCase()
    if (displayRanks.includes(upper)) {
      notify.error('Rank already exists')
      return
    }
    addRank(upper)
  }

  const handleDeleteRank = async (rank: string) => {
    if (!confirm(`Delete rank "${rank}"? All values for this rank will be removed.`)) return
    try {
      await deleteRank(rank)
      notify.success(`Rank ${rank} deleted`)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleDeleteOption = async (optIdx: number) => {
    if (!confirm(`Delete option ${optIdx}?`)) return
    try {
      await deleteOption(optIdx)
      notify.success('Option deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (rankLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading ranks…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{displayOptions.length}</strong> options ·{' '}
          <strong className="text-foreground">{displayRanks.length}</strong> ranks
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleAddRank}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" /> Add Rank
          </button>
          <button
            onClick={addOption}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" /> Add Option
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {displayRanks.length === 0 && displayOptions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No ranks defined. Click "Add Rank" to start.
          </div>
        ) : (
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {/* Option label col */}
                <th className="sticky left-0 z-20 border border-border bg-card px-4 py-2 text-left text-[10px] font-bold text-muted-foreground whitespace-nowrap min-w-[80px]">
                  Option
                </th>
                {/* Rank columns */}
                {displayRanks.map((rank) => (
                  <th key={rank} className="group border border-border bg-card px-3 py-2 text-center min-w-[80px] whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-[11px] font-bold text-primary">{rank}</span>
                      <button
                        onClick={() => void handleDeleteRank(rank)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        title={`Delete rank ${rank}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayOptions.map((optIdx) => (
                <tr key={optIdx} className="group/row">
                  {/* Option label */}
                  <td className="sticky left-0 z-10 border border-border bg-card/90 px-4 py-1 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>Option {optIdx}</span>
                      <button
                        onClick={() => void handleDeleteOption(optIdx)}
                        className="opacity-0 group-hover/row:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        title="Delete option"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  {/* Rank cells */}
                  {displayRanks.map((rank) => {
                    const key = cellKey(rank, optIdx)
                    const val = getCellValue(rank, optIdx)
                    const isEditing = editingKey === key

                    return (
                      <td
                        key={rank}
                        className="border border-border/60 text-center hover:bg-primary/5 cursor-pointer"
                        onClick={() => !isEditing && startEdit(rank, optIdx)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number"
                            min={0}
                            max={99}
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => void commitEdit(rank, optIdx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitEdit(rank, optIdx)
                              if (e.key === 'Escape') setEditingKey(null)
                              e.stopPropagation()
                            }}
                            className="w-16 rounded border border-primary bg-background px-2 py-1 text-center text-sm font-bold text-foreground focus:outline-none"
                          />
                        ) : val !== null ? (
                          <span className="block px-3 py-2 text-sm font-bold text-foreground">{val}</span>
                        ) : (
                          <span className="flex items-center justify-center px-3 py-2">
                            <span className="h-3.5 w-3.5 rounded border border-dashed border-muted-foreground/40 opacity-50" />
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 border-t border-border px-4 py-1.5 text-[10px] text-muted-foreground/60">
        <span className="mr-1 inline-block h-3 w-3 rounded border border-dashed border-current align-middle" />
        Empty = rank not included in this option's plan
      </div>
    </div>
  )
}
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/components/composition/rank-option-matrix.tsx
git commit -m "feat(gantt): add dynamic rank×option matrix with inline editing"
```

---

## Task 11: Composition Detail Panel

**Files:**
- Create: `gantt/src/components/composition/composition-detail.tsx`

- [x] **Step 1: Create the detail component**

```typescript
// gantt/src/components/composition/composition-detail.tsx
import { useState } from 'react'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { RankOptionMatrix } from './rank-option-matrix'
import { notify } from '@/utils/notify'
import type { CreateCompositionData } from '@/types/composition'

export const CompositionDetail = () => {
  const compositions       = useCompositionStore((s) => s.compositions)
  const selectedId         = useCompositionStore((s) => s.selectedId)
  const updateComposition  = useCompositionStore((s) => s.updateComposition)
  const removeComposition  = useCompositionStore((s) => s.removeComposition)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<CreateCompositionData>>({})
  const [saving, setSaving] = useState(false)

  const comp = compositions.find((c) => c.id === selectedId)

  if (!comp) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Select a composition from the tree
      </div>
    )
  }

  const hierarchyLabel = comp.hierarchy === 2 ? 'Enhanced (L2)' : 'Standard (L1)'

  const startEdit = () => {
    setForm({
      name: comp.name,
      nameDesc: comp.nameDesc ?? '',
      division: comp.division,
      displayOrder: comp.displayOrder,
      hierarchy: comp.hierarchy ?? 1,
      filiale: comp.filiale ?? undefined,
    })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim() || !form.division?.trim()) {
      notify.error('Name and Division are required')
      return
    }
    setSaving(true)
    try {
      await updateComposition(comp.id, {
        ...form,
        nameDesc: form.nameDesc || null,
      })
      notify.success('Composition updated')
      setEditing(false)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete composition "${comp.name}"? This cannot be undone.`)) return
    try {
      await removeComposition(comp.id)
      notify.success('Composition deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const inputCls = 'h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none'
  const cellLabel = 'bg-card/50 px-3 py-2 text-[10px] font-semibold text-muted-foreground border-r border-border flex items-center min-w-[90px]'
  const cellValue = 'px-3 py-2 text-xs text-foreground flex items-center'

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* ── Header info ── */}
      <div className="flex-shrink-0 border-b border-border">
        {/* Title row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <span className="text-sm font-bold text-foreground">{comp.name}</span>
          <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-400">
            {hierarchyLabel}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex h-7 items-center gap-1 rounded bg-primary px-2.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex h-7 items-center gap-1 rounded bg-destructive/10 px-2.5 text-xs text-destructive hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-4 border-b border-border">
          {/* Row 1 */}
          <div className="flex border-r border-border">
            <div className={cellLabel}>Name</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                : comp.name}
            </div>
          </div>
          <div className="flex border-r border-border">
            <div className={cellLabel}>Division</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.division ?? ''} onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))} />
                : comp.division}
            </div>
          </div>
          <div className="flex border-r border-border">
            <div className={cellLabel}>Display Order</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} type="number" value={form.displayOrder ?? ''} onChange={(e) => setForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
                : comp.displayOrder}
            </div>
          </div>
          <div className="flex">
            <div className={cellLabel}>Hierarchy</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? (
                  <select className={inputCls} value={form.hierarchy ?? 1} onChange={(e) => setForm((f) => ({ ...f, hierarchy: parseInt(e.target.value) }))}>
                    <option value={1}>1 — Standard</option>
                    <option value={2}>2 — Enhanced</option>
                  </select>
                )
                : hierarchyLabel}
            </div>
          </div>

          {/* Row 2 */}
          <div className="col-span-4 flex border-t border-border">
            <div className={cellLabel}>Description</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.nameDesc ?? ''} onChange={(e) => setForm((f) => ({ ...f, nameDesc: e.target.value }))} placeholder="Optional description" />
                : (comp.nameDesc ?? '—')}
            </div>
          </div>
        </div>
      </div>

      {/* ── Rank × Option matrix ── */}
      <RankOptionMatrix />
    </div>
  )
}
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/components/composition/composition-detail.tsx
git commit -m "feat(gantt): add composition detail panel with inline edit and rank matrix"
```

---

## Task 12: Composition Create Dialog

**Files:**
- Create: `gantt/src/components/composition/composition-create-dialog.tsx`

- [x] **Step 1: Create the dialog**

```typescript
// gantt/src/components/composition/composition-create-dialog.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { notify } from '@/utils/notify'

interface Props {
  open: boolean
  onClose(): void
}

export const CompositionCreateDialog = ({ open, onClose }: Props) => {
  const createComposition = useCompositionStore((s) => s.createComposition)
  const selectComposition = useCompositionStore((s) => s.selectComposition)

  const [name, setName] = useState('')
  const [division, setDivision] = useState('')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [hierarchy, setHierarchy] = useState('1')
  const [nameDesc, setNameDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setDivision(''); setDisplayOrder('1'); setHierarchy('1'); setNameDesc('') }

  const handleSubmit = async () => {
    if (!name.trim() || !division.trim()) {
      notify.error('Name and Division are required')
      return
    }
    setSaving(true)
    try {
      await createComposition({
        name: name.trim(),
        division: division.trim(),
        displayOrder: parseInt(displayOrder) || 1,
        hierarchy: parseInt(hierarchy) || 1,
        nameDesc: nameDesc.trim() || null,
      })
      notify.success('Composition created')
      reset()
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const inputCls = 'h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none'
  const labelCls = 'block text-[10px] font-semibold text-muted-foreground mb-1'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold">New Composition</span>
          <button onClick={() => { reset(); onClose() }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Double" />
          </div>
          <div>
            <label className={labelCls}>Division *</label>
            <input className={inputCls} value={division} onChange={(e) => setDivision(e.target.value)} placeholder="P / C" />
          </div>
          <div>
            <label className={labelCls}>Display Order</label>
            <input className={inputCls} type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Hierarchy</label>
            <select className={inputCls} value={hierarchy} onChange={(e) => setHierarchy(e.target.value)}>
              <option value="1">1 — Standard</option>
              <option value="2">2 — Enhanced</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={nameDesc} onChange={(e) => setNameDesc(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={() => { reset(); onClose() }} className="px-4 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Type-check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```

- [x] **Step 3: Commit**

```bash
git add gantt/src/components/composition/composition-create-dialog.tsx
git commit -m "feat(gantt): add composition create dialog"
```

---

## Task 13: Wire Composition View (Final)

**Files:**
- Modify: `gantt/src/components/composition/composition-view.tsx` (replace stub)

- [x] **Step 1: Replace the stub with the full wired view**

```typescript
// gantt/src/components/composition/composition-view.tsx
import { useEffect, useState } from 'react'
import { useCompositionStore } from '@/stores/composition-store'
import { CompositionTree } from './composition-tree'
import { CompositionDetail } from './composition-detail'
import { CompositionCreateDialog } from './composition-create-dialog'

export const CompositionView = () => {
  const fetchAll = useCompositionStore((s) => s.fetchAll)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  return (
    <div className="flex h-full overflow-hidden">
      <CompositionTree onAdd={() => setCreateOpen(true)} />
      <CompositionDetail />
      <CompositionCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
```

- [x] **Step 2: Final type-check — must be clean**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [x] **Step 3: Full build**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npm run build 2>&1 | tail -20
```

Expected: `✓ built in X.XXs` — no errors.

- [x] **Step 4: End-to-end browser test**

Start the dev server (`npm run dev` in `gantt/`) and verify:

1. **Sidebar:** Rule tab shows three items. Clicking each switches the right panel.
2. **Rule Manager:** Existing rule management is unchanged.
3. **Composition Load:**
   - Table loads data from `GET /api/composition/load`
   - Filter inputs narrow the rows in real time
   - Reset clears all filters
   - Add button opens dialog; fill required fields; Save calls `POST` and row appears
   - Edit button pre-fills dialog; Save calls `PUT`; Del button calls `DELETE` after confirm
4. **Composition:**
   - Tree shows divisions and composition names from `GET /api/composition`
   - Clicking a name loads ranks (`GET /api/composition/rank/comp/:id`) and shows the matrix
   - Matrix shows rank columns and option rows; null cells show dashed placeholder
   - Clicking a cell opens inline input; Enter commits (`POST` or `PUT`); clearing and Enter removes (`DELETE`)
   - Add Rank prompts for code, adds a column with all-null cells
   - Hover on column header shows delete ✕; click deletes all rows for that rank
   - Add Option appends a new row
   - Hover on option row shows delete ✕; click removes all rows for that option index
   - ✚ button opens Create dialog; fill form; Create adds a new leaf in the tree
   - Edit button shows inline form in header; Save updates; Delete removes with confirm

- [x] **Step 5: Commit**

```bash
git add gantt/src/components/composition/composition-view.tsx
git commit -m "feat(gantt): wire Composition view — tree + detail + rank matrix complete"
```

- [x] **Step 6: Final push**

```bash
git push
```

---

## Known Deferred Items

- **Column-config toggle** (hide/show table columns): `ColumnConfigDialog` reuse is out of scope for this plan; all columns are always visible.
- **"More" filter expansion** (Service Type, Segment Type, Effective Date range): the filter bar covers the 7 most common fields. Expanding to all fields is a follow-up task.
- **Refresh Log** button: UI present but wired to the same `fetchAll` call; audit log feature is out of scope.

---

## Self-Review Checklist

| Spec Section | Covered By |
|---|---|
| 2.1 Shell store `ActiveRuleItem` | Task 3 |
| 2.2 Sidebar three items | Task 4 |
| 2.3 RuleView switch | Task 5 |
| 3.2 Filter bar (2 rows) | Task 7 |
| 3.3 Table columns (all 22) | Task 7 |
| 3.4 Add/Edit dialog | Task 7 |
| 3.5 Delete with confirm | Task 7 |
| 4.2 Tree grouped by division, SBY badge | Task 9 |
| 4.3 Header info grid + Edit + Delete | Task 11 |
| 4.4 Null cell = no DB row | Tasks 8, 10 |
| 4.4 Add/Delete Rank | Tasks 8, 10 |
| 4.4 Add/Delete Option | Tasks 8, 10 |
| 4.4 Inline cell editing (upsert/delete) | Tasks 8, 10 |
| 5 API — no backend changes | Tasks 1–2 (frontend only) |
| Create new composition | Task 12 |
