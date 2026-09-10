import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { AppDialog, Button, Input } from '@rois/ui'
import { ArrowLeft, ArrowRight, Check, Eye, Loader2, MapPin, Plane, Play, RotateCcw, Route, Search, SlidersHorizontal, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { roundtripApi } from '@/services/roundtrip-api'
import type { RoundtripLinkCandidate, RoundtripOptions, RoundtripScope, RoundtripSearch } from '@/services/roundtrip-api'
import { pairingApi } from '@/services/pairing-api'
import { useRoundtripBuilderStore } from '@/stores/roundtrip-builder-store'
import { useFilterStore } from '@/stores/filter-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { usePairingStore } from '@/stores/pairing-store'
import { usePaneStore } from '@/stores/pane-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { calendarDateInTimeZone } from '@/components/gantt/gantt-utils'
import { notify } from '@/utils/notify'
import { RoundtripPreview } from './roundtrip-preview'

const PAGE_SIZE = 100
const selectClass = 'h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 text-xs'
const multiSelectClass = 'min-h-20 w-full min-w-0 rounded-sm border border-input bg-background px-2 py-1 text-xs'
const dateOnly = (iso: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: 'short' }).format(new Date(iso))
const LinkCandidates = ({ links, timezone }: { links: RoundtripLinkCandidate[]; timezone: string }): ReactElement =>
  links.length ? <div className="flex flex-wrap gap-1">{links.map((link) => <span key={link.flightId} className={'whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-2xs ' + (link.preferred ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/40 text-muted-foreground')}>
    {link.depArp}-{link.arvArp} {dateOnly(link.schDepDtUtc, timezone)}
  </span>)}</div> : <span className="text-muted-foreground">Unavailable</span>
const Heading = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }): ReactElement =>
  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" />{children}</h3>
const Field = ({ label, children }: { label: string; children: ReactNode }): ReactElement =>
  <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{label}{children}</label>
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Pairing build request failed'

