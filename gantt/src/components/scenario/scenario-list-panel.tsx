import React, { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Loader2, ChevronLeft, ChevronRight, Plus, Import, Trash2, Pencil, Download } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@rois/ui'
import { useScenarioStore } from '@/stores/scenario-store'
import { useShellStore } from '@/stores/shell-store'
import { ScenarioSearchBar } from './scenario-search-bar'
import { ScenarioListItem } from './scenario-list-item'
import { ScenarioEmptyState } from './scenario-empty-state'
import { ImportPbsDialog, type ImportPbsPayload } from './import-pbs-dialog'
import { PermissionGate } from '@/components/common/permission-gate'
import { S3PairingImportDialog } from './s3-pairing-import-dialog'
import { ScenarioRunHealthIndicator } from './scenario-run-health-indicator'
import { scenarioApi, type S3PairingImportInput, type S3PairingPoTarget } from '@/services/scenario-api'
import { referenceApi } from '@/services/reference-api'
import {
  importPbsMaterial,
  type ImportPbsMaterialResult,
  type ImportPbsMaterialStats,
  type ImportPbsMaterialTiming,
  type ImportProgressState,
} from '@/services/import-pbs-material-api'
import { getHttpErrorStatus } from '@/services/http-client'
import { notify } from '@/utils/notify'
import type { ScenarioType } from '@/types'

const DEFAULT_SCENARIO_NAME = 'New Scenario'
const DEFAULT_LEADIN_LIVE = 1 as const

const formatImportDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const sumTiming = (timings: ImportPbsMaterialTiming[], key: keyof Pick<ImportPbsMaterialTiming, 'fetchMs' | 'transformMs' | 'enqueueMs' | 'databaseMs'>): number =>
  timings.reduce((total, timing) => total + (typeof timing[key] === 'number' ? timing[key] : 0), 0)

const buildImportTimingSummary = (timings: ImportPbsMaterialTiming[]): string => {
  if (timings.length === 0) return ''
  const fetchMs = sumTiming(timings, 'fetchMs')
  const transformMs = sumTiming(timings, 'transformMs')
  const enqueueMs = sumTiming(timings, 'enqueueMs')
  const databaseMs = sumTiming(timings, 'databaseMs')
  const recordsOut = timings.reduce((total, timing) => total + timing.recordsOut, 0)
  const parts = [
    `fetch ${formatImportDuration(fetchMs)}`,
    `transform ${formatImportDuration(transformMs)}`,
    `enqueue ${formatImportDuration(enqueueMs)}`,
  ]
  if (databaseMs > 0) parts.push(`database ${formatImportDuration(databaseMs)}`)
  parts.push(`records ${recordsOut}`)
  return parts.join(', ')
}

const countFailedImportMaterials = (stats: ImportPbsMaterialStats[] | undefined): number =>
  (stats ?? []).filter((stat) => stat.status === 'failed' || stat.failed > 0).length

const FILE_TYPE_BY_SIDEBAR: Record<string, ScenarioType> = {
  po:  'PO',
  ro:  'RO',
}

