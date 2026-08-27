import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { airport } from '../../models/base/airport.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'airport'
const CACHE_TTL = 86400

export const airportService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(airport)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(airport).where(eq(airport.id, id))
      return rows[0] ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof airport.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(airport).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof airport.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(airport).set({ ...data, ...auditUpdate(username) }).where(eq(airport.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(airport).where(eq(airport.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
  },
}
