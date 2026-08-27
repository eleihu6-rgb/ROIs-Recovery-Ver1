import { eq, and, desc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewEntitlement } from '../../models/crew/crew-entitlement.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_PREFIX = 'crew:entitlement'
const CACHE_TTL = 14400

export const crewEntitlementService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewEntitlement)
        .where(eq(crewEntitlement.crewId, crewId))
        .orderBy(desc(crewEntitlement.createdAt)),
    )
  },

  async getById(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .select()
      .from(crewEntitlement)
      .where(and(eq(crewEntitlement.id, id), eq(crewEntitlement.crewId, crewId)))
      .limit(1)
    return rows[0] ?? null
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewEntitlement.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewEntitlement)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewEntitlement.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewEntitlement)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewEntitlement.id, id), eq(crewEntitlement.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .delete(crewEntitlement)
      .where(and(eq(crewEntitlement.id, id), eq(crewEntitlement.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    }
    return removed ?? null
  },
}
