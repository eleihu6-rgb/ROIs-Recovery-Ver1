// gantt/src/components/scenario/scenario-kpi-section.tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Download, ExternalLink, GitCompareArrows, Search, Table2, Trash2 } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { scenarioApi } from '@/services/scenario-api'
import { notify } from '@/utils/notify'
import { useShellStore } from '@/stores/shell-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { normalizeUtcIso } from '@/components/gantt/gantt-utils'
import { ScenarioNotesPanel, computeOpenCount } from './scenario-notes-panel'
import { ALL_RANKS, buildDays, buildDistribution, dayRange, rankOptions } from './distribution-model'
import { UTC } from './distribution-day-math'
import type {
  ScenarioKpi,
  ScenarioResultRow,
  ScenarioResults,
  ScenarioRunProgress,
  ScenarioStatus,
  ScenarioType,
  ScenarioVersion,
  ScenarioVersionDiff,
} from '@/types'

interface ScenarioKpiSectionProps {
  scenarioId: number
  fileType: ScenarioType
  results?: ScenarioResults
  status: ScenarioStatus
  division?: string | null
}

const KpiCard = ({ kpi }: { kpi: ScenarioKpi }): ReactNode => (
  <div
    className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-center"
    data-testid="kpi-card"
    data-kpi-name={kpi.kpiNames}
  >
    <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground" data-testid="kpi-card-name">
      {kpi.kpiNames}
    </div>
    <div className="text-base font-bold tabular-nums text-foreground" data-testid="kpi-card-value">
      {kpi.kpiValues}
    </div>
    {kpi.description && (
      <div className="break-words text-2xs text-muted-foreground" data-testid="kpi-card-description">{kpi.description}</div>
    )}
  </div>
)

type ResultTab = 'kpi' | 'credit-hours' | 'uncovered' | 'distribution' | 'versions' | 'notes'

const RESULT_TABS: Array<{ id: ResultTab; label: string }> = [
  { id: 'kpi', label: 'KPI' },
  { id: 'credit-hours', label: 'Credit Hours' },
  { id: 'uncovered', label: 'Uncovered' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'versions', label: 'Versions' },
  { id: 'notes', label: 'Notes' },
]

const EmptyTab = ({ label }: { label: string }): ReactNode => (
  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
    No {label} data available.
  </div>
)

interface ResultColumn {
  key: string
  label: string
}

const formatCell = (value: unknown): string => {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 3 })
  if (Array.isArray(value)) return value.map(formatCell).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const asRows = (value: unknown): ScenarioResultRow[] => Array.isArray(value) ? value as ScenarioResultRow[] : []

const num = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const rowMatches = (row: ScenarioResultRow, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return Object.values(row).some((value) => formatCell(value).toLowerCase().includes(q))
}

