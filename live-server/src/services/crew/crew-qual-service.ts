import { eq, and, desc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewQualification } from '../../models/crew/crew-qualification.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_PREFIX = 'crew:qual'
const CACHE_TTL = 14400

export const crewQualificationService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `${CACHE_PREFIX}:list:${crewId}`
    return getOrSet(fastify.redis, key, CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewQualification)
        .where(eq(crewQualification.crewId, crewId))
        .orderBy(desc(crewQualification.effDt)),
    )
  },

  async getById(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .select()
      .from(crewQualification)
      .where(and(eq(crewQualification.id, id), eq(crewQualification.crewId, crewId)))
      .limit(1)
    return rows[0] ?? null
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewQualification.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewQualification)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewQualification.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewQualification)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewQualification.id, id), eq(crewQualification.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewQualification)
      .set({ isValid: 0, ...auditUpdate(username) })
      .where(and(eq(crewQualification.id, id), eq(crewQualification.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `${CACHE_PREFIX}:list:${crewId}`)
    }
    return removed ?? null
  },
}
