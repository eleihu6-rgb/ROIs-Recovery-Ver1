import { useState, useMemo, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { getFilterStore, type CrewFilter, type PairingFilter, type FlightFilter, type CoverageState } from '@/stores/filter-store'
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
import { useReferenceStore } from '@/stores/reference-store'
import { MultiSelectDropdown, type SelectOption } from '@/components/common/multi-select-dropdown'
import { useScopedOptions } from '@/hooks/use-scoped-options'
import type { GanttContextId } from '@/types/gantt-context'

export const resolveFilterStore = (id: GanttContextId) => getFilterStore(id)

interface FilterDialogProps {
  open: boolean
  onClose: () => void
  onApply?: () => void
  /** Tab to switch to when the dialog opens (pane funnel entry); null keeps the last tab. */
  initialTab?: TabId | null
  /** Which context's filter store to read/write. Defaults to 'live' (existing call sites unchanged). */
  contextId?: GanttContextId
}

type TabId = 'crew' | 'pairing' | 'flight'

const TAB_COLOR: Record<TabId, string> = {
  crew:    '#3b82f6',
  pairing: '#22c55e',
  flight:  '#a855f7',
}

const DIVISION_OPTIONS = [
  { value: 'P', label: 'P — Pilot' },
  { value: 'C', label: 'C — Cabin' },
]

const COVERAGE_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'partial', label: 'Partial' },
  { value: 'full', label: 'Full' },
  { value: 'over', label: 'Over' },
]

const FLIGHT_STATUS_OPTIONS: SelectOption[] = [
  { value: 'full',    label: 'Full' },
  { value: 'partial', label: 'Partial' },
  { value: 'open',    label: 'Open' },
]

const PILOT_RANKS = new Set(['CA', 'FO'])
const CABIN_RANKS = new Set(['FA', 'IFD'])
const RANK_DIVISION_WARNING = 'Invalid rank for selected division. Use P with CA/FO, or C with FA/IFD.'

export const getPairingRankDivisionConflict = (divisions: string[], ranks: string[]): string | null => {
  if (divisions.includes('P') && ranks.some((rank) => CABIN_RANKS.has(rank))) return RANK_DIVISION_WARNING
  if (divisions.includes('C') && ranks.some((rank) => PILOT_RANKS.has(rank))) return RANK_DIVISION_WARNING
  return null
}

