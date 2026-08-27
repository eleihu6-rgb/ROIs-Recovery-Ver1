import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

// Accepts both the top-level db instance and a transaction object.
type AnyDb = Pick<NodePgDatabase, 'execute'>

const numberArray = (values: number[]): ReturnType<typeof sql> =>
  sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::bigint[]`

/**
 * Recompute pairing_composition.fill for a specific (pairing_id, acting_rank) pair.
 * fill = COUNT(DISTINCT crew_id) from roster_flight WHERE pairing_id = X
 *        AND roster_acting_rank = rank AND is_deleted = 0
 */
export async function refreshPairingCompositionFill(
  db: AnyDb,
  pairingId: number,
  actingRank: string,
  username: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE pairing_composition
    SET fill       = (
          SELECT COUNT(DISTINCT crew_id)
          FROM   roster_flight
          WHERE  pairing_id          = ${pairingId}
            AND  roster_acting_rank  = ${actingRank}
            AND  is_deleted          = 0
        ),
        updated_at = now(),
        updated_by = ${username}
    WHERE pairing_id  = ${pairingId}
      AND acting_rank = ${actingRank}
      AND is_deleted  = 0
  `)
}

/**
 * Recompute pairing_composition.fill for all rows matching the given pairing_ids.
 * fill = COUNT(DISTINCT crew_id) from roster_flight WHERE pairing_id = X
 *        AND roster_acting_rank = acting_rank AND is_deleted = 0
 */
export async function refreshPairingCompositionFillBulk(
  db: AnyDb,
  pairingIds: number[],
  username: string,
): Promise<void> {
  if (pairingIds.length === 0) return
  const pairingIdArray = numberArray(pairingIds)
  await db.execute(sql`
    UPDATE pairing_composition pc
    SET fill       = (
          SELECT COUNT(DISTINCT rf.crew_id)
          FROM   roster_flight rf
          WHERE  rf.pairing_id         = pc.pairing_id
            AND  rf.roster_acting_rank = pc.acting_rank
            AND  rf.is_deleted         = 0
        ),
        updated_at = now(),
        updated_by = ${username}
    WHERE pc.pairing_id = ANY(${pairingIdArray})
      AND pc.is_deleted = 0
  `)
}

/**
 * Recompute flight_composition.fill for all rows matching the given flt_ids.
 * fill = SUM(pc.plan) from pairing_composition pc JOIN pairing_segment ps
 *        WHERE ps.flt_id = fc.flt_id AND pc.acting_rank = fc.acting_rank AND pc.is_deleted = 0
 */
export async function refreshFlightCompositionFill(
  db: AnyDb,
  fltIds: number[],
  username: string,
): Promise<void> {
  if (fltIds.length === 0) return
  const fltIdArray = numberArray(fltIds)
  await db.execute(sql`
    UPDATE flight_composition fc
    SET fill       = (
          SELECT COALESCE(SUM(pc.plan), 0)
          FROM   pairing_composition pc
          JOIN   pairing_segment     ps ON ps.pairing_id = pc.pairing_id
          WHERE  ps.flt_id       = fc.flt_id
            AND  pc.acting_rank  = fc.acting_rank
            AND  pc.is_deleted   = 0
        ),
        updated_at = now(),
        updated_by = ${username}
    WHERE fc.flt_id = ANY(${fltIdArray})
  `)
}
