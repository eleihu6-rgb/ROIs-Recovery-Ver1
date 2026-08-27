import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  AppDialog,
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
import { notify } from '@/utils/notify'
import {
  createPbsPeriod,
  deletePbsPeriod,
  fetchPbsPeriods,
  generatePbsPeriodYear,
  previewPbsPeriodYear,
  updatePbsPeriod,
  type PbsComputedPeriodStage,
  type PbsPeriod,
  type PbsPeriodFilters,
  type PbsPeriodInput,
  type PbsPeriodYearGenerateInput,
  type PbsPeriodYearPreviewItem,
} from '@/services/pbs-period-admin-api'

const STAGE_OPTIONS: PbsComputedPeriodStage[] = ['NOT_OPEN', 'OPEN', 'CLOSED', 'INCOMPLETE']
const EMPTY_FORM: PbsPeriodInput = {
  periodCode: '',
  rpStart: '',
  rpEnd: '',
  bidOpenAt: '',
  bidCloseAt: '',
  awardPublishAt: '',
  awardFinalAt: '',
  misAwardDeadlineAt: '',
}

const EMPTY_GENERATE_FORM: PbsPeriodYearGenerateInput = {
  year: new Date().getFullYear(),
  bidOpenTime: '00:00',
  bidCloseTime: '23:59',
}

const stageClassName = (stage: PbsComputedPeriodStage): string => {
  if (stage === 'OPEN') return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  if (stage === 'CLOSED') return 'border-slate-300 bg-slate-50 text-slate-700'
  if (stage === 'NOT_OPEN') return 'border-blue-300 bg-blue-50 text-blue-700'
  return 'border-amber-300 bg-amber-50 text-amber-700'
}

const stageLabel = (stage: PbsComputedPeriodStage): string => {
  if (stage === 'NOT_OPEN') return 'Not Open'
  if (stage === 'OPEN') return 'Open'
  if (stage === 'CLOSED') return 'Closed'
  return 'Incomplete'
}

const formatDateTime = (value: string | null): string => {
  if (!value) return '-'
  return value.replace('T', ' ').replaceAll('-', '/')
}

const toDateTimeLocal = (value: string | null): string => {
  if (!value) return ''
  return value.replace(' ', 'T').slice(0, 19)
}

const fromDateTimeLocal = (value: string): string | null => {
  const normalized = value.trim()
  if (!normalized) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '00'] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

const rowToInput = (row: PbsPeriod): PbsPeriodInput => ({
  periodCode: row.periodCode,
  rpStart: toDateTimeLocal(row.rpStart),
  rpEnd: toDateTimeLocal(row.rpEnd),
  bidOpenAt: toDateTimeLocal(row.bidOpenAt),
  bidCloseAt: toDateTimeLocal(row.bidCloseAt),
  awardPublishAt: toDateTimeLocal(row.awardPublishAt),
  awardFinalAt: toDateTimeLocal(row.awardFinalAt),
  misAwardDeadlineAt: toDateTimeLocal(row.misAwardDeadlineAt),
})

const normalizeInput = (input: PbsPeriodInput): PbsPeriodInput | null => {
  const rpStart = fromDateTimeLocal(input.rpStart)
  const rpEnd = fromDateTimeLocal(input.rpEnd)
  const bidOpenAt = fromDateTimeLocal(input.bidOpenAt)
  const bidCloseAt = fromDateTimeLocal(input.bidCloseAt)
  const awardPublishAt = fromDateTimeLocal(input.awardPublishAt)
  const awardFinalAt = fromDateTimeLocal(input.awardFinalAt)
  const misAwardDeadlineAt = fromDateTimeLocal(input.misAwardDeadlineAt)
  if (
    !input.periodCode.trim()
    || !rpStart
    || !rpEnd
    || !bidOpenAt
    || !bidCloseAt
    || !awardPublishAt
    || !awardFinalAt
    || !misAwardDeadlineAt
  ) {
    return null
  }
  return {
    ...input,
    periodCode: input.periodCode.trim(),
    rpStart,
    rpEnd,
    bidOpenAt,
    bidCloseAt,
    awardPublishAt,
    awardFinalAt,
    misAwardDeadlineAt,
  }
}

