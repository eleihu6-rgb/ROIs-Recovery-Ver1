import React, { useState, useCallback, useEffect, useRef } from 'react'
import { formatUiDate } from '@rois/ui'
import {
  Search, RefreshCw, Users, ListChecks,
  AlertCircle, Loader2, Check, ChevronsUpDown,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import { Input } from '@rois/ui'
import { RpSelect } from '@/components/common/rp-select'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { format } from 'date-fns'
import {
  fetchCrewBids, fetchBaseOptions, fetchRankOptions,
  type CrewBidCrewRow, type CrewBidTypeRow, type BidGroupDetail,
} from '@/services/crew-bids-api'

// ─── Bid sentence formatter ───────────────────────────────────────────────────

const ACTION_LABEL: Record<number, string> = { 1: 'Award', 2: 'Avoid' }

function fmtDate(raw: string): string {
  return formatUiDate(raw) || raw
}

function fmtDateList(csv: string): string {
  return csv.split(',').map((v) => {
    const t = v.trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? fmtDate(t) : t
  }).join(', ')
}

function fmtShortCallMode(raw: string): string {
  try {
    const obj = JSON.parse(raw) as { mode?: string }
    const map: Record<string, string> = { whole_month: 'whole month', first_half: 'first half', second_half: 'second half' }
    return map[obj.mode ?? ''] ?? obj.mode ?? ''
  } catch { return raw }
}

function formatBidGroup(g: BidGroupDetail): string {
  const action = g.actionId != null ? ACTION_LABEL[g.actionId] : null
  const prop   = g.propertyName ?? ''
  const op     = g.operator
  const paramA = g.paramA ?? ''
  const paramB = g.paramB ?? ''

  if (prop === 'Pairing Number' && paramA && paramB)
    return `${action ? `${action} Pairing` : 'Pairing'} ${paramA} on ${fmtDate(paramB)}`
  if (prop === 'Prefer Off' && op === 'In' && paramA)
    return `Prefer Off — ${fmtDateList(paramA)}`
  if (prop === 'Reserve Prefer Off' && op === 'In' && paramA)
    return `Reserve Prefer Off — ${fmtDateList(paramA)}`
  if (prop === 'Reserve Day On' && op === 'In' && paramA)
    return `Reserve Day On — ${fmtDateList(paramA)}`
  if (prop === 'Short Call Type' && paramA) {
    const mode = paramB ? fmtShortCallMode(paramB) : ''
    return `Short Call Type ${paramA}${mode ? ` (${mode})` : ''}`
  }
  if (prop === 'Min Consecutive Days Off' && op === '=' && paramA)
    return `Min ${paramA} Consecutive Days Off`
  if (prop === 'Commuter Pattern' && op === 'Between' && paramA && paramB)
    return paramA === paramB ? `Commuter Pattern — ${paramA} days` : `Commuter Pattern — ${paramA}–${paramB} days`
  if (prop === 'Most Flying In Least Days' && paramA)
    return paramB ? `Most Flying (${paramA}) in Least Days (${paramB})` : `Most Flying in Least Days — ${paramA}`
  if (prop === 'Min Base Layover' && op === '=' && paramA)
    return `Min Base Layover ${paramA.replace(/^0+/, '')}`
  if (prop === 'Forget Line') return 'Forget Line'
  if (!op && !paramA) return action ? `${action} — ${prop}` : prop
  if (prop.includes('Layover On Date') && paramA) {
    const prefix = action ? `${action} — ` : ''
    try {
      const obj = JSON.parse(paramA) as { dates?: string[]; daysOfWeek?: string[] }
      const parts: string[] = []
      if (obj.dates?.length) parts.push(obj.dates.map(fmtDate).join(', '))
      if (obj.daysOfWeek?.length) parts.push(obj.daysOfWeek.join(', '))
      return `${prefix}${prop} — ${parts.join(' / ')}`
    } catch { /* fall through */ }
  }
  if (prop.includes('Duty On Date') && paramA) {
    const prefix = action ? `${action} — ` : ''
    try {
      const obj = JSON.parse(paramA) as { dates?: string[]; daysOfWeek?: string[] }
      const parts: string[] = []
      if (obj.dates?.length) parts.push(obj.dates.map(fmtDate).join(', '))
      if (obj.daysOfWeek?.length) parts.push(obj.daysOfWeek.join(', '))
      return `${prefix}${prop} — ${parts.join(' / ')}`
    } catch { /* fall through */ }
  }
  if (op === 'Between' && paramA && paramB) {
    const prefix = action ? `${action} — ` : ''
    return `${prefix}${prop} between ${paramA} and ${paramB}`
  }
  if (op && paramA) {
    const prefix = action ? `${action} — ` : ''
    return `${prefix}${prop} ${op} ${paramA}`
  }
  if (op === 'In' && paramA) {
    const prefix = action ? `${action} — ` : ''
    return `${prefix}${prop} — ${fmtDateList(paramA)}`
  }
  return action ? `${action} — ${prop}` : prop
}

// ─── Flatten crew bid data into table rows ────────────────────────────────────

interface FlatRow {
  // crew info — null for continuation rows of same crew
  crewId: string
  crewName: string | null
  seniorityNum: number | null
  base: string | null
  rank: string | null
  bidStatus: string | null
  bidContext: string | null
  totalTiers: number | null
  isFirstRowOfCrew: boolean
  isLastRowOfCrew: boolean
  // bid detail
  bidType: string
  sentence: string
  tiers: number[]
}

function flattenRows(crew: CrewBidCrewRow): FlatRow[] {
  const BID_TYPE_ORDER = ['Line', 'DaysOff', 'Reserve', 'Pairing']
  const ordered = BID_TYPE_ORDER
    .map((t) => crew.bidTypes.find((b) => b.bidType === t))
    .filter((b): b is CrewBidTypeRow => !!b)
  const others = crew.bidTypes.filter((b) => b.bidType && !BID_TYPE_ORDER.includes(b.bidType))
  const allTypes = [...ordered, ...others]

  const rows: FlatRow[] = []

  for (const bt of allTypes) {
    // Deduplicate groups by sentence, merging tiers
    const seen = new Map<string, number[]>()
    for (const g of bt.groupDetails) {
      const sentence = formatBidGroup(g)
      const existing = seen.get(sentence)
      if (existing) { if (!existing.includes(g.tier)) existing.push(g.tier) }
      else seen.set(sentence, [g.tier])
    }
    if (seen.size === 0 && bt.groupCount === 0) {
      seen.set('(no details)', bt.appliedTiers)
    }
    seen.forEach((tiers, sentence) => {
      rows.push({
        crewId: crew.crewId, crewName: null, seniorityNum: null,
        base: null, rank: null, bidStatus: null, bidContext: null, totalTiers: null,
        isFirstRowOfCrew: false, isLastRowOfCrew: false,
        bidType: bt.bidType ?? 'Unknown',
        sentence,
        tiers: [...new Set(tiers)].sort((a, b) => a - b),
      })
    })
  }

  if (rows.length === 0) {
    rows.push({
      crewId: crew.crewId, crewName: null, seniorityNum: null,
      base: null, rank: null, bidStatus: null, bidContext: null, totalTiers: null,
      isFirstRowOfCrew: false, isLastRowOfCrew: true,
      bidType: '—', sentence: 'No bids recorded', tiers: [],
    })
  }

  // Fill crew info on first row only
  rows[0].crewName   = crew.crewName
  rows[0].seniorityNum = crew.seniorityNum
  rows[0].base       = crew.base
  rows[0].rank       = crew.rank
  rows[0].bidStatus  = crew.bidStatus
  rows[0].bidContext = crew.bidContext
  rows[0].totalTiers = crew.totalTiers
  rows[0].isFirstRowOfCrew = true
  rows[rows.length - 1].isLastRowOfCrew = true

  return rows
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BID_TYPE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  Line:    { label: 'Line',    color: 'text-violet-400',  bg: 'bg-violet-500/10' },
  DaysOff: { label: 'DO',     color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  Reserve: { label: 'Reserve', color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  Pairing: { label: 'Pairing', color: 'text-sky-400',    bg: 'bg-sky-500/10' },
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT:     'text-muted-foreground',
  SUBMITTED: 'text-emerald-400',
  LOCKED:    'text-amber-400',
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

interface SelectOption { value: string; label: string }

const Checkbox = ({ checked }: { checked: boolean }) => (
  <span className={['flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary' : 'border-border bg-background'].join(' ')}>
    {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
  </span>
)

const MultiSelect = ({ label, allLabel, options, selected, loading, onChange }: {
  label: string; allLabel: string; options: SelectOption[]
  selected: string[]; loading?: boolean; onChange: (v: string[]) => void
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const allSelected = selected.length === 0 || selected.length === options.length
  const displayText = loading ? 'Loading…' : allSelected ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selected`

  return (
    <div className="flex flex-col gap-0.5" ref={ref}>
      <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <button type="button" onClick={() => !loading && setOpen((o) => !o)}
          className={['flex h-7 min-w-[120px] items-center gap-1.5 rounded border px-2 text-xs transition-colors',
            open ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
            loading ? 'cursor-wait opacity-60' : 'cursor-pointer'].join(' ')}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            : !allSelected ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-3xs font-bold text-primary-foreground">{selected.length}</span>
            : null}
          <span className="flex-1 truncate text-left">{displayText}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <button type="button" onClick={() => onChange(allSelected ? [] : options.map((o) => o.value))}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold hover:bg-sidebar-accent transition-colors">
              <Checkbox checked={allSelected} />{allLabel}
            </button>
            <div className="max-h-52 overflow-y-auto">
              {options.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => onChange(selected.includes(opt.value) ? selected.filter((x) => x !== opt.value) : [...selected, opt.value])}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-sidebar-accent transition-colors">
                  <Checkbox checked={selected.includes(opt.value)} />
                  <span className="font-medium">{opt.value}</span>
                  {opt.label !== opt.value && <span className="truncate text-2xs text-muted-foreground">{opt.label}</span>}
                </button>
              ))}
              {options.length === 0 && <p className="px-3 py-2 text-2xs text-muted-foreground italic">No options available</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

const TierBadge = ({ tier }: { tier: number }) => (
  <span className="inline-flex items-center rounded px-1 py-0.5 text-3xs font-bold bg-primary/15 text-primary border border-primary/25">
    T{tier}
  </span>
)

const BidTable = ({ rows }: { rows: FlatRow[] }) => (
  <div className="w-full overflow-x-auto">
    {/* Column headers */}
    <div className="flex items-center gap-0 border-b-2 border-border bg-muted/40 px-2 py-1 text-3xs font-bold uppercase tracking-widest text-muted-foreground sticky top-0 z-10">
      <span className="w-10 shrink-0 text-right pr-2">Sen.</span>
      <span className="w-10 shrink-0 px-1">Rank</span>
      <span className="w-20 shrink-0 px-1">Crew ID</span>
      <span className="w-36 shrink-0 px-1">Name</span>
      <span className="w-10 shrink-0 px-1">Base</span>
      <span className="w-16 shrink-0 px-1">Status</span>
      <span className="w-1 shrink-0 mx-1 border-l border-border/60 self-stretch" />
      <span className="w-16 shrink-0 px-1">Bid Type</span>
      <span className="flex-1 px-1">Bid Details</span>
      <span className="w-36 shrink-0 px-1">Applied Tiers</span>
    </div>

    {/* Data rows */}
    {rows.map((row, i) => {
      const btStyle = BID_TYPE_STYLE[row.bidType] ?? { label: row.bidType, color: 'text-foreground', bg: 'bg-muted/20' }
      const isFirstOfCrew = row.isFirstRowOfCrew
      const isLastOfCrew  = row.isLastRowOfCrew

      return (
        <div key={i} className={[
          'flex items-center gap-0 px-2 py-0.5 min-h-[22px]',
          isFirstOfCrew ? 'pt-1.5 mt-0.5' : '',
          isLastOfCrew  ? 'pb-1.5 border-b border-border/50' : 'border-b border-border/10',
          'hover:bg-sidebar-accent/20 transition-colors',
        ].join(' ')}>
          {/* Sen */}
          <span className="w-10 shrink-0 text-right pr-2 font-mono text-xs text-muted-foreground leading-5">
            {isFirstOfCrew ? (row.seniorityNum ?? '—') : ''}
          </span>
          {/* Rank */}
          <span className="w-10 shrink-0 px-1 leading-5">
            {isFirstOfCrew && row.rank ? (
              <span className="rounded bg-primary/15 px-1 py-0.5 text-2xs font-bold text-primary">{row.rank}</span>
            ) : isFirstOfCrew ? <span className="text-2xs text-muted-foreground">—</span> : null}
          </span>
          {/* Crew ID */}
          <span className="w-20 shrink-0 px-1 font-mono text-xs font-semibold text-foreground leading-5">
            {isFirstOfCrew ? row.crewId : ''}
          </span>
          {/* Name */}
          <span className="w-36 shrink-0 px-1 text-xs text-foreground/80 leading-5 truncate" title={row.crewName ?? ''}>
            {isFirstOfCrew ? (row.crewName ?? row.crewId) : ''}
          </span>
          {/* Base */}
          <span className="w-10 shrink-0 px-1 text-xs text-muted-foreground leading-5">
            {isFirstOfCrew ? (row.base ?? '—') : ''}
          </span>
          {/* Status */}
          <span className={`w-16 shrink-0 px-1 text-2xs leading-5 ${isFirstOfCrew ? (STATUS_STYLE[row.bidStatus ?? ''] ?? 'text-muted-foreground') : ''}`}>
            {isFirstOfCrew ? (row.bidStatus ?? '') : ''}
          </span>
          {/* Divider */}
          <span className="w-1 shrink-0 mx-1 border-l border-border/60 self-stretch min-h-[20px]" />
          {/* Bid Type */}
          <span className="w-16 shrink-0 px-1 leading-5">
            <span className={`rounded px-1.5 py-0.5 text-3xs font-bold ${btStyle.color} ${btStyle.bg}`}>
              {btStyle.label}
            </span>
          </span>
          {/* Bid Details */}
          <span className="flex-1 px-1 text-xs text-foreground/90 leading-5 break-words">
            {row.sentence}
          </span>
          {/* Applied Tiers */}
          <div className="w-36 shrink-0 px-1 flex flex-wrap gap-0.5 pt-0.5">
            {row.tiers.map((t) => <TierBadge key={t} tier={t} />)}
          </div>
        </div>
      )
    })}
  </div>
)

// ─── Main view ────────────────────────────────────────────────────────────────

interface FilterState {
  rosterPeriodId: string
  bidContext: 'all' | 'Default' | 'Current'
  bases: string[]
  ranks: string[]
}

export const CrewBidsView = (): React.ReactNode => {
  const [filter, setFilter]       = useState<FilterState>({ rosterPeriodId: '', bidContext: 'all', bases: [], ranks: [] })
  const rosterPeriods = useRosterPeriodStore((s) => s.items)
  const selectedPeriodId = filter.rosterPeriodId
  const [baseOptions,   setBaseOptions]   = useState<SelectOption[]>([])
  const [rankOptions,   setRankOptions]   = useState<SelectOption[]>([])
  const [optLoading,    setOptLoading]    = useState(true)

  const [crewRows, setCrewRows] = useState<CrewBidCrewRow[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    let cancelled = false
    // Base/Rank options are independent of the RP list. The RP dropdown stores
    // the roster-period id directly; its PBS code is resolved at query time.
    const loadBases = fetchBaseOptions().then((bases) => {
      if (cancelled) return
      setBaseOptions([...bases].sort((a, b) => a.displayOrder - b.displayOrder)
        .map((b) => ({ value: b.base, label: b.name ? `${b.base} — ${b.name}` : b.base })))
    }).catch(() => {})
    const loadRanks = fetchRankOptions().then((ranks) => {
      if (cancelled) return
      setRankOptions([...ranks].sort((a, b) => a.displayOrder - b.displayOrder)
        .map((r) => ({ value: r.rank, label: r.description ? `${r.rank} — ${r.description}` : r.rank })))
    }).catch(() => {})
    Promise.allSettled([loadBases, loadRanks]).then(() => {
      if (!cancelled) setOptLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (filter.rosterPeriodId || rosterPeriods.length === 0) return
    const current = rosterPeriods.find((rp) => rp.isCurrent) ?? rosterPeriods[rosterPeriods.length - 1]
    if (current) setFilter((f) => ({ ...f, rosterPeriodId: String(current.id) }))
  }, [filter.rosterPeriodId, rosterPeriods])

  const selectedPeriod = rosterPeriods.find((rp) => String(rp.id) === selectedPeriodId)
  // New RP records carry the exact PBS code. Keep the date-derived format as
  // a compatibility fallback for older records that predate pbsPeriodCode.
  const selectedPeriodCode = selectedPeriod?.pbsPeriodCode?.trim()
    || (selectedPeriod?.rpStart ? format(new Date(`${selectedPeriod.rpStart}T00:00:00`), 'MMM yyyy') : '')
  const handlePeriodChange = (id: string) => {
    if (rosterPeriods.some((period) => String(period.id) === id)) {
      setFilter((f) => ({ ...f, rosterPeriodId: id }))
    }
  }

  const handleSearch = useCallback(async () => {
    const period = rosterPeriods.find((rp) => String(rp.id) === filter.rosterPeriodId)
    if (!period) return
    setLoading(true); setError(null)
    try {
      const data = await fetchCrewBids({
        rosterPeriodId: period.id,
        bidContext:  filter.bidContext === 'all' ? undefined : filter.bidContext,
        bases:       filter.bases,
        ranks:       filter.ranks,
      })
      setCrewRows(data.rows); setTotal(data.total); setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setCrewRows([]); setTotal(0)
    } finally { setLoading(false) }
  }, [filter, rosterPeriods])

  // Filter by crew ID / name, then flatten all crew into table rows
  const filteredCrew = searchText
    ? crewRows.filter((r) =>
        r.crewId.toLowerCase().includes(searchText.toLowerCase()) ||
        r.crewName.toLowerCase().includes(searchText.toLowerCase()))
    : crewRows

  const flatRows = filteredCrew.flatMap(flattenRows)

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <ListChecks className="h-4 w-4 shrink-0 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">Crew Bids Viewer</h1>
        {searched && total > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-medium text-primary">
            {total} crew · {flatRows.length} bid rows
          </span>
        )}
        <div className="flex-1" />
        {searched && (
          <button onClick={handleSearch} disabled={loading}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-border bg-card px-4 py-3">
        {/* Period */}
        <div className="flex flex-col gap-0.5">
          <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">Period</span>
          {optLoading ? (
            <div className="flex h-7 items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <RpSelect testId="crew-bids-rp-period" value={selectedPeriodId} onValueChange={handlePeriodChange} className="h-7 w-[6.5rem] text-xs" />
              <Input className="h-7 w-[5.75rem] text-xs" value={selectedPeriod?.rpStart ?? ''} readOnly disabled />
              <Input className="h-7 w-[5.75rem] text-xs" value={selectedPeriod?.rpEnd ?? ''} readOnly disabled />
            </div>
          )}
        </div>

        <MultiSelect label="Base" allLabel="All Bases" options={baseOptions} selected={filter.bases} loading={optLoading} onChange={(bases) => setFilter((f) => ({ ...f, bases }))} />
        <MultiSelect label="Rank" allLabel="All Ranks" options={rankOptions} selected={filter.ranks} loading={optLoading} onChange={(ranks) => setFilter((f) => ({ ...f, ranks }))} />

        <div className="flex flex-col gap-0.5">
          <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">Context</span>
          <select value={filter.bidContext} onChange={(e) => setFilter((f) => ({ ...f, bidContext: e.target.value as FilterState['bidContext'] }))}
            className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer">
            <option value="all">All</option>
            <option value="Current">Current</option>
            <option value="Default">Default</option>
          </select>
        </div>

        <div className="flex-1" />

        {/* Crew search */}
        {searched && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ID or name…"
              className="h-7 w-40 rounded border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        )}

        <button onClick={handleSearch} disabled={loading || !selectedPeriod}
            className={['flex h-8 items-center gap-2 rounded px-4 text-xs font-semibold transition-colors',
            loading || !selectedPeriod ? 'cursor-not-allowed opacity-50 bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:opacity-90'].join(' ')}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </button>
      </div>

      {/* Active filter summary */}
      {searched && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-1.5">
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{selectedPeriodCode || '—'}</span>
            {filter.bases.length > 0 && <> · Base: <span className="font-medium text-foreground">{filter.bases.join(', ')}</span></>}
            {filter.ranks.length > 0 && <> · Rank: <span className="font-medium text-foreground">{filter.ranks.join(', ')}</span></>}
            {filter.bidContext !== 'all' && <> · <span className="font-medium text-foreground">{filter.bidContext}</span></>}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!searched && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">Select filters and click Search</p>
            <p className="text-xs opacity-60">Queries PBS bid data — base and rank from crew records</p>
          </div>
        )}
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading crew bids…</span>
          </div>
        )}
        {error && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-destructive">
            <AlertCircle className="h-8 w-8 opacity-60" />
            <p className="text-sm font-medium">Error loading data</p>
            <p className="max-w-sm text-center text-xs opacity-70">{error}</p>
          </div>
        )}
        {searched && !loading && !error && flatRows.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ListChecks className="h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">No bids found</p>
            <p className="text-xs opacity-60">Try a different period or remove filters</p>
          </div>
        )}
        {!loading && !error && flatRows.length > 0 && (
          <BidTable rows={flatRows} />
        )}
      </div>
    </div>
  )
}
