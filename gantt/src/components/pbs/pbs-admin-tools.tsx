import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Download,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@rois/ui'
import { AlgorithmExportScopeFilters } from './algorithm-export-scope-filters'
import { fetchPbsPeriods, type PbsPeriod } from '@/services/pbs-period-admin-api'
import {
  downloadAlgorithmPackage,
  dryRunCrewBidImport,
  fetchCrewBidImportRun,
  fetchCrewBidImportRuns,
  importCrewBids,
  rollbackCrewBidImportRun,
  type PbsAlgorithmExportFilters,
  type CrewBidImportUploadInput,
  type PbsCrewBidImportItem,
  type PbsCrewBidImportOptions,
  type PbsCrewBidImportPerformance,
  type PbsCrewBidImportProblem,
  type PbsCrewBidImportResponse,
  type PbsCrewBidImportRunDetailResponse,
  type PbsCrewBidImportRunListItem,
  type PbsCrewBidImportStatus,
} from '@/services/pbs-admin-tools-api'

type ActionKey = 'export-current' | 'export-yeg' | 'dry-run' | 'import' | 'runs' | 'detail' | 'rollback'

const DEFAULT_IMPORT_OPTIONS: Required<PbsCrewBidImportOptions> = {
  importCurrentBid: true,
  importDefaultAsStanding: true,
  useCurrentBidWhenAvailable: true,
  fallbackToDefaultBid: true,
  firstPairingBidGroupOnly: true,
  overwriteCurrentBid: true,
  overwriteStandingBid: true,
  failOnUnmatchedPairing: false,
  failOnUnmatchedAirport: false,
}

const DEFAULT_EXPORT_FILTERS: PbsAlgorithmExportFilters = {
  division: 'ALL',
  status: 'ACTIVE',
  bases: [],
  fleetQuals: [],
}

const statusClassName = (status: string): string => {
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700'
  if (status === 'queued' || status === 'running') return 'border-blue-300 bg-blue-50 text-blue-700'
  if (status === 'completed_with_warnings') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (status === 'rolled_back') return 'border-slate-300 bg-slate-50 text-slate-700'
  return 'border-emerald-300 bg-emerald-50 text-emerald-700'
}

const isImportRunActive = (status: PbsCrewBidImportStatus): boolean =>
  status === 'queued' || status === 'running'

const splitList = (value: string): string[] =>
  Array.from(new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)))

const MONTH_CODE_BY_LABEL = new Map(
  [
    ['JANUARY', 'Jan'],
    ['JAN', 'Jan'],
    ['FEBRUARY', 'Feb'],
    ['FEB', 'Feb'],
    ['MARCH', 'Mar'],
    ['MAR', 'Mar'],
    ['APRIL', 'Apr'],
    ['APR', 'Apr'],
    ['MAY', 'May'],
    ['JUNE', 'Jun'],
    ['JUN', 'Jun'],
    ['JULY', 'Jul'],
    ['JUL', 'Jul'],
    ['AUGUST', 'Aug'],
    ['AUG', 'Aug'],
    ['SEPTEMBER', 'Sep'],
    ['SEP', 'Sep'],
    ['OCTOBER', 'Oct'],
    ['OCT', 'Oct'],
    ['NOVEMBER', 'Nov'],
    ['NOV', 'Nov'],
    ['DECEMBER', 'Dec'],
    ['DEC', 'Dec'],
  ].map(([label, code]) => [label, code] as const),
)

const normalizePeriodLabel = (value: string): string | null => {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return null
  const monthCode = MONTH_CODE_BY_LABEL.get(match[1].toUpperCase())
  const year = match[2]
  return monthCode ? `${monthCode} ${year}` : null
}

const extractPeriodCodeFromBidText = (text: string): string | null => {
  const periodMatch = text.match(/^Period:\s*(.+?)\s*$/im)
  return periodMatch?.[1] ? normalizePeriodLabel(periodMatch[1]) : null
}

const normalizePeriodForFilename = (periodCode: string): string =>
  periodCode.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'period'

