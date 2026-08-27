import { eq, and as andOp, lte, gt, or, isNull, desc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  validateAssignment,
  type PrecheckResult,
  type CrewInput,
  type PairingInput,
  type RankActingMap,
} from '@rois/shared-rules'
import { crew } from '../../models/crew/crew.js'
import { crewRank } from '../../models/crew/crew-rank.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { rankActing } from '../../models/base/rank.js'
import { notDeleted } from '../../utils/db.js'

/**
 * Server-side pre-check for crew ↔ pairing assignments.
 *
 * Loads crew (with effective rank on the pairing date), pairing composition,
 * and rank_acting mappings, then delegates the 3-rule check to
 * @rois/shared-rules. Returns a PrecheckResult — caller maps `!ok` to 409.
 */
export async function precheckAssignment(
  fastify: FastifyInstance,
  crewId: string,
  pairingId: number,
): Promise<PrecheckResult> {
  // 1. Load crew + division
  const [crewRow] = await fastify.db
    .select({ id: crew.crewId, division: crew.division, filiale: crew.filiale })
    .from(crew)
    .where(eq(crew.crewId, crewId))
    .limit(1)

  if (!crewRow) {
    return {
      ok: false,
      reason: 'RANK_ACTING_DISALLOWED',
      message: `Crew ${crewId} not found`,
    }
  }

  // 2. Load pairing + sch_str_dt_utc (need the date for effective crew_rank)
  const [pairRow] = await fastify.db
    .select({ id: pairing.id, division: pairing.division, schStrDtUtc: pairing.schStrDtUtc })
    .from(pairing)
    .where(andOp(eq(pairing.id, pairingId), notDeleted(pairing.isDeleted)))
    .limit(1)

  if (!pairRow) {
    return {
      ok: false,
      reason: 'NO_OPEN_POSITION',
      message: `Pairing ${pairingId} not found`,
    }
  }

  // 3. Effective crew_rank on pairing date (or now if pairing date missing)
  const effectiveDate = pairRow.schStrDtUtc ?? new Date()
  const [rankRow] = await fastify.db
    .select({ rank: crewRank.rank })
    .from(crewRank)
    .where(
      andOp(
        eq(crewRank.crewId, crewId),
        lte(crewRank.effDt, effectiveDate),
        or(gt(crewRank.expDt, effectiveDate), isNull(crewRank.expDt)),
      ),
    )
    .orderBy(desc(crewRank.effDt))
    .limit(1)

  if (!rankRow) {
    return {
      ok: false,
      reason: 'RANK_ACTING_DISALLOWED',
      message: `Crew ${crewId} has no active rank on pairing date`,
    }
  }

  // 4. Load pairing composition (open + closed slots — validateAssignment decides)
  const compRows = await fastify.db
    .select({
      actingRank: pairingComposition.actingRank,
      plan: pairingComposition.plan,
      fill: pairingComposition.fill,
    })
    .from(pairingComposition)
    .where(
      andOp(eq(pairingComposition.pairingId, pairingId), notDeleted(pairingComposition.isDeleted)),
    )

  // 5. Load rank_acting for the crew's filiale
  const rankRows = await fastify.db
    .select({
      activeRank: rankActing.activeRank,
      actingRank: rankActing.actingRank,
    })
    .from(rankActing)
    .where(eq(rankActing.filiale, crewRow.filiale))

  const rankActingMap: RankActingMap = new Map()
  for (const r of rankRows) {
    if (!rankActingMap.has(r.activeRank)) {
      rankActingMap.set(r.activeRank, new Set())
    }
    rankActingMap.get(r.activeRank)!.add(r.actingRank)
  }

  // 6. Build inputs and delegate
  const crewInput: CrewInput = {
    id: crewRow.id,
    division: crewRow.division,
    rank: rankRow.rank,
  }
  const pairingInput: PairingInput = {
    id: pairRow.id,
    division: pairRow.division,
    composition: compRows.map((c) => ({
      actingRank: c.actingRank ?? '',
      plan: c.plan ?? 0,
      fill: c.fill,
    })),
  }

  return validateAssignment(crewInput, pairingInput, rankActingMap)
}
