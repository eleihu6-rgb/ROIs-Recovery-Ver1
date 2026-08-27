import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Button } from '@rois/ui'
import { notify } from '@/utils/notify'
import { Hotel } from 'lucide-react'

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

  const defaultBrief    = new Date(first.actStrDtUtc)
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

export function DutyNodeDialog() {
  const open      = useUiStore((s) => s.dutyNodeDialogOpen)
  const pairingId = useUiStore((s) => s.dutyNodeDialogPairingId)
  const close     = useUiStore((s) => s.closeDutyNodeDialog)
  const tz        = useTimezoneStore((s) => s.timezone)

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const handleDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y }
  }, [offset])

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setOffset({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy })
  }, [])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [label,    setLabel]    = useState<string>('')
  const [dutyMap,  setDutyMap]  = useState<Map<number, PairingSegment[]>>(new Map())
  const [states,   setStates]   = useState<DutyEditState[]>([])
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [fetchKey, setFetchKey] = useState(0)

  const dutySeqs = [...dutyMap.keys()].sort((a, b) => a - b)

  // Load pairing data on open
  useEffect(() => {
    if (!open || pairingId == null) return
    setLoading(true)
    setError(null)
    setDirty(false)
    setOffset({ x: 0, y: 0 })
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
    const block2BriefEnd    = new Date(segs[segs.indexOf(splitSeg) + 1].actStrDtUtc)
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
      const briefEnd = new Date(firstSeg.actStrDtUtc)
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25">
      <div
        className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        {/* Header — drag handle */}
        <div
          className="px-6 py-4 border-b border-border flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div>
            <h2 className="text-lg font-semibold">Edit Duty Nodes</h2>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
          {loading && (
            <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
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

            const b1DebriefStart = isDouble && restGap
              ? new Date(segs.find((s) => s.segSeq === restGap.restAfterSegSeq)!.actEndDtUtc)
              : new Date(lastSeg.actEndDtUtc)

            return (
              <div key={dutySeq} className="space-y-3 border border-border rounded-lg p-4">
                {/* Duty header */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-muted text-muted-foreground rounded px-2 py-0.5">
                    Duty {dutySeq}
                  </span>
                  <span className="text-sm font-medium">{firstSeg?.dutyStrArp} &rarr; {lastSeg?.dutyEndArp}</span>
                  <span className="text-xs text-muted-foreground">{fltNums}</span>
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
                  blockLabel={isDouble ? 'Block 1 &mdash; Sign in/out' : 'Sign in/out'}
                  pickupStart={state.pickupStart}
                  briefStart={state.briefStart}
                  briefEnd={new Date(firstSeg.actStrDtUtc)}
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
                    <div className="flex items-center gap-2 py-2 border-y border-purple-500/40 bg-purple-500/5 rounded px-3">
                      <Hotel size={14} className="text-purple-400" />
                      <span className="text-xs text-purple-300 font-medium">HOTEL REST</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {Math.round((state.double.pickupStart.getTime() - state.dropoffEnd.getTime()) / 60000)} min
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDouble(dutySeq)}
                        className="text-xs text-destructive hover:underline ml-2"
                      >
                        &times; Remove
                      </button>
                    </div>

                    <DutyNodeEditBlock
                      blockLabel="Block 2 &mdash; Sign in/out"
                      pickupStart={state.double.pickupStart}
                      briefStart={state.double.briefStart}
                      briefEnd={new Date(segs[segs.findIndex((s) => s.segSeq > (restGap?.restAfterSegSeq ?? 0))].actStrDtUtc)}
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dirty || !validate()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
