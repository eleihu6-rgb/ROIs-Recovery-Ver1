// gantt/src/components/scenario/multi-select.tsx
import type { ReactNode } from 'react'
import { ChevronDown, X, Loader2 } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  cn,
} from '@rois/ui'

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  testId?: string
  className?: string
}

/**
 * Compact multi-select dropdown — a trigger that shows the chosen values as
 * removable chips and a checkbox list that stays open while picking. Used for
 * the Import PBS dialog's Base / Rank / Fleet pickers.
 */
export const MultiSelect = ({
  options,
  selected,
  onChange,
  placeholder = 'Select…',
  loading = false,
  disabled = false,
  testId,
  className,
}: MultiSelectProps): ReactNode => {
  const toggle = (value: string): void => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const remove = (value: string): void => {
    onChange(selected.filter((v) => v !== value))
  }

  const labelFor = (value: string): string => options.find((o) => o.value === value)?.label ?? value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || loading}>
        <Button
          type="button"
          variant="outline"
          data-testid={testId}
          className={cn(
            'h-auto min-h-7 w-full justify-between gap-1 px-2 py-1 text-xs font-normal',
            selected.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex flex-1 flex-wrap items-center gap-1">
            {loading ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </span>
            ) : selected.length === 0 ? (
              placeholder
            ) : (
              selected.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-2xs font-medium text-accent-foreground"
                >
                  {labelFor(value)}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${labelFor(value)}`}
                    className="text-muted-foreground hover:text-foreground"
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); remove(value) }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No options</div>
        ) : (
          options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs"
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
