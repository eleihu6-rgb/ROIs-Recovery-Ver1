import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from '@rois/ui'
import { Loader2, MapPin, Plane, Route, Search } from 'lucide-react'
import { calendarDateInTimeZone } from '@/components/gantt/gantt-utils'
import { RecoveryRotationChart } from './recovery-rotation-chart'
import { RoundtripPreview } from '@/components/roundtrip-pairing/roundtrip-preview'
import { flightApi } from '@/services/flight-api'
import { pairingApi } from '@/services/pairing-api'
import { roundtripApi, type RoundtripFlight, type RoundtripOptions, type RoundtripScope, type RoundtripSearch } from '@/services/roundtrip-api'
import { useFilterStore } from '@/stores/filter-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { bringPairingIdToTop } from '@/utils/bring-matches-to-top'
import { useRoundtripBuilderStore } from '@/stores/roundtrip-builder-store'

export interface RecoveryPairingOptionsProps {
  anchorFlightId: number
  onBuilt: (pairingId: number) => void
  onBusyChange?: (busy: boolean) => void
  onBuildReadyChange?: (ready: boolean) => void
}

const selectClass = 'h-8 w-full rounded-sm border border-input bg-background px-2 text-xs'
const dateOnly = (date: Date, timezone: string): string => calendarDateInTimeZone(date, timezone)

