import { useMemo, useState } from 'react'
import { Bell, Search } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { DateRangePicker } from '@/components/common/date-range-picker'
import { LegalityRecheckIndicator } from '../legality/legality-recheck-indicator'
import { ScenarioRecheckIndicator } from '../legality/scenario-recheck-indicator'
import { severityLabelFromNum } from '@/utils/severity-labels'
import type { RecheckIndicatorInfo } from '@/components/gantt/source/gantt-pane-source'
import { useShellStore } from '@/stores/shell-store'
import { useRuleInstancesStore } from '@/stores/rule-instances-store'
import { parseAlertRuleId } from './parse-alert-rule-id'

/** One violation message, resolved to the crew it belongs to. */
export interface CrewViolationRow {
  crewId: string
  base: string
  rank: string
  /** Rule template/function code, e.g. '8002'. */
  ruleCode: string
  /** Rule instance code, e.g. '006'. null if not attributable. */
  ruleInstance?: string | null
  severity: number
  message: string
}

/** Display id: "8002/006" when the instance is known, else just "8002". */
export const ruleIdOf = (r: { ruleCode: string; ruleInstance?: string | null }): string =>
  r.ruleInstance ? `${r.ruleCode}/${r.ruleInstance}` : r.ruleCode

interface Props {
  open: boolean
  onClose: () => void
  /** Violations for the loaded crew within the current gantt date range. */
  rows: CrewViolationRow[]
  /**
   * Clicking any cell of a row floats that crew to the top of the roster pane so the planner
   * can inspect its roster. When omitted, rows are not clickable.
   */
  onCrewClick?: (crewId: string) => void
  /**
   * Recheck-status line context (informational — see gantt-pane-source.ts's RecheckIndicatorInfo).
   * 'live' shows the global Live group's status (existing behavior); 'scenario' shows THIS
   * scenario's own persisted legality status. Omitted → no status line rendered.
   */
  recheckInfo?: RecheckIndicatorInfo
}

type GroupBy = 'severity' | 'rule' | 'base' | 'rank'

const GROUP_OPTIONS: ReadonlyArray<{ key: GroupBy; label: string }> = [
  { key: 'severity', label: 'Severity' },
  { key: 'rule', label: 'Rule' },
  { key: 'base', label: 'Base' },
  { key: 'rank', label: 'Rank' },
]

/** Numeric severity → SEV badge tint (red Hard ≥3, amber Overridable 2, yellow Soft 1). */
const sevBadgeClass = (sev: number): string => {
  if (sev >= 3) return 'bg-destructive text-destructive-foreground'
  if (sev === 2) return 'bg-amber-500 text-white'
  return 'bg-yellow-500 text-white'
}

/** Numeric severity → group-dot tint. */
const sevDotClass = (sev: number): string => {
  if (sev >= 3) return 'bg-destructive'
  if (sev === 2) return 'bg-amber-500'
  return 'bg-yellow-500'
}

/**
 * Legality Alert Center — lists every rule-violation message loaded into the gantt,
 * one message per row (crew id, base, rank, rule id, message). Scoped exactly to what
 * the gantt shows: the loaded crew within the current date range (the same set the
 * canvas bell renders from), so it doubles as a check that messages reached the front
 * end. The date row drives the gantt's own range; the recheck indicator is informational.
 */
