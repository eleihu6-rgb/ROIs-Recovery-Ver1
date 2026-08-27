import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import type { ScheduleCrewOption } from '@/utils/schedule-details'

interface RosterCrewSearchSelectProps {
  value: string
  options: ScheduleCrewOption[]
  onValueChange: (value: string) => void
  testId: string
  className?: string
}

const crewMatches = (crew: ScheduleCrewOption, query: string): boolean => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return crew.crewId.toLowerCase().includes(normalized) || crew.label.toLowerCase().includes(normalized)
}

export const RosterCrewSearchSelect = ({
  value,
  options,
  onValueChange,
  testId,
  className,
}: RosterCrewSearchSelectProps) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((crew) => crew.crewId === value)
  const filtered = useMemo(() => options.filter((crew) => crewMatches(crew, query)).slice(0, 80), [options, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={containerRef} className={['relative w-[180px]', className ?? ''].join(' ')}>
      <button
        type="button"
        data-testid={testId}
        className={[
          'flex h-7 w-full items-center gap-2 rounded-md border border-border bg-background px-2 text-left text-xs outline-none transition-colors',
          'hover:bg-accent/40 focus:border-ring focus:ring-1 focus:ring-ring',
          open ? 'border-ring ring-1 ring-ring' : '',
        ].join(' ')}
        disabled={options.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? 'truncate font-mono tabular-nums text-foreground' : 'truncate text-muted-foreground'}>
          {selected ? selected.crewId : 'Select crew'}
        </span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div role="listbox" className="absolute left-0 top-full z-50 mt-1 w-[240px] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <div className="flex h-8 items-center gap-1.5 border-b border-border px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false)
                if (event.key === 'Enter' && filtered[0]) {
                  onValueChange(filtered[0].crewId)
                  setOpen(false)
                }
              }}
              placeholder="Search crew ID..."
              className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
              data-testid={`${testId}-search`}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No crew found.</div>
            ) : filtered.map((crew) => (
              <button
                key={crew.crewId}
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/60"
                data-testid={`${testId}-option`}
                onClick={() => {
                  onValueChange(crew.crewId)
                  setOpen(false)
                }}
              >
                <span className="w-14 shrink-0 font-mono tabular-nums">{crew.crewId}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{crew.label}</span>
                {crew.crewId === value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface RosterPeriodStepperProps {
  periods: RosterPeriodOption[]
  selectedPeriod: RosterPeriodOption | null
  onValueChange: (value: string) => void
  testId: string
  navTestIdPrefix?: string
}

export const RosterPeriodStepper = ({
  periods,
  selectedPeriod,
  onValueChange,
  testId,
  navTestIdPrefix,
}: RosterPeriodStepperProps) => {
  const selectedIndex = selectedPeriod ? periods.findIndex((rp) => rp.id === selectedPeriod.id) : -1
  const label = selectedPeriod ? selectedPeriod.rosterPeriod : '-'
  const navPrefix = navTestIdPrefix ?? testId

  return (
    <div className="inline-flex h-7 w-[180px] items-center overflow-hidden rounded-md border border-border bg-background text-xs">
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (selectedIndex > 0) onValueChange(String(periods[selectedIndex - 1].id))
        }}
        disabled={selectedIndex <= 0}
        title="Previous RP"
        data-testid={`${navPrefix}-prev`}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1 whitespace-nowrap border-x border-border px-2 text-center font-mono tabular-nums" data-testid={testId}>
        {label}
      </div>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (selectedIndex >= 0 && selectedIndex < periods.length - 1) onValueChange(String(periods[selectedIndex + 1].id))
        }}
        disabled={selectedIndex < 0 || selectedIndex >= periods.length - 1}
        title="Next RP"
        data-testid={`${navPrefix}-next`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
