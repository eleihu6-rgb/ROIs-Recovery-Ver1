import { useEffect, useRef, useState } from 'react'
import { Copy, Pencil, Plus } from 'lucide-react'
import { AppDialog, Button, Input, cn } from '@rois/ui'
import { dataApi } from '@/services/data-api'
import { notify } from '@/utils/notify'
import { DATA_ENTITY_REGISTRY } from '@/config/data-entity-registry'
import { parseDataCellValue } from '@/utils/data-validation'
import type { DataChange, DataEntityId, DataPageRow } from '@/types/data-maintenance'

export type DataEditDialogMode = 'add' | 'copy' | 'edit'

interface DataEditDialogProps {
  entityId: DataEntityId
  /** The row being edited. `null` closes the dialog. */
  row: DataPageRow | null
  initialValues?: Record<string, unknown>
  /** Dialog intent. Defaults to copy when `row` is null with initialValues, else add/edit. */
  mode?: DataEditDialogMode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful save so the caller can refetch. */
  onSaved: () => void
}

/** Cap the number of problems echoed in the toast summary — field details live under each input. */
const summarize = (messages: string[]): string => {
  const shown = messages.slice(0, 3)
  const extra = messages.length - shown.length
  return shown.join('; ') + (extra > 0 ? ` (+${extra} more)` : '')
}

/**
 * Generic, registry-driven edit form for a single Data-tab row.
 *
 * Renders one input per editable column (id / readonly columns excluded) and
 * persists an `update` change directly through `POST /api/data/save`. Reusable
 * for any editable entity — the column set comes entirely from the registry.
 */
