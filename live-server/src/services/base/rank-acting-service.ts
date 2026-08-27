import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { rankActing } from '../../models/base/rank.js'
import { getOrSet } from '../../utils/cache.js'

const CACHE_KEY_PREFIX = 'rank-acting'
const CACHE_TTL = 86400   // 24h — base data (low mutation, high read)

export interface RankActingRow {
  activeRank: string
  actingRank: string
  qual: string | null
}

export const rankActingService = {
  /** Fetch all rank_acting mappings for the given filiale. Cached per-filiale. */
  async listForFiliale(fastify: FastifyInstance, filiale: string): Promise<RankActingRow[]> {
    return getOrSet(
      fastify.redis,
      `${CACHE_KEY_PREFIX}:filiale:${filiale}`,
      CACHE_TTL,
      async () => {
        return fastify.db
          .select({
            activeRank: rankActing.activeRank,
            actingRank: rankActing.actingRank,
            qual: rankActing.qual,
          })
          .from(rankActing)
          .where(eq(rankActing.filiale, filiale))
      },
    )
  },
}