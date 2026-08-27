import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AppDialog, Button, Input } from '@rois/ui'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import type { RoFilterParams, ScenarioDetail } from '@/types'
import type { ScenarioGanttCrew, ScenarioGanttData, ScenarioGanttPairing } from '@/types/scenario-gantt'
import { normalizeCrewDivision, normalizeRoCrewFilter, normalizeRoPairingFilter } from '@/utils/scenario-filter-params'
import { useBaseOptions } from './filter/use-base-options'
import { useRankOptions } from './filter/use-rank-options'
import { useRowSelection } from './team-rule-selection'

type JsonRecord = Record<string, any>

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}

const stringValue = (value: unknown): string => value == null ? '' : String(value)

const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []

const uniqueSorted = (values: unknown[]): string[] => [...new Set(values.map(stringValue).filter(Boolean))].sort()

const numberOrNull = (value: unknown): number | null => {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const nextId = (prefix: string, rows: JsonRecord[]): string => {
  const used = rows.map((row) => String(row.id ?? ''))
  let n = 1
  while (used.includes(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export const MinReserveCoverageEditor = ({
  value,
  disabled,
  saving,
  onChange,
}: {
  value: unknown
  disabled: boolean
  saving: boolean
  onChange: (value: unknown) => void
}): ReactNode => {
  const source = record(value)
  const dates = Array.isArray(source.dates) ? source.dates as JsonRecord[] : []
  const patch = (next: JsonRecord): void => onChange({ ...source, ...next })

  return (
    <div className="space-y-3">
      <div className="font-semibold text-xs text-foreground">Min Reserve Coverage %</div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Minimum % of open reserve slots the solver must cover before flights fill the remaining
        credit. Reserves are placed junior-first in ≥2-day blocks, highest-priority weekdays
        first. Blank or 0 disables the floor.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">Floor</span>
        <Input
          className="h-7 w-20 text-xs"
          type="number"
          min={0}
          max={100}
          step={1}
          placeholder="0 (off)"
          value={source.pct == null ? '' : String(source.pct)}
          disabled={disabled || saving}
          aria-label="Minimum reserve coverage percentage"
          onChange={(event) => patch({ pct: event.target.value === '' ? null : Number(event.target.value) })}
        />
        <span className="text-muted-foreground">%</span>
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold text-xs text-foreground">Date-specific coverage</span>
          <Button
            type="button"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={disabled || saving}
            onClick={() => patch({ dates: [...dates, { id: nextId('d', dates), date: '', pct: 100 }] })}
          >
            + Add Date
          </Button>
        </div>
        <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
          Dates listed here override the floor above. 0% exempts a date rather than turning it
          off. Every entry is a floor, never a cap.
        </p>
        {dates.length === 0 ? (
          <div className="text-xs text-muted-foreground">No dates — every date uses the floor above.</div>
        ) : (
          <div className="space-y-2">
            {dates.map((row, index) => (
              <div key={String(row.id ?? index)} className="flex items-center gap-2 text-xs">
                <GanttEnglishDatePicker
                  ariaLabel={`Date ${index + 1}`}
                  buttonClassName="w-36"
                  value={String(row.date ?? '')}
                  disabled={disabled || saving}
                  onValueChange={(value) => patch({
                    dates: dates.map((item, i) => i === index ? { ...item, date: value } : item),
                  })}
                />
                <Input
                  className="h-7 w-20 text-xs"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={String(row.pct ?? 0)}
                  disabled={disabled || saving}
                  aria-label={`Coverage percentage for row ${index + 1}`}
                  onChange={(event) => patch({
                    dates: dates.map((item, i) => i === index ? { ...item, pct: Number(event.target.value) } : item),
                  })}
                />
                <span className="text-muted-foreground">%</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive"
                  disabled={disabled || saving}
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => patch({ dates: dates.filter((_, i) => i !== index) })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const blankTeam = (id: string): JsonRecord => ({
  id,
  name: '',
  description: '',
  crew_filter: { search: '', ranks: [], base: '', senMin: '', senMax: '', bornFrom: '', bornTo: '' },
})

const blankRule = (id: string, teamId: string): JsonRecord => ({
  id,
  name: '',
  team_id: teamId,
  mode: 'not_do',
  enabled: true,
  pairing_filter: { search: '', types: [], base: '', carryIn: '', airports: [], from: '', to: '', daysMin: '', daysMax: '' },
})

const emptyCrewFilter = (): JsonRecord => blankTeam('').crew_filter
const emptyPairingFilter = (): JsonRecord => blankRule('', '').pairing_filter

const cleanCrewFilter = (value: unknown): JsonRecord => {
  const src = record(value)
  return {
    search: stringValue(src.search),
    ranks: stringArray(src.ranks ?? (src.rank ? [src.rank] : [])),
    base: stringValue(src.base),
    senMin: stringValue(src.senMin),
    senMax: stringValue(src.senMax),
    bornFrom: stringValue(src.bornFrom),
    bornTo: stringValue(src.bornTo),
  }
}

const cleanPairingFilter = (value: unknown): JsonRecord => {
  const src = record(value)
  return {
    search: stringValue(src.search),
    types: stringArray(src.types),
    carryIn: stringValue(src.carryIn),
    base: stringValue(src.base),
    airports: stringArray(src.airports),
    from: stringValue(src.from),
    to: stringValue(src.to),
    daysMin: stringValue(src.daysMin),
    daysMax: stringValue(src.daysMax),
  }
}

interface CrewPreviewRow {
  crew_id: string
  name: string
  rank: string
  base: string
  seniority: string
  division: string
  birthday: string
}

interface PairingPreviewRow {
  pairing_id: string
  label: string
  assignment: string
  type: string
  type_label: string
  carry_in: string
  base: string
  division: string
  start: string
  days: string
  airports: string[]
  ranks: string[]
}

const toCrewRow = (crew: ScenarioGanttCrew): CrewPreviewRow => ({
  crew_id: crew.crewId,
  name: stringValue(crew.crewName),
  rank: stringValue(crew.rank),
  base: stringValue(crew.base),
  seniority: stringValue(crew.seniorityNum),
  division: stringValue(crew.division),
  birthday: '',
})

const pairingTypeLabel = (assignmentGroup: unknown): string => {
  const code = stringValue(assignmentGroup)
  return code === 'FLY' || code === 'FLT' ? 'Pairing' : code
}

const toDate = (value: unknown): string => stringValue(value).slice(0, 10)

const pairingAirports = (pairing: ScenarioGanttPairing, data: ScenarioGanttData): string[] => {
  const airports = new Set<string>()
  for (const segment of data.pairingSegments.filter((row) => row.pairingId === pairing.pairingId)) {
    if (segment.depArp) airports.add(segment.depArp)
    if (segment.arvArp) airports.add(segment.arvArp)
  }
  return [...airports].sort()
}

const durationDays = (pairing: ScenarioGanttPairing): string => {
  const start = Date.parse(pairing.schStrDtUtc)
  const end = Date.parse(pairing.schEndDtUtc)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  return String(Math.max(1, Math.ceil((end - start) / 86_400_000)))
}

const toPairingRow = (pairing: ScenarioGanttPairing, data: ScenarioGanttData): PairingPreviewRow => {
  const start = toDate(pairing.schStrDtUtc)
  const periodStart = toDate(data.scenarioStrDt || data.strDtLoc)
  return {
    pairing_id: stringValue(pairing.sourcePairingId ?? pairing.pairingId),
    label: stringValue(pairing.pairingLabel ?? pairing.pairingId),
    assignment: stringValue(pairing.assignment),
    // Scenario Pairing Type filters use the assignment code (e.g. CRAM, PRAM),
    // while assignmentGroup remains the RES/FLY classification used by KPI.
    type: stringValue(pairing.assignment),
    type_label: pairingTypeLabel(pairing.assignment),
    carry_in: periodStart && start < periodStart ? 'Pre-assigned' : 'Open',
    base: stringValue(pairing.base),
    division: stringValue(pairing.division),
    start,
    days: durationDays(pairing),
    airports: pairingAirports(pairing, data),
    ranks: Array.isArray(pairing.compositions) ? pairing.compositions.map((slot) => slot.rank).filter(Boolean) : [],
  }
}

const crewMatchesTeamFilter = (row: CrewPreviewRow, rawFilter: unknown): boolean => {
  const filter = cleanCrewFilter(rawFilter)
  const needle = stringValue(filter.search).trim().toLowerCase()
  if (needle) {
    const hay = `${row.crew_id} ${row.name} ${row.base} ${row.division}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  const ranks = stringArray(filter.ranks)
  if (ranks.length && !ranks.includes(row.rank)) return false
  if (filter.base && row.base !== filter.base) return false
  const seniority = Number(row.seniority)
  const senMin = numberOrNull(filter.senMin)
  const senMax = numberOrNull(filter.senMax)
  if (senMin != null && !(seniority >= senMin)) return false
  if (senMax != null && !(seniority <= senMax)) return false
  if (filter.bornFrom || filter.bornTo) {
    if (!row.birthday) return false
    if (filter.bornFrom && !(row.birthday >= filter.bornFrom)) return false
    if (filter.bornTo && !(row.birthday <= filter.bornTo)) return false
  }
  return true
}

const pairingMatchesRuleFilter = (row: PairingPreviewRow, rawFilter: unknown): boolean => {
  const filter = cleanPairingFilter(rawFilter)
  const needle = stringValue(filter.search).trim().toLowerCase()
  if (needle) {
    const hay = `${row.pairing_id} ${row.label} ${row.base}`.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  const types = stringArray(filter.types)
  if (types.length && !types.includes(row.type)) return false
  const airports = stringArray(filter.airports)
  if (airports.length && !row.airports.some((airport) => airports.includes(airport))) return false
  if (filter.carryIn && row.carry_in !== filter.carryIn) return false
  if (filter.base && row.base !== filter.base) return false
  if (filter.from && !(row.start >= filter.from)) return false
  if (filter.to && !(row.start <= filter.to)) return false
  const days = Number(row.days)
  const daysMin = numberOrNull(filter.daysMin)
  const daysMax = numberOrNull(filter.daysMax)
  if (daysMin != null && !(days >= daysMin)) return false
  if (daysMax != null && !(days <= daysMax)) return false
  return true
}

const scenarioRoFilters = (scenarioDetail?: ScenarioDetail): { crew: RoFilterParams['crew']; pairing: RoFilterParams['pairing']; division: string; start: string; end: string } => {
  const raw = record(scenarioDetail?.filterParams)
  return {
    crew: normalizeRoCrewFilter(record(raw.crew) as Partial<RoFilterParams['crew']>),
    pairing: normalizeRoPairingFilter(record(raw.pairing) as Partial<RoFilterParams['pairing']>),
    division: normalizeCrewDivision(scenarioDetail?.division),
    start: toDate(scenarioDetail?.strDtLoc),
    end: toDate(scenarioDetail?.endDtLoc),
  }
}

const crewMatchesScenarioFilter = (row: CrewPreviewRow, filter: RoFilterParams['crew'], division: string): boolean => {
  if (division && row.division !== division) return false
  if (filter.bases.length && !filter.bases.includes(row.base)) return false
  if (filter.ranks.length && !filter.ranks.includes(row.rank)) return false
  const seniority = Number(row.seniority)
  if (filter.seniority.min != null && !(seniority >= filter.seniority.min)) return false
  if (filter.seniority.max != null && !(seniority <= filter.seniority.max)) return false
  if (filter.birthday.from || filter.birthday.to) {
    if (!row.birthday) return false
    if (filter.birthday.from && !(row.birthday >= filter.birthday.from)) return false
    if (filter.birthday.to && !(row.birthday <= filter.birthday.to)) return false
  }
  return true
}

const pairingMatchesScenarioFilter = (row: PairingPreviewRow, filter: RoFilterParams['pairing'], division: string): boolean => {
  if (division && row.division !== division) return false
  if (filter.bases.length && !filter.bases.includes(row.base)) return false
  if (filter.ranks.length && !row.ranks.some((rank) => filter.ranks.includes(rank))) return false
  if (filter.types.length && !filter.types.includes(row.type)) return false
  const days = Number(row.days)
  if (filter.duration.min != null && !(days >= filter.duration.min)) return false
  if (filter.duration.max != null && !(days <= filter.duration.max)) return false
  return true
}

export const __scenarioParameterEditorTest = {
  pairingMatchesRuleFilter,
  pairingMatchesScenarioFilter,
}

export const PreviewTable = ({
  rows,
  columns,
  emptyText,
  caption,
  warning,
  selectable = false,
  rowId,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
}: {
  rows: JsonRecord[]
  columns: { key: string; label: string }[]
  emptyText: string
  caption: string
  warning?: string | null
  selectable?: boolean
  rowId?: (row: JsonRecord) => string
  selectedIds?: string[]
  onToggleRow?: (id: string) => void
  onToggleAll?: (shouldSelectAll: boolean) => void
}): ReactNode => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 10,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const colSpan = columns.length + (selectable ? 1 : 0)
  const ids = rows.map((row) => (rowId ? rowId(row) : stringValue(row.id ?? row.crew_id ?? row.pairing_id)))
  const selectedCount = ids.filter((id) => selectedIds.includes(id)).length
  const allSelected = ids.length > 0 && selectedCount === ids.length
  const someSelected = selectedCount > 0 && !allSelected
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected
  }, [someSelected])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border">
      <div className="shrink-0 border-b border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">{caption}</div>
      {warning && <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">{warning}</div>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-8 border-b border-border px-2 py-1.5">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={allSelected}
                    onChange={() => onToggleAll?.(!allSelected)}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className="border-b border-border px-2 py-1.5 font-semibold">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-2 py-3 text-muted-foreground">{emptyText}</td></tr>
            ) : (
              <>
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: virtualItems[0].start }} /></tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  const id = rowId ? rowId(row) : stringValue(row.id ?? row.crew_id ?? row.pairing_id)
                  return (
                    <tr key={String(id)} className="odd:bg-background even:bg-muted/20">
                      {selectable && (
                        <td className="border-b border-border px-2 py-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${id}`}
                            className="h-3.5 w-3.5 accent-primary"
                            checked={selectedIds.includes(id)}
                            onChange={() => onToggleRow?.(id)}
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td key={column.key} className="border-b border-border px-2 py-1.5">{stringValue(row[column.key]) || '-'}</td>
                      ))}
                    </tr>
                  )
                })}
                {virtualItems.length > 0 && totalSize - (virtualItems[virtualItems.length - 1].end ?? 0) > 0 && (
                  <tr aria-hidden="true"><td colSpan={colSpan} style={{ height: totalSize - (virtualItems[virtualItems.length - 1].end ?? 0) }} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }): ReactNode => (
  <label className="flex flex-col gap-1">
    <span className="text-muted-foreground">{label}</span>
    <select className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Any</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
)

const CheckboxList = ({ label, values, options, onChange }: { label: string; values: string[]; options: { value: string; label: string; count?: number }[]; onChange: (values: string[]) => void }): ReactNode => {
  const toggle = (value: string): void => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="max-h-32 overflow-auto rounded border border-border p-2">
        {options.length === 0 ? <div className="text-muted-foreground">No options</div> : options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
            <span>{option.label}</span>
            {option.count != null && <span className="ml-auto text-muted-foreground">{option.count}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

const CrewFilterPanel = ({ filter, division, rankOptions, baseOptions, onChange }: { filter: JsonRecord; division: string; rankOptions: string[]; baseOptions: string[]; onChange: (filter: JsonRecord) => void }): ReactNode => {
  const clean = cleanCrewFilter(filter)
  const patch = (next: Partial<JsonRecord>): void => onChange({ ...clean, ...next })
  return (
    <aside className="space-y-3 rounded border border-border bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Crew Filter</span>
        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange(emptyCrewFilter())}>Clear</Button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Search</span>
        <Input className="h-7 text-xs" placeholder="Id, name, base..." value={stringValue(clean.search)} onChange={(event) => patch({ search: event.target.value })} />
      </label>
      <CheckboxList label="Rank" values={stringArray(clean.ranks)} options={rankOptions.map((rank) => ({ value: rank, label: rank }))} onChange={(ranks) => patch({ ranks })} />
      <FilterSelect label="Base" value={stringValue(clean.base)} options={baseOptions} onChange={(base) => patch({ base })} />
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Division</span>
        <Input
          aria-label="Team Division"
          data-testid="scenario-team-division"
          className="h-7 text-xs"
          value={division}
          readOnly
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Seniority</span>
        <div className="grid grid-cols-2 gap-2">
          <Input className="h-7 text-xs" type="number" placeholder=">=" aria-label="Seniority at least" value={stringValue(clean.senMin)} onChange={(event) => patch({ senMin: event.target.value })} />
          <Input className="h-7 text-xs" type="number" placeholder="<=" aria-label="Seniority at most" value={stringValue(clean.senMax)} onChange={(event) => patch({ senMax: event.target.value })} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Birthday</span>
        <label className="flex flex-col gap-1 text-muted-foreground">Born on/after<GanttEnglishDatePicker ariaLabel="Born on or after" value={stringValue(clean.bornFrom)} onValueChange={(value) => patch({ bornFrom: value })} /></label>
        <label className="flex flex-col gap-1 text-muted-foreground">Born on/before<GanttEnglishDatePicker ariaLabel="Born on or before" value={stringValue(clean.bornTo)} onValueChange={(value) => patch({ bornTo: value })} /></label>
      </div>
    </aside>
  )
}

const PairingFilterPanel = ({ filter, rows, onChange }: { filter: JsonRecord; rows: PairingPreviewRow[]; onChange: (filter: JsonRecord) => void }): ReactNode => {
  const clean = cleanPairingFilter(filter)
  const patch = (next: Partial<JsonRecord>): void => onChange({ ...clean, ...next })
  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    rows.forEach((row) => { if (row.type) counts.set(row.type, (counts.get(row.type) ?? 0) + 1) })
    const order = ['FLT', 'FLY', 'RES', 'SBY']
    const known = order.filter((code) => counts.has(code))
    const unknown = [...counts.keys()].filter((code) => !order.includes(code)).sort()
    return [...known, ...unknown].map((code) => ({ value: code, label: pairingTypeLabel(code), count: counts.get(code) ?? 0 }))
  }, [rows])
  const airportOptions = uniqueSorted(rows.flatMap((row) => row.airports))
  return (
    <aside className="space-y-3 rounded border border-border bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Pairing Filter</span>
        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange(emptyPairingFilter())}>Clear</Button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Search</span>
        <Input className="h-7 text-xs" placeholder="Id, label, base..." value={stringValue(clean.search)} onChange={(event) => patch({ search: event.target.value })} />
      </label>
      <CheckboxList label="Type" values={stringArray(clean.types)} options={typeOptions} onChange={(types) => patch({ types })} />
      <FilterSelect label="Carry-in" value={stringValue(clean.carryIn)} options={['Open', 'Pre-assigned']} onChange={(carryIn) => patch({ carryIn })} />
      <FilterSelect label="Base" value={stringValue(clean.base)} options={uniqueSorted(rows.map((row) => row.base))} onChange={(base) => patch({ base })} />
      <CheckboxList label="Airports visited" values={stringArray(clean.airports)} options={airportOptions.map((airport) => ({ value: airport, label: airport }))} onChange={(airports) => patch({ airports })} />
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Start date</span>
        <label className="flex flex-col gap-1 text-muted-foreground">From<GanttEnglishDatePicker ariaLabel="Pairing start from" value={stringValue(clean.from)} onValueChange={(value) => patch({ from: value })} /></label>
        <label className="flex flex-col gap-1 text-muted-foreground">To<GanttEnglishDatePicker ariaLabel="Pairing start to" value={stringValue(clean.to)} onValueChange={(value) => patch({ to: value })} /></label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Duration (days)</span>
        <div className="grid grid-cols-2 gap-2">
          <Input className="h-7 text-xs" type="number" placeholder=">=" aria-label="Duration at least" value={stringValue(clean.daysMin)} onChange={(event) => patch({ daysMin: event.target.value })} />
          <Input className="h-7 text-xs" type="number" placeholder="<=" aria-label="Duration at most" value={stringValue(clean.daysMax)} onChange={(event) => patch({ daysMax: event.target.value })} />
        </div>
      </div>
    </aside>
  )
}

const TeamEditor = ({
  team,
  crews,
  division,
  rankOptions,
  baseOptions,
  onCancel,
  onSave,
}: {
  team: JsonRecord
  crews: CrewPreviewRow[]
  division: string
  rankOptions: string[]
  baseOptions: string[]
  onCancel: () => void
  onSave: (team: JsonRecord) => void
}): ReactNode => {
  const [draft, setDraft] = useState(team)
  const filter = cleanCrewFilter(draft.crew_filter)
  const shown = useMemo(() => crews.filter((crew) => crewMatchesTeamFilter(crew, filter)), [crews, filter])
  const { selectedIds, toggle: toggleCrew, toggleAll: toggleAllCrews } = useRowSelection<CrewPreviewRow>({
    rows: crews,
    idOf: (crew) => crew.crew_id,
    stored: draft.crew_ids,
    matchesFilter: (crew) => crewMatchesTeamFilter(crew, draft.crew_filter),
  })
  const visibleIds = shown.map((crew) => crew.crew_id)
  return (
    <AppDialog open onOpenChange={(open) => !open && onCancel()} title={team.name ? `Edit Team - ${team.name}` : 'Add Team'} className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] sm:max-w-[940px]" bodyClassName="flex flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 text-xs">
        <div className="grid shrink-0 gap-2 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <label className="flex flex-col gap-1"><span>Name</span><Input className="h-8 text-xs" value={String(draft.name)} placeholder="e.g. Senior YVR CAs" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span>Description</span><Input className="h-8 text-xs" value={String(draft.description)} placeholder="optional" onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        </div>
        <div className="grid min-h-0 flex-1 items-stretch gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <CrewFilterPanel filter={filter} division={division} rankOptions={rankOptions} baseOptions={baseOptions} onChange={(crew_filter) => setDraft({ ...draft, crew_filter })} />
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <PreviewTable
              rows={shown as unknown as JsonRecord[]}
              caption={`${shown.length} of ${crews.length} crews match${shown.length === 0 ? ' - this team would be empty' : ''}`}
              columns={[{ key: 'crew_id', label: 'Crew' }, { key: 'name', label: 'Name' }, { key: 'rank', label: 'Rank' }, { key: 'base', label: 'Base' }, { key: 'seniority', label: 'Seniority' }, { key: 'division', label: 'Division' }]}
              emptyText="No crews match."
              selectable
              rowId={(row) => stringValue(row.crew_id)}
              selectedIds={selectedIds}
              onToggleRow={toggleCrew}
              onToggleAll={(shouldSelectAll) => toggleAllCrews(visibleIds, shouldSelectAll)}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{String(draft.name).trim() ? `${selectedIds.length} crews selected` : 'Name is required.'}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!String(draft.name).trim()} onClick={() => onSave({ ...draft, name: String(draft.name).trim(), crew_filter: filter, crew_ids: selectedIds })}>Done</Button>
        </div>
      </div>
    </AppDialog>
  )
}

const RuleEditor = ({
  rule,
  teams,
  pairings,
  onCancel,
  onSave,
}: {
  rule: JsonRecord
  teams: JsonRecord[]
  pairings: PairingPreviewRow[]
  onCancel: () => void
  onSave: (rule: JsonRecord) => void
}): ReactNode => {
  const [draft, setDraft] = useState(rule)
  const filter = cleanPairingFilter(draft.pairing_filter)
  const shown = useMemo(() => pairings.filter((pairing) => pairingMatchesRuleFilter(pairing, filter)), [pairings, filter])
  const { selectedIds, toggle: togglePairing, toggleAll: toggleAllPairings } = useRowSelection<PairingPreviewRow>({
    rows: pairings,
    idOf: (pairing) => pairing.pairing_id,
    stored: draft.pairing_ids,
    matchesFilter: (pairing) => pairingMatchesRuleFilter(pairing, draft.pairing_filter),
  })
  const visibleIds = shown.map((pairing) => pairing.pairing_id)
  const warn = draft.mode === 'only_do' && selectedIds.length === 0
    ? 'Matches no pairings - this team would be blocked from flying anything.'
    : null
  return (
    <AppDialog open onOpenChange={(open) => !open && onCancel()} title={rule.name ? `Edit Rule - ${rule.name}` : 'Add Rule'} className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] sm:max-w-[980px]" bodyClassName="flex flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 text-xs">
        <div className="grid shrink-0 gap-2 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <label className="flex flex-col gap-1"><span>Name</span><Input className="h-8 text-xs" value={String(draft.name)} placeholder="e.g. No redeyes" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1"><span>Team</span><select className="h-8 rounded border border-border bg-background px-2 text-xs" value={String(draft.team_id ?? '')} onChange={(e) => setDraft({ ...draft, team_id: e.target.value })}><option value="">Select...</option>{teams.map((team) => <option key={String(team.id)} value={String(team.id)}>{String(team.name)}</option>)}</select></label>
            <div><span className="mb-1 block">Mode</span><div className="flex gap-1"><Button type="button" className="h-8 px-3 text-xs" variant={draft.mode === 'only_do' ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, mode: 'only_do' })}>ONLY</Button><Button type="button" className="h-8 px-3 text-xs" variant={draft.mode === 'not_do' ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, mode: 'not_do' })}>NEVER</Button></div></div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {draft.mode === 'only_do'
            ? 'ONLY - the team may fly just the matched pairings. Everything else becomes forbidden for them.'
            : 'NEVER - the team may not fly any of the matched pairings. Everything else stays available.'}
        </p>
        <div className="grid min-h-0 flex-1 items-stretch gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
          <PairingFilterPanel filter={filter} rows={pairings} onChange={(pairing_filter) => setDraft({ ...draft, pairing_filter })} />
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <PreviewTable
              rows={shown as unknown as JsonRecord[]}
              caption={`${shown.length} of ${pairings.length} pairings match`}
              warning={warn}
              columns={[{ key: 'pairing_id', label: 'Pairing' }, { key: 'label', label: 'Label' }, { key: 'type_label', label: 'Type' }, { key: 'carry_in', label: 'Carry-in' }, { key: 'base', label: 'Base' }, { key: 'start', label: 'Start' }, { key: 'days', label: 'Days' }]}
              emptyText="No pairings match."
              selectable
              rowId={(row) => stringValue(row.pairing_id)}
              selectedIds={selectedIds}
              onToggleRow={togglePairing}
              onToggleAll={(shouldSelectAll) => toggleAllPairings(visibleIds, shouldSelectAll)}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{!String(draft.name).trim() ? 'Name is required.' : !String(draft.team_id).trim() ? 'Pick a team.' : `${selectedIds.length} pairings selected`}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!String(draft.name).trim() || !String(draft.team_id).trim()} onClick={() => onSave({ ...draft, name: String(draft.name).trim(), pairing_filter: filter, pairing_ids: selectedIds })}>Done</Button>
        </div>
      </div>
    </AppDialog>
  )
}

