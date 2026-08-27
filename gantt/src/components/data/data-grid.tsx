import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Copy, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { DATA_ENTITY_REGISTRY } from '@/config/data-entity-registry'
import type { DataColumnConfig, DataEntityId, DataPageRow } from '@/types/data-maintenance'
import { formatDataCellValue, parseDataCellValue } from '@/utils/data-validation'
import { Button, Input, cn } from '@rois/ui'

interface DataGridProps {
  entityId: DataEntityId
  rows: DataPageRow[]
  loading?: boolean
  selectedRowId?: number | null
  onRowClick?: (row: DataPageRow) => void
  /** When provided, an Edit action is shown per row. */
  onEditRow?: (row: DataPageRow) => void
  onCopyRow?: (row: DataPageRow) => void
  onDeleteRow?: (row: DataPageRow) => void
  onCellCommit?: (row: DataPageRow, field: string, value: unknown) => Promise<void> | void
}

type SortDir = 'asc' | 'desc'

const DATA_ROW_HEIGHT = 32
const VIRTUAL_ROW_THRESHOLD = 80
const VIRTUAL_OVERSCAN_ROWS = 8

/** Lock short key columns so leftover `w-full` width does not redistribute into them. */
const colWidthClass = (col: DataColumnConfig): string | undefined => {
  if (col.key === 'id') return 'w-20'
  if (col.key === 'crewId') return 'w-24'
  return undefined
}

