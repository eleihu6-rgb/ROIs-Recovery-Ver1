import { eq, and, asc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { invalidate } from '../../utils/cache.js'
import { auditUpdate } from '../../utils/audit.js'
import { refreshPairingTafb } from './pairing-tafb-service.js'

export interface DutyNodeDouble {
  restAfterSegSeq: number
  pickupStartUtc: string
  briefStartUtc: string
  debriefEndUtc: string
  dropoffEndUtc: string
}

export interface DutyNodeUpdate {
  dutySeq: number
  pickupStartUtc: string
  briefStartUtc: string
  debriefEndUtc: string
  dropoffEndUtc: string
  double?: DutyNodeDouble | null
}

/**
 * Update duty node (pickup/brief/debrief/dropoff) times for a pairing's duty segments.
 *
 * Writes into the pairing_segment table:
 * - First segment of each duty: pickupStartUtc, pickupEndUtc (=briefStartUtc), briefStartUtc
 * - Last segment of each duty:  debriefEndUtc, dropoffStartUtc (=debriefEndUtc), dropoffEndUtc
 *
 * When double is present:
 *   - Segment at restAfterSegSeq: doublePickupStartUtc, doublePickupEndUtc (=doubleBriefStartUtc), doubleBriefStartUtc
 *   - Last segment: also doubleDebriefEndUtc, doubleDropoffStartUtc (=doubleDebriefEndUtc), doubleDropoffEndUtc
 * When double is null:
 *   - Clears all double_* columns on ALL segments of that duty
 */
export async function updateDutyNodes(
  fastify: FastifyInstance,
  pairingId: number,
  duties: DutyNodeUpdate[],
  username: string,
): Promise<number> {
  let updated = 0

  await fastify.db.transaction(async (tx) => {
    for (const duty of duties) {
      const segs = await tx
        .select()
        .from(pairingSegment)
        .where(
          and(
            eq(pairingSegment.pairingId, pairingId),
            eq(pairingSegment.dutySeq, duty.dutySeq),
          ),
        )
        .orderBy(asc(pairingSegment.segSeq))

      if (segs.length === 0) continue

      const firstSeg = segs[0]
      const lastSeg = segs[segs.length - 1]

      // Validate: briefStart must be before first flight actStart
      const firstSegActStart = firstSeg.actStrDtUtc
      if (new Date(duty.briefStartUtc) >= firstSegActStart) {
        throw new Error(
          `duty ${duty.dutySeq}: briefStartUtc must be before flight actStrDtUtc (${firstSegActStart.toISOString()})`,
        )
      }

      // Validate: pickupStart must be before briefStart
      if (new Date(duty.pickupStartUtc) > new Date(duty.briefStartUtc)) {
        throw new Error(
          `duty ${duty.dutySeq}: pickupStartUtc must be before briefStartUtc`,
        )
      }

      // Validate: debriefEnd must be after the relevant flight's actEnd
      // When double is present, Block 1 debrief ends after the split segment's actEnd
      const debriefAnchorSeg = duty.double != null && duty.double !== undefined
        ? segs.find((s) => s.segSeq === duty.double!.restAfterSegSeq) ?? lastSeg
        : lastSeg
      const debriefAnchorEnd = debriefAnchorSeg.actEndDtUtc
      if (new Date(duty.debriefEndUtc) < debriefAnchorEnd) {
        throw new Error(
          `duty ${duty.dutySeq}: debriefEndUtc must be after flight actEndDtUtc (${debriefAnchorEnd.toISOString()})`,
        )
      }

      // Validate: dropoffEnd must be after debriefEnd
      if (new Date(duty.dropoffEndUtc) < new Date(duty.debriefEndUtc)) {
        throw new Error(
          `duty ${duty.dutySeq}: dropoffEndUtc must be after debriefEndUtc`,
        )
      }

      const audit = auditUpdate(username)

      // Mark this duty as dispatcher-hand-edited on every segment (mirrors the
      // duty_act_str_dt_utc/duty_act_end_dt_utc denormalisation pattern) — flight-time
      // propagation reads this to skip re-deriving pickup/brief/debrief/dropoff for a duty
      // a dispatcher already hand-tuned (see flight-delay-propagation-service.ts).
      for (const s of segs) {
        await tx
          .update(pairingSegment)
          .set({ dutyIsManualModify: 1, ...audit })
          .where(eq(pairingSegment.id, s.id))
      }

      // Write Block 1 first segment: pickup + brief
      await tx
        .update(pairingSegment)
        .set({
          pickupStartUtc: new Date(duty.pickupStartUtc),
          pickupEndUtc: new Date(duty.briefStartUtc),
          briefStartUtc: new Date(duty.briefStartUtc),
          ...audit,
        })
        .where(eq(pairingSegment.id, firstSeg.id))
      updated++

      // Build last segment updates for Block 1 debrief + dropoff
      const lastSegUpdates: Record<string, unknown> = {
        debriefEndUtc: new Date(duty.debriefEndUtc),
        dropoffStartUtc: new Date(duty.debriefEndUtc),
        dropoffEndUtc: new Date(duty.dropoffEndUtc),
        ...audit,
      }

      // Handle double block
      if (duty.double === null) {
        // Clear all double_* on every segment of this duty
        for (const s of segs) {
          await tx
            .update(pairingSegment)
            .set({
              doublePickupStartUtc: null,
              doublePickupEndUtc: null,
              doubleBriefStartUtc: null,
              doubleBriefEndUtc: null,
              doubleDebriefStartUtc: null,
              doubleDebriefEndUtc: null,
              doubleDropoffStartUtc: null,
              doubleDropoffEndUtc: null,
              ...audit,
            })
            .where(eq(pairingSegment.id, s.id))
          updated++
        }
      } else if (duty.double !== undefined) {
        const d = duty.double
        const splitSeg = segs.find((s) => s.segSeq === d.restAfterSegSeq)
        if (!splitSeg) {
          throw new Error(
            `duty ${duty.dutySeq}: restAfterSegSeq ${d.restAfterSegSeq} not found in segments`,
          )
        }

        // Block 1 split segment: double pickup + brief (Block 2 sign-in)
        await tx
          .update(pairingSegment)
          .set({
            doublePickupStartUtc: new Date(d.pickupStartUtc),
            doublePickupEndUtc: new Date(d.briefStartUtc),
            doubleBriefStartUtc: new Date(d.briefStartUtc),
            ...audit,
          })
          .where(eq(pairingSegment.id, splitSeg.id))
        updated++

        // Last segment also gets double debrief + dropoff (Block 2 sign-out)
        lastSegUpdates.doubleDebriefEndUtc = new Date(d.debriefEndUtc)
        lastSegUpdates.doubleDropoffStartUtc = new Date(d.debriefEndUtc)
        lastSegUpdates.doubleDropoffEndUtc = new Date(d.dropoffEndUtc)
      }

      // Write last segment updates
      await tx
        .update(pairingSegment)
        .set(lastSegUpdates)
        .where(eq(pairingSegment.id, lastSeg.id))
      updated++
    }

    await refreshPairingTafb(tx, pairingId, username)
  })

  await invalidate(fastify.redis, `pairing:${pairingId}`, `pairing-segments:${pairingId}`)
  return updated
}