export const TeamRulesEditor = ({
  value,
  scenarioDetail,
  disabled,
  saving,
  onChange,
}: {
  value: unknown
  scenarioDetail?: ScenarioDetail
  disabled: boolean
  saving: boolean
  onChange: (value: unknown) => void
}): ReactNode => {
  const source = record(value)
  const teams = Array.isArray(source.teams) ? source.teams as JsonRecord[] : []
  const rules = Array.isArray(source.rules) ? source.rules as JsonRecord[] : []
  const [editingTeam, setEditingTeam] = useState<JsonRecord | null>(null)
  const [editingRule, setEditingRule] = useState<JsonRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [crewRows, setCrewRows] = useState<CrewPreviewRow[]>([])
  const [pairingRows, setPairingRows] = useState<PairingPreviewRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const filters = useMemo(() => scenarioRoFilters(scenarioDetail), [scenarioDetail])
  const scenarioDivision = stringValue(scenarioDetail?.division).trim()
  const { options: referenceBaseOptions } = useBaseOptions()
  const { options: referenceRankOptions } = useRankOptions(filters.division)
  const baseOptions = useMemo(
    () => filters.crew.bases.length > 0
      ? uniqueSorted(filters.crew.bases)
      : uniqueSorted(referenceBaseOptions.map((option) => option.value)),
    [filters.crew.bases, referenceBaseOptions],
  )
  const rankOptions = useMemo(
    () => filters.crew.ranks.length > 0
      ? uniqueSorted(filters.crew.ranks)
      : uniqueSorted(referenceRankOptions.map((option) => option.value)),
    [filters.crew.ranks, referenceRankOptions],
  )
  const teamName = (id: unknown) => teams.find((team) => String(team.id) === String(id))?.name ?? '(missing)'
  const teamCount = (team: JsonRecord): number =>
    Array.isArray(team.crew_ids) ? team.crew_ids.length : crewRows.filter((crew) => crewMatchesTeamFilter(crew, team.crew_filter)).length
  const ruleCount = (rule: JsonRecord): number =>
    Array.isArray(rule.pairing_ids) ? rule.pairing_ids.length : pairingRows.filter((pairing) => pairingMatchesRuleFilter(pairing, rule.pairing_filter)).length

  useEffect(() => {
    let active = true
    setPreviewLoading(true)
    setPreviewError(null)
    const load = async (): Promise<void> => {
      if (!scenarioDetail?.id) {
        setCrewRows([])
        setPairingRows([])
        return
      }
      const data = await scenarioGanttApi.getGanttData(scenarioDetail.id)
      if (!active) return
      const scopedCrews = data.crew
        .map(toCrewRow)
        .filter((crew) => crewMatchesScenarioFilter(crew, filters.crew, filters.division))
      const scopedPairings = data.pairings
        .map((pairing) => toPairingRow(pairing, data))
        .filter((pairing) => pairingMatchesScenarioFilter(pairing, filters.pairing, filters.division))
      setCrewRows(scopedCrews)
      setPairingRows(scopedPairings)
    }
    load()
      .catch((err) => {
        if (active) {
          setCrewRows([])
          setPairingRows([])
          setPreviewError(err instanceof Error ? err.message : 'Failed to load preview data')
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false)
      })
    return () => {
      active = false
    }
  }, [filters, scenarioDetail?.id])

  const saveTeam = (team: JsonRecord) => {
    onChange({ ...source, teams: teams.some((row) => row.id === team.id) ? teams.map((row) => row.id === team.id ? team : row) : [...teams, team] })
    setEditingTeam(null)
  }
  const saveRule = (rule: JsonRecord) => {
    onChange({ ...source, rules: rules.some((row) => row.id === rule.id) ? rules.map((row) => row.id === rule.id ? rule : row) : [...rules, rule] })
    setEditingRule(null)
  }
  const deleteTeam = (team: JsonRecord) => {
    const dependent = rules.filter((rule) => String(rule.team_id) === String(team.id))
    if (dependent.length > 0) {
      setDeleteError(`Cannot delete team "${String(team.name)}" - delete these Team Rules first: ${dependent.map((rule) => String(rule.name)).filter(Boolean).join(', ') || 'the rules attached to it'}.`)
      return
    }
    setDeleteError(null)
    onChange({ ...source, teams: teams.filter((row) => row.id !== team.id) })
  }
  const deleteRule = (rule: JsonRecord) => {
    setDeleteError(null)
    onChange({ ...source, rules: rules.filter((row) => row.id !== rule.id) })
  }
  return (
    <div className="space-y-3">
      <div className="font-semibold text-xs text-foreground">Team Rules</div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Teams are matched from the crews currently inside this Scenario's Crew Filter. Rules are matched from pairings currently inside this Scenario's Pairing Filter.
      </p>
      {previewLoading && <div className="rounded border border-border px-3 py-2 text-xs text-muted-foreground">Loading Team Rules preview data...</div>}
      {previewError && <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{previewError}</div>}
      <section className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-semibold text-xs">Teams</span>
          <Button type="button" variant="outline" className="h-7 px-2 text-xs" disabled={disabled || saving} onClick={() => setEditingTeam(blankTeam(nextId('t', teams)))}>+ Add Team</Button>
        </div>
        {teams.length === 0 ? <div className="px-3 py-3 text-xs text-muted-foreground">No teams yet.</div> : teams.map((team) => (
          <div key={String(team.id)} className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0">
            <span className="font-semibold">{String(team.name)}</span><span className="text-muted-foreground">{teamCount(team)} crews</span><span className="flex-1 text-muted-foreground">{String(team.description ?? '')}</span>
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingTeam(team)}>Edit</Button>
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={disabled || saving} onClick={() => deleteTeam(team)}>Delete</Button>
          </div>
        ))}
      </section>
      <section className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-semibold text-xs">Team Rules</span>
          <Button type="button" variant="outline" className="h-7 px-2 text-xs" disabled={disabled || saving || teams.length === 0} onClick={() => setEditingRule(blankRule(nextId('r', rules), String(teams[0]?.id ?? '')))}>+ Add Rule</Button>
        </div>
        {rules.length === 0 ? <div className="px-3 py-3 text-xs text-muted-foreground">{teams.length === 0 ? 'Add a team first.' : 'No rules yet.'}</div> : rules.map((rule) => (
          <div key={String(rule.id)} className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0">
            <span className="font-semibold">{String(rule.name)}</span><span>{String(rule.mode) === 'only_do' ? 'ONLY' : 'NEVER'}</span><span className="text-muted-foreground">{ruleCount(rule)} pairings</span><span className="flex-1 text-muted-foreground">{teamName(rule.team_id)}</span>
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingRule(rule)}>Edit</Button>
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={disabled || saving} onClick={() => deleteRule(rule)}>Delete</Button>
          </div>
        ))}
      </section>
      {deleteError && <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{deleteError}</div>}
      {editingTeam && <TeamEditor team={editingTeam} crews={crewRows} division={scenarioDivision} rankOptions={rankOptions} baseOptions={baseOptions} onCancel={() => setEditingTeam(null)} onSave={saveTeam} />}
      {editingRule && <RuleEditor rule={editingRule} teams={teams} pairings={pairingRows} onCancel={() => setEditingRule(null)} onSave={saveRule} />}
    </div>
  )
}
