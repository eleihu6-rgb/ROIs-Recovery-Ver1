import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { DataEntityId } from '@/types/data-maintenance'
import { cn } from '@rois/ui'

interface DataSectionProps {
  entityId: DataEntityId
  title: string
  instruction?: string
  rowCount?: number
  children: ReactNode
  defaultExpanded?: boolean
  onAdd?: () => void
}

export const DataSection = ({
  entityId,
  title,
  instruction,
  rowCount,
  children,
  defaultExpanded = true,
  onAdd,
}: DataSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div
      data-testid={`data-section-${entityId}`}
      className="border-b border-border"
    >
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex min-h-10 w-full shrink-0 items-center gap-2 border-b border-border px-4 py-1.5',
          'text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors',
        )}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{title}</span>
          {instruction && (
            <span className="block truncate text-2xs font-normal text-muted-foreground">
              {instruction}
            </span>
          )}
        </span>

        {onAdd && (
          <button
            type="button"
            data-testid={`data-section-add-${entityId}`}
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Add row"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
          </button>
        )}
        {rowCount !== undefined && rowCount > 0 && (
          <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-mono tabular-nums text-muted-foreground">
            {rowCount}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div
          data-testid={`data-section-body-${entityId}`}
          className="max-h-[calc(100vh-16rem)] overflow-auto"
        >
          {children}
        </div>
      )}
    </div>
  )
}
