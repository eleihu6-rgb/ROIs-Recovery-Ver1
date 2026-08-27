import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AppDialog, formatUiDate } from '@rois/ui'
import { Network } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { type PairingDetailResponse, type PairingCrewDetail } from '@/services/pairing-api'
import { getPairingInfoWithLocalFirst } from '@/services/pairing-info-service'
import { buildScenarioPairingInfo } from '@/utils/scenario-pairing-adapter'
import { buildPairingDutyRefLookup, formatDutyRefTz, resolveDutyRefTz } from '@/utils/pairing-duty-ref'
import { normalizeUtcIso } from '@/components/gantt/gantt-utils'
import { formatCreditMinutes } from '@/utils/format-credit'
import type { PairingSegment } from '@/types/pairing'

type TzMode = 'local' | 'airport' | 'utc' | 'dep'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Minutes east of UTC for `zoneId` at instant `d` (DST-aware via the IANA zone). */
const zoneOffsetMin = (zoneId: string, d: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0')
  let h = get('hour'); if (h === 24) h = 0
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return Math.round((asUtc - d.getTime()) / 60000)
}

/** Offset minutes → "±H:MM" (e.g. -420 → "-7:00"). */
const fmtOffsetMin = (min: number): string => {
  const a = Math.abs(min)
  return `${min < 0 ? '-' : '+'}${Math.floor(a / 60)}:${pad(a % 60)}`
}

/** Duration minutes → "H:MM" (blank for null/0). */
const fmtDur = (min: number | null | undefined): string => {
  if (min == null || min <= 0) return ''
  return `${Math.floor(min / 60)}:${pad(min % 60)}`
}

/** Block minutes between two ISO timestamps (null if either missing / non-positive). */
const blockMin = (startIso: string | null, endIso: string | null): number | null => {
  if (!startIso || !endIso) return null
  const a = Date.parse(normalizeUtcIso(startIso)), b = Date.parse(normalizeUtcIso(endIso))
  if (isNaN(a) || isNaN(b) || b <= a) return null
  return Math.round((b - a) / 60000)
}