const formatDateTime = (value?: string): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const formatDuration = (value: number): string => {
  if (value >= 60_000) return `${(value / 60_000).toFixed(2)} min`
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const Field = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactNode => (
  <label className="flex min-w-0 flex-col gap-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
)

const Section = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactNode => (
  <section className="border-b border-border bg-background">
    <div className="border-b border-border bg-muted/30 px-4 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
    </div>
    <div className="p-4">{children}</div>
  </section>
)

const SummaryGrid = ({ result }: { result: PbsCrewBidImportResponse | PbsCrewBidImportRunDetailResponse }): ReactNode => {
  const summary = result.summary
  const cells = [
    ['Selected Crew', summary.selectedCrew],
    ['Ready Crew', summary.readyCrew],
    ['Imported Crew', summary.importedCrew],
    ['Skipped Crew', summary.skippedCrew],
    ['Failed Crew', summary.failedCrew],
    ['Importable Prefs', summary.importablePreferenceCount],
    ['Skipped Prefs', summary.skippedPreferenceCount],
    ['Failed Prefs', summary.failedPreferenceCount],
    ['Unmatched Pairings', summary.unmatchedPairingCount],
  ] as const

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-4 xl:grid-cols-9">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-background px-3 py-2">
          <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
        </div>
      ))}
    </div>
  )
}