const Field = ({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}): ReactNode => (
  <label className="flex min-w-0 flex-col gap-1 text-2xs font-medium text-muted-foreground">
    <span>
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </span>
    {children}
  </label>
)

interface PbsPeriodDialogProps {
  row: PbsPeriod | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const PbsPeriodDialog = ({ row, open, onOpenChange, onSaved }: PbsPeriodDialogProps): ReactNode => {
  const [values, setValues] = useState<PbsPeriodInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const isCreate = row === null

  useEffect(() => {
    setValues(row ? rowToInput(row) : EMPTY_FORM)
  }, [row, open])

  const setField = <K extends keyof PbsPeriodInput>(key: K, value: PbsPeriodInput[K]): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (): Promise<void> => {
    const payload = normalizeInput(values)
    if (!payload) {
      notify.error('Period code and all lifecycle times are required')
      return
    }
    setSaving(true)
    try {
      if (isCreate) {
        await createPbsPeriod(payload)
        notify.success('PBS period created')
      } else {
        await updatePbsPeriod(row.id, payload)
        notify.success('PBS period updated')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="pbs-period-dialog"
      className="sm:max-w-[760px]"
      icon={isCreate ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
      title={isCreate ? 'Add PBS Period' : 'Edit PBS Period'}
      description={isCreate ? undefined : `Row #${row?.id}`}
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-testid="pbs-period-save" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid max-h-[62vh] grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto px-1 py-1">
        <Field label="Period Code" required>
          <Input
            data-testid="pbs-period-field-periodCode"
            value={values.periodCode}
            maxLength={20}
            className="h-8 text-xs"
            onChange={(event) => setField('periodCode', event.target.value)}
          />
        </Field>
        <Field label="Roster Start" required>
          <Input
            data-testid="pbs-period-field-rpStart"
            type="datetime-local"
            step={1}
            value={values.rpStart}
            className="h-8 text-xs"
            onChange={(event) => setField('rpStart', event.target.value)}
          />
        </Field>
        <Field label="Roster End" required>
          <Input
            data-testid="pbs-period-field-rpEnd"
            type="datetime-local"
            step={1}
            value={values.rpEnd}
            className="h-8 text-xs"
            onChange={(event) => setField('rpEnd', event.target.value)}
          />
        </Field>
        <Field label="Bid Open" required>
          <Input
            data-testid="pbs-period-field-bidOpenAt"
            type="datetime-local"
            step={1}
            value={values.bidOpenAt}
            className="h-8 text-xs"
            onChange={(event) => setField('bidOpenAt', event.target.value)}
          />
        </Field>
        <Field label="Bid Close" required>
          <Input
            data-testid="pbs-period-field-bidCloseAt"
            type="datetime-local"
            step={1}
            value={values.bidCloseAt}
            className="h-8 text-xs"
            onChange={(event) => setField('bidCloseAt', event.target.value)}
          />
        </Field>
        <Field label="Award Publish" required>
          <Input
            data-testid="pbs-period-field-awardPublishAt"
            type="datetime-local"
            step={1}
            value={values.awardPublishAt}
            className="h-8 text-xs"
            onChange={(event) => setField('awardPublishAt', event.target.value)}
          />
        </Field>
        <Field label="Final At" required>
          <Input
            data-testid="pbs-period-field-awardFinalAt"
            type="datetime-local"
            step={1}
            value={values.awardFinalAt}
            className="h-8 text-xs"
            onChange={(event) => setField('awardFinalAt', event.target.value)}
          />
        </Field>
        <Field label="Mis-award Deadline" required>
          <Input
            data-testid="pbs-period-field-misAwardDeadlineAt"
            type="datetime-local"
            step={1}
            value={values.misAwardDeadlineAt}
            className="h-8 text-xs"
            onChange={(event) => setField('misAwardDeadlineAt', event.target.value)}
          />
        </Field>
        {!isCreate && row ? (
          <Field label="System Stage">
            <div className="flex h-8 items-center">
              <Badge data-testid="pbs-period-field-computedStage" variant="outline" className={stageClassName(row.computedStage)}>
                {stageLabel(row.computedStage)}
              </Badge>
            </div>
          </Field>
        ) : null}
      </div>
    </AppDialog>
  )
}

interface PbsPeriodYearDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const PbsPeriodYearDialog = ({ open, onOpenChange, onSaved }: PbsPeriodYearDialogProps): ReactNode => {
  const [values, setValues] = useState<PbsPeriodYearGenerateInput>(EMPTY_GENERATE_FORM)
  const [previewItems, setPreviewItems] = useState<PbsPeriodYearPreviewItem[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(EMPTY_GENERATE_FORM)
      setPreviewItems(null)
    }
  }, [open])

  const setField = <K extends keyof PbsPeriodYearGenerateInput>(
    key: K,
    value: PbsPeriodYearGenerateInput[K],
  ): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setPreviewItems(null)
  }

  const normalizedInput = (): PbsPeriodYearGenerateInput | null => {
    const year = Number(values.year)
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return null
    }
    return {
      ...values,
      year,
    }
  }