export const PairingInfoDialog = () => {
  const open = useUiStore((s) => s.pairingInfoOpen)
  const pairingId = useUiStore((s) => s.pairingInfoId)
  const scenarioId = useUiStore((s) => s.pairingInfoScenarioId)
  const pairingInfoCrewId = useUiStore((s) => s.pairingInfoCrewId)
  const pairingInfoCrewLocked = useUiStore((s) => s.pairingInfoCrewLocked)
  const setPairingInfoCrewId = useUiStore((s) => s.setPairingInfoCrewId)
  const close = useUiStore((s) => s.closePairingInfo)

  const tzOptions = useTimezoneStore((s) => s.timezoneOptions)
  const displayZone = useTimezoneStore((s) => s.timezone)
  const displayAirport = useTimezoneStore((s) => s.timezoneAirport)

  // Full airport→zone map (ALL airports, not just bases). `timezone-options` only
  // exposes base airports, so without this non-base dep/arr airports (e.g. YXX, MEX)
  // fall back to UTC. Loaded lazily; the store dedups repeat loads.
  const airportTzMap = useAirportTzStore((s) => s.map)
  const loadAirportTz = useAirportTzStore((s) => s.load)
  const scenarioDataRevision = useSyncExternalStore(
    (onChange) => {
      if (scenarioId == null) return () => undefined
      return getScenarioGanttStore(scenarioId).subscribe(onChange)
    },
    () => (scenarioId == null ? 0 : getScenarioGanttStore(scenarioId).getState().dataRevision),
    () => 0,
  )

  const [detail, setDetail] = useState<PairingDetailResponse | null>(null)
  const [crew, setCrew] = useState<PairingCrewDetail[] | null>(null)
  const [rosterDutyRefs, setRosterDutyRefs] = useState<PairingDetailResponse['rosterDutyRefs']>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Pairing-Info 默认时区档跟随 Toolbar 选择的 Base（Live/Scenario 共享本组件、读同一全局 store）。
  // Toolbar=UTC → 默认 UTC；Toolbar=非 UTC 机场 → 默认 Airport 档（= 所选 Base），时刻按该 Base 换算。
  // `manualTzMode` 记录用户显式点选的档位；一旦点选，本次打开期间 Toolbar 不再驱动档位（重开时复位）。
  const [manualTzMode, setManualTzMode] = useState<TzMode | null>(null)

  // 每次（重新）打开弹窗时清掉手动覆盖，让默认跟随当前 Toolbar 选择。
  useEffect(() => {
    if (open) setManualTzMode(null)
  }, [open])

  const tzMode: TzMode = manualTzMode
    ?? (displayAirport !== 'UTC' && displayZone !== 'UTC' ? 'airport' : 'utc')

  useEffect(() => {
    if (!open || pairingId == null) {
      setDetail(null); setCrew(null); setRosterDutyRefs(undefined); setError(null); setLoading(false)
      return
    }
    setLoading(true); setError(null); setDetail(null); setCrew(null); setRosterDutyRefs(undefined)
    void loadAirportTz()

    // ── Scenario mode: build the pairing detail from the per-scenario gantt store,
    // NOT the Live /api/pairing endpoint. Scenario pairing IDs come from the
    // optimization snapshot and many don't exist in the Live pairing table, so the
    // Live path 404s → "Pairing not found". buildScenarioPairingInfo returns the same
    // PairingInfoBundle shape, so the render code below is unchanged.
    // dataRevision: re-run after Save/Recheck reload so Ref TZ is not stuck null.
    if (scenarioId != null) {
      const bundle = buildScenarioPairingInfo(scenarioId, pairingId)
      if (bundle) {
        setDetail(bundle.detail)
        setCrew(bundle.crew)
        setRosterDutyRefs(bundle.rosterDutyRefs ?? bundle.detail.rosterDutyRefs)
      }
      else { setError('Pairing not found in scenario data') }
      setLoading(false)
      return
    }

    getPairingInfoWithLocalFirst(pairingId)
      .then(({ detail: d, crew: c, rosterDutyRefs: refs }) => {
        setDetail(d)
        setCrew(c)
        setRosterDutyRefs(refs ?? d.rosterDutyRefs)
      })
      .catch((e) => setError(e?.message ?? 'Failed to load pairing'))
      .finally(() => setLoading(false))
  }, [open, pairingId, scenarioId, scenarioDataRevision, loadAirportTz])

  // Pairing-pane entry has no crew context, so default to the first rostered crew.
  // Roster-pane entry remains locked to the crew that opened the dialog.
  useEffect(() => {
    if (!detail || !crew || crew.length === 0 || pairingInfoCrewLocked) return
    if (!pairingInfoCrewId || !crew.some((member) => member.crewId === pairingInfoCrewId)) {
      setPairingInfoCrewId(crew[0].crewId)
    }
  }, [detail, crew, pairingInfoCrewId, pairingInfoCrewLocked, setPairingInfoCrewId])

  // airport code → IANA zone (from timezone options)
  const zoneByAirport = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of tzOptions) m.set(o.airport, o.zoneId)
    return m
  }, [tzOptions])

  // Resolve an airport's IANA zone: base options first, then the full airport map,
  // then UTC. This is what lets non-base dep/arr airports localize correctly.
  const resolveZone = (code: string | null): string =>
    zoneByAirport.get(code ?? '') ?? airportTzMap[code ?? ''] ?? 'UTC'

  // Resolve the IANA zone a single time cell renders in.
  //  - utc:     always UTC
  //  - airport: the globally-selected switcher airport (displayZone)
  //  - dep:     the whole leg pinned to the DEPARTURE airport's zone — departure and
  //             arrival times share one standard, so elapsed reads without tz math
  //  - local:   each event in ITS OWN airport's local wall-clock — departure events at
  //             the departure airport, arrival events at the arrival airport
  const zoneForCell = (eventArp: string | null, depArp: string | null): string => {
    if (tzMode === 'utc') return 'UTC'
    if (tzMode === 'airport') return displayZone || 'UTC'
    if (tzMode === 'dep') return resolveZone(depArp)
    return resolveZone(eventArp) // 'local' — event's own airport
  }

  /**
   * Format a UTC ISO timestamp as "M/D HH:mm".
   * @param eventArp airport where the event happens (dep airport for STD/ATD/PCK/RPT,
   *                 arr airport for STA/ATA/DRP) — drives the zone in 'local' mode
   * @param depArp   the sector's departure airport — drives the zone in 'dep' mode
   */
  const fmtTs = (iso: string | null, eventArp: string | null, depArp: string | null): string => {
    if (!iso) return ''
    const d = new Date(normalizeUtcIso(iso))
    if (isNaN(d.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneForCell(eventArp, depArp), month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d)
    const v = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${v('month')}/${v('day')} ${v('hour')}:${v('minute')}`
  }

  // "CODE(±H:MM)" — offset derived from the airport's resolved zone at the given
  // instant (DST-aware). Unknown airports (zone → UTC) show just the code.
  const airportCell = (code: string | null, iso: string | null): string => {
    if (!code) return ''
    const zone = resolveZone(code)
    if (zone === 'UTC' || !iso) return code
    const d = new Date(normalizeUtcIso(iso))
    if (isNaN(d.getTime())) return code
    return `${code}(${fmtOffsetMin(zoneOffsetMin(zone, d))})`
  }

  // Segments sorted by duty/seg sequence.
  const segs = useMemo(
    () => [...(detail?.segments ?? [])].sort((a, b) => (a.dutySeq - b.dutySeq) || (a.segSeq - b.segSeq)),
    [detail],
  )

  // Composition string e.g. "IFD(1)FA(3)".
  const composition = useMemo(
    () => (detail?.compositions ?? []).map((c) => `${c.actingRank}(${c.plan})`).join(''),
    [detail],
  )

  // Total DP = sum of each distinct duty's scheduled duty-period minutes.
  const totalDp = useMemo(() => {
    const byDuty = new Map<number, number>()
    for (const s of segs) {
      const v = (s as PairingSegment & { dutySchDpMin?: number }).dutySchDpMin
      if (v != null) byDuty.set(s.dutySeq, v)
    }
    return [...byDuty.values()].reduce((a, b) => a + b, 0)
  }, [segs])

  // Total Credit = sum of each distinct duty's actual credited minutes. Credit lives
  // at the duty level (same value repeated on every seg of a duty, like DP), so dedup
  // by dutySeq before summing — otherwise a multi-sector duty would be counted N times.
  const totalCredit = useMemo(() => {
    const byDuty = new Map<number, number>()
    for (const s of segs) {
      if (s.dutyActCreditedMinutes != null) byDuty.set(s.dutySeq, Math.round(Number(s.dutyActCreditedMinutes)))
    }
    return [...byDuty.values()].reduce((a, b) => a + b, 0)
  }, [segs])

  const totalBh = useMemo(
    () => segs.filter((s) => s.segAssignment !== 'DH' && s.segAssignment !== 'DHD')
      .reduce((sum, s) => sum + (blockMin(s.schStrDtUtc, s.schEndDtUtc) ?? 0), 0),
    [segs],
  )

  const dutySummary = (s: PairingSegment): string => {
    const x = s as PairingSegment & {
      dutyLayoverNits?: number; dutySchFdpMin?: number; dutySchDpMin?: number; dutyEtrTz?: number
    }
    const out: string[] = []
    if (x.dutyLayoverNits) out.push(`LO ${x.dutyLayoverNits}`)
    if (x.dutySchFdpMin) out.push(`FDP ${fmtDur(x.dutySchFdpMin)}`)
    if (s.dutyActCreditedMinutes != null) out.push(`Credit ${fmtDur(Math.round(Number(s.dutyActCreditedMinutes)))}`)
    if (x.dutySchDpMin) out.push(`DP ${fmtDur(x.dutySchDpMin)}`)
    if (x.dutyEtrTz != null) out.push(`ETRTZ ${x.dutyEtrTz}`)
    return out.join(' · ')
  }

  const dutyRowSpan = (index: number): number => {
    const dutySeq = segs[index]?.dutySeq
    let span = 0
    for (let i = index; i < segs.length && segs[i].dutySeq === dutySeq; i++) span += 1
    return span
  }

  const tzButtons: { mode: TzMode; label: string }[] = [
    { mode: 'local', label: 'Local' },
    { mode: 'airport', label: displayAirport && displayAirport !== 'UTC' ? displayAirport : 'Airport' },
    { mode: 'utc', label: 'UTC' },
    { mode: 'dep', label: 'By DEP' },
  ]

  const crewCount = crew?.length ?? 0
  const selectedCrewId = crew?.some((member) => member.crewId === pairingInfoCrewId)
    ? pairingInfoCrewId
    : (pairingInfoCrewLocked ? pairingInfoCrewId : crew?.[0]?.crewId ?? null)
  const selectedCrewRefs = useMemo(
    () => buildPairingDutyRefLookup(rosterDutyRefs ?? [], selectedCrewId, detail?.pairing.id ?? -1),
    [rosterDutyRefs, selectedCrewId, detail?.pairing.id],
  )
  const startDate = detail?.pairing.schStrDtUtc ? formatUiDate(detail.pairing.schStrDtUtc.slice(0, 10)) : '—'

  const SEG_COLS = ['QUAL', 'ALN', 'Flight', 'Fleet', 'ACC', 'Ref', 'DEP', 'PCK', 'RPT', 'STD', 'ATD', 'ARR', 'STA', 'ATA', 'DRP', 'GT', 'BH', 'FT', 'MRT', 'Duty']

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      data-testid="pairing-info-dialog"
      className="w-[97vw] sm:max-w-[97vw]"
      bodyClassName="p-0"
      icon={<Network className="h-4 w-4" />}
      title={detail ? `${detail.pairing.pairingLabel ? `${detail.pairing.pairingLabel} ` : ''}#${detail.pairing.id}` : 'Pairing Info'}
    >
      {loading && <div className="p-6 text-center text-sm text-muted-foreground" data-testid="pairing-info-status">Loading…</div>}
      {error && <div className="p-6 text-center text-sm text-destructive" data-testid="pairing-info-status">Error: {error}</div>}

      {detail && !loading && !error && (
        <div className="flex flex-col" data-testid="pairing-info-content">
          {/* Header info block */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-xs">
            <span className="text-muted-foreground">Start: <span className="text-foreground">{startDate}</span></span>
            <span className="text-muted-foreground">Base: <span className="font-mono text-foreground">{detail.pairing.base}</span></span>
            <span className="text-muted-foreground">Composition: <span className="font-mono text-foreground">{composition || '—'}</span></span>
            <span className="text-muted-foreground">Total Credit: <span className="font-mono tabular-nums text-foreground" data-testid="pairing-info-total-credit">{fmtDur(totalCredit) || '—'}</span></span>
            <span className="text-muted-foreground">Total BH: <span className="font-mono tabular-nums text-foreground" data-testid="pairing-info-total-bh">{fmtDur(totalBh) || '—'}</span></span>
            <span className="text-muted-foreground">Total DP: <span className="font-mono tabular-nums text-foreground">{fmtDur(totalDp) || '—'}</span></span>
            {detail.pairing.tags && <span className="text-muted-foreground">Attr: <span className="text-foreground">{detail.pairing.tags}</span></span>}
            {/* Timezone toggle */}
            <div className="ml-auto flex items-center gap-1" data-testid="pairing-info-tz">
              {tzButtons.map((b) => (
                <button
                  key={b.mode}
                  type="button"
                  onClick={() => setManualTzMode(b.mode)}
                  data-testid={`pairing-info-tz-${b.mode}`}
                  className={[
                    'rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
                    tzMode === b.mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
                  ].join(' ')}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Segment table — fits within the wide dialog; only vertical scroll. */}
          <div className="max-h-[42vh] overflow-y-auto overflow-x-hidden">
            <table className="w-full border-collapse text-2xs" data-testid="pairing-info-segments">
              <thead className="sticky top-0 z-10">
                <tr className="bg-primary text-primary-foreground">
                  {SEG_COLS.map((c) => (
                    <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-semibold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segs.map((s, i) => {
                  const x = s as PairingSegment & {
                    fleetSeg?: string; dutyAccState?: string
                    dutySchRestMin?: number; dutyActRestMin?: number
                  }
                  const prev = segs[i - 1]
                  const next = segs[i + 1]
                  const gt = next && next.dutySeq === s.dutySeq ? blockMin(s.schEndDtUtc, next.schStrDtUtc) : null
                  const bh = (s.segAssignment === 'DH' || s.segAssignment === 'DHD') ? null : blockMin(s.schStrDtUtc, s.schEndDtUtc)
                  const ft = blockMin(s.actStrDtUtc, s.actEndDtUtc)
                  // PCK (pick-up) + RPT (report/brief) are duty-level info: the crew is picked
                  // up and reports once at the START of a duty, so they're shown only on the
                  // duty's first sector — never repeated on the following sectors of the same duty.
                  const isFirstOfDuty = !prev || prev.dutySeq !== s.dutySeq
                  // DRP + MRT are duty-level info: shown once per duty on its last sector
                  // (a duty may span several flights), never duplicated per sector.
                  // Duty is a merged duty-level cell anchored on the first sector.
                  const isLastOfDuty = !next || next.dutySeq !== s.dutySeq
                  const mrt = isLastOfDuty && (x.dutySchRestMin != null || x.dutyActRestMin != null)
                    ? `${fmtDur(x.dutySchRestMin)}|${fmtDur(x.dutyActRestMin)}` : ''
                  const cell = 'whitespace-nowrap px-2 py-1 font-mono tabular-nums'
                  return (
                    <tr key={s.id} className="border-b border-border/60 hover:bg-accent/40">
                      <td className={cell}>{s.segAssignment && s.segAssignment !== 'FLT' ? s.segAssignment : ''}</td>
                      <td className={cell}>{s.airline}</td>
                      <td className="whitespace-nowrap px-2 py-1 font-mono font-medium text-primary">{s.fltNum}</td>
                      <td className={cell}>{x.fleetSeg ?? ''}</td>
                      <td className={cell}>{x.dutyAccState ?? ''}</td>
                      <td className={cell} data-duty-seq={s.dutySeq}>{formatDutyRefTz(resolveDutyRefTz(s, selectedCrewRefs))}</td>
                      <td className={cell}>{airportCell(s.depArp, s.schStrDtUtc)}</td>
                      <td className={cell}>{isFirstOfDuty ? fmtTs(s.pickupStartUtc, s.depArp, s.depArp) : ''}</td>
                      <td className={cell}>{isFirstOfDuty ? fmtTs(s.briefStartUtc, s.depArp, s.depArp) : ''}</td>
                      <td className={cell}>{fmtTs(s.schStrDtUtc, s.depArp, s.depArp)}</td>
                      <td className={cell}>{fmtTs(s.actStrDtUtc, s.depArp, s.depArp)}</td>
                      <td className={cell}>{airportCell(s.arvArp, s.schEndDtUtc)}</td>
                      <td className={cell}>{fmtTs(s.schEndDtUtc, s.arvArp, s.depArp)}</td>
                      <td className={cell}>{fmtTs(s.actEndDtUtc, s.arvArp, s.depArp)}</td>
                      <td className={cell}>{isLastOfDuty ? fmtTs(s.dropoffEndUtc, s.arvArp, s.depArp) : ''}</td>
                      <td className={cell}>{fmtDur(gt)}</td>
                      <td className={cell}>{fmtDur(bh)}</td>
                      <td className={cell}>{fmtDur(ft)}</td>
                      <td className={cell}>{mrt}</td>
                      {isFirstOfDuty && (
                        <td
                          rowSpan={dutyRowSpan(i)}
                          className="min-w-28 whitespace-nowrap border-l border-border/60 bg-muted/20 px-2 py-1 align-top text-muted-foreground"
                          data-testid="pairing-info-duty-cell"
                        >
                          {dutySummary(s)}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Crew table — hidden when no crew rostered (point 6) */}
          {crewCount > 0 ? (
            <div className="border-t border-border">
              <div className="flex h-8 items-center gap-2 border-b border-border bg-muted/40 px-4 text-xs font-semibold text-foreground">
                Crew on Pairing
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-bold text-primary" data-testid="pairing-info-crew-count">{crewCount}</span>
                <label className="ml-auto flex items-center gap-1 font-normal text-muted-foreground">
                  Ref crew
                  <select
                    aria-label="Ref crew"
                    data-testid="pairing-info-crew-selector"
                    value={selectedCrewId ?? ''}
                    disabled={pairingInfoCrewLocked}
                    onChange={(event) => setPairingInfoCrewId(event.target.value)}
                    className="h-6 rounded border border-border bg-background px-1.5 font-mono text-2xs text-foreground"
                  >
                    {crew!.map((member) => (
                      <option key={member.crewId} value={member.crewId}>{member.crewId}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="max-h-[28vh] overflow-auto">
                <table className="w-full border-collapse text-xs" data-testid="pairing-info-crew">
                  <thead className="sticky top-0">
                    <tr className="bg-secondary text-secondary-foreground">
                      {['Crew ID', 'Name', 'Base', 'Acting Rank', 'Credit', 'Source'].map((c) => (
                        <th key={c} className="whitespace-nowrap px-3 py-1.5 text-left font-semibold">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crew!.map((m) => (
                      <tr key={m.crewId} className="border-b border-border/60 hover:bg-accent/40">
                        <td className="px-3 py-1.5 font-mono tabular-nums font-medium">{m.crewId}</td>
                        <td className="px-3 py-1.5">{m.name}</td>
                        <td className="px-3 py-1.5 font-mono">{m.base || ''}</td>
                        <td className="px-3 py-1.5 font-mono">{m.actingRank || ''}</td>
                        <td className="px-3 py-1.5 font-mono tabular-nums" data-testid="pairing-info-crew-credit">{formatCreditMinutes(m.creditMin) || ''}</td>
                        <td className="px-3 py-1.5">{m.source || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground" data-testid="pairing-info-no-crew">
              No crew rostered on this pairing.
            </div>
          )}
        </div>
      )}
    </AppDialog>
  )
}