const csvCell = (value: unknown): string => {
  const text = formatCell(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const exportCsv = (title: string, rows: ScenarioResultRow[], columns: ResultColumn[]): void => {
  if (rows.length === 0) return
  const lines = [
    columns.map((column) => column.key).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'scenario-results'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const ResultTable = ({
  title,
  description,
  rows,
  columns,
  emptyLabel,
  testId,
}: {
  title: string
  description?: string
  rows: ScenarioResultRow[]
  columns: ResultColumn[]
  emptyLabel: string
  testId?: string
}): ReactNode => {
  const [query, setQuery] = useState('')
  if (rows.length === 0) return <EmptyTab label={emptyLabel} />
  const filteredRows = rows.filter((row) => rowMatches(row, query))
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border bg-background" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          {description && <div className="mt-0.5 text-2xs text-muted-foreground">{description}</div>}
        </div>
        <div className="flex h-7 min-w-[12rem] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search table"
            aria-label={`${title} search`}
          />
        </div>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          onClick={() => exportCsv(title, filteredRows, columns)}
          data-testid={`${testId ?? 'result-table'}-export`}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-2xs uppercase text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={String(row.id ?? row.task_id ?? row.crew_id ?? row.month ?? index)} className="odd:bg-background even:bg-muted/20 hover:bg-accent/40">
                {columns.map((column) => (
                  <td key={column.key} className="whitespace-nowrap border-b border-border/60 px-2.5 py-1.5 tabular-nums text-foreground">
                    {formatCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="h-16 text-center text-xs text-muted-foreground">
                  No rows match the search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const CREDIT_COLUMNS = [
  { key: 'crew_id', label: 'Crew Id' },
  { key: 'base', label: 'Base' },
  { key: 'rank', label: 'Rank' },
  { key: 'credited_hours', label: 'Credited Hours' },
  { key: 'credit_min', label: 'Credit Min' },
  { key: 'credit_max', label: 'Credit Max' },
  { key: 'pre_assigned_types', label: 'Pre Assigned Types' },
  { key: 'in_range', label: 'In Range' },
  { key: 'available_days', label: 'Available Days' },
  { key: 'per_day_rate', label: 'Per Day Rate' },
  { key: 'period_credit_target', label: 'Period Credit Target' },
  { key: 'target_gap', label: 'Target Gap' },
  { key: 'preassign_rest_days', label: 'Preassign Rest Days' },
  { key: 'required_dayoff', label: 'Required Dayoff' },
  { key: 'actual_dayoff', label: 'Actual Dayoff' },
  { key: 'dayoff_ok', label: 'Dayoff Ok' },
]

const UNCOVERED_COLUMNS = [
  { key: 'type', label: 'Type' },
  { key: 'pairing_id', label: 'Pairing Id' },
  { key: 'task_id', label: 'Task Id' },
  { key: 'name', label: 'Name' },
  { key: 'base', label: 'Base' },
  { key: 'rank', label: 'Rank' },
  { key: 'start_base', label: 'Start Base' },
  { key: 'end_base', label: 'End Base' },
  { key: 'credit', label: 'Credit' },
]

const SummaryTile = ({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}): ReactNode => {
  const toneClass = tone === 'good'
    ? 'text-emerald-600'
    : tone === 'warn'
      ? 'text-amber-600'
      : tone === 'bad'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div className="min-w-[8rem] flex-1 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-2xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-2xs text-muted-foreground">{sub}</div>
    </div>
  )
}

const SectionTitle = ({ title, description }: { title: string; description?: string }): ReactNode => (
  <div className="mb-2 flex min-w-0 items-start gap-2">
    <div className="mt-0.5 h-5 w-1 shrink-0 rounded bg-primary" />
    <div className="min-w-0">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && <div className="mt-0.5 text-2xs text-muted-foreground">{description}</div>}
    </div>
  </div>
)

const SegmentButton = ({
  active,
  children,
  testId,
  onClick,
}: {
  active: boolean
  children: ReactNode
  testId?: string
  onClick: () => void
}): ReactNode => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={active}
    onClick={onClick}
    className={[
      'inline-flex h-7 items-center justify-center gap-1 rounded px-2 text-xs font-medium transition-colors',
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
    ].join(' ')}
  >
    {children}
  </button>
)

const SegmentGroup = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <div className="flex min-w-0 items-center gap-1">
    <span className="shrink-0 text-2xs font-semibold uppercase text-muted-foreground">{label}</span>
    <div className="inline-flex min-w-0 overflow-hidden rounded-md border border-border bg-muted/30 p-0.5" role="group" aria-label={label}>
      {children}
    </div>
  </div>
)

const reportGeneral = (rawResult: unknown): Record<string, unknown> => asRecord(asRecord(rawResult).general_kpi)
const reportScheduling = (rawResult: unknown): Record<string, unknown> => asRecord(asRecord(rawResult).scheduling_details)
const reportMetadata = (rawResult: unknown): Record<string, unknown> => asRecord(asRecord(rawResult).metadata)

const reportCreditRows = (rawResult: unknown): ScenarioResultRow[] => {
  const reportRows = asRows(reportGeneral(rawResult).credit_hour_report)
  if (reportRows.length > 0) return reportRows
  return asRows(asRecord(asRecord(rawResult).resultMeta).credit_hour_report)
}

const CreditHoursPanel = ({ rows, rawResult }: { rows: ScenarioResultRow[]; rawResult: unknown }): ReactNode => {
  const metadata = reportMetadata(rawResult)
  const note = String(metadata.credit_roster_period_note ?? '')
  return (
    <div className="space-y-3">
      <SectionTitle
        title="Credit Hours"
        description="Report-shaped crew credit table with target band, pre-assignment, day-off, and range compliance fields."
      />
      <ResultTable
        title="Credit Hours per Crew"
        description={note || 'Fields follow the Report module credit-hour table.'}
        rows={rows}
        columns={CREDIT_COLUMNS}
        emptyLabel="Credit Hours"
        testId="scenario-credit-hours-table"
      />
    </div>
  )
}

const localDateTimeFormatterByZone = new Map<string, Intl.DateTimeFormat>()
const formatBaseLocalDateTime = (
  value: unknown,
  base: unknown,
  zoneIdFor: (airport: string) => string | undefined,
): string => {
  const text = String(value ?? '').trim()
  if (!text || !text.includes('T')) return text || '-'
  const zoneId = zoneIdFor(String(base ?? '').trim()) ?? 'UTC'
  let formatter = localDateTimeFormatterByZone.get(zoneId)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    localDateTimeFormatterByZone.set(zoneId, formatter)
  }
  return formatter.format(new Date(normalizeUtcIso(text))).replace(',', '')
}

const UncoveredPanel = ({ fallbackRows, rawResult }: { fallbackRows: ScenarioResultRow[]; rawResult: unknown }): ReactNode => {
  const scheduling = reportScheduling(rawResult)
  const metadata = reportMetadata(rawResult)
  const airportTimezoneMap = useAirportTzStore((state) => state.map)
  const loadAirportTimezones = useAirportTzStore((state) => state.load)
  useEffect(() => {
    void loadAirportTimezones()
  }, [loadAirportTimezones])

  // The Report's Results "Uncovered Pairings & Reserves" table: the
  // pairing_complement rows the solver left unassigned, Pairing first then
  // Reserve (resultsTables.uncoveredRows). scheduling_details is authoritative
  // when present; older scenarios fall back to the computed results.uncovered.
  const hasScheduling = Array.isArray(scheduling.pairing_complement)
  const complementRows = hasScheduling
    ? (scheduling.pairing_complement as ScenarioResultRow[])
        .filter((row) => String(row.coverage_status ?? '').toLowerCase() === 'unassigned')
        .map((row) => ({
          type: row.coverage_type ?? row.type,
          pairing_id: row.original_pairing_id ?? row.pairing_id,
          task_id: row.task_id,
          name: row.name,
          base: row.base,
          rank: row.rank,
          start_base: row.start_base,
          end_base: row.end_base,
          credit: row.credit,
        }))
    : []
  const rawRows = hasScheduling ? complementRows : fallbackRows
  const rows = rawRows.map((row) => ({
    ...row,
    start_base: formatBaseLocalDateTime(row.start_base, row.base, (airport) => airportTimezoneMap[airport]),
    end_base: formatBaseLocalDateTime(row.end_base, row.base, (airport) => airportTimezoneMap[airport]),
  }))
  const note = String(metadata.credit_roster_period_note ?? '')

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Uncovered"
        description="Open pairing and reserve slots the solver left unassigned — the Report's Results Uncovered table."
      />
      <ResultTable
        title="Uncovered Pairings & Reserves"
        description={`${rows.length} row${rows.length === 1 ? '' : 's'}${note ? ` · ${note}` : ''}`}
        rows={rows}
        columns={UNCOVERED_COLUMNS}
        emptyLabel="Uncovered"
        testId="scenario-uncovered-table"
      />
    </div>
  )
}

type DistributionView = 'chart' | 'table'
type SlotType = 'ALL' | 'PAIRING' | 'RESERVE'

/** Client-computable distribution source, persisted by live-server at save time. */
interface DistributionSourceTask {
  kind: 'assigned' | 'preassign'
  reserve?: boolean
  start: string
  end: string
}
interface DistributionSourceCrew {
  crew_id: string
  rank: string
  tasks: DistributionSourceTask[]
}
interface DistributionSourceDemand {
  rank: string
  reserve: boolean
  start: string
  end: string
}
interface DistributionSourceTimezone {
  base: string
  tz: string
}
interface DistributionSource {
  version: 2
  window: { start: string; end: string }
  timezones: DistributionSourceTimezone[]
  crews: DistributionSourceCrew[]
  demand: DistributionSourceDemand[]
}

const isDistributionSource = (value: unknown): value is DistributionSource => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && Array.isArray((value as DistributionSource).crews)
)

/** One chartable/tableable day row, shared by the source and legacy paths. */
interface DistributionViewRow {
  key: string
  dayLabel: string
  weekday: string
  dayNum: number
  month: string
  weekend: boolean
  monthStart: boolean
  pairing: number
  reserve: number
  on_duty: number
  available: number
  idle: number
  uncovered_pairing: number
  uncovered_reserve: number
}

const formatDistributionDay = (value: unknown): string => {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(`${text.slice(0, 10)}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** Weekday/weekend/month metadata from a YYYY-MM-DD date (legacy rows are UTC dates). */
const dayMetaFromUtcDate = (date: string): { weekday: string; dayNum: number; month: string; weekend: boolean; monthStart: boolean } => {
  const d = new Date(`${String(date ?? '').slice(0, 10)}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return { weekday: '', dayNum: 0, month: '', weekend: false, monthStart: false }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d)
  const dayNum = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(d))
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(d)
  return { weekday, dayNum, month, weekend: weekday === 'Sat' || weekday === 'Sun', monthStart: dayNum === 1 }
}

interface LegacyDistributionDayRow extends ScenarioResultRow {
  key: string
  day: string
  pairing: number
  reserve: number
  on_duty: number
  available: number
  idle: number
  uncovered_pairing: number
  uncovered_reserve: number
}

const legacyDistributionDayRows = (rows: ScenarioResultRow[]): LegacyDistributionDayRow[] => rows.map((row) => {
  const pairing = num(row.pairing ?? row.assigned_pairing ?? row.assigned_pairing_slots)
  const reserve = num(row.reserve ?? row.assigned_reserve ?? row.assigned_reserve_slots)
  const onDuty = num(row.on_duty ?? pairing + reserve)
  const available = num(row.available ?? row.available_crew)
  const rawDate = String(row.day ?? row.date ?? row.month ?? '').slice(0, 10)
  return {
    ...row,
    key: rawDate,
    day: formatDistributionDay(rawDate),
    pairing,
    reserve,
    on_duty: onDuty,
    available,
    idle: row.idle == null ? available - onDuty : num(row.idle),
    uncovered_pairing: num(row.uncovered_pairing ?? row.unc_pairing),
    uncovered_reserve: num(row.uncovered_reserve ?? row.unc_reserve),
  }
})

const distributionTimezoneLabel = (rawResult: unknown): string => {
  const metadata = reportMetadata(rawResult)
  const explicit = metadata.distribution_timezone_label ?? metadata.timezone_label ?? metadata.primary_timezone_label
  if (explicit) return String(explicit)
  const base = metadata.primary_base ?? metadata.base ?? metadata.home_base
  if (base) return `${String(base)} local`
  return 'Report local'
}

const DistributionChartPanel = ({
  title,
  subtitle,
  rows,
  slotType,
  variant,
  hoveredIndex,
  onHover,
  uncoveredSlots,
}: {
  title: string
  subtitle: string
  rows: DistributionViewRow[]
  slotType: SlotType
  variant: 'load' | 'uncovered'
  hoveredIndex: number | null
  onHover: (index: number | null) => void
  uncoveredSlots?: number
}): ReactNode => {
  const [chartWidth, setChartWidth] = useState(900)
  const plotContentRef = useRef<HTMLDivElement | null>(null)
  const chartHeight = 256

  useEffect(() => {
    const element = plotContentRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const updateWidth = (): void => {
      setChartWidth(Math.max(320, Math.round(element.getBoundingClientRect().width)))
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [rows.length])

  if (rows.length === 0) return <EmptyTab label="Distribution" />
  const showPairing = slotType !== 'RESERVE'
  const showReserve = slotType !== 'PAIRING'
  const max = Math.max(1, ...rows.map((row) => {
    if (variant === 'uncovered') {
      return (showPairing ? row.uncovered_pairing : 0) + (showReserve ? row.uncovered_reserve : 0)
    }
    return Math.max((showPairing ? row.pairing : 0) + (showReserve ? row.reserve : 0), row.available)
  }))
  const plotLeft = 48
  const plotRight = 18
  const plotTop = 16
  const plotBottom = 44
  const plotWidth = chartWidth - plotLeft - plotRight
  const plotHeight = chartHeight - plotTop - plotBottom
  const bandWidth = plotWidth / rows.length
  const xFor = (index: number): number => plotLeft + bandWidth * (index + 0.5)
  const yFor = (value: number): number => plotTop + plotHeight - (value / max) * plotHeight
  const barWidth = Math.max(4, Math.min(16, bandWidth * 0.55))
  const hoveredRow = hoveredIndex == null ? null : rows[hoveredIndex]
  const tooltipLeft = hoveredIndex == null
    ? 50
    : Math.min(88, Math.max(12, ((hoveredIndex + 0.5) / rows.length) * 100))
  const total = (row: DistributionViewRow): number => variant === 'load'
    ? (showPairing ? row.pairing : 0) + (showReserve ? row.reserve : 0)
    : (showPairing ? row.uncovered_pairing : 0) + (showReserve ? row.uncovered_reserve : 0)
  const tickEvery = rows.length > 45 ? 2 : 1
  return (
    <section className="w-full min-w-0 space-y-2 rounded-md border border-border bg-background p-3" data-testid={variant === 'load' ? 'scenario-distribution-chart' : 'scenario-distribution-uncovered-chart'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-2xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3" data-testid="dist-legend">
          {showPairing && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <i className="h-2 w-2 shrink-0 rounded-sm bg-primary" />Pairing
            </span>
          )}
          {showReserve && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <i className="h-2 w-2 shrink-0 rounded-sm bg-amber-500" />Reserve
            </span>
          )}
          {variant === 'load' && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <i className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />Available crew
            </span>
          )}
          {variant === 'uncovered' && (
            <div className="rounded-md bg-destructive/10 px-2 py-1 text-2xs font-semibold text-destructive">
              {uncoveredSlots ?? 0} slot{(uncoveredSlots ?? 0) === 1 ? '' : 's'} open
            </div>
          )}
        </div>
      </div>
      <div className="relative min-w-0 overflow-hidden rounded-md border border-border/60 bg-muted/10 px-2 pt-2" data-testid={`${variant === 'load' ? 'scenario-distribution-load' : 'scenario-distribution-uncovered'}-plot`}>
        <div ref={plotContentRef} className="w-full min-w-0">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="block h-64 w-full" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
            {rows.map((row, index) => {
              if (!row.weekend) return null
              return (
                <rect
                  key={`weekend-${row.key}`}
                  data-testid="dist-weekend"
                  x={plotLeft + bandWidth * index}
                  y={plotTop}
                  width={bandWidth}
                  height={plotHeight}
                  style={{ fill: 'var(--destructive)', opacity: 0.08 }}
                />
              )
            })}
            {rows.map((row, index) => {
              if (!row.monthStart || index === 0) return null
              const x = plotLeft + bandWidth * index
              return <line key={`month-${row.key}`} x1={x} x2={x} y1={plotTop} y2={plotTop + plotHeight} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
            })}
            {[0, 0.5, 1].map((ratio) => {
              const value = max * ratio
              const y = yFor(value)
              return (
                <g key={ratio}>
                  <line x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
                  <text x={plotLeft - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-2xs">{Math.round(value)}</text>
                </g>
              )
            })}
            <line x1={plotLeft} x2={chartWidth - plotRight} y1={plotTop + plotHeight} y2={plotTop + plotHeight} stroke="currentColor" className="text-border" />
            {hoveredIndex != null && (
              <line data-testid="dist-cursor" x1={xFor(hoveredIndex)} x2={xFor(hoveredIndex)} y1={plotTop} y2={plotTop + plotHeight} stroke="currentColor" className="text-primary/40" strokeDasharray="2 2" />
            )}
            {variant === 'load' && <polyline points={rows.map((row, index) => `${xFor(index)},${yFor(row.available)}`).join(' ')} fill="none" stroke="currentColor" className="text-emerald-500" strokeWidth="2" />}
            {rows.map((row, index) => {
              const x = xFor(index)
              const pairing = variant === 'load' ? row.pairing : row.uncovered_pairing
              const reserve = variant === 'load' ? row.reserve : row.uncovered_reserve
              const pairingX = x - (showReserve ? barWidth : barWidth / 2)
              const reserveX = x
              const isHovered = hoveredIndex === index
              return (
                <g
                  key={`${variant}-${row.key}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.dayLabel}: ${total(row)} ${variant === 'load' ? 'on duty' : 'open'}`}
                  onMouseEnter={() => onHover(index)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(index)}
                  onBlur={() => onHover(null)}
                  className="cursor-pointer outline-none"
                >
                  {showPairing && pairing > 0 && <rect x={pairingX} y={yFor(pairing)} width={barWidth} height={plotTop + plotHeight - yFor(pairing)} rx="2" className="fill-primary" />}
                  {showReserve && reserve > 0 && <rect x={reserveX} y={yFor(reserve)} width={barWidth} height={plotTop + plotHeight - yFor(reserve)} rx="2" className="fill-amber-500" />}
                  {variant === 'load' && <circle cx={x} cy={yFor(row.available)} r={isHovered ? 4 : 3} className="fill-emerald-500 stroke-background" strokeWidth="2" />}
                  {index % tickEvery === 0 && (
                    <text transform={`translate(${x}, ${chartHeight - 12})`} textAnchor="middle" className="text-2xs">
                      <tspan x={0} dy={0} className={row.weekend ? 'fill-destructive' : 'fill-muted-foreground'}>{row.weekday}</tspan>
                      <tspan x={0} dy={11} className="fill-muted-foreground">{row.monthStart ? `${row.month} ${row.dayNum}` : String(row.dayNum)}</tspan>
                    </text>
                  )}
                  <rect x={plotLeft + bandWidth * index} y={plotTop} width={bandWidth} height={plotHeight} fill="transparent" />
                </g>
              )
            })}
          </svg>
          {hoveredRow && (
            <div className="pointer-events-none absolute top-3 z-20 w-52 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg" style={{ left: `${tooltipLeft}%` }} data-testid={`${variant === 'load' ? 'scenario-distribution-load' : 'scenario-distribution-uncovered'}-tooltip`}>
              <div className="font-semibold">{hoveredRow.dayLabel}</div>
              {variant === 'load' ? (
                <>
                  <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Pairing</span><span className="font-mono tabular-nums">{hoveredRow.pairing}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Reserve</span><span className="font-mono tabular-nums">{hoveredRow.reserve}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">On duty</span><span className="font-mono tabular-nums">{hoveredRow.on_duty}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Available crew</span><span className="font-mono tabular-nums">{hoveredRow.available}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Idle</span><span className="font-mono tabular-nums">{hoveredRow.idle}</span></div>
                </>
              ) : (
                <>
                  <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Uncovered pairing</span><span className="font-mono tabular-nums">{hoveredRow.uncovered_pairing}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Uncovered reserve</span><span className="font-mono tabular-nums">{hoveredRow.uncovered_reserve}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Open slots</span><span className="font-mono tabular-nums">{total(hoveredRow)}</span></div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const DistributionTable = ({ rows, showPairing, showReserve }: { rows: DistributionViewRow[]; showPairing: boolean; showReserve: boolean }): ReactNode => {
  if (rows.length === 0) return <EmptyTab label="Distribution" />
  const both = showPairing && showReserve
  const thClass = 'whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left font-semibold'
  const tdClass = 'whitespace-nowrap border-b border-border/60 px-2.5 py-1.5 tabular-nums text-foreground'
  const tfClass = 'whitespace-nowrap border-t border-border px-2.5 py-1.5 tabular-nums'
  const sum = (key: keyof Pick<DistributionViewRow, 'pairing' | 'reserve' | 'on_duty' | 'uncovered_pairing' | 'uncovered_reserve'>): number =>
    rows.reduce((total, row) => total + row[key], 0)
  const avgAvailable = rows.reduce((total, row) => total + row.available, 0) / Math.max(1, rows.length)
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border bg-background" data-testid="scenario-distribution-table">
      <div className="border-b border-border bg-muted/30 px-3 py-2">
        <div className="text-xs font-semibold text-foreground">Daily Distribution</div>
        <div className="mt-0.5 text-2xs text-muted-foreground">Slot-day rows follow the Report distribution table.</div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-2xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className={thClass}>Day</th>
              {showPairing && <th scope="col" className={thClass}>Pairing</th>}
              {showReserve && <th scope="col" className={thClass}>Reserve</th>}
              {both && <th scope="col" className={thClass}>On duty</th>}
              <th scope="col" className={thClass}>Available</th>
              <th scope="col" className={thClass}>Idle</th>
              {showPairing && <th scope="col" className={thClass}>Unc. pairing</th>}
              {showReserve && <th scope="col" className={thClass}>Unc. reserve</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`odd:bg-background even:bg-muted/20 hover:bg-accent/40${row.weekend ? ' weekend bg-destructive/5' : ''}`}>
                <td className={`${tdClass} text-foreground`}>{row.dayLabel}</td>
                {showPairing && <td className={tdClass}>{row.pairing}</td>}
                {showReserve && <td className={tdClass}>{row.reserve}</td>}
                {both && <td className={`${tdClass} font-semibold`}>{row.on_duty}</td>}
                <td className={tdClass}>{row.available}</td>
                <td className={tdClass}>{row.idle}</td>
                {showPairing && <td className={`${tdClass}${row.uncovered_pairing > 0 ? ' text-destructive' : ''}`}>{row.uncovered_pairing}</td>}
                {showReserve && <td className={`${tdClass}${row.uncovered_reserve > 0 ? ' text-destructive' : ''}`}>{row.uncovered_reserve}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 text-xs font-semibold text-foreground">
            <tr>
              <td className={`${tfClass} text-foreground`}>Σ slot-days</td>
              {showPairing && <td className={tfClass}>{sum('pairing')}</td>}
              {showReserve && <td className={tfClass}>{sum('reserve')}</td>}
              {both && <td className={tfClass}>{sum('on_duty')}</td>}
              <td className={tfClass}>avg {avgAvailable.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="border-t border-border px-2.5 py-1.5" />
              {showPairing && <td className={tfClass}>{sum('uncovered_pairing')}</td>}
              {showReserve && <td className={tfClass}>{sum('uncovered_reserve')}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

const DistributionPanel = ({ distribution, rawResult }: { distribution: unknown; rawResult: unknown }): ReactNode => {
  const source = isDistributionSource(distribution) ? distribution : null
  const legacyRows = Array.isArray(distribution) ? distribution as ScenarioResultRow[] : []
  const [view, setView] = useState<DistributionView>('chart')
  const [slotType, setSlotType] = useState<SlotType>('ALL')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [rank, setRank] = useState<string>(ALL_RANKS)
  const [tz, setTz] = useState<string>(source?.timezones[0]?.tz ?? UTC)

  const tzOptions = source
    ? [
        { tz: UTC, label: UTC },
        ...source.timezones.map((t) => ({ tz: t.tz, label: t.base })),
      ]
    : []
  const activeTz = source
    ? (tzOptions.some((o) => o.tz === tz) ? tz : (source.timezones[0]?.tz ?? UTC))
    : UTC
  const ranks = source ? rankOptions(source.crews, source.demand) : []
  const activeRank = source ? (rank === ALL_RANKS || ranks.includes(rank) ? rank : ALL_RANKS) : ALL_RANKS

  const sourceRange = source ? dayRange(source.crews, source.window, source.demand, activeTz) : null
  const sourceGrid = source && sourceRange ? buildDays(sourceRange, activeTz) : []
  const sourceData = source && sourceGrid.length > 0 ? buildDistribution(source.crews, source.demand, sourceGrid, activeRank) : null
  const sourceViewRows: DistributionViewRow[] = sourceData ? sourceData.rows.map((row, i) => {
    const m = sourceGrid[i]
    return {
      key: m.key,
      dayLabel: `${m.weekday}, ${m.month} ${m.day}`,
      weekday: m.weekday,
      dayNum: m.day,
      month: m.month,
      weekend: m.weekend,
      monthStart: m.monthStart,
      pairing: row.assignedPairing,
      reserve: row.assignedReserve,
      on_duty: row.assignedPairing + row.assignedReserve,
      available: row.available,
      idle: row.available - row.assignedPairing - row.assignedReserve,
      uncovered_pairing: row.uncoveredPairing,
      uncovered_reserve: row.uncoveredReserve,
    }
  }) : []

  const legacyDayRows = legacyDistributionDayRows(legacyRows)
  const legacyViewRows: DistributionViewRow[] = legacyDayRows.map((row) => {
    const meta = dayMetaFromUtcDate(row.key)
    return {
      key: row.key,
      dayLabel: row.day,
      weekday: meta.weekday,
      dayNum: meta.dayNum,
      month: meta.month,
      weekend: meta.weekend,
      monthStart: meta.monthStart,
      pairing: row.pairing,
      reserve: row.reserve,
      on_duty: row.on_duty,
      available: row.available,
      idle: row.idle,
      uncovered_pairing: row.uncovered_pairing,
      uncovered_reserve: row.uncovered_reserve,
    }
  })

  const viewRows = source ? sourceViewRows : legacyViewRows
  const showPairing = slotType !== 'RESERVE'
  const showReserve = slotType !== 'PAIRING'

  let assignedPairing: number
  let assignedReserve: number
  let uncoveredPairing: number
  let uncoveredReserve: number
  let busyDays: number
  let availableDays: number
  let avgAvailable: number
  let crewCount: number | null

  if (source && sourceData) {
    const t = sourceData.totals
    assignedPairing = t.assignedPairingSlots
    assignedReserve = t.assignedReserveSlots
    uncoveredPairing = t.uncoveredPairingSlots
    uncoveredReserve = t.uncoveredReserveSlots
    busyDays = slotType === 'ALL' ? t.busyCrewDays : slotType === 'PAIRING' ? t.busyPairingCrewDays : t.busyReserveCrewDays
    availableDays = t.availableCrewDays
    avgAvailable = t.avgAvailable
    crewCount = t.crewCount
  } else {
    const totals = legacyDayRows[0] ?? {}
    assignedPairing = totals.assigned_pairing_slots_total == null
      ? legacyDayRows.reduce((sum, row) => sum + row.pairing, 0)
      : num(totals.assigned_pairing_slots_total)
    assignedReserve = totals.assigned_reserve_slots_total == null
      ? legacyDayRows.reduce((sum, row) => sum + row.reserve, 0)
      : num(totals.assigned_reserve_slots_total)
    uncoveredPairing = totals.uncovered_pairing_slots_total == null
      ? legacyDayRows.reduce((sum, row) => sum + row.uncovered_pairing, 0)
      : num(totals.uncovered_pairing_slots_total)
    uncoveredReserve = totals.uncovered_reserve_slots_total == null
      ? legacyDayRows.reduce((sum, row) => sum + row.uncovered_reserve, 0)
      : num(totals.uncovered_reserve_slots_total)
    const fallbackBusyDays = legacyDayRows.reduce((sum, row) => sum + Math.min(row.available, (showPairing ? row.pairing : 0) + (showReserve ? row.reserve : 0)), 0)
    busyDays = slotType === 'ALL'
      ? num(totals.busy_crew_days_total ?? fallbackBusyDays)
      : slotType === 'PAIRING'
        ? num(totals.busy_pairing_crew_days_total ?? fallbackBusyDays)
        : num(totals.busy_reserve_crew_days_total ?? fallbackBusyDays)
    availableDays = num(totals.available_crew_days_total ?? legacyDayRows.reduce((sum, row) => sum + row.available, 0))
    avgAvailable = legacyDayRows.length ? availableDays / legacyDayRows.length : 0
    crewCount = null
  }

  const assignedShown = (showPairing ? assignedPairing : 0) + (showReserve ? assignedReserve : 0)
  const uncoveredShown = (showPairing ? uncoveredPairing : 0) + (showReserve ? uncoveredReserve : 0)
  const peak = viewRows.reduce<{ load: number; day: string }>((best, row) => {
    const load = (showPairing ? row.pairing : 0) + (showReserve ? row.reserve : 0)
    return load > best.load ? { load, day: row.dayLabel } : best
  }, { load: 0, day: '' })
  const utilization = availableDays > 0 ? Math.round((busyDays / availableDays) * 100) : null
  const timezoneLabel = source
    ? (activeTz === UTC ? UTC : `${tzOptions.find((o) => o.tz === activeTz)?.label ?? activeTz} local`)
    : distributionTimezoneLabel(rawResult)
  const typeSuffix = slotType === 'ALL' ? '' : slotType === 'PAIRING' ? ' · pairing only' : ' · reserve only'
  const rankSuffix = source && activeRank !== ALL_RANKS ? ` · ${activeRank}` : ''
  const note = source && crewCount != null
    ? `${viewRows.length} days · ${crewCount} crew${rankSuffix}`
    : null

  return (
    <div className="min-w-0 space-y-3">
      <SectionTitle
        title="Distribution"
        description="Daily slot-day distribution aligned with the Report schedule visualization."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentGroup label="Type">
            {(['ALL', 'PAIRING', 'RESERVE'] as const).map((item) => (
              <SegmentButton key={item} active={slotType === item} onClick={() => setSlotType(item)} testId={`scenario-distribution-type-${item.toLowerCase()}`}>
                {item === 'ALL' ? 'Both' : item === 'PAIRING' ? 'Pairing' : 'Reserve'}
              </SegmentButton>
            ))}
          </SegmentGroup>
          {source && (
            <SegmentGroup label="Rank">
              {[ALL_RANKS, ...ranks].map((item) => (
                <SegmentButton key={item} active={activeRank === item} onClick={() => setRank(item)} testId={`scenario-distribution-rank-${item.toLowerCase()}`}>
                  {item === ALL_RANKS ? 'All ranks' : item}
                </SegmentButton>
              ))}
            </SegmentGroup>
          )}
          <SegmentGroup label="View">
            <SegmentButton active={view === 'chart'} onClick={() => { setHoveredIndex(null); setView('chart') }} testId="scenario-distribution-view-chart">
              <BarChart3 className="h-3.5 w-3.5" />Chart
            </SegmentButton>
            <SegmentButton active={view === 'table'} onClick={() => { setHoveredIndex(null); setView('table') }} testId="scenario-distribution-view-table">
              <Table2 className="h-3.5 w-3.5" />Table
            </SegmentButton>
          </SegmentGroup>
          {source && (
            <SegmentGroup label="Timezone">
              {tzOptions.map((opt) => (
                <SegmentButton key={opt.tz} active={activeTz === opt.tz} onClick={() => setTz(opt.tz)} testId={`scenario-distribution-tz-${opt.tz === UTC ? 'utc' : opt.label.toLowerCase()}`}>
                  {opt.label}
                </SegmentButton>
              ))}
            </SegmentGroup>
          )}
        </div>
        {note && <span className="shrink-0 text-2xs text-muted-foreground">{note}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <SummaryTile label="Assigned slots" value={String(assignedShown)} sub={`${assignedPairing} pairing · ${assignedReserve} reserve`} tone="default" />
        <SummaryTile label="Uncovered slots" value={String(uncoveredShown)} sub={uncoveredShown ? `${uncoveredPairing} pairing · ${uncoveredReserve} reserve` : 'all demand covered'} tone={uncoveredShown ? 'bad' : 'good'} />
        <SummaryTile label="Peak day load" value={peak.load > 0 ? String(peak.load) : '-'} sub={peak.day || 'no assignments'} tone="warn" />
        <SummaryTile label="Crew utilization" value={utilization == null ? '-' : `${utilization}%`} sub={`avg ${avgAvailable.toLocaleString(undefined, { maximumFractionDigits: 1 })} crew available / day`} tone="good" />
      </div>
      {viewRows.length === 0 ? (
        <EmptyTab label="Distribution" />
      ) : view === 'chart' ? (
        <div className="w-full min-w-0 space-y-3">
          <DistributionChartPanel
            title="Daily duty load vs available crew"
            subtitle={`slot-days${rankSuffix}${typeSuffix} · ${timezoneLabel} · a multi-day pairing counts on each day it spans`}
            rows={viewRows}
            slotType={slotType}
            variant="load"
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
          <DistributionChartPanel
            title="Uncovered demand"
            subtitle={`open slot-days${rankSuffix}${typeSuffix} · ${timezoneLabel}`}
            rows={viewRows}
            slotType={slotType}
            variant="uncovered"
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
            uncoveredSlots={uncoveredShown}
          />
        </div>
      ) : (
        <DistributionTable rows={viewRows} showPairing={showPairing} showReserve={showReserve} />
      )}
    </div>
  )
}

const formatVersionDate = (value: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const formatVersionSize = (value: number | null): string => {
  if (value == null) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

interface VersionDiffNestedTable {
  header: unknown[]
  rows: unknown[][]
}

const parseVersionDiffValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

const versionDiffNestedTables = (value: unknown): VersionDiffNestedTable[] => {
  const parsed = parseVersionDiffValue(value)
  const tables = asRecord(parsed).tables
  if (!Array.isArray(tables)) return []

  return tables.flatMap((tableValue) => {
    const table = asRecord(tableValue)
    const header = Array.isArray(table.header) ? table.header : []
    const rows = Array.isArray(table.rows)
      ? table.rows.filter((row): row is unknown[] => Array.isArray(row))
      : []
    const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0)
    if (columnCount === 0) return []
    return [{
      header: Array.from({ length: columnCount }, (_, index) => header[index] ?? `Column ${index + 1}`),
      rows,
    }]
  })
}

const versionDiffValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => versionDiffValuesEqual(value, right[index]))
  }
  if ((left && typeof left === 'object') || (right && typeof right === 'object')) {
    if (!left || typeof left !== 'object' || !right || typeof right !== 'object') return false
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => key in rightRecord && versionDiffValuesEqual(leftRecord[key], rightRecord[key]))
  }
  return false
}

const formatVersionDiffJsonScalar = (value: unknown): string => {
  if (value === undefined) return '-'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

const VersionDiffJsonNode = ({
  value,
  compareValue,
}: {
  value: unknown
  compareValue: unknown
}): ReactNode => {
  if (Array.isArray(value)) {
    const compareArray = Array.isArray(compareValue) ? compareValue : []
    if (value.length === 0 && compareArray.length > 0) {
      return <span className="font-semibold text-destructive">[]</span>
    }
    return (
      <span>
        {'['}
        {value.map((item, index) => (
          <span key={index}>
            {index > 0 ? ', ' : value.length > 0 ? ' ' : ''}
            <VersionDiffJsonNode value={item} compareValue={compareArray[index]} />
          </span>
        ))}
        {value.length > 0 ? ' ' : ''}
        {']'}
      </span>
    )
  }

  if (value && typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>
    const compareRecord = asRecord(compareValue)
    const keys = [...new Set([...Object.keys(valueRecord), ...Object.keys(compareRecord)])]
    return (
      <span>
        {'{'}
        {keys.map((key, index) => (
          <span key={key}>
            {index > 0 ? ', ' : ' '}
            <span className="text-muted-foreground">{JSON.stringify(key)}</span>
            {': '}
            <VersionDiffJsonNode value={valueRecord[key]} compareValue={compareRecord[key]} />
          </span>
        ))}
        {keys.length > 0 ? ' ' : ''}
        {'}'}
      </span>
    )
  }

  return (
    <span className={versionDiffValuesEqual(value, compareValue) ? 'text-foreground' : 'font-semibold text-destructive'}>
      {formatVersionDiffJsonScalar(value)}
    </span>
  )
}

const VersionDiffValue = ({
  value,
  compareValue,
  path,
  side,
  nested,
}: {
  value: unknown
  compareValue: unknown
  path: string
  side: 'current' | 'version'
  nested: boolean
}): ReactNode => {
  const parsedValue = parseVersionDiffValue(value)
  const parsedCompareValue = parseVersionDiffValue(compareValue)
  const tables = nested ? versionDiffNestedTables(parsedValue) : []
  const compareTables = nested ? versionDiffNestedTables(parsedCompareValue) : []
  const valueTestId = `scenario-version-diff-value-${side}-${path}`
  if (tables.length === 0) {
    return (
      <div className="min-w-0 max-w-full overflow-hidden" data-testid={valueTestId}>
        <code className="whitespace-normal break-words font-mono text-2xs leading-5">
          <VersionDiffJsonNode value={parsedValue} compareValue={parsedCompareValue} />
        </code>
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto" data-testid={valueTestId}>
      <div className="w-max min-w-full space-y-1">
        {tables.map((table, tableIndex) => (
          <div key={tableIndex} className="w-max min-w-full rounded border border-border/60">
            {tables.length > 1 && (
              <div className="border-b border-border/60 bg-muted/40 px-1.5 py-0.5 text-3xs font-semibold text-muted-foreground">
                Table {tableIndex + 1}
              </div>
            )}
            <table
              className="w-max min-w-full border-collapse text-3xs"
              data-testid={`scenario-version-diff-nested-table-${side}-${path}-${tableIndex}`}
            >
              <thead className="bg-muted/40">
                <tr>
                  {table.header.map((header, columnIndex) => (
                    <th
                      key={columnIndex}
                      className={`whitespace-nowrap border-b border-border/60 px-1.5 py-0.5 text-left font-semibold ${versionDiffValuesEqual(header, compareTables[tableIndex]?.header[columnIndex]) ? 'text-muted-foreground' : 'text-destructive'}`}
                    >
                      {formatCell(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border/40 last:border-0">
                    {table.header.map((_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className={`whitespace-nowrap px-1.5 py-0.5 font-mono tabular-nums ${versionDiffValuesEqual(row[columnIndex], compareTables[tableIndex]?.rows[rowIndex]?.[columnIndex]) ? 'text-foreground' : 'font-semibold text-destructive'}`}
                      >
                        {formatCell(row[columnIndex])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

const displayVersionDiffPath = (path: string, section: 'algorithm' | 'regulatory'): string => {
  const prefix = section === 'algorithm' ? 'algorithm.' : 'rules.'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

const VersionDiffTable = ({
  items,
  section,
}: {
  items: ScenarioVersionDiff['algorithmParameters']
  section: 'algorithm' | 'regulatory'
}): ReactNode => {
  if (items.length === 0) return <div className="text-xs text-muted-foreground">No differences.</div>
  const valueMissing = (value: unknown): boolean => {
    if (value == null || value === '') return true
    if (Array.isArray(value)) return value.length === 0
    return typeof value === 'object' && Object.keys(value as object).length === 0
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[44%]" />
          <col className="w-[44%]" />
        </colgroup>
        <thead className="bg-muted text-2xs uppercase text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left font-semibold">Parameter</th>
            <th className="whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left font-semibold">Current scenario</th>
            <th className="whitespace-nowrap border-b border-border px-2.5 py-1.5 text-left font-semibold">Archived version</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.path} className="odd:bg-background even:bg-muted/20" data-testid={`scenario-version-diff-row-${item.path}`}>
              <td className="align-top border-b border-border/60 px-2.5 py-1.5 font-mono text-2xs text-foreground">{displayVersionDiffPath(item.path, section)}</td>
              <td className={`align-top border-b border-border/60 px-2.5 py-1.5 ${valueMissing(item.current) ? 'text-muted-foreground' : 'text-foreground'}`}>
                {valueMissing(item.current)
                  ? <span className="rounded bg-muted px-1.5 py-0.5 text-2xs">Only in archived version</span>
                  : <VersionDiffValue value={item.current} compareValue={item.version} path={item.path} side="current" nested={section === 'regulatory'} />}
              </td>
              <td className={`align-top border-b border-border/60 px-2.5 py-1.5 ${valueMissing(item.version) ? 'text-muted-foreground' : 'text-foreground'}`}>
                {valueMissing(item.version)
                  ? <span className="rounded bg-muted px-1.5 py-0.5 text-2xs">Only in current scenario</span>
                  : <VersionDiffValue value={item.version} compareValue={item.current} path={item.path} side="version" nested={section === 'regulatory'} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const algorithmRanksForDivision = (division: string | null | undefined): string[] | null => {
  const code = String(division ?? '').trim().toUpperCase()
  if (code === 'P' || code.startsWith('PILOT')) return ['CA', 'FO']
  if (code === 'C' || code.startsWith('CABIN')) return ['IFD', 'FA']
  return null
}

const filterAlgorithmDiffs = (
  items: ScenarioVersionDiff['algorithmParameters'],
  division: string | null | undefined,
): ScenarioVersionDiff['algorithmParameters'] => {
  const ranks = algorithmRanksForDivision(division)
  if (!ranks) return items
  return items.flatMap((item) => {
    if (item.path !== 'algorithm.credit_range') return [item]
    const pickRanks = (value: unknown): Record<string, unknown> => {
      const source = asRecord(value)
      const pickRange = (range: 'min' | 'max'): Record<string, unknown> => {
        const values = asRecord(source[range])
        return Object.fromEntries(ranks.map((rank) => [rank, values[rank]]))
      }
      return {
        min: pickRange('min'),
        max: pickRange('max'),
      }
    }
    const current = pickRanks(item.current)
    const version = pickRanks(item.version)
    return JSON.stringify(current) === JSON.stringify(version) ? [] : [{ ...item, current, version }]
  })
}

const ScenarioVersionsPanel = ({
  scenarioId,
  fileType,
  status,
  division,
}: {
  scenarioId: number
  fileType: ScenarioType
  status: ScenarioStatus
  division?: string | null
}): ReactNode => {
  const setModule = useShellStore((state) => state.setModule)
  const setScenarioTabType = useShellStore((state) => state.setScenarioTabType)
  const [versions, setVersions] = useState<ScenarioVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<ScenarioVersion | null>(null)
  const [diffTarget, setDiffTarget] = useState<ScenarioVersion | null>(null)
  const [diff, setDiff] = useState<ScenarioVersionDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadVersions = async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await scenarioApi.getVersions(scenarioId)
      setVersions(response.items)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to load scenario versions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadVersions()
  }, [scenarioId, status])

  const openVersion = (version: ScenarioVersion): void => {
    const moduleKey = `scenario-gantt:${scenarioId}@${version.version}`
    setScenarioTabType(moduleKey, fileType)
    setModule(moduleKey)
  }

  const openDiff = async (version: ScenarioVersion): Promise<void> => {
    setDiffTarget(version)
    setDiff(null)
    setDiffLoading(true)
    try {
      setDiff(await scenarioApi.getVersionDiff(scenarioId, version.version))
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to load version differences')
      setDiffTarget(null)
    } finally {
      setDiffLoading(false)
    }
  }

  const removeVersion = async (): Promise<void> => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await scenarioApi.deleteVersion(scenarioId, deleteTarget.version)
      setDeleteTarget(null)
      await loadVersions()
      notify.success(`Version ${deleteTarget.version} deleted`)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to delete version')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading versions…</div>
  if (versions.length === 0) return <EmptyTab label="version" />

  return (
    <>
      <div className="overflow-auto rounded-md border border-border" data-testid="scenario-versions-table">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-muted text-2xs uppercase text-muted-foreground">
            <tr>
              {['Version', 'Executed By', 'Executed At', 'File Timestamp', 'Size', 'Actions'].map((label) => (
                <th key={label} className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.version} className="odd:bg-background even:bg-muted/20">
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 font-semibold text-foreground">
                  <span>{version.version}</span>
                  {version.isCurrent && (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary" data-testid={`scenario-version-current-${version.version}`}>
                      Current
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-muted-foreground">{version.executedBy ?? '-'}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-muted-foreground">{formatVersionDate(version.executedAt)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 font-mono text-2xs text-muted-foreground">{version.fileTimestamp ?? '-'}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2 tabular-nums text-muted-foreground">{formatVersionSize(version.fileSize)}</td>
                <td className="whitespace-nowrap border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => openVersion(version)}
                      data-testid={`scenario-version-open-${version.version}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Gantt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={!version.hasDifferences}
                      title={version.hasDifferences ? 'View parameter differences' : 'No parameter differences'}
                      onClick={() => { if (version.hasDifferences) void openDiff(version) }}
                      data-testid={`scenario-version-diff-${version.version}`}
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                      Differences
                    </Button>
                    {!version.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title={`Delete ${version.version}`}
                        onClick={() => setDeleteTarget(version)}
                        data-testid={`scenario-version-delete-${version.version}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AppDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}
        title="Delete Scenario Version"
        icon={<Trash2 className="h-4 w-4" />}
        description={`Delete ${deleteTarget?.version ?? 'this version'} and its archived files? This action cannot be undone.`}
        dismissable={!deleting}
        data-testid="scenario-version-delete-dialog"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => { void removeVersion() }}>
              {deleting ? 'Deleting…' : 'Delete Version'}
            </Button>
          </>
        }
      />
      <AppDialog
        open={diffTarget !== null}
        onOpenChange={(open) => {
          if (!open && !diffLoading) {
            setDiffTarget(null)
            setDiff(null)
          }
        }}
        title={`${diffTarget?.version ?? 'Version'} Differences`}
        icon={<GitCompareArrows className="h-4 w-4" />}
        description="Comparison with the parameters currently stored on this Scenario."
        dismissable={!diffLoading}
        data-testid="scenario-version-diff-dialog"
        className="w-[calc(100vw-2rem)] sm:max-w-[1180px] xl:max-w-[1320px]"
        footer={(
          <Button
            variant="ghost"
            disabled={diffLoading}
            onClick={() => {
              setDiffTarget(null)
              setDiff(null)
            }}
          >
            Close
          </Button>
        )}
      >
        {diffLoading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading differences…</div>
        ) : diff ? (
          <div className="max-h-[60vh] space-y-4 overflow-auto">
            <section className="space-y-2">
              <div className="text-xs font-semibold text-foreground">Algorithm Parameters</div>
              <VersionDiffTable items={filterAlgorithmDiffs(diff.algorithmParameters, division)} section="algorithm" />
            </section>
            <section className="space-y-2">
              <div className="text-xs font-semibold text-foreground">Regulatory Parameters</div>
              <VersionDiffTable items={diff.ruleParameters} section="regulatory" />
            </section>
          </div>
        ) : null}
      </AppDialog>
    </>
  )
}

const RUN_STEPS = [
  { id: 'starting', label: 'Start' },
  { id: 'extracting_input', label: 'Input' },
  { id: 'solving', label: 'Solve' },
  { id: 'producing_result', label: 'Result' },
  { id: 'loading_roster', label: 'Roster' },
] as const

const formatElapsed = (seconds: number | null | undefined): string => {
  if (!Number.isFinite(seconds)) return ''
  const total = Math.max(0, Math.round(seconds as number))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const ScenarioRunProgressBar = ({ progress, compact = false }: { progress?: ScenarioRunProgress | null; compact?: boolean }): ReactNode => {
  const current = progress ?? {
    phase: 'starting' as const,
    percent: 0,
    stageLabel: 'Starting optimization',
    detail: null,
    stageIndex: null,
    stageTotal: null,
    stepIndex: null,
    stepTotal: null,
    elapsedSec: null,
    progressAgeSec: null,
    error: null,
  }
  const currentIndex = RUN_STEPS.findIndex((step) => step.id === current.phase)
  const stale = current.progressAgeSec != null && current.progressAgeSec > 120
  const percent = Math.max(0, Math.min(100, Number(current.percent) || 0))

  return (
    <div className={compact ? 'flex min-w-0 flex-col gap-1.5' : 'flex flex-col gap-2'} data-testid="scenario-run-progress">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs font-semibold text-foreground">{current.stageLabel}</div>
        <div className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{percent.toFixed(1)}%</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      {!compact && (
        <div className="grid grid-cols-5 gap-1">
          {RUN_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={[
                'border-t-2 pt-1 text-center text-2xs',
                index < currentIndex ? 'border-primary text-foreground' :
                  index === currentIndex ? 'border-primary font-semibold text-foreground' :
                    'border-muted text-muted-foreground',
              ].join(' ')}
            >
              {step.label}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {current.detail && <span className="truncate">{current.detail}</span>}
        {!compact && current.stageIndex != null && current.stageTotal != null && <span>Stage {current.stageIndex}/{current.stageTotal}</span>}
        {!compact && current.stepIndex != null && current.stepTotal != null && <span>Step {current.stepIndex}/{current.stepTotal}</span>}
        {current.elapsedSec != null && <span>Elapsed {formatElapsed(current.elapsedSec)}</span>}
      </div>
      {stale && (
        <div className="text-2xs text-amber-600">
          No solver progress update for {Math.round(current.progressAgeSec as number)}s.
        </div>
      )}
      {current.error && <div className="text-2xs text-destructive">{current.error}</div>}
    </div>
  )
}

export const ScenarioKpiSection = ({ scenarioId, fileType, results, status, division }: ScenarioKpiSectionProps): ReactNode => {
  const [activeTab, setActiveTab] = useState<ResultTab>(status === 'DRAFT' ? 'notes' : 'kpi')
  // DRAFT: only Notes is available; other result tabs stay hidden.
  const shownTabs = status === 'DRAFT' ? RESULT_TABS.filter((tab) => tab.id === 'notes') : RESULT_TABS
  const effectiveTab = shownTabs.some((tab) => tab.id === activeTab) ? activeTab : 'notes'
  // Open (unanswered) note count drives the red badge on the Notes tab, so users
  // can see pending questions without opening the tab. Fetched lazily (after paint).
  const [notesOpenCount, setNotesOpenCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    scenarioApi.getNotes(scenarioId)
      .then((res) => { if (!cancelled) setNotesOpenCount(computeOpenCount(res.items)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [scenarioId])
  const kpiRows = results?.kpi ?? []
  const sortedKpis = [...kpiRows].sort((a, b) => (a.idx ?? 999) - (b.idx ?? 999) || a.kpiNames.localeCompare(b.kpiNames))
  const creditRows = reportCreditRows(results?.rawResult)
  const displayedCreditRows = creditRows.length ? creditRows : (results?.creditHours ?? [])
  const fallbackUncoveredRows = results?.uncovered ?? []
  const distribution = results?.distribution ?? []

  return (
    <div className="w-full min-w-0 border-b border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-1" data-testid="scenario-result-tab-rail">
        {shownTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`scenario-result-tab-${tab.id}`}
            aria-selected={effectiveTab === tab.id}
            className={[
              'relative inline-flex h-8 items-center rounded px-3 text-xs font-semibold transition-colors',
              effectiveTab === tab.id
                ? 'border border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border border-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'notes' && notesOpenCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-white"
                data-testid="scenario-notes-tab-badge"
              >
                {notesOpenCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {effectiveTab === 'kpi' && (
        <>
          {status === 'FAILED' && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Optimization failed. Review the configuration and resubmit.
            </div>
          )}

          {status === 'DONE' && sortedKpis.length === 0 && (
            <div className="text-xs text-muted-foreground">No KPI data available.</div>
          )}

          {status === 'DONE' && sortedKpis.length > 0 && (
            <div className="grid grid-cols-2 gap-2 @[860px]:grid-cols-4">
              {sortedKpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
            </div>
          )}
        </>
      )}

      {effectiveTab === 'credit-hours' && (
        <CreditHoursPanel rows={displayedCreditRows} rawResult={results?.rawResult} />
      )}

      {effectiveTab === 'uncovered' && (
        <UncoveredPanel fallbackRows={fallbackUncoveredRows} rawResult={results?.rawResult} />
      )}

      {effectiveTab === 'distribution' && (
        <DistributionPanel distribution={distribution} rawResult={results?.rawResult} />
      )}

      {effectiveTab === 'versions' && (
        <ScenarioVersionsPanel scenarioId={scenarioId} fileType={fileType} status={status} division={division} />
      )}

      {effectiveTab === 'notes' && (
        <ScenarioNotesPanel scenarioId={scenarioId} onOpenCountChange={setNotesOpenCount} />
      )}
    </div>
  )
}
