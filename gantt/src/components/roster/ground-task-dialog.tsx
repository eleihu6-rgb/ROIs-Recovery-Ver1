// gantt/src/components/roster/ground-task-dialog.tsx
import { useState, useEffect, useMemo } from 'react'
import { AppDialog, Button, Input, Badge } from '@rois/ui'
import { Lock, SquarePlus, X } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { getTimezoneOffset } from '@/components/gantt/gantt-utils'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import { api } from '@/services/api'

export interface AssignmentOption {
  assignment: string
  description: string
  defaultAssignmentGroup: string | null
  restTime: number | null
  fixedCreditMin?: number | string | null
  dpPct?: number | string | null
}

interface AirportOption {
  airport: string
  airportName?: string | null
  city?: string | null
}

export const filterGroundTaskAssignments = (options: AssignmentOption[]): AssignmentOption[] =>
  options.filter((a) => a.defaultAssignmentGroup !== 'FLT')

export const filterAirportOptions = (options: AirportOption[], query: string): AirportOption[] => {
  const q = query.trim().toUpperCase()
  if (!q) return options.slice(0, 12)
  return options
    .filter((a) => {
      const code = a.airport.toUpperCase()
      const name = (a.airportName ?? '').toUpperCase()
      const city = (a.city ?? '').toUpperCase()
      return code.includes(q) || name.includes(q) || city.includes(q)
    })
    .slice(0, 12)
}

/** Convert local date+time in IANA timezone to UTC ISO string. */
export const localToUtc = (dateStr: string, timeStr: string, timezone: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString()
  }
  const noonUtcMs = Date.UTC(year, month - 1, day, 12)
  const offsetMinutes = getTimezoneOffset(new Date(noonUtcMs), timezone)
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute)
  return new Date(localAsUtcMs - offsetMinutes * 60000).toISOString()
}

/** Format a UTC ISO string as "YYYY-MM-DD" in the display timezone. */
export const utcToLocalDate = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(utcStr))

/** Format a UTC ISO string as "HH:MM" in the display timezone. */
export const utcToLocalTime = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utcStr))