export const RecoveryPairingOptions = ({ anchorFlightId, onBuilt, onBusyChange, onBuildReadyChange }: RecoveryPairingOptionsProps): React.ReactElement => {
  const dateRange = useFilterStore((state) => state.dateRange)
  const pairingFilter = useFilterStore((state) => state.pairing)
  const timezone = useTimezoneStore((state) => state.timezone)
  const [options, setOptions] = useState<RoundtripOptions | null>(null)
  const [scope, setScope] = useState<RoundtripScope | null>(null)
  const [flight, setFlight] = useState<RoundtripFlight | null>(null)
  const [result, setResult] = useState<RoundtripSearch | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revision = useRef(0)

  const startDate = dateOnly(dateRange.start, timezone)
  const endDate = dateOnly(dateRange.end, timezone)

  useEffect(() => {
    let cancelled = false
    const requestRevision = ++revision.current
    setOptions(null); setScope(null); setResult(null); setSelectedKey(null); setError('')
    void (async () => {
      try {
        const [available, anchor] = await Promise.all([roundtripApi.options(), flightApi.getById(anchorFlightId)] as const)
        if (cancelled || requestRevision !== revision.current) return
        const matchingBase = pairingFilter.bases.find((base) => base === anchor.depArp) ?? anchor.depArp
        const matchingFleet = pairingFilter.fleets.find((fleet) => fleet === anchor.fleet) ?? anchor.fleet
        const fleets = matchingFleet && available.fleets.includes(matchingFleet) ? [matchingFleet] : ['ALL']
        const composition = structuredClone(fleets.length === 1 && available.narrowFleets.includes(fleets[0]) ? available.composition.narrow : available.composition.wide)
        setFlight({ id: anchor.id, fltNum: anchor.fltNum, fleet: anchor.fleet, depArp: anchor.depArp, arvArp: anchor.arvArp, schDepDtUtc: anchor.schDepDtUtc, schArvDtUtc: anchor.schArvDtUtc, blockMin: anchor.blkMin ?? 0 })
        setOptions(available)
        setScope({ startDate, endDate, ganttStart: startDate, ganttEnd: endDate, timezone, base: available.bases.includes(matchingBase) ? matchingBase : available.bases[0] ?? '', fleets, composition, rules: { ...available.defaults } })
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load pairing options') }
    })()
    return () => { cancelled = true }
  }, [anchorFlightId, startDate, endDate, timezone])

  const flights = useMemo(() => new Map<number, RoundtripFlight>([...(result?.flights ?? []), ...Object.values(result?.linkedFlights ?? {})].map((item) => [item.id, item])), [result])
  const rotation = result?.rotations.find((candidate) => candidate.key === selectedKey) ?? null
  const buildReady = Boolean(rotation?.flightIds.includes(anchorFlightId)) && !busy && !loading
  useEffect(() => { onBuildReadyChange?.(buildReady) }, [buildReady, onBuildReadyChange])
  const setScopeValue = (patch: Partial<RoundtripScope>): void => {
    setScope((current) => current ? { ...current, ...patch } : current)
    setResult(null); setSelectedKey(null); setError('')
  }
  const runSearch = async (): Promise<void> => {
    if (!scope) return
    const requestRevision = ++revision.current
    setLoading(true); setError(''); setResult(null); setSelectedKey(null); onBusyChange?.(true)
    try {
      const found = await roundtripApi.search(scope, anchorFlightId)
      if (requestRevision !== revision.current) return
      setResult(found)
      const first = found.rotations.find((candidate) => candidate.flightIds.includes(anchorFlightId)) ?? found.rotations[0]
      setSelectedKey(first?.key ?? null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pairing search failed') }
    finally { setLoading(false); onBusyChange?.(false) }
  }
  const build = async (): Promise<void> => {
    if (!scope || !rotation || busy) return
    setBusy(true); onBusyChange?.(true); setError('')
    try {
      const receipt = await roundtripApi.build(scope, rotation.flightIds, anchorFlightId)
      // Build is an immediate server commit. Notify the owner before optional
      // focus hydration so a focus failure can never invite a duplicate retry.
      onBuilt(receipt.pairingId)
      try {
        const detail = await pairingApi.getDetail(receipt.pairingId)
        const pairing = { ...detail.pairing, segments: detail.segments }
        usePairingStore.getState().addItems([pairing])
        useRoundtripBuilderStore.getState().addCreated({ pairing, segments: detail.segments, flights: [], sessionTags: [] })
        await bringPairingIdToTop(receipt.pairingId)
      } catch (focusCause) {
        setError(`Pairing ${receipt.pairingId} was saved. Refresh or reopen the Pairing pane to focus it. ${focusCause instanceof Error ? focusCause.message : ''}`.trim())
      }
      if (receipt.warnings?.length) setError(`Pairing ${receipt.pairingId} was saved with build warnings: ${receipt.warnings.join(' ')}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pairing build failed') }
    finally { setBusy(false); onBusyChange?.(false) }
  }

  if (error && !scope) return <div className="p-4 text-xs text-destructive" role="alert">{error}</div>
  if (!scope || !options || !flight) return <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading pairing options…</div>
  return <form id="recovery-pairing-build-form" onSubmit={event => { event.preventDefault(); if (buildReady) void build() }} data-testid="recovery-pairing-options" className="min-h-0 space-y-2 overflow-auto p-0.5">
    <div className="rounded border border-primary/30 bg-primary/[0.04] p-2 text-xs"><div className="font-semibold">Pairing Options</div><div className="mt-0.5 text-muted-foreground">Anchor flight <b className="text-foreground">{flight.fltNum}</b> · {dateOnly(new Date(flight.schDepDtUtc), timezone)} · {flight.depArp} → {flight.arvArp}. Search unpaired flights for competing base-return rotations.</div></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <label className="text-2xs text-muted-foreground">From<Input type="date" className="h-8 text-xs" value={scope.startDate} min={startDate} max={endDate} disabled={loading || busy} onChange={(event) => setScopeValue({ startDate: event.target.value })} /></label>
      <label className="text-2xs text-muted-foreground">To<Input type="date" className="h-8 text-xs" value={scope.endDate} min={startDate} max={endDate} disabled={loading || busy} onChange={(event) => setScopeValue({ endDate: event.target.value })} /></label>
      <label className="text-2xs text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Base</span><select className={selectClass} value={scope.base} disabled={loading || busy} onChange={(event) => setScopeValue({ base: event.target.value })}>{options.bases.map((base) => <option key={base}>{base}</option>)}</select></label>
      <label className="text-2xs text-muted-foreground"><span className="flex items-center gap-1"><Plane className="h-3 w-3" />Fleet</span><select className={selectClass} value={scope.fleets[0]} disabled={loading || busy} onChange={(event) => setScopeValue({ fleets: [event.target.value] })}><option value="ALL">All fleets</option>{options.fleets.map((fleetCode) => <option key={fleetCode}>{fleetCode}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-muted/20 p-2 text-xs"><span className="font-medium">Crew composition</span>{options.ranks.map((rank) => { const slot = scope.composition.find((entry) => entry.rank === rank); return <label key={rank} className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(slot)} disabled={loading || busy} onChange={(event) => setScopeValue({ composition: event.target.checked ? [...scope.composition, { rank, plan: 1 }] : scope.composition.filter((entry) => entry.rank !== rank) })} />{rank}<Input type="number" min={1} className="h-7 w-14 text-xs" disabled={loading || busy || !slot} value={slot?.plan ?? ''} onChange={(event) => setScopeValue({ composition: scope.composition.map((entry) => entry.rank === rank ? { ...entry, plan: Number(event.target.value) } : entry) })} /></label> })}</div>
    <div className="flex items-center gap-2"><Button type="button" size="sm" data-testid="recovery-pairing-search" disabled={loading || busy} onClick={() => void runSearch()}>{loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Search className="mr-1 h-3 w-3" />}Search Pairing Options</Button>{result?.truncated && <span className="text-2xs text-warning">{result.rotations.length ? 'Search limit reached; showing options found. Narrow From/To to check more routes.' : 'Search limit reached before finding a valid route. Narrow From/To and search again.'}</span>}{result && !result.truncated && !result.rotations.length && <span className="text-2xs text-muted-foreground">No valid base-return route found for this anchor.</span>}</div>
    {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/[0.04] p-2 text-xs text-destructive">{error}</div>}
    {result && result.rotations.length > 0 && <div className="grid min-h-0 gap-3 md:grid-cols-[15rem_minmax(0,1fr)]"><div className="max-h-80 space-y-1 overflow-auto rounded border border-border p-2">{result.rotations.map((candidate) => <button type="button" key={candidate.key} className={'w-full rounded border px-2 py-1.5 text-left text-xs ' + (candidate.key === selectedKey ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted')} onClick={() => setSelectedKey(candidate.key)}><span className="flex items-center gap-1.5 font-medium"><Route className="h-3 w-3" />{candidate.flightIds.length} flights</span><span className="text-2xs text-muted-foreground">Block {candidate.blockMin} min · {candidate.dutyFlightIds.length} duty{candidate.dutyFlightIds.length === 1 ? '' : 'ies'}</span>{candidate.flightIds.includes(anchorFlightId) && <span className="ml-1 text-2xs text-primary">Anchor included</span>}</button>)}</div><div className="min-w-0 rounded border border-border p-2">{rotation ? <div className="space-y-3"><RecoveryRotationChart rotation={rotation} flights={flights} timezone={timezone} /><RoundtripPreview rotation={rotation} flights={flights} rules={scope.rules} timezone={timezone} /></div> : <span className="text-xs text-muted-foreground">Select a rotation to review.</span>}</div></div>}
  </form>
}

export default RecoveryPairingOptions
