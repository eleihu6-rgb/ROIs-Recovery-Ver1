import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'

interface DataPaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const PAGE_SIZE_OPTIONS = [50, 100, 200]

export const DataPagination = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: DataPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  return (
    <div
      data-testid="data-pagination"
      className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5"
    >
      <span className="text-2xs text-muted-foreground tabular-nums">
        {total === 0 ? '0 rows' : `${from}–${to} of ${total}`}
      </span>

      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger data-testid="data-pagination-size" className="h-6 w-20 text-2xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-2xs text-muted-foreground tabular-nums">
          {page} / {totalPages}
        </span>

        <Button
          data-testid="data-pagination-prev"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        </Button>
        <Button
          data-testid="data-pagination-next"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </div>
    </div>
  )
}