export const RoundtripBuilderDialog = (): ReactElement => {
  const { isOpen, running, progress, close, setProgress, addCreated, created, clearFocus } = useRoundtripBuilderStore()
  const dateRange = useFilterStore((state) => state.dateRange)
  const timezone = useTimezoneStore((state) => state.timezone)
  const ganttStart = calendarDateInTimeZone(dateRange.start, timezone)
  const ganttEnd = calendarDateInTimeZone(dateRange.end, timezone)
  const [options, setOptions] = useState<RoundtripOptions | null>(null)
  const [scope, setScope] = useState<RoundtripScope | null>(null)
  const [result, setResult] = useState<RoundtripSearch | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [query, setQuery] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [page, setPage] = useState(0)
  const revision = useRef(0)
  const context = useRef('')
  const compositionCustomized = useRef(false)
  const invalidate = (): void => { revision.current++; setResult(null); setSelected(null); setError(''); setPage(0) }
  const initialScope = (data: RoundtripOptions): RoundtripScope => {
    const filters = useFilterStore.getState().pairing
    const fleets = filters.fleets.filter((f) => data.fleets.includes(f))
    return {
      startDate: ganttStart, endDate: ganttEnd, ganttStart, ganttEnd, timezone,
      base: filters.bases.find((b) => data.bases.includes(b)) ?? data.bases[0] ?? '',
      fleets: fleets.length ? fleets : ['ALL'],
      composition: structuredClone(fleets.length === 1 && data.narrowFleets.includes(fleets[0]) ? data.composition.narrow : data.composition.wide),
      rules: { ...data.defaults },
    }
  }
  useEffect(() => {
    if (!isOpen || options) return
    let cancelled = false
    setLoadingOptions(true)
    void (async (): Promise<void> => {
      try {
        const data = await roundtripApi.options()
        if (cancelled) return
        setOptions(data); setScope(initialScope(data))
      } catch (err) { if (!cancelled) setError(errorText(err)) }
      finally { if (!cancelled) setLoadingOptions(false) }
    })()
    return (): void => { cancelled = true; setLoadingOptions(false) }
    // Load only on open; dependencies intentionally exclude the loading state set by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, options, ganttStart, ganttEnd, timezone])
  useEffect(() => {
    const key = [ganttStart, ganttEnd, timezone].join('|')
    if (context.current === key) return
    context.current = key
    invalidate()
    clearFocus()
    setScope((old) => old ? { ...old, ganttStart, ganttEnd, timezone, startDate: ganttStart, endDate: ganttEnd } : old)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttStart, ganttEnd, timezone])
  const changeScope = (patch: Partial<RoundtripScope>): void => {
    if (!scope || running) return
    if (patch.composition) compositionCustomized.current = true
    const next = { ...scope, ...patch }
    if (patch.fleets && options && !compositionCustomized.current) {
      next.composition = structuredClone(patch.fleets.length === 1 && options.narrowFleets.includes(patch.fleets[0]) ? options.composition.narrow : options.composition.wide)
    }
    setScope(next); invalidate()
  }
  const flightMap = useMemo(() => new Map([...(result?.flights ?? []), ...Object.values(result?.linkedFlights ?? {})].map((flight) => [flight.id, flight])), [result])
  const rotationByFlight = useMemo(() => {
    const map = new Map<number, NonNullable<RoundtripSearch['rotations'][number]>>()
    result?.rotations.forEach((rotation) => rotation.flightIds.forEach((id) => map.set(id, rotation)))
    Object.entries(result?.selectionRotations ?? {}).forEach(([id, rotation]) => {
      if (!map.has(Number(id))) map.set(Number(id), rotation)
    })
    return map
  }, [result])
  const rotation = selected === null ? null : rotationByFlight.get(selected)
  const filtered = useMemo(() => (result?.flights ?? []).filter((flight) =>
    (!query || [flight.fltNum, flight.depArp, flight.arvArp].some((value) => value.toLowerCase().includes(query.toLowerCase()))) &&
    (!departureDate || calendarDateInTimeZone(new Date(flight.schDepDtUtc), timezone) === departureDate)),
  [result, query, departureDate, timezone])
  const validScope = Boolean(scope && scope.base && scope.fleets.length && scope.composition.length &&
    scope.startDate >= ganttStart && scope.endDate <= ganttEnd && scope.startDate <= scope.endDate)
  const find = async (): Promise<void> => {
    if (!scope || !validScope) { setError('Choose dates within the open Gantt and a base, fleet and crew composition.'); return }
    const version = ++revision.current
    setSearching(true); setError(''); setResult(null); setSelected(null)
    try {
      const data = await roundtripApi.search(scope)
      if (version === revision.current) { setResult(data); setPage(0) }
    } catch (err) { if (version === revision.current) setError(errorText(err)) }
    finally { setSearching(false) }
  }
  const build = async (): Promise<void> => {
    if (!scope || !result || running || !validScope) return
    const targets = selected === null ? result.rotations : rotation ? [rotation] : []
    if (!targets.length) return
    const snapshot = structuredClone(scope)
    const buildContext = context.current
    let completed = 0
    let committedId: number | null = null
    setProgress(true, 'Building 0 / ' + targets.length)
    close()
    try {
      for (const candidate of targets) {
        if (context.current !== buildContext) throw new Error('Gantt dates or timezone changed. Remaining pairings were not built.')
        const receipt = await roundtripApi.build(snapshot, candidate.flightIds)
        committedId = receipt.pairingId
        completed++
        const detail = await pairingApi.getDetail(receipt.pairingId)
        const pairing = { ...detail.pairing, segments: detail.segments }
        if (context.current !== buildContext) throw new Error('Gantt dates or timezone changed after pairing #' + receipt.pairingId + ' was committed. Review it in its original date range.')
        usePairingStore.getState().addItems([pairing])
        addCreated({ pairing, segments: detail.segments, flights: [], sessionTags: [] })
        const layout = useLayoutStore.getState()
        for (const [id, pane] of layout.panes) if (pane.type === 'pairing') layout.setViewport(id, { scrollY: 0 })
        usePaneStore.getState().setScrollY('pairing', 0)
        const view = useGanttViewStore.getState()
        const startMs = new Date(pairing.schStrDtUtc).getTime()
        view.setScrollX(Math.max(0, (startMs - usePaneStore.getState().dateRange.start.getTime()) / 3600000 * view.pxPerHour - 24))
        view.markDirty()
        setProgress(true, completed + ' / ' + targets.length + ' built / Latest #' + receipt.pairingId)
        committedId = null
        // Let both canvas and header paint this receipt before requesting the next write.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      }
      notify.success(completed + ' pairing' + (completed === 1 ? '' : 's') + ' built')
    } catch (err) {
      const message = committedId
        ? 'Pairing #' + committedId + ' was created, but loading its row failed. Refresh before trying again. ' + errorText(err)
        : errorText(err)
      setError(message); notify.error(message)
    } finally {
      setProgress(false, completed + ' / ' + targets.length + ' built')
      setResult(null); setSelected(null)
    }
  }
  return <AppDialog open={isOpen} onOpenChange={(open): void => { if (!open) close() }}
    title="Pairing Build Automation" icon={<Route className="h-4 w-4" />}
    data-testid="roundtrip-builder-dialog" className="sm:max-w-6xl" bodyClassName="p-0" resizable
    footer={<>
      <span className="mr-auto text-xs text-muted-foreground" data-testid="rt-progress">{progress || (result ? result.rotations.length + ' valid rotations' : '')}</span>
      <Button variant="outline" size="sm" disabled={running || !options} onClick={(): void => { if (options) { compositionCustomized.current = false; setScope(initialScope(options)); invalidate() } }}><RotateCcw className="mr-1 h-3 w-3" />Reset</Button>
      <Button variant="outline" size="sm" data-testid="rt-show-results" onClick={close}><Eye className="mr-1 h-3 w-3" />View Gantt</Button>
      <Button variant="outline" size="sm" data-testid="rt-find" disabled={running || searching || !scope} onClick={(): void => { void find() }}>
        {searching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Search className="mr-1 h-3 w-3" />}Find open flights
      </Button>
      <Button size="sm" data-testid="rt-build" disabled={running || !validScope || !result || (selected === null ? !result.rotations.length : !rotation)} onClick={(): void => { void build() }}>
        <Play className="mr-1 h-3 w-3" />{selected === null ? 'Build all' + (result ? ' (' + result.rotations.length + ')' : '') : 'Build pairing'}
      </Button>
    </>}>
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      <span>Live Gantt</span><span>{ganttStart} - {ganttEnd}</span><span>{timezone}</span>
      {created.length > 0 && <button className="ml-auto inline-flex items-center gap-1 text-primary" disabled={running} onClick={clearFocus}><RotateCcw className="h-3 w-3" />Clear new-pairing focus ({created.length})</button>}
    </div>
    {error && <div role="alert" className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</div>}
    {!scope ? <div className="p-6 text-sm text-muted-foreground">{loadingOptions ? 'Loading build options...' : 'Build options unavailable.'}</div> :
      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-4 border-r border-border p-4">
          <section><Heading icon={MapPin}>Flight scope</Heading><div className="grid grid-cols-2 gap-3">
            <Field label="From date"><Input type="date" className="h-8 text-xs" data-testid="rt-from" value={scope.startDate} min={ganttStart} max={ganttEnd} disabled={running} onChange={(e): void => changeScope({ startDate: e.target.value })} /></Field>
            <Field label="To date"><Input type="date" className="h-8 text-xs" data-testid="rt-to" value={scope.endDate} min={ganttStart} max={ganttEnd} disabled={running} onChange={(e): void => changeScope({ endDate: e.target.value })} /></Field>
            <Field label="Pairing base"><select className={selectClass} data-testid="rt-base" value={scope.base} disabled={running} onChange={(e): void => changeScope({ base: e.target.value })}>{options?.bases.map((base) => <option key={base}>{base}</option>)}</select></Field>
            <Field label="Fleet"><select multiple size={4} className={multiSelectClass} data-testid="rt-fleet" value={scope.fleets} disabled={running} onChange={(e): void => {
              const values = Array.from(e.currentTarget.selectedOptions, (option) => option.value)
              changeScope({ fleets: values.includes('ALL') || values.length === 0 ? ['ALL'] : values })
            }}><option value="ALL">All fleets</option>{options?.fleets.map((fleet) => <option key={fleet}>{fleet}</option>)}</select></Field>
          </div><p className="mt-2 text-xs text-muted-foreground">Unpaired flights / Entire rotation within range</p></section>
          <section className="border-t border-border pt-4"><Heading icon={UsersRound}>Crew composition</Heading>
            <div className="grid grid-cols-2 gap-3">{options?.ranks.map((rank) => {
              const slot = scope.composition.find((c) => c.rank === rank)
              return <label key={rank} className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-primary" checked={Boolean(slot)} disabled={running}
                onChange={(e): void => changeScope({ composition: e.target.checked ? [...scope.composition, { rank, plan: (scope.fleets.length === 1 && options.narrowFleets.includes(scope.fleets[0]) ? options.composition.narrow : options.composition.wide).find((c) => c.rank === rank)?.plan ?? 1 }] : scope.composition.filter((c) => c.rank !== rank) })} />{rank}
                <Input type="number" min={1} step={1} className="ml-auto h-8 w-16 text-xs" aria-label={rank + ' required count'} value={slot?.plan ?? ''} disabled={running || !slot}
                  onChange={(e): void => changeScope({ composition: scope.composition.map((c) => c.rank === rank ? { ...c, plan: Number(e.target.value) } : c) })} />
              </label>
            })}</div>
          </section>
          <section className="border-t border-border pt-4"><Heading icon={SlidersHorizontal}>Build rules</Heading>
            <div className="grid grid-cols-2 gap-3">{([
              ['restMin', 'Minimum rest (min)'], ['maxDutyBlockMin', 'Multi-leg block (min)'], ['checkinMin', 'Check-in (min)'], ['debriefMin', 'Debrief (min)'],
            ] as const).map(([key, label]) => <Field key={key} label={label}><Input type="number" step={1} min={0} className="h-8 text-xs" data-testid={'rt-' + key} value={scope.rules[key]} disabled={running}
              onChange={(e): void => changeScope({ rules: { ...scope.rules, [key]: Number(e.target.value) } })} /></Field>)}</div>
            <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-primary" checked={scope.rules.singleLegExemption} disabled={running}
              onChange={(e): void => changeScope({ rules: { ...scope.rules, singleLegExemption: e.target.checked } })} />Single-leg long-haul block exemption</label>
            <div className="mt-3 flex flex-wrap gap-2 text-2xs text-muted-foreground">{['Base return', 'Continuity', 'No overlap', 'Unique coverage'].map((text) => <span className="inline-flex items-center gap-1" key={text}><Check className="h-3 w-3" />{text}</span>)}</div>
          </section>
        </div>
        <div className="min-w-0 space-y-4 p-4">
          <section><div className="flex items-start justify-between gap-2"><Heading icon={Plane}>Open flights {result ? '(' + result.flights.length + ')' : ''}</Heading>
            {selected !== null && <Button variant="ghost" size="sm" data-testid="rt-clear-selection" disabled={running} onClick={(): void => setSelected(null)}>Clear selection</Button>}</div>
            {result ? <>
              <div className="mb-2 grid grid-cols-2 gap-2"><Input className="h-8 text-xs" data-testid="rt-flight-search" aria-label="Search flight or airport" placeholder="Flight / airport" value={query} onChange={(e): void => { setQuery(e.target.value); setPage(0) }} />
                <Input className="h-8 text-xs" type="date" aria-label="Departure date" data-testid="rt-departure-date" value={departureDate} onChange={(e): void => { setDepartureDate(e.target.value); setPage(0) }} /></div>
              <div className="max-h-48 overflow-auto border-y border-border">
                <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 font-normal">Flight</th><th className="p-2 font-normal">Route</th><th className="p-2 font-normal">Departure</th><th className="p-2 font-normal">Link</th></tr></thead>
                  <tbody>{filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((flight) => <tr key={flight.id} className={'border-b border-border ' + (selected === flight.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                    <td className="p-2"><label className="flex cursor-pointer items-center gap-2"><input type="radio" className="accent-primary" name="roundtrip-flight" data-testid={'rt-flight-' + flight.id} checked={selected === flight.id} disabled={running} onChange={(): void => setSelected(flight.id)} />{flight.fltNum}</label></td>
                    <td className="whitespace-nowrap p-2">{flight.depArp} → {flight.arvArp}</td><td className="whitespace-nowrap p-2">{new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(flight.schDepDtUtc))}</td>
                    <td className="p-2"><LinkCandidates links={result.links[flight.id] ?? []} timezone={timezone} /></td>
                  </tr>)}</tbody>
                </table>
                {!filtered.length && <p className="p-3 text-xs text-muted-foreground">No open flights match.</p>}
              </div>
              <div className="mt-1 flex items-center gap-2 text-2xs text-muted-foreground"><span className="mr-auto">{result.rotations.length} valid rotations / {result.flights.length - rotationByFlight.size} flights remain unpaired</span>
                <button aria-label="Previous flights" disabled={!page} onClick={(): void => setPage(page - 1)}><ArrowLeft className="h-3 w-3" /></button>
                <span>{page + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</span>
                <button aria-label="Next flights" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={(): void => setPage(page + 1)}><ArrowRight className="h-3 w-3" /></button>
              </div>
            </> : <p className="py-4 text-xs text-muted-foreground">{searching ? 'Finding connected open flights...' : 'No search results.'}</p>}
          </section>
          <section className="border-t border-border pt-4"><Heading icon={Route}>Pairing preview</Heading>
            {rotation ? <RoundtripPreview rotation={rotation} flights={flightMap} rules={scope.rules} timezone={timezone} /> :
              <p className="py-4 text-xs text-muted-foreground">{selected !== null ? 'No valid base-return rotation for this flight within the selected scope and rules.' : result ? 'All eligible open flights in scope / No single flight selected' : 'No flight selected'}</p>}
          </section>
        </div>
      </div>}
  </AppDialog>
}