export const DataEditDialog = ({ entityId, row, initialValues, mode, open, onOpenChange, onSaved }: DataEditDialogProps) => {
  const config = DATA_ENTITY_REGISTRY[entityId]
  const editableColumns = config.columns.filter((c) => !c.readonly)

  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const resolvedMode: DataEditDialogMode =
    mode ?? (row === null || typeof row.id !== 'number' ? (initialValues ? 'copy' : 'add') : 'edit')
  const isCreate = resolvedMode === 'add' || resolvedMode === 'copy'

  // Reset the form whenever a new row is opened.
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const col of editableColumns) {
      const source = row ?? initialValues
      const raw = source ? source[col.key] : undefined
      next[col.key] = raw === null || raw === undefined ? '' : String(raw)
    }
    setValues(next)
    setErrors({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, initialValues, entityId])

  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const buildCreateValues = (): Record<string, unknown> => {
    const excludedKeys = new Set(['id', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'created_by', 'created_at', 'updated_by', 'updated_at'])
    const copiedValues = initialValues
      ? Object.fromEntries(Object.entries(initialValues).filter(([key]) => !excludedKeys.has(key)))
      : {}
    return { ...copiedValues, ...values }
  }

  const parseValues = (): { parsed: Record<string, unknown>; errors: Record<string, string> } => {
    const parsed: Record<string, unknown> = {}
    const nextErrors: Record<string, string> = {}
    for (const col of editableColumns) {
      const result = parseDataCellValue(values[col.key] ?? '', col)
      if (result.error) nextErrors[col.key] = result.error
      parsed[col.key] = result.value
    }
    return { parsed, errors: nextErrors }
  }

  const scrollToFirstError = (errorKeys: string[]) => {
    if (!gridRef.current) return
    for (const key of errorKeys) {
      const el = gridRef.current.querySelector<HTMLElement>(`[data-testid="data-edit-field-${key}"]`)
      if (el) {
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        return
      }
    }
  }

  /** Map a server issue `field` (db column or camel key) back to the form column. */
  const columnForField = (field: string) =>
    config.columns.find((c) => c.key === field || c.dbField === field)

  /** Highlight the fields flagged by a validation response and notify with a summary. */
  const surfaceValidationErrors = (fieldErrors: Record<string, string>, generalMessages: string[]) => {
    setErrors(fieldErrors)
    scrollToFirstError(Object.keys(fieldErrors))
    const messages = [...generalMessages]
    for (const key of Object.keys(fieldErrors)) {
      const col = config.columns.find((c) => c.key === key)
      messages.push(`${col?.label ?? key}: ${fieldErrors[key]}`)
    }
    notify.error(`Cannot save — ${summarize(messages)}`)
  }

  const handleSave = async () => {
    const parsed = parseValues()
    if (Object.keys(parsed.errors).length > 0) {
      setErrors(parsed.errors)
      scrollToFirstError(Object.keys(parsed.errors))
      notify.error(`Cannot save — ${summarize(Object.values(parsed.errors))}`)
      return
    }
    const change: DataChange = isCreate
      ? {
          clientChangeId: `create-${entityId}-${Date.now()}`,
          entityId,
          action: 'create',
          after: { ...buildCreateValues(), ...parsed.parsed },
        }
      : {
          clientChangeId: `edit-${entityId}-${row?.id}-${Date.now()}`,
          entityId,
          action: 'update',
          rowId: row?.id as number,
          after: { ...parsed.parsed },
        }

    setSaving(true)
    try {
      const result = await dataApi.save([change])
      if (result.committed < 1) {
        notify.error('Save rejected — no changes were committed')
        return
      }
      notify.success(isCreate ? `${config.label} created` : `${config.label} updated`)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      // Server-side validation failure — the save discards the details, so re-run
      // the validate endpoint to learn which field(s) failed and highlight them.
      if (err instanceof Error && err.message === 'Validation failed') {
        const issues = await dataApi.validate([change]).catch(() => null)
        if (issues) {
          const fieldErrors: Record<string, string> = {}
          const generalMessages: string[] = []
          for (const issue of issues) {
            if (issue.severity !== 'error') continue
            const col = issue.field ? columnForField(issue.field) : undefined
            if (col) fieldErrors[col.key] = issue.message
            else generalMessages.push(issue.message)
          }
          surfaceValidationErrors(fieldErrors, generalMessages)
          return
        }
      }
      notify.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputTypeFor = (colType: string, inputKind?: string): string => {
    if (inputKind === 'time') return 'time'
    if (inputKind === 'date' || colType === 'date') return 'date'
    if (inputKind === 'datetime' || colType === 'datetime') return 'datetime-local'
    if (inputKind === 'integer' || inputKind === 'decimal' || inputKind === 'percentRatio' || colType === 'number') return 'number'
    return 'text'
  }

  const dialogIcon = resolvedMode === 'copy' ? <Copy className="h-4 w-4" /> : isCreate ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />
  const dialogTitle = resolvedMode === 'copy'
    ? `Copy ${config.label}`
    : isCreate ? `Add ${config.label}` : `Edit ${config.label}`
  const dialogDescription = resolvedMode === 'copy' && initialValues?.id != null
    ? `Copied from Row #${initialValues.id}`
    : !isCreate ? `Row #${row?.id}` : undefined

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid={`data-edit-dialog-${entityId}`}
      className="sm:max-w-[680px]"
      icon={dialogIcon}
      title={dialogTitle}
      description={dialogDescription}
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button data-testid="data-edit-save" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div ref={gridRef} className="grid max-h-[60vh] grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto px-1 py-1">
        {editableColumns.map((col) => (
          <label key={col.key} className="flex flex-col gap-1 text-2xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              {col.label}
              {col.required && <span className="text-destructive">*</span>}
            </span>
            <Input
              data-testid={`data-edit-field-${col.key}`}
              value={values[col.key] ?? ''}
              type={inputTypeFor(col.type, col.inputKind)}
              min={col.min}
              max={col.max}
              step={col.step}
              placeholder={col.placeholder}
              maxLength={col.maxLength}
              inputMode={col.type === 'number' ? 'decimal' : undefined}
              onChange={(e) => {
                setField(col.key, e.target.value)
                setErrors((prev) => ({ ...prev, [col.key]: '' }))
              }}
              className={cn('h-8 text-xs', col.type === 'number' && 'font-mono tabular-nums', errors[col.key] && 'border-destructive')}
            />
            {(errors[col.key] || col.helpText) && (
              <span
                data-testid={errors[col.key] ? `data-edit-error-${col.key}` : undefined}
                className={cn('text-2xs', errors[col.key] ? 'text-destructive' : 'text-muted-foreground')}
              >
                {errors[col.key] || col.helpText}
              </span>
            )}
          </label>
        ))}
      </div>
    </AppDialog>
  )
}