const calcDuration = (startDate: string, startTime: string, endDate: string, endTime: string): string | null => {
  if (!startDate || !startTime || !endDate || !endTime) return null
  // Duration = end - start; offset cancels so we can treat them as UTC for diff
  const s = new Date(`${startDate}T${startTime}:00Z`)
  const e = new Date(`${endDate}T${endTime}:00Z`)
  const diff = e.getTime() - s.getTime()
  if (diff <= 0) return 'warn'
  const h = Math.floor(diff / 3600000)
  const m = Math.round((diff % 3600000) / 60000)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

type CreditValue = string | number | null | undefined

const creditMinutes = (value: CreditValue): number | null => {
  if (value == null || value === '') return null
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return minutes
}

export const formatGroundTaskCredit = (
  actCreditedMinutes: CreditValue,
  schCreditedMinutes: CreditValue,
): string => {
  const minutes = creditMinutes(actCreditedMinutes) ?? creditMinutes(schCreditedMinutes)
  if (minutes == null) return '-'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}h ${remainder.toString().padStart(2, '0')}m`
}

const editableCreditSources = new Set(['CR', 'MA'])

const creditInputValue = (actCreditedMinutes: CreditValue, schCreditedMinutes: CreditValue): string => {
  const minutes = creditMinutes(actCreditedMinutes) ?? creditMinutes(schCreditedMinutes)
  return minutes == null ? '' : String(minutes)
}

const normalizedCreditInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const minutes = Math.round(Number(trimmed))
  return Number.isFinite(minutes) && minutes >= 0 ? String(minutes) : null
}

const assignmentFixedCredit = (option: AssignmentOption | undefined): number | null => {
  if (option?.fixedCreditMin == null || option.fixedCreditMin === '') return null
  const minutes = Math.round(Number(option.fixedCreditMin))
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
}

const assignmentDpMin = (option: AssignmentOption | undefined, duration: string | null): number => {
  if (!option?.dpPct || !duration || duration === 'warn') return 0
  const match = duration.match(/^(\d+)h\s+(\d+)m$/)
  if (!match) return 0
  return Math.round((Number(match[1]) * 60 + Number(match[2])) * Number(option.dpPct))
}

const normalizeAirportCode = (value: string): string => value.trim().toUpperCase().slice(0, 3)

const normalizePrefillAirport = (value: string | null | undefined): string => {
  const code = normalizeAirportCode(value ?? '')
  return code === 'UTC' ? '' : code
}

export const crewBaseForId = (crewId: string | undefined): string => {
  if (!crewId) return ''
  const item = useCrewStore.getState().items.find((c) => c.crew.crewId === crewId)
  return normalizePrefillAirport(item?.crew.panelBase ?? item?.crew.bases?.[0]?.base ?? '')
}

const AirportInput = ({
  value,
  onChange,
  options,
  testId,
}: {
  value: string
  onChange: (value: string) => void
  options: AirportOption[]
  testId: string
}) => {
  const [focused, setFocused] = useState(false)
  const matches = useMemo(() => filterAirportOptions(options, value), [options, value])
  const showList = focused && matches.length > 0

  return (
    <div className="relative">
      <Input
        className="h-8 font-mono text-xs uppercase"
        maxLength={3}
        value={value}
        onChange={(e) => onChange(normalizeAirportCode(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        autoComplete="off"
        data-testid={testId}
      />
      {showList && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-[10000] max-h-44 overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg"
          data-testid={`${testId}-options`}
        >
          {matches.map((airport) => (
            <button
              key={airport.airport}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(normalizeAirportCode(airport.airport))
                setFocused(false)
              }}
              data-testid={`${testId}-option-${airport.airport}`}
            >
              <span className="w-9 font-mono font-semibold text-foreground">{airport.airport}</span>
              <span className="min-w-0 truncate text-muted-foreground">{airport.airportName || airport.city || airport.airport}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Ground task create/edit dialog — standard AppDialog chrome (draggable title bar). */
export const GroundTaskDialog = () => {
  const open = useUiStore((s) => s.groundTaskDialogOpen)
  const mode = useUiStore((s) => s.groundTaskMode)
  const editItem = useUiStore((s) => s.groundTaskEditItem)
  const prefill = useUiStore((s) => s.groundTaskPrefill)
  const scenarioId = useUiStore((s) => s.groundTaskScenarioId)
  const close = useUiStore((s) => s.closeGroundTaskDialog)
  const addGroundTask = useRosterStore((s) => s.addGroundTask)
  const updateTask = useRosterStore((s) => s.updateTask)
  const removeTask = useRosterStore((s) => s.removeTask)
  const timezone = useTimezoneStore((s) => s.timezone)
  const timezoneAirport = useTimezoneStore((s) => s.timezoneAirport)

  /** Scenario has no ground-task write API — dialog is view-only. */
  const viewOnly = scenarioId != null
  /** IMP-sourced rows are immutable — treat as view-only in edit mode. */
  const isImp = mode === 'edit' && editItem?.source === 'IMP'
  /** Combined read-only flag: Scenario view-only OR IMP immutability. */
  const readOnly = viewOnly || isImp

  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([])
  const [crewInput, setCrewInput] = useState('')
  const [assignment, setAssignment] = useState('')
  const [assignmentGroup, setAssignmentGroup] = useState('')
  const [depArp, setDepArp] = useState('')
  const [arvArp, setArvArp] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [credit, setCredit] = useState('')
  const [dpMin, setDpMin] = useState('')
  const [dpMinTouched, setDpMinTouched] = useState(false)
  const [remark, setRemark] = useState('')
  const [assignments, setAssignments] = useState<AssignmentOption[]>([])
  const [airports, setAirports] = useState<AirportOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load assignment options once on mount
  useEffect(() => {
    api.get('/api/assignment').then((data) => {
      const list = filterGroundTaskAssignments(data as unknown as AssignmentOption[])
      setAssignments(list)
    }).catch((err) => {
      console.error('Failed to load assignments:', err)
    })
  }, [])

  useEffect(() => {
    api.get('/api/airport').then((data) => {
      const list = (data as unknown as AirportOption[])
        .filter((a) => a.airport)
        .map((a) => ({ ...a, airport: normalizeAirportCode(a.airport) }))
        .sort((a, b) => a.airport.localeCompare(b.airport))
      setAirports(list)
    }).catch((err) => {
      console.error('Failed to load airports:', err)
    })
  }, [])

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return
    const tz = useTimezoneStore.getState().timezone
    if (mode === 'edit' && editItem) {
      setSelectedCrewIds([editItem.crewId])
      setAssignment(editItem.assignment ?? '')
      setAssignmentGroup(editItem.assignmentGroup ?? '')
      setDepArp(editItem.depArp ?? editItem.base ?? '')
      setArvArp(editItem.arvArp ?? '')
      setStartDate(editItem.schStrDtUtc ? utcToLocalDate(editItem.schStrDtUtc, tz) : '')
      setStartTime(editItem.schStrDtUtc ? utcToLocalTime(editItem.schStrDtUtc, tz) : '')
      setEndDate(editItem.schEndDtUtc ? utcToLocalDate(editItem.schEndDtUtc, tz) : '')
      setEndTime(editItem.schEndDtUtc ? utcToLocalTime(editItem.schEndDtUtc, tz) : '')
      setCredit(creditInputValue(editItem.actCreditedMinutes, editItem.schCreditedMinutes))
      setDpMin(editItem.dpMin == null ? '' : String(editItem.dpMin))
      // In edit mode, mark dpMin as touched so the auto-calc useEffect below
      // does not overwrite the value we just restored from the item.
      setDpMinTouched(editItem.dpMin != null)
      setRemark(editItem.comments ?? '')
    } else {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const prefillAirport = normalizePrefillAirport(prefill?.depArp) || crewBaseForId(prefill?.crewId)
      setSelectedCrewIds(prefill?.crewId ? [prefill.crewId] : [])
      setAssignment('')
      setAssignmentGroup('')
      setDepArp(prefillAirport)
      setArvArp(normalizePrefillAirport(prefill?.arvArp) || prefillAirport)
      setStartDate(prefill?.startDate ?? today)
      setStartTime(prefill?.startTime ?? '00:00')
      setEndDate(prefill?.startDate ?? today)
      setEndTime(prefill?.startTime ?? '23:59')
      setCredit('')
      setDpMin('')
      setDpMinTouched(false)
      setRemark('')
    }
    setCrewInput('')
    setError(null)
    setSaving(false)
  }, [open, mode, editItem, prefill])

  const duration = calcDuration(startDate, startTime, endDate, endTime)

  const handleAssignmentChange = (val: string) => {
    setAssignment(val)
    const opt = assignments.find((a) => a.assignment === val)
    setAssignmentGroup(opt?.defaultAssignmentGroup ?? '')
    if (!dpMinTouched) setDpMin(String(assignmentDpMin(opt, duration)))
    if (mode === 'create' || (mode === 'edit' && editItem && editableCreditSources.has(String(editItem.source ?? '').toUpperCase()))) {
      const fixedCredit = assignmentFixedCredit(opt)
      setCredit(fixedCredit == null ? '' : String(fixedCredit))
    }
  }

  useEffect(() => {
    if (!dpMinTouched && assignment) {
      setDpMin(String(assignmentDpMin(assignments.find((a) => a.assignment === assignment), duration)))
    }
  }, [assignment, assignments, duration, dpMinTouched])

  const addCrew = (id: string) => {
    const trimmed = id.trim().toUpperCase()
    if (!trimmed || selectedCrewIds.includes(trimmed)) return
    setSelectedCrewIds((prev) => [...prev, trimmed])
    setCrewInput('')
  }

  const removeCrew = (id: string) => {
    setSelectedCrewIds((prev) => prev.filter((c) => c !== id))
  }

  const airportSet = useMemo(() => new Set(airports.map((a) => a.airport)), [airports])
  const canEditCredit = !readOnly &&
    (mode === 'create' || (
      editItem?.pairingId === null &&
      editableCreditSources.has(String(editItem.source ?? '').toUpperCase())
    ))
  const creditDisplay = mode === 'edit'
    ? formatGroundTaskCredit(editItem?.actCreditedMinutes, editItem?.schCreditedMinutes)
    : '-'
  const creditPreview = formatGroundTaskCredit(credit, null)

  const validate = (): string | null => {
    if (mode === 'create' && selectedCrewIds.length === 0) return 'Select at least one crew member'
    if (!assignment) return 'Assignment is required'
    if (!depArp) return 'Dep Arp is required'
    if (!arvArp) return 'Arv Arp is required'
    if (airports.length > 0 && !airportSet.has(depArp)) return 'Dep Arp must be a valid airport'
    if (airports.length > 0 && !airportSet.has(arvArp)) return 'Arv Arp must be a valid airport'
    if (!startDate || !startTime) return 'Start date and time are required'
    if (!endDate || !endTime) return 'End date and time are required'
    if (canEditCredit && credit.trim() && normalizedCreditInput(credit) == null) return 'Credit must be a non-negative number of minutes'
    if (!readOnly && dpMin.trim() && (!/^\d+$/.test(dpMin.trim()) || Number(dpMin) < 0)) return 'DP Min must be a non-negative number of minutes'
    if (duration === 'warn') return 'End must be after start'
    return null
  }

  const handleSubmit = async () => {
    if (readOnly) return
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true)
    setError(null)
    try {
      const tz = useTimezoneStore.getState().timezone
      if (mode === 'create') {
        const fixedCreditMin = assignmentFixedCredit(assignments.find((a) => a.assignment === assignment))
        const normalizedCredit = normalizedCreditInput(credit)
        await addGroundTask('main', {
          crewIds: selectedCrewIds,
          assignment,
          depArp,
          arvArp,
          startDtUtc: localToUtc(startDate, startTime, tz),
          endDtUtc: localToUtc(endDate, endTime, tz),
          comments: remark || undefined,
          creditMin: normalizedCredit == null ? null : Number(normalizedCredit),
          fixedCreditMin,
          dpMin: dpMin.trim() ? Number(dpMin) : null,
        })
        close()
      } else if (editItem) {
        const normalizedCredit = canEditCredit ? normalizedCreditInput(credit) : undefined
        await updateTask('main', editItem.id, {
          assignment,
          assignmentGroup,
          base: depArp,
          depArp,
          arvArp,
          ...(canEditCredit
            ? { schCreditedMinutes: normalizedCredit, actCreditedMinutes: normalizedCredit }
            : {}),
          dpMin: dpMin.trim() ? Number(dpMin) : null,
          schStrDtUtc: localToUtc(startDate, startTime, tz),
          schEndDtUtc: localToUtc(endDate, endTime, tz),
          comments: remark || undefined,
        })
        close()
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (viewOnly || !editItem) return
    if (!window.confirm('Delete this ground task? This cannot be undone.')) return
    setSaving(true)
    try {
      await removeTask('main', editItem.id)
      close()
    } catch (e) {
      setError((e as Error).message ?? 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const dialogTitle =
    readOnly ? 'Ground Task' : mode === 'create' ? 'Create Ground Task' : 'Edit Ground Task'

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next && !saving) close() }}
      data-testid="ground-task-dialog"
      className="sm:max-w-[500px]"
      icon={<SquarePlus className="h-4 w-4" />}
      dismissable={!saving}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{dialogTitle}</span>
          {mode === 'edit' && editItem && (
            <Badge variant="outline" className="text-2xs border-primary-foreground/40 text-primary-foreground">
              #{editItem.id}
            </Badge>
          )}
          {readOnly && (
            <Badge
              variant="outline"
              className="text-2xs border-primary-foreground/40 text-primary-foreground"
              data-testid="ground-task-view-only"
            >
              View only
            </Badge>
          )}
        </span>
      }
      footer={
        <>
          {mode === 'create' && selectedCrewIds.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              Will create <strong>{selectedCrewIds.length}</strong> roster{' '}
              {selectedCrewIds.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={close} className="text-xs">
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-xs" data-testid="ground-task-save-btn">
              {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3">
            {/* Crew */}
            <div className="grid grid-cols-[110px_1fr] items-start gap-2">
              <label className="pt-1.5 text-xs text-muted-foreground">
                {mode === 'create' ? 'Crew IDs *' : 'Crew ID'}
              </label>
              {mode === 'edit' ? (
                <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs">
                  <span className="font-mono font-semibold">{editItem?.crewId}</span>
                  <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                </div>
              ) : (
                <div className="rounded-md border border-input bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-ring">
                  <div className="flex flex-wrap gap-1">
                    {selectedCrewIds.map((id) => (
                      <span key={id} className="flex items-center gap-1 rounded bg-accent/60 px-1.5 py-0.5 text-2xs font-mono">
                        {id}
                        <button onClick={() => removeCrew(id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <input
                      className="min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      placeholder="Type ID, press Enter…"
                      value={crewInput}
                      onChange={(e) => setCrewInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addCrew(crewInput) }
                        if (e.key === ',' || e.key === ' ') { e.preventDefault(); addCrew(crewInput) }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Ground task locations */}
            <div className="grid grid-cols-[110px_1fr] items-center gap-2">
              <label className="text-xs text-muted-foreground">Dep Arp *</label>
              {readOnly ? (
                <div
                  className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs"
                  data-testid="ground-task-dep-arp"
                >
                  <span className="font-mono font-semibold text-foreground">{depArp || '—'}</span>
                  <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                </div>
              ) : (
                <AirportInput value={depArp} onChange={setDepArp} options={airports} testId="ground-task-dep-arp" />
              )}
            </div>

            <div className="grid grid-cols-[110px_1fr] items-center gap-2">
              <label className="text-xs text-muted-foreground">Arv Arp *</label>
              {readOnly ? (
                <div
                  className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs"
                  data-testid="ground-task-arv-arp"
                >
                  <span className="font-mono font-semibold text-foreground">{arvArp || '—'}</span>
                  <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                </div>
              ) : (
                <AirportInput value={arvArp} onChange={setArvArp} options={airports} testId="ground-task-arv-arp" />
              )}
            </div>

            {/* Assignment */}
            <div className="grid grid-cols-[110px_1fr] items-center gap-2">
              <label className="text-xs text-muted-foreground">Assignment *</label>
              {readOnly ? (
                <div
                  className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs"
                  data-testid="ground-task-assignment"
                >
                  <span className="font-mono font-semibold text-foreground">{assignment || '—'}</span>
                  {assignmentGroup && (
                    <span className="text-2xs text-muted-foreground">{assignmentGroup}</span>
                  )}
                  <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                </div>
              ) : (
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  value={assignment}
                  onChange={(e) => handleAssignmentChange(e.target.value)}
                  data-testid="ground-task-assignment"
                >
                  <option value="">Select assignment…</option>
                  {assignments.map((a) => (
                    <option key={a.assignment} value={a.assignment}>
                      {a.assignment} — {a.description}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Assignment Group (auto-fill) */}
            {assignmentGroup && (
              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <label className="text-xs text-muted-foreground">Group</label>
                <div className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{assignmentGroup}</span>
                  <span className="text-2xs">auto-filled</span>
                </div>
              </div>
            )}

            {/* Credit */}
            {(mode === 'create' || mode === 'edit') && (
              <div
                className="grid grid-cols-[110px_1fr] items-center gap-2"
                data-testid="ground-task-credit-row"
              >
                <label className="text-xs text-muted-foreground">Credit</label>
                {canEditCredit ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="h-8 w-28 text-right font-mono text-xs"
                      value={credit}
                      onChange={(e) => setCredit(e.target.value)}
                      data-testid="ground-task-credit-input"
                    />
                    <span className="text-xs font-mono tabular-nums text-muted-foreground" data-testid="ground-task-credit-value">
                      {creditPreview}
                    </span>
                  </div>
                ) : (
                  <div className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                    <span
                      className="font-mono font-semibold tabular-nums text-foreground"
                      data-testid="ground-task-credit-value"
                    >
                      {creditDisplay}
                    </span>
                    <span className="text-2xs">read-only</span>
                    <Lock className="ml-auto h-3 w-3 text-muted-foreground/60" />
                  </div>
                )}
              </div>
            )}

            {/* Start */}
            <div className="grid grid-cols-[110px_1fr] items-center gap-2">
              <label className="text-xs text-muted-foreground">Start *</label>
              <div className="flex items-center gap-1.5">
                <GanttEnglishDatePicker ariaLabel="Ground task start date" className="flex-1" buttonClassName="h-8 w-full" value={startDate} onValueChange={setStartDate} disabled={readOnly} testId="ground-task-start-date" />
                <Input type="time" className="h-8 w-24 text-center font-mono text-xs" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={readOnly} data-testid="ground-task-start-time" />
                <span className="text-2xs font-mono text-primary/70">{timezoneAirport}</span>
              </div>
            </div>

            {/* DP minutes */}
            <div className="grid grid-cols-[110px_1fr] items-center gap-2" data-testid="ground-task-dp-min-row">
              <label className="text-xs text-muted-foreground">DP Min</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 w-28 text-right font-mono text-xs"
                  value={dpMin}
                  onChange={(e) => { setDpMin(e.target.value); setDpMinTouched(true) }}
                  disabled={readOnly}
                  data-testid="ground-task-dp-min-input"
                />
                <span className="text-2xs text-muted-foreground">auto from Assignment, editable</span>
              </div>
            </div>

            {/* End */}
            <div className="grid grid-cols-[110px_1fr] items-start gap-2">
              <label className="pt-1.5 text-xs text-muted-foreground">End *</label>
              <div>
                <div className="flex items-center gap-1.5">
                  <GanttEnglishDatePicker ariaLabel="Ground task end date" className="flex-1" buttonClassName="h-8 w-full" value={endDate} onValueChange={setEndDate} disabled={readOnly} testId="ground-task-end-date" />
                  <Input type="time" className="h-8 w-24 text-center font-mono text-xs" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={readOnly} data-testid="ground-task-end-time" />
                  <span className="text-2xs font-mono text-primary/70">{timezoneAirport}</span>
                </div>
                {duration && duration !== 'warn' && (
                  <p className="mt-1 text-xs text-green-500">✓ Duration: {duration}</p>
                )}
                {duration === 'warn' && (
                  <p className="mt-1 text-xs text-amber-500">⚠ End must be after start</p>
                )}
              </div>
            </div>

            {/* Remark */}
            <div className="grid grid-cols-[110px_1fr] items-start gap-2">
              <label className="pt-1.5 text-xs text-muted-foreground">Remark</label>
              <textarea
                className="min-h-[52px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                placeholder="Optional notes…"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

      {(!readOnly || isImp) && mode === 'edit' && editItem?.pairingId === null && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-2xs uppercase tracking-widest text-muted-foreground">Danger Zone</p>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving} className="text-xs" data-testid="ground-task-delete-btn">
            Delete This Task
          </Button>
        </div>
      )}
    </AppDialog>
  )
}
