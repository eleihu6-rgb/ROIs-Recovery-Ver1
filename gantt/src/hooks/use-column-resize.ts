import { useCallback, useRef, useState } from 'react'
import type { ColumnConfig } from '@/types/column'

interface UseColumnResizeOptions {
  columns: ColumnConfig[]
  onColumnWidthChange: (columnKey: string, newWidth: number) => void
  minWidth?: number
}

/**
 * Hook that manages column width drag-resize for the left panel.
 * Returns updated columns and mouse event handlers.
 */
export const useColumnResize = ({
  columns,
  onColumnWidthChange,
  minWidth = 40,
}: UseColumnResizeOptions) => {
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback((columnKey: string, clientX: number) => {
    const col = columns.find((c) => c.key === columnKey)
    if (!col) return

    setResizingColumn(columnKey)
    startX.current = clientX
    startWidth.current = col.width
  }, [columns])

  const handleResizeMove = useCallback((clientX: number) => {
    if (!resizingColumn) return

    const delta = clientX - startX.current
    const newWidth = Math.max(minWidth, startWidth.current + delta)
    onColumnWidthChange(resizingColumn, newWidth)
  }, [resizingColumn, minWidth, onColumnWidthChange])

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null)
  }, [])

  /**
   * Determine if a given X position is on a column resize handle.
   * Returns the column key if so, otherwise null.
   */
  const getResizeHandle = useCallback((x: number, visibleColumns: ColumnConfig[]): string | null => {
    let colX = 0
    for (const col of visibleColumns) {
      colX += col.width
      if (Math.abs(x - colX) < 4) {
        return col.key
      }
    }
    return null
  }, [])

  return {
    resizingColumn,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    getResizeHandle,
  }
}
