import { eq, and, or, isNull, lte, gt, desc, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewRank } from '../../models/crew/crew-rank.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_PREFIX = 'crew:rank'
const CACHE_TTL = 14400

const currentEff = and(
  lte(crewRank.effDt, sql`now()`),
  or(isNull(crewRank.expDt), gt(crewRank.expDt, sql`now()`)),
)

export const crewRankService = {
  /** All rank history for a crew */
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewRank)
        .where(eq(crewRank.crewId, crewId))
        .orderBy(desc(crewRank.effDt)),
    )
  },

  /** Current effective rank */
  async getCurrent(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:current:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, async () => {
      const rows = await fastify.db
        .select()
        .from(crewRank)
        .where(and(eq(crewRank.crewId, crewId), currentEff))
        .orderBy(desc(crewRank.effDt))
        .limit(1)
      return rows[0] ?? null
    })
  },

  /** Create rank record — auto-close previous in a transaction */
  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewRank.$inferInsert,
    username: string,
  ) {
    const result = await fastify.db.transaction(async (tx) => {
      // Close previous current record
      await tx
        .update(crewRank)
        .set({ expDt: data.effDt, ...auditUpdate(username) })
        .where(and(eq(crewRank.crewId, crewId), currentEff))

      // Insert new
      const rows = await tx
        .insert(crewRank)
        .values({ ...data, crewId, ...auditCreate(username) })
        .returning()
      return rows[0]
    })

    await invalidate(
      fastify.redis,
      `${CACHE_PREFIX}:list:${crewId}`,
      `${CACHE_PREFIX}:current:${crewId}`,
    )
    await invalidatePattern(fastify.redis, `crew:detail:*`)
    return result
  },

  /** Update a specific rank record */
  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewRank.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewRank)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewRank.id, id), eq(crewRank.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(
        fastify.redis,
        `${CACHE_PREFIX}:list:${crewId}`,
        `${CACHE_PREFIX}:current:${crewId}`,
      )
      await invalidatePattern(fastify.redis, `crew:detail:*`)
    }
    return updated ?? null
  },

  /** Soft delete — set expDt to now */
  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewRank)
      .set({ expDt: sql`now()`, ...auditUpdate(username) })
      .where(and(eq(crewRank.id, id), eq(crewRank.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(
        fastify.redis,
        `${CACHE_PREFIX}:list:${crewId}`,
        `${CACHE_PREFIX}:current:${crewId}`,
      )
      await invalidatePattern(fastify.redis, `crew:detail:*`)
    }
    return removed ?? null
  },
}
