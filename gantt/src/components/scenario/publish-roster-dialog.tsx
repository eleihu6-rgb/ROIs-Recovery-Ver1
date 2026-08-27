// gantt/src/components/scenario/publish-roster-dialog.tsx
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { UploadCloud, Loader2, Users, CheckCircle2, EyeOff, Eye, Search, AlertTriangle } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@rois/ui'
import { useScenarioStore } from '@/stores/scenario-store'
import type { RosterAssignment } from '@/types'

interface PublishRosterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scenarioId: number
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const assignmentKey = (a: Pick<RosterAssignment, 'kind' | 'crewId' | 'pairingId' | 'rosterIds'>): string =>
  a.kind === 'FLYING'
    ? `F::${a.crewId}::${a.pairingId ?? ''}`
    : `G::${a.crewId}::${a.rosterIds.join(',')}`

const statusLabel = (status: RosterAssignment['status']): string => {
  if (status === 'PRE_ASSIGN') return 'Pre-assign'
  if (status === 'PUBLISHED') return 'Imported'
  if (status === 'EXCEPTION') return 'No Live Crew'
  return 'Pending'
}

type ImportProgressStatus = 'idle' | 'importing' | 'complete'
type SelectionState =
  | { mode: 'allPublishable'; excluded: Set<string> }
  | { mode: 'explicit'; included: Set<string> }

const TABLE_COLUMN_COUNT = 13
const TABLE_HEAD_CLASS = 'sticky top-0 z-20 whitespace-nowrap border-b border-border bg-background/95 text-2xs'
const VIRTUAL_ROW_HEIGHT = 36
const VIRTUAL_OVERSCAN_ROWS = 10
const VIRTUAL_VIEWPORT_HEIGHT = 620

interface ImportProgressState {
  status: ImportProgressStatus
  percent: number
  step: string
  imported: number | null
  startedAt: number | null
  elapsedMs: number
}

const initialProgress = (): ImportProgressState => ({
  status: 'idle',
  percent: 0,
  step: '',
  imported: null,
  startedAt: null,
  elapsedMs: 0,
})

