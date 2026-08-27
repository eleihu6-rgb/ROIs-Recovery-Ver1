import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { assignment, assignmentGroup, assignmentGroupMap } from '../../models/base/assignment.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'

const CACHE_KEY_PREFIX = 'assignment'
const CACHE_TTL = 86400

export const assignmentService = {
  // ── Assignment ──

  async list(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(assignment)
    })
  },

  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(assignment).where(eq(assignment.id, id))
      return rows[0] ?? null
    })
  },

  async create(fastify: FastifyInstance, data: typeof assignment.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(assignment).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`)
    return row
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof assignment.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(assignment).set({ ...data, ...auditUpdate(username) }).where(eq(assignment.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(assignment).where(eq(assignment.id, id))
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:list`, `${CACHE_KEY_PREFIX}:${id}`)
  },

  // ── Assignment Group ──

  async listGroups(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:group:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(assignmentGroup)
    })
  },

  async getGroupById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:group:${id}`, CACHE_TTL, async () => {
      const rows = await fastify.db.select().from(assignmentGroup).where(eq(assignmentGroup.id, id))
      return rows[0] ?? null
    })
  },

  async createGroup(fastify: FastifyInstance, data: typeof assignmentGroup.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(assignmentGroup).values({ ...data, ...auditCreate(username) }).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:group:list`)
    return row
  },

  async updateGroup(fastify: FastifyInstance, id: number, data: Partial<typeof assignmentGroup.$inferInsert>, username: string) {
    const [row] = await fastify.db.update(assignmentGroup).set({ ...data, ...auditUpdate(username) }).where(eq(assignmentGroup.id, id)).returning()
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:group:list`, `${CACHE_KEY_PREFIX}:group:${id}`)
    return row
  },

  async removeGroup(fastify: FastifyInstance, id: number) {
    // Delete mappings first, then the group
    await fastify.db.delete(assignmentGroupMap).where(eq(assignmentGroupMap.assignmentGroupId, id))
    await fastify.db.delete(assignmentGroup).where(eq(assignmentGroup.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:group:*`)
    await invalidate(fastify.redis, `${CACHE_KEY_PREFIX}:map:list`)
  },

  // ── Assignment Group Map ──

  async listGroupMaps(fastify: FastifyInstance) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:map:list`, CACHE_TTL, async () => {
      return fastify.db.select().from(assignmentGroupMap)
    })
  },

  async getGroupMapsByGroupId(fastify: FastifyInstance, groupId: number) {
    return getOrSet(fastify.redis, `${CACHE_KEY_PREFIX}:map:group:${groupId}`, CACHE_TTL, async () => {
      return fastify.db.select().from(assignmentGroupMap).where(eq(assignmentGroupMap.assignmentGroupId, groupId))
    })
  },

  async createGroupMap(fastify: FastifyInstance, data: typeof assignmentGroupMap.$inferInsert, username: string) {
    const [row] = await fastify.db.insert(assignmentGroupMap).values({ ...data, ...auditCreate(username) }).returning()
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:map:*`)
    return row
  },

  async removeGroupMap(fastify: FastifyInstance, id: number) {
    await fastify.db.delete(assignmentGroupMap).where(eq(assignmentGroupMap.id, id))
    await invalidatePattern(fastify.redis, `${CACHE_KEY_PREFIX}:map:*`)
  },
}
