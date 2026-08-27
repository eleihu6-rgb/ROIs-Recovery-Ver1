import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { aircraft } from '../../models/base/aircraft.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'aircraft'
const CACHE_TTL = 86400

export const aircraftService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(aircraft)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(aircraft).where(eq(aircraft.id, id))
      return rows[0] ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof aircraft.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(aircraft).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof aircraft.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(aircraft).set({ ...data, ...auditUpdate(username) }).where(eq(aircraft.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(aircraft).where(eq(aircraft.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
  },
}
