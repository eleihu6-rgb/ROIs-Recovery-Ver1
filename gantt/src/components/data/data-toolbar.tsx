import type { DataPageId } from '@/types/data-maintenance'

interface DataToolbarProps {
  pageId: DataPageId | null
  title?: string
  recordCount?: number
}

export const DataToolbar = ({ pageId, title, recordCount }: DataToolbarProps) => {
  const displayTitle = title ?? (pageId ? pageId.replace(/[.-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Data Maintenance')

  return (
    <div
      data-testid="data-toolbar"
      className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-4"
    >
      {/* Title + counts */}
      <span className="text-sm font-semibold text-foreground truncate">{displayTitle}</span>

      {recordCount !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {recordCount.toLocaleString()} records
        </span>
      )}

      <div className="flex-1" />
    </div>
  )
}