export const ViolationListDialog = ({ open, onClose, rows, onCrewClick, recheckInfo }: Props) => {
  const setModule = useShellStore((s) => s.setModule)
  const setLegalityItem = useShellStore((s) => s.setLegalityItem)
  const requestFocus = useRuleInstancesStore((s) => s.requestFocus)
  const [groupBy, setGroupBy] = useState<GroupBy>('severity')
  // Selected group value within the active grouping; null = show all.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Free-text search over crew id / rank / base, applied to the already-loaded rows
  // (not a server query) — narrows everything: the group list, table, and counts.
  const [search, setSearch] = useState('')

  // Rows narrowed by the search box. A row matches when its crew id, rank, or base
  // contains the (case-insensitive) query. Empty query matches all.
  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.crewId.toLowerCase().includes(q) ||
        (r.rank || '').toLowerCase().includes(q) ||
        (r.base || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const hardCount = useMemo(() => searchedRows.filter((r) => r.severity >= 3).length, [searchedRows])
  const overridableCount = useMemo(() => searchedRows.filter((r) => r.severity === 2).length, [searchedRows])

  /** Key a row by the active grouping. */
  const keyOf = (r: CrewViolationRow): string =>
    groupBy === 'severity' ? severityLabelFromNum(r.severity)
      : groupBy === 'rule' ? ruleIdOf(r)
        : groupBy === 'rank' ? (r.rank || '—')
          : (r.base || '—')

  // Groups for the sidebar: { key, count, repSeverity } sorted by severity desc then key.
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; sev: number }>()
    for (const r of searchedRows) {
      const k = keyOf(r)
      const cur = map.get(k)
      if (cur) { cur.count++; cur.sev = Math.max(cur.sev, r.severity) }
      else map.set(k, { count: 1, sev: r.severity })
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.sev - a.sev) || a.key.localeCompare(b.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedRows, groupBy])

  // Rows for the table: filtered to the selected group, sorted severity desc then crew.
  const visibleRows = useMemo(() => {
    const filtered = selectedKey === null ? searchedRows : searchedRows.filter((r) => keyOf(r) === selectedKey)
    return [...filtered].sort((a, b) => (b.severity - a.severity) || a.crewId.localeCompare(b.crewId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedRows, groupBy, selectedKey])

  // Switching the grouping dimension resets the selection to "all".
  const changeGroupBy = (g: GroupBy) => { setGroupBy(g); setSelectedKey(null) }

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="violation-list-dialog"
      className="sm:max-w-[min(1100px,95vw)]"
      icon={<Bell className="h-4 w-4" />}
      title={
        <span className="flex items-center gap-2" data-testid="alert-center-title">
          <span className="text-3xs font-medium uppercase tracking-wide opacity-75">Legality</span>
          <span>Alert Center</span>
          {overridableCount > 0 && (
            <span
              data-testid="alert-count-overridable"
              className="inline-flex items-center rounded bg-amber-500 px-1.5 py-0.5 text-2xs font-semibold text-white"
            >
              {overridableCount}
            </span>
          )}
          {hardCount > 0 && (
            <span
              data-testid="alert-count-hard"
              className="inline-flex items-center rounded bg-destructive px-1.5 py-0.5 text-2xs font-semibold text-destructive-foreground"
            >
              {hardCount}
            </span>
          )}
        </span>
      }
      footerClassName="py-1"
      footer={
        <Button variant="ghost" className="h-6 px-2 py-0 leading-none" onClick={onClose}>
          Close
        </Button>
      }
      bodyClassName="p-0"
    >
      {/* Date row — drives the gantt's own range; recheck status is informational here. */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <DateRangePicker />
        {/* Search the loaded alerts by crew id / rank / base (client-side, no server query). */}
        <div className="flex w-72 items-center gap-1.5 rounded border border-border bg-background px-2">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            data-testid="alert-search-input"
            className="flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search crew ID, rank, or base"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {recheckInfo && (
          <div className="ml-auto">
            {recheckInfo.type === 'live'
              ? <LegalityRecheckIndicator groupCode={recheckInfo.groupCode} />
              : <ScenarioRecheckIndicator
                  status={recheckInfo.status}
                  computedAt={recheckInfo.computedAt}
                  errorText={recheckInfo.errorText}
                  paramsStale={recheckInfo.paramsStale}
                  stuck={recheckInfo.stuck}
                />}
          </div>
        )}
      </div>

      <div className="flex min-h-[320px]">
        {/* GROUP BY sidebar */}
        <div className="w-48 shrink-0 border-r border-border px-3 py-3">
          <div className="mb-2 text-3xs font-medium uppercase tracking-wide text-muted-foreground">Group by</div>
          <div className="flex flex-col gap-1">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                data-testid={`alert-groupby-${opt.key}`}
                onClick={() => changeGroupBy(opt.key)}
                className={[
                  'rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  groupBy === opt.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-accent/50',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Group list for the active dimension */}
          <button
            onClick={() => setSelectedKey(null)}
            className={[
              'mt-4 w-full rounded-md px-2 py-1 text-left text-2xs font-medium uppercase tracking-wide transition-colors',
              selectedKey === null ? 'bg-accent/60 text-foreground' : 'text-muted-foreground hover:bg-accent/40',
            ].join(' ')}
            data-testid="alert-group-all"
          >
            {GROUP_OPTIONS.find((o) => o.key === groupBy)?.label} ({searchedRows.length})
          </button>
          <div className="mt-1 flex flex-col gap-0.5">
            {groups.map((g) => (
              <button
                key={g.key}
                data-testid="alert-group-item"
                onClick={() => setSelectedKey((cur) => (cur === g.key ? null : g.key))}
                className={[
                  'flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
                  selectedKey === g.key ? 'bg-accent/60' : 'hover:bg-accent/40',
                ].join(' ')}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${sevDotClass(g.sev)}`} />
                <span className="min-w-0 flex-1 truncate text-foreground">{g.key}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{g.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message table */}
        <div className="min-w-0 flex-1 overflow-auto" style={{ maxHeight: '60vh' }}>
          {visibleRows.length === 0 ? (
            <div
              className="flex h-40 items-center justify-center text-xs text-muted-foreground"
              data-testid="violation-list-empty"
            >
              No violations for the crew currently loaded in this date range.
            </div>
          ) : (
            <table className="w-full border-collapse text-xs" data-testid="violation-list-table">
              <thead className="sticky top-0 z-10 bg-muted/95">
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Sev</th>
                  <th className="px-3 py-2 font-medium">Crew</th>
                  <th className="px-3 py-2 font-medium">Base</th>
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Rule ID</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => (
                  <tr
                    key={`${r.crewId}-${r.ruleCode}-${i}`}
                    className={[
                      'border-b border-border/50 align-top hover:bg-accent/40',
                      onCrewClick ? 'cursor-pointer' : '',
                    ].join(' ')}
                    data-testid="violation-list-row"
                    data-crew-id={r.crewId}
                    data-rule-code={r.ruleCode}
                    data-rule-id={ruleIdOf(r)}
                    onClick={onCrewClick ? () => onCrewClick(r.crewId) : undefined}
                    title={onCrewClick ? `Bring crew ${r.crewId} to the top of the roster` : undefined}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-sm px-1 text-2xs font-bold tabular-nums ${sevBadgeClass(r.severity)}`}
                        title={severityLabelFromNum(r.severity)}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums font-medium text-foreground">{r.crewId}</td>
                    <td className="px-3 py-2 font-mono">{r.base || '—'}</td>
                    <td className="px-3 py-2">{r.rank || '—'}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      <button
                        type="button"
                        data-testid={`alert-rule-id-${ruleIdOf(r)}`}
                        className="text-primary underline-offset-2 hover:underline"
                        title={`Open Rule Templates for ${ruleIdOf(r)}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          const id = ruleIdOf(r)
                          const focus = parseAlertRuleId(id)
                          onClose()
                          setModule('legality')
                          setLegalityItem('rule-instances')
                          requestFocus(focus)
                        }}
                      >
                        {ruleIdOf(r)}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppDialog>
  )
}
