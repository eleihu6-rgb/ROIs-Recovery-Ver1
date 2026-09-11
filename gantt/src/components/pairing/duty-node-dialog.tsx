import { useState, useEffect, useCallback } from 'react'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { pairingApi } from '@/services/pairing-api'
import { pairingDutyNodeApi } from '@/services/pairing-duty-node-api'
import type { PairingSegment } from '@/types'
import type { DutyEditState } from '@/utils/duty-node-utils'
import {
  detectRestGap,
  applyBriefStartChange,
  applyDebriefEndChange,
  applyBlock2BriefStartChange,
  applyBlock2DebriefEndChange,
} from '@/utils/duty-node-utils'
import { DutyNodeGanttBar } from './duty-node-gantt-bar'
import { DutyNodeEditBlock } from './duty-node-edit-block'
import { AppDialog, Button } from '@rois/ui'
import { notify } from '@/utils/notify'
import { Hotel, Clock, Globe } from 'lucide-react'

/** Group flat segments by dutySeq, ordered by segSeq within each duty */
function groupByDuty(segments: PairingSegment[]): Map<number, PairingSegment[]> {
  const map = new Map<number, PairingSegment[]>()
  for (const seg of segments) {
    const list = map.get(seg.dutySeq) ?? []
    list.push(seg)
    map.set(seg.dutySeq, list)
  }
  for (const [key, segs] of map) {
    map.set(key, segs.sort((a, b) => a.segSeq - b.segSeq))
  }
  return map
}

/** Build initial DutyEditState from the first + last segment of a duty */
function buildInitialState(dutySeq: number, segs: PairingSegment[]): DutyEditState {
  const first = segs[0]
  const last  = segs[segs.length - 1]

  // Path A: brief/pickup anchor to SCHEDULED departure (STD); debrief/dropoff to ACTUAL arrival (ATA).
  const defaultBrief    = new Date(first.schStrDtUtc)
  const defaultDebrief  = new Date(last.actEndDtUtc)
  const defaultPickupDur = 30 * 60000  // 30min default
  const defaultDropoffDur = 30 * 60000

  const pickupStart = first.pickupStartUtc
    ? new Date(first.pickupStartUtc)
    : new Date(defaultBrief.getTime() - defaultPickupDur)

  const briefStart = first.briefStartUtc
    ? new Date(first.briefStartUtc)
    : defaultBrief

  const debriefEnd = last.debriefEndUtc
    ? new Date(last.debriefEndUtc)
    : defaultDebrief

  const dropoffEnd = last.dropoffEndUtc
    ? new Date(last.dropoffEndUtc)
    : new Date(defaultDebrief.getTime() + defaultDropoffDur)

  // Double block
  const splitSeg = last.doublePickupStartUtc ? segs.find((s) => s.doublePickupStartUtc != null) : null
  const double = splitSeg && last.doubleDebriefEndUtc ? {
    pickupStart: new Date(splitSeg.doublePickupStartUtc!),
    briefStart:  new Date(splitSeg.doubleBriefStartUtc!),
    debriefEnd:  new Date(last.doubleDebriefEndUtc),
    dropoffEnd:  new Date(last.doubleDropoffEndUtc!),
  } : null

  return { dutySeq, pickupStart, briefStart, debriefEnd, dropoffEnd, double }
}

/** Short civil date "Sep 11" in the display timezone. */
function fmtDutyDate(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(utcIso))
}

