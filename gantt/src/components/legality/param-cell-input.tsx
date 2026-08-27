import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  buildCalendarCells,
  formatEnglishDate,
  formatEnglishMonth,
  getInitialCalendarMonth,
  shiftCalendarMonth,
} from '@rois/ui'
import { validateCell } from '@/utils/param-format'
import type { CellFormat } from '@/utils/param-format'

interface Props {
  value: string
  format: CellFormat
  onChange: (value: string) => void
  fullWidth?: boolean
  'data-testid'?: string
}

export const ParamCellInput = ({
  value,
  format,
  onChange,
  fullWidth = false,
  'data-testid': testId,
}: Props) => {
  const error = validateCell(value, format)
  const isEmpty = value.trim() === ''
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialCalendarMonth(value))

  useEffect(() => {
    if (open) setVisibleMonth(getInitialCalendarMonth(value))
  }, [open, value])

  const cells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth])

  const borderClass = isEmpty
    ? 'border-2 border-destructive focus:border-destructive'
    : error
      ? 'border-2 border-orange-400 focus:border-orange-400'
      : 'border border-border focus:border-primary'

  const input = (
    <input
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        fullWidth ? 'w-full' : 'w-16',
        'rounded px-1.5 py-0.5 font-mono text-2xs tabular-nums outline-none',
        'bg-background text-foreground',
        borderClass,
        isEmpty ? 'bg-destructive/5' : error ? 'bg-orange-50' : '',
      ].join(' ')}
    />
  )

  if (format !== 'date') {
    return (
      <div className="flex flex-col gap-0.5">
        {input}
        {error && (
          <span className={`text-3xs font-medium ${isEmpty ? 'text-destructive' : 'text-orange-600'}`}>
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${fullWidth ? 'w-full' : ''}`}>
      <div className={`flex items-center ${fullWidth ? 'gap-1.5' : 'gap-1'}`}>
        <div className={fullWidth ? 'min-w-0 flex-1' : undefined}>{input}</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Pick date"
              data-testid={testId ? `${testId}-calendar` : undefined}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="mb-3 flex items-center justify-between">
              <Button
                aria-label="Previous month"
                className="h-7 w-7"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setVisibleMonth((m) => shiftCalendarMonth(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-semibold text-foreground">
                {formatEnglishMonth(visibleMonth)}
              </div>
              <Button
                aria-label="Next month"
                className="h-7 w-7"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setVisibleMonth((m) => shiftCalendarMonth(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Pick date calendar">
              {cells.map((cell) => {
                const selected = value === cell.isoDate
                const formatted = formatEnglishDate(cell.isoDate)
                const label = formatted ? `Select ${formatted}` : `Select ${cell.isoDate}`
                return (
                  <Button
                    key={cell.key}
                    aria-label={label}
                    aria-pressed={selected}
                    className={[
                      'h-8 rounded-md px-0 text-xs tabular-nums',
                      !cell.inCurrentMonth ? 'text-muted-foreground/45' : '',
                      selected ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : '',
                    ].join(' ')}
                    disabled={cell.disabled}
                    role="gridcell"
                    type="button"
                    variant={selected ? 'default' : 'ghost'}
                    onClick={() => {
                      onChange(cell.isoDate)
                      setOpen(false)
                    }}
                  >
                    {String(cell.day).padStart(2, '0')}
                  </Button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {error && (
        <span className={`text-3xs font-medium ${isEmpty ? 'text-destructive' : 'text-orange-600'}`}>
          {error}
        </span>
      )}
    </div>
  )
}
