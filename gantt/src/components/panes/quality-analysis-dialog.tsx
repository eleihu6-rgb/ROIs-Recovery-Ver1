import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gauge, AlertTriangle, Check, Settings2 } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { formatBlockMinutes } from '@/components/gantt/gantt-utils'
import {
  QUALITY_RULE_IDS,
  DEFAULT_QUALITY_PARAMS,
  computeRosterQuality,
  type CrewQualityRow,
  type QualityFinding,
  type QualityParams,
  type QualityRuleKey,
} from '@/components/scenario-gantt/quality-analysis'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

interface Props {
  open: boolean
  onClose: () => void
  /** Raw scenario gantt data — dialog owns params + recompute via useMemo. */
  data: ScenarioGanttData | null
  /** Click a crew id → bring that crew to the top row of the gantt (keep dialog open). */
  onCrewClick: (crewId: string) => void
  /** Fires whenever the issue count changes (including when dialog is mounted but closed). */
  onQualityIssueCount: (count: number) => void
}

type ActiveTab = 'analyzer' | 'config'

const RULE_ORDER: QualityRuleKey[] = [
  'standalone-res',
  'consecutive-working',
  'day-off-only',
  'max-working-days',
]

const getRuleDescription = (key: QualityRuleKey, params: QualityParams): string => {
  switch (key) {
    case 'standalone-res':
      return `A reserve/standby day with no adjacent reserve day. The client expects at least ${params.minConsecutiveResDays} consecutive RES/standby days, so every isolated reserve day is flagged.`
    case 'consecutive-working':
      return `A run of more than ${params.maxConsecutiveWorkingDays} consecutive working days (flight, sim or reserve/standby; days off, leave and training don't count). Each run longer than ${params.maxConsecutiveWorkingDays} days is flagged.`
    case 'day-off-only':
      return 'A crew whose entire roster is days off (DO), with no flying, reserve, sim, leave, vacation or training assignment. It received no assignable work at all, which usually points to a data issue.'
    case 'max-working-days':
      return `Flight crew (division ${params.maxWorkingDaysApplicableDivisions.join('/')}) with more than ${params.maxWorkingDaysInPeriod} working days in the scenario period. Non-working codes: ${params.nonWorkingAssignments.join(', ')}.`
  }
}

/** Credited minutes → "HH:MM", or "—" when zero (keeps the dense table readable). */
const fmtCredit = (min: number): string => (min > 0 ? formatBlockMinutes(Math.round(min)) : '—')

const findingSubtext = (f: QualityFinding, params: QualityParams): string => {
  if (f.key === 'consecutive-working') {
    return `· ${f.count === 1 ? 'run' : 'runs'} over ${params.maxConsecutiveWorkingDays} days`
  }
  if (f.key === 'day-off-only') {
    return '· no flying or reserve assignment (possible data issue)'
  }
  if (f.key === 'max-working-days') {
    return `· exceeds ${params.maxWorkingDaysInPeriod}-day period limit`
  }
  return `· isolated reserve ${f.count === 1 ? 'day' : 'days'} (need ≥${params.minConsecutiveResDays} consecutive)`
}

/**
 * Scenario Roster Quality Analyzer — master-detail layout grouped by QLTY rule.
 *
 * Left nav lists each quality criterion with the count of affected crew; the right pane
 * shows crew rows for the selected rule. Scenario-only (Live omits useQualityAnalysis).
 * Parameter Configuration tab lets the user tune thresholds in session-memory.
 */
