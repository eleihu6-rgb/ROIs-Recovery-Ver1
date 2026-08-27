// gantt/src/components/layout/grid-row.tsx

import { GridCell } from './grid-cell'
import { HorizontalPaneSplitter } from './horizontal-pane-splitter'
import type { LayoutGrid } from '@/types/layout'

interface GridRowProps {
  row: number
  cells: LayoutGrid[number]
  isLastRow: boolean
  /** `-1` = flex fill; positive = fixed px height */
  height: number
  onResizeRow: (deltaY: number, startH?: number) => void
}

export const GridRow = ({ row, cells, isLastRow, height, onResizeRow }: GridRowProps) => {
  const paneCount = cells.filter(Boolean).length

  // Don't render empty rows
  if (paneCount === 0) return null

  const style = height === -1 ? { flex: 1 } : { height, flexShrink: 0 as const }

  return (
    <>
      <div
        className="flex overflow-hidden border border-border rounded-md bg-background"
        style={style}
        data-testid={`live-grid-row-${row}`}
        data-pane-grid-row="true"
      >
        {cells.map((paneId, colIndex) => {
          // Skip col 1 if single pane (span-full rendered at col 0)
          if (paneCount === 1 && colIndex === 1) return null

          return (
            <GridCell
              key={colIndex}
              row={row}
              col={colIndex}
              paneId={paneId}
              spanFull={paneCount === 1}
              isLastRow={isLastRow}
            />
          )
        })}
      </div>
      {!isLastRow && <HorizontalPaneSplitter onDrag={onResizeRow} />}
    </>
  )
}
