import { eq, and, desc } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crewMemo, crewSeniority } from '../../models/crew/crew-memo.js'
import { getOrSet, invalidate } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

// ===================== Memo (no cache) =====================

export const crewMemoService = {
  async list(fastify: FastifyInstance, crewId: string) {
    return fastify.db
      .select()
      .from(crewMemo)
      .where(eq(crewMemo.crewId, crewId))
      .orderBy(desc(crewMemo.tmst))
  },

  async getById(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .select()
      .from(crewMemo)
      .where(and(eq(crewMemo.id, id), eq(crewMemo.crewId, crewId)))
      .limit(1)
    return rows[0] ?? null
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewMemo.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewMemo)
      .values({ ...data, crewId, userId: username, ...auditCreate(username) })
      .returning()
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewMemo.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewMemo)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewMemo.id, id), eq(crewMemo.crewId, crewId)))
      .returning()
    return rows[0] ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number, username: string) {
    const rows = await fastify.db
      .update(crewMemo)
      .set({ status: 'N', ...auditUpdate(username) })
      .where(and(eq(crewMemo.id, id), eq(crewMemo.crewId, crewId)))
      .returning()
    return rows[0] ?? null
  },
}

// ===================== Seniority (cached) =====================

const SENIORITY_CACHE_PREFIX = 'crew:seniority'
const SENIORITY_CACHE_TTL = 14400

export const crewSeniorityService = {
  async list(fastify: FastifyInstance, crewId: string) {
    const key = `${SENIORITY_CACHE_PREFIX}:list:${crewId}`
    return getOrSet(fastify.redis, key, SENIORITY_CACHE_TTL, () =>
      fastify.db
        .select()
        .from(crewSeniority)
        .where(eq(crewSeniority.crewId, crewId))
        .orderBy(desc(crewSeniority.createdAt)),
    )
  },

  async create(
    fastify: FastifyInstance,
    crewId: string,
    data: typeof crewSeniority.$inferInsert,
    username: string,
  ) {
    const rows = await fastify.db
      .insert(crewSeniority)
      .values({ ...data, crewId, ...auditCreate(username) })
      .returning()
    await invalidate(fastify.redis, `${SENIORITY_CACHE_PREFIX}:list:${crewId}`)
    return rows[0]
  },

  async update(
    fastify: FastifyInstance,
    crewId: string,
    id: number,
    data: Partial<typeof crewSeniority.$inferInsert>,
    username: string,
  ) {
    const rows = await fastify.db
      .update(crewSeniority)
      .set({ ...data, ...auditUpdate(username) })
      .where(and(eq(crewSeniority.id, id), eq(crewSeniority.crewId, crewId)))
      .returning()
    const updated = rows[0]
    if (updated) {
      await invalidate(fastify.redis, `${SENIORITY_CACHE_PREFIX}:list:${crewId}`)
    }
    return updated ?? null
  },

  async remove(fastify: FastifyInstance, crewId: string, id: number) {
    const rows = await fastify.db
      .delete(crewSeniority)
      .where(and(eq(crewSeniority.id, id), eq(crewSeniority.crewId, crewId)))
      .returning()
    const removed = rows[0]
    if (removed) {
      await invalidate(fastify.redis, `${SENIORITY_CACHE_PREFIX}:list:${crewId}`)
    }
    return removed ?? null
  },
}
