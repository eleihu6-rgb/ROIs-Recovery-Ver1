# Gantt Filter System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text filter dialog with a three-tab (Crew / Pairing / Flight) multi-select dialog, add per-pane quick filter chips in PaneToolbar Row 1, and update GanttSubToolbar to show an amber Filter button with active-count badge and match pills.

**Architecture:** FilterStore restructures from flat fields to three namespaced sub-objects (`crew`, `pairing`, `flight`). A new ReferenceStore loads base/rank/fleet options from the API once per session. The FilterDialog becomes a tabbed modal with searchable multi-select dropdowns. Per-pane quick filter is client-side only (no API refetch) with chips rendered inline in PaneToolbar Row 1.

**Tech Stack:** React 19 + Zustand + Tailwind CSS v4 + `@rois/ui` (Popover, Button, Input, Badge), TypeScript. Existing `pairingApi.list()` and `flightApi.list()` already support single-value filter params; multi-select arrays pass the first element for Phase 1.

---

## File Map

| Action | File |
|--------|------|
| Create | `gantt/src/services/reference-api.ts` |
| Create | `gantt/src/stores/reference-store.ts` |
| Create | `gantt/src/components/common/multi-select-dropdown.tsx` |
| Create | `gantt/src/components/panes/pane-quick-filter.tsx` |
| Rewrite | `gantt/src/stores/filter-store.ts` |
| Modify | `gantt/src/stores/pairing-store.ts` |
| Modify | `gantt/src/stores/flight-store.ts` |
| Modify | `gantt/src/stores/gantt-view-store.ts` |
| Rewrite | `gantt/src/components/layout/filter-dialog.tsx` |
| Modify | `gantt/src/components/shell/gantt-sub-toolbar.tsx` |
| Modify | `gantt/src/components/panes/pane-toolbar.tsx` |
| Modify | `gantt/src/components/panes/roster-pane.tsx` |
| Modify | `gantt/src/components/panes/pairing-pane.tsx` |
| Modify | `gantt/src/components/panes/flight-pane.tsx` |
| Modify | `gantt/src/version.ts` |
| Delete | `gantt/src/components/crew/crew-filter.tsx` |
| Delete | `gantt/src/components/layout/sidebar.tsx` |

---

## Task 1: Reference API + Store

**Files:**
- Create: `gantt/src/services/reference-api.ts`
- Create: `gantt/src/stores/reference-store.ts`

---

- [ ] **Step 1: Create reference-api.ts**

```typescript
// gantt/src/services/reference-api.ts
import { api } from './api'

export interface BaseOption {
  id: number
  base: string
  name: string | null
  filiale: string
  isPrimeDisplayBase: number
  displayOrder: number
}

export interface RankOption {
  id: number
  rank: string
  division: string
  description: string | null
  displayOrder: number
  isCrewRank: number
}

export interface FleetOption {
  id: number
  fleet: string
  description: string | null
  fleetGrp: string
  acType: string
  displayOrder: number
}

export const referenceApi = {
  async listBases(): Promise<BaseOption[]> {
    const result = await api.get('/api/base') as { code: number; data: BaseOption[] }
    return result.data ?? []
  },

  async listRanks(): Promise<RankOption[]> {
    const result = await api.get('/api/rank') as { code: number; data: RankOption[] }
    return result.data ?? []
  },

  async listFleets(): Promise<FleetOption[]> {
    const result = await api.get('/api/fleet') as { code: number; data: FleetOption[] }
    return result.data ?? []
  },
}
```

- [ ] **Step 2: Create reference-store.ts**

```typescript
// gantt/src/stores/reference-store.ts
import { create } from 'zustand'
import { referenceApi, type BaseOption, type RankOption, type FleetOption } from '@/services/reference-api'

interface ReferenceStore {
  bases: BaseOption[]
  ranks: RankOption[]
  fleets: FleetOption[]
  loading: boolean
  loaded: boolean
  load: () => Promise<void>
}

export const useReferenceStore = create<ReferenceStore>((set, get) => ({
  bases: [],
  ranks: [],
  fleets: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const [bases, ranks, fleets] = await Promise.all([
        referenceApi.listBases(),
        referenceApi.listRanks(),
        referenceApi.listFleets(),
      ])
      set({ bases, ranks, fleets, loaded: true })
    } catch {
      // non-fatal — dropdowns will be empty
    } finally {
      set({ loading: false })
    }
  },
}))
```

