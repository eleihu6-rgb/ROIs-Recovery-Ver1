import React from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@rois/ui'
import type { ScenarioItem, ScenarioStatus, ScenarioType } from '@/types'
import type { LucideIcon } from 'lucide-react'

interface ScenarioListItemProps {
  item: ScenarioItem
  isSelected: boolean
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onDuplicate: (id: number) => void
  onRename: (id: number, currentName: string) => void
}

const getTypeBadgeClass = (type: ScenarioType): string => {
  switch (type) {
    case 'PO': return 'bg-blue-500/15 text-blue-400 font-medium'
    case 'RO': return SUCCESS_BADGE_CLASS
    case 'TO': return 'bg-violet-500/15 text-violet-400 font-medium'
  }
}

const NEUTRAL_BADGE_CLASS = 'bg-slate-500/15 text-slate-400'
const SUCCESS_BADGE_CLASS = 'bg-[#DFF7EA] text-[#065F46] font-semibold'

interface StatusMeta {
  label: string
  Icon: LucideIcon
  className: string
}

const getStatusMeta = (status: ScenarioStatus): StatusMeta => {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', Icon: Pencil, className: 'text-muted-foreground' }
    case 'RUNNING':
      return { label: 'Running', Icon: LoaderCircle, className: 'text-blue-500 animate-spin' }
    case 'DONE':
      return { label: 'Done', Icon: CheckCircle2, className: 'text-emerald-500' }
    case 'FAILED':
      return { label: 'Failed', Icon: AlertCircle, className: 'text-destructive' }
    case 'PUBLISHED':
      return { label: 'Published', Icon: UploadCloud, className: 'text-amber-500' }
  }
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/

interface ScenarioDateParts {
  year: number
  month: number
  day: number
}

const parseScenarioDate = (value: string): ScenarioDateParts | null => {
  const match = DATE_ONLY_RE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (!Number.isFinite(year) || month < 0 || month > 11 || day < 1 || day > 31) return null
  return { year, month, day }
}

const compactDate = (parts: ScenarioDateParts): string =>
  `${parts.day} ${MONTH_SHORT[parts.month]} ${parts.year}`

const compactDayMonth = (parts: ScenarioDateParts): string =>
  `${parts.day} ${MONTH_SHORT[parts.month]}`

const formatScenarioDateRange = (startValue: string, endValue: string): string => {
  const start = parseScenarioDate(startValue)
  const end = parseScenarioDate(endValue)
  if (!start && !end) return ''
  if (!start) return compactDate(end as ScenarioDateParts)
  if (!end) return compactDate(start)
  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return compactDate(start)
  }
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}-${end.day} ${MONTH_SHORT[start.month]} ${start.year}`
  }
  if (start.year === end.year) {
    return `${compactDayMonth(start)}-${compactDayMonth(end)} ${start.year}`
  }
  return `${compactDate(start)}-${compactDate(end)}`
}

const formatOptimizedRosterLabel = (count: number): string =>
  count === 1 ? '1 result' : `${count} results`

const formatRelativeTime = (date: Date): string =>
  formatDistanceToNowStrict(date, { addSuffix: true })
    .replace(/\b1 minute\b/g, '1 min')
    .replace(/\b(\d+) minutes\b/g, '$1 mins')

export const ScenarioListItem = ({
  item,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: ScenarioListItemProps): React.ReactNode => {
  const relativeTime = formatRelativeTime(new Date(item.updatedAt))
  const optimizedRosterLabel = formatOptimizedRosterLabel(item.optimizedCount)
  const updatedByLabel = item.updatedBy ?? '—'
  const statusMeta = getStatusMeta(item.status)
  const StatusIcon = statusMeta.Icon

  const handleRowClick = (): void => {
    onSelect(item.id)
  }

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onDelete(item.id)
  }

  const handleDuplicateClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onDuplicate(item.id)
  }

  const handleRenameClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onRename(item.id, item.name)
  }

  const containerClass = cn(
    'relative flex items-center px-3 py-2 cursor-pointer transition-colors duration-100 group border-l-[3px]',
    isSelected
      ? 'border-primary bg-accent pl-[9px]'
      : 'border-transparent hover:bg-accent/50'
  )

  return (
    <div className={containerClass} data-testid="scenario-list-item" onClick={handleRowClick}>
      {/* Middle content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: type badge + #id badge + name + status icon */}
        <div className="flex items-center gap-1.5">
          <span data-testid="scenario-item-type" className={`text-2xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${NEUTRAL_BADGE_CLASS}`}>
            {item.fileType}
          </span>
          <span data-testid="scenario-item-id" className={`text-sm px-1.5 py-0.5 rounded tabular-nums shrink-0 ${getTypeBadgeClass(item.fileType)}`}>
            {item.id}
          </span>
          <span data-testid="scenario-item-name" className="text-sm font-medium truncate flex-1">{item.name}</span>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={`Scenario status: ${statusMeta.label}`}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground"
                >
                  <StatusIcon className={`h-3.5 w-3.5 ${statusMeta.className}`} aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{statusMeta.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Row 2: compact date range + modifier + optimized roster count + update age */}
        <div data-testid="scenario-item-meta" className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 min-w-0">
          <span data-testid="scenario-item-date-range" className="shrink-0">
            {formatScenarioDateRange(item.strDtLoc, item.endDtLoc)}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="scenario-item-updated-by" className="truncate max-w-[7rem]">
            {updatedByLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span
            data-testid="scenario-item-optimized-count"
            className={cn(
              'rounded-sm px-1 shrink-0',
              item.optimizedCount > 0 && SUCCESS_BADGE_CLASS
            )}
          >
            {optimizedRosterLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="scenario-item-updated-age" className="shrink-0">
            {relativeTime}
          </span>
        </div>
      </div>

      {/* Three-dot menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem data-testid="scenario-item-rename" onClick={handleRenameClick}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicateClick}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={handleDeleteClick}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
