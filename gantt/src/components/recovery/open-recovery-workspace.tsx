import { RecoveryPreviewDock } from './recovery-preview-dock'
import { reconcileOpenRecoveryAfterSave } from '@/services/open-recovery-save-reconcile'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { ShieldAlert } from 'lucide-react'
import type { PairingItem } from '@/types'
import { pairingApi } from '@/services/pairing-api'
import { legalityPreviewApi } from '@/services/legality-preview-api'
import { recoveryCostApi } from '@/services/recovery-api'
import { buildStaffingOptions, openPairingSeats, staffingFingerprint, staffingPairingFingerprint, type OpenRecoveryIncident, type StaffingMethod, type StaffingOption } from '@/services/open-pairing-recovery'
import { usePairingStore } from '@/stores/pairing-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useDraftStore } from '@/stores/draft-store'
import { useLegalityStore } from '@/stores/legality-store'
import { useLockStore } from '@/stores/lock-store'
import { useRecoveryPreviewStore } from '@/stores/recovery-preview-store'
import { bringCrewIdsToTop } from '@/utils/bring-matches-to-top'
import { notify } from '@/utils/notify'
import { RecoveryPairingOptions } from './recovery-pairing-options'
import { RecoveryCostBreakdownDialog } from './recovery-cost-breakdown-dialog'
import type * as SharedRecovery from './recovery-violation-dialog'
import { staffingOptionToRecoveryOption } from '@/services/open-recovery-presentation'

const methods: { id: StaffingMethod; title: string }[] = [
  { id: 'standby', title: 'Standby Crew' }, { id: 'available', title: 'Available Crew' }, { id: 'move-up', title: 'Move-up / Roster Transfer' },
]
const money = (option: StaffingOption) => option.cost?.directCost == null ? 'Unpriced' : new Intl.NumberFormat('en', { style: 'currency', currency: option.cost.currency }).format(option.cost.directCost)