export const DataGrid = ({ entityId, rows, loading = false, selectedRowId, onRowClick, onEditRow, onCopyRow, onDeleteRow, onCellCommit }: DataGridProps) => {
  const config = DATA_ENTITY_REGISTRY[entityId]
  const columns = config?.columns ?? []
  const hasActions = Boolean(onEditRow || onCopyRow || onDeleteRow)
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [cellError, setCellError] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState<{ rowId: number; field: string } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = useState({ top: 0, height: 480 })
  const getScrollParent = () =>
    gridRef.current?.closest<HTMLElement>(`[data-testid="data-section-body-${entityId}"]`) ?? null

  // Default sort = explicit defaultSort, then first businessKey, then first non-id col.
  const defaultSortKey = useMemo(() => {
    if (config?.defaultSort && columns.some((c) => c.key === config.defaultSort)) return config.defaultSort
    const codeKey = config?.businessKey?.[0]
    if (codeKey && columns.some((c) => c.key === codeKey)) return codeKey
    return columns.find((c) => c.key !== 'id')?.key ?? columns[0]?.key ?? 'id'
  }, [config, columns])

  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: defaultSortKey, dir: 'asc' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // If the entity changed and the active sort key no longer exists, reset it.
  const sortKey = columns.some((c) => c.key === sort.key) ? sort.key : defaultSortKey

  const sortedRows = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    const numeric = col?.type === 'number'
    const isBlank = (v: unknown) => v === null || v === undefined || v === ''
    const out = [...rows]
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // Blanks always sort last, regardless of direction.
      if (isBlank(av) && isBlank(bv)) return 0
      if (isBlank(av)) return 1
      if (isBlank(bv)) return -1
      const cmp = numeric
        ? Number(av) - Number(bv)
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, sortKey, sort.dir, columns])

  const shouldVirtualize = sortedRows.length > VIRTUAL_ROW_THRESHOLD

  useEffect(() => {
    if (loading || !shouldVirtualize) return
    const scrollParent = getScrollParent()
    if (!scrollParent) return

    let frame = 0
    const readScroll = () => {
      frame = 0
      setScrollState((prev) => {
        const next = {
          top: scrollParent.scrollTop,
          height: scrollParent.clientHeight || prev.height || 480,
        }
        return prev.top === next.top && prev.height === next.height ? prev : next
      })
    }
    const scheduleRead = () => {
      if (frame) return
      frame = window.requestAnimationFrame(readScroll)
    }

    readScroll()
    scrollParent.addEventListener('scroll', scheduleRead, { passive: true })
    window.addEventListener('resize', scheduleRead)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      scrollParent.removeEventListener('scroll', scheduleRead)
      window.removeEventListener('resize', scheduleRead)
    }
  }, [entityId, loading, shouldVirtualize, sortedRows.length])

  useEffect(() => {
    if (loading || !shouldVirtualize) return
    const scrollParent = getScrollParent()
    if (scrollParent && typeof scrollParent.scrollTo === 'function') {
      scrollParent.scrollTo({ top: 0 })
    } else if (scrollParent) {
      scrollParent.scrollTop = 0
    }
    setScrollState((prev) => ({ ...prev, top: 0 }))
  }, [entityId, loading, sortKey, sort.dir, shouldVirtualize])

  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        rows: sortedRows.map((row, index) => ({ row, index })),
        beforeHeight: 0,
        afterHeight: 0,
      }
    }

    const visibleCount = Math.ceil(scrollState.height / DATA_ROW_HEIGHT)
    const start = Math.max(0, Math.floor(scrollState.top / DATA_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS)
    const end = Math.min(sortedRows.length, start + visibleCount + VIRTUAL_OVERSCAN_ROWS * 2)
    return {
      rows: sortedRows.slice(start, end).map((row, offset) => ({ row, index: start + offset })),
      beforeHeight: start * DATA_ROW_HEIGHT,
      afterHeight: Math.max(0, (sortedRows.length - end) * DATA_ROW_HEIGHT),
    }
  }, [scrollState.height, scrollState.top, shouldVirtualize, sortedRows])

  const toggleSort = (key: string) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )

  const startCellEdit = (rowId: number, field: string, raw: unknown) => {
    const col = columns.find((c) => c.key === field)
    if (!col || col.readonly || !onCellCommit) return
    setEditingCell({ rowId, field })
    setDraftValue(formatDataCellValue(raw, col))
    setCellError(null)
  }

  const cancelCellEdit = () => {
    setEditingCell(null)
    setDraftValue('')
    setCellError(null)
  }

  const commitCellEdit = async (row: DataPageRow, field: string) => {
    const col = columns.find((c) => c.key === field)
    if (!col || typeof row.id !== 'number') return
    const parsed = parseDataCellValue(draftValue, col)
    if (parsed.error) {
      setCellError(parsed.error)
      return
    }
    const current = formatDataCellValue(row[field], col)
    const next = formatDataCellValue(parsed.value, col)
    if (current === next) {
      cancelCellEdit()
      return
    }
    setSavingCell({ rowId: row.id, field })
    try {
      await onCellCommit?.(row, field, parsed.value)
      cancelCellEdit()
    } catch (err) {
      setCellError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingCell(null)
    }
  }

  const inputTypeFor = (colType: string, inputKind?: string): string => {
    if (inputKind === 'time') return 'time'
    if (inputKind === 'date' || colType === 'date') return 'date'
    if (inputKind === 'datetime' || colType === 'datetime') return 'datetime-local'
    if (inputKind === 'integer' || inputKind === 'decimal' || inputKind === 'percentRatio' || colType === 'number') return 'number'
    return 'text'
  }

  if (!config) {
    return (
      <div data-testid={`data-grid-${entityId}`} className="p-4 text-xs text-destructive">
        Unknown entity: {entityId}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        data-testid={`data-grid-${entityId}`}
        className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid={`data-grid-${entityId}`}
        className="flex items-center justify-center py-6 text-xs text-muted-foreground"
      >
        No records
      </div>
    )
  }

  return (
    <div ref={gridRef} data-testid={`data-grid-${entityId}`} className="min-w-full">
      <table className="min-w-max w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => {
              const active = col.key === sortKey
              const SortIcon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={col.key}
                  data-testid={`data-grid-header-${entityId}-${col.key}`}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'sticky top-0 z-20 cursor-pointer select-none bg-muted px-3 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap hover:text-foreground',
                    colWidthClass(col),
                  )}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <SortIcon
                      className={cn(
                        'h-3 w-3 shrink-0',
                        active ? 'text-foreground' : 'text-muted-foreground/40',
                      )}
                    />
                  </span>
                </th>
              )
            })}
            {hasActions && (
              <th className="sticky right-0 top-0 z-30 w-16 border-l border-border bg-muted px-2 py-1.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {virtualWindow.beforeHeight > 0 && (
            <tr aria-hidden="true" style={{ height: virtualWindow.beforeHeight }}>
              <td colSpan={columns.length + (hasActions ? 1 : 0)} style={{ height: virtualWindow.beforeHeight, padding: 0 }}>
                <div style={{ height: virtualWindow.beforeHeight }} />
              </td>
            </tr>
          )}
          {virtualWindow.rows.map(({ row, index: rowIdx }) => {
            const rowId = typeof row.id === 'number' ? row.id : rowIdx
            const isSelected = typeof row.id === 'number' && row.id === selectedRowId

            return (
              <tr
                key={rowId}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={shouldVirtualize ? { height: DATA_ROW_HEIGHT } : undefined}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  isSelected ? 'bg-accent' : rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                  onRowClick ? 'cursor-pointer hover:bg-accent/40' : 'hover:bg-accent/60',
                )}
              >
                {columns.map((col) => {
                  const raw = row[col.key]
                  const isEditing = editingCell?.rowId === rowId && editingCell.field === col.key
                  const isSaving = savingCell?.rowId === rowId && savingCell.field === col.key
                  const isCellEditable = Boolean(onCellCommit && !col.readonly)
                  const display = (() => {
                    if (raw === null || raw === undefined) return '—'
                    if (typeof raw === 'boolean' || col.type === 'boolean') return Number(raw) !== 0 ? 'Yes' : 'No'
                    if (col.type === 'date' || col.type === 'datetime') {
                      const d = raw instanceof Date ? raw : new Date(String(raw))
                      if (isNaN(d.getTime())) return String(raw)
                      // Slice UTC ISO string so stored calendar date is always shown as-is.
                      return col.type === 'date'
                        ? d.toISOString().slice(0, 10)
                        : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
                    }
                    return String(raw)
                  })()

                  return (
                    <td
                      key={col.key}
                      data-testid={`data-cell-${entityId}-${col.key}`}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        if (typeof row.id === 'number') startCellEdit(row.id, col.key, raw)
                      }}
                      className={cn(
                        'px-3 py-1 whitespace-nowrap align-top',
                        colWidthClass(col),
                        (col.type === 'number' || col.type === 'date' || col.type === 'datetime')
                          ? 'font-mono tabular-nums'
                          : '',
                        col.align === 'left'
                          ? 'text-left'
                          : (col.type === 'number' || col.type === 'date' || col.type === 'datetime')
                            ? 'text-right'
                            : 'text-left',
                      )}
                    >
                      {isEditing ? (
                        <div className="flex min-w-[120px] flex-col items-stretch gap-1">
                          <div className="flex items-center gap-1">
                            {col.type === 'boolean' || col.inputKind === 'boolean' ? (
                              <input
                                data-testid={`data-cell-editor-${entityId}-${col.key}`}
                                type="checkbox"
                                checked={draftValue === '1'}
                                onChange={(e) => setDraftValue(e.target.checked ? '1' : '0')}
                                disabled={isSaving}
                                autoFocus
                                className="h-4 w-4 accent-primary"
                              />
                            ) : (
                              <Input
                                data-testid={`data-cell-editor-${entityId}-${col.key}`}
                                value={draftValue}
                                type={inputTypeFor(col.type, col.inputKind)}
                                min={col.min}
                                max={col.max}
                                step={col.step}
                                maxLength={col.maxLength}
                                placeholder={col.placeholder}
                                disabled={isSaving}
                                autoFocus
                                className="h-7 min-w-[96px] px-2 text-xs"
                                onChange={(e) => {
                                  setDraftValue(e.target.value)
                                  setCellError(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void commitCellEdit(row, col.key)
                                  if (e.key === 'Escape') cancelCellEdit()
                                }}
                              />
                            )}
                            <Button
                              data-testid={`data-cell-save-${entityId}-${col.key}`}
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={isSaving}
                              onClick={(e) => {
                                e.stopPropagation()
                                void commitCellEdit(row, col.key)
                              }}
                            >
                              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={isSaving}
                              onClick={(e) => {
                                e.stopPropagation()
                                cancelCellEdit()
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {(cellError || col.helpText) && (
                            <span
                              data-testid={`data-cell-error-${entityId}-${col.key}`}
                              className={cn('max-w-[220px] whitespace-normal text-left text-2xs', cellError ? 'text-destructive' : 'text-muted-foreground')}
                            >
                              {cellError ?? col.helpText}
                            </span>
                          )}
                        </div>
                      ) : isCellEditable ? (
                        <span
                          data-testid={`data-cell-editable-${entityId}-${col.key}`}
                          className="inline-flex cursor-pointer rounded px-0.5 hover:ring-1 hover:ring-border"
                          title="Double-click to edit"
                        >
                          <span className="inline-flex items-center rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-semibold text-muted-foreground">
                            {display}
                          </span>
                        </span>
                      ) : display}
                    </td>
                  )
                })}
                {hasActions && (
                  <td className="sticky right-0 z-10 w-16 border-l border-border/60 bg-inherit px-2 py-1 whitespace-nowrap text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      {onEditRow && (
                        <Button
                          data-testid={`data-edit-row-${rowId}`}
                          variant="ghost"
                          size="sm"
                          aria-label="Edit"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditRow(row)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 shrink-0" />
                        </Button>
                      )}
                      {onCopyRow && (
                        <Button
                          data-testid={`data-copy-row-${rowId}`}
                          variant="ghost"
                          size="sm"
                          aria-label="Copy"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onCopyRow(row)
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" />
                        </Button>
                      )}
                      {onDeleteRow && (
                        <>
                    {confirmDeleteId === rowId ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span className="text-2xs text-muted-foreground">Delete?</span>
                        <Button
                          data-testid={`data-delete-confirm-${rowId}`}
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-2xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(null)
                            onDeleteRow(row)
                          }}
                        >
                          Yes
                        </Button>
                        <Button
                          data-testid={`data-delete-cancel-${rowId}`}
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-2xs"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        data-testid={`data-delete-row-${rowId}`}
                        variant="ghost"
                        size="sm"
                        aria-label="Delete"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(rowId) }}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      </Button>
                    )}
                        </>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            )
          })}
          {virtualWindow.afterHeight > 0 && (
            <tr aria-hidden="true" style={{ height: virtualWindow.afterHeight }}>
              <td colSpan={columns.length + (hasActions ? 1 : 0)} style={{ height: virtualWindow.afterHeight, padding: 0 }}>
                <div style={{ height: virtualWindow.afterHeight }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
