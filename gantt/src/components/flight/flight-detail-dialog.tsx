import { useEffect, useState } from 'react'
import { Plane, Info, Link2, Pencil, Check, X as XIcon, Ban, RotateCcw } from 'lucide-react'
import { AppDialog, Button, Input, formatUiDate, formatUiDateTime } from '@rois/ui'
import { useUiStore } from '@/stores/ui-store'
import { useFlightStore } from '@/stores/flight-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { flightApi } from '@/services/flight-api'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import type { ScenarioGanttFlight } from '@/types/scenario-gantt'
import type { Flight, FlightCrewResponse } from '@/types'
import { parseISO } from 'date-fns'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import { localToUtc, utcToLocalDate, utcToLocalTime } from '@/components/roster/ground-task-dialog'
import { notify } from '@/utils/notify'
import { buildScenarioFlightCrew, mergeScenarioAndLiveFlightCrew } from './build-scenario-flight-crew'
import { deriveFlightOpsStatus, deltaMinutes } from './derive-flight-ops-status'
import { deriveFlightBlockMinutes } from './derive-flight-block-minutes'
import { airportOffsetSuffix } from './format-airport-utc-offset'
import { deriveCompositionCardCoverage } from './derive-composition-card-coverage'
import { formatFlightAirportLocalTime } from './format-flight-airport-local-time'
import { formatFlightAirportLocalDate } from './format-flight-airport-local-date'
import { sortCompositionCardRanks } from './sort-composition-card-ranks'
import { sortFlightCrewItems } from './sort-flight-crew-items'
import './flight-detail-dialog.css'

const RANK_PILL: Record<string, string> = {
  CA: 'rank-ca', FO: 'rank-fo', FA: 'rank-fa', IFD: 'rank-ifd',
}
const SOURCE_CHIP: Record<string, string> = {
  SYSTEM: 'system', IMPORT: 'import', MANUAL: 'manual',
}

