import { useState, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Button,
} from '@rois/ui'
import { GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useColumnStore } from '@/stores/column-store'
import type { PaneType } from '@/types/pane'
import type { ColumnConfig } from '@/types/column'

interface ColumnConfigDialogProps {
  open: boolean
  onClose: () => void
  paneType: PaneType
  paneLabel: string
}

/**
 * Dialog for configuring left panel columns:
 * - Toggle visibility (eye icon)
 * - Drag to reorder (grip handle)
 * - Reset to defaults
 *
 * Design: ui-ux-pro-max — semantic colors, compact, professional
 */
export const ColumnConfigDialog = ({ open, onClose, paneType, paneLabel }: ColumnConfigDialogProps) => {
  const allColumns = useColumnStore((s) => s.getColumns(paneType))
  const updateColumn = useColumnStore((s) => s.updateColumn)
  const reorderColumns = useColumnStore((s) => s.reorderColumns)
  const resetColumns = useColumnStore((s) => s.resetColumns)

  // Local drag state for reordering
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const sorted = [...allColumns].sort((a, b) => a.order - b.order)

  const toggleVisibility = useCallback((key: string, visible: boolean) => {
    updateColumn(paneType, key, { visible: !visible })
  }, [updateColumn, paneType])

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) return

    const reordered = [...sorted]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // Reassign order values
    const updated = reordered.map((col, i) => ({ ...col, order: i + 1 }))
    reorderColumns(paneType, updated)
    setDragIdx(targetIdx)
  }, [dragIdx, sorted, reorderColumns, paneType])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
  }, [])

  const handleReset = useCallback(() => {
    resetColumns(paneType)
  }, [resetColumns, paneType])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[360px] gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm">{paneLabel} — Column Settings</DialogTitle>
          <DialogDescription className="text-xs">
            Toggle visibility and drag to reorder columns.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto px-2 py-1">
          {sorted.map((col, idx) => (
            <div
              key={col.key}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={[
                'flex items-center gap-2 rounded px-2 py-1.5 transition-colors',
                dragIdx === idx ? 'bg-accent/60' : 'hover:bg-accent/30',
              ].join(' ')}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />

              <button
                className="shrink-0 transition-all duration-100 active:scale-95"
                onClick={() => toggleVisibility(col.key, col.visible)}
              >
                {col.visible ? (
                  <Eye className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
              </button>

              <span className={`flex-1 text-xs ${col.visible ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                {col.label}
              </span>

              <span className="text-2xs tabular-nums text-muted-foreground/40">
                Row {col.row}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex justify-between px-4 pt-2 pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
