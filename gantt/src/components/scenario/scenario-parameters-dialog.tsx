import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { AppDialog, Button, Input } from '@rois/ui'

import { scenarioApi } from '@/services/scenario-api'
import type { ScenarioDetail, ScenarioParameterItem, ScenarioParameterSaveRequest } from '@/types'
import { MinReserveCoverageEditor, TeamRulesEditor } from './scenario-parameter-editors'

interface ScenarioParametersDialogProps {
  scenarioId: number
  scenarioDetail?: ScenarioDetail
  division?: string | null
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  draftItems?: ScenarioParameterSaveRequest['items']
  onDraftChange?: (items: ScenarioParameterSaveRequest['items'], summary: ParameterSummary) => void
  onLoaded?: (summary: ParameterSummary) => void
}

export interface ParameterSummary {
  changedCodes: string[]
  changedLabels: string[]
}

interface FieldSchema {
  type?: string
  label?: string
  optional?: boolean
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const fieldSchema = (value: unknown): Record<string, FieldSchema> => asRecord(value) as Record<string, FieldSchema>

const fieldLabel = (field: string, schema: FieldSchema): string => schema.label ?? field

const valueAsString = (value: unknown): string => value == null ? '' : String(value)

const PARAM_TABS = [
  { code: 'credit_range', label: 'Credit Range' },
  { code: 'floor_rescue_rules', label: 'Floor Rescue' },
  { code: 'reserve_weekday_priority', label: 'Reserve Priority' },
  { code: 'min_reserve_covered_pct', label: 'Min Reserve Coverage %' },
  { code: 'day_pressure_spread', label: 'Day Pressure Spread' },
  { code: 'team_rules', label: 'Team Rules' },
  { code: 'crew_bids', label: 'Crew Bid' },
] as const

const CREDIT_RANKS = ['CA', 'FO', 'IFD', 'FA'] as const
const CREDIT_DEFAULTS = {
  min: { CA: 75, FO: 80, IFD: 80, FA: 80 },
  max: { CA: 92, FO: 85, IFD: 85, FA: 85 },
} as const
const CREDIT_RANKS_BY_DIVISION: Record<string, readonly string[]> = {
  P: ['CA', 'FO'],
  C: ['IFD', 'FA'],
}
const WEEKDAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const
const FLOOR_RESCUE_PARAMS = [
  ['reserve_single_days', 'Single-Day Reserves', 'Assign a lone 1-day reserve when no adjacent reserve day is available.'],
  ['reserve_day_balance', 'Reserve AM/PM Day Balance', 'Assign rescue reserves without the AM/PM per-day balance throttle.'],
  ['avoid_pairing_bids', 'Avoid-Pairing Bids', 'Assign pairings the crew bid to avoid.'],
  ['requested_days_off', 'Requested Days Off', 'Assign work overlapping requested days off.'],
  ['avoid_reserve_bids', 'Avoid-Reserve Bids', 'Assign reserve to crews with an avoid-reserve bid.'],
  ['avoid_reserve_line_rules', 'Avoid-Type Reserve Line Rules', 'Override avoid-type reserve line rules.'],
  ['award_reserve_and_commuter_blocks', 'Award-Type Reserve & Commuter Blocks', 'Bypass award-type reserve restrictions or commuter pattern blocks.'],
  ['min_base_layover_bids', 'Min Base Layover Bids', "Bypass a crew's Min Base Layover bid as a last resort."],
] as const

const numberOrNull = (raw: string): number | null => {
  if (!raw.trim()) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const valuesEqual = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

const DAY_SHORT: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

/** Renders the current algorithm default as "Thu/Fri/Sat 1, Mon/Sun 2, ..." (ascending priority). */
export const formatReservePriorityDefault = (defaultValue: unknown): string => {
  const value = asRecord(defaultValue)
  const byPriority = new Map<number, string[]>()
  for (const [key] of WEEKDAYS) {
    const n = Number(value[key])
    if (!Number.isInteger(n) || n < 1 || n > 9) continue
    const days = byPriority.get(n) ?? []
    days.push(DAY_SHORT[key])
    byPriority.set(n, days)
  }
  const parts = [...byPriority.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([priority, days]) => `${days.join('/')} ${priority}`)
  return `Algorithm default: ${parts.join(', ')}.`
}

export const summarizeParameters = (items: ScenarioParameterItem[]): ParameterSummary => {
  const changed = items.filter((item) => !valuesEqual(item.value, item.defaultValue))
  return {
    changedCodes: changed.map((item) => item.code),
    changedLabels: changed.map((item) => PARAM_TABS.find((tab) => tab.code === item.code)?.label ?? item.description ?? item.code),
  }
}

export const ScenarioParametersDialog = ({
  scenarioId,
  scenarioDetail,
  division,
  open,
  disabled = false,
  onOpenChange,
  draftItems,
  onDraftChange,
  onLoaded,
}: ScenarioParametersDialogProps): ReactNode => {
  const [items, setItems] = useState<ScenarioParameterItem[]>([])
  const [activeCode, setActiveCode] = useState<string>('credit_range')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    scenarioApi
      .getParameters(scenarioId)
      .then((result) => {
        if (!active) return
        const draftByCode = new Map((draftItems ?? []).map((item) => [item.code, item.value]))
        const mergedItems = result.items.map((item) => draftByCode.has(item.code)
          ? { ...item, value: draftByCode.get(item.code) }
          : item)
        setItems(mergedItems)
        setActiveCode(result.items[0]?.code ?? 'credit_range')
        onLoaded?.(summarizeParameters(mergedItems))
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load parameters')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, scenarioId])

  const updateObjField = (code: string, field: string, rawValue: string | boolean, type: string): void => {
    setItems((current) => current.map((item) => {
      if (item.code !== code) return item
      const currentValue = asRecord(item.value)
      const nextValue =
        type === 'number' ? Number(rawValue) :
        type === 'boolean' ? Boolean(rawValue) :
        String(rawValue)
      return { ...item, value: { ...currentValue, [field]: nextValue } }
    }))
  }

  const updateListCsv = (code: string, csv: string): void => {
    setItems((current) => current.map((item) => (
      item.code === code ? { ...item, value: { csv } } : item
    )))
  }

  const handleComplete = (): void => {
    const summary = summarizeParameters(items)
    onDraftChange?.(items.map((item) => ({ code: item.code, value: item.value })), summary)
    onOpenChange(false)
  }

  const updateValue = (code: string, nextValue: unknown): void => {
    setItems((current) => current.map((item) => (
      item.code === code ? { ...item, value: nextValue } : item
    )))
  }

  const updateCredit = (code: string, side: 'min' | 'max', rank: string, raw: string): void => {
    const item = items.find((it) => it.code === code)
    const value = asRecord(item?.value)
    const sideValue = asRecord(value[side])
    updateValue(code, { ...value, [side]: { ...sideValue, [rank]: numberOrNull(raw) } })
  }

  const divisionCode = String(division ?? '').trim().toUpperCase()
  const creditRanks = CREDIT_RANKS_BY_DIVISION[divisionCode]
    ?? CREDIT_RANKS_BY_DIVISION[divisionCode.startsWith('P') ? 'P' : divisionCode.startsWith('C') ? 'C' : 'P']
    ?? CREDIT_RANKS_BY_DIVISION.P

  const renderCreditRange = (item: ScenarioParameterItem): ReactNode => {
    const value = asRecord(item.value)
    const min = asRecord(value.min)
    const max = asRecord(value.max)
    return (
      <div className="space-y-3">
        <div className="font-semibold text-xs text-foreground">Credit Range (hours)</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Per-rank monthly credit floor the solver fills each crew up to, and ceiling it never
          exceeds. Leave a field blank to use the experiment default (
          {creditRanks.map((rank) => `${rank} ${CREDIT_DEFAULTS.min[rank as keyof typeof CREDIT_DEFAULTS.min]}–${CREDIT_DEFAULTS.max[rank as keyof typeof CREDIT_DEFAULTS.max]}`).join(' / ')}).
        </p>
        <div className="grid grid-cols-[4rem_repeat(2,minmax(0,1fr))] gap-2 text-xs">
          <div />
          <div className="font-semibold text-muted-foreground">Min</div>
          <div className="font-semibold text-muted-foreground">Max</div>
          {creditRanks.map((rank) => (
            <Fragment key={rank}>
              <div key={`${rank}-label`} className="py-1 font-semibold text-foreground">{rank}</div>
              <span className="flex items-center gap-1">
                <Input
                  key={`${rank}-min`}
                  aria-label={`${rank} credit min hours`}
                  type="number"
                  min={1}
                  max={200}
                  step={0.5}
                  className="h-7 text-xs"
                  placeholder={String(CREDIT_DEFAULTS.min[rank as keyof typeof CREDIT_DEFAULTS.min])}
                  value={valueAsString(min[rank])}
                  disabled={disabled || saving}
                  onChange={(event) => updateCredit(item.code, 'min', rank, event.target.value)}
                />
                <span className="text-muted-foreground">h</span>
              </span>
              <span className="flex items-center gap-1">
                <Input
                  key={`${rank}-max`}
                  aria-label={`${rank} credit max hours`}
                  type="number"
                  min={1}
                  max={200}
                  step={0.5}
                  className="h-7 text-xs"
                  placeholder={String(CREDIT_DEFAULTS.max[rank as keyof typeof CREDIT_DEFAULTS.max])}
                  value={valueAsString(max[rank])}
                  disabled={disabled || saving}
                  onChange={(event) => updateCredit(item.code, 'max', rank, event.target.value)}
                />
                <span className="text-muted-foreground">h</span>
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }

  const renderFloorRescue = (item: ScenarioParameterItem): ReactNode => {
    const value = asRecord(item.value)
    return (
      <div className="space-y-2">
        <div className="font-semibold text-xs text-foreground">Floor Rescue</div>
        <div className="overflow-hidden rounded border border-border">
        <div className="grid grid-cols-[minmax(10rem,0.8fr)_4rem_minmax(0,1.4fr)] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-2xs font-semibold text-muted-foreground">
          <span>Parameter</span>
          <span>Enabled</span>
          <span>Description</span>
        </div>
        {FLOOR_RESCUE_PARAMS.map(([key, label, description]) => (
          <label key={key} className="grid grid-cols-[minmax(10rem,0.8fr)_4rem_minmax(0,1.4fr)] items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0">
            <span className="font-medium text-foreground">{label}</span>
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border accent-primary"
              checked={Boolean(value[key])}
              disabled={disabled || saving}
              onChange={(event) => updateValue(item.code, { ...value, [key]: event.target.checked })}
            />
            <span className="text-muted-foreground">{description}</span>
          </label>
        ))}
        </div>
      </div>
    )
  }

  const renderReservePriority = (item: ScenarioParameterItem): ReactNode => {
    const value = asRecord(item.value)
    return (
      <div className="space-y-2">
        <div className="font-semibold text-xs text-foreground">Reserve Priority (by weekday)</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          1 = highest priority; reserves on higher-priority weekdays are covered first.{' '}
          {formatReservePriorityDefault(item.defaultValue)}
        </p>
        <div className="flex flex-col gap-2 text-xs">
        {WEEKDAYS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="w-24 text-muted-foreground">{label}</span>
            <Input
              aria-label={`${label} reserve priority`}
              type="number"
              min={1}
              max={9}
              step={1}
              className="h-7 w-20 text-xs"
              value={valueAsString(value[key])}
              disabled={disabled || saving}
              onChange={(event) => updateValue(item.code, { ...value, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        </div>
      </div>
    )
  }

  const renderMinReserveCoverage = (item: ScenarioParameterItem): ReactNode => {
    return (
      <MinReserveCoverageEditor
        value={item.value}
        disabled={disabled}
        saving={saving}
        onChange={(value) => updateValue(item.code, value)}
      />
    )
  }

  const renderDayPressure = (item: ScenarioParameterItem): ReactNode => {
    const value = asRecord(item.value)
    return (
      <div className="space-y-2">
        <div className="font-semibold text-xs text-foreground">Day Pressure Spread</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          When the month is over-subscribed, spread uncovered pairings and reserves evenly across
          the month instead of clustering them at month-end. Acts only as a tie-break below bid
          scores, so award/avoid preferences keep priority. Off = algorithm default (legacy
          ordering).
        </p>
        <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border accent-primary"
          checked={value.enabled === true}
          disabled={disabled || saving}
          onChange={(event) => updateValue(item.code, { enabled: event.target.checked })}
        />
        <span>Enabled</span>
        </label>
      </div>
    )
  }

  const renderCrewBids = (item: ScenarioParameterItem): ReactNode => {
    const value = asRecord(item.value)
    return (
      <div className="space-y-2">
        <div className="font-semibold text-xs text-foreground">Crew Bid</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Include crew bids when preparing this optimization. Disable this option to skip crew-bid extraction and send no crew-bid preference data to the RO solver.
        </p>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-primary"
            checked={value.enabled !== false}
            disabled={disabled || saving}
            onChange={(event) => updateValue(item.code, { enabled: event.target.checked })}
          />
          <span>Include crew bids in this optimization</span>
        </label>
      </div>
    )
  }

  const renderTeamRules = (item: ScenarioParameterItem): ReactNode => (
    <TeamRulesEditor
      value={item.value}
      scenarioDetail={scenarioDetail}
      disabled={disabled}
      saving={saving}
      onChange={(value) => updateValue(item.code, value)}
    />
  )

  const renderSpecialEditor = (item: ScenarioParameterItem): ReactNode | null => {
    if (item.code === 'credit_range') return renderCreditRange(item)
    if (item.code === 'floor_rescue_rules') return renderFloorRescue(item)
    if (item.code === 'reserve_weekday_priority') return renderReservePriority(item)
    if (item.code === 'min_reserve_covered_pct') return renderMinReserveCoverage(item)
    if (item.code === 'day_pressure_spread') return renderDayPressure(item)
    if (item.code === 'team_rules') return renderTeamRules(item)
    if (item.code === 'crew_bids') return renderCrewBids(item)
    return null
  }

  const orderedItems = useMemo(() => {
    const byCode = new Map(items.map((item) => [item.code, item]))
    const known = PARAM_TABS.map((tab) => byCode.get(tab.code)).filter(Boolean) as ScenarioParameterItem[]
    const extra = items.filter((item) => !PARAM_TABS.some((tab) => tab.code === item.code))
    return [...known, ...extra]
  }, [items])
  const activeItem = orderedItems.find((item) => item.code === activeCode) ?? orderedItems[0]

  const renderObjEditor = (item: ScenarioParameterItem): ReactNode => {
    const schema = fieldSchema(item.schema)
    const value = asRecord(item.value)
    return (
      <div className="space-y-2">
        {Object.entries(schema).map(([field, def]) => {
          const label = fieldLabel(field, def)
          const type = def.type ?? 'string'
          if (type === 'boolean') {
            return (
              <label key={field} className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={Boolean(value[field])}
                  disabled={disabled || saving}
                  onChange={(event) => updateObjField(item.code, field, event.target.checked, type)}
                />
                <span>{label}</span>
              </label>
            )
          }
          return (
            <label key={field} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <Input
                aria-label={label}
                type={type === 'number' ? 'number' : 'text'}
                className="h-7 text-xs"
                value={valueAsString(value[field])}
                disabled={disabled || saving}
                onChange={(event) => updateObjField(item.code, field, event.target.value, type)}
              />
            </label>
          )
        })}
      </div>
    )
  }

  const renderListEditor = (item: ScenarioParameterItem): ReactNode => {
    const schema = asRecord(item.schema)
    const label = typeof schema.label === 'string' ? schema.label : item.code
    const value = asRecord(item.value)
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <textarea
          aria-label={label}
          className="min-h-24 resize-y rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          value={valueAsString(value.csv)}
          disabled={disabled || saving}
          onChange={(event) => updateListCsv(item.code, event.target.value)}
        />
      </label>
    )
  }

  const footer = disabled ? (
    <Button type="button" variant="outline" data-action="close" onClick={() => onOpenChange(false)}>
      Close
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
        Cancel
      </Button>
      <Button type="button" data-action="done" onClick={handleComplete} disabled={loading || saving}>
        Done
      </Button>
    </>
  )

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Algorithm Parameters"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      data-testid="scenario-parameters-dialog"
      className="sm:max-w-[960px]"
      footer={footer}
    >
      <div className="max-h-[80vh] space-y-3 overflow-y-auto py-1">
        {loading && <div className="text-xs text-muted-foreground">Loading...</div>}
        {error && <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
        {!loading && !error && orderedItems.length === 0 && (
          <div className="text-xs text-muted-foreground">No parameters are configured.</div>
        )}
        {!loading && !error && orderedItems.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1 border-b border-border">
              {orderedItems.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={[
                    'border-b-2 px-3 py-2 text-xs font-semibold',
                    activeItem?.code === item.code ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
                  ].join(' ')}
                  onClick={() => setActiveCode(item.code)}
                >
                  {PARAM_TABS.find((tab) => tab.code === item.code)?.label ?? item.description ?? item.code}
                </button>
              ))}
            </div>
            {activeItem && (
              <section className="rounded border border-border bg-background p-3">
                {renderSpecialEditor(activeItem) ?? (activeItem.type === 'LIST' ? renderListEditor(activeItem) : renderObjEditor(activeItem))}
              </section>
            )}
          </>
        )}
      </div>
    </AppDialog>
  )
}
