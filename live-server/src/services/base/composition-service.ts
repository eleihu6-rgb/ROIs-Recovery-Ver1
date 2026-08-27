import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { composition, compositionLoad, compositionRank } from '../../models/base/composition.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'composition'
const CACHE_TTL = 86400

export const compositionService = {
  // ── Composition ──

  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(composition)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(composition).where(eq(composition.id, id))
      return rows[0] ?? null
    })
  },

  /** Get composition with its loads and ranks. */
  async getDetailById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:detail:${id}`, CACHE_TTL, async () => {
      const compRows = await fastify.db.select().from(composition).where(eq(composition.id, id))
      const comp = compRows[0] ?? null
      if (!comp) return null
      const loads = await fastify.db.select().from(compositionLoad).where(eq(compositionLoad.compId, id))
      const ranks = await fastify.db.select().from(compositionRank).where(eq(compositionRank.compId, id))
      return { ...comp, loads, ranks }
    })
  },

  async create(fastify: FastifyInstance, data: typeof composition.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(composition).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof composition.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(composition).set({ ...data, ...auditUpdate(username) }).where(eq(composition.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`, `${CACHE_KEY_PREFIX}:detail:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    // Delete child records first
    await fastify.db.delete(compositionRank).where(eq(compositionRank.compId, id))
    await fastify.db.delete(compositionLoad).where(eq(compositionLoad.compId, id))
    await fastify.db.delete(composition).where(eq(composition.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:*`)
  },

  // ── Composition Load ──

  async listLoads(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:load:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(compositionLoad)
    })
  },

  async getLoadsByCompId(fastify: FastifyInstance, compId: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:load:comp:${compId}`, CACHE_TTL, async () => {
      return fastify.db.select().from(compositionLoad).where(eq(compositionLoad.compId, compId))
    })
  },

  async createLoad(fastify: FastifyInstance, data: typeof compositionLoad.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(compositionLoad).values({ ...data, ...auditCreate(username) }).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:load:*`)
    if (data.compId) await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:detail:${data.compId}`)
    return row
  },

  async updateLoad(fastify: FastifyInstance, id: number, data: Partial<typeof compositionLoad.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(compositionLoad).set({ ...data, ...auditUpdate(username) }).where(eq(compositionLoad.id, id)).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:load:*`)
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:detail:*`)
    return row
  },

  async removeLoad(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(compositionLoad).where(eq(compositionLoad.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:load:*`)
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:detail:*`)
  },

  // ── Composition Rank ──

  async listRanks(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:rank:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(compositionRank)
    })
  },

  async getRanksByCompId(fastify: FastifyInstance, compId: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:rank:comp:${compId}`, CACHE_TTL, async () => {
      return fastify.db.select().from(compositionRank).where(eq(compositionRank.compId, compId))
    })
  },

  async createRank(fastify: FastifyInstance, data: typeof compositionRank.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(compositionRank).values({ ...data, ...auditCreate(username) }).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:rank:*`)
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:detail:${data.compId}`)
    return row
  },

  async updateRank(fastify: FastifyInstance, id: number, data: Partial<typeof compositionRank.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(compositionRank).set({ ...data, ...auditUpdate(username) }).where(eq(compositionRank.id, id)).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:rank:*`)
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:detail:*`)
    return row
  },

  async removeRank(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(compositionRank).where(eq(compositionRank.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:rank:*`)
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:detail:*`)
  },
}
