import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { base } from '../../models/base/base.js'
import { rank } from '../../models/base/rank.js'
import { fleet } from '../../models/base/fleet.js'
import { crew } from '../../models/crew/crew.js'
import { getOrSet } from '../../utils/cache.js'

/**
 * Representative reference values used to seed R'Bot's example prompts so the
 * suggestions reflect the airline's ACTUAL setup (a hardcoded "Bangkok" base that
 * doesn't exist for the client could never match a filter). Each field is the most
 * prominent real value of its kind, or null when the table is empty.
 */
export interface AiHints {
  base: string | null
  rank: string | null
  fleet: string | null
  crewId: string | null
}

const CACHE_KEY = 'ai:hints'
// Basic reference data — low-frequency change, same 24h TTL as the base list.
const CACHE_TTL = 86400

export const hintsService = {
  async get(fastify: FastifyInstance): Promise<AiHints> {
    return getOrSet(fastify.redis, CACHE_KEY, CACHE_TTL, async () => {
      const [baseRows, rankRows, fleetRows, crewRows] = await Promise.all([
        fastify.db
          .select({ base: base.base, isPrime: base.isPrimeDisplayBase })
          .from(base)
          .orderBy(asc(base.displayOrder)),
        fastify.db
          .select({ rank: rank.rank })
          .from(rank)
          .where(eq(rank.isCrewRank, 1))
          .orderBy(asc(rank.displayOrder))
          .limit(1),
        fastify.db
          .select({ fleet: fleet.fleet })
          .from(fleet)
          .orderBy(asc(fleet.displayOrder))
          .limit(1),
        fastify.db
          .select({ crewId: crew.crewId })
          .from(crew)
          .orderBy(asc(crew.crewId))
          .limit(1),
      ])

      // Prefer the prime display base; fall back to the first by display order.
      const primeBase = baseRows.find((b) => b.isPrime === 1) ?? baseRows[0]

      return {
        base: primeBase?.base ?? null,
        rank: rankRows[0]?.rank ?? null,
        fleet: fleetRows[0]?.fleet ?? null,
        crewId: crewRows[0]?.crewId ?? null,
      }
    })
  },
}
