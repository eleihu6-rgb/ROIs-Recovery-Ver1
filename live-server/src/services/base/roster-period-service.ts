import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { rosterPeriod } from '../../models/base/roster-period.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'roster_period'
const CACHE_TTL = 86400

export const rosterPeriodService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(rosterPeriod).orderBy(asc(rosterPeriod.rpStart))
    })
  },

  async listByYear(fastify: FastifyInstance, year: string) {
    return fastify.db.select().from(rosterPeriod).where(eq(rosterPeriod.year, year)).orderBy(asc(rosterPeriod.rpStart))
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(rosterPeriod).where(eq(rosterPeriod.id, id))
      return rows[0] ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof rosterPeriod.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(rosterPeriod).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof rosterPeriod.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(rosterPeriod).set({ ...data, ...auditUpdate(username) }).where(eq(rosterPeriod.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(rosterPeriod).where(eq(rosterPeriod.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
  },
}