const formatHM = (totalMin: number): string => {
  if (!totalMin || totalMin <= 0) return '—'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

const formatDelta = (m: number): string => (m > 0 ? `+${m}m` : `${m}m`)

/**
 * Adapt a scenario flight row → the `Flight` shape the dialog renders.
 *
 * ScenarioGanttFlight only carries: id, fltNum, depArp, arvArp, schDepDtUtc,
 * schArvDtUtc, fleet, register. Fields the dialog shows that scenario lacks are
 * filled with neutral defaults so it degrades gracefully (no actual times → "—",
 * no airline/blkMin/fltType → empty/0, never cancelled).
 * Crew Assignment is filled separately via buildScenarioFlightCrew from the store.
 */
const scenarioFlightToFlight = (f: ScenarioGanttFlight): Flight => ({
  id: f.id,
  airline: '',
  fltDt: f.schDepDtUtc ? f.schDepDtUtc.slice(0, 10) : '',
  fltNum: f.fltNum,
  depArp: f.depArp,
  arvArp: f.arvArp,
  schDepDtUtc: f.schDepDtUtc,
  schArvDtUtc: f.schArvDtUtc,
  // Scenario data has no actuals — leave them null so STD/STA show and ATD/ATA show "—".
  actDepDtUtc: null as unknown as string,
  actArvDtUtc: null as unknown as string,
  actDepArp: f.depArp,
  actArvArp: f.arvArp,
  flightFlag: 'S',
  blkMin: 0,
  fleet: f.fleet,
  register: f.register,
  fltType: '',
  fltSts: null,
  isDeleted: 0,
  isCancelled: false,
})

export interface FlightEditFields {
  stdDate: string
  stdTime: string
  atdDate: string
  atdTime: string
  staDate: string
  staTime: string
  ataDate: string
  ataTime: string
  fleet: string
  register: string
}

interface LoadedDetailProps {
  flight: Flight
  crewData: FlightCrewResponse | null
  editMode: boolean
  editFields: FlightEditFields | null
  onEditFieldChange: (key: keyof FlightEditFields, value: string) => void
}

const LoadedDetailBody = ({ flight, crewData, editMode, editFields, onEditFieldChange }: LoadedDetailProps) => {
  const composition = crewData?.composition
  const crewItems = crewData?.items ?? []
  // Subscribe to map so headers refresh after airport TZ load completes.
  useAirportTzStore((s) => s.map)
  const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)

  const depDelta = deltaMinutes(flight.actDepDtUtc, flight.schDepDtUtc)
  const arvDelta = deltaMinutes(flight.actArvDtUtc, flight.schArvDtUtc)

  const depOffset = airportOffsetSuffix(
    flight.depArp,
    flight.schDepDtUtc || flight.actDepDtUtc,
    zoneIdFor,
  )
  const arvOffset = airportOffsetSuffix(
    flight.arvArp,
    flight.schArvDtUtc || flight.actArvDtUtc,
    zoneIdFor,
  )

  const depZone = zoneIdFor(flight.depArp)
  const arvZone = zoneIdFor(flight.arvArp)

  const fltDateOnly =
    formatFlightAirportLocalDate(flight.schDepDtUtc, depZone)
    ?? (flight.fltDt ? flight.fltDt.slice(0, 10) : null)
  const flightDateShort = fltDateOnly ? formatUiDate(fltDateOnly) : '—'

  const ops = deriveFlightOpsStatus({
    isCancelled: flight.isCancelled,
    actDepDtUtc: flight.actDepDtUtc,
    actArvDtUtc: flight.actArvDtUtc,
    schDepDtUtc: flight.schDepDtUtc,
  })

  const blockMin = deriveFlightBlockMinutes({
    actDepDtUtc: flight.actDepDtUtc,
    actArvDtUtc: flight.actArvDtUtc,
    schDepDtUtc: flight.schDepDtUtc,
    schArvDtUtc: flight.schArvDtUtc,
  })

  return (
      <div className="mbody">
        <div className="sec-label">Flight Info</div>
        <div className="flt-info">
          {/* Route Banner */}
          <div className="route-banner">
            <div className="route-arp">
              <span className="route-arp-code">{flight.depArp}</span>
              {flight.actDepArp && flight.actDepArp !== flight.depArp && (
                <span className="route-arp-name">act: {flight.actDepArp}</span>
              )}
            </div>
            <div className="route-arrow">
              <span className="route-flt">{flight.airline} {flight.fltNum}</span>
              <div className="route-line">
                <span className="route-line-bar" />
              </div>
              {editMode && editFields ? (
                <span className="route-sub route-sub-edit">
                  <Input
                    className="h-6 w-16 text-center font-mono text-2xs"
                    value={editFields.fleet}
                    onChange={(e) => onEditFieldChange('fleet', e.target.value)}
                    placeholder="Fleet"
                    data-testid="flight-detail-fleet-input"
                  />
                  <Input
                    className="h-6 w-20 text-center font-mono text-2xs"
                    value={editFields.register}
                    onChange={(e) => onEditFieldChange('register', e.target.value)}
                    placeholder="Register"
                    data-testid="flight-detail-register-input"
                  />
                </span>
              ) : (
                <span className="route-sub" data-testid="flight-detail-fleet">
                  {flight.fleet}{flight.register ? ` · ${flight.register}` : ''}
                </span>
              )}
            </div>
            <div className="route-arp end">
              <span className="route-arp-code">{flight.arvArp}</span>
              {flight.actArvArp && flight.actArvArp !== flight.arvArp && (
                <span className="route-arp-name">act: {flight.actArvArp}</span>
              )}
            </div>
          </div>

          {/* Times Grid */}
          <div className="times-grid">
            <div className="times-col">
              <div className="times-col-hdr">
                <span className="times-col-hdr-dot dep-dot" />
                Departure — {flight.depArp}{depOffset}
              </div>
              <div className={editMode ? 'time-row editing' : 'time-row'}>
                <span className="time-lbl">STD</span>
                {editMode && editFields ? (
                  <div className="time-edit">
                    <GanttEnglishDatePicker ariaLabel="Scheduled departure date" className="flex-1" buttonClassName="h-6 w-full text-2xs" value={editFields.stdDate} onValueChange={(v) => onEditFieldChange('stdDate', v)} testId="flight-detail-std-date" />
                    <Input type="time" className="h-6 w-20 text-center font-mono text-2xs" value={editFields.stdTime} onChange={(e) => onEditFieldChange('stdTime', e.target.value)} data-testid="flight-detail-std-time" />
                  </div>
                ) : (
                  <span className="time-val" data-testid="flight-detail-std">
                    {formatFlightAirportLocalTime(flight.schDepDtUtc, depZone)}
                  </span>
                )}
              </div>
              <div className="time-row">
                <span className="time-lbl">ETD</span>
                <span className="time-val muted">—</span>
              </div>
              <div className={editMode ? 'time-row editing' : 'time-row'}>
                <span className="time-lbl">ATD</span>
                {editMode && editFields ? (
                  <div className="time-edit">
                    <GanttEnglishDatePicker ariaLabel="Actual departure date" className="flex-1" buttonClassName="h-6 w-full text-2xs" value={editFields.atdDate} onValueChange={(v) => onEditFieldChange('atdDate', v)} testId="flight-detail-atd-date" />
                    <Input type="time" className="h-6 w-20 text-center font-mono text-2xs" value={editFields.atdTime} onChange={(e) => onEditFieldChange('atdTime', e.target.value)} data-testid="flight-detail-atd-time" />
                  </div>
                ) : flight.actDepDtUtc ? (
                  <>
                    <span className="time-val actual" data-testid="flight-detail-atd">
                      {formatFlightAirportLocalTime(flight.actDepDtUtc, depZone)}
                    </span>
                    {depDelta !== null && depDelta !== 0 && (
                      <span className={`time-delta ${depDelta > 0 ? 'late' : 'early'}`}>{formatDelta(depDelta)}</span>
                    )}
                  </>
                ) : (
                  <span className="time-val muted">—</span>
                )}
              </div>
            </div>
            <div className="times-sep" />
            <div className="times-col">
              <div className="times-col-hdr">
                <span className="times-col-hdr-dot arv-dot" />
                Arrival — {flight.arvArp}{arvOffset}
              </div>
              <div className={editMode ? 'time-row editing' : 'time-row'}>
                <span className="time-lbl">STA</span>
                {editMode && editFields ? (
                  <div className="time-edit">
                    <GanttEnglishDatePicker ariaLabel="Scheduled arrival date" className="flex-1" buttonClassName="h-6 w-full text-2xs" value={editFields.staDate} onValueChange={(v) => onEditFieldChange('staDate', v)} testId="flight-detail-sta-date" />
                    <Input type="time" className="h-6 w-20 text-center font-mono text-2xs" value={editFields.staTime} onChange={(e) => onEditFieldChange('staTime', e.target.value)} data-testid="flight-detail-sta-time" />
                  </div>
                ) : (
                  <span className="time-val" data-testid="flight-detail-sta">
                    {formatFlightAirportLocalTime(flight.schArvDtUtc, arvZone)}
                  </span>
                )}
              </div>
              <div className="time-row">
                <span className="time-lbl">ETA</span>
                <span className="time-val muted">—</span>
              </div>
              <div className={editMode ? 'time-row editing' : 'time-row'}>
                <span className="time-lbl">ATA</span>
                {editMode && editFields ? (
                  <div className="time-edit">
                    <GanttEnglishDatePicker ariaLabel="Actual arrival date" className="flex-1" buttonClassName="h-6 w-full text-2xs" value={editFields.ataDate} onValueChange={(v) => onEditFieldChange('ataDate', v)} testId="flight-detail-ata-date" />
                    <Input type="time" className="h-6 w-20 text-center font-mono text-2xs" value={editFields.ataTime} onChange={(e) => onEditFieldChange('ataTime', e.target.value)} data-testid="flight-detail-ata-time" />
                  </div>
                ) : flight.actArvDtUtc ? (
                  <>
                    <span className="time-val actual" data-testid="flight-detail-ata">
                      {formatFlightAirportLocalTime(flight.actArvDtUtc, arvZone)}
                    </span>
                    {arvDelta !== null && arvDelta !== 0 && (
                      <span className={`time-delta ${arvDelta > 0 ? 'late' : 'early'}`}>{formatDelta(arvDelta)}</span>
                    )}
                  </>
                ) : (
                  <span className="time-val muted">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Duration row */}
          <div className="dur-row">
            <div className="dur-item">
              <span className="dur-lbl">Block Hours</span>
              <span className="dur-val" data-testid="flight-detail-block-hours">
                {blockMin !== null ? formatHM(blockMin) : '—'}
              </span>
            </div>
            <div className="dur-item">
              <span className="dur-lbl">Flight Date</span>
              <span className="dur-val" style={{ fontSize: 14 }} data-testid="flight-detail-flight-date">
                {flightDateShort}
              </span>
            </div>
            <div className="dur-item">
              <span className="dur-lbl">Status</span>
              <span
                className={`badge ${ops.badgeClass}`}
                data-testid="flight-detail-ops-status"
                style={{ fontSize: 10, padding: '1px 8px' }}
              >
                {ops.label}
              </span>
              <span className="dur-unit" style={{ color: ops.unitColor }}>{ops.unit}</span>
            </div>
          </div>
        </div>

        {/* Composition */}
        <div className="sec-label">Flight Composition</div>
        <div className="comp-section">
          {!composition ? (
            <div style={{ color: 'var(--fg-dim)', padding: '12px 0', fontSize: 12 }}>Loading…</div>
          ) : (
            <div className="comp-grid">
              {sortCompositionCardRanks(Object.keys(composition)).map((rank) => {
                const c = composition[rank]
                const variant = c.actual > c.plan ? 'over' : c.actual < c.plan ? 'under' : ''
                const coverage = deriveCompositionCardCoverage(c.actual, c.plan)
                return (
                  <div
                    className={['comp-card', coverage].filter(Boolean).join(' ')}
                    key={rank}
                    data-testid={`flight-comp-card-${rank}`}
                  >
                    <span className={`comp-rank ${rank.toLowerCase()}`}>{rank}</span>
                    <div className="comp-nums">
                      <span className={`comp-act ${variant}`}>{c.actual}</span>
                      <span className="comp-frac">/ {c.plan}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Crew Assignment */}
        <div className="crew-section">
          <div className="sec-label" style={{ paddingTop: 8 }}>Crew Assignment</div>
          {!crewData ? (
            <div style={{ color: 'var(--fg-dim)', padding: '20px 0', textAlign: 'center', fontSize: 12 }}>Loading crew data…</div>
          ) : (
            <div className="crew-table-wrap">
              <table className="crew-table">
                <thead>
                  <tr>
                    <th className="col-id">Crew ID</th>
                    <th className="col-name">Name</th>
                    <th className="col-base">Base</th>
                    <th className="col-rank">Active Rank</th>
                    <th className="col-acting">Acting Rank</th>
                    <th className="col-source">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {sortFlightCrewItems(crewItems).map((item) => {
                    const rankCls = RANK_PILL[item.crewRank] ?? 'rank-default'
                    const actingCls = RANK_PILL[item.actingRank] ?? 'rank-default'
                    const sourceCls = SOURCE_CHIP[item.source] ?? ''
                    return (
                      <tr key={`${item.crewId}-${item.seqOrder}`}>
                        <td className="col-id">
                          <button
                            type="button"
                            className="crew-id-val"
                            data-testid={`flight-crew-id-${item.crewId}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              useUiStore.getState().openCrewInfo(item.crewId)
                            }}
                          >
                            {item.crewId}
                          </button>
                        </td>
                        <td className="col-name"><span className="crew-name-val">{item.crewName}</span></td>
                        <td className="col-base">
                          <span className="crew-base-val">{item.base || '—'}</span>
                        </td>
                        <td className="col-rank"><span className={`rank-pill ${rankCls}`}>{item.crewRank || '—'}</span></td>
                        <td className="col-acting">
                          {item.actingRank
                            ? <span className={`rank-pill ${actingCls}`}>{item.actingRank}</span>
                            : <span className="mono-val" style={{ color: 'var(--fg-dim)' }}>—</span>
                          }
                        </td>
                        <td className="col-source"><span className={`source-chip ${sourceCls}`}>{item.source}</span></td>
                      </tr>
                    )
                  })}
                  {crewItems.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-dim)', padding: '20px 0' }}>
                        No crew assigned
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
  )
}

export const FlightDetailDialog = () => {
  const open = useUiStore((s) => s.flightDetailOpen)
  const flightId = useUiStore((s) => s.flightDetailId)
  const scenarioId = useUiStore((s) => s.flightDetailScenarioId)
  const closeFlightDetail = useUiStore((s) => s.closeFlightDetail)

  const [flight, setFlight] = useState<Flight | null>(null)
  const [crewData, setCrewData] = useState<FlightCrewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editFields, setEditFields] = useState<FlightEditFields | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const loadAirportTz = useAirportTzStore((s) => s.load)
  useAirportTzStore((s) => s.map)
  const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)

  useEffect(() => {
    if (open) void loadAirportTz()
  }, [open, loadAirportTz])

  useEffect(() => {
    if (open && flightId) {
      setApiError(null)
      setCrewData(null)

      // ── Scenario mode: flight from scenario store; crew = scenario assignees
      // merged with Live mates on the same physical flt_id (out-of-scope bases etc.).
      if (scenarioId != null) {
        const scnData = getScenarioGanttStore(scenarioId).getState().data
        const scnFlight = scnData?.flights.find((f) => f.id === flightId) ?? null
        if (scnFlight && scnData) {
          setFlight(scenarioFlightToFlight(scnFlight))
          const scenarioCrew = buildScenarioFlightCrew(scnData, flightId)
          setCrewData(scenarioCrew)
          setLoading(false)
          flightApi.getCrewList(flightId)
            .then((liveCrew) => setCrewData(mergeScenarioAndLiveFlightCrew(scenarioCrew, liveCrew)))
            .catch(() => { /* keep scenario-only crew if Live is unavailable */ })
        } else {
          setFlight(null)
          setApiError('Flight not found in scenario data')
          setCrewData(null)
          setLoading(false)
        }
        return
      }

      // Local-first: look up flight in the already-loaded flight store
      const storeItems = useFlightStore.getState().items
      const localFlight = storeItems.flatMap((item) => item.flights).find((f) => f.id === flightId) ?? null

      if (localFlight) {
        // Show flight info immediately from local cache; only crew needs the API
        setFlight(localFlight)
        setLoading(false)
        flightApi.getCrewList(flightId)
          .then((crewRes) => setCrewData(crewRes))
          .catch((err) => setApiError(err?.message || 'Failed to load crew data'))
      } else {
        // No local data — fetch both in parallel
        setFlight(null)
        setLoading(true)
        Promise.all([flightApi.getById(flightId), flightApi.getCrewList(flightId)])
          .then(([flightRes, crewRes]) => {
            setFlight(flightRes)
            setCrewData(crewRes)
          })
          .catch((err) => setApiError(err?.message || 'Failed to load flight data'))
          .finally(() => setLoading(false))
      }
    } else {
      setFlight(null)
      setCrewData(null)
      setLoading(false)
      setApiError(null)
    }
    setEditMode(false)
    setEditFields(null)
    setSaveError(null)
    setConfirmingCancel(false)
  }, [open, flightId, scenarioId])

  const ready = Boolean(flight && !loading && !apiError)
  const depZone = flight ? zoneIdFor(flight.depArp) : undefined
  const arvZone = flight ? zoneIdFor(flight.arvArp) : undefined
  const fltDateOnly = flight
    ? (formatFlightAirportLocalDate(flight.schDepDtUtc, depZone)
      ?? (flight.fltDt ? flight.fltDt.slice(0, 10) : null))
    : null
  const flightDateFull = fltDateOnly ? formatUiDate(fltDateOnly) : '—'
  const totalSlots = crewData?.composition
    ? Object.values(crewData.composition).reduce((sum, c) => sum + c.plan, 0)
    : 0
  const filledSlots = crewData?.items?.length ?? 0
  const updatedAt = formatUiDateTime(new Date())

  const title = ready && flight ? (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-mono tabular-nums" data-testid="flight-detail-flight-id">#{flight.id}</span>
      <span className="font-semibold">
        {[flight.airline, flight.fltNum].filter(Boolean).join(' ')}
      </span>
      <span className="font-normal opacity-90" data-testid="flight-detail-header-date">· {flightDateFull}</span>
      {flight.fltType ? (
        <span className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-1.5 py-0 text-3xs font-medium uppercase tracking-wide text-primary-foreground/90">
          {flight.fltType}
        </span>
      ) : null}
    </span>
  ) : (
    'Flight Detail'
  )

  const handleStartEdit = () => {
    if (!flight || !depZone || !arvZone) return
    setEditFields({
      stdDate: utcToLocalDate(flight.schDepDtUtc, depZone),
      stdTime: utcToLocalTime(flight.schDepDtUtc, depZone),
      atdDate: utcToLocalDate(flight.actDepDtUtc, depZone),
      atdTime: utcToLocalTime(flight.actDepDtUtc, depZone),
      staDate: utcToLocalDate(flight.schArvDtUtc, arvZone),
      staTime: utcToLocalTime(flight.schArvDtUtc, arvZone),
      ataDate: utcToLocalDate(flight.actArvDtUtc, arvZone),
      ataTime: utcToLocalTime(flight.actArvDtUtc, arvZone),
      fleet: flight.fleet ?? '',
      register: flight.register ?? '',
    })
    setSaveError(null)
    setConfirmingCancel(false)
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setEditFields(null)
    setSaveError(null)
  }

  const handleEditFieldChange = (key: keyof FlightEditFields, value: string) => {
    setEditFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSaveEdit = async () => {
    if (!flight || !editFields || !depZone || !arvZone) return
    const schDepDtUtc = localToUtc(editFields.stdDate, editFields.stdTime, depZone)
    const schArvDtUtc = localToUtc(editFields.staDate, editFields.staTime, arvZone)
    const actDepDtUtc = localToUtc(editFields.atdDate, editFields.atdTime, depZone)
    const actArvDtUtc = localToUtc(editFields.ataDate, editFields.ataTime, arvZone)
    if (Date.parse(schArvDtUtc) <= Date.parse(schDepDtUtc)) {
      setSaveError('STA must be after STD')
      return
    }
    if (Date.parse(actArvDtUtc) <= Date.parse(actDepDtUtc)) {
      setSaveError('ATA must be after ATD')
      return
    }
    const fleet = editFields.fleet.trim()
    if (!fleet) {
      setSaveError('Fleet is required')
      return
    }
    const register = editFields.register.trim()
    setSaveError(null)
    setSaving(true)
    try {
      const updated = await flightApi.updateTimes(flight.id, {
        schDepDtUtc, schArvDtUtc, actDepDtUtc, actArvDtUtc,
        fleet, register: register || null,
      })
      const merged = { ...flight, ...updated }
      setFlight(merged)
      useFlightStore.getState().upsertFlight(merged)
      notify.success('Flight updated')
      setEditMode(false)
      setEditFields(null)
    } catch (e) {
      setSaveError((e as Error).message || 'Failed to update flight')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelFlight = async () => {
    if (!flight) return
    if (!confirmingCancel) {
      setConfirmingCancel(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await flightApi.cancel(flight.id)
      const merged = { ...flight, ...updated }
      setFlight(merged)
      useFlightStore.getState().upsertFlight(merged)
      notify.success('Flight cancelled')
    } catch (e) {
      setSaveError((e as Error).message || 'Failed to cancel flight')
    } finally {
      setSaving(false)
      setConfirmingCancel(false)
    }
  }

  const handleRestoreFlight = async () => {
    if (!flight) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await flightApi.restore(flight.id)
      const merged = { ...flight, ...updated }
      setFlight(merged)
      useFlightStore.getState().upsertFlight(merged)
      notify.success('Flight restored')
    } catch (e) {
      setSaveError((e as Error).message || 'Failed to restore flight')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div className="flight-detail-dialog-root flex w-full min-w-0 items-center justify-between gap-2">
      <div className="mfooter-left">
        {editMode && saveError ? (
          <span className="text-2xs text-destructive" data-testid="flight-detail-edit-error">{saveError}</span>
        ) : ready ? (
          <>
            <Info />
            Updated {updatedAt} UTC · {filledSlots} crew / {totalSlots} slots
          </>
        ) : null}
      </div>
      <div className="mfooter-right">
        {editMode ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={handleCancelEdit} disabled={saving} data-testid="flight-detail-edit-cancel">
              <XIcon />
              Cancel
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void handleSaveEdit()} disabled={saving} data-testid="flight-detail-edit-save">
              <Check />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" disabled>
              <Link2 />
              Assign Crew
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!ready || scenarioId != null}
              onClick={handleStartEdit}
              data-testid="flight-detail-edit"
            >
              <Pencil />
              Edit
            </button>
            {flight?.isCancelled ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready || scenarioId != null || saving}
                onClick={() => void handleRestoreFlight()}
                data-testid="flight-detail-restore"
              >
                <RotateCcw />
                {saving ? 'Restoring…' : 'Restore Flight'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready || scenarioId != null || saving}
                onClick={() => void handleCancelFlight()}
                data-testid="flight-detail-cancel-flight"
              >
                <Ban />
                {saving ? 'Cancelling…' : confirmingCancel ? 'Confirm Cancel?' : 'Cancel Flight'}
              </button>
            )}
          </>
        )}
        <Button
          className="h-6 px-2 py-0 leading-none"
          onClick={closeFlightDetail}
          disabled={saving}
          data-testid="flight-detail-close"
        >
          Close
        </Button>
      </div>
    </div>
  )

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next && !saving) closeFlightDetail() }}
      icon={<Plane className="h-4 w-4" />}
      title={title}
      className="z-[1100] w-[min(96vw,860px)] sm:max-w-[860px]"
      overlayClassName="z-[1100]"
      bodyClassName="flex min-h-0 flex-col overflow-y-auto p-0"
      footerClassName="py-1"
      footer={footer}
      dismissable={!saving}
      data-testid="flight-detail-dialog"
    >
      <div className="flight-detail-dialog-root">
        {ready && flight ? (
          <LoadedDetailBody
            flight={flight}
            crewData={crewData}
            editMode={editMode}
            editFields={editFields}
            onEditFieldChange={handleEditFieldChange}
          />
        ) : (
          <div
            className={`modal-status ${apiError ? 'error' : ''}`}
            data-testid="flight-detail-status"
          >
            {apiError ? `Error: ${apiError}` : 'Loading…'}
          </div>
        )}
      </div>
    </AppDialog>
  )
}
