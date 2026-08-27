import { eq, and, or, isNull, lte, gt, desc, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewStatus } from '../../models/crew/crew-status.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_PREFIX = 'crew:status'
const CACHE_TTL = 14400

const currentEff = and(
  lte(crewStatus.effDt, sql`now()`),
  or(isNull(crewStatus.expDt), gt(crewStatus.expDt, sql`now()`)),
)

export const crewStatusService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewStatus)
        .where(eq(crewStatus.crewId, crewId))
        .orderBy(desc(crewStatus.effDt)),
    )
  },

  async getCurrent(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:current:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, async () => {
      const rows = await fastify.db
        .select()
        .from(crewStatus)
        .where(and(eq(crewStatus.crewId, crewId), currentEff))
        .orderBy(desc(crewStatus.effDt))
        .limit(1)
      return rows[0] ?? null
    })
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewStatus.$inferInsert,
    username: string,
  ) {
    const result = await fastify.db.transaction(async (tx) => {
      await tx
        .update(crewStatus)
        .set({ expDt: data.effDt, ...auditUpdate(username) })
        .where(and(eq(crewStatus.crewId, crewId), currentEff))

      const rows = await tx
        .insert(crewStatus)
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

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewStatus.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewStatus)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewStatus.id, id), eq(crewStatus.crewId, crewId)))
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

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewStatus)
      .set({ expDt: sql`now()`, ...auditUpdate(username) })
      .where(and(eq(crewStatus.id, id), eq(crewStatus.crewId, crewId)))
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