/** Compact UTC offset, e.g. "GMT+3", for the timezone indicator chip. */
function tzOffsetLabel(zoneId: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zoneId, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

export function DutyNodeDialog() {
  const open      = useUiStore((s) => s.dutyNodeDialogOpen)
  const pairingId = useUiStore((s) => s.dutyNodeDialogPairingId)
  const close     = useUiStore((s) => s.closeDutyNodeDialog)
  const tz        = useTimezoneStore((s) => s.timezone)
  const tzAirport = useTimezoneStore((s) => s.timezoneAirport)

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [label,    setLabel]    = useState<string>('')
  const [dutyMap,  setDutyMap]  = useState<Map<number, PairingSegment[]>>(new Map())
  const [states,   setStates]   = useState<DutyEditState[]>([])
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [fetchKey, setFetchKey] = useState(0)

  const dutySeqs = [...dutyMap.keys()].sort((a, b) => a - b)
  const offset   = tzOffsetLabel(tz)
  const tzChip   = offset ? `${tzAirport} · ${offset}` : tzAirport

  // Flight numbers across the whole pairing, for the title bar sub-label.
  const fltSummary = dutySeqs
    .flatMap((ds) => (dutyMap.get(ds) ?? []).map((s) => s.fltNum))
    .join(' / ')

  // Load pairing data on open
  useEffect(() => {
    if (!open || pairingId == null) return
    setLoading(true)
    setError(null)
    setDirty(false)
    pairingApi.getDetail(pairingId)
      .then(({ pairing, segments }) => {
        setLabel(pairing.pairingLabel ?? `Pairing #${pairingId}`)
        const map = groupByDuty(segments)
        setDutyMap(map)
        const initial = [...map.entries()]
          .sort(([a], [b]) => a - b)
          .map(([dutySeq, segs]) => buildInitialState(dutySeq, segs))
        setStates(initial)
      })
      .catch(() => setError('Failed to load pairing data'))
      .finally(() => setLoading(false))
  }, [open, pairingId, fetchKey])

  const updateState = useCallback((dutySeq: number, updater: (s: DutyEditState) => DutyEditState) => {
    setStates((prev) => prev.map((s) => s.dutySeq === dutySeq ? updater(s) : s))
    setDirty(true)
  }, [])

  const handleAddDouble = useCallback((dutySeq: number, restAfterSegSeq: number) => {
    const segs = dutyMap.get(dutySeq) ?? []
    const splitSeg = segs.find((s) => s.segSeq === restAfterSegSeq)!
    const lastSeg  = segs[segs.length - 1]

    const defaultPickupDur  = 30 * 60000
    const defaultDropoffDur = 30 * 60000
    // Path A: block-2 brief anchors to the next leg's SCHEDULED departure.
    const block2BriefEnd    = new Date(segs[segs.indexOf(splitSeg) + 1].schStrDtUtc)
    const block2DebriefStart = new Date(lastSeg.actEndDtUtc)

    updateState(dutySeq, (s) => ({
      ...s,
      // Re-anchor Block 1 debrief to split seg's actEnd
      debriefEnd: new Date(new Date(splitSeg.actEndDtUtc).getTime() + 30 * 60000),
      dropoffEnd: new Date(new Date(splitSeg.actEndDtUtc).getTime() + 30 * 60000),
      double: {
        pickupStart: new Date(block2BriefEnd.getTime() - defaultPickupDur),
        briefStart:  block2BriefEnd,
        debriefEnd:  new Date(block2DebriefStart.getTime() + 30 * 60000),
        dropoffEnd:  new Date(block2DebriefStart.getTime() + defaultDropoffDur + 30 * 60000),
      },
    }))
  }, [dutyMap, updateState])

  const handleRemoveDouble = useCallback((dutySeq: number) => {
    if (!window.confirm('Remove double sign-in/out block? This will clear all Block 2 data.')) return
    const segs = dutyMap.get(dutySeq) ?? []
    const lastSeg = segs[segs.length - 1]
    updateState(dutySeq, (s) => ({
      ...s,
      debriefEnd: new Date(lastSeg.actEndDtUtc),
      dropoffEnd: new Date(new Date(lastSeg.actEndDtUtc).getTime() + 30 * 60000),
      double: null,
    }))
  }, [dutyMap, updateState])

  const validate = (): boolean => {
    for (const s of states) {
      const segs = dutyMap.get(s.dutySeq) ?? []
      if (segs.length === 0) continue
      const firstSeg = segs[0]
      // Path A: brief must end no later than SCHEDULED departure (STD).
      const briefEnd = new Date(firstSeg.schStrDtUtc)
      if (s.briefStart >= briefEnd) return false
      if (s.pickupStart > s.briefStart) return false
      if (s.debriefEnd > s.dropoffEnd) return false
    }
    return true
  }

  const handleSave = async () => {
    if (!pairingId || !validate()) return
    setSaving(true)
    try {
      const duties = states.map((s) => {
        const segs = dutyMap.get(s.dutySeq) ?? []
        const restGap = detectRestGap(segs)
        return {
          dutySeq:        s.dutySeq,
          pickupStartUtc: s.pickupStart.toISOString(),
          briefStartUtc:  s.briefStart.toISOString(),
          debriefEndUtc:  s.debriefEnd.toISOString(),
          dropoffEndUtc:  s.dropoffEnd.toISOString(),
          double: s.double === null ? null : s.double ? {
            restAfterSegSeq: restGap?.restAfterSegSeq ?? segs[0].segSeq,
            pickupStartUtc:  s.double.pickupStart.toISOString(),
            briefStartUtc:   s.double.briefStart.toISOString(),
            debriefEndUtc:   s.double.debriefEnd.toISOString(),
            dropoffEndUtc:   s.double.dropoffEnd.toISOString(),
          } : undefined,
        }
      })
      await pairingDutyNodeApi.updateDutyNodes(pairingId, duties)
      notify.success('Duty nodes saved')
      setDirty(false)
      close()
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to save'
      notify.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return
    close()
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) handleClose() }}
      data-testid="duty-node-dialog"
      className="sm:max-w-3xl"
      icon={<Clock className="h-4 w-4" />}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">Edit Duty Nodes</span>
          {fltSummary && (
            <span className="truncate font-mono text-2xs font-normal opacity-85">{fltSummary}</span>
          )}
          <span
            className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 font-mono text-2xs font-normal"
            title="Times below are shown in this timezone"
          >
            <Globe className="h-3 w-3" /> {tzChip}
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dirty || !validate()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="text-sm text-destructive">{error}</div>
            <Button size="sm" onClick={() => { setError(null); setFetchKey((k) => k + 1) }}>Retry</Button>
          </div>
        )}
        {!loading && !error && dutySeqs.map((dutySeq, di) => {
          const state    = states[di]
          if (!state) return null
          const segs     = dutyMap.get(dutySeq) ?? []
          const firstSeg = segs[0]
          const lastSeg  = segs[segs.length - 1]
          const restGap  = detectRestGap(segs)
          const isDouble = state.double != null

          const fltNums = segs.map((s) => s.fltNum).join(' / ')
          // Path A: brief ends at SCHEDULED departure (STD), not actual.
          const briefEnd = new Date(firstSeg.schStrDtUtc)

          const b1DebriefStart = isDouble && restGap
            ? new Date(segs.find((s) => s.segSeq === restGap.restAfterSegSeq)!.actEndDtUtc)
            : new Date(lastSeg.actEndDtUtc)

          return (
            <div key={dutySeq} className="space-y-3 rounded-lg border border-border p-4">
              {/* Duty header — pairing #id, label, date, then route + flights (item 2) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
                  Duty {dutySeq}
                </span>
                <span className="font-mono text-xs font-semibold text-primary">#{pairingId}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-xs text-muted-foreground">{fmtDutyDate(firstSeg.schStrDtUtc, tz)}</span>
                <span className="mx-1 h-3.5 w-px bg-border" />
                <span className="text-sm font-semibold">{firstSeg?.dutyStrArp} &rarr; {lastSeg?.dutyEndArp}</span>
                <span className="font-mono text-xs text-muted-foreground">{fltNums}</span>
              </div>

              {/* Gantt bar */}
              <DutyNodeGanttBar
                state={state}
                segments={segs}
                firstSeg={firstSeg}
                lastSeg={lastSeg}
                restAfterSegSeq={restGap?.restAfterSegSeq ?? null}
                onAddDouble={() => restGap && handleAddDouble(dutySeq, restGap.restAfterSegSeq)}
              />

              {/* Edit forms */}
              <DutyNodeEditBlock
                blockLabel={isDouble ? 'Block 1 — Sign in/out' : 'Sign in/out'}
                pickupStart={state.pickupStart}
                briefStart={state.briefStart}
                briefEnd={briefEnd}
                debriefStart={b1DebriefStart}
                debriefEnd={state.debriefEnd}
                dropoffEnd={state.dropoffEnd}
                onBriefStartChange={(d) => updateState(dutySeq, (s) => applyBriefStartChange(s, d))}
                onPickupStartChange={(d) => updateState(dutySeq, (s) => ({ ...s, pickupStart: d }))}
                onDebriefEndChange={(d) => updateState(dutySeq, (s) => applyDebriefEndChange(s, d))}
                onDropoffEndChange={(d) => updateState(dutySeq, (s) => ({ ...s, dropoffEnd: d }))}
              />

              {/* Hotel REST separator + Block 2 */}
              {isDouble && state.double && (
                <>
                  <div className="flex items-center gap-2 rounded border-y border-purple-500/40 bg-purple-500/5 px-3 py-2">
                    <Hotel size={14} className="text-purple-400" />
                    <span className="text-xs font-medium text-purple-300">HOTEL REST</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Math.round((state.double.pickupStart.getTime() - state.dropoffEnd.getTime()) / 60000)} min
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDouble(dutySeq)}
                      className="ml-2 text-xs text-destructive hover:underline"
                    >
                      &times; Remove
                    </button>
                  </div>

                  <DutyNodeEditBlock
                    blockLabel="Block 2 — Sign in/out"
                    pickupStart={state.double.pickupStart}
                    briefStart={state.double.briefStart}
                    briefEnd={new Date(segs[segs.findIndex((s) => s.segSeq > (restGap?.restAfterSegSeq ?? 0))].schStrDtUtc)}
                    debriefStart={new Date(lastSeg.actEndDtUtc)}
                    debriefEnd={state.double.debriefEnd}
                    dropoffEnd={state.double.dropoffEnd}
                    onBriefStartChange={(d) => updateState(dutySeq, (s) => applyBlock2BriefStartChange(s, d))}
                    onPickupStartChange={(d) => updateState(dutySeq, (s) => ({ ...s, double: s.double ? { ...s.double, pickupStart: d } : null }))}
                    onDebriefEndChange={(d) => updateState(dutySeq, (s) => applyBlock2DebriefEndChange(s, d))}
                    onDropoffEndChange={(d) => updateState(dutySeq, (s) => ({ ...s, double: s.double ? { ...s.double, dropoffEnd: d } : null }))}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
    </AppDialog>
  )
}