- [ ] **Step 3: Run tsc to verify**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add gantt/src/services/reference-api.ts gantt/src/stores/reference-store.ts
git commit -m "feat(gantt): add reference store for base/rank/fleet dropdown options"
```

---

## Task 2: FilterStore Restructure

**Files:**
- Rewrite: `gantt/src/stores/filter-store.ts`

Note: `loadFromStorage` is called in `app-shell.tsx`; must preserve that function name. localStorage key changes from `gantt-filter` to `gantt-filter-v2` to avoid corrupt reads from old format.

---

- [ ] **Step 1: Rewrite filter-store.ts**

```typescript
// gantt/src/stores/filter-store.ts
import { create } from 'zustand'
import { startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'

const STORAGE_KEY = 'gantt-filter-v2'

const today = new Date()
const defaultStart = startOfMonth(subMonths(today, 1))
const defaultEnd = endOfMonth(addMonths(today, 1))

export interface CrewFilter {
  divisions: string[]   // 'P' | 'C'
  bases: string[]
  ranks: string[]
  fleets: string[]
}

export interface PairingFilter {
  bases: string[]
  fleets: string[]
  divisions: string[]
  depArps: string[]
  isFull: boolean | null
}

export interface FlightFilter {
  depArps: string[]
  arvArps: string[]
  fltNums: string[]
  fleets: string[]
  statuses: string[]
}

const DEFAULT_CREW_FILTER: CrewFilter = { divisions: [], bases: [], ranks: [], fleets: [] }
const DEFAULT_PAIRING_FILTER: PairingFilter = { bases: [], fleets: [], divisions: [], depArps: [], isFull: null }
const DEFAULT_FLIGHT_FILTER: FlightFilter = { depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [] }

interface FilterStore {
  dateRange: { start: Date; end: Date }
  ruleSetCode: string
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter

  setDateRange: (start: Date, end: Date) => void
  setRuleSetCode: (code: string) => void
  setCrewFilter: (filter: Partial<CrewFilter>) => void
  setPairingFilter: (filter: Partial<PairingFilter>) => void
  setFlightFilter: (filter: Partial<FlightFilter>) => void
  resetFilters: () => void
  loadFromStorage: () => void
  saveToStorage: () => void

  /** Total number of active filter chips across all tiers */
  activeFilterCount: () => number
}

interface StoredFilters {
  dateRange: { start: string; end: string }
  ruleSetCode: string
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  dateRange: { start: defaultStart, end: defaultEnd },
  ruleSetCode: '',
  crew: DEFAULT_CREW_FILTER,
  pairing: DEFAULT_PAIRING_FILTER,
  flight: DEFAULT_FLIGHT_FILTER,

  setDateRange: (start, end) => {
    set({ dateRange: { start, end } })
    get().saveToStorage()
  },

  setRuleSetCode: (code) => {
    set({ ruleSetCode: code })
    get().saveToStorage()
  },

  setCrewFilter: (filter) => {
    set((s) => ({ crew: { ...s.crew, ...filter } }))
    get().saveToStorage()
  },

  setPairingFilter: (filter) => {
    set((s) => ({ pairing: { ...s.pairing, ...filter } }))
    get().saveToStorage()
  },

  setFlightFilter: (filter) => {
    set((s) => ({ flight: { ...s.flight, ...filter } }))
    get().saveToStorage()
  },

  resetFilters: () => {
    set({
      crew: DEFAULT_CREW_FILTER,
      pairing: DEFAULT_PAIRING_FILTER,
      flight: DEFAULT_FLIGHT_FILTER,
    })
    get().saveToStorage()
  },

  activeFilterCount: () => {
    const { crew, pairing, flight } = get()
    let count = 0
    count += crew.divisions.length + crew.bases.length + crew.ranks.length + crew.fleets.length
    count += pairing.bases.length + pairing.fleets.length + pairing.divisions.length + pairing.depArps.length
    if (pairing.isFull !== null) count++
    count += flight.depArps.length + flight.arvArps.length + flight.fltNums.length + flight.fleets.length + flight.statuses.length
    return count
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored: StoredFilters = JSON.parse(raw)
      const start = new Date(stored.dateRange.start)
      const end = new Date(stored.dateRange.end)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return
      set({
        dateRange: { start, end },
        ruleSetCode: stored.ruleSetCode ?? '',
        crew: { ...DEFAULT_CREW_FILTER, ...(stored.crew ?? {}) },
        pairing: { ...DEFAULT_PAIRING_FILTER, ...(stored.pairing ?? {}) },
        flight: { ...DEFAULT_FLIGHT_FILTER, ...(stored.flight ?? {}) },
      })
    } catch {
      // ignore corrupt data
    }
  },

  saveToStorage: () => {
    try {
      const s = get()
      const stored: StoredFilters = {
        dateRange: {
          start: s.dateRange.start.toISOString(),
          end: s.dateRange.end.toISOString(),
        },
        ruleSetCode: s.ruleSetCode,
        crew: s.crew,
        pairing: s.pairing,
        flight: s.flight,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // ignore storage full
    }
  },
}))
```

- [ ] **Step 2: Fix broken references in rule-group-selector.tsx and anywhere that reads old FilterStore fields**

The old fields `ranks`, `crewBases`, `fleets`, `crewFleets`, `flightFleets`, `setFilter` no longer exist. Search and fix:

```bash
cd /home/yuan.z/rois/rois-ai/gantt && grep -rn "filterStore\.ranks\|filterStore\.crewBases\|filterStore\.fleets\|filterStore\.crewFleets\|filterStore\.flightFleets\|filterStore\.setFilter\|useFilterStore.*ranks\|useFilterStore.*crewBases" src/ --include="*.tsx" --include="*.ts" | grep -v "filter-store"
```

For any hits, update them to use the new namespaced fields. The `ruleSetCode` read in `RuleGroupSelector` remains the same, but `setFilter('ruleSetCode', ...)` becomes `setRuleSetCode(...)`.

```bash
grep -rn "setFilter.*ruleSetCode\|useFilterStore.*ruleSetCode" gantt/src/ --include="*.tsx" --include="*.ts"
```

Update `rule-group-selector.tsx`:
```diff
- const setFilter = useFilterStore((s) => s.setFilter)
- setFilter('ruleSetCode', newCode)
+ const setRuleSetCode = useFilterStore((s) => s.setRuleSetCode)
+ setRuleSetCode(newCode)
```

- [ ] **Step 3: Run tsc to verify**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/stores/filter-store.ts gantt/src/
git commit -m "feat(gantt): restructure FilterStore to crew/pairing/flight namespaces"
```

---

## Task 3: MultiSelectDropdown Component

**Files:**
- Create: `gantt/src/components/common/multi-select-dropdown.tsx`

---

- [ ] **Step 1: Create multi-select-dropdown.tsx**

```typescript
// gantt/src/components/common/multi-select-dropdown.tsx
import { useState, useMemo } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@rois/ui'

export interface SelectOption {
  value: string
  label: string
}

interface MultiSelectDropdownProps {
  label: string
  options: SelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
}

export const MultiSelectDropdown = ({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All',
  className = '',
}: MultiSelectDropdownProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.value.toLowerCase().includes(search.toLowerCase()),
      ),
    [options, search],
  )

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(', ')
        : `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`

  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <span className="mt-1.5 w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex h-7 min-w-[120px] items-center justify-between gap-1 rounded-md border bg-background px-2 text-xs text-foreground transition-colors hover:bg-accent/60"
              type="button"
            >
              <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>{displayText}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" align="start">
            <div className="border-b px-2 py-1.5">
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">No options</div>
              )}
              {filtered.map((o) => {
                const isSelected = selected.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1 text-xs hover:bg-accent/60"
                    onClick={() => toggle(o.value)}
                  >
                    <div
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <span>{o.label}</span>
                  </button>
                )
              })}
            </div>
            {selected.length > 0 && (
              <div className="border-t px-2 py-1">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onChange([])}
                >
                  Clear all
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Inline chips for selected values */}
        {selected.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
          >
            {v}
            <button
              type="button"
              className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm hover:bg-primary/20"
              onClick={() => toggle(v)}
            >
              <X className="h-2 w-2" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/common/multi-select-dropdown.tsx
git commit -m "feat(gantt): add MultiSelectDropdown component for filter dialog"
```

