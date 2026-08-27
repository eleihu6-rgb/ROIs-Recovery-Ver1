import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { base } from '../../models/base/base.js'
import { airport } from '../../models/base/airport.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'base'
const CACHE_TTL = 86400

function formatUtcOffset(offset: number): string {
  const sign = offset >= 0 ? '+' : ''
  return `UTC${sign}${offset}`
}

export const baseService = {
  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(base)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(base).where(eq(base.id, id))
      return rows[0] ?? null
    })
  },

  async getTimezoneOptions(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:timezone-options`, CACHE_TTL, async () => {
      // Get base airports with timezone info
      const baseRows = await fastify.db.select().from(base)
      const baseCodes = baseRows.map((b) => b.base)

      // Get all airports (we need timezone for bases + others)
      const airports = await fastify.db.select().from(airport)

      const result = []

      // Base airports first
      for (const ap of airports) {
        if (baseCodes.includes(ap.airport)) {
          result.push({
            airport: ap.airport,
            airportName: ap.airportName ?? '',
            zoneId: ap.zoneId,
            utcOffset: formatUtcOffset(ap.utcStandardOffset),
            isBase: true,
          })
        }
      }

      // Add UTC as fallback
      result.push({
        airport: 'UTC',
        airportName: 'Coordinated Universal Time',
        zoneId: 'UTC',
        utcOffset: 'UTC+0',
        isBase: false,
      })

      return result
    })
  },

  async getAirportTimezones(fastify: FastifyInstance): Promise<Record<string, string>> {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:airport-timezones`, CACHE_TTL, async () => {
      const airports = await fastify.db.select().from(airport)
      const map: Record<string, string> = {}
      for (const ap of airports) {
        if (ap.airport && ap.zoneId) map[ap.airport] = ap.zoneId
      }
      return map
    })
  },

  async create(fastify: FastifyInstance, data: typeof base.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(base).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:timezone-options`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof base.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(base).set({ ...data, ...auditUpdate(username) }).where(eq(base.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`, `${CACHE_KEY_PREFIX}:timezone-options`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(base).where(eq(base.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`, `${CACHE_KEY_PREFIX}:timezone-options`)
  },
}
