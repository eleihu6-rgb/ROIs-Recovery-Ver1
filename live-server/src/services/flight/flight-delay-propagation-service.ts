import { eq, and, asc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { auditUpdate } from '../../utils/audit.js'
import { notDeleted } from '../../utils/db.js'
import { refreshPairingTafb } from '../pairing/pairing-tafb-service.js'
import {
  CHECKIN_MIN,
  CHECKOUT_MIN,
  DEBRIEF_MIN,
  REST_FLOOR_MIN,
  addMinutes,
  minutesBetween,
} from '../pairing/pairing-build-service.js'

type DrizzleTx = Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0]

export interface FlightActualTimePropagationResult {
  affectedCrewIds: string[]
  affectedPairingIds: number[]
}

/**
 * Cascades a flight's actual departure/arrival time edit (PUT /api/flight/:id) into
 * pairing_segment and roster_flight — the tables Pairing-pane/Roster-pane ghost bars
 * actually read, which are otherwise only synced once, at pairing-build/import time
 * (§Flight-Change-Ripple-Required). Must run inside the same transaction as the
 * flight row update it follows.
 *
 * Debrief/dropoff/pickup/brief window + duty rest are only recomputed for
 * pairing.source = 'MANUAL' pairings (the in-app "build pairing" tool owns that
 * formula) whose duty has not been hand-edited via updateDutyNodes
 * (pairing_segment.duty_is_manual_modify). F8-imported pairings keep their
 * host-computed window untouched — only the raw actual-time snapshot and KPI
 * inputs are kept in sync for those.
 */
export const propagateFlightActualTimeChange = async (
  tx: DrizzleTx,
  flightId: number,
  newActDepDtUtc: Date,
  newActArvDtUtc: Date,
  username: string,
): Promise<FlightActualTimePropagationResult> => {
  const audit = auditUpdate(username)

  const touchedSegments = await tx
    .select({
      id: pairingSegment.id,
      pairingId: pairingSegment.pairingId,
      dutySeq: pairingSegment.dutySeq,
      source: pairing.source,
    })
    .from(pairingSegment)
    .innerJoin(pairing, eq(pairing.id, pairingSegment.pairingId))
    .where(and(eq(pairingSegment.fltId, flightId), notDeleted(pairingSegment.isDeleted)))

  const affectedPairingIds = [...new Set(touchedSegments.map((s) => s.pairingId))]

  for (const seg of touchedSegments) {
    await tx
      .update(pairingSegment)
      .set({ actStrDtUtc: newActDepDtUtc, actEndDtUtc: newActArvDtUtc, ...audit })
      .where(eq(pairingSegment.id, seg.id))
  }

  const touchedDuties = [...new Set(touchedSegments.map((s) => `${s.pairingId}:${s.dutySeq}`))]
  for (const key of touchedDuties) {
    const [pairingIdStr, dutySeqStr] = key.split(':')
    const pairingId = Number(pairingIdStr)
    const dutySeq = Number(dutySeqStr)
    const source = touchedSegments.find((s) => s.pairingId === pairingId && s.dutySeq === dutySeq)?.source

    const dutySegs = await tx
      .select()
      .from(pairingSegment)
      .where(and(
        eq(pairingSegment.pairingId, pairingId),
        eq(pairingSegment.dutySeq, dutySeq),
        notDeleted(pairingSegment.isDeleted),
      ))
      .orderBy(asc(pairingSegment.segSeq))
    if (dutySegs.length === 0) continue

    const firstSeg = dutySegs[0]
    const lastSeg = dutySegs[dutySegs.length - 1]
    const dutyActStrDtUtc = firstSeg.actStrDtUtc
    const dutyActEndDtUtc = lastSeg.actEndDtUtc

    // Duty-level redundant anchors — denormalised onto every segment (mirrors build-time pattern).
    for (const s of dutySegs) {
      await tx
        .update(pairingSegment)
        .set({ dutyActStrDtUtc, dutyActEndDtUtc, ...audit })
        .where(eq(pairingSegment.id, s.id))
    }

    const isManualPairing = source === 'MANUAL'
    const isManuallyModifiedDuty = firstSeg.dutyIsManualModify === 1
    if (isManualPairing && !isManuallyModifiedDuty) {
      const touchedIsFirst = touchedSegments.some((s) => s.pairingId === pairingId && s.dutySeq === dutySeq && s.id === firstSeg.id)
      const touchedIsLast = touchedSegments.some((s) => s.pairingId === pairingId && s.dutySeq === dutySeq && s.id === lastSeg.id)

      if (touchedIsFirst) {
        const briefStart = addMinutes(dutyActStrDtUtc, -CHECKIN_MIN)
        await tx.update(pairingSegment).set({
          pickupStartUtc: briefStart,
          pickupEndUtc: briefStart,
          briefStartUtc: briefStart,
          briefEndUtc: dutyActStrDtUtc,
          ...audit,
        }).where(eq(pairingSegment.id, firstSeg.id))
      }
      if (touchedIsLast) {
        const debriefEnd = addMinutes(dutyActEndDtUtc, DEBRIEF_MIN)
        await tx.update(pairingSegment).set({
          debriefStartUtc: dutyActEndDtUtc,
          debriefEndUtc: debriefEnd,
          dropoffStartUtc: debriefEnd,
          dropoffEndUtc: debriefEnd,
          ...audit,
        }).where(eq(pairingSegment.id, lastSeg.id))
      }
      if (touchedIsFirst || touchedIsLast) {
        const checkInStart = addMinutes(dutyActStrDtUtc, -CHECKIN_MIN)
        const checkOutEnd = addMinutes(dutyActEndDtUtc, CHECKOUT_MIN)
        const restMin = Math.max(REST_FLOOR_MIN, Math.round(minutesBetween(checkInStart, checkOutEnd)))
        for (const s of dutySegs) {
          await tx
            .update(pairingSegment)
            .set({ dutyActRestMin: restMin, ...audit })
            .where(eq(pairingSegment.id, s.id))
        }
      }
    }

    await refreshPairingTafb(tx, pairingId, username)
  }

  const touchedRoster = await tx
    .update(rosterFlight)
    .set({ actStrDtUtc: newActDepDtUtc, actEndDtUtc: newActArvDtUtc, ...audit })
    .where(and(eq(rosterFlight.fltId, flightId), notDeleted(rosterFlight.isDeleted)))
    .returning({ crewId: rosterFlight.crewId })

  const affectedCrewIds = [...new Set(touchedRoster.map((r) => r.crewId))]

  return { affectedCrewIds, affectedPairingIds }
}
