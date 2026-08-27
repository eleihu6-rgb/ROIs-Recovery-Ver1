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

const LockedBadge = () => (
  <span className="text-xs text-muted-foreground ml-1" title="Locked to flight schedule">&#x1F512;</span>
)
const LinkedBadge = () => (
  <span className="text-xs text-blue-400 ml-1" title="Linked — shifts adjacent node">&#x27F3;</span>
)

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
    onChange,
  }: {
    label: string
    value: Date
    locked?: boolean
    linked?: boolean
    onChange?: (field: 'date' | 'time', val: string) => void
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground flex items-center">
        {label}
        {locked && <LockedBadge />}
        {linked && <LinkedBadge />}
      </label>
      <div className="flex gap-1">
        <GanttEnglishDatePicker
          ariaLabel={`${label} date`}
          buttonClassName="h-8 w-32 border rounded px-2 py-1 text-sm"
          value={utcToLocalDate(value.toISOString(), tz)}
          disabled={locked}
          onValueChange={(nextValue) => onChange?.('date', nextValue)}
        />
        <input
          type="time"
          className="border rounded px-2 py-1 text-sm bg-background text-foreground w-24 disabled:opacity-50"
          value={utcToLocalTime(value.toISOString(), tz)}
          disabled={locked}
          onChange={(e) => onChange?.('time', e.target.value)}
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

      {/* Sign-in section */}
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Brief Start"
          value={briefStart}
          linked
          onChange={handleDateTimeChange(onBriefStartChange, briefStart)}
        />
        <TimeInput
          label="Brief End"
          value={briefEnd}
          locked
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          label="Pickup Start"
          value={pickupStart}
          onChange={handleDateTimeChange(onPickupStartChange, pickupStart)}
        />
        <div className="text-xs text-muted-foreground self-end pb-2">
          Pickup: {fmtDuration(pickupStart, briefStart)}
        </div>
      </div>

      {!isValid && (
        <div className="text-xs text-destructive">Brief Start must be before flight departure</div>
      )}

      {/* Sign-out section */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <TimeInput
          label="Debrief Start"
          value={debriefStart}
          locked
        />
        <TimeInput
          label="Debrief End"
          value={debriefEnd}
          linked
          onChange={handleDateTimeChange(onDebriefEndChange, debriefEnd)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-xs text-muted-foreground self-end pb-2">
          Dropoff: {fmtDuration(debriefEnd, dropoffEnd)}
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