const PerformanceTable = ({ performance }: { performance?: PbsCrewBidImportPerformance }): ReactNode => {
  if (!performance) return null

  const counters = [
    ['Selected Crew', performance.selectedCrew],
    ['Resolver Scopes', performance.resolverScopeCount ?? 0],
    ['Pairing Queries', performance.pairingResolverQueryCount ?? 0],
    ['Airport Queries', performance.airportResolverQueryCount ?? 0],
    ['Written Bids', performance.writtenBidCount ?? 0],
  ] as const

  return (
    <div className="overflow-hidden rounded-sm border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-xs font-semibold text-foreground">Performance</span>
        <div className="flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
          <span>Total {formatDuration(performance.totalMs)}</span>
          {counters.map(([label, value]) => (
            <span key={label}>{label}: {value}</span>
          ))}
        </div>
      </div>
      <div className="max-h-56 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Phase</TableHead>
              <TableHead className="w-28 text-right">Duration</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performance.timings.map((timing) => (
              <TableRow key={timing.phase}>
                <TableCell className="font-mono text-xs">{timing.phase}</TableCell>
                <TableCell className="text-right text-xs">{formatDuration(timing.durationMs)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {timing.detail
                    ? Object.entries(timing.detail).map(([key, value]) => `${key}: ${value}`).join(', ')
                    : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type FailureFeedbackRow = {
  key: string
  failureType: FailureTypeKey
  severity: PbsCrewBidImportProblem['severity']
  crewId: string | null
  category: string | null
  bidContext: PbsCrewBidImportItem['bidContext'] | null
  targetBidContext: PbsCrewBidImportItem['targetBidContext'] | null
  status: PbsCrewBidImportItem['status'] | null
  sourceLineNumber: number | null
  sourceSeq: number | null
  rawText: string | null
  code: string
  message: string
}

type FailureTypeKey =
  | 'missing_pairing'
  | 'missing_airport'
  | 'over_t7'
  | 'unsupported_condition'
  | 'crew_user'
  | 'system_write'
  | 'other'

type FailureFilterKey = FailureTypeKey | 'all'

const FAILURE_TYPE_LABELS: Record<FailureTypeKey, string> = {
  missing_pairing: 'Missing Pairing',
  missing_airport: 'Missing Airport',
  over_t7: 'Over T7',
  unsupported_condition: 'Unsupported',
  crew_user: 'Crew / User',
  system_write: 'System / Write',
  other: 'Other',
}

const FAILURE_FILTERS: Array<{ key: FailureFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'missing_pairing', label: FAILURE_TYPE_LABELS.missing_pairing },
  { key: 'missing_airport', label: FAILURE_TYPE_LABELS.missing_airport },
  { key: 'over_t7', label: FAILURE_TYPE_LABELS.over_t7 },
  { key: 'unsupported_condition', label: FAILURE_TYPE_LABELS.unsupported_condition },
  { key: 'crew_user', label: FAILURE_TYPE_LABELS.crew_user },
  { key: 'system_write', label: FAILURE_TYPE_LABELS.system_write },
  { key: 'other', label: FAILURE_TYPE_LABELS.other },
]

const classifyFailureType = (code: string): FailureTypeKey => {
  const normalizedCode = code.toLowerCase()

  if (normalizedCode === 'unmatched_pairing_number' || normalizedCode.includes('pairing_not_available')) {
    return 'missing_pairing'
  }

  if (normalizedCode.includes('airport')) {
    return 'missing_airport'
  }

  if (normalizedCode === 'preference_ignored_tier_capacity') {
    return 'over_t7'
  }

  if (
    normalizedCode.startsWith('unsupported_')
    || normalizedCode.startsWith('invalid_')
    || normalizedCode === 'missing_pairing_criterion'
    || normalizedCode === 'empty_pairing_number'
    || normalizedCode === 'failed_preference'
  ) {
    return 'unsupported_condition'
  }

  if (normalizedCode.includes('crew') || normalizedCode.includes('pbs_user')) {
    return 'crew_user'
  }

  if (
    normalizedCode.includes('write')
    || normalizedCode === 'bid_write_failed'
    || normalizedCode === 'import_run_failed'
    || normalizedCode === 'import_run_stale'
  ) {
    return 'system_write'
  }

  return 'other'
}

const failureTypeClassName = (failureType: FailureTypeKey): string => {
  if (failureType === 'missing_pairing') return 'border-violet-300 bg-violet-50 text-violet-700'
  if (failureType === 'missing_airport') return 'border-sky-300 bg-sky-50 text-sky-700'
  if (failureType === 'over_t7') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (failureType === 'unsupported_condition') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (failureType === 'crew_user') return 'border-cyan-300 bg-cyan-50 text-cyan-700'
  if (failureType === 'system_write') return 'border-red-300 bg-red-50 text-red-700'
  return 'border-slate-300 bg-slate-50 text-slate-700'
}

const itemKey = (
  item: Pick<PbsCrewBidImportItem, 'crewId' | 'category' | 'bidContext' | 'targetBidContext'>,
): string => `${item.crewId}:${item.category}:${item.bidContext}:${item.targetBidContext}`

const isResumeSkippedItem = (item: PbsCrewBidImportItem): boolean =>
  item.status === 'skipped'
  && Boolean(item.importedBidId)
  && item.message?.startsWith('Already imported by previous run') === true

const isIncompleteImportItem = (item: PbsCrewBidImportItem): boolean =>
  !isResumeSkippedItem(item) && (
    item.status === 'failed'
  || item.status === 'skipped'
  || item.failedPreferenceCount > 0
  || item.unmatchedPairingCount > 0
  )

const buildFailureFeedbackRows = (
  result: PbsCrewBidImportResponse | PbsCrewBidImportRunDetailResponse,
): FailureFeedbackRow[] => {
  const problemItemKeys = new Set<string>()
  const problemRows = result.problems.map((problem, index) => {
    const matchedItem = problem.crewId
      ? result.items.find((item) =>
        item.crewId === problem.crewId
        && (!problem.category || item.category === problem.category)
        && (!problem.bidContext || item.bidContext === problem.bidContext)
        && (!problem.targetBidContext || item.targetBidContext === problem.targetBidContext))
      : undefined

    if (matchedItem) {
      problemItemKeys.add(itemKey(matchedItem))
    }

    return {
      key: `problem-${problem.crewId ?? 'run'}-${problem.sourceLineNumber ?? 'line'}-${problem.sourceSeq ?? index}-${index}`,
      failureType: classifyFailureType(problem.code),
      severity: problem.severity,
      crewId: problem.crewId ?? null,
      category: problem.category ?? matchedItem?.category ?? null,
      bidContext: problem.bidContext ?? matchedItem?.bidContext ?? null,
      targetBidContext: problem.targetBidContext ?? matchedItem?.targetBidContext ?? null,
      status: matchedItem?.status ?? null,
      sourceLineNumber: problem.sourceLineNumber ?? null,
      sourceSeq: problem.sourceSeq ?? null,
      rawText: problem.rawText ?? null,
      code: problem.code,
      message: problem.message,
    } satisfies FailureFeedbackRow
  })

  const itemRows = result.items.flatMap((item) => {
    if (!isIncompleteImportItem(item) || problemItemKeys.has(itemKey(item))) {
      return []
    }

    const reasonParts = [
      item.message,
      item.failedPreferenceCount > 0 ? `${item.failedPreferenceCount} failed preference(s)` : null,
      item.unmatchedPairingCount > 0 ? `${item.unmatchedPairingCount} unmatched pairing(s)` : null,
    ].filter(Boolean)
    const code = item.unmatchedPairingCount > 0
      ? 'unmatched_pairing_number'
      : item.failedPreferenceCount > 0
        ? 'failed_preference'
        : item.status

    return [{
      key: `item-${itemKey(item)}`,
      failureType: classifyFailureType(code),
      severity: item.status === 'failed' ? 'error' : 'warning',
      crewId: item.crewId,
      category: item.category,
      bidContext: item.bidContext,
      targetBidContext: item.targetBidContext,
      status: item.status,
      sourceLineNumber: null,
      sourceSeq: null,
      rawText: null,
      code,
      message: reasonParts.join('; ') || 'Crew bid was not fully imported.',
    } satisfies FailureFeedbackRow]
  })

  return [...problemRows, ...itemRows].sort((left, right) => {
    const leftCrew = left.crewId ?? '~~~~'
    const rightCrew = right.crewId ?? '~~~~'

    if (leftCrew !== rightCrew) return leftCrew.localeCompare(rightCrew, undefined, { numeric: true })

    return (left.sourceLineNumber ?? Number.MAX_SAFE_INTEGER) - (right.sourceLineNumber ?? Number.MAX_SAFE_INTEGER)
  })
}

const FailuresTable = ({
  result,
}: {
  result: PbsCrewBidImportResponse | PbsCrewBidImportRunDetailResponse
}): ReactNode => {
  const [failureFilter, setFailureFilter] = useState<FailureFilterKey>('all')
  const rows = buildFailureFeedbackRows(result)
  const countsByType = rows.reduce((counts, row) => {
    counts.set(row.failureType, (counts.get(row.failureType) ?? 0) + 1)

    return counts
  }, new Map<FailureTypeKey, number>())
  const filteredRows = failureFilter === 'all'
    ? rows
    : rows.filter((row) => row.failureType === failureFilter)
  const visibleRows = filteredRows.slice(0, 100)

  return (
    <div data-testid="pbs-import-failures" className="overflow-hidden rounded-sm border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Failures</span>
          <span className="text-2xs text-muted-foreground">Only failed or incomplete crew are shown</span>
        </div>
        <span className="text-2xs text-muted-foreground">
          {filteredRows.length}{failureFilter === 'all' ? '' : ` / ${rows.length}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        {FAILURE_FILTERS.map((filter) => {
          const count = filter.key === 'all' ? rows.length : countsByType.get(filter.key) ?? 0
          const active = filter.key === failureFilter

          return (
            <Button
              key={filter.key}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              className="h-7 gap-1.5 rounded-sm px-2 text-2xs"
              onClick={() => setFailureFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <span className={active
                ? 'rounded-full bg-primary-foreground/20 px-1.5 font-mono text-2xs'
                : 'rounded-full bg-muted px-1.5 font-mono text-2xs text-muted-foreground'}
              >
                {count}
              </span>
            </Button>
          )
        })}
      </div>
      <div className="max-h-96 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-20">Severity</TableHead>
              <TableHead className="w-24">Crew</TableHead>
              <TableHead className="w-28">Category</TableHead>
              <TableHead className="w-40">Source → Target</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-20 text-right">Line</TableHead>
              <TableHead className="w-16 text-right">Seq</TableHead>
              <TableHead className="min-w-72">Failed Preference</TableHead>
              <TableHead className="w-36">Code</TableHead>
              <TableHead className="min-w-96">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-20 text-center text-xs text-muted-foreground">
                  No failed or incomplete preferences
                </TableCell>
              </TableRow>
            ) : visibleRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <Badge variant="outline" className={failureTypeClassName(row.failureType)}>
                    {FAILURE_TYPE_LABELS[row.failureType]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={row.severity === 'error'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-amber-300 bg-amber-50 text-amber-700'}
                  >
                    {row.severity}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.crewId ?? '-'}</TableCell>
                <TableCell className="text-xs">{row.category ?? '-'}</TableCell>
                <TableCell className="text-xs">
                  {row.bidContext && row.targetBidContext
                    ? `${row.bidContext} → ${row.targetBidContext}`
                    : row.bidContext ?? row.targetBidContext ?? '-'}
                </TableCell>
                <TableCell className="text-xs">
                  {row.status ? <Badge variant="outline" className={statusClassName(row.status)}>{row.status}</Badge> : '-'}
                </TableCell>
                <TableCell className="text-right text-xs">{row.sourceLineNumber ?? '-'}</TableCell>
                <TableCell className="text-right text-xs">{row.sourceSeq ?? '-'}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal text-xs">{row.rawText ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell className="max-w-[520px] whitespace-normal text-xs">{row.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > visibleRows.length && (
        <div className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
          Showing first {visibleRows.length} rows
        </div>
      )}
    </div>
  )
}

const ResultPanel = ({
  result,
}: {
  result: PbsCrewBidImportResponse | PbsCrewBidImportRunDetailResponse | null
}): ReactNode => {
  if (!result) return null
  const resumeSkippedCrew = result.items.filter(isResumeSkippedItem).length

  return (
    <div data-testid="pbs-import-result" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={statusClassName(result.status)}>{result.status}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{result.runId ?? result.mode}</span>
        <span className="text-xs text-muted-foreground">{result.periodCode}</span>
      </div>
      <SummaryGrid result={result} />
      {resumeSkippedCrew > 0 && (
        <div className="rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {resumeSkippedCrew} crew already imported from a previous run were skipped for this resume import.
        </div>
      )}
      <PerformanceTable performance={result.performance} />
      <FailuresTable result={result} />
    </div>
  )
}

export const PbsAdminTools = (): ReactNode => {
  const [exportPeriods, setExportPeriods] = useState<PbsPeriod[]>([])
  const [exportRosterPeriodId, setExportRosterPeriodId] = useState('')
  const [exportPeriodCode, setExportPeriodCode] = useState('Jun 2026')
  const [exportFilters, setExportFilters] = useState<PbsAlgorithmExportFilters>(DEFAULT_EXPORT_FILTERS)
  const [importRosterPeriodId, setImportRosterPeriodId] = useState('')
  const [scopeBase, setScopeBase] = useState('')
  const [scopeCrewIds, setScopeCrewIds] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [filePeriodCode, setFilePeriodCode] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PbsCrewBidImportResponse | PbsCrewBidImportRunDetailResponse | null>(null)
  const [runs, setRuns] = useState<PbsCrewBidImportRunListItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [pollingRunId, setPollingRunId] = useState<string | null>(null)
  const [runRosterPeriodId, setRunRosterPeriodId] = useState('')
  const [runLimit, setRunLimit] = useState(20)
  const [restorePrevious, setRestorePrevious] = useState(true)

  useEffect(() => {
    fetchPbsPeriods()
      .then(({ rows }) => {
        setExportPeriods(rows)
        const preferred = rows.find((period) => period.periodCode === exportPeriodCode) ?? rows[0]
        if (preferred) {
          setExportRosterPeriodId(String(preferred.id))
          setExportPeriodCode(preferred.periodCode)
          setImportRosterPeriodId(String(preferred.id))
          setRunRosterPeriodId(String(preferred.id))
        }
      })
      .catch(() => {
        setExportPeriods([])
        setExportRosterPeriodId('')
      })
  }, [])

  const uploadInput = useMemo<CrewBidImportUploadInput | null>(() => {
    const selectedPeriod = exportPeriods.find((period) => String(period.id) === importRosterPeriodId)
    if (!selectedFile || !selectedPeriod) return null
    return {
      file: selectedFile,
      rosterPeriodId: selectedPeriod.id,
      periodCode: selectedPeriod.periodCode,
      scopeBase: scopeBase.trim() || undefined,
      scopeCrewIds: splitList(scopeCrewIds),
      options: DEFAULT_IMPORT_OPTIONS,
    }
  }, [exportPeriods, importRosterPeriodId, scopeBase, scopeCrewIds, selectedFile])

  useEffect(() => {
    if (!filePeriodCode) return

    const matches = exportPeriods.filter((period) => period.periodCode === filePeriodCode)
    const matchedPeriod = matches.length === 1 ? matches[0] : undefined
    if (matchedPeriod) {
      setImportRosterPeriodId(String(matchedPeriod.id))
      setError(null)
      return
    }

    setImportRosterPeriodId('')
    setError(`The file period ${filePeriodCode} does not uniquely match a configured Live roster period. Select the target period.`)
  }, [exportPeriods, filePeriodCode])

  const clearAlerts = (): void => {
    setError(null)
    setMessage(null)
  }

  const runAction = async (action: ActionKey, task: () => Promise<void>): Promise<void> => {
    clearAlerts()
    setActiveAction(action)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActiveAction(null)
    }
  }

  const loadRuns = useCallback(async (rosterPeriodId = runRosterPeriodId): Promise<PbsCrewBidImportRunListItem[]> => {
    const parsedRosterPeriodId = Number(rosterPeriodId)
    const response = await fetchCrewBidImportRuns({
      rosterPeriodId: Number.isSafeInteger(parsedRosterPeriodId) && parsedRosterPeriodId > 0
        ? parsedRosterPeriodId
        : undefined,
      limit: runLimit,
    })
    setRuns(response.runs)
    return response.runs
  }, [runLimit, runRosterPeriodId])

  useEffect(() => {
    if (!pollingRunId) return

    let cancelled = false

    const pollRun = async (): Promise<void> => {
      try {
        const detail = await fetchCrewBidImportRun(pollingRunId)

        if (cancelled) return

        setResult(detail)
        setSelectedRunId(detail.runId ?? pollingRunId)
        setRunRosterPeriodId(String(detail.rosterPeriodId))
        await loadRuns(String(detail.rosterPeriodId))

        if (!isImportRunActive(detail.status)) {
          setPollingRunId(null)
          if (detail.status === 'failed') {
            const firstProblem = detail.problems[0]
            setError(`Import failed${detail.runId ? `: ${detail.runId}` : ''}${firstProblem ? ` - ${firstProblem.message}` : ''}`)
            return
          }
          setMessage(`Import ${detail.status}${detail.runId ? `: ${detail.runId}` : ''}`)
        }
      } catch (err) {
        if (cancelled) return
        setPollingRunId(null)
        setError(err instanceof Error ? err.message : 'Failed to refresh import run')
      }
    }

    void pollRun()
    const intervalId = window.setInterval(() => {
      void pollRun()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadRuns, pollingRunId])

  const handleDownload = (variant: 'current' | 'yeg-test'): void => {
    const selectedPeriod = exportPeriods.find((period) => String(period.id) === exportRosterPeriodId)
    if (!selectedPeriod) return
    const periodCode = selectedPeriod.periodCode
    const action: ActionKey = variant === 'current' ? 'export-current' : 'export-yeg'
    runAction(action, async () => {
      const blob = await downloadAlgorithmPackage(selectedPeriod.id, periodCode, variant, exportFilters)
      const prefix = variant === 'current' ? 'pbs-algorithm-export' : 'pbs-algorithm-export-yeg-14'
      downloadBlob(blob, `${prefix}-${normalizePeriodForFilename(periodCode)}.tgz`)
      setMessage('Download started')
    })
  }

  const handleDryRun = (): void => {
    if (!uploadInput) return
    runAction('dry-run', async () => {
      const response = await dryRunCrewBidImport(uploadInput)
      setResult(response)
      setMessage('Dry run completed')
    })
  }

  const handleImport = (): void => {
    if (!uploadInput) return
    if (!window.confirm(`Import crew bids for ${uploadInput.periodCode}?`)) return
    runAction('import', async () => {
      const response = await importCrewBids(uploadInput)
      setResult(response)
      setRunRosterPeriodId(String(response.rosterPeriodId))
      if (response.runId) {
        setSelectedRunId(response.runId)
        if (isImportRunActive(response.status)) {
          setPollingRunId(response.runId)
        }
      }
      await loadRuns(String(response.rosterPeriodId))
      setMessage(`Import ${isImportRunActive(response.status) ? 'started' : response.status}${response.runId ? `: ${response.runId}` : ''}`)
    })
  }

  const handleLoadRuns = (): void => {
    runAction('runs', async () => {
      await loadRuns()
      setMessage('Runs refreshed')
    })
  }

  const handleViewRun = (runId: string): void => {
    setSelectedRunId(runId)
    runAction('detail', async () => {
      const response = await fetchCrewBidImportRun(runId)
      setResult(response)
      if (response.runId && isImportRunActive(response.status)) {
        setPollingRunId(response.runId)
      }
      setMessage(`Loaded ${runId}`)
    })
  }

  const handleRollback = (runId: string, rosterPeriodId = runRosterPeriodId): void => {
    const run = runs.find((item) => item.runId === runId)
    if (run && isImportRunActive(run.status)) {
      setError('Import run is still running and cannot be rolled back.')
      return
    }
    if (!window.confirm(`Rollback import run ${runId}?`)) return
    runAction('rollback', async () => {
      const response = await rollbackCrewBidImportRun(runId, restorePrevious)
      setMessage(`Rolled back ${response.runId}`)
      await loadRuns(rosterPeriodId)
      const detail = await fetchCrewBidImportRun(runId)
      setResult(detail)
    })
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setFilePeriodCode(null)

    if (!file) return

    void file.slice(0, 16 * 1024).text()
      .then((text) => {
        const periodCode = extractPeriodCodeFromBidText(text)
        if (!periodCode) return
        setFilePeriodCode(periodCode)
      })
      .catch(() => {
        setFilePeriodCode(null)
      })
  }

  const busy = (action: ActionKey): boolean => activeAction === action
  const canDownload = exportPeriods.some((period) => String(period.id) === exportRosterPeriodId)
  const canUpload = uploadInput !== null
  const selectedRun = selectedRunId ? runs.find((run) => run.runId === selectedRunId) : undefined

  return (
    <div data-testid="pbs-admin-tools" className="h-full overflow-auto bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Admin Tools</h1>
          </div>
          <div className="flex items-center gap-2">
            {message && <span aria-live="polite" className="text-xs text-emerald-700">{message}</span>}
            {error && (
              <span role="alert" className="inline-flex items-center gap-1 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
          </div>
        </div>
      </div>

      <Section title="Algorithm Export">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto] xl:items-end">
          <Field label="Period Code">
            <Select
              value={exportRosterPeriodId}
              onValueChange={(value) => {
                const selectedPeriod = exportPeriods.find((period) => String(period.id) === value)
                setExportRosterPeriodId(value)
                if (selectedPeriod) setExportPeriodCode(selectedPeriod.periodCode)
              }}
            >
              <SelectTrigger data-testid="pbs-export-period" className="h-8 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {exportPeriods.map((period) => (
                  <SelectItem key={period.id} value={String(period.id)} className="text-xs">
                    {period.periodCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <AlgorithmExportScopeFilters value={exportFilters} onChange={setExportFilters} />
          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:col-start-6 xl:row-start-1 xl:flex-nowrap xl:justify-end">
            <Button
              size="sm"
              className="h-8 min-w-[150px]"
              onClick={() => handleDownload('current')}
              disabled={!canDownload || busy('export-current')}
            >
              <Download className="h-4 w-4" />
              Current Package
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Crew Bid Import">
        <p className="mb-3 text-xs text-muted-foreground">
          Current Bid → Current month · Default Bid → Standing Bid. Specific dates are removed only
          when the remaining long-term condition is complete; date-only preferences are skipped and reported.
        </p>
        <div data-testid="pbs-crew-bid-import" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,240px)_minmax(120px,180px)_minmax(220px,1fr)_minmax(260px,1.1fr)_auto] xl:items-end">
          <Field label="Period Code">
            <Select
              value={importRosterPeriodId}
              onValueChange={(value) => {
                setImportRosterPeriodId(value)
                setError(null)
              }}
            >
              <SelectTrigger data-testid="pbs-import-period" className="h-8 text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {exportPeriods.map((period) => (
                  <SelectItem key={period.id} value={String(period.id)} className="text-xs">
                    {period.periodCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Base">
            <Input
              data-testid="pbs-import-base"
              value={scopeBase}
              onChange={(event) => setScopeBase(event.target.value)}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Crew IDs">
            <Input
              data-testid="pbs-import-crew-ids"
              value={scopeCrewIds}
              onChange={(event) => setScopeCrewIds(event.target.value)}
              className="h-8 text-xs"
            />
          </Field>
          <div className="flex min-w-0 flex-col gap-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>TXT File</span>
            <div className="flex h-8 min-w-0 items-center gap-2">
              <input
                ref={importFileInputRef}
                id="pbs-import-file"
                data-testid="pbs-import-file"
                type="file"
                accept=".txt,text/plain"
                onChange={handleFileChange}
                tabIndex={-1}
                aria-label="TXT file"
                aria-describedby="pbs-import-file-status"
                className="sr-only"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                aria-controls="pbs-import-file"
                aria-describedby="pbs-import-file-status"
                onClick={() => importFileInputRef.current?.click()}
              >
                Choose TXT File
              </Button>
              <span
                id="pbs-import-file-status"
                role="status"
                aria-live="polite"
                className="min-w-0 truncate text-xs font-normal normal-case text-muted-foreground"
              >
                {selectedFile?.name ?? 'No file selected'}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1 xl:flex-nowrap">
            <Button
              data-testid="pbs-import-dry-run"
              size="sm"
              className="h-8"
              onClick={handleDryRun}
              disabled={!canUpload || busy('dry-run')}
            >
              <Search className="h-4 w-4" />
              Dry Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleImport}
              disabled={!canUpload || busy('import') || pollingRunId !== null}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            {selectedFile && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {selectedFile.name}
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Import Runs">
        <div className="mb-3 grid gap-3 md:grid-cols-[minmax(160px,240px)_120px_auto_1fr] md:items-end">
          <Field label="Period Code">
            <Select value={runRosterPeriodId} onValueChange={setRunRosterPeriodId}>
              <SelectTrigger data-testid="pbs-import-run-period" className="h-8 text-xs">
                <SelectValue placeholder="All periods" />
              </SelectTrigger>
              <SelectContent>
                {exportPeriods.map((period) => (
                  <SelectItem key={period.id} value={String(period.id)} className="text-xs">
                    {period.periodCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Limit">
            <Input
              type="number"
              min={1}
              max={100}
              value={runLimit}
              onChange={(event) => setRunLimit(Number(event.target.value) || 20)}
              className="h-8 text-xs"
            />
          </Field>
          <Button size="sm" variant="outline" onClick={handleLoadRuns} disabled={busy('runs')}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground md:justify-self-end">
            <input
              type="checkbox"
              checked={restorePrevious}
              onChange={() => setRestorePrevious((current) => !current)}
              className="h-3.5 w-3.5"
            />
            Restore previous on rollback
          </label>
        </div>

        {selectedRun && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Run</span>
              <span className="font-mono text-foreground">{selectedRun.runId}</span>
              <span className="text-muted-foreground">{selectedRun.periodCode}</span>
              <Badge variant="outline" className={statusClassName(selectedRun.status)}>{selectedRun.status}</Badge>
              <span className="text-muted-foreground">Imported {selectedRun.summary.importedCrew}</span>
              <span className="text-muted-foreground">Failed {selectedRun.summary.failedCrew}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => handleViewRun(selectedRun.runId)}
                disabled={busy('detail')}
              >
                Detail
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => handleRollback(selectedRun.runId, String(selectedRun.rosterPeriodId))}
                disabled={selectedRun.status === 'rolled_back' || isImportRunActive(selectedRun.status) || busy('rollback')}
              >
                <RotateCcw className="h-4 w-4" />
                Rollback Selected Import
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-sm border border-border">
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-44 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center text-xs text-muted-foreground">
                      No runs loaded
                    </TableCell>
                  </TableRow>
                ) : runs.map((run) => (
                  <TableRow
                    key={run.runId}
                    className={`cursor-pointer hover:bg-muted/40 ${selectedRunId === run.runId ? 'bg-primary/5' : ''}`}
                    onClick={() => setSelectedRunId(run.runId)}
                  >
                    <TableCell className="font-mono text-xs">{run.runId}</TableCell>
                    <TableCell className="text-xs">{run.periodCode}</TableCell>
                    <TableCell className="text-xs">{run.mode}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClassName(run.status)}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{run.summary.importedCrew}</TableCell>
                    <TableCell className="text-right text-xs">{run.summary.failedCrew}</TableCell>
                    <TableCell className="text-xs">{run.createdBy}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(run.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleViewRun(run.runId)
                          }}
                          disabled={busy('detail')}
                        >
                          Detail
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedRunId(run.runId)
                            handleRollback(run.runId, String(run.rosterPeriodId))
                          }}
                          disabled={run.status === 'rolled_back' || isImportRunActive(run.status) || busy('rollback')}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Rollback
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Section>

      <div className="p-4">
        <ResultPanel result={result} />
      </div>
    </div>
  )
}