export const ScenarioListPanel = (): React.ReactNode => {
  const items          = useScenarioStore((s) => s.items)
  const total          = useScenarioStore((s) => s.total)
  const page           = useScenarioStore((s) => s.page)
  const pageSize       = useScenarioStore((s) => s.pageSize)
  const listLoading    = useScenarioStore((s) => s.listLoading)
  const selectedId     = useScenarioStore((s) => s.selectedId)
  const saving         = useScenarioStore((s) => s.saving)
  const selectScenario = useScenarioStore((s) => s.selectScenario)
  const removeScenario = useScenarioStore((s) => s.removeScenario)
  const renameScenario = useScenarioStore((s) => s.renameScenario)
  const duplicateScenario = useScenarioStore((s) => s.duplicateScenario)
  const createNew      = useScenarioStore((s) => s.createNew)
  const setPage        = useScenarioStore((s) => s.setPage)
  const setFilterType  = useScenarioStore((s) => s.setFilterType)
  const fetchList      = useScenarioStore((s) => s.fetchList)

  const activeScenarioItem = useShellStore((s) => s.activeScenarioItem)
  const activeModule       = useShellStore((s) => s.activeModule)

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null)
  const [renameValue, setRenameValue]       = useState('')
  const [importOpen, setImportOpen]         = useState(false)
  const [importing, setImporting]           = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null)
  const [importResult, setImportResult]     = useState<ImportPbsMaterialResult | null>(null)
  const [importElapsedMs, setImportElapsedMs] = useState<number | null>(null)
  const [s3ImportOpen, setS3ImportOpen]     = useState(false)
  const [s3Importing, setS3Importing]       = useState(false)
  const [s3PoTargets, setS3PoTargets]       = useState<S3PairingPoTarget[]>([])
  const [s3DivisionOptions, setS3DivisionOptions] = useState<Array<{ value: string; label: string }>>([])

  // Sync the store's filterType with the sidebar selection (po/ro/to) so the
  // list always shows only scenarios matching the active section.  Also
  // re-triggers on activeModule change so navigating back to the scenario tab
  // refreshes with the correct filter.
  useEffect(() => {
    if (activeModule === 'scenario') {
      setFilterType(FILE_TYPE_BY_SIDEBAR[activeScenarioItem] ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable Zustand actions
  }, [activeModule, activeScenarioItem])

  const totalPages = Math.ceil(total / pageSize)

  const handleCreateNew = (): void => {
    const today = new Date().toISOString().slice(0, 10)
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    void createNew({
      name: DEFAULT_SCENARIO_NAME,
      fileType: FILE_TYPE_BY_SIDEBAR[activeScenarioItem] ?? 'PO',
      strDtLoc: today,
      endDtLoc: thirtyDaysLater,
      leadinLive: DEFAULT_LEADIN_LIVE,
      division: 'P',
    })
  }

  const handleImport = (): void => {
    setImportProgress(null)
    setImportResult(null)
    setImportElapsedMs(null)
    setImportOpen(true)
  }

  const handleImportOpenChange = (open: boolean): void => {
    setImportOpen(open)
    if (!open) {
      setImportProgress(null)
      setImportResult(null)
      setImportElapsedMs(null)
    }
  }

  const handleS3Pairing = (): void => {
    setS3ImportOpen(true)
    void Promise.all([
      scenarioApi.listS3PairingPoTargets(),
      referenceApi.listDivisions(),
    ]).then(([targets, divisions]) => {
      setS3PoTargets(targets.items)
      setS3DivisionOptions(divisions
        .filter((d) => d.division)
        .map((d) => ({
          value: d.division,
          label: d.description && d.description !== d.division
            ? `${d.division} - ${d.description}`
            : d.division,
        })))
    }).catch(() => {
      notify.error('Failed to load S3 Pairing import options')
    })
  }

  const handleS3Import = async (input: S3PairingImportInput): Promise<void> => {
    setS3Importing(true)
    try {
      const result = await scenarioApi.importS3Pairing(input)
      notify.success(`Imported ${result.importedPairings} pairings`)
      setS3ImportOpen(false)
      await fetchList()
      await selectScenario(result.scenarioId)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to import S3 Pairing')
    } finally {
      setS3Importing(false)
    }
  }

  const handleImportConfirm = async (payload: ImportPbsPayload): Promise<void> => {
    setImporting(true)
    setImportProgress(null)
    setImportResult(null)
    const startedAt = Date.now()
    try {
      const result = await importPbsMaterial(
        {
          rosterPeriodId: payload.rosterPeriodId,
          scope: payload.scope,
        },
        (state) => setImportProgress(state),
      )
      const connectorCount = result.results.length
      const elapsedMs = Date.now() - startedAt
      const elapsed = formatImportDuration(elapsedMs)
      const timings = result.results.flatMap((item) => item.timings ?? [])
      const timingSummary = buildImportTimingSummary(timings)
      const detail = timingSummary ? ` (${timingSummary})` : ''
      const failedMaterials = countFailedImportMaterials(result.materialStats)
      if (failedMaterials > 0) {
        notify.warning(`Import finished with ${failedMaterials} failed material${failedMaterials === 1 ? '' : 's'} for ${result.rosterPeriod} in ${elapsed}${detail}`)
      } else {
        notify.success(`Imported ${connectorCount} connector${connectorCount === 1 ? '' : 's'} for ${result.rosterPeriod} in ${elapsed}${detail}`)
      }
      setImportElapsedMs(elapsedMs)
      setImportResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import PBS material'
      const status = getHttpErrorStatus(err)
      if (status === 409) {
        // Conflict (another user holds the mutation lease) — the server message
        // already names the competing action + user; show verbatim.
        notify.warning(message)
      } else if (status === 403) {
        // Permission denied — the button is hidden for users without the ctl,
        // but stale sessions / mid-session revocation can still reach this branch.
        notify.warning(message)
      } else {
        notify.error(message)
      }
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleSelect = (id: number): void => {
    void selectScenario(id)
  }

  const handleDeleteRequest = (id: number): void => {
    setDeleteTargetId(id)
  }

  const handleDeleteConfirm = (): void => {
    if (deleteTargetId !== null) {
      void removeScenario(deleteTargetId)
    }
    setDeleteTargetId(null)
  }

  const handleDeleteCancel = (): void => {
    setDeleteTargetId(null)
  }

  const handleDuplicate = (id: number): void => {
    void duplicateScenario(id)
  }

  const handleRenameRequest = (id: number, currentName: string): void => {
    setRenameTargetId(id)
    setRenameValue(currentName)
  }

  const handleRenameConfirm = (): void => {
    const name = renameValue.trim()
    if (renameTargetId !== null && name) {
      void renameScenario(renameTargetId, name)
    }
    setRenameTargetId(null)
  }

  const handleRenameCancel = (): void => {
    setRenameTargetId(null)
  }

  const handlePrevPage = (): void => {
    if (page > 1) setPage(page - 1)
  }

  const handleNextPage = (): void => {
    if (page < totalPages) setPage(page + 1)
  }

  return (
    <div className="flex flex-col h-full w-[400px] shrink-0 border-r border-border">
      {/* 面板标题栏 — 场景数量 + 新建按钮 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Scenarios</span>
          {total > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
              {total}
            </span>
          )}
        </div>
        <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                data-testid="scenario-s3-pairing-btn"
                aria-label="S3 Pairing"
                className="h-7 w-7 p-0"
                onClick={handleS3Pairing}
                disabled={saving}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              S3 Pairing
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <PermissionGate menuCode="SCENARIO_ALL" ctlCode="SCENARIO_IMPORT_PBS">
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="scenario-import-btn"
                  aria-label="Import PBS material"
                  className="h-7 w-7 p-0"
                  onClick={handleImport}
                  disabled={saving}
                >
                  <Import className="h-3.5 w-3.5" />
                </Button>
              </PermissionGate>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Import PBS material
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                data-testid="scenario-new-btn"
                aria-label="Create new scenario"
                className="h-7 w-7 p-0"
                onClick={handleCreateNew}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Create new scenario
            </TooltipContent>
          </Tooltip>

          <ScenarioRunHealthIndicator />
        </div>
        </TooltipProvider>
      </div>

      {/* 搜索 + 过滤 */}
      <ScenarioSearchBar />

      {/* 列表体 */}
      <div className="flex-1 overflow-y-auto">
        {listLoading && items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <ScenarioEmptyState onCreateNew={handleCreateNew} showCreateButton={false} />
        ) : (
          items.map((item) => (
            <ScenarioListItem
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              onSelect={handleSelect}
              onDelete={handleDeleteRequest}
              onDuplicate={handleDuplicate}
              onRename={handleRenameRequest}
            />
          ))
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 p-2 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Import PBS material 弹框 */}
      <ImportPbsDialog
        open={importOpen}
        onOpenChange={handleImportOpenChange}
        onConfirm={handleImportConfirm}
        importing={importing}
        progress={importProgress}
        result={importResult}
        completedElapsedMs={importElapsedMs}
      />

      <S3PairingImportDialog
        open={s3ImportOpen}
        onOpenChange={setS3ImportOpen}
        importing={s3Importing}
        poTargets={s3PoTargets}
        divisionOptions={s3DivisionOptions}
        onImport={handleS3Import}
      />

      {/* 删除确认弹框 */}
      <AppDialog
        open={deleteTargetId !== null}
        onOpenChange={(open: boolean) => { if (!open) handleDeleteCancel() }}
        data-testid="scenario-delete-dialog"
        className="sm:max-w-[400px]"
        icon={<Trash2 className="h-4 w-4" />}
        title="Delete Scenario?"
        footer={
          <>
            <Button variant="ghost" data-testid="scenario-delete-cancel" onClick={handleDeleteCancel}>Cancel</Button>
            <Button variant="destructive" data-testid="scenario-delete-confirm" onClick={handleDeleteConfirm}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
      </AppDialog>

      {/* 重命名弹框 */}
      <AppDialog
        open={renameTargetId !== null}
        onOpenChange={(open: boolean) => { if (!open) handleRenameCancel() }}
        data-testid="scenario-rename-dialog"
        className="sm:max-w-[400px]"
        icon={<Pencil className="h-4 w-4" />}
        title="Rename Scenario"
        footer={
          <>
            <Button variant="ghost" data-testid="scenario-rename-cancel" onClick={handleRenameCancel}>Cancel</Button>
            <Button
              data-testid="scenario-rename-confirm"
              onClick={handleRenameConfirm}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          data-testid="scenario-rename-input"
          value={renameValue}
          placeholder="Scenario name"
          maxLength={200}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && renameValue.trim()) handleRenameConfirm()
          }}
        />
      </AppDialog>
    </div>
  )
}