const formatElapsed = (ms: number): string => {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

export const PublishRosterDialog = ({
  open,
  onOpenChange,
  scenarioId,
}: PublishRosterDialogProps): ReactNode => {
  const roster        = useScenarioStore((s) => s.roster)
  const rosterLoading = useScenarioStore((s) => s.rosterLoading)
  const publishing    = useScenarioStore((s) => s.publishing)
  const loadRoster    = useScenarioStore((s) => s.loadRoster)
  const publishRoster = useScenarioStore((s) => s.publishRoster)

  const [selection, setSelection]     = useState<SelectionState>({ mode: 'explicit', included: new Set() })
  const [filterCrew, setFilterCrew]   = useState('')
  const [filterBase, setFilterBase]   = useState('')
  const [filterPairingId, setFilterPairingId] = useState('')
  const [filterPairingLabel, setFilterPairingLabel] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({
    crew: '',
    base: '',
    pairingId: '',
    pairingLabel: '',
  })
  const [hideImported, setHideImported] = useState(false)
  const [progress, setProgress]       = useState<ImportProgressState>(initialProgress)
  const [selectionPending, startSelectionTransition] = useTransition()
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollTop, setTableScrollTop] = useState(0)
  const loadedScenarioRef = useRef<number | null>(null)

  // Load roster when dialog opens.
  useEffect(() => {
    if (!open) {
      loadedScenarioRef.current = null
      return
    }
    if (loadedScenarioRef.current === scenarioId) return
    loadedScenarioRef.current = scenarioId
    void loadRoster(scenarioId)
    setFilterCrew('')
    setFilterBase('')
    setFilterPairingId('')
    setFilterPairingLabel('')
    setAppliedFilters({ crew: '', base: '', pairingId: '', pairingLabel: '' })
    setHideImported(false)
    setProgress(initialProgress())
  }, [open, scenarioId, loadRoster])

  useEffect(() => {
    if (progress.status !== 'importing' || progress.startedAt == null) return
    const tick = window.setInterval(() => {
      setProgress((prev) => {
        if (prev.status !== 'importing' || prev.startedAt == null) return prev
        return {
          ...prev,
          elapsedMs: performance.now() - prev.startedAt,
          percent: Math.min(88, prev.percent + 3),
        }
      })
    }, 300)
    return () => window.clearInterval(tick)
  }, [progress.status, progress.startedAt])

  // Start empty so filtered views cannot publish hidden rows by accident.
  useEffect(() => {
    if (roster) {
      setSelection({ mode: 'explicit', included: new Set() })
    }
  }, [roster])

  useEffect(() => {
    setTableScrollTop(0)
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
  }, [roster, appliedFilters, hideImported])

  // Client-side filtering — does not change selection.
  const filtered = useMemo(() => {
    if (!roster) return []
    const crew = appliedFilters.crew.trim().toLowerCase()
    const base = appliedFilters.base.trim().toLowerCase()
    const pairingId = appliedFilters.pairingId.trim().toLowerCase()
    const pairingLabel = appliedFilters.pairingLabel.trim().toLowerCase()
    return roster.filter((a) => {
      if (hideImported && !a.publishable) return false
      if (crew && a.crewId.trim().toLowerCase() !== crew) return false
      if (base && !a.base.toLowerCase().includes(base)) return false
      if (pairingId && !(a.pairingId == null ? '' : String(a.pairingId)).toLowerCase().includes(pairingId)) return false
      if (pairingLabel && !(a.pairingLabel ?? '').toLowerCase().includes(pairingLabel)) return false
      return true
    })
  }, [roster, appliedFilters, hideImported])

  const publishableCount = useMemo(
    () => (roster ?? []).reduce((count, a) => count + (a.publishable ? 1 : 0), 0),
    [roster],
  )
  const hasPublishable = publishableCount > 0

  const publishableFiltered = useMemo(
    () => filtered.filter((a) => a.publishable),
    [filtered],
  )

  const isAssignmentSelected = (a: RosterAssignment): boolean => {
    if (!a.publishable) return false
    const key = assignmentKey(a)
    return selection.mode === 'allPublishable'
      ? !selection.excluded.has(key)
      : selection.included.has(key)
  }

  const allUnpublishedSelected = useMemo(
    () => publishableFiltered.length > 0 && publishableFiltered.every(isAssignmentSelected),
    [publishableFiltered, selection],
  )

  const virtualRange = useMemo(() => {
    const start = Math.max(0, Math.floor(tableScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS)
    const end = Math.min(
      filtered.length,
      Math.ceil((tableScrollTop + VIRTUAL_VIEWPORT_HEIGHT) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS,
    )
    return {
      start,
      end,
      topHeight: start * VIRTUAL_ROW_HEIGHT,
      bottomHeight: Math.max(0, (filtered.length - end) * VIRTUAL_ROW_HEIGHT),
    }
  }, [filtered.length, tableScrollTop])

  const visibleRows = useMemo(
    () => filtered.slice(virtualRange.start, virtualRange.end),
    [filtered, virtualRange],
  )

  const applySearch = (): void => {
    startSelectionTransition(() => {
      setAppliedFilters({
        crew: filterCrew,
        base: filterBase,
        pairingId: filterPairingId,
        pairingLabel: filterPairingLabel,
      })
    })
  }

  const toggleAll = (): void => {
    if (publishableFiltered.length === 0) return
    const keys = publishableFiltered.map(assignmentKey)
    startSelectionTransition(() => {
      setSelection((prev) => {
        if (prev.mode === 'allPublishable') {
          const excluded = new Set(prev.excluded)
          keys.forEach((k) => {
            allUnpublishedSelected ? excluded.add(k) : excluded.delete(k)
          })
          return { mode: 'allPublishable', excluded }
        }

        const included = new Set(prev.included)
        keys.forEach((k) => {
          allUnpublishedSelected ? included.delete(k) : included.add(k)
        })
        return { mode: 'explicit', included }
      })
    })
  }

  const selectAllUnpublished = (): void => {
    if (publishableFiltered.length === 0) return
    const included = new Set(publishableFiltered.map(assignmentKey))
    startSelectionTransition(() => {
      setSelection({ mode: 'explicit', included })
    })
  }

  const clearSelection = (): void => {
    startSelectionTransition(() => {
      setSelection({ mode: 'explicit', included: new Set() })
    })
  }

  const toggleOne = (key: string): void => {
    setSelection((prev) => {
      if (prev.mode === 'allPublishable') {
        const excluded = new Set(prev.excluded)
        excluded.has(key) ? excluded.delete(key) : excluded.add(key)
        return { mode: 'allPublishable', excluded }
      }

      const included = new Set(prev.included)
      included.has(key) ? included.delete(key) : included.add(key)
      return { mode: 'explicit', included }
    })
  }

  const selectedAssignments = useMemo(
    () => (roster ?? []).filter(isAssignmentSelected),
    [roster, selection],
  )
  const selectedCount = selectedAssignments.length

  const handlePublish = async (): Promise<void> => {
    if (!roster) return
    const rosterIds = selectedAssignments.flatMap((a) => a.rosterIds)
    if (rosterIds.length === 0) return
    const startedAt = performance.now()
    try {
      setProgress({
        status: 'importing',
        percent: 12,
        step: 'Preparing selected rows',
        imported: null,
        startedAt,
        elapsedMs: 0,
      })
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      setProgress((prev) => ({
        ...prev,
        percent: Math.max(prev.percent, 35),
        step: 'Writing to Live roster',
      }))
      const imported = await publishRoster(scenarioId, rosterIds)
      const elapsedMs = performance.now() - startedAt
      setSelection({ mode: 'explicit', included: new Set() })
      setProgress({
        status: 'complete',
        percent: 100,
        step: 'Complete',
        imported,
        startedAt,
        elapsedMs,
      })
    } catch {
      // error toast shown by store
      setProgress(initialProgress())
    }
  }

  const footer = (
    <>
      <Button variant="ghost" disabled={publishing} onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        disabled={selectedCount === 0 || publishing || rosterLoading || selectionPending}
        onClick={() => { void handlePublish() }}
      >
        {publishing
          ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Importing...</>
          : `Import ${selectedCount} Selected`}
      </Button>
    </>
  )

  const allImported = useMemo(() => {
    const importableRows = roster?.filter((a) => a.source !== 'PA') ?? []
    return importableRows.length > 0 && importableRows.every((a) => a.status === 'PUBLISHED')
  }, [roster])
  const showProgress = progress.status !== 'idle'

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import Optimized Roster to Live"
      icon={<UploadCloud className="h-4 w-4" />}
      dismissable={!publishing}
      data-testid="publish-roster-dialog"
      className="w-[calc(100vw-2rem)] sm:max-w-[1180px] xl:max-w-[1320px]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      footer={footer}
    >
      {/* Filter bar */}
      {!rosterLoading && !!roster && roster.length > 0 && (
        <form
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2"
          data-testid="publish-roster-filters"
          onSubmit={(e) => {
            e.preventDefault()
            applySearch()
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Crew ID"
              value={filterCrew}
              onChange={(e) => setFilterCrew(e.target.value)}
              className="h-7 w-32 text-xs"
            />
            <Input
              placeholder="Base"
              value={filterBase}
              onChange={(e) => setFilterBase(e.target.value)}
              className="h-7 w-24 text-xs"
            />
            <Input
              placeholder="Pairing ID"
              value={filterPairingId}
              onChange={(e) => setFilterPairingId(e.target.value)}
              className="h-7 w-28 text-xs"
            />
            <Input
              placeholder="Pairing Label"
              value={filterPairingLabel}
              onChange={(e) => setFilterPairingLabel(e.target.value)}
              className="h-7 w-36 text-xs"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={selectionPending}
              className="h-7 px-2 text-xs"
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Search
            </Button>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                startSelectionTransition(() => {
                  setHideImported((prev) => !prev)
                })
              }}
              className="h-7 px-2 text-xs"
            >
              {hideImported ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
              {hideImported ? 'Show Imported' : 'Hide Imported'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasPublishable || selectionPending}
              onClick={selectAllUnpublished}
              className="h-7 px-2 text-xs"
            >
              Select Unpublished
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedCount === 0 || selectionPending}
              onClick={clearSelection}
              className="h-7 px-2 text-xs"
            >
              Clear Selection
            </Button>
            <span className="whitespace-nowrap text-2xs text-muted-foreground">
              {selectionPending ? 'Updating...' : `${filtered.length} / ${roster.length} rows`}
            </span>
          </div>
        </form>
      )}

      {showProgress && (
        <div className="shrink-0 border-b border-border px-4 py-3" data-testid="import-to-live-progress">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-foreground">{progress.step}</span>
            <span className="text-muted-foreground tabular-nums">{formatElapsed(progress.elapsedMs)}</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.status === 'complete' && (
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span><span className="text-foreground">Imported:</span> {progress.imported ?? 0}</span>
              <span><span className="text-foreground">Elapsed:</span> {formatElapsed(progress.elapsedMs)}</span>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {rosterLoading && (
        <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading optimization result…
        </div>
      )}

      {/* Empty */}
      {!rosterLoading && (!roster || roster.length === 0) && (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <Users className="h-6 w-6 opacity-40" />
          No assignments found in the optimization result.
        </div>
      )}

      {/* All published notice */}
      {!rosterLoading && allImported && (
        <div className="flex items-center gap-2 px-5 py-3 text-xs text-primary">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          All assignments have been imported to the Live roster.
        </div>
      )}

      {/* Table */}
      {!rosterLoading && !!roster && roster.length > 0 && (
        <div
          ref={tableScrollRef}
          className="min-h-0 flex-1 overflow-auto [&>div]:overflow-visible"
          data-testid="publish-roster-table-scroll"
          onScroll={(e) => setTableScrollTop(e.currentTarget.scrollTop)}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(TABLE_HEAD_CLASS, 'w-10 px-3')}>
                  <input
                    type="checkbox"
                    checked={allUnpublishedSelected}
                    disabled={publishableFiltered.length === 0}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Select all unpublished"
                  />
                </TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Crew ID</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Kind</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Pairing ID</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Pairing Label</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Source</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Base</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Div</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Asgmt Group</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Assignment</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Start (UTC)</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>End (UTC)</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {virtualRange.topHeight > 0 && (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={TABLE_COLUMN_COUNT} className="p-0" style={{ height: virtualRange.topHeight }} />
                </TableRow>
              )}
              {visibleRows.map((a) => {
                const key        = assignmentKey(a)
                const isSelected = isAssignmentSelected(a)
                const disabled   = !a.publishable

                return (
                  <TableRow
                    key={key}
                    style={{ height: VIRTUAL_ROW_HEIGHT }}
                    className={cn(
                      disabled
                        ? 'opacity-50'
                        : 'cursor-pointer',
                      !disabled && isSelected && 'bg-primary/5',
                    )}
                    onClick={() => { if (!disabled) toggleOne(key) }}
                  >
                    <TableCell className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={a.publishable ? isSelected : a.status === 'PUBLISHED'}
                        disabled={disabled}
                        onChange={() => { if (!disabled) toggleOne(key) }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs tabular-nums">{a.crewId}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.kind === 'GROUND' ? 'Ground' : 'Flying'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs tabular-nums">{a.pairingId ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs">{a.pairingLabel || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.source}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.base || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.division || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.assignmentGroup || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs">{a.assignment || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs tabular-nums">{fmtDate(a.schStrDtUtc)}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 font-mono text-xs tabular-nums">{fmtDate(a.schEndDtUtc)}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-2xs">
                      {a.status === 'PUBLISHED'
                        ? <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" />Imported</span>
                        : a.status === 'EXCEPTION'
                          ? <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />No Live Crew</span>
                          : <span className="text-muted-foreground">{statusLabel(a.status)}</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
              {virtualRange.bottomHeight > 0 && (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={TABLE_COLUMN_COUNT} className="p-0" style={{ height: virtualRange.bottomHeight }} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AppDialog>
  )
}