export const QualityAnalysisDialog = ({
  open,
  onClose,
  data,
  onCrewClick,
  onQualityIssueCount,
}: Props) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyzer')
  const [params, setParams] = useState<QualityParams>(DEFAULT_QUALITY_PARAMS)
  const [draft, setDraft] = useState<QualityParams>(DEFAULT_QUALITY_PARAMS)

  const [issuesOnly, setIssuesOnly] = useState(true)
  const [selectedRule, setSelectedRule] = useState<QualityRuleKey>('standalone-res')
  const [crewFilter, setCrewFilter] = useState('')

  const rows = useMemo<CrewQualityRow[]>(
    () => (data ? computeRosterQuality(data, params) : []),
    [data, params],
  )

  const hasIssue = (r: CrewQualityRow): boolean => r.findings.some((f) => !f.ok)
  const issueCount = useMemo(() => rows.filter(hasIssue).length, [rows])

  useEffect(() => {
    onQualityIssueCount(issueCount)
  }, [issueCount, onQualityIssueCount])

  const ruleStats = useMemo(
    () =>
      RULE_ORDER.map((key) => {
        const findingMeta = rows[0]?.findings.find((f) => f.key === key)
        const affected = rows.filter((r) => {
          const f = r.findings.find((x) => x.key === key)
          return f != null && !f.ok
        })
        return {
          key,
          id: QUALITY_RULE_IDS[key],
          label: findingMeta?.label ?? key,
          count: affected.length,
          affected,
        }
      }),
    [rows],
  )

  const visibleRules = useMemo(
    () => (issuesOnly ? ruleStats.filter((r) => r.count > 0) : ruleStats),
    [ruleStats, issuesOnly],
  )

  const selectedStat = ruleStats.find((r) => r.key === selectedRule) ?? ruleStats[0]

  const detailRows = useMemo(() => {
    const base = issuesOnly ? (selectedStat?.affected ?? []) : rows
    const q = crewFilter.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (r) =>
        r.crewId.toLowerCase().includes(q) ||
        r.base.toLowerCase().includes(q) ||
        r.rank.toLowerCase().includes(q),
    )
  }, [issuesOnly, selectedStat, rows, crewFilter])

  useEffect(() => {
    if (!open) {
      setCrewFilter('')
      return
    }
    const preferred =
      visibleRules.find((r) => r.count > 0)?.key ??
      visibleRules[0]?.key ??
      'standalone-res'
    if (!visibleRules.some((r) => r.key === selectedRule)) {
      setSelectedRule(preferred)
    }
  }, [open, visibleRules, selectedRule])

  const handleIssuesOnlyChange = (checked: boolean): void => {
    setIssuesOnly(checked)
    const nextRules = checked ? ruleStats.filter((r) => r.count > 0) : ruleStats
    if (!nextRules.some((r) => r.key === selectedRule)) {
      setSelectedRule(nextRules[0]?.key ?? 'standalone-res')
    }
  }

  const handleSaveConfig = useCallback(() => {
    setParams(draft)
    setActiveTab('analyzer')
  }, [draft])

  const handleCancelConfig = useCallback(() => {
    setDraft(params)
    setActiveTab('analyzer')
  }, [params])

  const switchToConfig = () => {
    setDraft(params)
    setActiveTab('config')
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="quality-analysis-dialog"
      className="sm:max-w-[min(1200px,97vw)]"
      icon={<Gauge className="h-4 w-4" />}
      title={
        <span className="flex items-center gap-2" data-testid="quality-analysis-title">
          <span className="text-3xs font-medium uppercase tracking-wide opacity-75">Scenario</span>
          <span>Roster Quality Analyzer</span>
          {issueCount > 0 && (
            <span
              data-testid="quality-issue-count"
              className="inline-flex items-center rounded bg-amber-500 px-1.5 py-0.5 text-2xs font-semibold text-white"
            >
              {issueCount}
            </span>
          )}
        </span>
      }
      footer={
        activeTab === 'config' ? (
          <div className="flex gap-2">
            <Button variant="ghost" data-testid="quality-param-cancel" onClick={handleCancelConfig}>
              Cancel
            </Button>
            <Button data-testid="quality-param-save" onClick={handleSaveConfig}>
              Save &amp; Re-analyze
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" size="sm" onClick={switchToConfig} className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5 shrink-0" />
              Parameters
            </Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        )
      }
      bodyClassName="p-0"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          data-testid="quality-analyzer-tab"
          aria-selected={activeTab === 'analyzer'}
          onClick={() => setActiveTab('analyzer')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'analyzer'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Quality Analyzer
        </button>
        <button
          type="button"
          data-testid="quality-config-tab"
          aria-selected={activeTab === 'config'}
          onClick={switchToConfig}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'config'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Parameter Configuration
        </button>
      </div>

      {/* Quality Analyzer tab */}
      {activeTab === 'analyzer' && (
        <div className="flex min-h-0" style={{ maxHeight: '68vh' }}>
          {/* Master — QLTY rule nav */}
          <aside
            className="flex w-[280px] shrink-0 flex-col border-r border-border bg-muted/20"
            data-testid="quality-rule-nav"
          >
            <div className="border-b border-border px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quality rules
            </div>
            <div className="border-b border-border px-3 py-2 text-2xs text-muted-foreground">
              {rows.length} crew · {issueCount} with any finding
            </div>
            <label className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                data-testid="quality-issues-only"
                checked={issuesOnly}
                onChange={(e) => handleIssuesOnlyChange(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Issues only
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {visibleRules.length === 0 ? (
                <div
                  className="px-2 py-6 text-center text-xs text-muted-foreground"
                  data-testid="quality-analysis-empty"
                >
                  No crew with open quality findings.
                </div>
              ) : (
                visibleRules.map((rule) => {
                  const isSelected = rule.key === selectedRule
                  return (
                    <button
                      key={rule.key}
                      type="button"
                      data-testid={`quality-rule-nav-${rule.key}`}
                      data-count={rule.count}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedRule(rule.key)}
                      className={`mb-1 flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-primary bg-background shadow-sm'
                          : 'border-transparent hover:border-border hover:bg-background/80'
                      }`}
                    >
                      <span
                        className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold tabular-nums ${
                          rule.count > 0
                            ? 'bg-amber-500/15 text-amber-700'
                            : 'bg-emerald-500/15 text-emerald-700'
                        }`}
                        data-testid={`quality-rule-count-${rule.key}`}
                      >
                        {rule.count}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-3xs text-muted-foreground">{rule.id}</span>
                        <span className="block text-xs font-semibold text-foreground">{rule.label}</span>
                        <span className="mt-0.5 block text-2xs text-muted-foreground">
                          {rule.count} crew · click to view
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Detail — crew table for selected rule */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"
              data-testid="quality-analysis-standards"
            >
              <h2 className="text-sm font-semibold text-foreground">{selectedStat?.label}</h2>
              <span
                className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-2xs font-semibold text-amber-700"
                data-testid="quality-rule-detail-count"
              >
                {selectedStat?.count ?? 0} crew
              </span>
              <span className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
                <span className="font-mono text-3xs text-foreground/70">{selectedStat?.id}</span>{' '}
                {selectedStat ? getRuleDescription(selectedStat.key, params) : ''}
              </span>
              <input
                type="search"
                data-testid="quality-crew-filter"
                value={crewFilter}
                onChange={(e) => setCrewFilter(e.target.value)}
                placeholder="Filter crew…"
                className="h-7 w-36 shrink-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {rows.length === 0 ? (
                <div
                  className="flex h-40 items-center justify-center text-xs text-muted-foreground"
                  data-testid="quality-analysis-empty"
                >
                  No crew loaded — open a scenario with an optimization result.
                </div>
              ) : detailRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  {issuesOnly && (selectedStat?.count ?? 0) === 0
                    ? 'No crew affected by this rule.'
                    : 'No crew match the filter.'}
                </div>
              ) : (
                <table className="w-full table-fixed border-collapse text-xs" data-testid="quality-analysis-table">
                  <thead className="sticky top-0 z-10 bg-muted/95">
                    <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-20 px-3 py-2 font-medium">Crew ID</th>
                      <th className="w-24 px-3 py-2 font-medium">Base/Rank</th>
                      <th className="w-40 px-3 py-2 font-medium">Awarded credit</th>
                      <th className="px-3 py-2 font-medium">Finding detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((r) => {
                      const finding = r.findings.find((f) => f.key === selectedRule)
                      if (!finding) return null
                      return (
                        <tr
                          key={r.crewId}
                          className="border-b border-border/50 align-top hover:bg-accent/40"
                          data-testid="quality-analysis-row"
                          data-crew-id={r.crewId}
                        >
                          <td className="w-20 px-3 py-2">
                            <button
                              data-testid="quality-crew-link"
                              onClick={() => onCrewClick(r.crewId)}
                              title="Bring this crew to the top of the roster"
                              className="font-mono tabular-nums font-medium text-primary hover:underline"
                            >
                              {r.crewId}
                            </button>
                          </td>
                          <td className="w-24 whitespace-nowrap px-3 py-2 font-mono">{r.base}/{r.rank}</td>
                          <td className="w-40 px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center justify-between gap-3">
                                <span className="text-2xs text-muted-foreground">Before opt</span>
                                <span className="font-mono tabular-nums" data-testid="quality-preassign">{fmtCredit(r.preAssignCreditMin)}</span>
                              </span>
                              <span className="flex items-center justify-between gap-3">
                                <span className="text-2xs text-muted-foreground">After opt</span>
                                <span className="font-mono tabular-nums" data-testid="quality-solver">{fmtCredit(r.solverCreditMin)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {finding.ok ? (
                              <div
                                data-testid={`quality-finding-${finding.key}`}
                                data-ok="true"
                                className="inline-flex w-fit items-center gap-1.5 text-2xs text-muted-foreground"
                              >
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                <span className="font-mono text-3xs opacity-70">{finding.id}</span>
                                <span>{finding.label}: OK</span>
                              </div>
                            ) : (
                              <div
                                data-testid={`quality-finding-${finding.key}`}
                                data-ok="false"
                                data-count={finding.count}
                                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5"
                              >
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <span className="font-mono text-3xs font-normal text-amber-600/70">{finding.id}</span>
                                  <span>
                                    {finding.key === 'day-off-only' ? finding.label : `${finding.count} ${finding.label}`}
                                  </span>
                                  <span className="text-2xs font-normal text-muted-foreground">
                                    {findingSubtext(finding, params)}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {finding.detail.map((d, i) => (
                                    <span
                                      key={i}
                                      data-testid="quality-finding-detail"
                                      className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-3xs tabular-nums text-amber-700"
                                    >
                                      {d}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Parameter Configuration tab */}
      {activeTab === 'config' && (
        <div className="overflow-auto" style={{ maxHeight: '68vh' }}>
          <div className="px-6 py-4">
            <p className="mb-4 text-xs text-muted-foreground">
              Adjust quality check thresholds. Changes apply to this session only and reset when the dialog closes.
            </p>
            <table
              className="w-full border-collapse text-xs"
              data-testid="quality-param-table"
            >
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-16 py-2 pr-4 font-medium">Check</th>
                  <th className="w-40 py-2 pr-4 font-medium">Parameter</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {/* P1 — min consecutive RES days */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-min-res"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1001</td>
                  <td className="py-3 pr-4 text-xs">Min consecutive RES days</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={draft.minConsecutiveResDays}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          minConsecutiveResDays: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="h-7 w-20 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>

                {/* P2 — max consecutive working days */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-max-work"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1002</td>
                  <td className="py-3 pr-4 text-xs">Max consecutive working days</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draft.maxConsecutiveWorkingDays}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          maxConsecutiveWorkingDays: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="h-7 w-20 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>

                {/* P3 — day-off-only (no adjustable params) */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-day-off"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1003</td>
                  <td className="py-3 pr-4 text-xs">Day-off only detection</td>
                  <td className="py-3 text-2xs text-muted-foreground italic">No configurable parameters</td>
                </tr>

                {/* P4 — max working days in period */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-max-period"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1004</td>
                  <td className="py-3 pr-4 text-xs">Max working days in period</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.maxWorkingDaysInPeriod}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          maxWorkingDaysInPeriod: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="h-7 w-20 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>

                {/* P4 — non-working assignment codes */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-nonworking-codes"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1004</td>
                  <td className="py-3 pr-4 text-xs">Non-working assignment codes</td>
                  <td className="py-3">
                    <input
                      type="text"
                      value={draft.nonWorkingAssignments.join(',')}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          nonWorkingAssignments: e.target.value
                            .split(',')
                            .map((s) => s.trim().toUpperCase())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="ILL,VAC,DO"
                      className="h-7 w-40 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>

                {/* P4 — applicable divisions */}
                <tr
                  className="border-b border-border/50"
                  data-testid="quality-param-row-divisions"
                >
                  <td className="py-3 pr-4 font-mono text-2xs text-muted-foreground">Qlty-1004</td>
                  <td className="py-3 pr-4 text-xs">Applicable divisions</td>
                  <td className="py-3">
                    <input
                      type="text"
                      value={draft.maxWorkingDaysApplicableDivisions.join(',')}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          maxWorkingDaysApplicableDivisions: e.target.value
                            .split(',')
                            .map((s) => s.trim().toUpperCase())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="P"
                      className="h-7 w-32 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="ml-2 text-2xs text-muted-foreground">P=flight, C=cabin</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppDialog>
  )
}