---

## Task 4: FilterDialog Rewrite

**Files:**
- Rewrite: `gantt/src/components/layout/filter-dialog.tsx`

This is a full rewrite as a three-tab dialog (Crew / Pairing / Flight) matching the design spec.

---

- [ ] **Step 1: Rewrite filter-dialog.tsx**

```typescript
// gantt/src/components/layout/filter-dialog.tsx
import { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Filter } from 'lucide-react'
import { Button } from '@rois/ui'
import { useFilterStore, type CrewFilter, type PairingFilter, type FlightFilter } from '@/stores/filter-store'
import { useReferenceStore } from '@/stores/reference-store'
import { MultiSelectDropdown, type SelectOption } from '@/components/common/multi-select-dropdown'

interface FilterDialogProps {
  open: boolean
  onClose: () => void
  onApply: () => void
}

type TabId = 'crew' | 'pairing' | 'flight'

const TAB_COLORS: Record<TabId, string> = {
  crew: '#3b82f6',
  pairing: '#22c55e',
  flight: '#a855f7',
}

const DIVISION_OPTIONS: SelectOption[] = [
  { value: 'P', label: 'P — Pilot' },
  { value: 'C', label: 'C — Cabin' },
]

const FLIGHT_STATUS_OPTIONS: SelectOption[] = [
  { value: 'full', label: 'Full' },
  { value: 'partial', label: 'Partial' },
  { value: 'open', label: 'Open' },
]

export const FilterDialog = ({ open, onClose, onApply }: FilterDialogProps) => {
  const filterStore = useFilterStore()
  const refStore = useReferenceStore()
  const [activeTab, setActiveTab] = useState<TabId>('crew')

  // Local state mirrors FilterStore during editing
  const [localCrew, setLocalCrew] = useState<CrewFilter>(() => filterStore.crew)
  const [localPairing, setLocalPairing] = useState<PairingFilter>(() => filterStore.pairing)
  const [localFlight, setLocalFlight] = useState<FlightFilter>(() => filterStore.flight)

  // Load reference data when dialog opens
  useEffect(() => {
    if (open) {
      refStore.load()
      setLocalCrew(filterStore.crew)
      setLocalPairing(filterStore.pairing)
      setLocalFlight(filterStore.flight)
    }
  }, [open])

  const baseOptions = useMemo<SelectOption[]>(
    () => refStore.bases.map((b) => ({ value: b.base, label: `${b.base}${b.name ? ` — ${b.name}` : ''}` })),
    [refStore.bases],
  )

  const rankOptions = useMemo<SelectOption[]>(
    () => refStore.ranks.filter((r) => r.isCrewRank === 1).map((r) => ({ value: r.rank, label: `${r.rank}${r.description ? ` — ${r.description}` : ''}` })),
    [refStore.ranks],
  )

  const fleetOptions = useMemo<SelectOption[]>(
    () => refStore.fleets.map((f) => ({ value: f.fleet, label: `${f.fleet}${f.description ? ` — ${f.description}` : ''}` })),
    [refStore.fleets],
  )

  const handleApply = useCallback(() => {
    filterStore.setCrewFilter(localCrew)
    filterStore.setPairingFilter(localPairing)
    filterStore.setFlightFilter(localFlight)
    onApply()
    onClose()
  }, [localCrew, localPairing, localFlight, filterStore, onApply, onClose])

  const handleReset = useCallback(() => {
    setLocalCrew({ divisions: [], bases: [], ranks: [], fleets: [] })
    setLocalPairing({ bases: [], fleets: [], divisions: [], depArps: [], isFull: null })
    setLocalFlight({ depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [] })
  }, [])

  const activeFilterCount =
    localCrew.divisions.length + localCrew.bases.length + localCrew.ranks.length + localCrew.fleets.length +
    localPairing.bases.length + localPairing.fleets.length + localPairing.divisions.length + localPairing.depArps.length +
    (localPairing.isFull !== null ? 1 : 0) +
    localFlight.depArps.length + localFlight.arvArps.length + localFlight.fltNums.length + localFlight.fleets.length + localFlight.statuses.length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[540px] overflow-hidden rounded-lg border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Filter className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Filters</div>
            <div className="text-[11px] text-muted-foreground">
              {activeFilterCount === 0 ? 'No active filters' : `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`}
            </div>
          </div>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b bg-muted/20 px-4">
          {(['crew', 'pairing', 'flight'] as TabId[]).map((tab) => {
            const tabCount =
              tab === 'crew'
                ? localCrew.divisions.length + localCrew.bases.length + localCrew.ranks.length + localCrew.fleets.length
                : tab === 'pairing'
                  ? localPairing.bases.length + localPairing.fleets.length + localPairing.divisions.length + localPairing.depArps.length + (localPairing.isFull !== null ? 1 : 0)
                  : localFlight.depArps.length + localFlight.arvArps.length + localFlight.fltNums.length + localFlight.fleets.length + localFlight.statuses.length
            return (
              <button
                key={tab}
                type="button"
                className={[
                  'relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors',
                  activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={() => setActiveTab(tab)}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: TAB_COLORS[tab] }}
                />
                <span className="capitalize">{tab}</span>
                {tabCount > 0 && (
                  <span
                    className="rounded-full px-1 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: TAB_COLORS[tab] }}
                  >
                    {tabCount}
                  </span>
                )}
                {activeTab === tab && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                    style={{ backgroundColor: TAB_COLORS[tab] }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="space-y-3 p-4 pb-5">
          {activeTab === 'crew' && (
            <>
              {/* Division chips */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Division</span>
                <div className="flex gap-1">
                  {DIVISION_OPTIONS.map((opt) => {
                    const active = localCrew.divisions.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={[
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                        ].join(' ')}
                        onClick={() => {
                          const next = active
                            ? localCrew.divisions.filter((d) => d !== opt.value)
                            : [...localCrew.divisions, opt.value]
                          setLocalCrew((c) => ({ ...c, divisions: next }))
                        }}
                      >
                        {opt.value}
                      </button>
                    )
                  })}
                </div>
              </div>

              <MultiSelectDropdown
                label="Base"
                options={baseOptions}
                selected={localCrew.bases}
                onChange={(v) => setLocalCrew((c) => ({ ...c, bases: v }))}
                placeholder="All bases"
              />
              <MultiSelectDropdown
                label="Rank"
                options={rankOptions}
                selected={localCrew.ranks}
                onChange={(v) => setLocalCrew((c) => ({ ...c, ranks: v }))}
                placeholder="All ranks"
              />
              <MultiSelectDropdown
                label="Fleet"
                options={fleetOptions}
                selected={localCrew.fleets}
                onChange={(v) => setLocalCrew((c) => ({ ...c, fleets: v }))}
                placeholder="All fleets"
              />
            </>
          )}

          {activeTab === 'pairing' && (
            <>
              <MultiSelectDropdown
                label="Base"
                options={baseOptions}
                selected={localPairing.bases}
                onChange={(v) => setPairingField('bases', v)}
                placeholder="All bases"
              />
              <MultiSelectDropdown
                label="Fleet"
                options={fleetOptions}
                selected={localPairing.fleets}
                onChange={(v) => setPairingField('fleets', v)}
                placeholder="All fleets"
              />
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Division</span>
                <div className="flex gap-1">
                  {DIVISION_OPTIONS.map((opt) => {
                    const active = localPairing.divisions.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={[
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                        ].join(' ')}
                        onClick={() => {
                          const next = active
                            ? localPairing.divisions.filter((d) => d !== opt.value)
                            : [...localPairing.divisions, opt.value]
                          setLocalPairing((p) => ({ ...p, divisions: next }))
                        }}
                      >
                        {opt.value}
                      </button>
                    )
                  })}
                </div>
              </div>
              <PairingDepArpField value={localPairing.depArps} onChange={(v) => setPairingField('depArps', v)} />
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">Crewing</span>
                <div className="flex gap-1">
                  {[
                    { value: null, label: 'All' },
                    { value: true, label: 'Full' },
                    { value: false, label: 'Partial' },
                  ].map((opt) => {
                    const active = localPairing.isFull === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        className={[
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                        ].join(' ')}
                        onClick={() => setLocalPairing((p) => ({ ...p, isFull: opt.value }))}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'flight' && (
            <>
              <AirportField label="Dep Airport" value={localFlight.depArps} onChange={(v) => setFlightField('depArps', v)} />
              <AirportField label="Arr Airport" value={localFlight.arvArps} onChange={(v) => setFlightField('arvArps', v)} />
              <TextChipField label="Flight #" value={localFlight.fltNums} onChange={(v) => setFlightField('fltNums', v)} placeholder="e.g. 1001" />
              <MultiSelectDropdown
                label="Fleet"
                options={fleetOptions}
                selected={localFlight.fleets}
                onChange={(v) => setFlightField('fleets', v)}
                placeholder="All fleets"
              />
              <MultiSelectDropdown
                label="Status"
                options={FLIGHT_STATUS_OPTIONS}
                selected={localFlight.statuses}
                onChange={(v) => setFlightField('statuses', v)}
                placeholder="All statuses"
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={handleReset}
          >
            Reset all
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleApply}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  )

  function setPairingField<K extends keyof PairingFilter>(key: K, value: PairingFilter[K]) {
    setLocalPairing((p) => ({ ...p, [key]: value }))
  }

  function setFlightField<K extends keyof FlightFilter>(key: K, value: FlightFilter[K]) {
    setLocalFlight((f) => ({ ...f, [key]: value }))
  }
}

/** Simple airport code input that adds chips on Enter / comma */
function AirportField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return <TextChipField label={label} value={value} onChange={onChange} placeholder="e.g. YYZ" transform={(s) => s.toUpperCase()} />
}

function PairingDepArpField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <TextChipField label="Dep Airport" value={value} onChange={onChange} placeholder="e.g. YYZ" transform={(s) => s.toUpperCase()} />
}

/** Text input that adds values to a chip list on Enter */
function TextChipField({
  label,
  value,
  onChange,
  placeholder = '',
  transform,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  transform?: (s: string) => string
}) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = transform ? transform(input.trim()) : input.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setInput('')
  }

  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        <input
          className="h-7 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          style={{ width: '120px' }}
        />
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            {v}
            <button
              type="button"
              className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm hover:bg-primary/20"
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              <X className="h-2 w-2" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/layout/filter-dialog.tsx
git commit -m "feat(gantt): rewrite FilterDialog as three-tab multi-select dialog (Crew/Pairing/Flight)"
```

