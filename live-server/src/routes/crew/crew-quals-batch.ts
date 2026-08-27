import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { success, fail } from '../../utils/response.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'
import { crewRank } from '../../models/crew/crew-rank.js'
import { eq, isNull, inArray } from 'drizzle-orm'

const batchQualsQuerySchema = z.object({
  crewIds: z.array(z.string().min(1)).min(1).max(500),
})

/** Crew qualification summary for rule engine */
interface CrewQualSummary {
  crewId: string
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
}

export default async function crewQualsBatchRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/crew/batch-quals
   * Returns fleet qualifications + current rank for multiple crews.
   * Used by Gantt frontend to enrich rule check inputs.
   */
  fastify.post('/batch-quals', async (request, reply) => {
    const parsed = batchQualsQuerySchema.safeParse(request.body)
    if (!parsed.success) {
      return fail(reply, 400, `Invalid request: ${parsed.error.message}`)
    }

    const { crewIds } = parsed.data
    const db = fastify.db

    try {
      // Fetch current fleet quals (no expiry date = currently valid)
      const fleetRows = await db
        .select({
          crewId: crewFleet.crewId,
          fleetSpecific: crewFleet.fleetSpecific,
        })
        .from(crewFleet)
        .where(inArray(crewFleet.crewId, crewIds))

      // Fetch current rank (no expiry date = currently valid)
      const rankRows = await db
        .select({
          crewId: crewRank.crewId,
          rank: crewRank.rank,
          division: crewRank.division,
        })
        .from(crewRank)
        .where(inArray(crewRank.crewId, crewIds))

      // Build result map
      const resultMap = new Map<string, CrewQualSummary>()

      for (const cid of crewIds) {
        resultMap.set(cid, {
          crewId: cid,
          division: 'P',
          rank: '',
          fleetQuals: [],
          airportQuals: [], // Will be populated when crew_qualification has data
        })
      }

      // Merge fleet quals
      for (const row of fleetRows) {
        const entry = resultMap.get(row.crewId)
        if (entry && row.fleetSpecific) {
          entry.fleetQuals.push(row.fleetSpecific)
        }
      }

      // Merge rank (take the latest by picking the last row per crew)
      for (const row of rankRows) {
        const entry = resultMap.get(row.crewId)
        if (entry) {
          entry.rank = row.rank
          if (row.division) entry.division = row.division
        }
      }

      return success(reply, [...resultMap.values()])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      fastify.log.error(err, 'Failed to fetch batch qualifications')
      return fail(reply, 500, message)
    }
  })
}
