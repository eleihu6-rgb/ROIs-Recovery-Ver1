import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { useTimezoneStore } from '@/stores/timezone-store'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'

const localToUtc = (dateStr: string, timeStr: string, timezone: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute]     = timeStr.split(':').map(Number)
  const noonUtcMs = Date.UTC(year, month - 1, day, 12)
  const offsetMs  = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(noonUtcMs))
    .filter((p) => p.type === 'timeZoneName')
    .map((p) => {
      const m = p.value.match(/UTC([+-])(\d+):?(\d*)/)
      if (!m) return 0
      const sign = m[1] === '+' ? 1 : -1
      return sign * (Number(m[2]) * 60 + Number(m[3] || 0))
    })[0] ?? 0
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute)
  return new Date(localAsUtcMs - offsetMs * 60000).toISOString()
}

const utcToLocalDate = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(utcStr))

const utcToLocalTime = (utcStr: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utcStr))

const fmtDuration = (from: Date, to: Date): string => {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000)
  if (mins < 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m.toString().padStart(2, '0')}`
}

interface Props {
  blockLabel: string           // "Block 1" or "Block 2"
  pickupStart: Date
  briefStart:  Date
  briefEnd:    Date            // locked (from flight actStrDtUtc)
  debriefStart: Date           // locked (from flight actEndDtUtc)
  debriefEnd:  Date
  dropoffEnd:  Date
  validationError?: string

  onBriefStartChange:  (d: Date) => void  // linked change (cascades to pickupStart)
  onPickupStartChange: (d: Date) => void  // independent
  onDebriefEndChange:  (d: Date) => void  // linked change (cascades to dropoffEnd)
  onDropoffEndChange:  (d: Date) => void  // independent
}

const LockedBadge = ({ title }: { title?: string }) => (
  <span className="text-2xs text-muted-foreground ml-1" title={title ?? 'Locked to flight schedule'}>&#x1F512;</span>
)
const LinkedBadge = ({ title }: { title?: string }) => (
  <span className="text-2xs text-primary ml-1" title={title ?? 'Linked — shifts adjacent node'}>&#x27F3;</span>
)

/**
 * Wide, always-24-hour time field. Replaces native <input type="time">, whose
 * rendering follows the browser locale and shows AM/PM ("04:00" for 16:00) — the
 * item-4 bug. Accepts free-form "HHMM" / "H:MM" / "HH:MM", normalizes on commit
 * (blur / Enter), and reverts unparseable input.
 */
function Time24Input({
  value, disabled, ariaLabel, onCommit,
}: {
  value: string            // "HH:MM" in display tz
  disabled?: boolean
  ariaLabel: string
  onCommit: (hhmm: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    const m = draft.trim().match(/^(\d{1,2}):?(\d{2})$/)
    if (!m) { setDraft(value); return }
    const h = Math.min(23, Math.max(0, Number(m[1])))
    const mi = Math.min(59, Math.max(0, Number(m[2])))
    const norm = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
    setDraft(norm)
    if (norm !== value) onCommit(norm)
  }

  return (
    <div className={`flex h-8 w-24 items-center gap-1.5 rounded-md border px-2 tabular-nums
      ${disabled ? 'bg-muted/50 text-muted-foreground' : 'bg-background text-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'}`}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        className="w-full bg-transparent text-sm font-medium outline-none disabled:cursor-not-allowed"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function DutyNodeEditBlock({
  blockLabel,
  pickupStart, briefStart, briefEnd, debriefStart, debriefEnd, dropoffEnd,
  validationError,
  onBriefStartChange, onPickupStartChange, onDebriefEndChange, onDropoffEndChange,
}: Props) {
  const tz = useTimezoneStore((s) => s.timezone)

  const handleDateTimeChange = (
    handler: (d: Date) => void,
    currentDate: Date,
  ) => (field: 'date' | 'time', value: string) => {
    const dateStr = field === 'date' ? value : utcToLocalDate(currentDate.toISOString(), tz)
    const timeStr = field === 'time' ? value : utcToLocalTime(currentDate.toISOString(), tz)
    if (dateStr && timeStr) {
      handler(new Date(localToUtc(dateStr, timeStr, tz)))
    }
  }

  const TimeInput = ({
    label,
    value,
    locked,
    linked,
    lockTitle,
    linkTitle,
    onChange,
  }: {
    label: string
    value: Date
    locked?: boolean
    linked?: boolean
    lockTitle?: string
    linkTitle?: string
    onChange?: (field: 'date' | 'time', val: string) => void
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground flex items-center">
        {label}
        {locked && <LockedBadge title={lockTitle} />}
        {linked && <LinkedBadge title={linkTitle} />}
      </label>
      <div className="flex gap-1.5">
        <GanttEnglishDatePicker
          ariaLabel={`${label} date`}
          buttonClassName="h-8 min-w-[7.5rem] flex-1 rounded-md border px-2 text-sm"
          value={utcToLocalDate(value.toISOString(), tz)}
          disabled={locked}
          onValueChange={(nextValue) => onChange?.('date', nextValue)}
        />
        <Time24Input
          ariaLabel={`${label} time`}
          value={utcToLocalTime(value.toISOString(), tz)}
          disabled={locked}
          onCommit={(hhmm) => onChange?.('time', hhmm)}
        />
      </div>
    </div>
  )

  const isValid = briefStart < briefEnd && debriefStart <= debriefEnd

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {blockLabel}
      </div>

      {validationError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
          {validationError}
        </div>
      )}

      {/* Sign-in — event order: Pickup → Brief (flight departs at Brief End) */}
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Pickup Start"
          value={pickupStart}
          onChange={handleDateTimeChange(onPickupStartChange, pickupStart)}
        />
        <div className="text-xs text-muted-foreground self-end pb-2 font-mono">
          Pickup → Brief: {fmtDuration(pickupStart, briefStart)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Brief Start"
          value={briefStart}
          linked
          linkTitle="Linked — shifts Pickup with it"
          onChange={handleDateTimeChange(onBriefStartChange, briefStart)}
        />
        <TimeInput
          label="Brief End"
          value={briefEnd}
          locked
          lockTitle="Locked to scheduled departure (STD)"
        />
      </div>

      {!isValid && (
        <div className="text-xs text-destructive">Brief Start must be before scheduled departure</div>
      )}

      {/* Sign-out — event order: Debrief → Dropoff (flight arrives at Debrief Start) */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <TimeInput
          label="Debrief Start"
          value={debriefStart}
          locked
          lockTitle="Locked to actual arrival (ATA)"
        />
        <TimeInput
          label="Debrief End"
          value={debriefEnd}
          linked
          linkTitle="Linked — shifts Dropoff with it"
          onChange={handleDateTimeChange(onDebriefEndChange, debriefEnd)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-xs text-muted-foreground self-end pb-2 font-mono">
          Debrief → Dropoff: {fmtDuration(debriefEnd, dropoffEnd)}
        </div>
        <TimeInput
          label="Dropoff End"
          value={dropoffEnd}
          onChange={handleDateTimeChange(onDropoffEndChange, dropoffEnd)}
        />
      </div>
    </div>
  )
}