---

## Task 5: GanttSubToolbar Update

**Files:**
- Modify: `gantt/src/components/shell/gantt-sub-toolbar.tsx`

Changes: read `activeFilterCount` from FilterStore; amber Filter button when count > 0; match pills after the Filter button showing loaded/unfiltered counts from roster/pairing/flight stores.

---

- [ ] **Step 1: Update gantt-sub-toolbar.tsx**

Replace the `FilterDialog` import line and the filter-related section. The `onApply` callback in `FilterDialog` will call `refreshAllPanes`.

```typescript
// gantt/src/components/shell/gantt-sub-toolbar.tsx
import { useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rois/ui'
import {
  RefreshCw,
  Filter, Keyboard, SquarePlus,
} from 'lucide-react'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { ZoomControl } from '@/components/common/zoom-control'
import { RuleGroupSelector } from '@/components/common/rule-group-selector'
import { TimezoneSwitcher } from '@/components/common/timezone-switcher'
import { DraftToolbar } from '@/components/roster/draft-toolbar'
import { FilterDialog } from '@/components/layout/filter-dialog'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useFilterStore } from '@/stores/filter-store'
import { useRosterStore } from '@/stores/roster-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useFlightStore } from '@/stores/flight-store'
import { PANE_COLORS, PANE_NAMES, type PaneType } from '@/types/layout'

const ToolbarDivider = () => (
  <div className="mx-1.5 h-4 w-px bg-border/60" />
)

const ToolBtn = ({
  tip, onClick, disabled, active, amber, children,
}: {
  tip: string; onClick?: () => void; disabled?: boolean; active?: boolean; amber?: boolean; children: ReactNode
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
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
  </Tooltip>
)

const MAX_PANES = 4

export const GanttSubToolbar = () => {
  const [filterOpen, setFilterOpen] = useState(false)
  const openShortcuts = useUiStore((s) => s.openShortcuts)
  const openGroundTaskCreate = useUiStore((s) => s.openGroundTaskCreate)
  const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
  const refreshing = useGanttViewStore((s) => s.refreshing)
  const refreshAllPanes = useGanttViewStore((s) => s.refreshAllPanes)
  const fetchPaneData = useGanttViewStore((s) => s.fetchPaneData)
  const addPane = useLayoutStore((s) => s.addPane)
  const resetLayout = useLayoutStore((s) => s.resetLayout)
  const totalPanes = useLayoutStore((s) => s.panes.size)
  const checking = useRuleCheckStore((s) => s.checking)

  // Filter state
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount())
  const hasFilter = activeFilterCount > 0

  // Match counts for pills
  const rosterLoaded = useRosterStore((s) => s.main.rosterItems.length)
  const rosterTotal = useRosterStore((s) => s.main.crewList.length)
  const pairingTotal = usePairingStore((s) => s.unfilteredTotal)
  const pairingLoaded = usePairingStore((s) => s.total)
  const flightTotal = useFlightStore((s) => s.unfilteredTotal)
  const flightLoaded = useFlightStore((s) => s.total)

  // Visible pane types
  const panes = useLayoutStore((s) => s.panes)
  const visibleTypes = new Set([...panes.values()].map((p) => p.type))

  const handleRefresh = () => { refreshAllPanes() }

  const handleAddPane = (type: PaneType) => {
    const paneId = addPane(type)
    if (paneId) fetchPaneData(type)
  }

  return (
    <>
      <TooltipProvider delayDuration={250}>
        <header className="relative z-10 flex h-9 shrink-0 items-center border-b border-border/80 bg-card px-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">

          <div className="flex items-center gap-1">
            <DateRangePicker />
          </div>

          <ToolbarDivider />

          <div className="flex items-center gap-0.5">
            <ToolBtn tip="Refresh" onClick={handleRefresh} disabled={refreshing} active={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </ToolBtn>

            {/* Filter button — amber with count badge when filters are active */}
            <div className="relative">
              <ToolBtn
                tip={hasFilter ? `Filters (${activeFilterCount} active)` : 'Filter'}
                onClick={() => setFilterOpen(true)}
                amber={hasFilter}
              >
                <Filter className="h-3.5 w-3.5" />
              </ToolBtn>
              {hasFilter && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </div>

            {/* Match pills — shown when filters are active and panes are visible */}
            {hasFilter && visibleTypes.has('roster') && (
              <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400">
                Roster {rosterLoaded}/{rosterTotal || '—'}
              </span>
            )}
            {hasFilter && visibleTypes.has('pairing') && (
              <span className="ml-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-400">
                Pairing {pairingLoaded}/{pairingTotal || '—'}
              </span>
            )}
            {hasFilter && visibleTypes.has('flight') && (
              <span className="ml-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-400">
                Flight {flightLoaded}/{flightTotal || '—'}
              </span>
            )}
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
            {(['roster', 'pairing', 'flight'] as PaneType[]).map((type) => (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-all"
                    onClick={() => handleAddPane(type)}
                    disabled={totalPanes >= MAX_PANES}
                    style={{ opacity: totalPanes >= MAX_PANES ? 0.5 : 1 }}
                  >
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: PANE_COLORS[type] }} />
                    {PANE_NAMES[type]}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {totalPanes >= MAX_PANES ? 'Max 4 panes' : `Add ${PANE_NAMES[type]} pane`}
                </TooltipContent>
              </Tooltip>
            ))}
            <button
              className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={resetLayout}
            >
              Reset
            </button>
          </div>

          <ToolbarDivider />

          <div className="flex items-center gap-1.5">
            <ToolBtn tip="Create Ground Task" onClick={() => openGroundTaskCreate()}>
              <SquarePlus className="h-4 w-4" />
            </ToolBtn>
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
      <FilterDialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={refreshAllPanes}
      />
    </>
  )
}
```

