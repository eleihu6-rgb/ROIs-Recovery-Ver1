// gantt/src/components/scenario-gantt/build-scenario-roster-items.ts
//
// Pure-function builder for the Scenario Roster pane's RosterItem[] (extracted
// verbatim from scenario-gantt-canvas.tsx). The ONLY behavioral change vs. the
// old in-component buildRosterItems is the item id scheme: ids are now a
// DETERMINISTIC hash of a logical key instead of an incrementing counter. The
// old counter drifted whenever the pending-change set changed (items shifted
// position in the effective list → ids changed → selection broke).
import type { RosterItem } from '@/types/roster'
import { isDeadheadSegAssignment } from '@/utils/puck-duty-color'
import type {
  ScenarioGanttAssignment,
  ScenarioGanttPairing,
  ScenarioGanttPairingSegment,
  ScenarioGanttGroundItem,
  AssignmentPatch,
} from '@/types/scenario-gantt'

/** Deterministic non-negative 32-bit id (FNV-1a) for a roster item, stable across
 *  frames AND across pending-change sets (fixes the old incrementing-counter drift
 *  that broke selection when patches changed). The key must uniquely identify one
 *  logical item. */
export function stableRosterItemId(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function buildEffectiveAssignments(
  assignments: ScenarioGanttAssignment[],
  pendingChanges: AssignmentPatch[],
): ScenarioGanttAssignment[] {
  let current = [...assignments]
  // remove/reassign patches may target solver (CR) or manually-assigned (MA) rows — the
  // backend soft-deletes/moves source IN ('CR','MA'). PA/IMP (pre-assigned) stay immutable.
  const isMutable = (source: ScenarioGanttAssignment['source'] | null | undefined): boolean =>
    source === 'CR' || source === 'MA'
  for (const p of pendingChanges) {
    if (p.op === 'remove') {
      current = current.filter((a) => !(a.crewId === p.crewId && a.pairingId === p.pairingId && isMutable(a.source)))
    } else if (p.op === 'add' && p.pairingId != null) {
      current.push({
        crewId: p.crewId,
        pairingId: p.pairingId,
        // User-initiated Gantt assignment is a manual action → source 'MA' (Live parity).
        source: 'MA',
        rosterActingRank: p.rosterActingRank,
      })
    } else if (p.op === 'reassign' && p.pairingId != null && p.toCrewId) {
      current = current.map((a) =>
        a.crewId === p.crewId && a.pairingId === p.pairingId && isMutable(a.source) ? { ...a, crewId: p.toCrewId! } : a
      )
    }
  }
  return current
}

export interface BuiltRosterItems {
  items: RosterItem[]
  itemsByCrew: Map<string, RosterItem[]>
}

export function buildScenarioRosterItems(args: {
  crew: { crewId: string }[]
  pairingMap: Map<number, ScenarioGanttPairing>
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  groundItems: ScenarioGanttGroundItem[]
  pendingChanges: AssignmentPatch[]
}): BuiltRosterItems {
  const { pairingMap, assignments, pairingSegments, groundItems, pendingChanges } = args

  const effective = buildEffectiveAssignments(assignments, pendingChanges)

  // Mark items derived from pendingChanges (add / reassign) as pending so the shared renderer
  // draws a subtle "unsaved" outline. remove patches render nothing (the item just vanishes).
  // Reassign keeps source 'CR', so source alone cannot identify pending — this key set is
  // the authoritative provenance.
  const pendingKeys = new Set<string>()
  for (const p of pendingChanges) {
    if (p.op === 'add' && p.pairingId != null) pendingKeys.add(`${p.crewId}|${p.pairingId}`)
    if (p.op === 'reassign' && p.pairingId != null && p.toCrewId) pendingKeys.add(`${p.toCrewId}|${p.pairingId}`)
  }

  const segsByPairing = new Map<number, ScenarioGanttPairingSegment[]>()
  for (const seg of pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }

  const items: RosterItem[] = []
  const itemsByCrew = new Map<string, RosterItem[]>()

  for (const a of effective) {
    const pairing = pairingMap.get(a.pairingId)
    if (!pairing) continue

    const segs = (segsByPairing.get(a.pairingId) ?? []).sort(
      (x, y) => x.dutySeq !== y.dutySeq ? x.dutySeq - y.dutySeq : x.segSeq - y.segSeq
    )

    const addItem = (item: RosterItem) => {
      items.push(item)
      const bucket = itemsByCrew.get(a.crewId) ?? []
      bucket.push(item)
      itemsByCrew.set(a.crewId, bucket)
    }

    if (segs.length === 0) {
      // whole-pairing (no segments) item id key
      addItem({
        id: stableRosterItemId(`${a.crewId}|${a.pairingId}|whole`),
        crewId: a.crewId,
        pairingId: a.pairingId,
        isPending: pendingKeys.has(`${a.crewId}|${a.pairingId}`),
        pairingLabel: pairing.pairingLabel,
        pairingInterfaceId: pairing.interfaceId ?? null,
        ver: 1,
        base: pairing.base,
        label: pairing.pairingLabel,
        assignmentGroup: pairing.assignmentGroup,
        assignment: pairing.assignment,
        role: null, subRole: null, source: a.source,
        isRequested: 0, isSwapped: 0,
        preference: null, comments: null, score: null, workingHour: null,
        schStrDtUtc: pairing.schStrDtUtc,
        schEndDtUtc: pairing.schEndDtUtc,
        actStrDtUtc: pairing.actStrDtUtc || pairing.schStrDtUtc,
        actEndDtUtc: pairing.actEndDtUtc || pairing.schEndDtUtc,
        fltId: null, fltDt: null, dutySeq: null, segSeq: null,
        division: pairing.division,
        flightActingRank: a.flightActingRank ?? '',
        rosterActingRank: a.rosterActingRank ?? a.rank ?? null,
        activeRank: a.crewRank ?? null,
        position: null,
        schCreditedMinutes: null, actCreditedMinutes: null,
        tagSet: null, exceptionCode: null,
        ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
      })
    } else {
      for (const seg of segs) {
        const segLabel = seg.fltNum
          ? `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`
          : pairing.pairingLabel
        addItem({
          // segment item id key: crew|pairing|dutySeq|segSeq|fltId
          id: stableRosterItemId(`${a.crewId}|${a.pairingId}|${seg.dutySeq}|${seg.segSeq}|${seg.fltId ?? ''}`),
          crewId: a.crewId,
          pairingId: a.pairingId,
          isPending: pendingKeys.has(`${a.crewId}|${a.pairingId}`),
          pairingLabel: pairing.pairingLabel,
          pairingInterfaceId: pairing.interfaceId ?? null,
          ver: 1,
          base: pairing.base,
          label: segLabel,
          assignmentGroup: isDeadheadSegAssignment(seg.segAssignment)
            ? 'DHD'
            : (pairing.assignmentGroup || 'FLT'),
          assignment: pairing.assignment,
          segAssignment: seg.segAssignment,
          role: null, subRole: null, source: a.source,
          isRequested: 0, isSwapped: 0,
          preference: null, comments: null, score: null, workingHour: null,
          schStrDtUtc: seg.schStrDtUtc,
          schEndDtUtc: seg.schEndDtUtc,
          actStrDtUtc: seg.actStrDtUtc || seg.schStrDtUtc,
          actEndDtUtc: seg.actEndDtUtc || seg.schEndDtUtc,
          fltId: seg.fltId,
          fltDt: seg.fltDt,
          dutySeq: seg.dutySeq,
          segSeq: seg.segSeq,
          division: pairing.division,
          flightActingRank: a.flightActingRank ?? '',
          rosterActingRank: a.rosterActingRank ?? a.rank ?? null,
          activeRank: a.crewRank ?? null,
          position: null,
          schCreditedMinutes: null,
          actCreditedMinutes: seg.dutyActCreditedMinutes != null ? String(seg.dutyActCreditedMinutes) : null,
          // duty-level credit drives the Tier-1 optimistic manday delta (crewMandayDelta reads
          // dutyActCreditedMinutes, not actCreditedMinutes) — without it RpCred never moves on a pending add.
          dutyActCreditedMinutes: seg.dutyActCreditedMinutes != null ? String(seg.dutyActCreditedMinutes) : null,
          tagSet: null, exceptionCode: null,
          ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
          briefStartUtc: seg.brief1StartUtc || null,
          briefEndUtc: seg.brief1EndUtc || null,
          debriefStartUtc: seg.debrief1StartUtc || null,
          debriefEndUtc: seg.debrief1EndUtc || null,
          pickupStartUtc: seg.pickup1StartUtc || null,
          pickupEndUtc: seg.pickup1EndUtc || null,
          dropoffStartUtc: seg.dropoff1StartUtc || null,
          dropoffEndUtc: seg.dropoff1EndUtc || null,
          dutySchRestMin: seg.dutySchRestMin,
          dutyActRestMin: seg.dutyActRestMin,
          actRestMin: seg.dutyActRestMin ?? null,
        })
      }
    }
  }

  // Ground items from output.gz ROSTER section (source='CR', pairingId=null)
  for (const g of groundItems) {
    const removed = pendingChanges.some((p) =>
      p.op === 'remove' &&
      p.pairingId == null &&
      p.crewId === g.crewId &&
      p.startDtUtc === g.schStrDtUtc &&
      p.endDtUtc === g.schEndDtUtc &&
      p.assignmentGroup === g.assignmentGroup &&
      p.assignment === g.assignment
    )
    if (removed) continue
    const item: RosterItem = {
      // ground item id key. ScenarioGanttGroundItem has no unique id; a crew can hold
      // several ground items with the same assignmentGroup at different times, so the
      // start time disambiguates. assignment + schEndDtUtc are added to guard against
      // same-group/same-start collisions, making the key unique per crew.
      id: stableRosterItemId(`${g.crewId}|G|${g.assignmentGroup}|${g.assignment}|${g.schStrDtUtc ?? ''}|${g.schEndDtUtc ?? ''}`),
      crewId: g.crewId,
      pairingId: null,
      pairingLabel: null,
      ver: 1,
      base: g.base ?? '',
      depArp: g.depArp ?? g.base ?? '',
      arvArp: g.arvArp ?? '',
      label: g.label || g.assignment,
      assignmentGroup: g.assignmentGroup,
      assignment: g.assignment,
      role: null, subRole: null, source: g.source,
      isRequested: 0, isSwapped: 0,
      preference: null, comments: null, score: null, workingHour: null,
      schStrDtUtc: g.schStrDtUtc,
      schEndDtUtc: g.schEndDtUtc,
      actStrDtUtc: g.schStrDtUtc,
      actEndDtUtc: g.schEndDtUtc,
      fltId: null, fltDt: null, dutySeq: null, segSeq: null,
      division: '', flightActingRank: g.actingRank, rosterActingRank: null, activeRank: null, position: null,
      schCreditedMinutes: null, actCreditedMinutes: g.actCreditedMinutes != null ? String(g.actCreditedMinutes) : null,
      dpMin: g.dpMin ?? null,
      tagSet: null, exceptionCode: null,
      ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
    }
    items.push(item)
    const bucket = itemsByCrew.get(g.crewId) ?? []
    bucket.push(item)
    itemsByCrew.set(g.crewId, bucket)
  }

  return { items, itemsByCrew }
}
