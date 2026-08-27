import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pairingTemplate, pairingTemplateDetail } from '../../models/pairing/pairing-template.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'

const CACHE_PREFIX = 'pairing-template'
const CACHE_TTL = 86400 // 24h

export const pairingTemplateService = {
  async list(fastify: FastifyInstance, query: PaginationQuery) {
    const { page, pageSize } = query
    const cacheKey = `${CACHE_PREFIX}:list:${page}:${pageSize}`

    return getOrSet(fastify.redis, cacheKey, CACHE_TTL, async () => {
      const [items, countResult] = await Promise.all([
        fastify.db
          .select()
          .from(pairingTemplate)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        fastify.db
          .select({ count: sql<number>`count(*)::int` })
          .from(pairingTemplate),
      ])

      return paginate({ page, pageSize }, items, countResult[0].count)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [templateRow] = await fastify.db
        .select()
        .from(pairingTemplate)
        .where(eq(pairingTemplate.id, id))

      if (!templateRow) return null

      const details = await fastify.db
        .select()
        .from(pairingTemplateDetail)
        .where(eq(pairingTemplateDetail.templateId, id))

      return { ...templateRow, details }
    })
  },

  async create(fastify: FastifyInstance, data: typeof pairingTemplate.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(pairingTemplate)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof pairingTemplate.$inferInsert>, username: string) {
    const [row] = await fastify.db
      .update(pairingTemplate)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(pairingTemplate.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.transaction(async (tx) => {
      await tx.delete(pairingTemplateDetail).where(eq(pairingTemplateDetail.templateId, id))
      await tx.delete(pairingTemplate).where(eq(pairingTemplate.id, id))
    })
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      invalidatePattern(fastify.redis, `${CACHE_PREFIX}:list:*`),
    ])
  },

  // --- Template Details ---

  async createDetail(fastify: FastifyInstance, data: typeof pairingTemplateDetail.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(pairingTemplateDetail)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:${data.templateId}`)
    return row
  },

  async updateDetail(fastify: FastifyInstance, id: number, data: Partial<typeof pairingTemplateDetail.$inferInsert>, username: string) {
    const [row] = await fastify.db
      .update(pairingTemplateDetail)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(pairingTemplateDetail.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:${row.templateId}`)
    }
    return row
  },

  async removeDetail(fastify: FastifyInstance, id: number) {
    const [row] = await fastify.db
      .delete(pairingTemplateDetail)
      .where(eq(pairingTemplateDetail.id, id))
      .returning()
    if (row) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:${row.templateId}`)
    }
    return row
  },
}