- [ ] **Step 2: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/shell/gantt-sub-toolbar.tsx
git commit -m "feat(gantt): amber filter button with active-count badge and match pills in toolbar"
```

---

## Task 6: Wire FilterStore → fetchPairings / fetchFlights

**Files:**
- Modify: `gantt/src/stores/pairing-store.ts` — add optional `filter` param to `fetchPairings`
- Modify: `gantt/src/stores/flight-store.ts` — add optional `filter` param to `fetchFlights`
- Modify: `gantt/src/stores/gantt-view-store.ts` — read filter from FilterStore and pass to fetches

Note: `PairingListQuery` already supports single-value `fleet`, `base`, `division`, `depArp`, `isFull`. `FlightListQuery` supports `depArp`, `arvArp`, `fltNum`, `fleet`, `status`. For multi-select arrays, we pass the first element. This is a Phase 1 limitation.

---

- [ ] **Step 1: Update pairing-store.ts fetchPairings signature**

Locate the `fetchPairings` interface definition (around line 46) and implementation (around line 154).

In the interface:
```diff
- fetchPairings: (dateRange: DateRange) => Promise<void>
+ fetchPairings: (dateRange: DateRange, filter?: import('@/stores/filter-store').PairingFilter) => Promise<void>
```

In the implementation body, update the `params` object:
```diff
  fetchPairings: async (dateRange, filter) => {
    set({ loading: true, items: [], total: 0, hasMore: false, sessions: [], unfilteredTotal: 0 })
    try {
      const params: PairingListQuery = {
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: 1,
        pageSize: PAGE_SIZE,
        sortBy: get().sortBy,
        sortOrder: get().sortOrder,
+       // Phase 1: pass first element of each multi-select array
+       ...(filter?.fleets[0] ? { fleet: filter.fleets[0] } : {}),
+       ...(filter?.bases[0] ? { base: filter.bases[0] } : {}),
+       ...(filter?.divisions[0] ? { division: filter.divisions[0] } : {}),
+       ...(filter?.depArps[0] ? { depArp: filter.depArps[0] } : {}),
+       ...(filter?.isFull !== null && filter?.isFull !== undefined ? { isFull: filter.isFull } : {}),
      }
```

Also add the import at the top of the file:
```typescript
import type { PairingFilter } from '@/stores/filter-store'
```

Wait — circular import risk: filter-store imports nothing from pairing-store, so importing from filter-store in pairing-store is safe.

- [ ] **Step 2: Update flight-store.ts fetchFlights signature**

In the interface:
```diff
- fetchFlights: (dateRange: DateRange) => Promise<void>
+ fetchFlights: (dateRange: DateRange, filter?: import('@/stores/filter-store').FlightFilter) => Promise<void>
```

In the implementation:
```diff
  fetchFlights: async (dateRange, filter) => {
    set({ loading: true, items: [], total: 0, hasMore: false, sessions: [], unfilteredTotal: 0 })
    try {
      const result = await flightApi.list({
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: 1,
        pageSize: PAGE_SIZE,
+       ...(filter?.depArps[0] ? { depArp: filter.depArps[0] } : {}),
+       ...(filter?.arvArps[0] ? { arvArp: filter.arvArps[0] } : {}),
+       ...(filter?.fltNums[0] ? { fltNum: filter.fltNums[0] } : {}),
+       ...(filter?.fleets[0] ? { fleet: filter.fleets[0] } : {}),
+       ...(filter?.statuses[0] ? { status: filter.statuses[0] } : {}),
      })
```

- [ ] **Step 3: Update gantt-view-store.ts to pass filter params**

In `refreshAllPanes`:
```diff
  refreshAllPanes: async () => {
    set({ refreshing: true })
    try {
      const { selectedCrewIds } = useCrewStore.getState()
-     const { dateRange } = useFilterStore.getState()
+     const { dateRange, pairing: pairingFilter, flight: flightFilter } = useFilterStore.getState()
      const panes = useLayoutStore.getState().panes
      const visibleTypes = new Set<string>()
      for (const [, pane] of panes) visibleTypes.add(pane.type)

      if (visibleTypes.has('roster') && selectedCrewIds.length > 0) {
        await useRosterStore.getState().fetchRoster('main', selectedCrewIds, dateRange)
      }
      if (visibleTypes.has('pairing')) {
-       await usePairingStore.getState().fetchPairings(dateRange)
+       await usePairingStore.getState().fetchPairings(dateRange, pairingFilter)
      }
      if (visibleTypes.has('flight')) {
-       await useFlightStore.getState().fetchFlights(dateRange)
+       await useFlightStore.getState().fetchFlights(dateRange, flightFilter)
      }
```

In `fetchPaneData`:
```diff
  fetchPaneData: async (paneType: 'roster' | 'pairing' | 'flight') => {
    const { selectedCrewIds } = useCrewStore.getState()
-   const { dateRange } = useFilterStore.getState()
+   const { dateRange, pairing: pairingFilter, flight: flightFilter } = useFilterStore.getState()

    switch (paneType) {
      // roster case unchanged
      case 'pairing':
        const pairingStore = usePairingStore.getState()
        if (pairingStore.items.length === 0) {
-         await pairingStore.fetchPairings(dateRange)
+         await pairingStore.fetchPairings(dateRange, pairingFilter)
        }
        break
      case 'flight':
        const flightStore = useFlightStore.getState()
        if (flightStore.items.length === 0) {
-         await flightStore.fetchFlights(dateRange)
+         await flightStore.fetchFlights(dateRange, flightFilter)
        }
        break
    }
```

- [ ] **Step 4: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/pairing-store.ts gantt/src/stores/flight-store.ts gantt/src/stores/gantt-view-store.ts
git commit -m "feat(gantt): wire global pairing/flight filters to API fetch calls"
```

---

## Task 7: PaneToolbar Quick Filter Chips Prop

**Files:**
- Modify: `gantt/src/components/panes/pane-toolbar.tsx`

Add a `quickFilterChips` prop and an `onQuickFilterToggle` prop. Chips are rendered inline in Row 1 between the ↓ badge and the spacer. The ⊞ button toggles the quick filter panel.

---

- [ ] **Step 1: Update pane-toolbar.tsx**

Add to the props interface (after `onRemoveFilter`):
```typescript
/** Quick filter chips shown inline in Row 1 (per-pane client-side filter) */
quickFilterChips?: { key: string; label: string; onRemove: () => void }[]
/** Whether the quick filter panel is open */
quickFilterOpen?: boolean
/** Toggle quick filter panel */
onQuickFilterToggle?: () => void
```

Add to destructured props:
```typescript
quickFilterChips,
quickFilterOpen,
onQuickFilterToggle,
```

In the imports at the top, add `SlidersHorizontal` to the lucide-react import:
```diff
- import { ArrowUpDown, Search, ChevronsUpDown, Settings2, ExternalLink, PanelBottomOpen, List, Filter, Download, X } from 'lucide-react'
+ import { ArrowUpDown, Search, ChevronsUpDown, Settings2, ExternalLink, PanelBottomOpen, List, Filter, Download, X, SlidersHorizontal } from 'lucide-react'
```

After the ↓ loaded badge block (around line 163), add the quick filter chips:
```typescript
{/* Quick filter chips — inline in Row 1 */}
{quickFilterChips && quickFilterChips.length > 0 && (
  <div className="ml-1 flex items-center gap-0.5">
    {quickFilterChips.map((chip) => (
      <span
        key={chip.key}
        className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400"
      >
        <span>{chip.label}</span>
        <button
          className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm hover:bg-amber-500/20"
          onClick={chip.onRemove}
          title={`Remove ${chip.key} filter`}
        >
          <X className="h-2 w-2" />
        </button>
      </span>
    ))}
  </div>
)}
```

After the `onSortClick` button (or where sort button was), add the quick filter toggle button:
```typescript
{onQuickFilterToggle && (
  <button
    className={[
      'inline-flex h-5 w-5 items-center justify-center rounded-md transition-all duration-100',
      quickFilterOpen
        ? 'bg-amber-500/15 text-amber-400'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
    ].join(' ')}
    onClick={onQuickFilterToggle}
    title="Quick filter"
  >
    <SlidersHorizontal className="h-3 w-3" />
  </button>
)}
```

- [ ] **Step 2: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/panes/pane-toolbar.tsx
git commit -m "feat(gantt): add quickFilterChips and quick filter toggle to PaneToolbar"
```

---

## Task 8: PaneQuickFilter Component + Pane Wiring

**Files:**
- Create: `gantt/src/components/panes/pane-quick-filter.tsx`
- Modify: `gantt/src/components/panes/roster-pane.tsx`
- Modify: `gantt/src/components/panes/pairing-pane.tsx`
- Modify: `gantt/src/components/panes/flight-pane.tsx`

**Strategy (updated):**
- **Roster pane**: client-side filter on the already-loaded crew list. Roster loads data for explicitly-selected crews; no pagination concern at the task level.
- **Pairing pane**: server-side debounced search (300 ms). Combines the active global PairingFilter from FilterStore with the quick filter text (`label` field). Calls `pairingStore.search()` in replace mode so all pages are searched, not just the loaded slice. Clearing restores via `fetchPairings(dateRange, globalPairingFilter)`.
- **Flight pane**: same pattern as Pairing, maps quick filter text to `fltNum`.

---

- [ ] **Step 1: Create pane-quick-filter.tsx**

```typescript
// gantt/src/components/panes/pane-quick-filter.tsx
import { useRef } from 'react'
import { Search } from 'lucide-react'

export interface QuickFilterState {
  search: string
  frozenOnly: boolean
}

export const EMPTY_QUICK_FILTER: QuickFilterState = { search: '', frozenOnly: false }

interface PaneQuickFilterProps {
  value: QuickFilterState
  onChange: (v: QuickFilterState) => void
  /** Label shown next to "Active rows only" toggle */
  frozenLabel?: string
  showFrozen?: boolean
  /** Show a spinning indicator while a server search is in flight */
  searching?: boolean
}

export const PaneQuickFilter = ({
  value,
  onChange,
  frozenLabel = 'Active rows only',
  showFrozen = false,
  searching = false,
}: PaneQuickFilterProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-b bg-amber-500/5 px-2">
      <div className="flex flex-1 items-center gap-1.5 rounded border bg-background px-2">
        <Search className={`h-3 w-3 shrink-0 ${searching ? 'animate-pulse text-amber-400' : 'text-muted-foreground'}`} />
        <input
          ref={inputRef}
          className="flex-1 bg-transparent py-0.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Search..."
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          autoFocus
        />
      </div>
      {showFrozen && (
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 cursor-pointer accent-amber-500"
            checked={value.frozenOnly}
            onChange={(e) => onChange({ ...value, frozenOnly: e.target.checked })}
          />
          {frozenLabel}
        </label>
      )}
    </div>
  )
}

/** Derive quick filter chips from QuickFilterState (for PaneToolbar Row 1) */
export function getQuickFilterChips(
  state: QuickFilterState,
  onClearSearch: () => void,
  onClearFrozen: () => void,
): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (state.search) {
    chips.push({ key: 'search', label: `search:${state.search}`, onRemove: onClearSearch })
  }
  if (state.frozenOnly) {
    chips.push({ key: 'frozen', label: 'active only', onRemove: onClearFrozen })
  }
  return chips
}
```

- [ ] **Step 2: Wire quick filter in roster-pane.tsx (client-side)**

Add import at the top of `roster-pane.tsx`:
```typescript
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips, type QuickFilterState } from './pane-quick-filter'
```

Add state in the component body:
```typescript
const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
const [quickFilterOpen, setQuickFilterOpen] = useState(false)
```

Find where `crewList` is derived (comes from `rosterStore[paneId].crewList`). Replace with a filtered version:

```typescript
const rawCrewList = useRosterStore((s) => s[legacyPaneId].crewList)

// Client-side filter: crews matching quick filter text, or with tasks if frozenOnly
const crewList = useMemo(() => {
  if (!quickFilter.search && !quickFilter.frozenOnly) return rawCrewList
  const q = quickFilter.search.toLowerCase()
  return rawCrewList.filter((crew) => {
    if (quickFilter.frozenOnly) {
      const hasItems = rosterItems.some((item) => item.crewId === crew.crewId)
      if (!hasItems) return false
    }
    if (q) {
      return crew.crewId.toLowerCase().includes(q) ||
        (crew.name ?? '').toLowerCase().includes(q)
    }
    return true
  })
}, [rawCrewList, quickFilter, rosterItems])
```

Note: check the actual variable names used in `roster-pane.tsx` — `legacyPaneId` may differ; adapt as needed.

Add new props to `<PaneToolbar .../>`:
```typescript
quickFilterChips={getQuickFilterChips(
  quickFilter,
  () => setQuickFilter((q) => ({ ...q, search: '' })),
  () => setQuickFilter((q) => ({ ...q, frozenOnly: false })),
)}
quickFilterOpen={quickFilterOpen}
onQuickFilterToggle={() => setQuickFilterOpen((v) => !v)}
```

After `<PaneToolbar />`, render the panel:
```typescript
{quickFilterOpen && (
  <PaneQuickFilter
    value={quickFilter}
    onChange={setQuickFilter}
    frozenLabel="Active crews only"
    showFrozen
  />
)}
```

- [ ] **Step 3: Wire quick filter in pairing-pane.tsx (server-side debounced)**

Add imports:
```typescript
import { useRef, useCallback, useEffect } from 'react'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips, type QuickFilterState } from './pane-quick-filter'
import { useFilterStore } from '@/stores/filter-store'
import { usePairingStore } from '@/stores/pairing-store'
```

Add state and refs in the component body:
```typescript
const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
const [quickFilterOpen, setQuickFilterOpen] = useState(false)
const [qfSearching, setQfSearching] = useState(false)
const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const dateRange = useFilterStore((s) => s.dateRange)
const globalPairingFilter = useFilterStore((s) => s.pairing)
```

Add the debounced search handler:
```typescript
const handleQuickFilterChange = useCallback((newState: QuickFilterState) => {
  setQuickFilter(newState)
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

  if (!newState.search) {
    // Restore to global filter result
    setQfSearching(false)
    usePairingStore.getState().fetchPairings(dateRange, globalPairingFilter)
    return
  }

  setQfSearching(true)
  searchTimerRef.current = setTimeout(async () => {
    const store = usePairingStore.getState()
    // Always replace — quick filter is a point-in-time refinement
    store.setQueryMode('replace')
    await store.search({
      label: newState.search,
      // Combine with active global filter (Phase 1: first element)
      ...(globalPairingFilter.fleets[0] ? { fleet: globalPairingFilter.fleets[0] } : {}),
      ...(globalPairingFilter.bases[0] ? { base: globalPairingFilter.bases[0] } : {}),
      ...(globalPairingFilter.divisions[0] ? { division: globalPairingFilter.divisions[0] } : {}),
      ...(globalPairingFilter.depArps[0] ? { depArp: globalPairingFilter.depArps[0] } : {}),
      ...(globalPairingFilter.isFull !== null ? { isFull: globalPairingFilter.isFull } : {}),
    })
    setQfSearching(false)
  }, 300)
}, [dateRange, globalPairingFilter])

// Clear search timer on unmount
useEffect(() => () => {
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
}, [])
```

Add new props to `<PaneToolbar .../>`:
```typescript
quickFilterChips={getQuickFilterChips(
  quickFilter,
  () => handleQuickFilterChange({ ...quickFilter, search: '' }),
  () => {/* frozenOnly not used in pairing */},
)}
quickFilterOpen={quickFilterOpen}
onQuickFilterToggle={() => setQuickFilterOpen((v) => !v)}
```

After `<PaneToolbar />`:
```typescript
{quickFilterOpen && (
  <PaneQuickFilter
    value={quickFilter}
    onChange={handleQuickFilterChange}
    searching={qfSearching}
  />
)}
```

**Do NOT add a `useMemo` filter on `items` here** — the store's `items` already reflects the server search result.

- [ ] **Step 4: Wire quick filter in flight-pane.tsx (server-side debounced)**

Same structure as pairing. Add imports, state, ref, and handler:

```typescript
import { useRef, useCallback, useEffect } from 'react'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips, type QuickFilterState } from './pane-quick-filter'
import { useFilterStore } from '@/stores/filter-store'
import { useFlightStore } from '@/stores/flight-store'
```

```typescript
const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
const [quickFilterOpen, setQuickFilterOpen] = useState(false)
const [qfSearching, setQfSearching] = useState(false)
const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const dateRange = useFilterStore((s) => s.dateRange)
const globalFlightFilter = useFilterStore((s) => s.flight)
```

```typescript
const handleQuickFilterChange = useCallback((newState: QuickFilterState) => {
  setQuickFilter(newState)
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

  if (!newState.search) {
    setQfSearching(false)
    useFlightStore.getState().fetchFlights(dateRange, globalFlightFilter)
    return
  }

  setQfSearching(true)
  searchTimerRef.current = setTimeout(async () => {
    const store = useFlightStore.getState()
    store.setQueryMode('replace')
    await store.search({
      fltNum: newState.search,
      // Combine with active global filter (Phase 1: first element)
      ...(globalFlightFilter.depArps[0] ? { depArp: globalFlightFilter.depArps[0] } : {}),
      ...(globalFlightFilter.arvArps[0] ? { arvArp: globalFlightFilter.arvArps[0] } : {}),
      ...(globalFlightFilter.fleets[0] ? { fleet: globalFlightFilter.fleets[0] } : {}),
      ...(globalFlightFilter.statuses[0] ? { status: globalFlightFilter.statuses[0] } : {}),
    })
    setQfSearching(false)
  }, 300)
}, [dateRange, globalFlightFilter])

useEffect(() => () => {
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
}, [])
```

Add to `<PaneToolbar />` and render `<PaneQuickFilter onChange={handleQuickFilterChange} searching={qfSearching} />` — same pattern as pairing.

- [ ] **Step 5: Run tsc**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors. Adapt variable names as needed for actual pane implementations.

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/panes/pane-quick-filter.tsx \
        gantt/src/components/panes/roster-pane.tsx \
        gantt/src/components/panes/pairing-pane.tsx \
        gantt/src/components/panes/flight-pane.tsx
git commit -m "feat(gantt): per-pane quick filter — server-side for Pairing/Flight, client-side for Roster"
```

---

## Task 9: Cleanup + Version Bump

**Files:**
- Delete: `gantt/src/components/crew/crew-filter.tsx`
- Delete: `gantt/src/components/layout/sidebar.tsx`
- Modify: `gantt/src/version.ts` — FRONTEND_VERSION 1 → 2

---

- [ ] **Step 1: Verify files are not imported anywhere**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && grep -rn "crew-filter\|CrewFilter\|sidebar" src/ --include="*.tsx" --include="*.ts" | grep -v "filter-store\|filter-dialog\|CrewFilter.*store\|PairingFilter\|FlightFilter"
```

Expected: no results (both files are dead code). If any results appear, investigate before deleting.

- [ ] **Step 2: Delete the unused files**

```bash
rm gantt/src/components/crew/crew-filter.tsx
rm gantt/src/components/layout/sidebar.tsx
```

- [ ] **Step 3: Check if crew/ directory is now empty**

```bash
ls gantt/src/components/crew/
```

If the `crew/` directory is empty, delete it too:
```bash
rmdir gantt/src/components/crew/ 2>/dev/null || true
```

- [ ] **Step 4: Bump FRONTEND_VERSION in version.ts**

Edit `gantt/src/version.ts`:
```diff
- export const FRONTEND_VERSION = 1
+ export const FRONTEND_VERSION = 2
```

- [ ] **Step 5: Run tsc one final time**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(gantt): delete unused sidebar/crew-filter, bump FRONTEND_VERSION to 2"
```

---

## Implementation Notes

**Per-pane quick filter pagination:** Pairing and Flight use server-side debounced search (300 ms) rather than client-side filtering. This ensures the quick filter searches ALL records, not just the loaded page slice. When the quick filter is cleared, `fetchPairings`/`fetchFlights` is called with the global filter to restore the original paginated view. Roster uses client-side filtering because its data is loaded for explicitly-selected crews with no hidden pagination at the task level.

**API multi-select limitation (Phase 1):** The existing `pairingApi.list()` and `flightApi.list()` only support single-value filter params (`fleet?: string`, `base?: string`, etc.). The FilterStore stores arrays (multi-select), but the API bridge in Tasks 6 and 8 sends only the first element. A Phase 2 ticket should extend the backend API to accept comma-separated or repeated params, then update the bridge to pass the full array.

**Crew global filter:** When the user applies Crew tier filters (division/rank/base/fleet), the current plan does NOT re-fetch roster automatically. The Crew filters update the FilterStore and can be wired in a future task to call `crewStore.search()` which updates the left crew panel sidebar. The FilterDialog `onApply` calls `refreshAllPanes()` which will re-use `selectedCrewIds` unchanged. A fuller implementation would add crew filter params to `GET /api/roster` and pass them from `ganttViewStore.refreshAllPanes`.

**Circular import safety:** `filter-store.ts` → no imports from other stores. `pairing-store.ts` and `flight-store.ts` import types from `filter-store.ts` (type-only imports compiled away) — safe.

**localStorage migration:** Old `gantt-filter` key used flat fields; new `gantt-filter-v2` key uses namespaced structure. Users will lose their saved date range on first load after upgrade. This is acceptable — the date range will reset to defaults.

---

*Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>*
