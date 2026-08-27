import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Pencil, RefreshCw, Settings2 } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@rois/ui'
import { notify } from '@/utils/notify'
import {
  fetchPbsBidDefinitions,
  savePbsCreditWindowDefinition,
  savePbsEfficientFlyingPercentileDefinition,
  savePbsMinimumBaseLayoverDefinition,
  savePbsMinimumTimeBetweenFlightsDefinition,
  savePbsRedeyeDefinition,
  savePbsWeekendDefinition,
  type PbsBidDefinition,
  type PbsBidDefinitionWeekday,
} from '@/services/pbs-bid-definitions-api'
import { getHttpErrorStatus } from '@/services/http-client'

type EditValues = {
  startTime: string
  endTime: string
  startDayCode: string
  endDayCode: string
  deltaHours: string
  minDuration: string
  minimumTimeBetweenFlights: string
  percentile: string
}

const formatDurationCompact = (value: string): string => {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/)
  return match ? `${Number.parseInt(match[1] ?? '0', 10)}:${match[2]}` : value.trim()
}

const formatMinutesDuration = (value: number): string => {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const parseMinutesDuration = (value: string): number | null => {
  const match = value.trim().match(/^(\d{2,3}):([0-5]\d)$/)
  if (!match) return null
  const minutes = Number.parseInt(match[1] ?? '0', 10) * 60 + Number.parseInt(match[2] ?? '0', 10)
  return Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 59_999 ? minutes : null
}

const valuesForDefinition = (definition: PbsBidDefinition): EditValues => {
  if (definition.code === 'redeye' && definition.value.available) {
    return {
      startTime: definition.value.startTime,
      endTime: definition.value.endTime,
      startDayCode: '',
      endDayCode: '',
      deltaHours: '',
      minDuration: '',
      minimumTimeBetweenFlights: '',
      percentile: '',
    }
  }
  if (definition.code === 'weekend' && definition.value.available) {
    return {
      startTime: definition.value.startTime,
      endTime: definition.value.endTime,
      startDayCode: definition.value.startDayCode,
      endDayCode: definition.value.endDayCode,
      deltaHours: '',
      minDuration: '',
      minimumTimeBetweenFlights: '',
      percentile: '',
    }
  }
  return {
    startTime: '',
    endTime: '',
    startDayCode: '',
    endDayCode: '',
    deltaHours: definition.code === 'credit-window' && definition.value.available
      ? String(definition.value.deltaHours)
      : '',
    minDuration: definition.code === 'minimum-base-layover' && definition.value.available
      ? formatDurationCompact(definition.value.minDuration)
      : '',
    minimumTimeBetweenFlights: definition.code === 'minimum-time-between-flights' && definition.value.available
      ? formatMinutesDuration(definition.value.minimumMinutes)
      : '',
    percentile: definition.code === 'efficient-flying-percentile' && definition.value.available
      ? String(definition.value.percentile)
      : '',
  }
}

const formatUpdatedAt = (value: string | null): string => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const DefinitionDialog = ({
  definition,
  weekdays,
  onOpenChange,
  onSaved,
}: {
  definition: PbsBidDefinition | null
  weekdays: PbsBidDefinitionWeekday[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): ReactNode => {
  const [values, setValues] = useState<EditValues>(() => definition
    ? valuesForDefinition(definition)
    : valuesForDefinition({
      code: 'redeye', name: '', displayValue: '', description: '', updatedBy: '', updatedAt: null, value: { available: false },
    }))
  const [saving, setSaving] = useState(false)
  const [minimumDurationError, setMinimumDurationError] = useState<string | null>(null)
  const [percentileError, setPercentileError] = useState<string | null>(null)
  const [definitionError, setDefinitionError] = useState<string | null>(null)

  useEffect(() => {
    if (definition) {
      setValues(valuesForDefinition(definition))
      setMinimumDurationError(null)
      setPercentileError(null)
      setDefinitionError(null)
    }
  }, [definition])

  if (!definition) return null

  const setValue = (key: keyof EditValues, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === 'minDuration' || key === 'minimumTimeBetweenFlights') setMinimumDurationError(null)
    if (key === 'percentile') setPercentileError(null)
    setDefinitionError(null)
  }

  const save = async (): Promise<void> => {
    if (definition.code === 'redeye' && (!values.startTime || !values.endTime || values.startTime === values.endTime)) {
      notify.error('Start and end time must be different')
      return
    }
    if (definition.code === 'weekend' && (!values.startDayCode || !values.endDayCode || !values.startTime || !values.endTime)) {
      notify.error('Weekend start and end are required')
      return
    }
    const deltaHours = Number(values.deltaHours)
    if (definition.code === 'credit-window' && (!Number.isInteger(deltaHours) || deltaHours < 1 || deltaHours > 20)) {
      notify.error('Credit Window must be an integer from 1 to 20')
      return
    }
    if (definition.code === 'minimum-base-layover') {
      const match = values.minDuration.trim().match(/^(\d{1,3}):([0-5]\d)$/)
      const durationMinutes = match
        ? Number.parseInt(match[1] ?? '0', 10) * 60 + Number.parseInt(match[2] ?? '0', 10)
        : 0
      if (!match || durationMinutes <= 0) {
        setMinimumDurationError('Enter a positive duration in HH:MM format.')
        return
      }
    }
    const minimumTimeBetweenFlightsMinutes = parseMinutesDuration(values.minimumTimeBetweenFlights)
    if (definition.code === 'minimum-time-between-flights' && minimumTimeBetweenFlightsMinutes === null) {
      setMinimumDurationError('Enter a positive duration from 00:01 to 999:59.')
      return
    }
    const percentile = Number(values.percentile)
    if (definition.code === 'efficient-flying-percentile'
      && (!Number.isInteger(percentile) || percentile < 1 || percentile > 50)) {
      setPercentileError('Enter a whole number from 1 to 50.')
      return
    }

    setSaving(true)
    try {
      if (definition.code === 'redeye') {
        await savePbsRedeyeDefinition({ startTime: values.startTime, endTime: values.endTime })
      } else if (definition.code === 'weekend') {
        await savePbsWeekendDefinition({
          startDayCode: values.startDayCode,
          startTime: values.startTime,
          endDayCode: values.endDayCode,
          endTime: values.endTime,
        })
      } else if (definition.code === 'credit-window') {
        await savePbsCreditWindowDefinition({ deltaHours })
      } else if (definition.code === 'minimum-base-layover') {
        await savePbsMinimumBaseLayoverDefinition({ minDuration: values.minDuration.trim() })
      } else if (definition.code === 'minimum-time-between-flights') {
        await savePbsMinimumTimeBetweenFlightsDefinition({
          minimumMinutes: minimumTimeBetweenFlightsMinutes ?? 0,
        })
      } else {
        await savePbsEfficientFlyingPercentileDefinition({ percentile })
      }
      notify.success(`${definition.name} definition saved`)
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      const status = getHttpErrorStatus(caught)
      if (definition.code === 'efficient-flying-percentile' && status === 400) {
        setPercentileError('Enter a whole number from 1 to 50.')
      } else if (definition.code === 'minimum-time-between-flights' && status === 400) {
        setMinimumDurationError('Enter a positive duration from 00:01 to 999:59.')
      } else if (definition.code === 'minimum-time-between-flights' && status === 409) {
        setDefinitionError('This definition is unavailable. Reload the definitions and try again.')
      } else {
        notify.error(`Failed to save ${definition.name}. Please try again.`)
      }
    } finally {
      setSaving(false)
    }
  }

  const timeField = (label: string, key: 'startTime' | 'endTime', allowEndOfDay = false) => (
    <label className="space-y-1 text-xs font-medium text-foreground">
      <span>{label}</span>
      {allowEndOfDay ? (
        <Input
          data-testid={`pbs-definition-${key}`}
          value={values[key]}
          placeholder="HH:mm or 24:00"
          className="h-8 font-mono text-xs"
          onChange={(event) => setValue(key, event.target.value)}
        />
      ) : (
        <Input
          data-testid={`pbs-definition-${key}`}
          type="time"
          value={values[key]}
          className="h-8 text-xs"
          onChange={(event) => setValue(key, event.target.value)}
        />
      )}
    </label>
  )

  return (
    <AppDialog
      open
      onOpenChange={onOpenChange}
      data-testid="pbs-bid-definition-dialog"
      className="sm:max-w-[560px]"
      icon={<Settings2 className="h-4 w-4" />}
      title={`Edit ${definition.name}`}
      description={definition.description}
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="pbs-bid-definition-save" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {definitionError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground">
          <span>{definitionError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onSaved()
            }}
          >
            Reload
          </Button>
        </div>
      ) : null}
      {definition.code === 'redeye' && (
        <div className="grid grid-cols-2 gap-4 py-1">
          {timeField('Start Time', 'startTime')}
          {timeField('End Time', 'endTime')}
          <p className="col-span-2 text-xs text-muted-foreground">
            {values.startTime && values.endTime && values.endTime < values.startTime
              ? `${values.startTime}–${values.endTime} local time · Crosses midnight`
              : `${values.startTime || '—'}–${values.endTime || '—'} local time`}
          </p>
        </div>
      )}
      {definition.code === 'weekend' && (
        <div className="grid grid-cols-2 gap-4 py-1">
          <label className="space-y-1 text-xs font-medium text-foreground">
            <span>Start Day</span>
            <Select value={values.startDayCode} onValueChange={(value) => setValue('startDayCode', value)}>
              <SelectTrigger data-testid="pbs-definition-start-day" className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{weekdays.map((day) => <SelectItem key={day.code} value={day.code}>{day.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {timeField('Start Time', 'startTime')}
          <label className="space-y-1 text-xs font-medium text-foreground">
            <span>End Day</span>
            <Select value={values.endDayCode} onValueChange={(value) => setValue('endDayCode', value)}>
              <SelectTrigger data-testid="pbs-definition-end-day" className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{weekdays.map((day) => <SelectItem key={day.code} value={day.code}>{day.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {timeField('End Time', 'endTime', true)}
        </div>
      )}
      {definition.code === 'credit-window' && (
        <label className="block space-y-1 py-1 text-xs font-medium text-foreground">
          <span>Adjustment Hours</span>
          <Input
            data-testid="pbs-definition-delta-hours"
            type="number"
            min={1}
            max={20}
            value={values.deltaHours}
            className="h-8 text-xs"
            onChange={(event) => setValue('deltaHours', event.target.value)}
          />
        </label>
      )}
      {definition.code === 'minimum-base-layover' && (
        <label className="block space-y-1 py-1 text-xs font-medium text-foreground">
          <span>Minimum Duration</span>
          <Input
            data-testid="pbs-definition-minimum-duration"
            value={values.minDuration}
            placeholder="HH:MM"
            className="h-8 font-mono text-xs"
            aria-invalid={Boolean(minimumDurationError)}
            aria-describedby={minimumDurationError ? 'pbs-definition-minimum-duration-error' : undefined}
            onChange={(event) => setValue('minDuration', event.target.value)}
          />
          {minimumDurationError ? (
            <span
              id="pbs-definition-minimum-duration-error"
              role="alert"
              className="block text-2xs font-normal text-destructive"
            >
              {minimumDurationError}
            </span>
          ) : null}
        </label>
      )}
      {definition.code === 'minimum-time-between-flights' && (
        <label className="block space-y-1 py-1 text-xs font-medium text-foreground">
          <span>Minimum Duration</span>
          <Input
            data-testid="pbs-definition-minimum-time-between-flights"
            value={values.minimumTimeBetweenFlights}
            placeholder="HH:MM"
            className="h-8 font-mono text-xs"
            aria-invalid={Boolean(minimumDurationError)}
            aria-describedby={minimumDurationError ? 'pbs-definition-minimum-time-between-flights-error' : undefined}
            onChange={(event) => setValue('minimumTimeBetweenFlights', event.target.value)}
          />
          {minimumDurationError ? (
            <span
              id="pbs-definition-minimum-time-between-flights-error"
              role="alert"
              className="block text-2xs font-normal text-destructive"
            >
              {minimumDurationError}
            </span>
          ) : null}
        </label>
      )}
      {definition.code === 'efficient-flying-percentile' && (
        <label className="block space-y-1 py-1 text-xs font-medium text-foreground">
          <span>Percentile</span>
          <div className="relative">
            <Input
              data-testid="pbs-definition-efficient-flying-percentile"
              type="number"
              min={1}
              max={50}
              step={1}
              value={values.percentile}
              className="h-8 pr-8 text-xs"
              aria-invalid={Boolean(percentileError)}
              aria-describedby={percentileError ? 'pbs-definition-efficient-flying-percentile-error' : undefined}
              onChange={(event) => setValue('percentile', event.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
          </div>
          {percentileError ? (
            <span
              id="pbs-definition-efficient-flying-percentile-error"
              role="alert"
              className="block text-2xs font-normal text-destructive"
            >
              {percentileError}
            </span>
          ) : null}
          <span className="block text-2xs font-normal text-muted-foreground">
            Changes may take up to 30 seconds to appear in PBS searches and dialogs.
          </span>
        </label>
      )}
    </AppDialog>
  )
}

export const PbsBidDefinitionsView = (): ReactNode => {
  const [definitions, setDefinitions] = useState<PbsBidDefinition[]>([])
  const [weekdays, setWeekdays] = useState<PbsBidDefinitionWeekday[]>([])
  const [editing, setEditing] = useState<PbsBidDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetchPbsBidDefinitions()
      setDefinitions(response.rows)
      setWeekdays(response.weekdays)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Failed to load PBS Bid Definitions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background" data-testid="pbs-bid-definitions-view">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Bid Definitions</h1>
          <p className="text-2xs text-muted-foreground">Company definitions used by PBS bids and exports.</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loadError ? (
          <div role="alert" className="flex items-center justify-between rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Definition</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Updated By</TableHead>
                  <TableHead>Updated At</TableHead>
                  <TableHead className="w-14"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && definitions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-20 text-center text-xs text-muted-foreground">Loading definitions...</TableCell></TableRow>
                ) : definitions.map((definition) => (
                  <TableRow key={definition.code} data-testid={`pbs-definition-row-${definition.code}`}>
                    <TableCell className="text-xs font-semibold text-foreground">{definition.name}</TableCell>
                    <TableCell className="text-xs font-medium text-foreground">{definition.displayValue}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{definition.description}</TableCell>
                    <TableCell className="text-xs">{definition.updatedBy}</TableCell>
                    <TableCell className="text-xs tabular-nums">{formatUpdatedAt(definition.updatedAt)}</TableCell>
                    <TableCell>
                      <Button
                        data-testid={`pbs-definition-edit-${definition.code}`}
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${definition.name}`}
                        onClick={() => setEditing(definition)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <DefinitionDialog
        definition={editing}
        weekdays={weekdays}
        onOpenChange={(open) => { if (!open) setEditing(null) }}
        onSaved={() => void load()}
      />
    </div>
  )
}