  const handlePreview = async (): Promise<void> => {
    const input = normalizedInput()
    if (!input) {
      notify.error('A valid year is required')
      return
    }
    setPreviewing(true)
    try {
      const result = await previewPbsPeriodYear(input)
      setPreviewItems(result.items)
      notify.success(`Preview ready: ${result.newCount} new, ${result.existingCount} existing`)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    const input = normalizedInput()
    if (!input) {
      notify.error('A valid year is required')
      return
    }
    setSaving(true)
    try {
      const result = await generatePbsPeriodYear(input)
      if (result.createdCount > 0) {
        notify.success(`Created ${result.createdCount} PBS periods, skipped ${result.skippedCount} existing periods`)
      } else {
        notify.info('No new PBS periods were created')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Generate year failed')
    } finally {
      setSaving(false)
    }
  }

  const newCount = previewItems?.filter((item) => !item.exists).length ?? 0
  const existingCount = previewItems?.filter((item) => item.exists).length ?? 0

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="pbs-period-year-dialog"
      className="sm:max-w-[900px]"
      icon={<CalendarDays className="h-4 w-4" />}
      title="Generate PBS Year"
      description="Create draft PBS periods for every month in the selected year."
      dismissable={!previewing && !saving}
      footer={
        <>
          <Button variant="ghost" disabled={previewing || saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="pbs-period-year-preview"
            variant="outline"
            disabled={previewing || saving}
            onClick={() => void handlePreview()}
          >
            {previewing ? 'Generating...' : 'Generate Preview'}
          </Button>
          <Button
            data-testid="pbs-period-year-save"
            disabled={previewing || saving || previewItems === null}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save New Periods'}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto px-1 py-1">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Year" required>
            <Input
              data-testid="pbs-period-year-field-year"
              value={values.year}
              inputMode="numeric"
              className="h-8 text-xs font-mono tabular-nums"
              onChange={(event) => setField('year', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Bid Open Time" required>
            <Input
              data-testid="pbs-period-year-field-bidOpenTime"
              type="time"
              value={values.bidOpenTime}
              className="h-8 text-xs"
              onChange={(event) => setField('bidOpenTime', event.target.value)}
            />
          </Field>
          <Field label="Bid Close Time" required>
            <Input
              data-testid="pbs-period-year-field-bidCloseTime"
              type="time"
              value={values.bidCloseTime}
              className="h-8 text-xs"
              onChange={(event) => setField('bidCloseTime', event.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-sm border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Preview</h3>
            {previewItems && (
              <span className="text-2xs text-muted-foreground">
                {newCount} new / {existingCount} existing
              </span>
            )}
          </div>
          <Table data-testid="pbs-period-year-preview-table">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Period Code</TableHead>
                <TableHead className="text-xs">Roster Range</TableHead>
                <TableHead className="text-xs">Bid Open</TableHead>
                <TableHead className="text-xs">Bid Close</TableHead>
                <TableHead className="text-xs">Award Publish</TableHead>
                <TableHead className="text-xs">Final At</TableHead>
                <TableHead className="text-xs">Mis-award Deadline</TableHead>
                <TableHead className="text-xs">System Stage</TableHead>
                <TableHead className="text-xs">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewItems === null && (
                <TableRow>
                  <TableCell colSpan={9} className="h-20 text-center text-xs text-muted-foreground">
                    Generate a preview before saving.
                  </TableCell>
                </TableRow>
              )}
              {previewItems?.map((item) => (
                <TableRow key={item.periodCode} data-testid={`pbs-period-year-preview-row-${item.periodCode}`}>
                  <TableCell className="text-xs font-semibold text-foreground">{item.periodCode}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.rpStart)} – {formatDateTime(item.rpEnd)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.bidOpenAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.bidCloseAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.awardPublishAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.awardFinalAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(item.misAwardDeadlineAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={stageClassName(item.computedStage)}>
                      {stageLabel(item.computedStage)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={item.exists
                        ? 'border-slate-300 bg-slate-50 text-slate-700'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-700'}
                    >
                      {item.exists ? 'Existing' : 'New'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppDialog>
  )
}

export const PbsPeriodView = (): ReactNode => {
  const [rows, setRows] = useState<PbsPeriod[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<PbsPeriodFilters>({})
  const [draftFilters, setDraftFilters] = useState({
    periodCode: '',
    status: 'ALL',
  })
  const [editingRow, setEditingRow] = useState<PbsPeriod | null>(null)
  const [creating, setCreating] = useState(false)
  const [generatingYear, setGeneratingYear] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const load = useCallback(async (nextFilters: PbsPeriodFilters = filters): Promise<void> => {
    setLoading(true)
    try {
      const result = await fetchPbsPeriods(nextFilters)
      setRows(result.rows)
      setTotal(result.total)
    } catch (err) {
      setRows([])
      setTotal(0)
      notify.error(err instanceof Error ? err.message : 'Failed to load PBS periods')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void load({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== undefined && String(value).length > 0).length,
    [filters],
  )

  const applyFilters = (): void => {
    const nextFilters: PbsPeriodFilters = {
      periodCode: draftFilters.periodCode.trim() || undefined,
      status: draftFilters.status === 'ALL' ? undefined : draftFilters.status as PbsComputedPeriodStage,
    }
    setFilters(nextFilters)
    void load(nextFilters)
  }

  const clearFilters = (): void => {
    setDraftFilters({ periodCode: '', status: 'ALL' })
    setFilters({})
    void load({})
  }

  const handleDelete = async (row: PbsPeriod): Promise<void> => {
    setDeletingId(row.id)
    try {
      await deletePbsPeriod(row.id)
      notify.success('PBS period deleted')
      await load()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full overflow-hidden bg-background" data-testid="pbs-period-view">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border bg-background">
          <div className="flex h-11 items-center justify-between px-4">
            <h1 className="text-sm font-semibold text-foreground">PBS Period</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-2xs">
                {total} periods
              </Badge>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-2xs">
                  {activeFilterCount} filters
                </Badge>
              )}
              <Button
                data-testid="pbs-period-refresh"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                data-testid="pbs-period-generate-year"
                variant="outline"
                size="sm"
                onClick={() => setGeneratingYear(true)}
              >
                <CalendarDays className="mr-1 h-3.5 w-3.5" />
                Generate Year
              </Button>
              <Button data-testid="pbs-period-add" size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Period
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <section className="mb-4 rounded-sm border border-border bg-background">
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Filters</h2>
            </div>
            <div className="grid grid-cols-[minmax(180px,1fr)_160px_auto] gap-3 p-3">
              <Field label="Period Code">
                <Input
                  data-testid="pbs-period-filter-periodCode"
                  value={draftFilters.periodCode}
                  className="h-8 text-xs"
                  placeholder="Jun 2026"
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, periodCode: event.target.value }))}
                />
              </Field>
              <Field label="System Stage">
                <Select
                  value={draftFilters.status}
                  onValueChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger data-testid="pbs-period-filter-status" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    {STAGE_OPTIONS.map((stage) => (
                      <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end gap-2">
                <Button data-testid="pbs-period-search" size="sm" onClick={applyFilters}>
                  Search
                </Button>
                <Button data-testid="pbs-period-clear" variant="outline" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-sm border border-border bg-background">
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Periods</h2>
            </div>
            <Table data-testid="pbs-period-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period Code</TableHead>
                  <TableHead className="text-xs">Roster Range</TableHead>
                  <TableHead className="text-xs">Bid Open</TableHead>
                  <TableHead className="text-xs">Bid Close</TableHead>
                  <TableHead className="text-xs">Award Publish</TableHead>
                  <TableHead className="text-xs">Final At</TableHead>
                  <TableHead className="text-xs">Mis-award Deadline</TableHead>
                  <TableHead className="text-xs">Published</TableHead>
                  <TableHead className="text-xs">System Stage</TableHead>
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-xs text-muted-foreground">
                      Loading PBS periods...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-xs text-muted-foreground">
                      No PBS periods found.
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.map((row) => (
                  <TableRow key={row.id} data-testid={`pbs-period-row-${row.id}`}>
                    <TableCell className="text-xs font-semibold text-foreground">{row.periodCode}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.rpStart)} – {formatDateTime(row.rpEnd)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.bidOpenAt)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.bidCloseAt)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.awardPublishAt)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.awardFinalAt)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.misAwardDeadlineAt)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.firstPublishedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={stageClassName(row.computedStage)}>
                        {stageLabel(row.computedStage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          data-testid={`pbs-period-edit-${row.id}`}
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingRow(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {confirmDeleteId === row.id ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <span className="text-2xs text-muted-foreground">Delete?</span>
                            <Button
                              data-testid={`pbs-period-delete-confirm-${row.id}`}
                              variant="destructive"
                              size="sm"
                              className="h-6 px-2 text-2xs"
                              disabled={deletingId === row.id}
                              onClick={() => {
                                setConfirmDeleteId(null)
                                void handleDelete(row)
                              }}
                            >
                              Yes
                            </Button>
                            <Button
                              data-testid={`pbs-period-delete-cancel-${row.id}`}
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-2xs"
                              disabled={deletingId === row.id}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </Button>
                          </span>
                        ) : (
                          <Button
                            data-testid={`pbs-period-delete-${row.id}`}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={deletingId === row.id}
                            onClick={() => setConfirmDeleteId(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </div>
      </div>

      {creating && (
        <PbsPeriodDialog
          row={null}
          open={true}
          onOpenChange={(open) => { if (!open) setCreating(false) }}
          onSaved={() => void load()}
        />
      )}
      {editingRow && (
        <PbsPeriodDialog
          row={editingRow}
          open={true}
          onOpenChange={(open) => { if (!open) setEditingRow(null) }}
          onSaved={() => void load()}
        />
      )}
      {generatingYear && (
        <PbsPeriodYearDialog
          open={true}
          onOpenChange={(open) => { if (!open) setGeneratingYear(false) }}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