/** Open-flight/open-seat mode of Recovery. The alert-based planner remains unchanged. */
export function OpenRecoveryWorkspace({ incident, onClose, PlanGroup, DetailDialog, PlanTree }: { incident: OpenRecoveryIncident; onClose: () => void; PlanGroup: typeof SharedRecovery.PlanGroup; DetailDialog: typeof SharedRecovery.RecoveryDetailDialog; PlanTree: typeof SharedRecovery.PlanTree }) {
  const [pairingId, setPairingId] = useState(incident.kind === 'open-pairing' ? incident.pairingId : null)
  const [detail, setDetail] = useState<PairingItem | null>(null)
  const [rank, setRank] = useState('')
  const [method, setMethod] = useState<StaffingMethod>('standby')
  const [options, setOptions] = useState<StaffingOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [buildReady, setBuildReady] = useState(false)
  const [error, setError] = useState('')
  const [costOpen, setCostOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const generation = useRef(0)
  const rulesetId = useLegalityStore(s => s.selectedId)
  const loadedPairings = usePairingStore(s => s.items)
  const crews = useCrewStore(s => s.items)
  const roster = useRosterStore(s => s.main.rosterItems)
  const loadedRosterCount = useMemo(() => Math.max(1, new Set(roster.map(item => `${item.crewId}:${item.pairingId != null ? `p:${item.pairingId}` : `t:${item.id}`}`)).size), [roster])
  const toRecoveryOption = (option: StaffingOption) => staffingOptionToRecoveryOption(option, loadedRosterCount)
  const pairing = useMemo(() => {
    const loaded = loadedPairings.find(item => item.pairing.id === pairingId)
    if (!detail) return loaded ?? null
    // Detail supplies all segments; the store supplies current draft-aware coverage.
    return { ...detail, pairing: loaded?.pairing ?? detail.pairing }
  }, [loadedPairings, pairingId, detail])
  const seats = pairing ? openPairingSeats(pairing) : []
  const selected = options.find(option => option.id === selectedId)
  const shown = useMemo(() => options.filter(option => option.method === method), [options, method])
  const groups = methods.map(entry => ({
    id: entry.id === 'standby' ? 'standby' as const : entry.id === 'available' ? 'roster' as const : 'swap-duty' as const,
    title: entry.title, description: 'Fill open seats only · Preview → Apply to draft → Save',
    options: options.filter(option => option.method === entry.id && option.ruleCheck !== 'failed').map(toRecoveryOption),
    excludedOptions: options.filter(option => option.method === entry.id && option.ruleCheck === 'failed').map(toRecoveryOption),
  }))
  const selectedGroup = groups[methods.findIndex(entry => entry.id === method)]!
  useEffect(() => () => { generation.current++; useRecoveryPreviewStore.getState().clear() }, [])
  useEffect(() => {
    if (pairingId == null) return
    let cancelled = false
    setError(''); setBusy(true)
    void pairingApi.getDetail(pairingId).then(value => {
      if (cancelled) return
      const item: PairingItem = { pairing: value.pairing, segments: value.segments, flights: [], sessionTags: [] }
      setBusy(false)
      setDetail(item)
      setRank(openPairingSeats(item)[0]?.rank ?? '')
    }).catch(cause => { if (!cancelled) { setError(String(cause)); setBusy(false) } })
    return () => { cancelled = true }
  }, [pairingId])

  const search = async () => {
    if (!pairing || !rank) return
    const version = ++generation.current
    setBusy(true); setError(''); setSelectedId(null)
    const candidates = buildStaffingOptions(pairing, rank, crews, roster)
    setOptions(candidates.map(option => ({ ...option, ruleCheck: 'pending' })))
    try {
      const priced: StaffingOption[] = []
      for (let offset = 0; offset < candidates.length; offset += 128) {
        const batch = candidates.slice(offset, offset + 128)
        const response = await recoveryCostApi.postBatch(batch.map(option => option.costInput))
        priced.push(...batch.map((option, i) => ({ ...option, cost: response.results[i] })))
      }
      for (let offset = 0; offset < priced.length; offset += 4) {
        if (generation.current !== version) return
        await Promise.all(priced.slice(offset, offset + 4).map(async option => {
          try {
            option.ruleMessages = await check(option)
            option.ruleCheck = option.ruleMessages.length ? 'failed' : 'passed'
          } catch { option.ruleCheck = 'not-run'; option.ruleMessages = ['Legality check unavailable. Retry Preview before applying.'] }
        }))
      }
      if (generation.current !== version) return
      setOptions(priced.sort((a, b) => (a.cost?.directCost ?? Infinity) - (b.cost?.directCost ?? Infinity)))
      setSelectedId(priced.find(option => option.method === method)?.id ?? null)
    } catch (cause) { if (generation.current === version) setError(`Costs unavailable: ${String(cause)}`) }
    finally { if (generation.current === version) setBusy(false) }
  }

  const check = async (option: StaffingOption): Promise<string[]> => {
    const request = { contextType: 'live' as const, rulesetId: rulesetId ?? undefined, affectedCrewIds: [option.crewId], focusPairingIds: [option.pairingId, ...(option.donorPairingId ? [option.donorPairingId] : [])] }
    const [before, after] = await Promise.all([
      legalityPreviewApi.checkDraft({ ...request, afterItems: option.beforeItems }),
      legalityPreviewApi.checkDraft({ ...request, afterItems: option.afterItems }),
    ])
    const key = (v: typeof after.violations[number]) => JSON.stringify([v.crewId, v.pairingId, v.ruleCode, v.ruleInstance, v.scopeKey, v.startDt, v.endDt, v.message])
    const previous = new Set(before.violations.map(key))
    const failures = after.violations.filter(v => v.severity >= 3 && (v.pairingId === option.pairingId || !previous.has(key(v))))
    if (!after.allowed) return after.violations.length
      ? after.violations.map(v => `${v.ruleCode}: ${v.message}`)
      : ['Legality preview did not approve this assignment.']
    return failures.map(v => `${v.ruleCode}: ${v.message}`)
  }

  // Discovery is a snapshot of loaded Live data, just like the alert-based planner.
  // Reorder/float updates from Preview must not restart discovery or erase selection.
  // Preview and Apply separately reject actual roster/pairing changes via fingerprints.
  useEffect(() => {
    generation.current++
    setOptions([]); setSelectedId(null); setPreview(false)
    useRecoveryPreviewStore.getState().clear()
    if (detail?.pairing.id !== pairingId || !rank) return
    void search()
    return () => { generation.current++ }
  }, [pairingId, detail, rank, rulesetId])

  const showPreview = async (option = selected) => {
    if (!option || busy) return
    const selected = option
    setSelectedId(selected.id); setDetailOpen(false)
    const version = generation.current
    setBusy(true); setError('')
    try {
      const messages = await check(selected)
      if (version !== generation.current || staffingFingerprint(useRosterStore.getState().main.rosterItems.filter(item => item.crewId === selected.crewId)) !== selected.fingerprint) {
        throw new Error('Roster changed during preview. Close and reopen Recovery to refresh solutions.')
      }
      setOptions(current => current.map(option => option.id === selected.id ? { ...option, ruleCheck: messages.length ? 'failed' : 'passed', ruleMessages: messages } : option))
      useRecoveryPreviewStore.getState().setPreview(selected.id, selected.afterItems, selected.beforeItems)
      useRecoveryPreviewStore.getState().setView('compare')
      await bringCrewIdsToTop([selected.crewId], 'main', 'replace')
      setPreview(true)
    } catch (cause) { setError(`Legality check unavailable: ${String(cause)}`) }
    finally { setBusy(false) }
  }

  const apply = async () => {
    if (!selected || !pairing || selected.ruleCheck !== 'passed' || !preview) return
    setBusy(true); setError('')
    try {
      const ids = [selected.pairingId, ...(selected.donorPairingId ? [selected.donorPairingId] : [])]
      if (!await useLockStore.getState().acquireLocks([selected.crewId], ids)) throw new Error('Affected crew or pairing is locked by another planner.')
      const currentRoster = useRosterStore.getState().main.rosterItems
      if (staffingFingerprint(currentRoster.filter(item => item.crewId === selected.crewId)) !== selected.fingerprint) throw new Error('Roster changed. Close and reopen Recovery to refresh solutions.')
      const saved = await pairingApi.getDetail(selected.pairingId)
      if (staffingPairingFingerprint(saved) !== selected.pairingFingerprint) throw new Error('Pairing flights or requirements changed. Close and reopen Recovery to refresh solutions.')
      const currentPairing = usePairingStore.getState().items.find(item => item.pairing.id === selected.pairingId) ?? pairing
      if (!saved.pairing.composition.some(slot => slot.rank === rank && slot.fill < slot.plan) || !openPairingSeats(currentPairing).some(slot => slot.rank === rank)) throw new Error('This rank has no remaining seat. Close and reopen Recovery to refresh solutions.')
      const messages = await check(selected)
      if (messages.length) throw new Error(messages.join('\n'))
      const draft = useDraftStore.getState()
      for (const operation of selected.operations) draft.addOp(operation, [selected.crewId], ids)
      useRosterStore.getState().recomputeDraftPane('main')
      reconcileOpenRecoveryAfterSave(ids)
      useRecoveryPreviewStore.getState().clear()
      notify.success('Recovery applied to draft. Use Save to commit the roster changes.')
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  return <AppDialog open onOpenChange={next => { if (!next && !busy) onClose() }} dismissable={!busy}
    title={<span className="flex min-w-0 items-center gap-2"><span>{preview ? 'Recovery Preview' : 'Recovery'}</span><span className="truncate text-2xs font-normal opacity-75">{preview ? 'Live Gantt is showing before and after' : 'Loaded Live data only'}</span></span>} icon={<ShieldAlert className="h-4 w-4" />} data-testid="recovery-violation-dialog"
    modal={!preview} className={preview ? 'sm:max-w-[min(430px,calc(100vw-2rem))]' : 'sm:max-w-[min(1420px,97vw)]'} bodyClassName="flex min-h-0 flex-col overflow-hidden p-0" footerClassName="py-1"
    footer={<div className="flex w-full items-center justify-between gap-2">
      <span className="truncate text-2xs text-muted-foreground">{preview ? 'Preview only · not saved' : !pairingId ? 'Build saves the pairing immediately; crew assignment follows.' : 'Preview only · Apply to draft · Save in Live Gantt'}</span>
      <div className="flex shrink-0 gap-2">{preview && <Button variant="ghost" className="h-7 px-2" onClick={() => setPreview(false)}>Options</Button>}<Button variant="ghost" className="h-7 px-2" disabled={busy} onClick={onClose}>Close</Button>
        {!pairingId ? <Button type="submit" form="recovery-pairing-build-form" className="h-7 px-3" disabled={!buildReady || busy}>Build pairing (Save)</Button> : <>{!preview && <Button variant="outline" className="h-7 px-3" disabled={busy || !selected} onClick={() => void showPreview()}>Preview</Button>}<Button className="h-7 px-3" disabled={busy || !preview || selected?.ruleCheck !== 'passed'} onClick={() => void apply()}>Apply</Button></>}
      </div>
    </div>}>
    {!preview && <div className="flex h-[min(92vh,920px)] min-h-0 flex-1 gap-1.5 overflow-hidden p-2">
      {pairingId ? <PlanTree groups={groups} selectedPlanType={selectedGroup.id} disabled={busy}
        onSelect={id => {
          const next = id === 'standby' ? 'standby' : id === 'roster' ? 'available' : 'move-up'
          setMethod(next); setSelectedId(options.find(option => option.method === next)?.id ?? null)
        }} /> : <nav aria-label="Recovery strategies" className="flex w-[240px] shrink-0 flex-col border border-border bg-muted/15">
        <div className="shrink-0 border-b border-border px-3 py-2"><div className="text-xs font-semibold">Recovery methods</div><div className="mt-0.5 text-2xs text-muted-foreground">{pairingId ? 'Pick a strategy to fill open seats.' : 'Build a pairing, then choose a crew strategy.'}</div></div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">By strategy</div>
          {!pairingId && <button type="button" aria-current="true" className="flex w-full items-center gap-2 rounded bg-primary/10 px-2 py-1 text-left text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Pairing Options</button>}
          {methods.map(entry => <button type="button" key={entry.id} aria-current={pairingId && method === entry.id ? 'true' : undefined} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs disabled:opacity-50 ${pairingId && method === entry.id ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-accent/60'}`} disabled={!pairingId || busy} onClick={() => { setMethod(entry.id); setSelectedId(options.find(option => option.method === entry.id)?.id ?? null) }}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{entry.title}</button>)}
          {!pairingId && <p className="mt-3 border-t border-border pt-2 text-2xs text-muted-foreground">Build a pairing to view crew recovery options.</p>}
        </div>
      </nav>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-auto">
        {!pairingId && incident.kind === 'unpaired-flight' ? <RecoveryPairingOptions anchorFlightId={incident.flightId} onBuilt={setPairingId} onBusyChange={setBusy} onBuildReadyChange={setBuildReady} /> : <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <div className="text-sm font-semibold">Pairing {pairing?.pairing.pairingLabel ?? pairingId} · {pairing?.pairing.base} · {pairing?.pairing.fleet}</div>
          <p className="text-xs text-muted-foreground">Saved pairing · fill missing seats only · loaded Live crew and roster scope</p>
          <div className="flex items-center gap-2 text-xs"><label>Open rank <select aria-label="Open rank" className="ml-2 rounded-sm border border-input bg-background p-1" value={rank} disabled={busy} onChange={event => setRank(event.target.value)}>{seats.map(slot => <option key={slot.rank} value={slot.rank}>{slot.rank} · {slot.plan - slot.fill} open</option>)}</select></label><span className="text-2xs text-muted-foreground">Solutions are detected automatically.</span></div>
          {seats.length === 0 && !busy && <p className="text-xs">No open required seats remain.</p>}
          {busy && <p role="status" className="text-xs">Checking current data…</p>}
          {!busy && shown.length === 0 && <p className="text-xs text-muted-foreground">No candidates in this strategy. Review the loaded crew scope or choose another open rank.</p>}
          <PlanGroup group={selectedGroup}
            selectedOptionId={selectedId} executionOptionId={selectedId}
            onSelect={option => setSelectedId(option.id)}
            onToggleExecution={(option, checked) => setSelectedId(checked ? option.id : null)}
            onDetail={option => { setSelectedId(option.id); setDetailOpen(true) }}
            onPreview={option => void showPreview(options.find(entry => entry.id === option.id))}
            onShowCostBreakdown={option => { setSelectedId(option.id); setCostOpen(true) }} />
          {selected && <div className="space-y-2 border-t border-border pt-2 text-xs">
            <p>Add pairing #{selected.pairingId} to {selected.crewId} ({selected.rank}). Existing target assignments are preserved.</p>
            {selected.standbyTaskId && <p>Call out standby #{selected.standbyTaskId}; retain the standby with its callout marker.</p>}
            {selected.donorPairingId && <p className="font-medium text-warning">Partial recovery: remove donor pairing #{selected.donorPairingId} from this crew. The donor seat remains vacant and requires follow-up.</p>}
            <p>Target remains Partial until all required seats are filled.</p>
            <Button variant="outline" size="sm" onClick={() => setCostOpen(true)}>Cost breakdown · {money(selected)}</Button>
          </div>}
        </div>}
      </div>
    </div>}
    {preview && selected && <><RecoveryPreviewDock title={`${selected.crewName} · ${selected.rank}`} crew={selected.crewId}
      method={methods.find(entry => entry.id === selected.method)!.title} impact={toRecoveryOption(selected).metrics.changedRosterCount}
      cost={money(selected)} onReturn={() => setPreview(false)} />
      {selected.donorPairingId && <p className="px-3 pb-2 text-xs text-warning">Donor #{selected.donorPairingId} will have a vacancy. Overall recovery: Partial.</p>}
      {selected.ruleMessages.map(message => <p key={message} className="px-3 pb-2 text-xs text-destructive">{message}</p>)}</>}
    {error && <p role="alert" className="whitespace-pre-wrap p-3 text-xs text-destructive">{error}</p>}

    {selected && detailOpen && <DetailDialog option={toRecoveryOption(selected)} open={detailOpen} onOpenChange={setDetailOpen} onPreview={() => void showPreview()} rulesetId={rulesetId ?? 1} />}
    {selected && <RecoveryCostBreakdownDialog open={costOpen} onOpenChange={setCostOpen} planTitle={`${selected.crewId} · ${selected.method}`} breakdown={selected.cost?.breakdown} notes={selected.cost?.notes} currency={selected.cost?.currency ?? ''} total={selected.cost?.directCost ?? null} enrichmentFailed={selected.cost?.directCost == null} />}
  </AppDialog>
}