export const FilterDialog = ({ open, onClose, onApply, initialTab, contextId = 'live' }: FilterDialogProps) => {
  const useStore = resolveFilterStore(contextId)
  const filterStore = useStore()
  const refStore = useReferenceStore()
  const [activeTab, setActiveTab] = useState<TabId>('crew')

  const [localCrew,    setLocalCrew]    = useState<CrewFilter>(() => filterStore.crew)
  const [localPairing, setLocalPairing] = useState<PairingFilter>(() => filterStore.pairing)
  const [localFlight,  setLocalFlight]  = useState<FlightFilter>(() => filterStore.flight)

  useEffect(() => {
    if (open) {
      refStore.load()
      setLocalCrew(filterStore.crew)
      setLocalPairing({ ...filterStore.pairing, divisions: filterStore.crew.divisions })
      setLocalFlight(filterStore.flight)
      // Pane funnel entry pre-switches to the matching tab; toolbar entry (null) keeps the last tab.
      if (initialTab) setActiveTab(initialTab)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const baseOptions = useMemo<SelectOption[]>(
    () => refStore.bases.map((b) => ({ value: b.base, label: b.name ? `${b.base} — ${b.name}` : b.base })),
    [refStore.bases],
  )
  const rankOptions = useMemo<SelectOption[]>(
    () => refStore.ranks
      .filter((r) => r.isCrewRank === 1)
      .map((r) => ({ value: r.rank, label: r.description ? `${r.rank} — ${r.description}` : r.rank })),
    [refStore.ranks],
  )
  const fleetOptions = useMemo<SelectOption[]>(
    () => refStore.fleets.map((f) => ({ value: f.fleet, label: f.description ? `${f.fleet} — ${f.description}` : f.fleet })),
    [refStore.fleets],
  )
  // 数据权限：查询界面可选项按 dataScope 收窄（维度内 OR，未配置不限；admin 全量）
  const { filterOptions } = useScopedOptions()
  const scopedDivisionOptions = useMemo(() => filterOptions('DIVISION', DIVISION_OPTIONS), [filterOptions])
  const scopedRankOptions = useMemo(() => filterOptions('RANK', rankOptions), [filterOptions, rankOptions])
  const scopedFleetOptions = useMemo(() => filterOptions('FLEET', fleetOptions), [filterOptions, fleetOptions])
  const assignmentOptions = useMemo<SelectOption[]>(
    () => refStore.pairingTypes.map((a) => ({ value: a.assignment, label: a.description ? `${a.assignment} — ${a.description}` : a.assignment })),
    [refStore.pairingTypes],
  )
  const pairingRankConflict = getPairingRankDivisionConflict(localCrew.divisions, localPairing.ranks)

  const handleApply = useCallback(() => {
    filterStore.setCrewFilter(localCrew)
    filterStore.setPairingFilter({ ...localPairing, divisions: localCrew.divisions })
    filterStore.setFlightFilter(localFlight)
    onApply?.()
    onClose()
  }, [localCrew, localPairing, localFlight, filterStore, onApply, onClose])

  const handleReset = useCallback(() => {
    setLocalCrew({ divisions: [], bases: [], ranks: [], fleets: [], crewIds: [] })
    setLocalPairing({ bases: [], fleets: [], divisions: [], ranks: [], depArps: [], coverage: [...ALL_COVERAGE], assignments: [], label: '', pairingIds: [] })
    setLocalFlight({ depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [] })
  }, [])

  const crewCount    = localCrew.divisions.length + localCrew.bases.length + localCrew.ranks.length + localCrew.fleets.length + (localCrew.crewIds.length ? 1 : 0)
  const pairingCount = localPairing.bases.length + localPairing.fleets.length + localPairing.ranks.length + localPairing.depArps.length + localPairing.assignments.length + ((localPairing.coverage.length > 0 && localPairing.coverage.length < ALL_COVERAGE.length) ? 1 : 0) + (localPairing.label.trim() ? 1 : 0) + (localPairing.pairingIds.length ? 1 : 0)
  const flightCount  = localFlight.depArps.length + localFlight.arvArps.length + localFlight.fltNums.length + localFlight.fleets.length + localFlight.statuses.length
  const totalCount   = crewCount + pairingCount + flightCount

  /** All active filter chips for the summary bar */
  const summaryChips = useMemo(() => {
    const chips: { id: string; tier: TabId; key: string; val: string; onRemove: () => void }[] = []
    if (localCrew.divisions.length)  chips.push({ id: 'c-div',   tier: 'crew',    key: 'crew:division', val: localCrew.divisions.join(', '),  onRemove: () => setLocalCrew((c) => ({ ...c, divisions: [] })) })
    if (localCrew.bases.length)      chips.push({ id: 'c-base',  tier: 'crew',    key: 'crew:base',     val: localCrew.bases.join(', '),      onRemove: () => setLocalCrew((c) => ({ ...c, bases: [] })) })
    if (localCrew.ranks.length)      chips.push({ id: 'c-rank',  tier: 'crew',    key: 'crew:rank',     val: localCrew.ranks.join(', '),      onRemove: () => setLocalCrew((c) => ({ ...c, ranks: [] })) })
    if (localCrew.fleets.length)     chips.push({ id: 'c-fleet', tier: 'crew',    key: 'crew:fleet',    val: localCrew.fleets.join(', '),     onRemove: () => setLocalCrew((c) => ({ ...c, fleets: [] })) })
    if (localCrew.crewIds.length)    chips.push({ id: 'c-id',    tier: 'crew',    key: 'crew:id',       val: localCrew.crewIds.join(', '),    onRemove: () => setLocalCrew((c) => ({ ...c, crewIds: [] })) })
    if (localPairing.bases.length)   chips.push({ id: 'p-base',  tier: 'pairing', key: 'pairing:base',  val: localPairing.bases.join(', '),   onRemove: () => setLocalPairing((p) => ({ ...p, bases: [] })) })
    if (localPairing.fleets.length)  chips.push({ id: 'p-fleet', tier: 'pairing', key: 'pairing:fleet', val: localPairing.fleets.join(', '),  onRemove: () => setLocalPairing((p) => ({ ...p, fleets: [] })) })
    if (localPairing.ranks.length) chips.push({ id: 'p-rank', tier: 'pairing', key: 'pairing:rank', val: localPairing.ranks.join(', '), onRemove: () => setLocalPairing((p) => ({ ...p, ranks: [] })) })
    if (localPairing.depArps.length) chips.push({ id: 'p-dep',   tier: 'pairing', key: 'pairing:dep',   val: localPairing.depArps.join(', '), onRemove: () => setLocalPairing((p) => ({ ...p, depArps: [] })) })
    if (localPairing.assignments.length) chips.push({ id: 'p-type', tier: 'pairing', key: 'pairing:type', val: localPairing.assignments.join(', '), onRemove: () => setLocalPairing((p) => ({ ...p, assignments: [] })) })
    if (localPairing.coverage.length > 0 && localPairing.coverage.length < ALL_COVERAGE.length) chips.push({ id: 'p-cov', tier: 'pairing', key: 'pairing:coverage', val: localPairing.coverage.map((c) => c[0].toUpperCase() + c.slice(1)).join(', '), onRemove: () => setLocalPairing((p) => ({ ...p, coverage: [...ALL_COVERAGE] })) })
    if (localPairing.label.trim()) chips.push({ id: 'p-label', tier: 'pairing', key: 'pairing:label', val: localPairing.label.trim(), onRemove: () => setLocalPairing((p) => ({ ...p, label: '' })) })
    if (localPairing.pairingIds.length) chips.push({ id: 'p-id', tier: 'pairing', key: 'pairing:id', val: localPairing.pairingIds.join(', '), onRemove: () => setLocalPairing((p) => ({ ...p, pairingIds: [] })) })
    if (localFlight.depArps.length)  chips.push({ id: 'f-dep',   tier: 'flight',  key: 'flight:dep',    val: localFlight.depArps.join(', '),  onRemove: () => setLocalFlight((f) => ({ ...f, depArps: [] })) })
    if (localFlight.arvArps.length)  chips.push({ id: 'f-arr',   tier: 'flight',  key: 'flight:arr',    val: localFlight.arvArps.join(', '),  onRemove: () => setLocalFlight((f) => ({ ...f, arvArps: [] })) })
    if (localFlight.fltNums.length)  chips.push({ id: 'f-flt',   tier: 'flight',  key: 'flight:fltNum', val: localFlight.fltNums.join(', '),  onRemove: () => setLocalFlight((f) => ({ ...f, fltNums: [] })) })
    if (localFlight.fleets.length)   chips.push({ id: 'f-fleet', tier: 'flight',  key: 'flight:fleet',  val: localFlight.fleets.join(', '),   onRemove: () => setLocalFlight((f) => ({ ...f, fleets: [] })) })
    if (localFlight.statuses.length) chips.push({ id: 'f-stat',  tier: 'flight',  key: 'flight:status', val: localFlight.statuses.join(', '), onRemove: () => setLocalFlight((f) => ({ ...f, statuses: [] })) })
    return chips
  }, [localCrew, localPairing, localFlight])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25" onClick={onClose}>
      <div
        className="w-[540px] overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="filter-dialog"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 border-b border-border bg-muted px-4 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-sm text-blue-400">
            ▼
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Filters</span>
              {totalCount > 0 && (
                <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-2xs font-bold text-blue-400">
                  {totalCount} active
                </span>
              )}
            </div>
            <div className="text-2xs text-muted-foreground">Global · affects all panes</div>
          </div>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
            onClick={onClose}
            data-testid="filter-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tier tabs ──────────────────────────────────────────── */}
        <div className="flex border-b border-border bg-muted px-4">
          {(['crew', 'pairing', 'flight'] as TabId[]).map((tab) => {
            const count = tab === 'crew' ? crewCount : tab === 'pairing' ? pairingCount : flightCount
            const isActive = activeTab === tab
            const color = TAB_COLOR[tab]
            return (
              <button
                key={tab}
                type="button"
                className="relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground transition-colors"
                style={{
                  color: isActive ? color : undefined,
                  borderBottom: `2px solid ${isActive ? color : 'transparent'}`,
                  marginBottom: '-1px',
                }}
                onClick={() => setActiveTab(tab)}
                data-testid={`filter-tab-${tab}`}
                data-active={isActive}
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${!isActive ? 'bg-muted-foreground/40' : ''}`}
                  style={{ background: isActive ? color : undefined }}
                />
                <span className="capitalize">{tab}</span>
                {count > 0 && (
                  <span className="rounded px-1 py-0.5 text-3xs font-bold"
                    style={{ background: `${color}26`, color }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab body ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 p-4">

          {/* Crew tab */}
          {activeTab === 'crew' && (
            <>
              <FilterRow label="Division">
            <PillGroup
                  options={scopedDivisionOptions}
                  selected={localCrew.divisions}
                  color={TAB_COLOR.crew}
                  onChange={(v) => setLocalCrew((c) => ({ ...c, divisions: v }))}
                  single={contextId === 'live'}
                  testIdPrefix="filter-crew-division"
                />
            </FilterRow>
            <FilterRow label="Base">
                <MultiSelectDropdown options={baseOptions} selected={localCrew.bases}
                  onChange={(v) => setLocalCrew((c) => ({ ...c, bases: v }))} placeholder="All bases" testId="filter-crew-base" />
              </FilterRow>
              <FilterRow label="Rank">
                <MultiSelectDropdown options={scopedRankOptions} selected={localCrew.ranks}
                  onChange={(v) => setLocalCrew((c) => ({ ...c, ranks: v }))} placeholder="All ranks" testId="filter-crew-rank" />
              </FilterRow>
              <FilterRow label="Fleet">
                <MultiSelectDropdown options={scopedFleetOptions} selected={localCrew.fleets}
                  onChange={(v) => setLocalCrew((c) => ({ ...c, fleets: v }))} placeholder="All fleets" testId="filter-crew-fleet" />
              </FilterRow>
              <FilterRow label="Crew ID">
                <TextChipField value={localCrew.crewIds}
                  onChange={(v) => setLocalCrew((c) => ({ ...c, crewIds: v }))}
                  placeholder="e.g. 12345, 67890" hint="Comma- or period-separated — brings matches to the top"
                  splitPattern={/[\s,.]+/} testId="filter-crew-id" />
              </FilterRow>
            </>
          )}

          {/* Pairing tab */}
          {activeTab === 'pairing' && (
            <>
              <FilterRow label="Label">
                <input
                  type="text"
                  value={localPairing.label}
                  onChange={(e) => setLocalPairing((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Search pairing label…"
                  data-testid="filter-pairing-label"
                  className="min-h-[30px] w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </FilterRow>
              <FilterRow label="Pairing ID">
                <TextChipField value={localPairing.pairingIds}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, pairingIds: v }))}
                  placeholder="e.g. 10234, 10567" hint="Comma- or period-separated pairing IDs — shows only these pairings"
                  splitPattern={/[\s,.]+/} testId="filter-pairing-id" />
              </FilterRow>
              <FilterRow label="Rank">
                <div className={pairingRankConflict ? 'animate-pulse' : undefined}>
                  <MultiSelectDropdown options={scopedRankOptions} selected={localPairing.ranks}
                    onChange={(v) => setLocalPairing((p) => ({ ...p, ranks: v }))} placeholder="All ranks" testId="filter-pairing-rank" />
                  {pairingRankConflict && (
                    <div className="mt-1 text-2xs font-medium text-destructive" data-testid="filter-pairing-rank-warning" aria-live="polite">
                      {pairingRankConflict}
                    </div>
                  )}
                </div>
              </FilterRow>
              <FilterRow label="Base">
                <MultiSelectDropdown options={baseOptions} selected={localPairing.bases}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, bases: v }))} placeholder="All bases" testId="filter-pairing-base" />
              </FilterRow>
              <FilterRow label="Fleet">
                <MultiSelectDropdown options={scopedFleetOptions} selected={localPairing.fleets}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, fleets: v }))} placeholder="All fleets" testId="filter-pairing-fleet" />
              </FilterRow>
              <FilterRow label="Type">
                <MultiSelectDropdown options={assignmentOptions} selected={localPairing.assignments}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, assignments: v }))} placeholder="All types" testId="filter-pairing-type" />
              </FilterRow>
              <FilterRow label="Arpt">
                <TextChipField value={localPairing.depArps}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, depArps: v }))}
                  placeholder="e.g. YVR, YYZ" hint="Comma-separated IATA codes"
                  transform={(s) => s.toUpperCase()} testId="filter-pairing-dep" />
              </FilterRow>
              <FilterRow label="Coverage">
                <PillGroup
                  options={COVERAGE_OPTIONS}
                  selected={localPairing.coverage}
                  color={TAB_COLOR.pairing}
                  onChange={(v) => setLocalPairing((p) => ({ ...p, coverage: v as CoverageState[] }))}
                  testIdPrefix="filter-pairing-coverage"
                />
              </FilterRow>
            </>
          )}

          {/* Flight tab */}
          {activeTab === 'flight' && (
            <>
              <FilterRow label="Dep Airport">
                <TextChipField value={localFlight.depArps}
                  onChange={(v) => setLocalFlight((f) => ({ ...f, depArps: v }))}
                  placeholder="e.g. SHA, PEK" transform={(s) => s.toUpperCase()}
                  hint="Comma-separated IATA codes" testId="filter-flight-dep" />
              </FilterRow>
              <FilterRow label="Arr Airport">
                <TextChipField value={localFlight.arvArps}
                  onChange={(v) => setLocalFlight((f) => ({ ...f, arvArps: v }))}
                  placeholder="e.g. PEK, CAN" transform={(s) => s.toUpperCase()}
                  hint="Comma-separated IATA codes" testId="filter-flight-arr" />
              </FilterRow>
              <FilterRow label="Flight No.">
                <TextChipField value={localFlight.fltNums}
                  onChange={(v) => setLocalFlight((f) => ({ ...f, fltNums: v }))}
                  placeholder="e.g. 1001" testId="filter-flight-fltnum" />
              </FilterRow>
              <FilterRow label="Fleet">
                <MultiSelectDropdown options={scopedFleetOptions} selected={localFlight.fleets}
                  onChange={(v) => setLocalFlight((f) => ({ ...f, fleets: v }))} placeholder="All fleets" testId="filter-flight-fleet" />
              </FilterRow>
              <FilterRow label="Status">
                <PillGroup
                  options={[{ value: 'all', label: 'All' }, ...FLIGHT_STATUS_OPTIONS]}
                  selected={localFlight.statuses.length === 0 ? ['all'] : localFlight.statuses}
                  color={TAB_COLOR.flight}
                  onChange={(v) => setLocalFlight((f) => ({ ...f, statuses: v.filter((x) => x !== 'all') }))}
                  testIdPrefix="filter-flight-status"
                />
              </FilterRow>
            </>
          )}
        </div>

        {/* ── Active filter summary ───────────────────────────────── */}
        <div className="mx-4 mb-2 flex min-h-[36px] flex-wrap items-center gap-1.5 rounded border border-border bg-background px-2.5 py-2">
          {summaryChips.length === 0 ? (
            <span className="text-2xs text-muted-foreground/50">No active filters</span>
          ) : (
            <>
              <span className="mr-1 shrink-0 text-2xs text-muted-foreground/50">Active:</span>
              {summaryChips.map((chip) => {
                const color = TAB_COLOR[chip.tier]
                return (
                  <div key={chip.id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs">
                    <span className="text-muted-foreground/50">{chip.key}</span>
                    <span className="mx-px text-muted-foreground/50">=</span>
                    <span className="font-semibold text-foreground">{chip.val}</span>
                    <button type="button" className="ml-0.5 text-2xs leading-none text-muted-foreground/50 transition-colors hover:text-red-400"
                      onClick={chip.onRemove}>✕</button>
                  </div>
                )
              })}
              <button type="button" className="ml-auto text-2xs text-muted-foreground/50 transition-colors hover:text-foreground"
                onClick={handleReset}>
                Clear all
              </button>
            </>
          )}
        </div>

        <div className="h-2" />

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border bg-muted px-4 py-3">
          <div className="text-2xs text-muted-foreground/50">
            {totalCount === 0 ? 'No active filters' : `${totalCount} filter${totalCount > 1 ? 's' : ''} active`}
          </div>
          <div className="flex gap-2">
            <button type="button"
              className="rounded border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={handleReset}
              data-testid="filter-reset">
              Reset
            </button>
            <button type="button"
              className="rounded bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
              onClick={handleApply}
              data-testid="filter-apply">
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Row: 72px label column + flex control */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5" style={{ minHeight: 30 }}>
      <span className="w-[72px] shrink-0 pt-1.5 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-col gap-1">{children}</div>
    </div>
  )
}

/** Pill toggle group — rounded-full chips with colored active state */
function PillGroup({
  options, selected, color, onChange, single = false, testIdPrefix,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  color: string
  onChange: (v: string[]) => void
  single?: boolean
  testIdPrefix?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${active ? '' : 'border border-border bg-muted text-muted-foreground hover:bg-accent'}`}
            style={active ? { background: `${color}26`, border: `1px solid ${color}80`, color } : undefined}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
            onClick={() => {
              const next = active ? selected.filter((d) => d !== opt.value) : single ? [opt.value] : [...selected, opt.value]
              onChange(next)
            }}
          >
            {active && <span className="mr-1">✓</span>}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Text input that adds values as chips on Enter / comma (and period when splitPattern allows). */
function TextChipField({
  value, onChange, placeholder = '', hint, transform, testId, splitPattern = /,/,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  hint?: string
  transform?: (s: string) => string
  testId?: string
  /** Separator(s) used to split pasted/typed input into multiple chips. Default: comma. */
  splitPattern?: RegExp
}) {
  const [input, setInput] = useState('')

  const add = () => {
    const raw = input.trim()
    if (!raw) return
    const parts = raw.split(splitPattern).map((s) => (transform ? transform(s.trim()) : s.trim())).filter(Boolean)
    const next = [...value, ...parts.filter((p) => !value.includes(p))]
    onChange(next)
    setInput('')
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-[30px] cursor-text flex-wrap items-center gap-1 rounded border border-border bg-background px-2 py-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 px-1.5 py-0.5 text-2xs font-semibold text-blue-400">
            {v}
            <button type="button" className="ml-0.5 leading-none opacity-70 hover:opacity-100"
              onClick={() => onChange(value.filter((x) => x !== v))}>✕</button>
          </span>
        ))}
        <input
          className="min-w-[80px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          placeholder={value.length === 0 ? placeholder : 'Add more…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === '.') { e.preventDefault(); add() } }}
          onBlur={add}
          data-testid={testId}
        />
      </div>
      {hint && <div className="text-2xs text-muted-foreground/50">{hint}</div>}
    </div>
  )
}
